import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/unidade")) {
    const hasSession = Boolean(req.cookies.get("session")?.value);
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/unidade/:path*"]
};

