BEGIN;

-- Acelera filtros por janela de tempo (especialmente no escopo ADMIN global).
CREATE INDEX IF NOT EXISTS ponto_ts_idx
  ON ponto ("timestamp" DESC);

-- Acelera listagens de funcionarios ativos por unidade (presenca/day_people).
CREATE INDEX IF NOT EXISTS funcionario_status_unidade_idx
  ON funcionario (status, unidade_id);

COMMIT;

