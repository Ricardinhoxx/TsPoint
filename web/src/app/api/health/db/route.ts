import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sql = getSql();
    const rows = (await (sql`SELECT 1 as ok` as unknown as Promise<
      { ok: number }[]
    >)) as { ok: number }[];
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
