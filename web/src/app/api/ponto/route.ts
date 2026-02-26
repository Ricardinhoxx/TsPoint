import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, requireAuth } from "@/lib/rbac";
import { getActiveTabletSession } from "@/lib/tabletSessionGuard";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

type PontoTipo = "ENTRADA" | "SAIDA";

function parseDateOnly(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inferNextTipo(lastTipo: PontoTipo | null): PontoTipo {
  if (!lastTipo) return "ENTRADA";
  return lastTipo === "ENTRADA" ? "SAIDA" : "ENTRADA";
}

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  const tabletSession = await getActiveTabletSession();
  const useTabletContext = Boolean(tabletSession?.tablet);
  if (!auth.ok && !useTabletContext) {
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

  const isAdmin = !useTabletContext && auth.ok && isAdminSession(auth.session);
  const sql = getSql();

  return sql
    .begin(async (tx: any) => {
      // Serialize writes per funcionario to avoid race conditions in toggle logic.
      await (tx`SELECT pg_advisory_xact_lock(${funcionarioId})` as unknown as Promise<unknown>);

      const funcionarios = useTabletContext
        ? await (tx`
            SELECT id, unidade_id
            FROM funcionario
            WHERE id = ${funcionarioId}
              AND unidade_id = ${tabletSession?.tablet.unidade_id ?? 0}
            LIMIT 1
          ` as unknown as Promise<{ id: number; unidade_id: number }[]>)
        : isAdmin
          ? await (tx`
              SELECT id, unidade_id FROM funcionario WHERE id = ${funcionarioId} LIMIT 1
            ` as unknown as Promise<{ id: number; unidade_id: number }[]>)
          : await (tx`
              SELECT id, unidade_id
              FROM funcionario
              WHERE id = ${funcionarioId} AND unidade_id = ${auth.ok ? auth.session.supervisor.unidade_id : 0}
              LIMIT 1
            ` as unknown as Promise<{ id: number; unidade_id: number }[]>);

      const funcionario = funcionarios[0];
      if (!funcionario) {
        return NextResponse.json({ error: "FUNCIONARIO_FORBIDDEN" }, { status: 403 });
      }

      const unidadeId = funcionario.unidade_id;
      let operadorId = auth.ok ? auth.session.supervisor.id : null;
      if (useTabletContext) {
        const operadores = await (tx<{ id: number }[]>`
          SELECT id
          FROM supervisor
          WHERE unidade_id = ${unidadeId}
          ORDER BY CASE WHEN UPPER(role) = 'ADMIN' THEN 0 ELSE 1 END, id ASC
          LIMIT 1
        ` as unknown as Promise<{ id: number }[]>);
        operadorId = operadores[0]?.id ?? null;
      }

      if (!operadorId) {
        return NextResponse.json({ error: "TABLET_OPERATOR_NOT_FOUND" }, { status: 500 });
      }

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
          ${operadorId}
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

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const funcionarioId = Number(searchParams.get("funcionario_id"));
  if (!Number.isFinite(funcionarioId) || funcionarioId <= 0) {
    return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
  }

  const day = parseDateOnly(searchParams.get("day"));
  if (!day) {
    return NextResponse.json({ error: "INVALID_DAY" }, { status: 400 });
  }

  const nextDay = addDays(day, 1);
  const isAdmin = isAdminSession(auth.session);
  const sql = getSql();

  try {
    const scopeRows = isAdmin
      ? await (sql<{ id: number }[]>`
          SELECT id FROM funcionario WHERE id = ${funcionarioId} LIMIT 1
        ` as unknown as Promise<{ id: number }[]>)
      : await (sql<{ id: number }[]>`
          SELECT id
          FROM funcionario
          WHERE id = ${funcionarioId}
            AND unidade_id = ${auth.session.supervisor.unidade_id}
          LIMIT 1
        ` as unknown as Promise<{ id: number }[]>);

    if (!scopeRows[0]) {
      return NextResponse.json({ error: "FUNCIONARIO_FORBIDDEN" }, { status: 403 });
    }

    const pontos = await (sql<{
      id: number;
      funcionario_id: number;
      tipo: PontoTipo;
      timestamp: string;
      score: number | null;
      unidade_id: number;
    }[]>`
      SELECT
        p.id,
        p.funcionario_id,
        p.tipo::text as tipo,
        p.timestamp::timestamptz::text as timestamp,
        p.score,
        p.unidade_id
      FROM ponto p
      WHERE p.funcionario_id = ${funcionarioId}
        AND p.timestamp >= ${day}::date
        AND p.timestamp < ${nextDay}::date
      ORDER BY p.timestamp ASC, p.id ASC
    ` as unknown as Promise<{
      id: number;
      funcionario_id: number;
      tipo: PontoTipo;
      timestamp: string;
      score: number | null;
      unidade_id: number;
    }[]>);

    return NextResponse.json({ pontos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    console.error("[api/ponto][GET] PONTO_READ_FAILED", msg);
    return NextResponse.json({ error: "PONTO_READ_FAILED" }, { status: 500 });
  }
}
