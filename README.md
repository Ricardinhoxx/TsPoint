# Ts-manutenção Registro de ponto (MVP real-time)

Arquitetura alvo:

- Vercel (`web/`, Next.js): UI, API gateway, autenticacao e ACL.
- Supabase Database: Postgres com `pgvector` para usuarios, funcionarios, unidades, embeddings e registros de ponto.
- Supabase Auth: criacao/login de contas quando o fluxo usar Supabase.
- Fly.io (`face-api/`, FastAPI): microservico de reconhecimento facial real sempre ligado em CPU.

Ambiente atual de desenvolvimento: o banco ainda esta em Fly Managed Postgres e o app local acessa esse banco por proxy em `127.0.0.1:16380`. Esse banco Fly e temporario; a decisao de arquitetura e migrar o banco para Supabase Database.

Estado operacional detalhado, pendencias e contexto para agentes: [`docs/AGENT_HANDOFF.md`](docs/AGENT_HANDOFF.md).

Guia visual e padroes de interface: [`docs/DESIGN.md`](docs/DESIGN.md).

## Contratos JSON

Gateway (Next.js):

- `POST /api/auth/login` -> `{ email, password }` -> `200 { supervisor: { id, email, unidade_id, role } }`
- `POST /api/auth/logout` -> `204`
- `GET /api/unidade/me` -> `200 { unidade: { id, nome } }`
- `GET /api/funcionarios` -> `200 { funcionarios: [{ id, nome, status }] }`
- `POST /api/ponto` -> `{ funcionario_id, tipo?: "ENTRADA"|"SAIDA", score?: number, device_info?: object }`
  - Se `tipo` nao vier, o backend infere o proximo tipo e valida as regras.
- `POST /api/face/recognize` -> `{ image_b64 }` -> `200 { matched, funcionario_id?, nome?, score? }`
- `POST /api/face/enroll` -> `{ funcionario_id, images_b64: string[] }` -> `200 { ok: true, inserted: number }`

Face API (FastAPI):

- `GET /health` -> `200 { ok: true }`
- `POST /recognize` -> `{ unidade_id, image_b64 }` -> `{ matched, funcionario_id?, nome?, score? }`
- `POST /enroll` -> `{ funcionario_id, images_b64 }` -> `{ ok: true, inserted }`

As chamadas Vercel -> Fly usam o header `X-Internal-Secret`.

## Banco

O banco de producao deve ser Supabase Database com a extensao `vector`/pgvector habilitada. Aplique as migrations em ordem usando a `DATABASE_URL` do Postgres do Supabase:

```powershell
$env:DATABASE_URL = "postgresql://postgres:<senha>@<host-supabase>:5432/postgres?sslmode=require"
psql $env:DATABASE_URL -f db/migrations/001_init.sql
psql $env:DATABASE_URL -f db/migrations/002_funcionario_turno_local.sql
psql $env:DATABASE_URL -f db/migrations/003_admin_assignment_audit.sql
psql $env:DATABASE_URL -f db/migrations/004_presence_perf_indexes.sql
psql $env:DATABASE_URL -f db/migrations/005_auth_login_rate_limit.sql
psql $env:DATABASE_URL -f db/migrations/006_tablet_access.sql
psql $env:DATABASE_URL -f db/migrations/007_horario_diarista_ponto_audit.sql
```

Regras principais implementadas no gateway:

- Supervisor so ve e registra ponto da propria unidade.
- Admin pode operar globalmente onde as rotas permitem.
- Entrada/Saida bloqueia ponto com mesmo tipo do ultimo registro.
- Auditoria persiste `score`, `operador_id` e `device_info`.

## Rodar Local

Guia completo de inicializacao: [`docs/START.md`](docs/START.md).

1. Configurar o banco.

Destino recomendado: usar a `DATABASE_URL` do Supabase Database com `sslmode=require`.

Temporario neste workspace: abrir o proxy para o Fly Managed Postgres enquanto a migracao para Supabase nao for concluida:

```powershell
flyctl mpg proxy 3x9jv02y6lpr6qp7 --local-port 16380
```

2. Confirmar que `web/.env.local` aponta para o banco escolhido.

Supabase Database:

```powershell
DATABASE_URL=postgresql://postgres:<senha>@<host-supabase>:5432/postgres?sslmode=require
```

Fly temporario:

```powershell
DATABASE_URL=postgres://fly-user:<senha>@127.0.0.1:16380/fly-db
```

3. Subir o `web/`:

```powershell
cd web
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

4. Acessar:

```txt
http://127.0.0.1:3000/login
```

Contas locais de desenvolvimento:

```txt
demo@empresa.com / admin123
admin@empresa.com / admin123
```

5. Subir o `face-api/`, quando for testar reconhecimento facial:

```powershell
cd face-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Validacao

```powershell
cd web
npm test
npm run lint
npm run build
```

Para testar o pipeline completo, suba Postgres, Face API e Next.js, cadastre base facial para um funcionario e registre um ponto pelo fluxo de camera ou tablet.

## Deploy

- Vercel: configure o Root Directory como `web/` e set envs `DATABASE_URL` do Supabase, `AUTH_SECRET`, `FACE_API_URL`, `FACE_API_SECRET` e envs do Supabase Auth.
- Supabase: habilite `vector`, aplique migrations e mantenha Auth/Database no mesmo projeto ou em projetos documentados.
- Fly.io: faca deploy do diretorio `face-api/` e set envs `DATABASE_URL` do Supabase, `INTERNAL_SECRET`, `FACE_THRESHOLD`, `FACE_MODEL`.
- Producao nunca deve usar `FACE_FAKE_MODE=1`; esse modo existe apenas para testar o pipeline.

## Login

Na aba `Entrar`, o app usa login local pela rota `/api/auth/login` com os supervisores da tabela `supervisor`.

Na aba `Criar conta`, o app usa Supabase Auth com email/senha. Configure no ambiente:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Apos um login Supabase valido, o app cria a sessao interna e pode auto-provisionar o supervisor conforme as envs `OAUTH_AUTO_PROVISION_*`.

## OAuth Auto-Provision

Para habilitar criacao automatica de supervisores via OAuth, configure explicitamente:

- `OAUTH_AUTO_PROVISION_ENABLED=true`
- `OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN=empresa.com`

Sem essas variaveis, o auto-provision fica desabilitado.

## Monitoramento De Seguranca

- Rotas sensiveis de mutacao validam origem e emitem logs estruturados `[SECURITY]`.
- Eventos bloqueados/falhos repetidos por IP e categoria geram alerta `SUSPICIOUS_BURST`.
- O middleware bloqueia probes comuns com `404`: `/.env`, `/.git/*`, `/wp-admin*`, `/phpmyadmin*`, `/server-status`.
- Canary endpoint: `GET/POST/PUT/PATCH/DELETE /api/security/canary` sempre retorna `404` e emite `CANARY_ENDPOINT_HIT`.

Use esses eventos no seu SIEM ou stack de observabilidade.
