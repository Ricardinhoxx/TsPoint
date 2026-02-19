import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

type PontoTipo = "ENTRADA" | "SAIDA";

function inferNextTipo(lastTipo: PontoTipo | null): PontoTipo {
  if (!lastTipo) return "ENTRADA";
  return lastTipo === "ENTRADA" ? "SAIDA" : "ENTRADA";
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        funcionario_id?: number;
        tipo?: PontoTipo;
        score?: number;
        device_info?: unknown;
      }
    | null;

  const funcionarioId = Number(body?.funcionario_id);
  if (!Number.isFinite(funcionarioId) || funcionarioId <= 0) {
    return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
  }

  const isAdmin = isAdminSession(auth.session);
  const sql = getSql();

  return sql
    .begin(async (tx: any) => {
      // Serialize writes per funcionario to avoid race conditions in toggle logic.
      await (tx`SELECT pg_advisory_xact_lock(${funcionarioId})` as unknown as Promise<
        unknown
      >);

      const funcionarios = isAdmin
        ? await (tx`
            SELECT id, unidade_id FROM funcionario WHERE id = ${funcionarioId} LIMIT 1
          ` as unknown as Promise<{ id: number; unidade_id: number }[]>)
        : await (tx`
            SELECT id, unidade_id FROM funcionario WHERE id = ${funcionarioId} AND unidade_id = ${auth.session.supervisor.unidade_id} LIMIT 1
          ` as unknown as Promise<{ id: number; unidade_id: number }[]>);

      const funcionario = funcionarios[0];
      if (!funcionario) {
        return NextResponse.json(
          { error: "FUNCIONARIO_FORBIDDEN" },
          { status: 403 }
        );
      }

      const unidadeId = funcionario.unidade_id;

      const last = await (tx`
        SELECT tipo::text as tipo FROM ponto
        WHERE funcionario_id = ${funcionarioId}
        ORDER BY timestamp DESC
        LIMIT 1
      ` as unknown as Promise<{ tipo: PontoTipo }[]>);
      const lastTipo = last[0]?.tipo ?? null;

      const requestedTipo = body?.tipo;
      const tipo = requestedTipo ?? inferNextTipo(lastTipo);
      if (lastTipo && lastTipo === tipo) {
        return NextResponse.json({ error: "DUPLICATE_TIPO" }, { status: 409 });
      }

      const inserted = await (tx`
        INSERT INTO ponto (funcionario_id, unidade_id, tipo, score, device_info, operador_id)
        VALUES (
          ${funcionarioId},
          ${unidadeId},
          ${tipo}::ponto_tipo,
          ${body?.score ?? null},
          ${body?.device_info ? (body.device_info as any) : null},
          ${auth.session.supervisor.id}
        )
        RETURNING id, funcionario_id, unidade_id, tipo::text as tipo, timestamp, score
      ` as unknown as Promise<
        {
          id: number;
          funcionario_id: number;
          unidade_id: number;
          tipo: PontoTipo;
          timestamp: string;
          score: number | null;
        }[]
      >);

      return NextResponse.json({ ponto: inserted[0] });
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : "UNKNOWN";
      console.error("[api/ponto][POST] PONTO_WRITE_FAILED", msg);
      return NextResponse.json({ error: "PONTO_WRITE_FAILED" }, { status: 500 });
    });
}
