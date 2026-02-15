BEGIN;

INSERT INTO unidade (id, nome)
VALUES (1, 'Unidade Demo')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- Senha do demo: admin123
INSERT INTO supervisor (id, email, password_hash, unidade_id, role)
VALUES (
  1,
  'demo@empresa.com',
  '$2a$10$Ggs1POlEF5NWJkscBRAd7u9wJh9FehZ.WTqAQQmRKfIMA8L4Tu3pi',
  1,
  'SUPERVISOR'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    unidade_id = EXCLUDED.unidade_id,
    role = EXCLUDED.role;

-- Admin global (mesma senha: admin123)
INSERT INTO supervisor (id, email, password_hash, unidade_id, role)
VALUES (
  2,
  'admin@empresa.com',
  '$2a$10$Ggs1POlEF5NWJkscBRAd7u9wJh9FehZ.WTqAQQmRKfIMA8L4Tu3pi',
  1,
  'ADMIN'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    unidade_id = EXCLUDED.unidade_id,
    role = EXCLUDED.role;

INSERT INTO funcionario (id, nome, turno, local_tipo, unidade_id, status)
VALUES
  (1, 'Ana Silva', 1, 'LOJA', 1, 'ATIVO'),
  (2, 'Bruno Souza', 2, 'ESCRITORIO', 1, 'ATIVO'),
  (3, 'Carla Lima', 3, 'CD', 1, 'ATIVO')
ON CONFLICT (id) DO UPDATE
SET nome = EXCLUDED.nome,
    turno = EXCLUDED.turno,
    local_tipo = EXCLUDED.local_tipo,
    unidade_id = EXCLUDED.unidade_id,
    status = EXCLUDED.status;

-- Como inserimos IDs manualmente, é importante avançar as sequências (senão o próximo INSERT pode colidir no PK).
SELECT setval(pg_get_serial_sequence('unidade', 'id'), (SELECT COALESCE(MAX(id), 1) FROM unidade), true);
SELECT setval(pg_get_serial_sequence('supervisor', 'id'), (SELECT COALESCE(MAX(id), 1) FROM supervisor), true);
SELECT setval(pg_get_serial_sequence('funcionario', 'id'), (SELECT COALESCE(MAX(id), 1) FROM funcionario), true);
SELECT setval(pg_get_serial_sequence('face_embedding', 'id'), (SELECT COALESCE(MAX(id), 1) FROM face_embedding), true);
SELECT setval(pg_get_serial_sequence('ponto', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ponto), true);

COMMIT;
