import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";

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

    const unidadeId = isAdmin
      ? queryUnidadeId
      : auth.session.supervisor.unidade_id;

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
          }[]
        >`
          SELECT
            f.id,
            f.nome,
            f.turno,
            f.local_tipo::text as local_tipo,
            f.status,
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
          }[]
        >`
          SELECT
            f.id,
            f.nome,
            f.turno,
            f.local_tipo::text as local_tipo,
            f.status,
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
          }[]
        >);

    return NextResponse.json({ funcionarios: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details =
      process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][GET]", { code, message });
    return NextResponse.json(
      { error: "DB_ERROR", ...(details ?? {}) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
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
      }[]
    >`
      INSERT INTO funcionario (nome, turno, local_tipo, unidade_id, status)
      VALUES (${nome}, ${turno}, ${localTipo}::local_tipo, ${unidadeId}, 'ATIVO')
      RETURNING id, nome, turno, local_tipo::text as local_tipo, unidade_id, status
    ` as unknown as Promise<
      {
        id: number;
        nome: string;
        turno: number;
        local_tipo: LocalTipo;
        unidade_id: number;
        status: string;
      }[]
    >);

    return NextResponse.json({ funcionario: inserted[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    const details =
      process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][POST]", { code, message });

    if (code === "23505") {
      return NextResponse.json(
        { error: "DUPLICATE_KEY", ...(details ?? {}) },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "DB_ERROR", ...(details ?? {}) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
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
    if (!funcionarioId) {
      return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });
    }

    const sql = getSql();
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
    const details =
      process.env.NODE_ENV === "production" ? undefined : { code, message };
    console.error("[api/funcionarios][DELETE]", { code, message });

    if (code === "23503") {
      return NextResponse.json(
        { error: "FUNCIONARIO_HAS_PONTO", ...(details ?? {}) },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "DB_ERROR", ...(details ?? {}) },
      { status: 500 }
    );
  }
}
