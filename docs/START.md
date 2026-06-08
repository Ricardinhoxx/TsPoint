# Como Iniciar O Projeto

Este guia mostra como rodar o Digitaliza-Sodexo localmente em ambiente Windows/PowerShell.

## 1. Pre-requisitos

Instale ou confirme:

- Node.js 20 ou 22. O projeto declara `>=20.11 <23`.
- npm.
- Supabase Database com `vector`/pgvector habilitado, destino definido para o banco.
- Fly CLI, apenas enquanto o banco temporario Fly ainda for usado por proxy local.
- Docker Desktop, apenas se for usar Postgres local em vez do banco Fly.
- Python 3.11 ou 3.12, se for rodar o `face-api`.
- `psql`, para aplicar migrations manualmente.

Verifique:

```powershell
node --version
npm --version
flyctl version
psql --version
python --version
```

Se `node` existir em `C:\Program Files\nodejs`, mas nao estiver no PATH da sessao:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

## 2. Estrutura

- `web/`: app Next.js, telas e API gateway.
- `face-api/`: microservico FastAPI de reconhecimento facial.
- `db/`: migrations e seed de desenvolvimento.

## 3. Configurar Env Do Web

Crie o arquivo:

```powershell
Copy-Item web\.env.example web\.env.local
```

Edite `web/.env.local`:

```env
DATABASE_URL=postgresql://postgres:<senha>@<host-supabase>:5432/postgres?sslmode=require
AUTH_SECRET=troque-por-uma-chave-grande

FACE_API_URL=http://localhost:8080
FACE_API_SECRET=change-me-too

SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=SUA_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_SUPABASE_ANON_KEY

OAUTH_AUTO_PROVISION_ENABLED=true
OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN=*
OAUTH_AUTO_PROVISION_UNIDADE_ID=1
OAUTH_AUTO_PROVISION_ROLE=SUPERVISOR
```

Use `OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN=*` apenas em desenvolvimento. Em producao, use um dominio real, por exemplo:

```env
OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN=suaempresa.com
```

## 4. Configurar Supabase Auth

No Supabase:

1. Va em Authentication.
2. Habilite login por email/senha.
3. Decida se o email precisa de confirmacao.
4. Se exigir confirmacao, configure:
   - Site URL: `http://127.0.0.1:3000`
   - Redirect URLs: `http://127.0.0.1:3000/login`

O modo `Criar conta` usa Supabase Auth para criar/autenticar conta e depois cria uma sessao interna do app. O modo `Entrar` usa login local na tabela `supervisor`.

## 5. Configurar Banco

Destino definido:

```txt
Supabase Database
```

Antes de rodar o app contra Supabase:

1. Habilite a extensao `vector`/pgvector no Supabase.
2. Configure `DATABASE_URL` com a connection string Postgres do Supabase e `sslmode=require`.
3. Rode as migrations de `db/migrations/*.sql`.
4. Rode seed apenas se quiser dados de desenvolvimento.

Enquanto a migracao para Supabase nao for concluida, o workspace ainda pode usar o banco Fly temporario por proxy.

Na raiz do projeto:

```powershell
flyctl mpg proxy 3x9jv02y6lpr6qp7 --local-port 16380
```

Deixe esse processo rodando enquanto usa o app temporariamente com Fly. A porta esperada e:

```txt
127.0.0.1:16380
```

Se optar por Postgres local com Docker, use:

```powershell
docker compose -f db/docker-compose.yml up -d
$env:DATABASE_URL = "postgres://app:app@localhost:5432/digitaliza"
```

## 6. Migrations E Seed

No banco Fly atual, as migrations e o seed ja foram aplicados. Para Supabase ou qualquer banco novo, configure `DATABASE_URL` e rode:

```powershell
Get-ChildItem db/migrations/*.sql | Sort-Object Name | ForEach-Object {
  psql $env:DATABASE_URL -f $_.FullName
}
```

Aplique seed de desenvolvimento:

```powershell
psql $env:DATABASE_URL -f db/seed_dev.sql
```

