import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getSql } from "@/lib/db";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = Math.ceil(WINDOW_MS / 1000);
const AZURE_PROVIDER = "AZURE_ENTRA";
const MSFT_OPENID_BASE = "https://login.microsoftonline.com";
const OAUTH_PLACEHOLDER_PASSWORD_PREFIX = "oauth-only:";

type LoginProvider = "LOCAL" | "AZURE_ENTRA" | "SUPABASE_AZURE";

type AttemptStatus = {
  limited: boolean;
  retryAfterSec: number;
};

type SupervisorRow = {
  id: number;
  email: string;
  password_hash: string;
  unidade_id: number;
  role: string;
};

type FallbackAttemptBucket = {
  count: number;
  resetAtEpochMs: number;
};

const fallbackAttempts = new Map<string, FallbackAttemptBucket>();
let fallbackRequestCount = 0;

function cleanupFallbackExpired(nowMs: number) {
  for (const [key, bucket] of fallbackAttempts) {
    if (nowMs >= bucket.resetAtEpochMs) fallbackAttempts.delete(key);
  }
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const xri = req.headers.get("x-real-ip")?.trim();
  return xff || xri || "unknown";
}

function makeKey(req: Request, email: string): string {
  return `${getClientIp(req)}:${email}`;
}

function normalizeProvider(raw: unknown): LoginProvider {
  const provider = String(raw ?? "").trim().toUpperCase();
  if (provider === "SUPABASE" || provider === "SUPABASE_AZURE") {
    return "SUPABASE_AZURE";
  }
  if (provider === "AZURE" || provider === "AZURE_ENTRA" || provider === "MICROSOFT") {
    return "AZURE_ENTRA";
  }
  return "LOCAL";
}

function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function normalizeRole(raw: unknown): "ADMIN" | "SUPERVISOR" {
  const role = String(raw ?? "").trim().toUpperCase();
  return role === "ADMIN" ? "ADMIN" : "SUPERVISOR";
}

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function checkLimitFallback(key: string): AttemptStatus {
  const now = Date.now();
  const bucket = fallbackAttempts.get(key);

  if (!bucket || now >= bucket.resetAtEpochMs) {
    fallbackAttempts.set(key, { count: 0, resetAtEpochMs: now + WINDOW_MS });
    return { limited: false, retryAfterSec: WINDOW_SECONDS };
  }

  return {
    limited: bucket.count >= MAX_ATTEMPTS,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAtEpochMs - now) / 1000))
  };
}

function registerFailureFallback(key: string) {
  const now = Date.now();
  const bucket = fallbackAttempts.get(key);
  if (!bucket || now >= bucket.resetAtEpochMs) {
    fallbackAttempts.set(key, { count: 1, resetAtEpochMs: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  fallbackAttempts.set(key, bucket);
}

function clearAttemptsFallback(key: string) {
  fallbackAttempts.delete(key);
}

function isMissingRateLimitTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42P01";
}

async function checkLimitDb(key: string): Promise<AttemptStatus> {
  const sql = getSql();
  const rows = await (sql<{ count: number; retry_after_sec: number }[]>`
    INSERT INTO auth_login_attempt (attempt_key, count, reset_at)
    VALUES (${key}, 0, now() + make_interval(secs => ${WINDOW_SECONDS}))
    ON CONFLICT (attempt_key) DO UPDATE
    SET
      count = CASE
        WHEN auth_login_attempt.reset_at <= now() THEN 0
        ELSE auth_login_attempt.count
      END,
      reset_at = CASE
        WHEN auth_login_attempt.reset_at <= now() THEN now() + make_interval(secs => ${WINDOW_SECONDS})
        ELSE auth_login_attempt.reset_at
      END
    RETURNING
      count,
      GREATEST(1, EXTRACT(EPOCH FROM (reset_at - now()))::int) AS retry_after_sec
  ` as unknown as Promise<{ count: number; retry_after_sec: number }[]>);

  const row = rows[0];
  const count = row?.count ?? 0;
  const retryAfterSec = row?.retry_after_sec ?? WINDOW_SECONDS;
  return {
    limited: count >= MAX_ATTEMPTS,
    retryAfterSec
  };
}

async function registerFailureDb(key: string): Promise<void> {
  const sql = getSql();
  await (sql`
    INSERT INTO auth_login_attempt (attempt_key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${WINDOW_SECONDS}))
    ON CONFLICT (attempt_key) DO UPDATE
    SET
      count = CASE
        WHEN auth_login_attempt.reset_at <= now() THEN 1
        ELSE auth_login_attempt.count + 1
      END,
      reset_at = CASE
        WHEN auth_login_attempt.reset_at <= now() THEN now() + make_interval(secs => ${WINDOW_SECONDS})
        ELSE auth_login_attempt.reset_at
      END
  ` as unknown as Promise<unknown>);
}

async function clearAttemptsDb(key: string): Promise<void> {
  const sql = getSql();
  await (sql`DELETE FROM auth_login_attempt WHERE attempt_key = ${key}` as unknown as Promise<unknown>);
}

async function checkLimit(key: string): Promise<AttemptStatus> {
  try {
    return await checkLimitDb(key);
  } catch (err) {
    if (!isMissingRateLimitTable(err)) throw err;
    fallbackRequestCount += 1;
    if (fallbackRequestCount % 200 === 0) cleanupFallbackExpired(Date.now());
    return checkLimitFallback(key);
  }
}

async function registerFailure(key: string): Promise<void> {
  try {
    await registerFailureDb(key);
  } catch (err) {
    if (!isMissingRateLimitTable(err)) throw err;
    registerFailureFallback(key);
  }
}

async function clearAttempts(key: string): Promise<void> {
  try {
    await clearAttemptsDb(key);
  } catch (err) {
    if (!isMissingRateLimitTable(err)) throw err;
    clearAttemptsFallback(key);
  }
}

type AzureConfig = {
  tenantId: string;
  audience: string;
};

function getAzureConfig(): AzureConfig | null {
  const tenantId = process.env.AZURE_ENTRA_TENANT_ID?.trim();
  const audience = process.env.AZURE_ENTRA_CLIENT_ID?.trim();
  if (!tenantId || !audience) return null;
  return { tenantId, audience };
}

const azureJwksByTenant = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getAzureJwks(tenantId: string) {
  const cached = azureJwksByTenant.get(tenantId);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(
    new URL(`${MSFT_OPENID_BASE}/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`)
  );
  azureJwksByTenant.set(tenantId, jwks);
  return jwks;
}

function extractAzureEmail(payload: JWTPayload): string {
  const raw = payload.preferred_username ?? payload.email ?? payload.upn ?? "";
  return normalizeEmail(raw);
}

async function resolveAzureIdentity(idToken: string): Promise<string> {
  const cfg = getAzureConfig();
  if (!cfg) {
    const err = new Error("AZURE_NOT_CONFIGURED");
    (err as { status?: number }).status = 501;
    throw err;
  }

  const jwks = getAzureJwks(cfg.tenantId);
  const issuer = `${MSFT_OPENID_BASE}/${cfg.tenantId}/v2.0`;
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: cfg.audience,
    clockTolerance: "5s"
  });

  const email = extractAzureEmail(payload);
  if (!email) throw new Error("INVALID_AZURE_TOKEN");
  return email;
}

