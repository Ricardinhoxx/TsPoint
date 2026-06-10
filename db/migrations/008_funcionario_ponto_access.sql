BEGIN;

CREATE TABLE IF NOT EXISTS funcionario_ponto_access (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id BIGINT NOT NULL REFERENCES funcionario(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by_supervisor_id BIGINT NOT NULL REFERENCES supervisor(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funcionario_ponto_access_funcionario_idx
  ON funcionario_ponto_access(funcionario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS funcionario_ponto_access_active_idx
  ON funcionario_ponto_access(token_hash)
  WHERE ativo = TRUE;

COMMIT;
