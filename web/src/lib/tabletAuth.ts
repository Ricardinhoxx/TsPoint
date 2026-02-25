import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash } from "crypto";

const TABLET_COOKIE_NAME = "tablet_session";
const TABLET_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function secretKey() {
  const secret = requiredEnv("AUTH_SECRET");
  return new TextEncoder().encode(secret);
}

export type TabletSession = {
  tablet: {
    access_id: number;
    unidade_id: number;
    unidade_nome: string;
    nome_dispositivo: string;
  };
};

export function hashTabletToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function setTabletSession(session: TabletSession) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(TABLET_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TABLET_SESSION_MAX_AGE_SECONDS,
    priority: "high"
  });
}

export async function getTabletSession(): Promise<TabletSession | null> {
  const jar = await cookies();
  const token = jar.get(TABLET_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as TabletSession;
  } catch {
    return null;
  }
}

export async function clearTabletSession() {
  const jar = await cookies();
  jar.set(TABLET_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