Contas criadas pelo seed:

```txt
demo@empresa.com / admin123
admin@empresa.com / admin123
```

Essas contas sao usadas pelo modo `Entrar` da tela `/login`.

## 7. Rodar Web

Instale dependencias:

```powershell
cd web
npm ci
```

Suba o Next.js:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Acesse:

```txt
http://127.0.0.1:3000/login
```

## 8. Entrar Ou Criar Conta Pelo App

Para entrar com as contas locais:

```txt
demo@empresa.com / admin123
admin@empresa.com / admin123
```

Para criar conta via Supabase:

Na tela `/login`:

1. Clique em `Criar conta`.
2. Informe email e senha.
3. Se o Supabase exigir confirmacao, confirme pelo email.
4. Volte para `Entrar` e faca login.

Quando o login Supabase for valido, o app cria automaticamente um supervisor no banco, usando:

- `OAUTH_AUTO_PROVISION_UNIDADE_ID`
- `OAUTH_AUTO_PROVISION_ROLE`
- `OAUTH_AUTO_PROVISION_ALLOWED_DOMAIN`

## 9. Rodar Face API

Crie env:

```powershell
Copy-Item face-api\.env.example face-api\.env
```

Edite `face-api/.env`:

```env
DATABASE_URL=postgresql://postgres:<senha>@<host-supabase>:5432/postgres?sslmode=require
INTERNAL_SECRET=change-me-too
FACE_FAKE_MODE=0
FACE_MODEL=buffalo_l
FACE_DET_SIZE=640
FACE_THRESHOLD=0.42
```

Para rodar:

```powershell
cd face-api
.\run-dev.ps1
```

Se quiser testar o pipeline sem instalar o motor facial pesado, em desenvolvimento:

```env
FACE_FAKE_MODE=1
```

Nunca use `FACE_FAKE_MODE=1` em producao.

## 10. Validacao

No `web/`:

```powershell
npm run lint
npm test
npm run build
```

Health checks uteis:

```powershell
curl.exe -I http://127.0.0.1:3000/login
curl.exe http://127.0.0.1:8080/health
```

Para testar login local via API no PowerShell:

```powershell
$tmp = New-TemporaryFile
Set-Content -LiteralPath $tmp -Value '{"email":"demo@empresa.com","password":"admin123","provider":"LOCAL"}' -NoNewline
curl.exe -i -X POST http://127.0.0.1:3000/api/auth/login -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:3000" --data-binary "@$tmp"
Remove-Item -LiteralPath $tmp
```

## 11. Problemas Comuns

### `node` nao reconhecido

Adicione Node ao PATH da sessao:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

### `npm.ps1` bloqueado por ExecutionPolicy

Use `npm.cmd`:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

### Porta 3000 em uso

```powershell
$line = netstat -ano | Select-String "127\.0\.0\.1:3000\s+.*LISTENING" | Select-Object -First 1
if ($line) {
  $listenPid = [int](($line.ToString().Trim() -split "\s+")[-1])
  Stop-Process -Id $listenPid -Force
}
```

### Login cria usuario no Supabase, mas nao entra no app

Confira:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OAUTH_AUTO_PROVISION_ENABLED=true`
- `OAUTH_AUTO_PROVISION_UNIDADE_ID=1`
- Existe unidade `id=1` no banco.

### `DATABASE_URL` ausente

O backend Next.js precisa de `DATABASE_URL` no `web/.env.local`.

### Login local retorna `INVALID_CREDENTIALS`

Confirme que o proxy Fly esta aberto em `127.0.0.1:16380` e que o seed foi aplicado no banco usado por `DATABASE_URL`.

### Face API retorna `FACE_API_UNREACHABLE`

Confirme que o `face-api` esta rodando em `http://localhost:8080` e que:

```env
FACE_API_URL=http://localhost:8080
FACE_API_SECRET=change-me-too
```

no `web/.env.local` combina com:

```env
INTERNAL_SECRET=change-me-too
```

no `face-api/.env`.
