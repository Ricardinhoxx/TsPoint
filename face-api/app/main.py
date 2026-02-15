from __future__ import annotations

import base64
import hashlib
import os
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from dataclasses import dataclass
from typing import Any

import numpy as np
import psycopg
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from pgvector.psycopg import register_vector

app = FastAPI(title="Digitaliza Face API", version="0.1.0")


def required_env(name: str) -> str:
  value = os.getenv(name)
  if not value:
    raise RuntimeError(f"Missing env: {name}")
  return value


def get_threshold() -> float:
  try:
    return float(os.getenv("FACE_THRESHOLD", "0.42"))
  except ValueError:
    return 0.42


def check_internal_secret(x_internal_secret: str | None) -> None:
  expected = required_env("INTERNAL_SECRET")
  if not x_internal_secret or x_internal_secret != expected:
    raise HTTPException(status_code=401, detail="UNAUTHORIZED")


def decode_b64_image(image_b64: str) -> bytes:
  try:
    return base64.b64decode(image_b64, validate=True)
  except Exception as exc:
    raise HTTPException(status_code=400, detail="INVALID_IMAGE_B64") from exc


def fake_embedding(image_bytes: bytes) -> np.ndarray:
  digest = hashlib.sha256(image_bytes).digest()
  seed = int.from_bytes(digest[:8], "little", signed=False)
  rng = np.random.default_rng(seed)
  vec = rng.standard_normal(512).astype(np.float32)
  vec /= np.linalg.norm(vec) + 1e-9
  return vec


def _is_fake_mode() -> bool:
  return os.getenv("FACE_FAKE_MODE", "0") == "1"


def _load_face_engine():
  # Lazy import so devs can still run in FAKE mode without heavy deps.
  from insightface.app import FaceAnalysis  # type: ignore

  model = os.getenv("FACE_MODEL", "buffalo_l")
  det = os.getenv("FACE_DET_SIZE", "640").strip()
  try:
    det_size = int(det)
  except ValueError:
    det_size = 640
  det_size = max(320, min(1280, det_size))

  engine = FaceAnalysis(name=model, providers=["CPUExecutionProvider"])
  engine.prepare(ctx_id=-1, det_size=(det_size, det_size))
  return engine


@app.on_event("startup")
def startup():
  if _is_fake_mode():
    app.state.face_engine = None
    return
  app.state.face_engine = _load_face_engine()


def image_to_embedding(image_bytes: bytes) -> np.ndarray:
  if _is_fake_mode():
    return fake_embedding(image_bytes)

  engine = getattr(app.state, "face_engine", None)
  if engine is None:
    raise HTTPException(status_code=500, detail="FACE_ENGINE_NOT_READY")

  try:
    import cv2  # type: ignore
  except Exception as exc:
    raise HTTPException(status_code=500, detail="OPENCV_NOT_AVAILABLE") from exc

  arr = np.frombuffer(image_bytes, dtype=np.uint8)
  img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
  if img is None:
    raise HTTPException(status_code=400, detail="INVALID_IMAGE_BYTES")

  faces = engine.get(img)  # list[Face]
  if not faces:
    raise HTTPException(status_code=400, detail="NO_FACE_DETECTED")

  def area(face: Any) -> float:
    bb = getattr(face, "bbox", None)
    if bb is None or len(bb) != 4:
      return 0.0
    x1, y1, x2, y2 = float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)

  best = max(faces, key=area)
  emb = getattr(best, "embedding", None)
  if emb is None:
    raise HTTPException(status_code=500, detail="EMBEDDING_FAILED")

  vec = np.asarray(emb, dtype=np.float32).reshape(-1)
  if vec.shape[0] != 512:
    raise HTTPException(status_code=500, detail="INVALID_EMBEDDING_DIM")
  vec /= np.linalg.norm(vec) + 1e-9
  return vec


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
  denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-9
  return float(np.dot(a, b) / denom)


@dataclass(frozen=True)
class Db:
  url: str

  def connect(self) -> psycopg.Connection[Any]:
    parsed = urlparse(self.url)
    host = parsed.hostname or ""
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if ("supabase.co" in host or "supabase.com" in host) and "sslmode" not in query:
      query["sslmode"] = "require"
      parsed = parsed._replace(query=urlencode(query))
      url = urlunparse(parsed)
    else:
      url = self.url

    conn = psycopg.connect(url, autocommit=True)
    try:
      register_vector(conn)
    except Exception as exc:
      conn.close()
      raise RuntimeError(
        "pgvector não está disponível nesse banco. Aplique a migração (CREATE EXTENSION vector) "
        "e garanta que o tipo 'vector' exista antes de usar o Face API."
      ) from exc
    return conn


db = Db(url=required_env("DATABASE_URL"))


class RecognizeIn(BaseModel):
  unidade_id: int = Field(gt=0)
  image_b64: str = Field(min_length=100)


class RecognizeOut(BaseModel):
  matched: bool
  funcionario_id: int | None = None
  nome: str | None = None
  score: float | None = None


class EnrollIn(BaseModel):
  funcionario_id: int = Field(gt=0)
  images_b64: list[str] = Field(min_length=1)


class EnrollOut(BaseModel):
  ok: bool
  inserted: int


@app.get("/health")
def health():
  return {"ok": True}


@app.post("/recognize", response_model=RecognizeOut)
def recognize(payload: RecognizeIn, x_internal_secret: str | None = Header(default=None)):
  check_internal_secret(x_internal_secret)

  image_bytes = decode_b64_image(payload.image_b64)
  query = image_to_embedding(image_bytes)
  threshold = get_threshold()

  with db.connect() as conn:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT
          f.id,
          f.nome,
          (1 - (e.embedding_vector <=> %s))::float4 AS score
        FROM funcionario f
        JOIN face_embedding e ON e.funcionario_id = f.id
        WHERE f.unidade_id = %s AND f.status = 'ATIVO'
        ORDER BY e.embedding_vector <=> %s
        LIMIT 1
        """,
        (query, payload.unidade_id, query),
      )
      row = cur.fetchone()

  if not row:
    return RecognizeOut(matched=False)

  funcionario_id, nome, score = row
  best = (int(funcionario_id), str(nome), float(score))

  if best is None or best[2] < threshold:
    return RecognizeOut(matched=False, score=best[2] if best else None)

  return RecognizeOut(matched=True, funcionario_id=best[0], nome=best[1], score=best[2])


@app.post("/enroll", response_model=EnrollOut)
def enroll(payload: EnrollIn, x_internal_secret: str | None = Header(default=None)):
  check_internal_secret(x_internal_secret)

  embeddings: list[np.ndarray] = []
  for img_b64 in payload.images_b64:
    image_bytes = decode_b64_image(img_b64)
    embeddings.append(image_to_embedding(image_bytes))

  with db.connect() as conn:
    with conn.cursor() as cur:
      cur.execute("SELECT 1 FROM funcionario WHERE id = %s LIMIT 1", (payload.funcionario_id,))
      if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail="FUNCIONARIO_NOT_FOUND")

      inserted = 0
      for emb in embeddings:
        cur.execute(
          "INSERT INTO face_embedding (funcionario_id, embedding_vector) VALUES (%s, %s)",
          (payload.funcionario_id, emb),
        )
        inserted += 1

  return EnrollOut(ok=True, inserted=inserted)
