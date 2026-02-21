import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";
export const preferredRegion = "gru1";
export const maxDuration = 60;
const MIN_IMAGE_B64_LEN = 100;
const MAX_IMAGE_B64_LEN = 8_000_000;
const MIN_ENROLL_IMAGES = 3;
const MAX_ENROLL_IMAGES = 8;
const MAX_ENROLL_IMAGES_TO_PROCESS = 5;

type AppSession = {
  supervisor: {
    unidade_id: number;
    role: string;
  };
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function optimizeEnrollImages(images: string[], maxToSend = MAX_ENROLL_IMAGES_TO_PROCESS) {
  const unique = Array.from(new Set(images.filter((img) => typeof img === "string" && img.length > 0)));
  if (unique.length <= maxToSend) return unique;

  const selected: string[] = [];
  const lastIndex = unique.length - 1;
  for (let i = 0; i < maxToSend; i += 1) {
    const idx = Math.round((i * lastIndex) / (maxToSend - 1));
    const candidate = unique[idx];
    if (candidate && !selected.includes(candidate)) selected.push(candidate);
  }

  if (selected.length < maxToSend) {
    for (const img of unique) {
      if (!selected.includes(img)) selected.push(img);
      if (selected.length >= maxToSend) break;
    }
  }

  return selected;
}

async function canAccessFuncionario(funcionarioId: number, session: AppSession): Promise<boolean> {
  const sql = getSql();
  const isAdmin = String(session.supervisor.role ?? "").toUpperCase() === "ADMIN";
  const rows = isAdmin
    ? await (sql<{ id: number }[]>`
        SELECT id FROM funcionario WHERE id = ${funcionarioId} LIMIT 1
      ` as unknown as Promise<{ id: number }[]>)
    : await (sql<{ id: number }[]>`
        SELECT id FROM funcionario WHERE id = ${funcionarioId} AND unidade_id = ${session.supervisor.unidade_id} LIMIT 1
      ` as unknown as Promise<{ id: number }[]>);

  return Boolean(rows[0]);
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const funcionarioId = parsePositiveInt(searchParams.get("funcionario_id"));
  if (!funcionarioId) {
    return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
  }

  if (!(await canAccessFuncionario(funcionarioId, auth.session as AppSession))) {
    return NextResponse.json({ error: "FUNCIONARIO_FORBIDDEN" }, { status: 403 });
  }

  const sql = getSql();
  const rows = await (sql<{ inserted: number }[]>`
    SELECT COUNT(*)::int AS inserted
    FROM face_embedding
    WHERE funcionario_id = ${funcionarioId}
  ` as unknown as Promise<{ inserted: number }[]>);

  const inserted = rows[0]?.inserted ?? 0;
  return NextResponse.json({
    funcionario_id: funcionarioId,
    inserted,
    ready: inserted >= MIN_ENROLL_IMAGES
  });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { funcionario_id?: number; images_b64?: string[] }
    | null;

  const funcionarioId = Number(body?.funcionario_id);
  const images = body?.images_b64 ?? [];
  if (!Number.isFinite(funcionarioId) || funcionarioId <= 0) {
    return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
  }
  if (!Array.isArray(images) || images.length < 1) {
    return NextResponse.json({ error: "INVALID_IMAGES" }, { status: 400 });
  }
  if (images.length < MIN_ENROLL_IMAGES) {
    return NextResponse.json({ error: "TOO_FEW_IMAGES" }, { status: 400 });
  }
  if (images.length > MAX_ENROLL_IMAGES) {
    return NextResponse.json({ error: "TOO_MANY_IMAGES" }, { status: 413 });
  }
  if (
    images.some(
      (image) =>
        typeof image !== "string" ||
        image.length < MIN_IMAGE_B64_LEN ||
        image.length > MAX_IMAGE_B64_LEN
    )
  ) {
    return NextResponse.json({ error: "INVALID_IMAGE_PAYLOAD" }, { status: 400 });
  }

  if (!(await canAccessFuncionario(funcionarioId, auth.session as AppSession))) {
    return NextResponse.json({ error: "FUNCIONARIO_FORBIDDEN" }, { status: 403 });
  }

  const optimizedImages = optimizeEnrollImages(images);
  if (optimizedImages.length < MIN_ENROLL_IMAGES) {
    return NextResponse.json({ error: "TOO_FEW_IMAGES" }, { status: 400 });
  }

  const faceApiUrl = requiredEnv("FACE_API_URL").replace(/\/$/, "");
  const secret = requiredEnv("FACE_API_SECRET");

  let res: Response;
  try {
    res = await fetch(`${faceApiUrl}/enroll`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret
      },
      body: JSON.stringify({ funcionario_id: funcionarioId, images_b64: optimizedImages }),
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
    return NextResponse.json(
      { error: data?.detail ?? data?.error ?? `FACE_API_${res.status}` },
      { status: 502 }
    );
  }
  return NextResponse.json({
    ...data,
    processed_images: optimizedImages.length,
    received_images: images.length
  });
}
