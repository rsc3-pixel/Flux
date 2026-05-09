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
├── RUNBOOK.md              # manual operacional (SSH, deploy, backup, troubleshooting)
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

### Iter 4 — Checklist + categoria LISTA (v1.2.0, 2026-04-26)
- **Tabela `checklist_items`** (id, card_id, text, completed, position, created_at) com FK CASCADE em cards
- **Categoria `lista`** adicionada à whitelist de categorias (cor `#059669` verde-esmeralda)
- **API**: 4 endpoints novos
  - `POST /api/cards/:id/checklist` — adiciona item
  - `PATCH /api/checklist/:itemId` — toggle ou edita texto
  - `DELETE /api/checklist/:itemId` — remove
  - `PATCH /api/cards/:id/checklist/reorder` — reordena (transação)
- **Activity log**: registra `checklist.item_added` e `checklist.item_removed` (toggle NÃO loga — alta frequência, baixo valor)
- **GET /api/boards/:id**: agora traz `checklist_items` aninhado em cada card

#### UX por categoria
| Categoria | Como o checklist aparece |
|---|---|
| Qualquer outra | Badge `☑ 2/5` no card preview; checklist editado dentro do **modal Editar Card** |
| **LISTA** | Card mostra **preview read-only** (linhas com checkbox visual ✓ / texto riscado); click no card abre o **modal Lista dedicado** (`#listaModal`) — separado do modal Editar Card |

#### Modal Lista dedicado (estilo Samsung Notes)
- Header: input grande com título editável + botão X
- Body: items como `<checkbox + input>` rows; sempre uma linha "Adicionar item..." no fim (buffer)
- Footer: "Excluir lista" (esquerda) / "Concluir" (direita)
- **Atalhos**: Enter na buffer cria item e mantém foco (rapid-fire); Backspace em texto vazio deleta o item; Enter no título pula pro primeiro item
- Auto-foco na buffer ao abrir
- Fecha (X / Concluir / click fora) → blur dispara save pendente + recarrega o board
- **Por que separado do modal Editar Card**: tentamos editar inline no card (no quadro) e em modal compartilhado, ambos brigaram com Sortable.js (drag&drop intercepta clicks/touchs em inputs). Modal dedicado é a única abordagem que isola a edição do drag.

### Versão na sidebar
- Texto "vX.Y.Z" em cinza claro abaixo do botão "Reportar bug"
- Populado pelo `checkWhatsNew()` que já consultava `/api/version`

### What's New behavior (v1.2.0+)
Antes mostrava todo o histórico e não marcava como visto se fechado pelo X. Agora:
- **Primeira visita** (sem `mt_seen_version` no localStorage): silenciosamente marca como visto, NÃO mostra modal
- **Versão nova publicada**: mostra **só** o release mais recente (não backfill)
- **Qualquer forma de fechar** (OK / X / click no backdrop): marca como visto. Não aparece de novo até a próxima versão.

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
- `ALLOW_REGISTRATION` env var (default on; quando off, esconde aba Criar Conta + retorna 403). **Exceção desde v1.4.0**: se a request vier com `inviteToken` e o email digitado bater com a whitelist do convite, o registro passa mesmo com `false`.
- Endpoint público `/api/config` retorna `{ registrationEnabled }`

---

## Status atual: ✅ DEPLOYED AND LIVE em produção (2026-04-26)

**URL:** **https://rsc3-flux.duckdns.org**

Repo público: https://github.com/rsc3-pixel/Flux

> Manual operacional completo está em **[RUNBOOK.md](RUNBOOK.md)** — leia antes de operar a VM. Tudo abaixo é só o panorama; o RUNBOOK tem comandos prontos.

### Production environment

| Item | Valor |
|---|---|
| Plataforma | Google Cloud Compute Engine (e2-micro, free tier permanente) |
| OS | Ubuntu 24.04 LTS |
| Zona | `us-west1-a` |
| Projeto GCP | `chrome-energy-403306` |
| VM name | `flux` |
| IP externo | `136.109.172.191` (estático, reservado como `flux-static-ip` em us-west1) |
| Domínio | `rsc3-flux.duckdns.org` (DuckDNS, conta `chongrenato@gmail.com`) |
| HTTPS | Let's Encrypt via certbot, auto-renovação via systemd timer |
| Reverse proxy | nginx (`/etc/nginx/sites-available/flux`) → 127.0.0.1:3000 |
| Process manager | PM2 + systemd (`pm2-CHONGRENATOO.service`) |
| Banco | SQLite em `/var/lib/flux/database.sqlite` (fora do repo) |
| Repo na VM | `/home/CHONGRENATOO/Flux/` |
| Env vars do flux | `~/.flux.env` (chmod 600, fora do repo) lido por `~/flux-ecosystem.config.js` que passa pro PM2. **Editar com `nano ~/.flux.env` + `pm2 reload ~/flux-ecosystem.config.js`** (não `pm2 restart --update-env`, esse não re-lê o arquivo). |
| Backup automático | Cron diário 03:00 UTC → `gs://flux-backups-rsc3` (30 dias retention) |
| Firewall (GCP) | `allow-http-https` (TCP:80,443), `allow-ssh-iap` (TCP:22 from IAP). Porta 3000 não está mais exposta. |
| Cadastros públicos | **Trancados** (`ALLOW_REGISTRATION=false`). Onboarding: `npm run create-user` na VM **OU** convite com whitelist (v1.4.0+) — qualquer membro existente pode convidar via link, e o convidado consegue se registrar mesmo com cadastros fechados se o email bater com a whitelist. |
| Custo | **R$ 0,00/mês** (free tier permanente) |

