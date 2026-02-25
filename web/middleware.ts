import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

function authSecretKey() {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
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
  matcher: ["/unidade/:path*"]
};
