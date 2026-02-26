import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

type DiaristaTipo = "SUBSTITUICAO" | "DEMANDA";

function parseDiaristaTipo(raw: unknown): DiaristaTipo | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "SUBSTITUICAO" || v === "DEMANDA") return v;
  return null;
}

function parseDateOnly(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const v = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        nome_diarista?: string;
        tipo?: DiaristaTipo;
        funcionario_substituido_id?: number | string | null;
        data_ref?: string;
        observacao?: string | null;
        unidade_id?: number | string;
      }
    | null;

  const nome = String(body?.nome_diarista ?? "").trim();
  if (nome.length < 2) {
    return NextResponse.json({ error: "INVALID_NOME_DIARISTA" }, { status: 400 });
  }

  const tipo = parseDiaristaTipo(body?.tipo);
  if (!tipo) {
    return NextResponse.json({ error: "INVALID_TIPO" }, { status: 400 });
  }

  const dataRef = parseDateOnly(body?.data_ref) ?? new Date().toISOString().slice(0, 10);
  const observacao = String(body?.observacao ?? "").trim() || null;

  const isAdmin = isAdminSession(auth.session);
  const unidadeId = isAdmin
    ? parsePositiveInt(body?.unidade_id) ?? auth.session.supervisor.unidade_id
    : auth.session.supervisor.unidade_id;

  if (!unidadeId) {
    return NextResponse.json({ error: "INVALID_UNIDADE" }, { status: 400 });
  }

  const funcionarioSubstituidoId =
    body && "funcionario_substituido_id" in body
      ? parsePositiveInt(body?.funcionario_substituido_id)
      : null;

  if (tipo === "SUBSTITUICAO" && !funcionarioSubstituidoId) {
    return NextResponse.json({ error: "INVALID_SUBSTITUIDO" }, { status: 400 });
  }

  if (tipo === "DEMANDA" && funcionarioSubstituidoId) {
    return NextResponse.json({ error: "SUBSTITUIDO_NOT_ALLOWED" }, { status: 400 });
  }

  const sql = getSql();

  try {
    const unidadeOk = await (sql<{ id: number }[]>`
      SELECT id FROM unidade WHERE id = ${unidadeId} LIMIT 1
    ` as unknown as Promise<{ id: number }[]>);
    if (!unidadeOk[0]) {
      return NextResponse.json({ error: "UNIDADE_NOT_FOUND" }, { status: 404 });
    }

    if (funcionarioSubstituidoId) {
      const sub = await (sql<{ id: number }[]>`
        SELECT id
        FROM funcionario
        WHERE id = ${funcionarioSubstituidoId}
          AND unidade_id = ${unidadeId}
        LIMIT 1
      ` as unknown as Promise<{ id: number }[]>);
      if (!sub[0]) {
        return NextResponse.json({ error: "FUNCIONARIO_SUBSTITUIDO_INVALIDO" }, { status: 400 });
      }
    }

    const inserted = await (sql<{
      id: number;
      unidade_id: number;
      data_ref: string;
      nome_diarista: string;
      tipo: DiaristaTipo;
      funcionario_substituido_id: number | null;
      observacao: string | null;
      created_at: string;
    }[]>`
      INSERT INTO diarista_presenca (
        unidade_id,
        data_ref,
        nome_diarista,
        tipo,
        funcionario_substituido_id,
        observacao,
        operador_id
      )
      VALUES (
        ${unidadeId},
        ${dataRef}::date,
        ${nome},
        ${tipo}::diarista_tipo,
        ${funcionarioSubstituidoId ?? null},
        ${observacao},
        ${auth.session.supervisor.id}
      )
      RETURNING
        id,
        unidade_id,
        data_ref::text as data_ref,
        nome_diarista,
        tipo::text as tipo,
        funcionario_substituido_id,
        observacao,
        created_at::timestamptz::text as created_at
    ` as unknown as Promise<{
      id: number;
      unidade_id: number;
      data_ref: string;
      nome_diarista: string;
      tipo: DiaristaTipo;
      funcionario_substituido_id: number | null;
      observacao: string | null;
      created_at: string;
    }[]>);

    return NextResponse.json({ diarista: inserted[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    console.error("[api/diaristas/presenca][POST] DIARISTA_WRITE_FAILED", msg);
    return NextResponse.json({ error: "DIARISTA_WRITE_FAILED" }, { status: 500 });
  }
}
