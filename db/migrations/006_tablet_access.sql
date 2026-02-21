BEGIN;

CREATE TABLE IF NOT EXISTS tablet_access (
  id BIGSERIAL PRIMARY KEY,
  unidade_id BIGINT NOT NULL REFERENCES unidade(id) ON DELETE CASCADE,
  nome_dispositivo TEXT NOT NULL DEFAULT 'Tablet',
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tablet_access_unidade_ativo_idx
  ON tablet_access (unidade_id, ativo);

CREATE INDEX IF NOT EXISTS tablet_access_expires_idx
  ON tablet_access (expires_at);

COMMIT;
