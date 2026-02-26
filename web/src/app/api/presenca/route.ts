import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

type DayStatus = "PRESENT" | "PENDING" | "ABSENT";
type Period = "WEEK" | "MONTH" | "YEAR";

type RankingItem = {
  funcionario_id: number;
  nome: string;
  faltas: number;
  pendentes: number;
  presentes: number;
  status_hint: DayStatus;
};

type DayPersonItem = {
  funcionario_id: number;
  nome: string;
  status_day: DayStatus;
  kind?: "FUNCIONARIO" | "DIARISTA";
};

function parseDateOnly(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

function parsePeriod(raw: string | null): Period {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "MONTH") return "MONTH";
  if (v === "YEAR") return "YEAR";
  return "WEEK";
}

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function rangeFromPeriod(period: Period, refDate: string): { start: string; end: string } {
  const ref = new Date(`${refDate}T00:00:00`);
  if (Number.isNaN(ref.getTime())) throw new Error("INVALID_REF_DATE");

  if (period === "WEEK") {
    const start = startOfWeekMonday(ref);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: toDateOnly(start), end: toDateOnly(end) };
  }

  if (period === "MONTH") {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
    return { start: toDateOnly(start), end: toDateOnly(end) };
  }

  const start = new Date(ref.getFullYear(), 0, 1);
  const end = new Date(ref.getFullYear() + 1, 0, 1);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

function deriveNoRecordStatus(day: string, today: string): "PENDING" | "ABSENT" {
  return day >= today ? "PENDING" : "ABSENT";
}

