# Flux — Handoff Document

> **App de gestão de tarefas estilo Trello/monday.com.** Web app responsivo + PWA. Usuário é desenvolvedor brasileiro com forte HTML/CSS/JS + SQL, sem experiência em frameworks JS. Conversar em português.

> **Pasta**: `c:/Users/CHONGRENATOO/Documents/MeuTrello/` (nunca foi renomeada — produto se chama Flux mas folder ainda é MeuTrello pra preservar paths).

---

## Stack

- **Backend**: Node.js 20 + Express 5 + better-sqlite3 + bcryptjs + cookie-parser + express-rate-limit
- **Frontend**: HTML + CSS (vanilla, sem framework) + JS vanilla. Manrope (Google Fonts), Lucide icons inline
- **Auth**: cookie httpOnly com sessão em SQLite (sem JWT)
- **Avatares**: DiceBear `personas` style via URL (sem upload)

## Estrutura

```
MeuTrello/                  # folder ainda se chama assim, produto = Flux
├── server/
│   ├── server.js           # Express + todas as rotas API
│   ├── auth.js             # bcrypt, sessões, permissões, logActivity helper
│   ├── db.js               # SQLite + schema + migrations + DATA_DIR support
│   └── database.sqlite     # banco local (em /data quando containerizado)
├── public/
│   ├── index.html          # SPA (auth screen + appShell + 9 views + 4 modais)
│   ├── styles.css          # ~1500 linhas, design tokens via CSS vars + dark mode
│   ├── app.js              # ~1700 linhas, state + render + API + ícones + animações
│   ├── flux-logo.svg       # logo grande (auth screen)
│   ├── flux-mark.svg       # marca compacta (favicon, sidebar)
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # service worker (cache app-shell)
├── scripts/
│   ├── create-user.js      # npm run create-user -- email pass "Nome"
│   ├── delete-user.js      # npm run delete-user -- email --yes
│   └── list-users.js       # npm run list-users
├── Dockerfile              # Node 20-bookworm-slim, multi-step com build deps
├── .dockerignore
├── fly.toml                # config Fly.io (app="flux-CHANGE-ME", region=gru, volume flux_data)
├── package.json
└── CLAUDE.md               # este arquivo
```

---

## O que já foi feito (iterações)

### Iter 1 — Visual Refresh
- Sidebar 256px à esquerda (desktop), drawer no mobile (hamburger)
- Bottom nav mobile (Kanban/Calendário/Dashboard/Settings) + FAB azul
- Settings page funcional: tema (Light/Dark/System), color picker, modo compacto, alto contraste, mostrar Card IDs — tudo persistido em `localStorage` chave `mt_settings`
- Design tokens via CSS variables, dark mode funcional via `[data-theme="dark"]`

### Iter 2 — Categorias + Avatares
- Coluna `category` em cards, 7 categorias whitelist com cores (DESIGN SYSTEM, CRÍTICO, PESQUISA, FEATURE, DOCUMENTAÇÃO, BUG, UI DESIGN)
- Avatar pile no header do board (DiceBear personas)
- Filtros funcionais (Categoria/Prioridade/Responsável/Status) com badge contador
- Mini-avatar do responsável dentro do card

### Iter 3 — Workspace + Activity + Analytics
- Tabela `workspaces` (1 por user, single-workspace MVP) + `workspace_id` em boards
- Tabela `activity_log` + helper `logActivity()` engatado em 15 endpoints CUD
- Sidebar tem nav "Atividade" e "Analytics"
- View Atividade: timeline cronológico com avatares + texto humanizado + separadores por dia
- View Analytics: 5 KPIs (boards/lists/cards/membros/concluídos 7d) + cards por board (bar) + top responsáveis (bar) + curva de atividade últimos 30 dias (SVG line+area)
- Migração suave: cada user existente ganha workspace "Pessoal" no boot

### Sistema de ícones animados
- Lucide SVG inline em `app.js`. 24 ícones, função `injectIcons()` substitui `data-icon="nome"` por SVG
- 8 animações no click: pop, spin, wiggle, shake, bounce, slide, tilt, flip
- Cada ícone tem `data-anim`. Settings = spin, trash = shake, pencil = wiggle, etc
- Respeita `prefers-reduced-motion`

