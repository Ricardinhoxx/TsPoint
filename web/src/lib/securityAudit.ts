type SecuritySeverity = "low" | "medium" | "high";

type SecurityEvent = {
  category: string;
  outcome: "allowed" | "blocked" | "failed" | "alert";
  reason: string;
  severity?: SecuritySeverity;
  status?: number;
  ip?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  subject?: string;
};

type SecuritySignalInput = Omit<SecurityEvent, "ip" | "method" | "path" | "userAgent">;

type BurstBucket = {
  count: number;
  resetAtEpochMs: number;
  alerted: boolean;
};

const burstBuckets = new Map<string, BurstBucket>();
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = 12;

function firstHeaderValue(value: string | null): string {
  return String(value ?? "")
    .split(",")[0]
    .trim();
}

export function getClientIp(req: Request): string {
  const xff = firstHeaderValue(req.headers.get("x-forwarded-for"));
  const xri = firstHeaderValue(req.headers.get("x-real-ip"));
  return xff || xri || "unknown";
}

function getUserAgent(req: Request): string {
  return firstHeaderValue(req.headers.get("user-agent")).slice(0, 180);
}

function recordBurst(event: SecurityEvent) {
  if (event.outcome === "allowed") return;
  const ip = event.ip ?? "unknown";
  const now = Date.now();
  const key = `${ip}:${event.category}`;
  const current = burstBuckets.get(key);

  if (!current || now >= current.resetAtEpochMs) {
    burstBuckets.set(key, {
      count: 1,
      resetAtEpochMs: now + ALERT_WINDOW_MS,
      alerted: false
    });
    return;
  }

  current.count += 1;
  if (!current.alerted && current.count >= ALERT_THRESHOLD) {
    current.alerted = true;
    logSecurityEvent({
      category: "SUSPICIOUS_BURST",
      outcome: "alert",
      reason: "THRESHOLD_REACHED",
      severity: "high",
      ip,
      path: event.path,
      method: event.method,
      status: event.status,
      subject: `${event.category}:${current.count}`
    });
  }
}

export function logSecurityEvent(event: SecurityEvent) {
  const payload = {
    ts: new Date().toISOString(),
    severity: event.severity ?? "medium",
    category: event.category,
    outcome: event.outcome,
    reason: event.reason,
    status: event.status ?? null,
    ip: event.ip ?? "unknown",
    method: event.method ?? null,
    path: event.path ?? null,
    user_agent: event.userAgent ?? null,
    subject: event.subject ?? null
  };

  if (payload.severity === "high") {
    console.warn(`[SECURITY] ${JSON.stringify(payload)}`);
    return;
  }
  console.info(`[SECURITY] ${JSON.stringify(payload)}`);
}

export function recordSecuritySignal(req: Request, input: SecuritySignalInput) {
  const event: SecurityEvent = {
    ...input,
    ip: getClientIp(req),
    method: req.method,
    path: new URL(req.url).pathname,
    userAgent: getUserAgent(req),
    severity: input.severity ?? "medium"
  };

  logSecurityEvent(event);
  recordBurst(event);
}

