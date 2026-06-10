import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

function parseMonthOnly(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function currentMonthOnly() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthOnly: string, months: number) {
  const d = new Date(`${monthOnly}-01T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minDateOnly(a: string, b: string) {
  return a <= b ? a : b;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = parseMonthOnly(searchParams.get("month")) ?? currentMonthOnly();
  const queryUnidadeId = parsePositiveInt(searchParams.get("unidade_id"));
  const isAdmin = isAdminSession(auth.session);
  const unidadeId = isAdmin ? (queryUnidadeId ?? null) : auth.session.supervisor.unidade_id;

  const rangeStart = `${month}-01`;
  const rangeEnd = addMonths(month, 1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const evalEnd = minDateOnly(rangeEnd, toDateOnly(tomorrow));

  try {
    const sql = getSql();
    const rows = unidadeId
      ? await (sql`
          WITH days AS (
            SELECT gs::date AS day
            FROM generate_series(${rangeStart}::date, (${evalEnd}::date - INTERVAL '1 day')::date, INTERVAL '1 day') AS gs
          ),
          funcs AS (
            SELECT
              f.id,
              f.nome,
              f.status,
              f.turno,
              f.local_tipo::text AS local_tipo,
              f.unidade_id,
              u.nome AS unidade_nome,
              COALESCE(f.hora_entrada_prevista, '08:00:00'::time) AS hora_entrada_prevista,
              COALESCE(f.hora_saida_prevista, '17:00:00'::time) AS hora_saida_prevista,
              COALESCE(fe.embeddings, 0)::int AS face_embeddings
            FROM funcionario f
            JOIN unidade u ON u.id = f.unidade_id
            LEFT JOIN (
              SELECT funcionario_id, COUNT(*)::int AS embeddings
              FROM face_embedding
              GROUP BY funcionario_id
            ) fe ON fe.funcionario_id = f.id
            WHERE f.unidade_id = ${unidadeId}
          ),
          points_by_day AS (
            SELECT
              p.funcionario_id,
              DATE(p."timestamp")::date AS day,
              MIN(p."timestamp") FILTER (WHERE p.tipo = 'ENTRADA') AS entrada_ts,
              MAX(p."timestamp") FILTER (WHERE p.tipo = 'SAIDA') AS saida_ts,
              COUNT(*)::int AS registros
            FROM ponto p
            WHERE p.unidade_id = ${unidadeId}
              AND p."timestamp" >= ${rangeStart}::date
              AND p."timestamp" < ${rangeEnd}::date
            GROUP BY p.funcionario_id, DATE(p."timestamp")::date
          ),
          day_metrics AS (
            SELECT
              f.id AS funcionario_id,
              d.day,
              p.registros,
              CASE
                WHEN p.entrada_ts IS NOT NULL AND p.saida_ts IS NOT NULL AND p.saida_ts > p.entrada_ts
                THEN FLOOR(EXTRACT(EPOCH FROM (p.saida_ts - p.entrada_ts)) / 60)::int
                ELSE 0
              END AS total_minutos,
              GREATEST(
                0,
                CASE
                  WHEN p.entrada_ts IS NOT NULL AND p.saida_ts IS NOT NULL AND p.saida_ts > p.entrada_ts
                  THEN FLOOR(EXTRACT(EPOCH FROM (p.saida_ts - p.entrada_ts)) / 60)::int
                  ELSE 0
                END
                -
                GREATEST(
                  0,
                  FLOOR(EXTRACT(EPOCH FROM (
                    (d.day + f.hora_saida_prevista) - (d.day + f.hora_entrada_prevista)
                  )) / 60)::int
                )
              ) AS hora_extra_minutos
            FROM funcs f
            CROSS JOIN days d
            LEFT JOIN points_by_day p ON p.funcionario_id = f.id AND p.day = d.day
          )
          SELECT
            f.id,
            f.nome,
            f.status,
            f.turno,
            f.local_tipo,
            f.unidade_id,
            f.unidade_nome,
            TO_CHAR(f.hora_entrada_prevista, 'HH24:MI') AS hora_entrada_prevista,
            TO_CHAR(f.hora_saida_prevista, 'HH24:MI') AS hora_saida_prevista,
            f.face_embeddings,
            COUNT(dm.day)::int AS dias_avaliados,
            SUM(CASE WHEN COALESCE(dm.registros, 0) > 0 THEN 1 ELSE 0 END)::int AS dias_com_ponto,
            SUM(CASE WHEN COALESCE(dm.registros, 0) = 0 THEN 1 ELSE 0 END)::int AS faltas,
            COALESCE(SUM(dm.total_minutos), 0)::int AS total_minutos,
            COALESCE(SUM(dm.hora_extra_minutos), 0)::int AS hora_extra_minutos,
            CASE
              WHEN COUNT(dm.day) > 0
              THEN ROUND((SUM(CASE WHEN COALESCE(dm.registros, 0) > 0 THEN 1 ELSE 0 END)::numeric / COUNT(dm.day)::numeric) * 100)::int
              ELSE 0
            END AS percentual_presenca
          FROM funcs f
          LEFT JOIN day_metrics dm ON dm.funcionario_id = f.id
          GROUP BY
            f.id, f.nome, f.status, f.turno, f.local_tipo, f.unidade_id, f.unidade_nome,
            f.hora_entrada_prevista, f.hora_saida_prevista, f.face_embeddings
          ORDER BY f.nome ASC
        ` as unknown as Promise<any[]>)
      : await (sql`
          WITH days AS (
            SELECT gs::date AS day
            FROM generate_series(${rangeStart}::date, (${evalEnd}::date - INTERVAL '1 day')::date, INTERVAL '1 day') AS gs
          ),
          funcs AS (
            SELECT
              f.id,
              f.nome,
              f.status,
              f.turno,
              f.local_tipo::text AS local_tipo,
              f.unidade_id,
              u.nome AS unidade_nome,
              COALESCE(f.hora_entrada_prevista, '08:00:00'::time) AS hora_entrada_prevista,
              COALESCE(f.hora_saida_prevista, '17:00:00'::time) AS hora_saida_prevista,
              COALESCE(fe.embeddings, 0)::int AS face_embeddings
            FROM funcionario f
            JOIN unidade u ON u.id = f.unidade_id
            LEFT JOIN (
              SELECT funcionario_id, COUNT(*)::int AS embeddings
              FROM face_embedding
              GROUP BY funcionario_id
            ) fe ON fe.funcionario_id = f.id
          ),
          points_by_day AS (
            SELECT
              p.funcionario_id,
              DATE(p."timestamp")::date AS day,
              MIN(p."timestamp") FILTER (WHERE p.tipo = 'ENTRADA') AS entrada_ts,
              MAX(p."timestamp") FILTER (WHERE p.tipo = 'SAIDA') AS saida_ts,
              COUNT(*)::int AS registros
            FROM ponto p
            WHERE p."timestamp" >= ${rangeStart}::date
              AND p."timestamp" < ${rangeEnd}::date
            GROUP BY p.funcionario_id, DATE(p."timestamp")::date
          ),
          day_metrics AS (
            SELECT
              f.id AS funcionario_id,
              d.day,
              p.registros,
              CASE
                WHEN p.entrada_ts IS NOT NULL AND p.saida_ts IS NOT NULL AND p.saida_ts > p.entrada_ts
                THEN FLOOR(EXTRACT(EPOCH FROM (p.saida_ts - p.entrada_ts)) / 60)::int
                ELSE 0
              END AS total_minutos,
              GREATEST(
                0,
                CASE
                  WHEN p.entrada_ts IS NOT NULL AND p.saida_ts IS NOT NULL AND p.saida_ts > p.entrada_ts
                  THEN FLOOR(EXTRACT(EPOCH FROM (p.saida_ts - p.entrada_ts)) / 60)::int
                  ELSE 0
                END
                -
                GREATEST(
                  0,
                  FLOOR(EXTRACT(EPOCH FROM (
                    (d.day + f.hora_saida_prevista) - (d.day + f.hora_entrada_prevista)
                  )) / 60)::int
                )
              ) AS hora_extra_minutos
            FROM funcs f
            CROSS JOIN days d
            LEFT JOIN points_by_day p ON p.funcionario_id = f.id AND p.day = d.day
          )
          SELECT
            f.id,
            f.nome,
            f.status,
            f.turno,
            f.local_tipo,
            f.unidade_id,
            f.unidade_nome,
            TO_CHAR(f.hora_entrada_prevista, 'HH24:MI') AS hora_entrada_prevista,
            TO_CHAR(f.hora_saida_prevista, 'HH24:MI') AS hora_saida_prevista,
            f.face_embeddings,
            COUNT(dm.day)::int AS dias_avaliados,
            SUM(CASE WHEN COALESCE(dm.registros, 0) > 0 THEN 1 ELSE 0 END)::int AS dias_com_ponto,
            SUM(CASE WHEN COALESCE(dm.registros, 0) = 0 THEN 1 ELSE 0 END)::int AS faltas,
            COALESCE(SUM(dm.total_minutos), 0)::int AS total_minutos,
            COALESCE(SUM(dm.hora_extra_minutos), 0)::int AS hora_extra_minutos,
            CASE
              WHEN COUNT(dm.day) > 0
              THEN ROUND((SUM(CASE WHEN COALESCE(dm.registros, 0) > 0 THEN 1 ELSE 0 END)::numeric / COUNT(dm.day)::numeric) * 100)::int
              ELSE 0
            END AS percentual_presenca
          FROM funcs f
          LEFT JOIN day_metrics dm ON dm.funcionario_id = f.id
          GROUP BY
            f.id, f.nome, f.status, f.turno, f.local_tipo, f.unidade_id, f.unidade_nome,
            f.hora_entrada_prevista, f.hora_saida_prevista, f.face_embeddings
          ORDER BY f.unidade_nome ASC, f.nome ASC
        ` as unknown as Promise<any[]>);

    return NextResponse.json({
      month,
      range_start: rangeStart,
      range_end: rangeEnd,
      eval_end: evalEnd,
      funcionarios: rows
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details = process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios/metricas][GET]", { code, message });
    return NextResponse.json({ error: "DB_ERROR", ...(details ?? {}) }, { status: 500 });
  }
}
