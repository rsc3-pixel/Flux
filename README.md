<div align="center">

<img src="public/flux-mark.svg" width="96" alt="Flux logo" />

# Flux

**Ferramenta de gestão e planejamento de tarefas — moderna, open-source, self-hosted.**

Inspirado em Trello e monday.com, feito do zero em vanilla JS sem frameworks pesados.

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Made in Brazil](https://img.shields.io/badge/made%20in-Brazil-009C3B?labelColor=FFDF00)](https://github.com/rsc3-pixel)

</div>

---

## ✨ O que tem

### 6 visualizações
- 📋 **Kanban** com drag & drop de cards e de listas
- 📊 **Tabela** agrupada por lista, com resumo (distribuição de prioridade, range de datas)
- 🗂️ **Cartões** em grid estilo galeria
- 📅 **Calendário** mensal com cards posicionados pela data de vencimento
- 📈 **Cronograma** (Gantt) com barras posicionadas no tempo
- 📉 **Dashboard** com KPIs e gráficos SVG (sem libs externas)

### Workspace + colaboração
- 🤝 **Múltiplos boards** num workspace
- 👥 **Convidar pessoas** por link único (one-time-use)
- 🛡️ **Permissões granulares**: Owner, Admin, Membro
- 🕘 **Activity log** com timeline cronológica de tudo que mudou
- 📊 **Analytics do workspace**: agregações cruzadas entre boards

### Cards ricos
- 🏷️ **7 categorias** coloridas (Design System, Crítico, Pesquisa, Feature, Documentação, Bug, UI Design)
- 🎯 **Prioridade** (Alta / Média / Baixa) com indicador lateral colorido
- 📅 **Datas** de início e vencimento (com aviso de atraso)
- 👤 **Responsável** com avatar gerado (DiceBear)
- 📝 **Descrição**, busca, **filtros** combinados (categoria + prioridade + responsável + status)

### Personalização
- 🌗 **Tema Light / Dark / System** (segue preferência do SO)
- 🎨 **Cor primária customizável** (paleta + HEX)
- 📏 **Modo compacto** (reduz padding dos cards)
- ♿ **Alto contraste** pra acessibilidade

### Mobile
- 📱 **PWA installável** (Android + iOS) — abre em tela cheia, ícone na home
- 🎨 **Responsivo** com sidebar drawer + bottom nav + FAB flutuante
- ⚡ **Service Worker** com cache app-shell (funciona parcialmente offline)

### Segurança
- 🔐 **bcrypt** com timing-safe comparison (defesa contra enumeração de email)
- 🍪 **Sessões em SQLite** com cookie httpOnly + SameSite=Lax + expiry de 30 dias
- 🛡️ **Rate limiting** (5 tentativas / 15min em login + register)
- ✅ **Validação raiz** de todos os inputs (whitelist de priority/role/category, regex de datas/cores/email)
- 🚫 **CORS desativado** (app é same-origin) → CSRF mitigado
- 🧹 **XSS-safe**: escape em toda interpolação, validação de tipos no banco

---

## 🛠 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript vanilla (zero frameworks) |
| Tipografia | [Manrope](https://fonts.google.com/specimen/Manrope) (Google Fonts) |
| Ícones | [Lucide](https://lucide.dev/) (SVG inline) |
| Avatares | [DiceBear](https://www.dicebear.com/) (URL-based) |
| Backend | Node.js 20 + Express 5 |
| Banco | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Auth | bcryptjs + cookie-parser + express-rate-limit |
| Deploy | Node.js direto numa VM (Google Cloud Compute Engine, Oracle Cloud, etc.) ou Docker |

---

## 🚀 Rodar localmente

```bash
git clone https://github.com/rsc3-pixel/Flux.git
cd Flux
npm install
npm start
```

Abra [http://localhost:3000](http://localhost:3000) e crie sua conta na primeira tela.

### Scripts úteis

```bash
npm start                                    # sobe o servidor
npm run create-user -- email senha "Nome"    # cria usuário sem usar a UI
npm run delete-user -- email --yes           # remove usuário (cascateia tudo)
npm run list-users                           # lista contas + sessões ativas
```

---

## ☁️ Deploy (VM Linux — exemplo GCP / Oracle / qualquer Ubuntu)

Numa VM Ubuntu 22.04+ com acesso SSH:

```bash
# 1. Instalar Node.js 20 + git + build tools
sudo apt update && sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Clonar e instalar
git clone https://github.com/rsc3-pixel/Flux.git
cd Flux
npm install --omit=dev

# 3. Criar pasta de dados persistente fora do repo
sudo mkdir -p /var/lib/flux && sudo chown $USER /var/lib/flux

# 4. Rodar com PM2 (mantém processo 24/7, restart automático no boot)
sudo npm install -g pm2
DATA_DIR=/var/lib/flux NODE_ENV=production PORT=3000 \
  pm2 start server/server.js --name flux
pm2 save
pm2 startup   # siga a instrução que ele imprimir

# 5. Liberar porta no firewall do provedor (GCP/Oracle/etc) p/ 3000 ou 80

# 6. Após criar sua conta, trancar cadastro:
pm2 set flux:env ALLOW_REGISTRATION false
pm2 restart flux --update-env
```

Custo: **gratuito** no free tier de GCP (e2-micro) ou Oracle Cloud Always Free.

Em produção real, recomenda-se colocar **Nginx** na frente como reverse proxy + **Let's Encrypt** pra HTTPS.

---

## 📁 Estrutura

```
Flux/
├── server/
│   ├── server.js     # Express app + todas as rotas REST
│   ├── auth.js       # bcrypt, sessões, helpers de permissão
│   └── db.js         # schema SQLite + migrations seguras
├── public/
│   ├── index.html    # SPA: auth screen + 9 views + 4 modais
│   ├── styles.css    # design tokens via CSS vars + dark mode
│   ├── app.js        # state + render + API client + animações
│   ├── flux-logo.svg # logo grande (auth screen)
│   ├── flux-mark.svg # marca compacta (favicon, sidebar)
│   ├── manifest.json # PWA manifest
│   └── sw.js         # service worker
├── scripts/          # CLI pra gerenciar usuários
└── Dockerfile        # imagem de produção (opcional, pra deploy via container)
```

---

## 🔧 Variáveis de ambiente

| Var | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `NODE_ENV` | (none) | `production` ativa cookie `secure` |
| `DATA_DIR` | `__dirname` | Pasta onde mora o `database.sqlite` (use `/data` em containers) |
| `ALLOW_REGISTRATION` | `true` | `false` desabilita cadastro novo (UI esconde aba + 403 no endpoint). Exceção: sempre permite quando ainda não há nenhum usuário. |

---

## 📋 Status do projeto

✅ **Funcional** — todas as features acima implementadas e funcionando.

🚧 **Próximas ideias** (não prometidas):
- Comentários nos cards
- Anexos (com upload)
- Multi-workspace (hoje cada user tem 1)
- Notificações push
- Reset de senha por email
- Workspace members (separado de board members)

---

## 🤝 Como contribuir

Por enquanto é um projeto pessoal. Se você quer adaptar pra você, faz fork à vontade.

---

<div align="center">

Feito com ☕ no Brasil 🇧🇷

</div>
