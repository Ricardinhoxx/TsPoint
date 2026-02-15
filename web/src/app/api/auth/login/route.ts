import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type AttemptBucket = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptBucket>();
let requestCount = 0;

function cleanupExpired(now: number) {
  for (const [key, bucket] of attempts) {
    if (now >= bucket.resetAt) attempts.delete(key);
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

function checkLimit(key: string): { limited: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = attempts.get(key);

  if (!bucket || now >= bucket.resetAt) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfterSec: Math.ceil(WINDOW_MS / 1000) };
  }

  return {
    limited: bucket.count >= MAX_ATTEMPTS,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

function registerFailure(key: string) {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || now >= bucket.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  attempts.set(key, bucket);
}

function clearAttempts(key: string) {
  attempts.delete(key);
}

export async function POST(req: Request) {
  requestCount += 1;
  if (requestCount % 200 === 0) cleanupExpired(Date.now());

  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;

  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
  }

  const key = makeKey(req, email);
  const limit = checkLimit(key);
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

  const sql = getSql();

  const rows = await (sql<{
    id: number;
    email: string;
    password_hash: string;
    unidade_id: number;
    role: string;
  }[]>`SELECT id, email, password_hash, unidade_id, role FROM supervisor WHERE email = ${email} LIMIT 1` as unknown as Promise<
    {
      id: number;
      email: string;
      password_hash: string;
      unidade_id: number;
      role: string;
    }[]
  >);

  const supervisor = rows[0];
  if (!supervisor) {
    registerFailure(key);
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, supervisor.password_hash);
  if (!ok) {
    registerFailure(key);
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  clearAttempts(key);

  await setSession({
    supervisor: {
      id: supervisor.id,
      email: supervisor.email,
      unidade_id: supervisor.unidade_id,
      role: supervisor.role
    }
  });

  return NextResponse.json({
    supervisor: {
      id: supervisor.id,
      email: supervisor.email,
      unidade_id: supervisor.unidade_id,
      role: supervisor.role
    }
  });
}
