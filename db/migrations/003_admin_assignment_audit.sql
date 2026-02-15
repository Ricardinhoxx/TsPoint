BEGIN;

CREATE TABLE IF NOT EXISTS admin_assignment_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_supervisor_id BIGINT NOT NULL REFERENCES supervisor(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('SUPERVISOR', 'FUNCIONARIO')),
  entity_id BIGINT NOT NULL,
  old_unidade_id BIGINT REFERENCES unidade(id) ON DELETE RESTRICT,
  new_unidade_id BIGINT REFERENCES unidade(id) ON DELETE RESTRICT,
  old_role TEXT,
  new_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_assignment_audit_created_at_idx
  ON admin_assignment_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_assignment_audit_entity_idx
  ON admin_assignment_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS admin_assignment_audit_actor_idx
  ON admin_assignment_audit(actor_supervisor_id);

COMMIT;
