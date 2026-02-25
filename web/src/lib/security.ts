function firstHeaderValue(value: string | null): string {
  return String(value ?? "")
    .split(",")[0]
    .trim();
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function requestProto(req: Request): "http" | "https" {
  const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto")).toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") return forwardedProto;
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function collectAllowedHosts(req: Request): Set<string> {
  const hosts = new Set<string>();

  const headerCandidates = [
    firstHeaderValue(req.headers.get("host")),
    firstHeaderValue(req.headers.get("x-forwarded-host")),
    firstHeaderValue(req.headers.get("x-vercel-deployment-url"))
  ];
  for (const host of headerCandidates) {
    if (host) hosts.add(host.toLowerCase());
  }

  const envUrlCandidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  ];
  for (const value of envUrlCandidates) {
    const clean = String(value ?? "").trim();
    if (!clean) continue;
    const parsed = toUrl(clean);
    if (parsed?.host) {
      hosts.add(parsed.host.toLowerCase());
      continue;
    }
    // Allow host-only envs like "my-app.vercel.app"
    hosts.add(clean.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase());
  }

  const vercelUrl = String(process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) hosts.add(vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase());

  return hosts;
}

function isAllowedOrigin(urlRaw: string, allowedHosts: Set<string>, expectedProto: "http" | "https"): boolean {
  const parsed = toUrl(urlRaw);
  if (!parsed) return false;
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") return false;
  if (expectedProto === "https" && protocol !== "https:") return false;
  return allowedHosts.has(parsed.host.toLowerCase());
}

// Allows non-browser clients without Origin/Referer, but blocks cross-site browser requests.
export function isTrustedMutationRequest(req: Request): boolean {
  const allowedHosts = collectAllowedHosts(req);
  if (allowedHosts.size === 0) return false;
  const expectedProto = requestProto(req);

  const origin = firstHeaderValue(req.headers.get("origin"));
  if (origin) return isAllowedOrigin(origin, allowedHosts, expectedProto);

  const referer = firstHeaderValue(req.headers.get("referer"));
  if (referer) return isAllowedOrigin(referer, allowedHosts, expectedProto);

  return true;
}
