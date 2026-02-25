import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const sql = getSql();
    const rows = (await (sql`SELECT 1 as ok` as unknown as Promise<{ ok: number }[]>)) as {
      ok: number;
    }[];
    return NextResponse.json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;

    console.error("[api/health/db] DB_CONNECTION_FAILED", { code, message });

    return NextResponse.json(
      {
        ok: false,
        error: "DB_CONNECTION_FAILED",
        ...(process.env.NODE_ENV === "production" ? {} : { code })
      },
      { status: 500 }
    );
  }
}