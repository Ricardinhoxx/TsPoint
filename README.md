# Digitaliza-Sodexo (MVP real-time)

Arquitetura alvo (MVP real-time):

- Vercel (`web/`, Next.js): UI + API “gateway” + autenticação/ACL
- Fly.io (`face-api/`, FastAPI): microserviço de Face API sempre ligado (CPU)
- Banco: Postgres (+ pgvector) para usuários/funcionários/unidades, embeddings e registros de ponto

## Contratos JSON

Gateway (Next.js):

- `POST /api/auth/login` → `{ email, password }` → `200 { supervisor: { id, email, unidade_id, role } }`
- `POST /api/auth/logout` → `204`
- `GET /api/unidade/me` → `200 { unidade: { id, nome } }`
- `GET /api/funcionarios` → `200 { funcionarios: [{ id, nome, status }] }` (sempre filtrado pela unidade do supervisor)
- `POST /api/ponto` → `{ funcionario_id, tipo?: "ENTRADA"|"SAIDA", score?: number, device_info?: object }`
  - Se `tipo` não vier, o backend infere o próximo (toggle) e valida regras.
- `POST /api/face/recognize` → `{ image_b64 }` → `200 { matched, funcionario_id?, nome?, score? }`
- `POST /api/face/enroll` → `{ funcionario_id, images_b64: string[] }` → `200 { ok: true, inserted: number }`

Face API (FastAPI):

- `GET /health` → `200 { ok: true }`
- `POST /recognize` → `{ unidade_id, image_b64 }` → `{ matched, funcionario_id?, nome?, score? }`
- `POST /enroll` → `{ funcionario_id, images_b64 }` → `{ ok: true, inserted }`

As chamadas Vercel → Fly usam header `X-Internal-Secret` (config em env).

## Banco (Postgres + pgvector)

DDL: `db/migrations/001_init.sql`.

Regras mínimas implementadas no gateway:

- Supervisor só vê/gera ponto da própria unidade (ACL por `unidade_id`)
- Entrada/Saída: bloqueia ponto com mesmo tipo do último (toggle obrigatório)
- Auditoria: persiste `score`, `operador_id` e `device_info`

## Rodar local (dev)

1) Subir Postgres:

```powershell
docker compose -f db/docker-compose.yml up -d
```

2) Aplicar migração:

```powershell
$env:DATABASE_URL = "postgres://app:app@localhost:5432/digitaliza"
psql $env:DATABASE_URL -f db/migrations/001_init.sql
psql $env:DATABASE_URL -f db/migrations/002_funcionario_turno_local.sql
```

2.1) Seed (dev):

```powershell
psql $env:DATABASE_URL -f db/seed_dev.sql
```

3) Subir o `face-api/`:

```powershell
cd face-api
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

4) Subir o `web/`:

```powershell
cd web
npm i
copy .env.example .env.local
npm run dev
```

## Deploy (resumo)

- Vercel: configure o Root Directory como `web/` e set envs (`DATABASE_URL`, `AUTH_SECRET`, `FACE_API_URL`, `FACE_API_SECRET`)
- Fly.io: faça deploy do diretório `face-api/` e configure envs (`DATABASE_URL`, `INTERNAL_SECRET`, `FACE_THRESHOLD`)

## OAuth auto-provision (security)

To enable supervisor auto-provision via OAuth, configure both env vars explicitly:

- `OAUTH_AUTO_PROVISION_ENABLED=true`
- `OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN=empresa.com`

Without these values, OAuth auto-provision stays disabled.

## Security monitoring (defensive)

- Sensitive mutation routes now enforce same-origin checks and emit structured `[SECURITY]` logs.
- Repeated blocked/failed events by IP and category trigger a `SUSPICIOUS_BURST` alert in logs.
- Middleware blocks common scanner probe paths with `404` (`/.env`, `/.git/*`, `/wp-admin*`, `/phpmyadmin*`, `/server-status`).
- Canary endpoint: `GET/POST/PUT/PATCH/DELETE /api/security/canary` always returns `404` and emits `CANARY_ENDPOINT_HIT`.

Use these events in your SIEM/observability stack for alerting.
