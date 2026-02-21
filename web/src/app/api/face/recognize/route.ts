import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";
export const preferredRegion = "gru1";
export const maxDuration = 60;
const MIN_IMAGE_B64_LEN = 100;
const MAX_IMAGE_B64_LEN = 8_000_000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { image_b64?: string; unidade_id?: number }
    | null;
  const imageB64 = String(body?.image_b64 ?? "");
  if (!imageB64 || imageB64.length < MIN_IMAGE_B64_LEN) {
    return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 400 });
  }
  if (imageB64.length > MAX_IMAGE_B64_LEN) {
    return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });
  }

  const isAdmin = isAdminSession(auth.session);
  const unidadeId = isAdmin ? null : auth.session.supervisor.unidade_id;

  const faceApiUrl = requiredEnv("FACE_API_URL").replace(/\/$/, "");
  const secret = requiredEnv("FACE_API_SECRET");

  let res: Response;
  try {
    res = await fetch(`${faceApiUrl}/recognize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret
      },
      body: JSON.stringify({
        unidade_id: unidadeId,
        image_b64: imageB64
      }),
      signal: AbortSignal.timeout(55000)
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json(
      { error: isTimeout ? "FACE_API_TIMEOUT" : "FACE_API_UNREACHABLE" },
      { status: isTimeout ? 504 : 502 }
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const upstream = String(data?.detail ?? data?.error ?? `FACE_API_${res.status}`);
    const normalized =
      upstream.includes("FACE_ENGINE_LOAD_FAILED")
        ? "FACE_ENGINE_LOAD_FAILED"
        : upstream;
    return NextResponse.json(
      { error: normalized },
      { status: 502 }
    );
  }

  if (data?.matched && Number.isFinite(Number(data?.funcionario_id))) {
    try {
      const sql = getSql();
      const funcionarioId = Number(data.funcionario_id);
      const rows = await (sql<
        {
          unidade_id: number;
          unidade_nome: string;
        }[]
      >`
        SELECT f.unidade_id, u.nome AS unidade_nome
        FROM funcionario f
        JOIN unidade u ON u.id = f.unidade_id
        WHERE f.id = ${funcionarioId}
        LIMIT 1
      ` as unknown as Promise<
        {
          unidade_id: number;
          unidade_nome: string;
        }[]
      >);

      const unidade = rows[0];
      return NextResponse.json({
        ...data,
        unidade_id: unidade?.unidade_id ?? null,
        unidade_nome: unidade?.unidade_nome ?? null
      });
    } catch {
      return NextResponse.json(data);
    }
  }

  return NextResponse.json(data);
}
