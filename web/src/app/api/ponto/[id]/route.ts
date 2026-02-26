import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, requireAuth } from "@/lib/rbac";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

type PontoTipo = "ENTRADA" | "SAIDA";

function parsePontoId(raw: string | null | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function parseTipo(raw: unknown): PontoTipo | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "ENTRADA" || v === "SAIDA") return v;
  return null;
}

function parseTimestampIso(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type RouteContext = { params: { id: string } };

export async function PATCH(req: Request, ctx: RouteContext) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const pontoId = parsePontoId(ctx.params?.id);
  if (!pontoId) {
    return NextResponse.json({ error: "INVALID_PONTO" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        tipo?: PontoTipo;
        timestamp?: string;
        motivo?: string;
      }
    | null;

  const hasTipo = Boolean(body && "tipo" in body);
  const hasTimestamp = Boolean(body && "timestamp" in body);
  if (!hasTipo && !hasTimestamp) {
    return NextResponse.json({ error: "EMPTY_UPDATE" }, { status: 400 });
  }

  const nextTipo = hasTipo ? parseTipo(body?.tipo) : null;
  if (hasTipo && !nextTipo) {
    return NextResponse.json({ error: "INVALID_TIPO" }, { status: 400 });
  }

  const nextTimestamp = hasTimestamp ? parseTimestampIso(body?.timestamp) : null;
  if (hasTimestamp && !nextTimestamp) {
    return NextResponse.json({ error: "INVALID_TIMESTAMP" }, { status: 400 });
  }

  const motivo = String(body?.motivo ?? "").trim() || null;
  const isAdmin = isAdminSession(auth.session);
  const sql = getSql();

  try {
    return await sql.begin(async (tx: any) => {
      const rows = isAdmin
        ? await (tx<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>`
            SELECT
              id,
              funcionario_id,
              unidade_id,
              tipo::text as tipo,
              timestamp::timestamptz::text as timestamp,
              score,
              device_info,
              operador_id
            FROM ponto
            WHERE id = ${pontoId}
            LIMIT 1
          ` as unknown as Promise<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>)
        : await (tx<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>`
            SELECT
              p.id,
              p.funcionario_id,
              p.unidade_id,
              p.tipo::text as tipo,
              p.timestamp::timestamptz::text as timestamp,
              p.score,
              p.device_info,
              p.operador_id
            FROM ponto p
            WHERE p.id = ${pontoId}
              AND p.unidade_id = ${auth.session.supervisor.unidade_id}
            LIMIT 1
          ` as unknown as Promise<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>);

      const before = rows[0];
      if (!before) {
        return NextResponse.json({ error: "PONTO_NOT_FOUND" }, { status: 404 });
      }

      const updated = await (tx<{
        id: number;
        funcionario_id: number;
        unidade_id: number;
        tipo: PontoTipo;
        timestamp: string;
        score: number | null;
      }[]>`
        UPDATE ponto
        SET
          tipo = COALESCE(${nextTipo}::ponto_tipo, tipo),
          timestamp = COALESCE(${nextTimestamp}::timestamptz, timestamp)
        WHERE id = ${pontoId}
        RETURNING
          id,
          funcionario_id,
          unidade_id,
          tipo::text as tipo,
          timestamp::timestamptz::text as timestamp,
          score
      ` as unknown as Promise<{
        id: number;
        funcionario_id: number;
        unidade_id: number;
        tipo: PontoTipo;
        timestamp: string;
        score: number | null;
      }[]>);

      await (tx`
        INSERT INTO ponto_audit (
          ponto_id,
          action,
          motivo,
          before_data,
          after_data,
          actor_supervisor_id
        ) VALUES (
          ${pontoId},
          'UPDATE',
          ${motivo},
          ${JSON.stringify(before)}::jsonb,
          ${JSON.stringify(updated[0])}::jsonb,
          ${auth.session.supervisor.id}
        )
      ` as unknown as Promise<unknown>);

      return NextResponse.json({ ponto: updated[0] });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    console.error("[api/ponto/[id]][PATCH] PONTO_UPDATE_FAILED", msg);
    return NextResponse.json({ error: "PONTO_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const pontoId = parsePontoId(ctx.params?.id);
  if (!pontoId) {
    return NextResponse.json({ error: "INVALID_PONTO" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { motivo?: string } | null;
  const motivo = String(body?.motivo ?? "").trim() || null;

  const isAdmin = isAdminSession(auth.session);
  const sql = getSql();

  try {
    return await sql.begin(async (tx: any) => {
      const rows = isAdmin
        ? await (tx<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>`
            SELECT
              id,
              funcionario_id,
              unidade_id,
              tipo::text as tipo,
              timestamp::timestamptz::text as timestamp,
              score,
              device_info,
              operador_id
            FROM ponto
            WHERE id = ${pontoId}
            LIMIT 1
          ` as unknown as Promise<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>)
        : await (tx<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>`
            SELECT
              p.id,
              p.funcionario_id,
              p.unidade_id,
              p.tipo::text as tipo,
              p.timestamp::timestamptz::text as timestamp,
              p.score,
              p.device_info,
              p.operador_id
            FROM ponto p
            WHERE p.id = ${pontoId}
              AND p.unidade_id = ${auth.session.supervisor.unidade_id}
            LIMIT 1
          ` as unknown as Promise<{
            id: number;
            funcionario_id: number;
            unidade_id: number;
            tipo: PontoTipo;
            timestamp: string;
            score: number | null;
            device_info: unknown;
            operador_id: number;
          }[]>);

      const before = rows[0];
      if (!before) {
        return NextResponse.json({ error: "PONTO_NOT_FOUND" }, { status: 404 });
      }

      const deleted = await (tx<{
        id: number;
      }[]>`
        DELETE FROM ponto
        WHERE id = ${pontoId}
        RETURNING id
      ` as unknown as Promise<{ id: number }[]>);

      if (!deleted[0]) {
        return NextResponse.json({ error: "PONTO_NOT_FOUND" }, { status: 404 });
      }

      await (tx`
        INSERT INTO ponto_audit (
          ponto_id,
          action,
          motivo,
          before_data,
          after_data,
          actor_supervisor_id
        ) VALUES (
          ${pontoId},
          'DELETE',
          ${motivo},
          ${JSON.stringify(before)}::jsonb,
          ${null},
          ${auth.session.supervisor.id}
        )
      ` as unknown as Promise<unknown>);

      return NextResponse.json({ ok: true, id: pontoId });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    console.error("[api/ponto/[id]][DELETE] PONTO_DELETE_FAILED", msg);
    return NextResponse.json({ error: "PONTO_DELETE_FAILED" }, { status: 500 });
  }
}
