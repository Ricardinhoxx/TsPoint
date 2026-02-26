import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { logSecurityEvent } from "@/lib/securityAudit";

function authSecretKey() {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

function isSuspiciousProbePath(pathname: string): boolean {
  return (
    pathname === "/.env" ||
    pathname.startsWith("/.git/") ||
    pathname.startsWith("/wp-admin") ||
    pathname.startsWith("/phpmyadmin") ||
    pathname === "/server-status"
  );
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isSuspiciousProbePath(pathname)) {
    logSecurityEvent({
      category: "SCANNER_PROBE_PATH",
      outcome: "blocked",
      reason: "KNOWN_PROBE_PATH",
      severity: "high",
      status: 404,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      method: req.method,
      path: pathname,
      userAgent: req.headers.get("user-agent")?.slice(0, 180) || undefined
    });
    return new NextResponse("Not Found", { status: 404 });
  }

  if (pathname.startsWith("/unidade")) {
    const token = req.cookies.get("session")?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    const key = authSecretKey();
    if (!key) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      const res = NextResponse.redirect(url);
      res.cookies.delete("session");
      return res;
    }

    try {
      await jwtVerify(token, key);
    } catch {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      const res = NextResponse.redirect(url);
      res.cookies.delete("session");
      return res;
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/unidade/:path*",
    "/.env",
    "/.git/:path*",
    "/wp-admin/:path*",
    "/phpmyadmin/:path*",
    "/server-status"
  ]
};
