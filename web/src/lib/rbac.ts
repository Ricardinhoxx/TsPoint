import { getSession, type Session } from "@/lib/auth";

export type AppRole = "ADMIN" | "SUPERVISOR";

export function normalizeRole(role: string | null | undefined): AppRole {
  return String(role ?? "").trim().toUpperCase() === "ADMIN" ? "ADMIN" : "SUPERVISOR";
}

export function isAdminSession(session: Session): boolean {
  return normalizeRole(session.supervisor.role) === "ADMIN";
}

export function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "UNAUTHENTICATED" };
  return { ok: true as const, session, role: normalizeRole(session.supervisor.role) };
}

// Backward-compatible alias
export const requireSupervisor = requireAuth;
