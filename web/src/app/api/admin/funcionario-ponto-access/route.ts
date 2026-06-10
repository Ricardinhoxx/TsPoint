import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashFuncionarioPontoToken, maskAccessToken } from "@/lib/funcionarioPontoAccess";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

function parseOptionalIsoDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function requireAdmin() {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: 401 }) };
  if (!isAdminSession(auth.session)) {
    return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  return { ok: true as const, session: auth.session };
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const funcionarioId = parsePositiveInt(searchParams.get("funcionario_id"));
  const sql = getSql();

  const rows = funcionarioId
    ? await (sql`
        SELECT
          fpa.id,
          fpa.funcionario_id,
          f.nome AS funcionario_nome,
          u.nome AS unidade_nome,
          fpa.token_hint,
          fpa.ativo,
          fpa.expires_at,
          fpa.last_used_at,
          fpa.created_at
        FROM funcionario_ponto_access fpa
        JOIN funcionario f ON f.id = fpa.funcionario_id
        JOIN unidade u ON u.id = f.unidade_id
        WHERE fpa.funcionario_id = ${funcionarioId}
        ORDER BY fpa.created_at DESC
      ` as unknown as Promise<unknown[]>)
    : await (sql`
        SELECT
          fpa.id,
          fpa.funcionario_id,
          f.nome AS funcionario_nome,
          u.nome AS unidade_nome,
          fpa.token_hint,
          fpa.ativo,
          fpa.expires_at,
          fpa.last_used_at,
          fpa.created_at
        FROM funcionario_ponto_access fpa
        JOIN funcionario f ON f.id = fpa.funcionario_id
        JOIN unidade u ON u.id = f.unidade_id
        ORDER BY fpa.created_at DESC
      ` as unknown as Promise<unknown[]>);

  return NextResponse.json({ ok: true, accesses: rows });
}

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req, { allowWithoutOrigin: false, auditCategory: "FUNCIONARIO_PONTO_ACCESS_ORIGIN" })) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as
    | { funcionario_id?: number; expires_at?: string | null }
    | null;

  const funcionarioId = parsePositiveInt(body?.funcionario_id);
  if (!funcionarioId) return NextResponse.json({ error: "INVALID_FUNCIONARIO" }, { status: 400 });

  const expiresAt = parseOptionalIsoDate(body?.expires_at);
  if (String(body?.expires_at ?? "").trim() && !expiresAt) {
    return NextResponse.json({ error: "INVALID_EXPIRES_AT" }, { status: 400 });
  }

  const sql = getSql();
  const funcionarioRows = await (sql<{ id: number; nome: string }[]>`
    SELECT id, nome FROM funcionario WHERE id = ${funcionarioId} LIMIT 1
  ` as unknown as Promise<{ id: number; nome: string }[]>);
  const funcionario = funcionarioRows[0];
  if (!funcionario) return NextResponse.json({ error: "FUNCIONARIO_NOT_FOUND" }, { status: 404 });

  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = hashFuncionarioPontoToken(rawToken);
  const tokenHint = maskAccessToken(rawToken);

  const inserted = await (sql`
    INSERT INTO funcionario_ponto_access (
      funcionario_id,
      token_hash,
      token_hint,
      ativo,
      expires_at,
      created_by_supervisor_id
    )
    VALUES (${funcionarioId}, ${tokenHash}, ${tokenHint}, TRUE, ${expiresAt ? expiresAt : null}, ${auth.session.supervisor.id})
    RETURNING id, funcionario_id, token_hint, ativo, expires_at, created_at
  ` as unknown as Promise<unknown[]>);

  const origin = new URL(req.url).origin;
  const link = `${origin}/meu-ponto/${encodeURIComponent(rawToken)}`;

  return NextResponse.json(
    { ok: true, funcionario, access: inserted[0], token: rawToken, link },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  if (!isTrustedMutationRequest(req, { allowWithoutOrigin: false, auditCategory: "FUNCIONARIO_PONTO_ACCESS_ORIGIN" })) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = parsePositiveInt(searchParams.get("id"));
  const hardDelete = String(searchParams.get("hard") ?? "") === "1";
  if (!id) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

  const sql = getSql();
  if (hardDelete) {
    const deleted = await (sql`
      DELETE FROM funcionario_ponto_access WHERE id = ${id} RETURNING id
    ` as unknown as Promise<unknown[]>);
    if (!deleted[0]) return NextResponse.json({ error: "ACCESS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: deleted[0] });
  }

  const updated = await (sql`
    UPDATE funcionario_ponto_access
    SET ativo = FALSE
    WHERE id = ${id}
    RETURNING id, funcionario_id, ativo
  ` as unknown as Promise<unknown[]>);
  if (!updated[0]) return NextResponse.json({ error: "ACCESS_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, access: updated[0] });
}
