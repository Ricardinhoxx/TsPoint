import { getSql } from "@/lib/db";
import { clearTabletSession, getTabletSession, type TabletSession } from "@/lib/tabletAuth";

type TabletAccessState = {
  id: number;
  unidade_id: number;
  ativo: boolean;
  expires_at: string | null;
};

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const parsed = new Date(expiresAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

export async function getActiveTabletSession(): Promise<TabletSession | null> {
  const session = await getTabletSession();
  if (!session) return null;

  const accessId = Number(session.tablet?.access_id);
  if (!Number.isFinite(accessId) || accessId <= 0) {
    await clearTabletSession();
    return null;
  }

  const sql = getSql();
  const rows = await (sql<TabletAccessState[]>`
    SELECT id, unidade_id, ativo, expires_at
    FROM tablet_access
    WHERE id = ${accessId}
    LIMIT 1
  ` as unknown as Promise<TabletAccessState[]>);
  const access = rows[0];

  if (!access || !access.ativo || isExpired(access.expires_at)) {
    await clearTabletSession();
    return null;
  }

  if (access.unidade_id !== session.tablet.unidade_id) {
    await clearTabletSession();
    return null;
  }

  return session;
}
