# Handoff Para Proximo Agente

Data do handoff: 2026-06-07

## Contexto Geral

Projeto: `Digitaliza-Sodexo`

Estrutura relevante:

- `web/`: app Next.js.
- `face-api/`: microservico FastAPI para reconhecimento facial.
- `db/`: migrations e seed do Postgres.
- `docs/START.md`: guia local original.

O usuario decidiu seguir com Fly.io em vez de Docker local. Docker Desktop chegou a ser instalado, mas o Docker nao iniciou porque WSL nao estava instalado. Depois disso, o caminho passou a ser Fly.io + banco remoto.

Atualizacao de 2026-06-07:

- O app web foi exposto para celular por HTTPS usando Cloudflare Tunnel.
- A Face API foi subida localmente na porta `8080`, mas em `FACE_FAKE_MODE=1` para destravar o fluxo de teste.
- O reconhecimento facial real ainda NAO esta funcionando, porque `insightface` ainda nao instalou corretamente no Windows.
- Decisao de arquitetura final do usuario:
  - Frontend/API gateway: Vercel (`web/`).
  - Banco de dados: Supabase Database/Postgres com pgvector.
  - Auth: Supabase Auth.
  - Reconhecimento facial/processamento: Fly.io (`face-api/`).
- Estado atual ainda divergente: Supabase esta configurado para Auth, mas o banco do app ainda NAO esta no Supabase Database; o banco atual continua sendo Fly Managed Postgres via proxy local ate a migracao.
- Atualizacao posterior: `web/.env.local` e `face-api/.env` foram atualizados para apontar para Supabase Database via Session Pooler (`aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`). Nao registrar a senha.

## Alteracoes Feitas No Web

### Tela de login

Arquivo alterado:

- `web/src/app/login/page.tsx`

Mudancas principais:

- Textos em portugues corrigidos:
  - `Portal de Presenca` -> `Registro de ponto`
  - `Nao foi possivel` -> `Nao foi possivel` com acento no arquivo
  - `Email` -> `E-mail`
  - demais mensagens de erro com acentos corrigidos.
- Titulo da tela alterado para `Registro de ponto`.
- Subtitulo alterado para `Sistema de registro de ponto e reconhecimento facial`.
- O modo `Entrar` agora usa login local via `/api/auth/login` com `provider: "LOCAL"`.
- O modo `Criar conta` continua usando Supabase.
- Adicionada mensagem amigavel para erro `HTTP 500` indicando problema de banco.

Motivo do ajuste de login:

- As contas do `db/seed_dev.sql` sao usuarios locais na tabela `supervisor`.
- Antes, a tela tentava autenticar via Supabase, entao `admin@empresa.com / admin123` nao funcionava pela UI.

### Logo

Assets criados:

- `web/public/brand/app-logo-transparent.png`
- `web/public/brand/app-logo-clean.png`
- `web/public/brand/app-logo-highlight.png`

Arquivo final em uso:

- `web/public/brand/app-logo-highlight.png`

Arquivos atualizados para usar a logo com destaque:

- `web/src/app/login/page.tsx`
- `web/src/app/unidade/page.tsx`

O asset final tem fundo transparente, recorte melhor, contorno claro sutil e sombra leve para destacar em fundo escuro.

## Fly.io

CLI instalada em:

```powershell
C:\Users\richa\.fly\bin\flyctl.exe
```

O PATH do PowerShell do usuario foi ajustado na sessao com:

```powershell
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
```

