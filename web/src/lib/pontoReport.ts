import { getSql } from "@/lib/db";

export type PontoTipo = "ENTRADA" | "SAIDA";

export type FuncionarioPontoInfo = {
  id: number;
  nome: string;
  status: string;
  unidade_id: number;
  unidade_nome: string;
  hora_entrada_prevista: string | null;
  hora_saida_prevista: string | null;
};

export type PontoRegistro = {
  id: number;
  tipo: PontoTipo;
  timestamp: string;
};

export type PontoDia = {
  day: string;
  registros: PontoRegistro[];
  entrada: string | null;
  saida: string | null;
  total_minutos: number;
  hora_extra_minutos: number;
  incompleto: boolean;
};

export type PontoReport = {
  funcionario: FuncionarioPontoInfo;
  month: string;
  range_start: string;
  range_end: string;
  totals: {
    dias_com_ponto: number;
    total_minutos: number;
    hora_extra_minutos: number;
  };
  days: PontoDia[];
};

const DEFAULT_HORA_ENTRADA = "08:00";
const DEFAULT_HORA_SAIDA = "17:00";

export function parseMonthOnly(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  return v;
}

export function currentMonthOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthOnly: string, months: number): string {
  const start = new Date(`${monthOnly}-01T00:00:00`);
  start.setMonth(start.getMonth() + months);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 60_000);
}

function scheduledMinutes(funcionario: FuncionarioPontoInfo): number {
  const start = funcionario.hora_entrada_prevista ?? DEFAULT_HORA_ENTRADA;
  const end = funcionario.hora_saida_prevista ?? DEFAULT_HORA_SAIDA;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const value = (eh * 60 + em) - (sh * 60 + sm);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function buildFuncionarioPontoReport(funcionarioId: number, month: string): Promise<PontoReport | null> {
  const sql = getSql();
  const funcionarioRows = await (sql<FuncionarioPontoInfo[]>`
    SELECT
      f.id,
      f.nome,
      f.status,
      f.unidade_id,
      u.nome AS unidade_nome,
      TO_CHAR(f.hora_entrada_prevista, 'HH24:MI') AS hora_entrada_prevista,
      TO_CHAR(f.hora_saida_prevista, 'HH24:MI') AS hora_saida_prevista
    FROM funcionario f
    JOIN unidade u ON u.id = f.unidade_id
    WHERE f.id = ${funcionarioId}
    LIMIT 1
  ` as unknown as Promise<FuncionarioPontoInfo[]>);

  const funcionario = funcionarioRows[0];
  if (!funcionario) return null;

  const rangeStart = `${month}-01`;
  const rangeEnd = addMonths(month, 1);
  const registros = await (sql<Array<PontoRegistro & { day: string }>>`
    SELECT
      id,
      tipo::text AS tipo,
      "timestamp"::timestamptz::text AS timestamp,
      DATE("timestamp")::text AS day
    FROM ponto
    WHERE funcionario_id = ${funcionarioId}
      AND "timestamp" >= ${rangeStart}::date
      AND "timestamp" < ${rangeEnd}::date
    ORDER BY "timestamp" ASC, id ASC
  ` as unknown as Promise<Array<PontoRegistro & { day: string }>>);

  const byDay = new Map<string, PontoRegistro[]>();
  for (const row of registros) {
    const list = byDay.get(row.day) ?? [];
    list.push({ id: row.id, tipo: row.tipo, timestamp: row.timestamp });
    byDay.set(row.day, list);
  }

  const expectedMinutes = scheduledMinutes(funcionario);
  const days: PontoDia[] = [];
  for (let day = rangeStart; day < rangeEnd; day = addDays(day, 1)) {
    const dayRegistros = byDay.get(day) ?? [];
    const entrada = dayRegistros.find((r) => r.tipo === "ENTRADA")?.timestamp ?? null;
    const saida = [...dayRegistros].reverse().find((r) => r.tipo === "SAIDA")?.timestamp ?? null;
    const totalMinutos = entrada && saida ? minutesBetween(entrada, saida) : 0;
    days.push({
      day,
      registros: dayRegistros,
      entrada,
      saida,
      total_minutos: totalMinutos,
      hora_extra_minutos: Math.max(0, totalMinutos - expectedMinutes),
      incompleto: dayRegistros.length > 0 && (!entrada || !saida)
    });
  }

  return {
    funcionario,
    month,
    range_start: rangeStart,
    range_end: rangeEnd,
    totals: {
      dias_com_ponto: days.filter((d) => d.registros.length > 0).length,
      total_minutos: days.reduce((acc, d) => acc + d.total_minutos, 0),
      hora_extra_minutos: days.reduce((acc, d) => acc + d.hora_extra_minutos, 0)
    },
    days
  };
}