### Branding
- Renomeado de "MeuTrello" → **"Flux"** (folder mantida)
- Logo SVG geométrica feita em `public/flux-logo.svg` (3 setas formando F) + versão compacta `flux-mark.svg` pra favicon

### Segurança (já blindado)
- bcrypt cost 10 + dummy verify pra timing-safe
- Rate limit 5/15min em login/register
- Cookie httpOnly + SameSite=lax + Secure em prod
- Sessões com `expires_at` (30d) + cleanup automático
- Validação raiz de tipos: priority, dates, color, role, category (whitelist)
- Body limit 100KB
- IDOR/CSRF/XSS/Path traversal/Prototype pollution todos testados e bloqueados
- Generic error handler (sem stack traces vazando)
- CORS removido (app é same-origin)

### PWA + Deploy prep
- `manifest.json` + meta tags iOS + service worker básico
- Dockerfile com better-sqlite3 nativo
- `fly.toml` configurado pra região São Paulo, volume persistente, máquina sempre ligada
- `DATA_DIR` env var (db.js usa pra encontrar SQLite em `/data` no container)
- `ALLOW_REGISTRATION` env var (default on; quando off, esconde aba Criar Conta + retorna 403)
- Endpoint público `/api/config` retorna `{ registrationEnabled }`

---

## Status atual: aguardando deploy

**Tudo pronto pra deploy no Fly.io. Usuário decidiu pagar ~R$15/mês (Fly.io) em vez de Oracle Cloud free (que é mais complexo de configurar).**

### Próximos passos quando o usuário voltar:

1. Verificar se ele já instalou flyctl (`iwr https://fly.io/install.ps1 -useb | iex` no PowerShell)
2. Trocar `flux-CHANGE-ME` em [fly.toml](fly.toml) por nome único escolhido por ele
3. Guiar nos comandos:
   ```bash
   fly auth login
   fly launch --no-deploy --copy-config --name <nome> --region gru
   fly volumes create flux_data --region gru --size 1 --yes
   fly deploy
   fly secrets set ALLOW_REGISTRATION=false  # depois que ele criar conta no app
   ```

---

## Como rodar local (se precisar)

```bash
npm install
npm start
# abre http://localhost:3000
```

Login do usuário (no banco local): **rsc3@cesar.school** (senha que ele criou).

---

## Decisões importantes (pra não voltar atrás)

- **SQLite** em vez de Postgres — escolhido pela simplicidade e match com skills do user. Fly.io tem volume persistente que funciona bem.
- **Vanilla HTML/CSS/JS** sem framework — user prefere assim, e o app não precisa de SPA framework
- **DiceBear** por URL (não self-hosted) — privacidade aceitável pq user já é dono do email
- **Single workspace por user** (não multi) — escopo Iter 3, multi-workspace seria Iter 3b se ele pedir
- **Dark mode via CSS vars** — não precisou de lib externa
- **Lucide icons inline** — sem CDN, funciona offline, MIT
- **Cookie name `mt_session` + chave `mt_settings`** — mantidos com prefixo "mt" pra não invalidar sessões/configs existentes ao renomear pra Flux

## Não fazer (decisões deliberadas)

- ❌ Não renomear a pasta MeuTrello → Flux (quebraria caminhos)
- ❌ Não adicionar fluxo "Esqueci senha" agora (user disse "deixa pra depois", usar `npm run create-user` se precisar resetar)
- ❌ Não migrar pra React/Vue (user quer vanilla)
- ❌ Não publicar nas lojas de app — PWA já cobre o caso
- ❌ Não implementar workspace switcher (Iter 3b futuro)

## Convenções

- Conversar em **português brasileiro**, tom direto e técnico
- Comentários no código em **inglês** (mais universal)
- Mensagens de erro pro usuário em **português**
- Sempre testar via curl/node antes de declarar pronto
- **Nunca claim que algo "está pronto" sem ter visto funcionar** — se não posso testar visual, dizer explicitamente