Se `flyctl` nao for reconhecido em uma nova sessao, usar caminho completo:

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" version
```

Login Fly feito com sucesso como:

```txt
rivora42@gmail.com
```

## Banco Fly Managed Postgres Temporario

Foi criado um cluster Managed Postgres e usado temporariamente durante desenvolvimento:

```txt
ID: 3x9jv02y6lpr6qp7
Name: digitaliza-sodexo-db
Organization: rivora-253
Region: gru
Plan: starter
Disk: 10GB
Database: fly-db
User: fly-user
Status: ready
```

Atencao de custo:

- A Fly informou que o plano `Starter` custa `US$72/month`.
- Se isso nao for desejado, orientar o usuario a destruir o cluster pelo painel ou via:

```powershell
flyctl mpg destroy 3x9jv02y6lpr6qp7
```

Importante:

- Esse banco Fly nao e mais o destino final decidido pelo usuario.
- O destino final do banco e Supabase Database.
- Antes de destruir o cluster Fly, migrar/aplicar dados necessarios no Supabase ou confirmar que nao ha dados reais importantes.
- O usuario executou `flyctl mpg destroy 3x9jv02y6lpr6qp7` e o cluster foi agendado para destruicao.

## Pgvector

A migration `001_init.sql` usa:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

No Fly Managed Postgres, o usuario precisou habilitar a extensao `vector` pelo dashboard:

- Cluster `digitaliza-sodexo-db`
- Menu `Extensions`
- Database `fly-db`
- Schema escolhido: `public`
- Extensao: `vector`

Depois disso, as migrations rodaram com sucesso.

## Proxy Local Para O Banco Fly

Foi aberto um proxy local da Fly:

```powershell
flyctl mpg proxy 3x9jv02y6lpr6qp7 --local-port 16380
```

No momento em que foi testado, estava ouvindo em:

```txt
127.0.0.1:16380
```

Se o PC/terminal reiniciar e o app parar de conectar ao banco, abrir novamente:

```powershell
flyctl mpg proxy 3x9jv02y6lpr6qp7 --local-port 16380
```

## Env Atual

Arquivo:

- `web/.env.local`

Foi alterado para apontar o `DATABASE_URL` para o banco Fly via proxy local:

```env
DATABASE_URL=postgres://fly-user:<senha-redigida>@127.0.0.1:16380/fly-db
```

Nao registrar a senha neste documento. Ela esta no `.env.local` local do usuario e tambem apareceu na saida do comando `mpg create`.

Outros pontos da env:

- `FACE_API_URL` ainda estava local antes:
  - `http://localhost:8080`
- Para producao, deve virar algo como:
  - `https://digitaliza-sodexo-face-api.fly.dev`
- `FACE_API_SECRET` do `web` deve ser igual ao `INTERNAL_SECRET` do `face-api`.
- `AUTH_SECRET` estava fraco (`change-me`) e deve ser trocado em producao por uma chave grande.

### Supabase

Supabase atual:

- Usado para Auth / criacao de conta.
- `NEXT_PUBLIC_SUPABASE_URL` aponta para um projeto Supabase.
- O banco principal do app ainda NAO esta usando Supabase Database, mas esse e o destino decidido.

Banco atual:

