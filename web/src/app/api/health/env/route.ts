import { NextResponse } from "next/server";
import { requireSupervisor } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const auth = await requireSupervisor();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
      FACE_API_URL: Boolean(process.env.FACE_API_URL),
      FACE_API_SECRET: Boolean(process.env.FACE_API_SECRET),
      NODE_ENV: process.env.NODE_ENV ?? null
    }
  });
}
