import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";
type TimeHHMM = string;

const DEFAULT_HORA_ENTRADA = "08:00";
const DEFAULT_HORA_SAIDA = "17:00";

function parseTurno(raw: unknown): 1 | 2 | 3 | null {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function parseLocalTipo(raw: unknown): LocalTipo | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "LOJA" || v === "ESCRITORIO" || v === "CD") return v as LocalTipo;
  return null;
}

function parseTimeHHMM(raw: unknown): TimeHHMM | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const v = String(raw).trim();
  const m = v.match(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const sql = getSql();
    const isAdmin = isAdminSession(auth.session);
    const { searchParams } = new URL(req.url);
    const queryUnidadeId = parsePositiveInt(searchParams.get("unidade_id"));

    const unidadeId = isAdmin ? queryUnidadeId : auth.session.supervisor.unidade_id;

    const rows = unidadeId
      ? await (sql<
          {
            id: number;
            nome: string;
            turno: number;
            local_tipo: LocalTipo;
            status: string;
            unidade_id: number;
            unidade_nome: string;
            face_embeddings: number;
            hora_entrada_prevista: string | null;
            hora_saida_prevista: string | null;
          }[]
        >`
          SELECT
            f.id,
            f.nome,
            f.turno,
            f.local_tipo::text as local_tipo,
            f.status,
            TO_CHAR(COALESCE(f.hora_entrada_prevista, ${`${DEFAULT_HORA_ENTRADA}:00`}::time), 'HH24:MI') as hora_entrada_prevista,
            TO_CHAR(COALESCE(f.hora_saida_prevista, ${`${DEFAULT_HORA_SAIDA}:00`}::time), 'HH24:MI') as hora_saida_prevista,
            f.unidade_id,
            u.nome AS unidade_nome,
            COALESCE(fe.embeddings, 0)::int as face_embeddings
          FROM funcionario f
          JOIN unidade u ON u.id = f.unidade_id
          LEFT JOIN (
            SELECT funcionario_id, COUNT(*)::int AS embeddings
            FROM face_embedding
            GROUP BY funcionario_id
          ) fe ON fe.funcionario_id = f.id
          WHERE f.unidade_id = ${unidadeId}
          ORDER BY u.nome ASC, f.nome ASC
        ` as unknown as Promise<
          {
            id: number;
            nome: string;
            turno: number;
            local_tipo: LocalTipo;
            status: string;
            unidade_id: number;
            unidade_nome: string;
            face_embeddings: number;
            hora_entrada_prevista: string | null;
            hora_saida_prevista: string | null;
          }[]
        >)
      : await (sql<
          {
            id: number;
            nome: string;
            turno: number;
            local_tipo: LocalTipo;
            status: string;
            unidade_id: number;
            unidade_nome: string;
            face_embeddings: number;
            hora_entrada_prevista: string | null;
            hora_saida_prevista: string | null;
          }[]
        >`
          SELECT
            f.id,
            f.nome,
            f.turno,
            f.local_tipo::text as local_tipo,
            f.status,
            TO_CHAR(COALESCE(f.hora_entrada_prevista, ${`${DEFAULT_HORA_ENTRADA}:00`}::time), 'HH24:MI') as hora_entrada_prevista,
            TO_CHAR(COALESCE(f.hora_saida_prevista, ${`${DEFAULT_HORA_SAIDA}:00`}::time), 'HH24:MI') as hora_saida_prevista,
            f.unidade_id,
            u.nome AS unidade_nome,
            COALESCE(fe.embeddings, 0)::int as face_embeddings
          FROM funcionario f
          JOIN unidade u ON u.id = f.unidade_id
          LEFT JOIN (
            SELECT funcionario_id, COUNT(*)::int AS embeddings
            FROM face_embedding
            GROUP BY funcionario_id
          ) fe ON fe.funcionario_id = f.id
          ORDER BY u.nome ASC, f.nome ASC
        ` as unknown as Promise<
          {
            id: number;
            nome: string;
            turno: number;
            local_tipo: LocalTipo;
            status: string;
            unidade_id: number;
            unidade_nome: string;
            face_embeddings: number;
            hora_entrada_prevista: string | null;
            hora_saida_prevista: string | null;
          }[]
        >);

    return NextResponse.json({ funcionarios: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details = process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][GET]", { code, message });
    return NextResponse.json({ error: "DB_ERROR", ...(details ?? {}) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | {
          nome?: string;
          turno?: 1 | 2 | 3 | number | string;
          local_tipo?: LocalTipo | string;
          unidade_id?: number | string;
          hora_entrada_prevista?: string | null;
          hora_saida_prevista?: string | null;
        }
      | null;

    const nome = String(body?.nome ?? "").trim();
    if (!nome || nome.length < 2) {
      return NextResponse.json({ error: "INVALID_NOME" }, { status: 400 });
    }
    const turno = parseTurno(body?.turno);
    if (!turno) {
      return NextResponse.json({ error: "INVALID_TURNO" }, { status: 400 });
    }
    const localTipo = parseLocalTipo(body?.local_tipo);
    if (!localTipo) {
      return NextResponse.json({ error: "INVALID_LOCAL_TIPO" }, { status: 400 });
    }
    const horaEntradaParsed = parseTimeHHMM(body?.hora_entrada_prevista);
    const horaSaidaParsed = parseTimeHHMM(body?.hora_saida_prevista);
    if (body && "hora_entrada_prevista" in body && body.hora_entrada_prevista && !horaEntradaParsed) {
      return NextResponse.json({ error: "INVALID_HORA_ENTRADA" }, { status: 400 });
    }
    if (body && "hora_saida_prevista" in body && body.hora_saida_prevista && !horaSaidaParsed) {
      return NextResponse.json({ error: "INVALID_HORA_SAIDA" }, { status: 400 });
    }
    const horaEntrada = horaEntradaParsed ?? DEFAULT_HORA_ENTRADA;
    const horaSaida = horaSaidaParsed ?? DEFAULT_HORA_SAIDA;

    const isAdmin = isAdminSession(auth.session);
    const unidadeId = isAdmin
      ? (parsePositiveInt(body?.unidade_id) ?? auth.session.supervisor.unidade_id)
      : auth.session.supervisor.unidade_id;

    if (!unidadeId) {
      return NextResponse.json({ error: "INVALID_UNIDADE" }, { status: 400 });
    }

    const sql = getSql();

    const inserted = await (sql<
      {
        id: number;
        nome: string;
        turno: number;
        local_tipo: LocalTipo;
        unidade_id: number;
        status: string;
        hora_entrada_prevista: string | null;
        hora_saida_prevista: string | null;
      }[]
    >`
      INSERT INTO funcionario (
        nome, turno, local_tipo, unidade_id, status, hora_entrada_prevista, hora_saida_prevista
      )
      VALUES (
        ${nome},
        ${turno},
        ${localTipo}::local_tipo,
        ${unidadeId},
        'ATIVO',
        ${`${horaEntrada}:00`}::time,
        ${`${horaSaida}:00`}::time
      )
      RETURNING
        id,
        nome,
        turno,
        local_tipo::text as local_tipo,
        unidade_id,
        status,
        TO_CHAR(hora_entrada_prevista, 'HH24:MI') as hora_entrada_prevista,
        TO_CHAR(hora_saida_prevista, 'HH24:MI') as hora_saida_prevista
    ` as unknown as Promise<
      {
        id: number;
        nome: string;
        turno: number;
        local_tipo: LocalTipo;
        unidade_id: number;
        status: string;
        hora_entrada_prevista: string | null;
        hora_saida_prevista: string | null;
      }[]
    >);

    return NextResponse.json({ funcionario: inserted[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details = process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][POST]", { code, message });

    if (code === "23505") {
      return NextResponse.json({ error: "DUPLICATE_KEY", ...(details ?? {}) }, { status: 409 });
    }

    return NextResponse.json({ error: "DB_ERROR", ...(details ?? {}) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | {
          id?: number | string;
          nome?: string;
          turno?: 1 | 2 | 3 | number | string;
          local_tipo?: LocalTipo | string;
          hora_entrada_prevista?: string | null;
          hora_saida_prevista?: string | null;
          status?: string;
        }
      | null;

    const funcionarioId = parsePositiveInt(body?.id);
    if (!funcionarioId) {
      return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
    }

    const nome = body && "nome" in body ? String(body?.nome ?? "").trim() : undefined;
    if (nome !== undefined && nome.length < 2) {
      return NextResponse.json({ error: "INVALID_NOME" }, { status: 400 });
    }

    const turno = body && "turno" in body ? parseTurno(body?.turno) : undefined;
    if (body && "turno" in body && !turno) {
      return NextResponse.json({ error: "INVALID_TURNO" }, { status: 400 });
    }

    const localTipo = body && "local_tipo" in body ? parseLocalTipo(body?.local_tipo) : undefined;
    if (body && "local_tipo" in body && !localTipo) {
      return NextResponse.json({ error: "INVALID_LOCAL_TIPO" }, { status: 400 });
    }

    const horaEntrada =
      body && "hora_entrada_prevista" in body
        ? parseTimeHHMM(body?.hora_entrada_prevista)
        : undefined;
    const horaSaida =
      body && "hora_saida_prevista" in body
        ? parseTimeHHMM(body?.hora_saida_prevista)
        : undefined;

    if (body && "hora_entrada_prevista" in body && body.hora_entrada_prevista && !horaEntrada) {
      return NextResponse.json({ error: "INVALID_HORA_ENTRADA" }, { status: 400 });
    }
    if (body && "hora_saida_prevista" in body && body.hora_saida_prevista && !horaSaida) {
      return NextResponse.json({ error: "INVALID_HORA_SAIDA" }, { status: 400 });
    }

    const status = body && "status" in body ? String(body?.status ?? "").trim().toUpperCase() : undefined;
    if (status !== undefined && status !== "ATIVO" && status !== "INATIVO") {
      return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    }

    if (
      nome === undefined &&
      turno === undefined &&
      localTipo === undefined &&
      horaEntrada === undefined &&
      horaSaida === undefined &&
      status === undefined &&
      !(body && "hora_entrada_prevista" in body && body.hora_entrada_prevista === null) &&
      !(body && "hora_saida_prevista" in body && body.hora_saida_prevista === null)
    ) {
      return NextResponse.json({ error: "EMPTY_UPDATE" }, { status: 400 });
    }

    const sql = getSql();
    const isAdmin = isAdminSession(auth.session);
    const allowedRows = isAdmin
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

    if (!allowedRows[0]) {
      return NextResponse.json({ error: "FUNCIONARIO_FORBIDDEN" }, { status: 403 });
    }

    const clearHoraEntrada = body && "hora_entrada_prevista" in body && body.hora_entrada_prevista === null;
    const clearHoraSaida = body && "hora_saida_prevista" in body && body.hora_saida_prevista === null;

    const updated = await (sql<{
      id: number;
      nome: string;
      turno: number;
      local_tipo: LocalTipo;
      unidade_id: number;
      status: string;
      hora_entrada_prevista: string | null;
      hora_saida_prevista: string | null;
    }[]>`
      UPDATE funcionario
      SET
        nome = COALESCE(${nome ?? null}, nome),
        turno = COALESCE(${turno ?? null}, turno),
        local_tipo = COALESCE(${localTipo ?? null}::local_tipo, local_tipo),
        hora_entrada_prevista = CASE
          WHEN ${clearHoraEntrada} THEN ${`${DEFAULT_HORA_ENTRADA}:00`}::time
          ELSE COALESCE(${horaEntrada ? `${horaEntrada}:00` : null}::time, hora_entrada_prevista)
        END,
        hora_saida_prevista = CASE
          WHEN ${clearHoraSaida} THEN ${`${DEFAULT_HORA_SAIDA}:00`}::time
          ELSE COALESCE(${horaSaida ? `${horaSaida}:00` : null}::time, hora_saida_prevista)
        END,
        status = COALESCE(${status ?? null}, status)
      WHERE id = ${funcionarioId}
      RETURNING
        id,
        nome,
        turno,
        local_tipo::text as local_tipo,
        unidade_id,
        status,
        TO_CHAR(hora_entrada_prevista, 'HH24:MI') as hora_entrada_prevista,
        TO_CHAR(hora_saida_prevista, 'HH24:MI') as hora_saida_prevista
    ` as unknown as Promise<{
      id: number;
      nome: string;
      turno: number;
      local_tipo: LocalTipo;
      unidade_id: number;
      status: string;
      hora_entrada_prevista: string | null;
      hora_saida_prevista: string | null;
    }[]>);

    return NextResponse.json({ funcionario: updated[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details = process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][PATCH]", { code, message });
    return NextResponse.json({ error: "DB_ERROR", ...(details ?? {}) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "FORBIDDEN_ADMIN_ONLY" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const funcionarioId = parsePositiveInt(searchParams.get("id"));
    const purge = searchParams.get("purge") === "1";
    if (!funcionarioId) {
      return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
    }

    const sql = getSql();
    if (purge) {
      return await sql.begin(async (tx: any) => {
        const deletedPontos = await (tx<{ id: number }[]>`
          DELETE FROM ponto
          WHERE funcionario_id = ${funcionarioId}
          RETURNING id
        ` as unknown as Promise<{ id: number }[]>);

        const deleted = await (tx<
          {
            id: number;
            nome: string;
          }[]
        >`
          DELETE FROM funcionario
          WHERE id = ${funcionarioId}
          RETURNING id, nome
        ` as unknown as Promise<
          {
            id: number;
            nome: string;
          }[]
        >);

        if (!deleted[0]) {
          return NextResponse.json({ error: "FUNCIONARIO_NOT_FOUND" }, { status: 404 });
        }

        return NextResponse.json({
          ok: true,
          purge: true,
          deleted: deleted[0],
          deleted_pontos: deletedPontos.length
        });
      });
    }

    const deleted = await (sql<
      {
        id: number;
        nome: string;
      }[]
    >`
      DELETE FROM funcionario
      WHERE id = ${funcionarioId}
      RETURNING id, nome
    ` as unknown as Promise<
      {
        id: number;
        nome: string;
      }[]
    >);

    if (!deleted[0]) {
      return NextResponse.json({ error: "FUNCIONARIO_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: deleted[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details = process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][DELETE]", { code, message });

    if (code === "23503") {
      return NextResponse.json({ error: "FUNCIONARIO_HAS_PONTO", ...(details ?? {}) }, { status: 409 });
    }

    return NextResponse.json({ error: "DB_ERROR", ...(details ?? {}) }, { status: 500 });
  }
}