type SupabaseConfig = {
  issuer: string;
  audience: string | null;
};

function normalizeSupabaseIssuer(rawUrl: string): string {
  const clean = rawUrl.replace(/\/+$/, "");
  if (clean.endsWith("/auth/v1")) return clean;
  return `${clean}/auth/v1`;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  return {
    issuer: normalizeSupabaseIssuer(supabaseUrl),
    audience: process.env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated"
  };
}

const supabaseJwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getSupabaseJwks(issuer: string) {
  const cached = supabaseJwksByIssuer.get(issuer);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  supabaseJwksByIssuer.set(issuer, jwks);
  return jwks;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSupabaseEmail(payload: JWTPayload): string {
  const direct = typeof payload.email === "string" ? payload.email : "";
  if (direct) return normalizeEmail(direct);
  if (isObjectRecord(payload.user_metadata) && typeof payload.user_metadata.email === "string") {
    return normalizeEmail(payload.user_metadata.email);
  }
  return "";
}

function isAzureSupabaseProvider(payload: JWTPayload): boolean {
  if (!isObjectRecord(payload.app_metadata)) return true;
  const provider = payload.app_metadata.provider;
  if (typeof provider !== "string") return true;
  return provider.toLowerCase() === "azure";
}

async function resolveSupabaseAzureIdentity(accessToken: string): Promise<string> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    const err = new Error("SUPABASE_NOT_CONFIGURED");
    (err as { status?: number }).status = 501;
    throw err;
  }

  const jwks = getSupabaseJwks(cfg.issuer);
  const verifyOptions = cfg.audience
    ? { issuer: cfg.issuer, audience: cfg.audience, clockTolerance: "5s" as const }
    : { issuer: cfg.issuer, clockTolerance: "5s" as const };
  const { payload } = await jwtVerify(accessToken, jwks, verifyOptions);

  if (!isAzureSupabaseProvider(payload)) throw new Error("INVALID_SUPABASE_PROVIDER");

  const email = extractSupabaseEmail(payload);
  if (!email) throw new Error("INVALID_SUPABASE_TOKEN");
  return email;
}

async function resolveDefaultUnidadeId(sql: ReturnType<typeof getSql>): Promise<number | null> {
  const envUnidadeId = parsePositiveInt(process.env.OAUTH_AUTO_PROVISION_UNIDADE_ID);
  if (envUnidadeId) {
    const explicitRows = await (sql<{ id: number }[]>`
      SELECT id FROM unidade WHERE id = ${envUnidadeId} LIMIT 1
    ` as unknown as Promise<{ id: number }[]>);
    return explicitRows[0]?.id ?? null;
  }

  const firstRows = await (sql<{ id: number }[]>`
    SELECT id FROM unidade ORDER BY id ASC LIMIT 1
  ` as unknown as Promise<{ id: number }[]>);
  return firstRows[0]?.id ?? null;
}

