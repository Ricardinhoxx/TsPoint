import { NextResponse } from "next/server";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

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
  const imageB64 = body?.image_b64 ?? "";
  if (!imageB64 || imageB64.length < 100) {
    return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 400 });
  }

  const isAdmin = isAdminSession(auth.session);
  const unidadeId = isAdmin
    ? (parsePositiveInt(body?.unidade_id) ?? auth.session.supervisor.unidade_id)
    : auth.session.supervisor.unidade_id;

  if (!unidadeId) {
    return NextResponse.json({ error: "INVALID_UNIDADE" }, { status: 400 });
  }

  const faceApiUrl = requiredEnv("FACE_API_URL").replace(/\/$/, "");
  const secret = requiredEnv("FACE_API_SECRET");

  const res = await fetch(`${faceApiUrl}/recognize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": secret
    },
    body: JSON.stringify({
      unidade_id: unidadeId,
      image_b64: imageB64
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.detail ?? data?.error ?? `FACE_API_${res.status}` },
      { status: 502 }
    );
  }
  return NextResponse.json(data);
}