### Coabitação na VM

A mesma VM hospeda também o **trabalho de faculdade do user** em `https://rsc3-boolean.duckdns.org` (Node app na porta 4000, server block próprio no nginx, certificado Let's Encrypt próprio). Convivem bem — RAM e CPU folgam.

### Pegadinhas conhecidas que custaram tempo

1. **`DATA_DIR` nos scripts npm**: `create-user`/`delete-user`/`list-users` caem num fallback (`server/database.sqlite` dentro do repo) se a env var `DATA_DIR=/var/lib/flux` não estiver setada. Resultado: usuário criado num "banco fantasma" que o app de produção não vê. **Fix permanente**: a env está exportada em `~/.bashrc` e `~/.profile` do usuário `CHONGRENATOO`. Toda sessão SSH nova já carrega. **Nota:** o processo flux **não depende disso** — pega `DATA_DIR` do `~/.flux.env` via ecosystem.config.js (ver "Env vars do flux" na tabela acima). O bashrc é apenas pros scripts npm que você roda manualmente.
2. **`scripts/delete-user.js` antigo falhava** porque confiava em `ON DELETE CASCADE` que não existia em `invites.created_by` nem em `boards.owner_id` (esse último foi adicionado via `ALTER TABLE`). Corrigido em 2026-04-26 — o script agora limpa essas tabelas antes de deletar o user, dentro de uma transação.
3. **`NODE_ENV=production` quebra login em HTTP**: ativa flag `Secure` no cookie de sessão, que o navegador descarta sem HTTPS. **Não rodar prod em HTTP**.
4. **GCP Browser SSH é frágil**: precisou habilitar Cloud IAP API + criar regra de firewall pra `35.235.240.0/20:22`, mas mesmo assim ficou instável. Use `gcloud compute ssh flux --zone=us-west1-a` do PowerShell local.
5. **IP externo efêmero muda quando a VM reinicia**: aconteceu em 2026-04-26 — VM rebootou (causa não investigada), ganhou IP `136.109.172.191` em vez de `34.168.140.230`, DuckDNS continuou apontando pro IP velho e tudo ficou fora do ar. Fix: o IP atual foi promovido a estático (`flux-static-ip` em us-west1). IP estático **associado a VM em execução é gratuito** no GCP — só cobra se ficar reservado sem uso.
6. **`pm2 restart flux --update-env` NÃO recarrega o `.flux.env`** — só re-passa as envs que o shell atual tem. Pra realmente puxar valores novos do `~/.flux.env`, usa `pm2 reload ~/flux-ecosystem.config.js` (que re-executa o `loadEnvFile()` do ecosystem). Custou ~1h descobrindo isso em 2026-05-09 quando o bug report quebrou e a chave Resend nova "não pegava" mesmo após restart.
7. **`pm2 env <id>` mostra cache, não o env real** — pra ver o que está REALMENTE no processo, usa `sudo cat /proc/<PID>/environ | tr '\0' '\n'`. Cache do PM2 reflete o snapshot do último `pm2 save` ou do start, não mudanças posteriores. Mesma sessão de debug do item 6.
8. **Resend sandbox (`onboarding@resend.dev`) só envia pra um destinatário verificado** — o email da conta Resend (`chongrenato@gmail.com`). Se mudar `BUG_REPORT_TO` pra outro email sem ter domínio próprio verificado no Resend, retorna 403. Pra enviar pra qualquer destinatário precisa registrar domínio próprio (~R$50/ano) e verificar SPF/DKIM no painel Resend. DuckDNS **não funciona** (DNS compartilhado, não dá pra adicionar TXT na raiz).
9. **Resend revoga chaves expostas automaticamente** em poucos minutos quando detecta a chave em chats/repos públicos/Slack/Discord. Aconteceu 2x em 2026-05-09 quando chaves vazaram (chat e logs do gcloud SSH). Sempre tratar uma chave colada em qualquer ferramenta com log como já comprometida.

### Pendências antigas (lembretes)

- 🗝️ **Revogar GitHub PAT `flux-vm-deploy`** que foi usado pra clonar o repo na VM. Ainda ativo — user precisa deletar em https://github.com/settings/tokens. Não é mais necessário (clone já feito).

---

## Como rodar local (se precisar)

```bash
npm install
npm start
# abre http://localhost:3000
```

Login principal do user em produção: **chongrenato@gmail.com** (era `rsc3@cesar.school`, mas foi deletado em 2026-04-26 — escolheu a conta gmail como principal).

Banco local de dev fica em `server/database.sqlite` (separado do banco de produção, que mora em `/var/lib/flux/`).

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
- Antes de qualquer ação que afete estado público (`git push`, mudar firewall do GCP, mexer no nginx em prod), **pedir confirmação explícita ao user** — ele prefere autorizar caso a caso
- Pra qualquer comando que rode scripts npm na VM (`create-user`, `delete-user`, `list-users`), confirmar que `DATA_DIR=/var/lib/flux` está no env. Se rodar de outro contexto/usuário, prefixar manualmente. Nunca presumir.