function isAllowedEmailForAutoProvision(email: string): boolean {
  const allowedDomain = process.env.OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN?.trim().toLowerCase();
  if (!allowedDomain) return true;
  const normalizedDomain = allowedDomain.startsWith("@") ? allowedDomain : `@${allowedDomain}`;
  return email.endsWith(normalizedDomain);
}

async function createOAuthSupervisor(sql: ReturnType<typeof getSql>, email: string): Promise<SupervisorRow | null> {
  if (!isAllowedEmailForAutoProvision(email)) return null;

  const unidadeId = await resolveDefaultUnidadeId(sql);
  if (!unidadeId) return null;

  const role = normalizeRole(process.env.OAUTH_AUTO_PROVISION_ROLE);
  const placeholderPassword = `${OAUTH_PLACEHOLDER_PASSWORD_PREFIX}${randomUUID()}`;
  const passwordHash = await bcrypt.hash(placeholderPassword, 10);

  try {
    const inserted = await (sql<SupervisorRow[]>`
      INSERT INTO supervisor (email, password_hash, unidade_id, role)
      VALUES (${email}, ${passwordHash}, ${unidadeId}, ${role})
      RETURNING id, email, password_hash, unidade_id, role
    ` as unknown as Promise<SupervisorRow[]>);
    return inserted[0] ?? null;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "23505") throw err;

    const existing = await (sql<SupervisorRow[]>`
      SELECT id, email, password_hash, unidade_id, role
      FROM supervisor
      WHERE email = ${email}
      LIMIT 1
    ` as unknown as Promise<SupervisorRow[]>);
    return existing[0] ?? null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { provider?: string; email?: string; password?: string; id_token?: string; access_token?: string }
    | null;

  const provider = normalizeProvider(body?.provider);
  const password = String(body?.password ?? "");
  const idToken = String(body?.id_token ?? "");
  const accessToken = String(body?.access_token ?? "");
  let email = normalizeEmail(body?.email);

  if (provider === "LOCAL" && (!email || !password)) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
  }
  if (provider === AZURE_PROVIDER && !idToken) {
    return NextResponse.json({ error: "MISSING_AZURE_TOKEN" }, { status: 400 });
  }
  if (provider === "SUPABASE_AZURE" && !accessToken) {
    return NextResponse.json({ error: "MISSING_SUPABASE_TOKEN" }, { status: 400 });
  }

  const tentativeIdentity =
    provider === AZURE_PROVIDER
      ? email || "azure_token"
      : provider === "SUPABASE_AZURE"
        ? email || "supabase_token"
        : email;
  const key = makeKey(req, tentativeIdentity);
  const limit = await checkLimit(key);
  if (limit.limited) {
    return NextResponse.json(
      { error: "TOO_MANY_ATTEMPTS", retry_after_sec: limit.retryAfterSec },
      {
        status: 429,
        headers: {
          "retry-after": String(limit.retryAfterSec)
        }
      }
    );
  }

  if (provider === AZURE_PROVIDER) {
    try {
      email = await resolveAzureIdentity(idToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AZURE_AUTH_FAILED";
      const status = (err as { status?: number } | null)?.status;
      if (status === 501) {
        return NextResponse.json({ error: "AZURE_NOT_CONFIGURED" }, { status: 501 });
      }
      await registerFailure(key);
      console.error("[api/auth/login][AZURE]", message);
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
  }
  if (provider === "SUPABASE_AZURE") {
    try {
      email = await resolveSupabaseAzureIdentity(accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "SUPABASE_AUTH_FAILED";
      const status = (err as { status?: number } | null)?.status;
      if (status === 501) {
        return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 501 });
      }
      await registerFailure(key);
      console.error("[api/auth/login][SUPABASE_AZURE]", message);
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
  }

  const sql = getSql();

  const rows = await (sql<SupervisorRow[]>`
    SELECT id, email, password_hash, unidade_id, role
    FROM supervisor
    WHERE email = ${email}
    LIMIT 1
  ` as unknown as Promise<SupervisorRow[]>);

  let supervisor: SupervisorRow | null = rows[0] ?? null;
  if (!supervisor) {
    const canAutoProvision = provider !== "LOCAL";
    if (!canAutoProvision) {
      await registerFailure(key);
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    supervisor = await createOAuthSupervisor(sql, email);
    if (!supervisor) {
      await registerFailure(key);
      return NextResponse.json({ error: "AUTO_PROVISION_FAILED" }, { status: 403 });
    }
  }

  if (!supervisor) {
    await registerFailure(key);
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (provider === "LOCAL") {
    const ok = await bcrypt.compare(password, supervisor.password_hash);
    if (!ok) {
      await registerFailure(key);
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
  }

  await clearAttempts(key);

  await setSession({
    supervisor: {
      id: supervisor.id,
      email: supervisor.email,
      unidade_id: supervisor.unidade_id,
      role: supervisor.role
    }
  });

  return NextResponse.json({
    provider,
    supervisor: {
      id: supervisor.id,
      email: supervisor.email,
      unidade_id: supervisor.unidade_id,
      role: supervisor.role
    }
  });
}