async function loadRanking(
  sql: ReturnType<typeof getSql>,
  scopeUnidadeId: number | null,
  start: string,
  end: string,
  today: string
): Promise<RankingItem[]> {
  const rows = scopeUnidadeId
    ? await (sql<
        {
          funcionario_id: number;
          nome: string;
          faltas: number;
          pendentes: number;
          presentes: number;
        }[]
      >`
        WITH days AS (
          SELECT gs::date AS day
          FROM generate_series(${start}::date, (${end}::date - INTERVAL '1 day')::date, INTERVAL '1 day') AS gs
        ),
        funcs AS (
          SELECT id, nome
          FROM funcionario
          WHERE unidade_id = ${scopeUnidadeId} AND status = 'ATIVO'
        ),
        points_by_day AS (
          SELECT funcionario_id, DATE("timestamp")::date AS day, COUNT(*)::int AS total
          FROM ponto
          WHERE unidade_id = ${scopeUnidadeId}
            AND "timestamp" >= ${start}::date
            AND "timestamp" < ${end}::date
          GROUP BY funcionario_id, DATE("timestamp")::date
        )
        SELECT
          f.id AS funcionario_id,
          f.nome,
          SUM(CASE WHEN p.total IS NULL AND d.day < ${today}::date THEN 1 ELSE 0 END)::int AS faltas,
          SUM(CASE WHEN p.total IS NULL AND d.day >= ${today}::date THEN 1 ELSE 0 END)::int AS pendentes,
          SUM(CASE WHEN p.total IS NOT NULL THEN 1 ELSE 0 END)::int AS presentes
        FROM funcs f
        CROSS JOIN days d
        LEFT JOIN points_by_day p ON p.funcionario_id = f.id AND p.day = d.day
        GROUP BY f.id, f.nome
        ORDER BY faltas DESC, pendentes DESC, presentes ASC, f.nome ASC
        LIMIT 8
      ` as unknown as Promise<
        {
          funcionario_id: number;
          nome: string;
          faltas: number;
          pendentes: number;
          presentes: number;
        }[]
      >)
    : await (sql<
        {
          funcionario_id: number;
          nome: string;
          faltas: number;
          pendentes: number;
          presentes: number;
        }[]
      >`
        WITH days AS (
          SELECT gs::date AS day
          FROM generate_series(${start}::date, (${end}::date - INTERVAL '1 day')::date, INTERVAL '1 day') AS gs
        ),
        funcs AS (
          SELECT id, nome
          FROM funcionario
          WHERE status = 'ATIVO'
        ),
        points_by_day AS (
          SELECT funcionario_id, DATE("timestamp")::date AS day, COUNT(*)::int AS total
          FROM ponto
          WHERE "timestamp" >= ${start}::date
            AND "timestamp" < ${end}::date
          GROUP BY funcionario_id, DATE("timestamp")::date
        )
        SELECT
          f.id AS funcionario_id,
          f.nome,
          SUM(CASE WHEN p.total IS NULL AND d.day < ${today}::date THEN 1 ELSE 0 END)::int AS faltas,
          SUM(CASE WHEN p.total IS NULL AND d.day >= ${today}::date THEN 1 ELSE 0 END)::int AS pendentes,
          SUM(CASE WHEN p.total IS NOT NULL THEN 1 ELSE 0 END)::int AS presentes
        FROM funcs f
        CROSS JOIN days d
        LEFT JOIN points_by_day p ON p.funcionario_id = f.id AND p.day = d.day
        GROUP BY f.id, f.nome
        ORDER BY faltas DESC, pendentes DESC, presentes ASC, f.nome ASC
        LIMIT 8
      ` as unknown as Promise<
        {
          funcionario_id: number;
          nome: string;
          faltas: number;
          pendentes: number;
          presentes: number;
        }[]
      >);

  return rows.map((r) => ({
    ...r,
    status_hint: r.faltas > 0 ? "ABSENT" : r.pendentes > 0 ? "PENDING" : "PRESENT"
  }));
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const funcionarioId = parsePositiveInt(searchParams.get("funcionario_id"));
  const queryUnidadeId = parsePositiveInt(searchParams.get("unidade_id"));

  const period = parsePeriod(searchParams.get("period"));
  const weekStartLegacy = parseDateOnly(searchParams.get("week_start"));
  const refDate = parseDateOnly(searchParams.get("ref_date")) ?? toDateOnly(new Date());
  const selectedDayRaw = parseDateOnly(searchParams.get("selected_day"));
  const withRanking = searchParams.get("with_ranking") === "1";

  let range: { start: string; end: string };
  try {
    range = weekStartLegacy
      ? { start: weekStartLegacy, end: addDays(weekStartLegacy, 7) }
      : rangeFromPeriod(period, refDate);
  } catch {
    return NextResponse.json({ error: "INVALID_REF_DATE" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const isAdmin = isAdminSession(auth.session);
    const scopeUnidadeId = isAdmin ? (queryUnidadeId ?? null) : auth.session.supervisor.unidade_id;
    const today = toDateOnly(new Date());
    const selectedDay =
      selectedDayRaw && selectedDayRaw >= range.start && selectedDayRaw < range.end
        ? selectedDayRaw
        : range.start;
    const nextSelectedDay = addDays(selectedDay, 1);

    const ranking = withRanking
      ? await loadRanking(sql, scopeUnidadeId, range.start, range.end, today)
      : [];

    const dayPeopleRows = scopeUnidadeId
      ? await (sql<
          {
            id: number;
            nome: string;
            total: number;
          }[]
        >`
          SELECT
            f.id,
            f.nome,
            COALESCE(p.total, 0)::int AS total
          FROM funcionario f
          LEFT JOIN (
            SELECT funcionario_id, COUNT(*)::int AS total
            FROM ponto
            WHERE unidade_id = ${scopeUnidadeId}
              AND "timestamp" >= ${selectedDay}::date
              AND "timestamp" < ${nextSelectedDay}::date
            GROUP BY funcionario_id
          ) p ON p.funcionario_id = f.id
          WHERE f.status = 'ATIVO'
            AND f.unidade_id = ${scopeUnidadeId}
            AND (${funcionarioId ?? null}::int IS NULL OR f.id = ${funcionarioId ?? null}::int)
          ORDER BY f.nome ASC
        ` as unknown as Promise<
          {
            id: number;
            nome: string;
            total: number;
          }[]
        >)
      : await (sql<
          {
            id: number;
            nome: string;
            total: number;
          }[]
        >`
          SELECT
            f.id,
            f.nome,
            COALESCE(p.total, 0)::int AS total
          FROM funcionario f
          LEFT JOIN (
            SELECT funcionario_id, COUNT(*)::int AS total
            FROM ponto
            WHERE "timestamp" >= ${selectedDay}::date
              AND "timestamp" < ${nextSelectedDay}::date
            GROUP BY funcionario_id
          ) p ON p.funcionario_id = f.id
          WHERE f.status = 'ATIVO'
            AND (${funcionarioId ?? null}::int IS NULL OR f.id = ${funcionarioId ?? null}::int)
          ORDER BY f.nome ASC
        ` as unknown as Promise<
          {
            id: number;
            nome: string;
            total: number;
          }[]
        >);

    const diaristasRows = scopeUnidadeId
      ? await (sql<{
          id: number;
          nome_diarista: string;
        }[]>`
          SELECT id, nome_diarista
          FROM diarista_presenca
          WHERE unidade_id = ${scopeUnidadeId}
            AND data_ref = ${selectedDay}::date
          ORDER BY nome_diarista ASC
        ` as unknown as Promise<{
          id: number;
          nome_diarista: string;
        }[]>)
      : await (sql<{
          id: number;
          nome_diarista: string;
        }[]>`
          SELECT id, nome_diarista
          FROM diarista_presenca
          WHERE data_ref = ${selectedDay}::date
          ORDER BY nome_diarista ASC
        ` as unknown as Promise<{
          id: number;
          nome_diarista: string;
        }[]>);

    const day_people: DayPersonItem[] = dayPeopleRows.map((r) => ({
      funcionario_id: r.id,
      nome: r.nome,
      status_day: r.total > 0 ? "PRESENT" : deriveNoRecordStatus(selectedDay, today),
      kind: "FUNCIONARIO"
    }));
    for (const d of diaristasRows) {
      day_people.push({
        funcionario_id: -Math.abs(d.id),
        nome: `${d.nome_diarista} (diarista)`,
        status_day: "PRESENT",
        kind: "DIARISTA"
      });
    }

    if (!funcionarioId) {
      const totalRows = scopeUnidadeId
        ? await (sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total
            FROM funcionario
            WHERE unidade_id = ${scopeUnidadeId} AND status = 'ATIVO'
          ` as unknown as Promise<{ total: number }[]>)
        : await (sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total
            FROM funcionario
            WHERE status = 'ATIVO'
          ` as unknown as Promise<{ total: number }[]>);

      const totalFuncionarios = totalRows[0]?.total ?? 0;

      const rows = scopeUnidadeId
        ? await (sql<
            {
              day: string;
              present_count: number;
              total_registros: number;
            }[]
          >`
            SELECT
              DATE("timestamp")::text AS day,
              COUNT(DISTINCT funcionario_id)::int AS present_count,
              COUNT(*)::int AS total_registros
            FROM ponto
            WHERE unidade_id = ${scopeUnidadeId}
              AND "timestamp" >= ${range.start}::date
              AND "timestamp" < ${range.end}::date
            GROUP BY 1
            ORDER BY 1 ASC
          ` as unknown as Promise<
            {
              day: string;
              present_count: number;
              total_registros: number;
            }[]
          >)
        : await (sql<
            {
              day: string;
              present_count: number;
              total_registros: number;
            }[]
          >`
            SELECT
              DATE("timestamp")::text AS day,
              COUNT(DISTINCT funcionario_id)::int AS present_count,
              COUNT(*)::int AS total_registros
            FROM ponto
            WHERE "timestamp" >= ${range.start}::date
              AND "timestamp" < ${range.end}::date
            GROUP BY 1
            ORDER BY 1 ASC
          ` as unknown as Promise<
            {
              day: string;
              present_count: number;
              total_registros: number;
            }[]
          >);

      const byDay = new Map(rows.map((r) => [r.day, r]));
      const days: Array<{
        day: string;
        present_count: number;
        total_funcionarios: number;
        total_registros: number;
        status_day: DayStatus;
      }> = [];

      for (let day = range.start; day < range.end; day = addDays(day, 1)) {
        const row = byDay.get(day);
        const presentCount = row?.present_count ?? 0;
        const totalRegistros = row?.total_registros ?? 0;
        days.push({
          day,
          present_count: presentCount,
          total_funcionarios: totalFuncionarios,
          total_registros: totalRegistros,
          status_day: presentCount > 0 ? "PRESENT" : deriveNoRecordStatus(day, today)
        });
      }

      return NextResponse.json({
        ok: true,
        scope: "ALL",
        period,
        range_start: range.start,
        range_end: range.end,
        selected_day: selectedDay,
        total_funcionarios: totalFuncionarios,
        ranking,
        day_people,
        days
      });
    }

    const ok = scopeUnidadeId
      ? await (sql<{ id: number }[]>`
          SELECT id FROM funcionario
          WHERE id = ${funcionarioId} AND unidade_id = ${scopeUnidadeId}
          LIMIT 1
        ` as unknown as Promise<{ id: number }[]>)
      : await (sql<{ id: number }[]>`
          SELECT id FROM funcionario WHERE id = ${funcionarioId} LIMIT 1
        ` as unknown as Promise<{ id: number }[]>);

    if (!ok[0]) {
      return NextResponse.json({ error: "FUNCIONARIO_FORBIDDEN" }, { status: 403 });
    }

    const rows = scopeUnidadeId
      ? await (sql<
          {
            day: string;
            first_ts: string;
            last_ts: string;
            total: number;
            entradas: number;
            saidas: number;
          }[]
        >`
          SELECT
            DATE("timestamp")::text AS day,
            MIN("timestamp")::timestamptz::text AS first_ts,
            MAX("timestamp")::timestamptz::text AS last_ts,
            COUNT(*)::int AS total,
            SUM(CASE WHEN tipo = 'ENTRADA' THEN 1 ELSE 0 END)::int AS entradas,
            SUM(CASE WHEN tipo = 'SAIDA' THEN 1 ELSE 0 END)::int AS saidas
          FROM ponto
          WHERE funcionario_id = ${funcionarioId}
            AND unidade_id = ${scopeUnidadeId}
            AND "timestamp" >= ${range.start}::date
            AND "timestamp" < ${range.end}::date
          GROUP BY 1
          ORDER BY 1 ASC
        ` as unknown as Promise<
          {
            day: string;
            first_ts: string;
            last_ts: string;
            total: number;
            entradas: number;
            saidas: number;
          }[]
        >)
      : await (sql<
          {
            day: string;
            first_ts: string;
            last_ts: string;
            total: number;
            entradas: number;
            saidas: number;
          }[]
        >`
          SELECT
            DATE("timestamp")::text AS day,
            MIN("timestamp")::timestamptz::text AS first_ts,
            MAX("timestamp")::timestamptz::text AS last_ts,
            COUNT(*)::int AS total,
            SUM(CASE WHEN tipo = 'ENTRADA' THEN 1 ELSE 0 END)::int AS entradas,
            SUM(CASE WHEN tipo = 'SAIDA' THEN 1 ELSE 0 END)::int AS saidas
          FROM ponto
          WHERE funcionario_id = ${funcionarioId}
            AND "timestamp" >= ${range.start}::date
            AND "timestamp" < ${range.end}::date
          GROUP BY 1
          ORDER BY 1 ASC
        ` as unknown as Promise<
          {
            day: string;
            first_ts: string;
            last_ts: string;
            total: number;
            entradas: number;
            saidas: number;
          }[]
        >);

    const byDay = new Map(rows.map((r) => [r.day, r]));
    const days: Array<{
      day: string;
      present: boolean;
      first_ts: string | null;
      last_ts: string | null;
      total: number;
      entradas: number;
      saidas: number;
      is_incomplete: boolean;
      status_day: DayStatus;
    }> = [];

    for (let day = range.start; day < range.end; day = addDays(day, 1)) {
      const row = byDay.get(day);
      if (!row) {
        days.push({
          day,
          present: false,
          first_ts: null,
          last_ts: null,
          total: 0,
          entradas: 0,
          saidas: 0,
          is_incomplete: false,
          status_day: deriveNoRecordStatus(day, today)
        });
        continue;
      }

      days.push({
        day,
        present: row.total > 0,
        first_ts: row.first_ts,
        last_ts: row.last_ts,
        total: row.total,
        entradas: row.entradas,
        saidas: row.saidas,
        is_incomplete: row.total > 0 && row.entradas !== row.saidas,
        status_day: "PRESENT"
      });
    }

    return NextResponse.json({
      ok: true,
      scope: "ONE",
      period,
      range_start: range.start,
      range_end: range.end,
      selected_day: selectedDay,
      funcionario_id: funcionarioId,
      ranking,
      day_people,
      days
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details = process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/presenca][GET]", { code, message });
    return NextResponse.json({ error: "DB_ERROR", ...(details ?? {}) }, { status: 500 });
  }
}
