BEGIN;

CREATE TABLE IF NOT EXISTS auth_login_attempt (
  attempt_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_attempt_reset_at_idx
  ON auth_login_attempt (reset_at);

COMMIT;
