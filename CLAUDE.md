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
├── Dockerfile              # Node 20-bookworm-slim, multi-step com build deps (opcional, pra container)
├── .dockerignore
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
- Dockerfile com better-sqlite3 nativo (mantido como opção, mas deploy atual NÃO usa Docker)
- `DATA_DIR` env var (db.js usa pra encontrar SQLite fora do repo — `/var/lib/flux` na VM)
- `ALLOW_REGISTRATION` env var (default on; quando off, esconde aba Criar Conta + retorna 403)
- Endpoint público `/api/config` retorna `{ registrationEnabled }`

---

## Status atual: deploy em GCP Compute Engine (em andamento)

**Plataforma escolhida: Google Cloud Compute Engine (free tier, e2-micro, us-west1-a, Ubuntu 24.04).**

Fly.io foi descartado (user achou complexo / preferiu free tier). Arquivos `fly.toml` foram removidos do repo. Repo público: https://github.com/rsc3-pixel/Flux

### Como o deploy é feito (passo a passo na VM)

1. SSH via `gcloud compute ssh flux --zone=us-west1-a` (do PowerShell local). SSH no navegador do GCP exigiu habilitar a Cloud IAP API + criar regra de firewall pra range `35.235.240.0/20` na porta 22, mas mesmo assim ficou instável — gcloud CLI é mais confiável.
2. Instalar Node 20 + git + build-essential.
3. Clonar repo, `npm install --omit=dev`.
4. Pasta de dados em `/var/lib/flux` (fora do repo, sobrevive a `git pull`).
5. Rodar com PM2: `DATA_DIR=/var/lib/flux NODE_ENV=production PORT=3000 pm2 start server/server.js --name flux`.
6. `pm2 save && pm2 startup` pra subir junto com a VM.
7. Liberar porta no firewall do GCP (regra ingress TCP:3000 ou usar nginx + porta 80/443).
8. Acesso pelo IP externo da VM ou domínio.

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

- **SQLite** em vez de Postgres — escolhido pela simplicidade e match com skills do user. Em VM Linux mora em `/var/lib/flux/database.sqlite` (fora do repo, sobrevive a `git pull`).
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
