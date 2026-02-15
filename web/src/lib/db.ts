import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env: DATABASE_URL");
  const shouldUseSsl =
    url.includes("sslmode=require") ||
    url.includes("sslmode=prefer") ||
    url.includes("sslmode=verify-ca") ||
    url.includes("sslmode=verify-full") ||
    url.includes(".supabase.co") ||
    url.includes(".supabase.com");

  _sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: shouldUseSsl ? "require" : false,
    // Avoid issues with PgBouncer/transaction poolers (common in Supabase “pooler” URLs).
    no_prepare: true
  });
  return _sql;
}
