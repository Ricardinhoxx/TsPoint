BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'local_tipo') THEN
    CREATE TYPE local_tipo AS ENUM ('LOJA', 'ESCRITORIO', 'CD');
  END IF;
END$$;

ALTER TABLE funcionario
  ADD COLUMN IF NOT EXISTS turno SMALLINT;

ALTER TABLE funcionario
  ADD COLUMN IF NOT EXISTS local_tipo local_tipo;

-- Backfill para bases existentes (se vierem nulas)
UPDATE funcionario SET turno = 1 WHERE turno IS NULL;
UPDATE funcionario SET local_tipo = 'LOJA'::local_tipo WHERE local_tipo IS NULL;

ALTER TABLE funcionario
  ALTER COLUMN turno SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'funcionario_turno_chk'
      AND conrelid = 'funcionario'::regclass
  ) THEN
    ALTER TABLE funcionario
      ADD CONSTRAINT funcionario_turno_chk CHECK (turno IN (1, 2, 3));
  END IF;
END$$;

ALTER TABLE funcionario
  ALTER COLUMN local_tipo SET NOT NULL;

COMMIT;