```txt
web/.env.local DATABASE_URL -> aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require
face-api/.env DATABASE_URL  -> aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Supabase Database foi inicializado com migrations e seed de desenvolvimento. Validacao feita:

```txt
unidades: 1
supervisores: 2
funcionarios: 3
embeddings: 0
```

Depois de atualizar os `.env`, Next e Face API foram reiniciados localmente e validados contra Supabase:

```txt
Face API health -> {"ok": true}
POST /api/auth/login demo@empresa.com/admin123 -> 200 OK
GET /api/unidade/me -> Unidade Demo
GET /api/funcionarios?unidade_id=1 -> 3 funcionarios seed
POST /api/face/enroll -> 200 OK em fake mode
```

O teste de enroll em fake mode criou embeddings para `Ana Silva`, mas eles foram removidos em seguida. Estado final validado:

```txt
Ana Silva -> 0 embeddings
Bruno Souza -> 0 embeddings
Carla Lima -> 0 embeddings
```

Se precisar repetir a migracao para outro projeto Supabase:

1. Obter a connection string Postgres do Supabase.
2. Habilitar `vector`/pgvector no Supabase.
3. Rodar todas as migrations em `db/migrations/*.sql`.
4. Rodar seed ou recriar dados reais.
5. Trocar `DATABASE_URL` em `web/.env.local` e `face-api/.env`.
6. Recriar/cadastrar bases faciais no novo banco.

Arquitetura final esperada de envs:

Vercel `web/`:

```env
DATABASE_URL=postgresql://postgres:<senha>@<host-supabase>:5432/postgres?sslmode=require
AUTH_SECRET=<segredo-forte>
FACE_API_URL=https://<face-api-fly>.fly.dev
FACE_API_SECRET=<mesmo valor do INTERNAL_SECRET>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key, se usado no projeto>
NEXT_PUBLIC_APP_URL=https://ts-point.vercel.app
APP_URL=https://ts-point.vercel.app
```

Fly `face-api/`:

```env
DATABASE_URL=postgresql://postgres:<senha>@<host-supabase>:5432/postgres?sslmode=require
INTERNAL_SECRET=<mesmo valor do FACE_API_SECRET>
FACE_FAKE_MODE=0
FACE_MODEL=buffalo_l
FACE_DET_SIZE=640
FACE_THRESHOLD=0.42
```

## Vercel Estado Atual

Projeto Vercel:

```txt
ts-point
```

URL de producao:

```txt
https://ts-point.vercel.app
```

Repositorio/branch usado:

```txt
https://github.com/Ricardinhoxx/TsPoint.git
branch: main
```

Configuracao correta esperada em `Settings > Build and Deployment`:

```txt
Framework Preset: Next.js
Root Directory: web
Build Command: npm run build
Install Command: npm ci
Output Directory: vazio
```

Observacao importante:

- O `Root Directory` foi confirmado no print como `web`.
- O `Framework Preset` apareceu como `Other`; isso provavelmente causou o 404 da Vercel mesmo com deploy `Ready`.
- Ajustar para `Next.js`, salvar e fazer redeploy.
- Se continuar 404 depois disso, criar um novo projeto Vercel importando o repo e selecionando `Root Directory: web` na tela inicial.

### Env Vercel Ja Mapeada

O usuario adicionou/atualizou as envs no painel da Vercel. Lista esperada:

```txt
AUTH_SECRET
DATABASE_URL
FACE_API_SECRET
FACE_API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
APP_URL
```

Valores esperados:

```txt
NEXT_PUBLIC_APP_URL=https://ts-point.vercel.app
APP_URL=https://ts-point.vercel.app
SUPABASE_URL=mesmo valor de NEXT_PUBLIC_SUPABASE_URL
SUPABASE_ANON_KEY=mesmo valor de NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Pendente ate subir a Face API na Fly:

```txt
FACE_API_URL=http://localhost:8080
```

Esse valor nao funciona em producao. Depois do deploy Fly, trocar para:

```txt
FACE_API_URL=https://digitaliza-sodexo-face-api.fly.dev
```

`FACE_API_SECRET` na Vercel deve ser exatamente igual ao `INTERNAL_SECRET` configurado na Fly.

### Supabase Auth URL Config

No Supabase Auth, configurar:

```txt
Site URL: https://ts-point.vercel.app
Redirect URLs:
- https://ts-point.vercel.app/
- https://ts-point.vercel.app/login
```

O print anterior mostrava `Site URL` ainda como `http://localhost:3000`; isso precisa ser alterado para a URL de producao.

### Erro Edge Middleware Resolvido

Erro visto na Vercel:

```txt
The Edge Function "middleware" is referencing unsupported modules:
- __vc__ns__/0/web/middleware.js: @/lib/securityAudit
```

Causa:

- `web/middleware.ts` importava `@/lib/securityAudit`.
- Middleware da Vercel roda no Edge Runtime e nao pode depender de modulos que podem puxar APIs Node/server incompatíveis.

Correcao feita:

- Removido o import de `logSecurityEvent` no `web/middleware.ts`.
- O log de probes suspeitos agora usa `console.warn` direto no middleware.
- As rotas de API continuam podendo usar `@/lib/securityAudit`.

Validacao local:

```powershell
cd web
npm.cmd run build
```

Resultado:

```txt
Compiled successfully
Rotas geradas: /, /login, /tablet, /unidade, APIs
```

Commit que contem essa correcao:

```txt
80c6e65 src
```

## Migrations E Seed

As migrations foram aplicadas no banco Fly via Node, usando proxy local e pacote `postgres` instalado em `web/node_modules`.

Migrations aplicadas:

- `db/migrations/001_init.sql`
- `db/migrations/002_funcionario_turno_local.sql`
- `db/migrations/003_admin_assignment_audit.sql`
- `db/migrations/004_presence_perf_indexes.sql`
- `db/migrations/005_auth_login_rate_limit.sql`
- `db/migrations/006_tablet_access.sql`
- `db/migrations/007_horario_diarista_ponto_audit.sql`

Seed aplicado:

- `db/seed_dev.sql`

Resultado validado no banco:

Supervisores:

```txt
demo@empresa.com  / admin123 / SUPERVISOR / unidade_id 1
admin@empresa.com / admin123 / ADMIN      / unidade_id 1
```

Funcionarios seed:

```txt
Ana Silva    / turno 1 / LOJA
Bruno Souza  / turno 2 / ESCRITORIO
Carla Lima   / turno 3 / CD
```

## Testes Realizados

O Next.js foi reiniciado depois de alterar `.env.local`.

App local:

```txt
http://127.0.0.1:3000/login
```

Portas confirmadas:

```txt
127.0.0.1:3000  -> Next.js
127.0.0.1:16380 -> proxy Fly MPG
```

Teste de login via API:

```txt
demo@empresa.com  / admin123 -> 200 OK
admin@empresa.com / admin123 -> 200 OK
```

Resposta esperada para admin:

```json
{
  "provider": "LOCAL",
  "supervisor": {
    "id": "2",
    "email": "admin@empresa.com",
    "unidade_id": "1",
    "role": "ADMIN"
  }
}
```

## Acesso Pelo Celular

O acesso direto por IP local funciona para telas comuns:

```txt
http://192.168.100.13:3001/login
```

Mas camera em celular exige contexto seguro. Em `http://192.168...`, Chrome/Safari mobile podem bloquear `getUserMedia`.

Para testar camera no celular, foi instalado `cloudflared` via winget e aberto um quick tunnel:

```powershell
cloudflared tunnel --url http://localhost:3001
```

URL gerada na sessao:

```txt
https://statewide-sleep-connectors-completed.trycloudflare.com/login
```

Essa URL e temporaria. Se o processo `cloudflared` fechar ou o PC reiniciar, gerar outra URL e passar ao usuario.

Logs do tunnel:

- `cloudflared.out.log`
- `cloudflared.err.log`

## Face API Estado Atual

Arquivo criado:

- `face-api/.env`

Conteudo relevante atual, sem segredos:

```env
DATABASE_URL=postgres://fly-user:<senha>@127.0.0.1:16380/fly-db
INTERNAL_SECRET=<igual ao FACE_API_SECRET do web>
FACE_FAKE_MODE=1
FACE_MODEL=buffalo_l
FACE_DET_SIZE=640
FACE_THRESHOLD=-1
```

Motivo do `FACE_THRESHOLD=-1`:

- Em `FACE_FAKE_MODE=1`, o embedding e gerado deterministicamente pelo hash da imagem.
- Frames diferentes da camera geram vetores diferentes.
- Com threshold real (`0.42`), o fluxo quase sempre retorna `matched=false`.
- O threshold `-1` permite selecionar o melhor match apenas para testar o fluxo de UI/API/ponto.

Importante:

- `FACE_FAKE_MODE=1` nao e reconhecimento facial real.
- Embeddings criados em fake mode NAO servem para o motor real.
- Quando o motor real funcionar, apagar e recadastrar as bases faciais.

Face API local:

```txt
http://127.0.0.1:8080/health -> {"ok": true}
```

Comandos usados para subir:

```powershell
cd face-api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --env-file .env
```

Logs:

- `face-api/face-api.out.log`
- `face-api/face-api.err.log`

## Reconhecimento Real: O Que Falta

Para sair do fake mode e funcionar de verdade:

1. Finalizar/validar Microsoft Visual Studio Build Tools com C++.
   - Foi iniciado via winget:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements --override "--quiet --wait --norestart --nocache --installPath C:\BuildTools --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

   - O instalador ficou rodando por bastante tempo.
   - `cl.exe` apareceu em:

```txt
C:\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx86\x64\cl.exe
```

   - `VsDevCmd.bat` existe em:

```txt
C:\BuildTools\Common7\Tools\VsDevCmd.bat
```

   - Mesmo assim, `pip install insightface==0.7.3` ainda falhou dizendo que Microsoft Visual C++ 14.0+ e necessario. Provavelmente o instalador ainda nao tinha finalizado/registrado tudo corretamente, ou faltou algum componente do workload.

2. Instalar dependencias reais no `face-api/.venv`:

```powershell
cd face-api
cmd /c "call C:\BuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x86 && .venv\Scripts\python.exe -m pip install insightface==0.7.3 onnxruntime==1.17.3 opencv-python-headless==4.9.0.80"
```

3. Alterar `face-api/.env`:

```env
FACE_FAKE_MODE=0
FACE_THRESHOLD=0.42
```

4. Reiniciar Face API.

5. Apagar embeddings fake e recadastrar rostos.

Exemplo para ver embeddings atuais:

```powershell
cd web
@'
const fs = require('fs');
const postgres = require('postgres');
const env = fs.readFileSync('.env.local', 'utf8');
const databaseUrl = env.match(/^DATABASE_URL=(.*)$/m)?.[1];
const sql = postgres(databaseUrl, { max: 1 });
(async () => {
  const rows = await sql`
    SELECT f.id, f.nome, COUNT(fe.id)::int AS embeddings
    FROM funcionario f
    LEFT JOIN face_embedding fe ON fe.funcionario_id = f.id
    GROUP BY f.id
    ORDER BY f.id
  `;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
})();
'@ | node -
```

Se for limpar tudo antes de recadastrar no motor real:

```sql
DELETE FROM face_embedding;
```

Ou limpar apenas um funcionario:

```sql
DELETE FROM face_embedding WHERE funcionario_id = <id>;
```

## Fly: O Que Precisa Ser Feito

Objetivo definido pelo usuario:

```txt
Fly.io hospeda somente o processamento de reconhecimento facial (`face-api/`).
Vercel hospeda o frontend/API gateway (`web/`).
Supabase Database hospeda o banco.
```

### Estado Fly Atual

- Fly CLI esta instalada em `C:\Users\richa\.fly\bin\flyctl.exe`.
- Usuario logado no Fly como `rivora42@gmail.com`.
- `fly.toml` na raiz aponta para build de `face-api/Dockerfile.fly`.
- Tambem existe `face-api/fly.toml` com `app = "digitaliza-sodexo-face-api"`.
- O Fly Managed Postgres temporario (`digitaliza-sodexo-db`, plan `starter`) foi agendado para destruicao e nao deve ser usado como banco final.
- Ate o momento, nenhum app Fly ativo aparece em `flyctl apps list`.

### Antes Do Deploy Na Fly

1. Confirmar qual `fly.toml` sera usado.
   - Opcao mais direta: executar deploy a partir de `face-api/`, usando `face-api/fly.toml`.
   - Alternativa: executar deploy da raiz usando o `fly.toml` da raiz, que referencia `face-api/Dockerfile.fly`.
   - Evitar criar um app Fly para o `web`, pois o frontend foi decidido para Vercel.

2. Garantir que o banco Supabase esta pronto.
   - Ja foi validado localmente:

```txt
unidades: 1
supervisores: 2
funcionarios: 3
embeddings: 0
```

3. Definir secrets fortes:
   - `INTERNAL_SECRET` na Fly.
   - Mesmo valor em `FACE_API_SECRET` na Vercel.
   - Nao reutilizar `change-me`/`change-me-too`.

### Secrets Necessarios Na Fly

Configurar no app `digitaliza-sodexo-face-api`:

```powershell
cd face-api
flyctl secrets set `
  DATABASE_URL="postgresql://postgres.lsuixuiruifwbkwqgbse:<senha-codificada>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require" `
  INTERNAL_SECRET="<mesmo-valor-do-FACE_API_SECRET-na-Vercel>" `
  FACE_FAKE_MODE="0" `
  FACE_MODEL="buffalo_l" `
  FACE_DET_SIZE="640" `
  FACE_THRESHOLD="0.42"
```

Durante teste inicial, se o motor real ainda nao estiver pronto, pode usar temporariamente:

```powershell
flyctl secrets set FACE_FAKE_MODE="1" FACE_THRESHOLD="-1"
```

Mas isso deve ser tratado como teste de pipeline, nao reconhecimento real.

### Deploy Na Fly

Fluxo recomendado:

```powershell
cd face-api
flyctl status
flyctl deploy
```

Se o app ainda nao existir:

```powershell
cd face-api
flyctl apps create digitaliza-sodexo-face-api
flyctl deploy
```

Validar depois do deploy:

```powershell
curl.exe https://digitaliza-sodexo-face-api.fly.dev/health
```

Resposta esperada:

```json
{"ok":true}
```

### Depois Do Deploy Na Fly

Na Vercel (`web/`), configurar:

```env
FACE_API_URL=https://digitaliza-sodexo-face-api.fly.dev
FACE_API_SECRET=<mesmo valor de INTERNAL_SECRET>
```

Depois testar no app:

1. Login.
2. Cadastrar funcionario.
3. Cadastrar base facial.
4. Reconhecer rosto.
5. Confirmar ponto.

### Ponto Critico Do Fly

O maior risco do deploy da Face API e o motor real:

- Local Windows falhou ao instalar `insightface==0.7.3`.
- A falha local foi por toolchain C++/Build Tools.
- Em Fly/Linux, a instalacao pode ser mais simples, mas o `Dockerfile.fly` precisa instalar dependencias de build/sistema suficientes.
- Antes de considerar pronto para producao, verificar nos logs do Fly se `insightface`, `onnxruntime` e `opencv-python-headless` instalaram e se o primeiro `/recognize` nao retorna `FACE_ENGINE_LOAD_FAILED`.

Comandos uteis:

```powershell
flyctl logs -a digitaliza-sodexo-face-api
flyctl ssh console -a digitaliza-sodexo-face-api
```

Se o deploy subir mas reconhecimento falhar:

1. Verificar logs por `FACE_ENGINE_LOAD_FAILED`.
2. Confirmar `FACE_FAKE_MODE=0`.
3. Confirmar se o modelo `buffalo_l` foi baixado/carregado.
4. Se houver erro de ONNX/protobuf/modelo corrompido, o codigo ja tenta limpar cache uma vez; ainda assim pode exigir novo deploy/restart.

### Recadastro Facial Apos Motor Real

Quando a Fly estiver com `FACE_FAKE_MODE=0`:

1. Apagar embeddings fake no Supabase:

```sql
DELETE FROM face_embedding;
```

2. Recadastrar as bases faciais pelo app.
3. Testar reconhecimento com pessoas reais.
4. Ajustar `FACE_THRESHOLD` conforme falsos positivos/falsos negativos.

## Dados Faciais Observados

Durante os testes:

- O usuario cadastrou `Richard`, que ficou com embeddings.
- Foram criados embeddings de teste para `Ana Silva` durante validacao tecnica e depois removidos.
- Resultado depois da limpeza tecnica:

```txt
Ana Silva -> 0 embeddings
Bruno Souza -> 0 embeddings
Carla Lima -> 0 embeddings
RICHARD -> 0 embeddings
Richard -> 0 embeddings
Richard id 6 -> 5 embeddings
```

Esses 5 embeddings do `Richard id 6` foram criados com `FACE_FAKE_MODE=1`; precisam ser recriados quando o motor real estiver ativo.

## Alteracoes Recentes No Frontend

Arquivos alterados:

- `web/next.config.mjs`
- `web/src/app/globals.css`
- `web/src/components/CameraModal.tsx`
- `web/src/components/FaceEnrollModal.tsx`

Resumo:

- `next.config.mjs`: removeu `upgrade-insecure-requests` e HSTS no ambiente dev. Antes, acesso por IP/HTTP podia quebrar CSS/imagens no celular.
- `globals.css`: ajustes mobile para evitar overflow horizontal na tela de login.
- `CameraModal.tsx` e `FaceEnrollModal.tsx`: mensagens mais claras quando camera e bloqueada por HTTP/IP, explicando que celular exige HTTPS ou localhost.

Validacoes realizadas:

```txt
npm run lint -> passou
```

Tambem foi gerada screenshot mobile confiavel via Playwright temporario:

```txt
mobile-login-playwright-pixel5.png
```

## Servidor Next Local

Foi iniciado com:

```powershell
cd web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Logs:

- `web/next-dev.out.log`
- `web/next-dev.err.log`

## Pendencias / Proximos Passos

1. Na Vercel, trocar `Framework Preset` de `Other` para `Next.js`.
2. Confirmar que `Root Directory` continua `web`.
3. Fazer redeploy de producao na Vercel.
4. Confirmar que `https://ts-point.vercel.app/login` nao retorna mais 404.
5. No Supabase Auth, garantir `Site URL = https://ts-point.vercel.app`.
6. Configurar deploy do `face-api` na Fly.
7. Configurar secrets da Fly:
   - `DATABASE_URL`
   - `INTERNAL_SECRET`
   - `FACE_FAKE_MODE`
   - `FACE_MODEL`
   - `FACE_DET_SIZE`
   - `FACE_THRESHOLD`
8. Atualizar `FACE_API_URL` na Vercel apontando para a URL Fly da Face API.
9. Finalizar/validar motor facial real (`insightface`, `onnxruntime`, `opencv-python-headless`) em Fly/Linux.
10. Trocar `FACE_FAKE_MODE=1` para `FACE_FAKE_MODE=0` somente depois que o motor real estiver carregando.
11. Apagar embeddings fake e recadastrar rostos com motor real no banco Supabase.
12. Para producao, manter secrets no painel da Vercel/Fly, nao depender de `.env.local`:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `FACE_API_URL`
   - `FACE_API_SECRET`
   - Supabase envs
   - `OAUTH_AUTO_PROVISION_*`
13. Garantir que `AUTH_SECRET` nao esta como `change-me`.
14. Garantir que `FACE_API_SECRET` e `INTERNAL_SECRET` tenham o mesmo valor.
15. Rodar validacoes:

```powershell
cd web
npm run lint
npm test
npm run build
```

## Observacoes Importantes

- `fly.toml` na raiz esta configurado para build do `face-api/Dockerfile.fly`, nao para o web.
- Tambem existe `face-api/fly.toml` com `app = "digitaliza-sodexo-face-api"`.
- `face-api/.env` nao existia quando verificado.
- `psql` nao estava instalado/no PATH.
- Docker foi instalado, mas nao foi usado porque WSL nao estava instalado e o usuario preferiu seguir com Fly.io.
- O banco remoto Fly foi acessado localmente por proxy, nao por conexao publica direta.
