import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSql } from "@/lib/db";
import { isAdminSession, parsePositiveInt, requireAuth } from "@/lib/rbac";
import { hashTabletToken } from "@/lib/tabletAuth";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

function maskToken(token: string): string {
  const suffix = token.slice(-6);
  return `...${suffix}`;
}

function parseOptionalIsoDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!isAdminSession(auth.session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const unidadeId = parsePositiveInt(searchParams.get("unidade_id"));
  const sql = getSql();

  const rows = unidadeId
    ? await (sql<
        {
          id: number;
          unidade_id: number;
          unidade_nome: string;
          nome_dispositivo: string;
          token_hint: string;
          ativo: boolean;
          expires_at: string | null;
          last_used_at: string | null;
          created_at: string;
        }[]
      >`
        SELECT
          ta.id,
          ta.unidade_id,
          u.nome AS unidade_nome,
          ta.nome_dispositivo,
          ta.token_hint,
          ta.ativo,
          ta.expires_at,
          ta.last_used_at,
          ta.created_at
        FROM tablet_access ta
        JOIN unidade u ON u.id = ta.unidade_id
        WHERE ta.unidade_id = ${unidadeId}
        ORDER BY ta.created_at DESC
      ` as unknown as Promise<
        {
          id: number;
          unidade_id: number;
          unidade_nome: string;
          nome_dispositivo: string;
          token_hint: string;
          ativo: boolean;
          expires_at: string | null;
          last_used_at: string | null;
          created_at: string;
        }[]
      >)
    : await (sql<
        {
          id: number;
          unidade_id: number;
          unidade_nome: string;
          nome_dispositivo: string;
          token_hint: string;
          ativo: boolean;
          expires_at: string | null;
          last_used_at: string | null;
          created_at: string;
        }[]
      >`
        SELECT
          ta.id,
          ta.unidade_id,
          u.nome AS unidade_nome,
          ta.nome_dispositivo,
          ta.token_hint,
          ta.ativo,
          ta.expires_at,
          ta.last_used_at,
          ta.created_at
        FROM tablet_access ta
        JOIN unidade u ON u.id = ta.unidade_id
        ORDER BY ta.created_at DESC
      ` as unknown as Promise<
        {
          id: number;
          unidade_id: number;
          unidade_nome: string;
          nome_dispositivo: string;
          token_hint: string;
          ativo: boolean;
          expires_at: string | null;
          last_used_at: string | null;
          created_at: string;
        }[]
      >);

  return NextResponse.json({ ok: true, tablet_access: rows });
}

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!isAdminSession(auth.session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { unidade_id?: number; nome_dispositivo?: string; expires_at?: string | null }
    | null;

  const unidadeId = parsePositiveInt(body?.unidade_id);
  if (!unidadeId) return NextResponse.json({ error: "INVALID_UNIDADE" }, { status: 400 });

  const nomeDispositivo = String(body?.nome_dispositivo ?? "Tablet").trim() || "Tablet";
  const expiresAt = parseOptionalIsoDate(body?.expires_at);
  if (String(body?.expires_at ?? "").trim() && !expiresAt) {
    return NextResponse.json({ error: "INVALID_EXPIRES_AT" }, { status: 400 });
  }

  const sql = getSql();
  const unidadeRows = await (sql<{ id: number; nome: string }[]>`
    SELECT id, nome FROM unidade WHERE id = ${unidadeId} LIMIT 1
  ` as unknown as Promise<{ id: number; nome: string }[]>);
  const unidade = unidadeRows[0];
  if (!unidade) return NextResponse.json({ error: "UNIDADE_NOT_FOUND" }, { status: 404 });

  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = hashTabletToken(rawToken);
  const tokenHint = maskToken(rawToken);

  const inserted = await (sql<
    {
      id: number;
      unidade_id: number;
      nome_dispositivo: string;
      ativo: boolean;
      expires_at: string | null;
      created_at: string;
    }[]
  >`
    INSERT INTO tablet_access (unidade_id, nome_dispositivo, token_hash, token_hint, ativo, expires_at)
    VALUES (${unidadeId}, ${nomeDispositivo}, ${tokenHash}, ${tokenHint}, TRUE, ${expiresAt ? expiresAt : null})
    RETURNING id, unidade_id, nome_dispositivo, ativo, expires_at, created_at
  ` as unknown as Promise<
    {
      id: number;
      unidade_id: number;
      nome_dispositivo: string;
      ativo: boolean;
      expires_at: string | null;
      created_at: string;
    }[]
  >);

  const origin = new URL(req.url).origin;
  const link = `${origin}/tablet?token=${encodeURIComponent(rawToken)}`;

  return NextResponse.json(
    {
      ok: true,
      unidade: { id: unidade.id, nome: unidade.nome },
      tablet_access: inserted[0],
      token: rawToken,
      link,
    },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!isAdminSession(auth.session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = parsePositiveInt(searchParams.get("id"));
  const hardDelete = String(searchParams.get("hard") ?? "") === "1";
  if (!id) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

  const sql = getSql();
  if (hardDelete) {
    const deleted = await (sql<
      {
        id: number;
        unidade_id: number;
        nome_dispositivo: string;
      }[]
    >`
      DELETE FROM tablet_access
      WHERE id = ${id}
      RETURNING id, unidade_id, nome_dispositivo
    ` as unknown as Promise<
      {
        id: number;
        unidade_id: number;
        nome_dispositivo: string;
      }[]
    >);

    if (!deleted[0]) return NextResponse.json({ error: "TABLET_ACCESS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: deleted[0] });
  }

  const updated = await (sql<
    {
      id: number;
      unidade_id: number;
      nome_dispositivo: string;
      ativo: boolean;
    }[]
  >`
    UPDATE tablet_access
    SET ativo = FALSE
    WHERE id = ${id}
    RETURNING id, unidade_id, nome_dispositivo, ativo
  ` as unknown as Promise<
    {
      id: number;
      unidade_id: number;
      nome_dispositivo: string;
      ativo: boolean;
    }[]
  >);

  if (!updated[0]) return NextResponse.json({ error: "TABLET_ACCESS_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, tablet_access: updated[0] });
}
