import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { clearTabletSession, hashTabletToken, setTabletSession, type TabletSession } from "@/lib/tabletAuth";
import { getActiveTabletSession } from "@/lib/tabletSessionGuard";
import { isTrustedMutationRequest } from "@/lib/security";

export const runtime = "nodejs";

type TabletAccessRow = {
  id: number;
  unidade_id: number;
  unidade_nome: string;
  nome_dispositivo: string;
  ativo: boolean;
  expires_at: string | null;
};

async function findTabletAccessByRawToken(rawToken: string): Promise<TabletAccessRow | null> {
  const tokenHash = hashTabletToken(rawToken);
  const sql = getSql();
  const rows = await (sql<TabletAccessRow[]>`
    SELECT
      ta.id,
      ta.unidade_id,
      u.nome AS unidade_nome,
      ta.nome_dispositivo,
      ta.ativo,
      ta.expires_at
    FROM tablet_access ta
    JOIN unidade u ON u.id = ta.unidade_id
    WHERE ta.token_hash = ${tokenHash}
    LIMIT 1
  ` as unknown as Promise<TabletAccessRow[]>);
  return rows[0] ?? null;
}

function sessionFromRow(row: TabletAccessRow): TabletSession {
  return {
    tablet: {
      access_id: row.id,
      unidade_id: row.unidade_id,
      unidade_nome: row.unidade_nome,
      nome_dispositivo: row.nome_dispositivo,
    },
  };
}

export async function GET() {
  const session = await getActiveTabletSession();
  if (!session) return NextResponse.json({ ok: false, error: "TABLET_UNAUTHENTICATED" }, { status: 401 });
  return NextResponse.json({ ok: true, tablet: session.tablet });
}

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const rawToken = String(body?.token ?? "").trim();
  if (!rawToken) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });

  const row = await findTabletAccessByRawToken(rawToken);
  if (!row) return NextResponse.json({ error: "TABLET_TOKEN_NOT_FOUND" }, { status: 404 });
  if (!row.ativo) return NextResponse.json({ error: "TABLET_TOKEN_DISABLED" }, { status: 403 });
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "TABLET_TOKEN_EXPIRED" }, { status: 403 });
    }
  }

  const sql = getSql();
  await (sql`
    UPDATE tablet_access
    SET last_used_at = now()
    WHERE id = ${row.id}
  ` as unknown as Promise<unknown>);

  const session = sessionFromRow(row);
  await setTabletSession(session);
  return NextResponse.json({ ok: true, tablet: session.tablet });
}

export async function DELETE(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  await clearTabletSession();
  return NextResponse.json({ ok: true });
}
