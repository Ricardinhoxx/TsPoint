# Guia De Design

Este documento registra o padrao visual atual do Digitaliza-Sodexo para manter as proximas telas consistentes, principalmente no uso mobile.

## Objetivo Visual

O app deve parecer uma ferramenta operacional: limpo, direto, confiavel e facil de usar repetidas vezes. A prioridade e leitura rapida, botoes claros, tabelas organizadas e fluxos de presenca sem distracoes.

Evite transformar as telas internas em landing page. A primeira tela depois do login deve continuar sendo utilitaria e focada em acao.

## Paleta

Tokens principais ficam em `web/src/app/globals.css`.

- Fundo do app: `--color-bg: #f5f7fb`
- Superficie principal: `--color-surface: #ffffff`
- Texto principal: `--color-text: #172033`
- Texto secundario: `--color-muted: #667085`
- Borda: `--color-border: #cfd8e6`
- Borda suave: `--color-border-soft: #e6ebf2`
- Acao primaria: `--color-primary: #1057d8`
- Hover primario: `--color-primary-hover: #0b46b2`
- Sucesso/acento: `--color-accent: #0f9f6e`
- Perigo: `--color-danger: #b42318`
- Aviso: `--color-warning: #b54708`
- Login/fundo de marca: `#1d283f`

Notas:

- A tela de login usa o visual escuro solido original.
- Telas internas usam fundo claro, cards brancos e azul apenas para acoes principais.
- Evite criar telas dominadas por uma unica cor. Use o azul para acao, nao para decorar tudo.

## Tipografia

- Fonte base: `var(--font-poppins)`.
- Titulos `h1` e `h2`: fonte `"Hero"` quando disponivel.
- Nao usar `letter-spacing` negativo. Em mobile isso aperta texto e piora legibilidade.
- Tamanho de titulo em paineis deve ser contido. Hero-scale deve ficar apenas em telas realmente introdutorias.

## Formas E Espacamento

- Raio padrao: `--radius-0: 8px`.
- Cards, inputs, selects, modais e botoes seguem esse raio.
- Indicadores pequenos, como quadrados de status, podem continuar com canto reto.
- Cards usam sombra leve (`--shadow-sm`) para separar superficies sem pesar o visual.
- Evite card dentro de card quando puder usar secao, tabela ou grid direto.

## Componentes Base

### Botoes

- Botao primario: acao principal da tela ou fluxo.
- Botao secundario: navegacao, cancelar, editar, apagar e acoes auxiliares.
- Botoes devem ter no minimo `42px` de altura para toque em celular.
- Evite textos longos em botoes mobile. Prefira "Capturar" em vez de "Capturar 1 frame".

### Inputs E Selects

- Altura minima de `42px`.
- Sempre usar `label` visivel.
- Campos devem ocupar largura total dentro do container em mobile.

### Tabelas

- Tabelas ficam dentro de `.tableShell`.
- Em telas menores, `.tableShell` permite rolagem horizontal.
- Cabecalho de tabela usa fundo claro e texto em uppercase pequeno.

### Chips

- `storeChip` representa loja/unidade.
- Deve ser usado para informacao contextual curta, nao para botoes.

## Login

Arquivos principais:

- `web/src/app/login/page.tsx`
- `web/src/app/globals.css`

Padrao atual:

- Fundo escuro solido baseado em `#1d283f`.
- Card e bloco de introducao tambem usam o mesmo tom escuro.
- Logo centralizado.
- Alternancia `Entrar` / `Criar conta` em controle segmentado.
- Inputs com fundo translucido escuro e texto branco.

Importante:

- Nao trocar o login para gradientes decorativos ou fundos com formas chamativas.
- Manter alto contraste e leitura clara.

## Tela Minha Unidade

Arquivo principal:

- `web/src/app/unidade/page.tsx`

Padrao desktop:

- Header com titulo, funcao, unidade e acoes visiveis.
- Navegacao principal em botoes horizontais:
  - Admin: atribuicoes
  - Cadastrar colaborador
  - Presenca
  - Registrar diarista
  - Registrar por camera

Padrao mobile:

- Acoes horizontais somem.
- Aparece um botao de tres pontos (`mobileNavTrigger`).
- Ao tocar, abre `mobileNavPanel` com as abas/acoes.
- O painel deve ser curto, alinhado a direita e caber em `calc(100vw - 32px)`.

Ao adicionar novas abas:

1. Adicione no desktop em `.desktopNavActions`.
2. Adicione tambem no painel mobile `.mobileNavPanel`.
3. Se a acao abrir modal, feche o menu antes de abrir o modal.

## Camera E Registro De Presenca

Arquivo principal:

- `web/src/components/CameraModal.tsx`

CSS principal:

- `.cameraModal`
- `.cameraVideoStage`
- `.faceCard`
- `.cameraActions`
- `.cameraResultCard`

Desktop:

- O feedback do reconhecimento fica ao lado do rosto quando ha espaco.
- Mostra identificacao, nome, unidade e score para admin.

Mobile:

- Modal ocupa quase a tela toda.
- O video usa proporcao vertical (`3 / 4`) e `object-fit: cover`.
- O feedback de reconhecimento vira uma barra no rodape do video.
- Nome e unidade usam `overflow-wrap: anywhere` para nao sair da tela.
- Acoes ficam empilhadas:
  - Capturar
  - Confirmar presenca, quando houver match
  - Dica curta

Regra importante:

- Nunca posicionar o card de identificacao lateralmente no mobile. Ele deve ficar no rodape do video para nao esconder o rosto nem sair da tela.

## Breakpoints

Breakpoints usados hoje:

- `1120px`: reorganizacao de layouts grandes de presenca.
- `1024px`: presenca e dashboards reduzem colunas.
- `820px`: telas internas viram mobile/tablet; navegacao de unidade troca para menu.
- `720px`: grids de presenca ficam mais compactos.
- `640px`: camera vira layout mobile dedicado.
- `480px`: login ganha ajustes pequenos de largura e tipografia.

Ao criar novos estilos mobile, prefira reaproveitar esses breakpoints.

## Acessibilidade E Texto

- Botao de tres pontos deve ter `aria-label="Abrir navegacao"` e `aria-expanded`.
- Modais usam `role="dialog"` e `aria-modal="true"`.
- Feedback dinamico importante usa `aria-live="polite"`.
- Textos de erro devem ser objetivos e acionaveis.
- Evite instrucoes longas dentro da interface. Use labels curtos e estados claros.

## Checklist Para Novas Telas

- Funciona em largura de celular sem overflow horizontal.
- Botoes de toque tem pelo menos `42px` de altura.
- Textos longos quebram linha corretamente.
- A acao principal esta clara.
- Tabela, se existir, esta dentro de `.tableShell`.
- Menu mobile existe se houver mais de tres acoes no topo.
- Nao ha elementos sobrepostos no video/camera.
- Login manteve o fundo escuro solido.

## Validacao

Depois de alterar design:

```powershell
cd web
npm run lint
npm run build
```

Para testar camera no celular, use HTTPS. Um link por IP local com `http://192.168...` pode bloquear camera no navegador mobile.
