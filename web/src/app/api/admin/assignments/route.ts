import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

type Role = "ADMIN" | "SUPERVISOR";

type SupervisorRow = {
  id: number;
  email: string;
  role: string;
  unidade_id: number;
};

type FuncionarioRow = {
  id: number;
  nome: string;
  unidade_id: number;
  status: string;
};

function normalizeRole(raw: unknown): Role | null {
  const role = String(raw ?? "").trim().toUpperCase();
  if (role === "ADMIN" || role === "SUPERVISOR") return role;
  return null;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const funcionarioSearch = String(searchParams.get("funcionario_search") ?? "").trim();
  const unidadeId = parsePositiveInt(searchParams.get("unidade_id"));
  const page = parsePositiveInt(searchParams.get("page")) ?? 1;
  const pageSize = Math.min(parsePositiveInt(searchParams.get("page_size")) ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const sql = getSql();

  const [unidades, supervisors, totalRows, funcionarios] = await Promise.all([
    sql<{ id: number; nome: string }[]>`
      SELECT id, nome FROM unidade ORDER BY nome ASC
    ` as unknown as Promise<{ id: number; nome: string }[]>,

    unidadeId
      ? (sql<SupervisorRow[]>`
          SELECT id, email, role, unidade_id
          FROM supervisor
          WHERE unidade_id = ${unidadeId}
          ORDER BY email ASC
        ` as unknown as Promise<SupervisorRow[]>)
      : (sql<SupervisorRow[]>`
          SELECT id, email, role, unidade_id
          FROM supervisor
          ORDER BY email ASC
        ` as unknown as Promise<SupervisorRow[]>),

    unidadeId
      ? funcionarioSearch
        ? (sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total
            FROM funcionario
            WHERE unidade_id = ${unidadeId}
              AND nome ILIKE ${`%${funcionarioSearch}%`}
          ` as unknown as Promise<{ total: number }[]>)
        : (sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total
            FROM funcionario
            WHERE unidade_id = ${unidadeId}
          ` as unknown as Promise<{ total: number }[]>)
      : funcionarioSearch
        ? (sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total
            FROM funcionario
            WHERE nome ILIKE ${`%${funcionarioSearch}%`}
          ` as unknown as Promise<{ total: number }[]>)
        : (sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total
            FROM funcionario
          ` as unknown as Promise<{ total: number }[]>),

    unidadeId
      ? funcionarioSearch
        ? (sql<FuncionarioRow[]>`
            SELECT id, nome, unidade_id, status
            FROM funcionario
            WHERE unidade_id = ${unidadeId}
              AND nome ILIKE ${`%${funcionarioSearch}%`}
            ORDER BY nome ASC
            LIMIT ${pageSize} OFFSET ${offset}
          ` as unknown as Promise<FuncionarioRow[]>)
        : (sql<FuncionarioRow[]>`
            SELECT id, nome, unidade_id, status
            FROM funcionario
            WHERE unidade_id = ${unidadeId}
            ORDER BY nome ASC
            LIMIT ${pageSize} OFFSET ${offset}
          ` as unknown as Promise<FuncionarioRow[]>)
      : funcionarioSearch
        ? (sql<FuncionarioRow[]>`
            SELECT id, nome, unidade_id, status
            FROM funcionario
            WHERE nome ILIKE ${`%${funcionarioSearch}%`}
            ORDER BY nome ASC
            LIMIT ${pageSize} OFFSET ${offset}
          ` as unknown as Promise<FuncionarioRow[]>)
        : (sql<FuncionarioRow[]>`
            SELECT id, nome, unidade_id, status
            FROM funcionario
            ORDER BY nome ASC
            LIMIT ${pageSize} OFFSET ${offset}
          ` as unknown as Promise<FuncionarioRow[]>)
  ]);

  const total = totalRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    ok: true,
    unidades,
    supervisors,
    funcionarios,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages
    }
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        entity_type?: "SUPERVISOR" | "FUNCIONARIO";
        id?: number;
        unidade_id?: number;
        role?: string;
      }
    | null;

  const entityType = String(body?.entity_type ?? "").toUpperCase();
  const id = parsePositiveInt(body?.id);
  const unidadeId = parsePositiveInt(body?.unidade_id);
  if (!id || !unidadeId) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const sql = getSql();
  const unidadeOk = await (sql<{ id: number }[]>`
    SELECT id FROM unidade WHERE id = ${unidadeId} LIMIT 1
  ` as unknown as Promise<{ id: number }[]>);
  if (!unidadeOk[0]) {
    return NextResponse.json({ error: "UNIDADE_NOT_FOUND" }, { status: 404 });
  }

  try {
    return await sql.begin(async (tx: any) => {
      if (entityType === "FUNCIONARIO") {
        const before = await (tx<{ id: number; unidade_id: number }[]>`
          SELECT id, unidade_id FROM funcionario WHERE id = ${id} LIMIT 1
        ` as unknown as Promise<{ id: number; unidade_id: number }[]>);
        const current = before[0];
        if (!current) {
          return NextResponse.json({ error: "FUNCIONARIO_NOT_FOUND" }, { status: 404 });
        }

        const updated = await (tx<{ id: number; unidade_id: number }[]>`
          UPDATE funcionario
          SET unidade_id = ${unidadeId}
          WHERE id = ${id}
          RETURNING id, unidade_id
        ` as unknown as Promise<{ id: number; unidade_id: number }[]>);

        await (tx`
          INSERT INTO admin_assignment_audit (
            actor_supervisor_id,
            entity_type,
            entity_id,
            old_unidade_id,
            new_unidade_id,
            old_role,
            new_role
          ) VALUES (
            ${auth.session.supervisor.id},
            'FUNCIONARIO',
            ${id},
            ${current.unidade_id},
            ${unidadeId},
            ${null},
            ${null}
          )
        ` as unknown as Promise<unknown>);

        return NextResponse.json({ ok: true, entity_type: "FUNCIONARIO", item: updated[0] });
      }

      if (entityType === "SUPERVISOR") {
        const role = normalizeRole(body?.role);
        if (!role) {
          return NextResponse.json({ error: "INVALID_ROLE" }, { status: 400 });
        }

        const before = await (tx<{ id: number; unidade_id: number; role: string }[]>`
          SELECT id, unidade_id, role FROM supervisor WHERE id = ${id} LIMIT 1
        ` as unknown as Promise<{ id: number; unidade_id: number; role: string }[]>);
        const current = before[0];
        if (!current) {
          return NextResponse.json({ error: "SUPERVISOR_NOT_FOUND" }, { status: 404 });
        }

        const updated = await (tx<{ id: number; unidade_id: number; role: string }[]>`
          UPDATE supervisor
          SET unidade_id = ${unidadeId}, role = ${role}
          WHERE id = ${id}
          RETURNING id, unidade_id, role
        ` as unknown as Promise<{ id: number; unidade_id: number; role: string }[]>);

        await (tx`
          INSERT INTO admin_assignment_audit (
            actor_supervisor_id,
            entity_type,
            entity_id,
            old_unidade_id,
            new_unidade_id,
            old_role,
            new_role
          ) VALUES (
            ${auth.session.supervisor.id},
            'SUPERVISOR',
            ${id},
            ${current.unidade_id},
            ${unidadeId},
            ${String(current.role).toUpperCase()},
            ${role}
          )
        ` as unknown as Promise<unknown>);

        return NextResponse.json({ ok: true, entity_type: "SUPERVISOR", item: updated[0] });
      }

      return NextResponse.json({ error: "INVALID_ENTITY_TYPE" }, { status: 400 });
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01") {
      return NextResponse.json({ error: "AUDIT_TABLE_MISSING" }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
