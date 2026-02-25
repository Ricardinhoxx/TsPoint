function firstHeaderValue(value: string | null): string {
  return String(value ?? "")
    .split(",")[0]
    .trim();
}

function requestHost(req: Request): string {
  const forwardedHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
  if (forwardedHost) return forwardedHost;
  return firstHeaderValue(req.headers.get("host"));
}

function requestProto(req: Request): string {
  const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto")).toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") return forwardedProto;
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function requestOrigin(req: Request): string | null {
  const host = requestHost(req);
  if (!host) return null;
  return `${requestProto(req)}://${host}`;
}

function sameOrigin(urlRaw: string, expectedOrigin: string): boolean {
  try {
    const parsed = new URL(urlRaw);
    return parsed.origin === expectedOrigin;
  } catch {
    return false;
  }
}

// Allows non-browser clients without Origin/Referer, but blocks cross-site browser requests.
export function isTrustedMutationRequest(req: Request): boolean {
  const expectedOrigin = requestOrigin(req);
  if (!expectedOrigin) return false;

  const origin = firstHeaderValue(req.headers.get("origin"));
  if (origin) return sameOrigin(origin, expectedOrigin);

  const referer = firstHeaderValue(req.headers.get("referer"));
  if (referer) return sameOrigin(referer, expectedOrigin);

  return true;
}
