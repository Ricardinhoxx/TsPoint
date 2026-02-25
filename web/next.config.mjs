function normalizeOrigin(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildCsp() {
  const isProd = process.env.NODE_ENV === "production";
  const supabaseOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const faceApiOrigin = normalizeOrigin(process.env.FACE_API_URL);

  const connectSrc = [
    "'self'",
    supabaseOrigin,
    faceApiOrigin,
    "https://login.microsoftonline.com"
  ].filter(Boolean);

  const scriptSrc = isProd ? ["'self'"] : ["'self'", "'unsafe-eval'"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // OneDrive on Windows can throw EINVAL on readlink while Next cleans `.next`.
  // Keep previous artifacts to avoid startup crashes in dev/build clean phases.
  cleanDistDir: false,
  webpack: (config, { dev }) => {
    // OneDrive/AV can interfere with filesystem cache under `.next/cache`,
    // causing random ENOENT/EINVAL errors on Windows. Disable cache in dev.
    if (dev) config.cache = false;
    return config;
  },
  async headers() {
    const csp = buildCsp();
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }
        ]
      }
    ];
  }
};

export default nextConfig;
