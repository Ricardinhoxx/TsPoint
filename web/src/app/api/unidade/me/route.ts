import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const sql = getSql();
  const isAdmin = isAdminSession(auth.session);

  if (isAdmin) {
    const { searchParams } = new URL(req.url);
    const unidadeId = parsePositiveInt(searchParams.get("unidade_id"));

    if (unidadeId) {
      const rows = await (sql<{ id: number; nome: string }[]>`
        SELECT id, nome FROM unidade WHERE id = ${unidadeId} LIMIT 1
      ` as unknown as Promise<{ id: number; nome: string }[]>);
      const unidade = rows[0];
      if (!unidade) {
        return NextResponse.json({ error: "UNIDADE_NOT_FOUND" }, { status: 404 });
      }
      return NextResponse.json({ unidade, role: "ADMIN" });
    }

    const unidades = await (sql<{ id: number; nome: string }[]>`
      SELECT id, nome FROM unidade ORDER BY nome ASC
    ` as unknown as Promise<{ id: number; nome: string }[]>);
    return NextResponse.json({ unidade: unidades[0] ?? null, unidades, role: "ADMIN" });
  }

  const rows = await (sql<{ id: number; nome: string }[]>`
    SELECT id, nome FROM unidade WHERE id = ${auth.session.supervisor.unidade_id} LIMIT 1
  ` as unknown as Promise<{ id: number; nome: string }[]>);
  const unidade = rows[0];
  if (!unidade) {
    return NextResponse.json({ error: "UNIDADE_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ unidade, role: "SUPERVISOR" });
}
