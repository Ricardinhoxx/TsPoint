BEGIN;

ALTER TABLE funcionario
  ADD COLUMN IF NOT EXISTS hora_entrada_prevista TIME,
  ADD COLUMN IF NOT EXISTS hora_saida_prevista TIME;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'diarista_tipo') THEN
    CREATE TYPE diarista_tipo AS ENUM ('SUBSTITUICAO', 'DEMANDA');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS diarista_presenca (
  id BIGSERIAL PRIMARY KEY,
  unidade_id BIGINT NOT NULL REFERENCES unidade(id) ON DELETE RESTRICT,
  data_ref DATE NOT NULL DEFAULT CURRENT_DATE,
  nome_diarista TEXT NOT NULL,
  tipo diarista_tipo NOT NULL,
  funcionario_substituido_id BIGINT REFERENCES funcionario(id) ON DELETE SET NULL,
  observacao TEXT,
  operador_id BIGINT NOT NULL REFERENCES supervisor(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diarista_presenca_unidade_data_idx
  ON diarista_presenca(unidade_id, data_ref DESC);
CREATE INDEX IF NOT EXISTS diarista_presenca_substituido_data_idx
  ON diarista_presenca(funcionario_substituido_id, data_ref DESC);

CREATE TABLE IF NOT EXISTS ponto_audit (
  id BIGSERIAL PRIMARY KEY,
  ponto_id BIGINT,
  action TEXT NOT NULL CHECK (action IN ('UPDATE', 'DELETE')),
  motivo TEXT,
  before_data JSONB NOT NULL,
  after_data JSONB,
  actor_supervisor_id BIGINT NOT NULL REFERENCES supervisor(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ponto_audit_ponto_id_idx
  ON ponto_audit(ponto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ponto_audit_actor_idx
  ON ponto_audit(actor_supervisor_id, created_at DESC);

COMMIT;
