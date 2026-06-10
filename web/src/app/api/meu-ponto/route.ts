import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashFuncionarioPontoToken } from "@/lib/funcionarioPontoAccess";
import { buildFuncionarioPontoReport, currentMonthOnly, parseMonthOnly } from "@/lib/pontoReport";

export const runtime = "nodejs";

function parseToken(raw: string | null): string | null {
  const token = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_-]{24,}$/.test(token)) return null;
  return token;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = parseToken(searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });

  const month = parseMonthOnly(searchParams.get("month")) ?? currentMonthOnly();
  const tokenHash = hashFuncionarioPontoToken(token);
  const sql = getSql();

  const accessRows = await (sql<{ id: number; funcionario_id: number }[]>`
    UPDATE funcionario_ponto_access
    SET last_used_at = now()
    WHERE token_hash = ${tokenHash}
      AND ativo = TRUE
      AND (expires_at IS NULL OR expires_at > now())
    RETURNING id, funcionario_id
  ` as unknown as Promise<{ id: number; funcionario_id: number }[]>);

  const access = accessRows[0];
  if (!access) return NextResponse.json({ error: "ACCESS_NOT_FOUND" }, { status: 404 });

  const report = await buildFuncionarioPontoReport(access.funcionario_id, month);
  if (!report) return NextResponse.json({ error: "FUNCIONARIO_NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ok: true, access_id: access.id, report });
}
