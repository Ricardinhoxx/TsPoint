BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ponto_tipo') THEN
    CREATE TYPE ponto_tipo AS ENUM ('ENTRADA', 'SAIDA');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'local_tipo') THEN
    CREATE TYPE local_tipo AS ENUM ('LOJA', 'ESCRITORIO', 'CD');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS unidade (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supervisor (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  unidade_id BIGINT NOT NULL REFERENCES unidade(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'SUPERVISOR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS funcionario (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  turno SMALLINT NOT NULL CHECK (turno IN (1, 2, 3)),
  local_tipo local_tipo NOT NULL,
  unidade_id BIGINT NOT NULL REFERENCES unidade(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funcionario_unidade_id_idx ON funcionario(unidade_id);

CREATE TABLE IF NOT EXISTS face_embedding (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id BIGINT NOT NULL REFERENCES funcionario(id) ON DELETE CASCADE,
  embedding_vector vector(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS face_embedding_funcionario_id_idx ON face_embedding(funcionario_id);
CREATE INDEX IF NOT EXISTS face_embedding_vector_cosine_idx
  ON face_embedding USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS ponto (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id BIGINT NOT NULL REFERENCES funcionario(id) ON DELETE RESTRICT,
  unidade_id BIGINT NOT NULL REFERENCES unidade(id) ON DELETE RESTRICT,
  tipo ponto_tipo NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  score REAL,
  device_info JSONB,
  operador_id BIGINT NOT NULL REFERENCES supervisor(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ponto_funcionario_ts_idx ON ponto(funcionario_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS ponto_unidade_ts_idx ON ponto(unidade_id, timestamp DESC);

COMMIT;
