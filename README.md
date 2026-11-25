<div align="center">

<img src="public/flux-mark.svg" width="96" alt="Flux logo" />

# Flux

**Gestão de tarefas e finanças pessoais em um só lugar. Self-hosted, em produção com usuários reais.**

Inspirado em Trello e monday.com, feito do zero em JavaScript puro, sem framework no front-end.

**🌐 No ar:** [rsc3-flux.duckdns.org](https://rsc3-flux.duckdns.org)

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Google Cloud](https://img.shields.io/badge/Google_Cloud-Compute_Engine-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/compute)

</div>

---

## ✨ O que tem

### Visões das tarefas
- 📋 **Kanban** com drag & drop de cards e de listas
- 📊 **Tabela** agrupada por lista, com resumo (distribuição de prioridade, intervalo de datas)
- 🗂️ **Cartões** em grid estilo galeria
- 📅 **Calendário** mensal com os cards no dia do vencimento
- 📈 **Cronograma** (Gantt) com barras posicionadas no tempo
- 📉 **Dashboard** do quadro com KPIs e gráficos SVG (sem lib de gráfico)
- ☀️ **Hoje**: o que vence hoje e nos próximos 7 dias, juntando todos os quadros

### Finanças
- 💰 **Receitas e despesas** com categorias hierárquicas
- 🔁 **Lançamentos recorrentes**
- 🧮 **Resumo** por período e por categoria

### Workspace e colaboração
- 🤝 **Múltiplos quadros** num workspace
- 👥 **Convite por link único** (uso único), com lista de e-mails permitidos e acesso a vários quadros
- 🛡️ **Permissões por papel**: Owner, Admin, Membro
- 🕘 **Atividade**: linha do tempo de tudo que foi criado, editado ou movido
- 📊 **Analytics do workspace**: números cruzados entre quadros

### Cards
- 🏷️ **7 categorias** coloridas (Design System, Crítico, Pesquisa, Feature, Documentação, Bug, UI Design)
- 🎯 **Prioridade** (Alta / Média / Baixa) com indicador lateral colorido
- 📅 **Datas** de início e vencimento, com aviso de atraso
- ✅ **Checklist** dentro do card
- 👤 **Responsável** com avatar gerado (DiceBear)
- 🔎 **Busca e filtros** combinados (categoria, prioridade, responsável, status)

### Administração
- 🧑‍💼 **Painel Admin**: suspender, remover e redefinir senha de usuários
- 🚩 **Feature flags** ligadas e desligadas sem novo deploy
- 🐛 **Reportar bug** de dentro do app, com envio por e-mail (Resend)
- 📣 **Novidades**: modal com as notas de versão (versão atual em `server/version.js`)
- ❓ **Como usar**: guia rápido em português dentro do app

### Personalização e mobile
- 🌗 **Tema Light / Dark / System**, cor primária customizável, modo compacto e alto contraste
- 📱 **PWA instalável** (Android e iOS), abre em tela cheia com ícone na home
- 🎨 **Responsivo** com sidebar em drawer, bottom nav e botão flutuante
- ⚡ **Service Worker** com cache do app-shell

### Segurança
- 🔐 **bcrypt** com comparação em tempo constante (defesa contra enumeração de e-mail)
- 🍪 **Sessões em SQLite** com cookie httpOnly, SameSite=Lax e expiração de 30 dias
- 🛡️ **Rate limiting** (5 tentativas a cada 15 min em login e cadastro)
- ✅ **Validação de todos os inputs** (whitelist de prioridade/papel/categoria, regex de datas, cores e e-mail)
- 🚫 **Sem CORS** (app same-origin), o que fecha a porta para CSRF entre origens
- 🧹 **XSS-safe**: escape em toda interpolação no front
- 🔑 **Gitleaks no CI** e hook de pre-commit contra commit acidental de segredos

---

## 🛠 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript puro (sem framework), SortableJS para o drag & drop |
| Tipografia e ícones | [Manrope](https://fonts.google.com/specimen/Manrope) e [Lucide](https://lucide.dev/) (SVG inline) |
| Backend | Node.js 20 + Express 5, API REST |
| Banco | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), migrations no boot |
| Auth | bcryptjs + cookie-parser + express-rate-limit |
| E-mail | [Resend](https://resend.com/) (reporte de bug) |
| Produção | VM no Google Cloud (Compute Engine), Nginx como proxy reverso, HTTPS com renovação automática, PM2, backup automático do banco no Cloud Storage |
| CI | GitHub Actions com Gitleaks |

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

## ☁️ Como roda em produção

```
Usuário ──HTTPS──> Nginx (proxy reverso, certificado com renovação automática)
                     └──> Node.js + Express (PM2, reinicia sozinho no boot)
                            └──> SQLite em /var/lib/flux ──backup diário──> Cloud Storage
```

- **VM** e2-micro no Google Cloud, com IP estático e domínio no DuckDNS.
- **Variáveis de ambiente** num arquivo fora do repositório (`chmod 600`), lidas pelo PM2.
- **Cadastro fechado** em produção: novos usuários entram por convite.

O passo a passo de operação (deploy, logs, backup e restauração, certificado, troubleshooting) está no
[RUNBOOK.md](RUNBOOK.md).

Para subir o seu, numa VM Ubuntu 22.04+:

```bash
# 1. Node.js 20 + git + build tools
sudo apt update && sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Clonar e instalar
git clone https://github.com/rsc3-pixel/Flux.git
cd Flux
npm install --omit=dev

# 3. Pasta de dados persistente fora do repo
sudo mkdir -p /var/lib/flux && sudo chown $USER /var/lib/flux

# 4. PM2 (processo 24/7, restart automático no boot)
sudo npm install -g pm2
DATA_DIR=/var/lib/flux NODE_ENV=production PORT=3000 \
  pm2 start server/server.js --name flux
pm2 save
pm2 startup   # siga a instrução que ele imprimir

# 5. Nginx na frente, com HTTPS (Let's Encrypt / certbot)

# 6. Depois de criar sua conta, fechar o cadastro:
pm2 set flux:env ALLOW_REGISTRATION false
pm2 restart flux --update-env
```

Também há um `Dockerfile` para quem prefere subir em container.

---

## 📁 Estrutura

```
Flux/
├── server/
│   ├── server.js     # Express app + rotas REST
│   ├── auth.js       # bcrypt, sessões, helpers de permissão
│   ├── db.js         # schema SQLite + migrations seguras
│   └── version.js    # versão atual + notas de versão (modal "Novidades")
├── public/
│   ├── index.html    # SPA: tela de login, visões e modais
│   ├── styles.css    # design tokens via CSS vars + dark mode
│   ├── app.js        # estado, renderização, cliente da API, animações
│   ├── manifest.json # PWA manifest
│   ├── sw.js         # service worker
│   └── vendor/       # SortableJS
├── scripts/          # CLI para gerenciar usuários e migrações pontuais
├── RUNBOOK.md        # manual de operação em produção
└── Dockerfile        # imagem de produção (opcional)
```

---

## 🔧 Variáveis de ambiente

| Var | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `NODE_ENV` | (nenhum) | `production` ativa cookie `Secure` |
| `DATA_DIR` | pasta do servidor | Onde fica o `database.sqlite` (em produção: `/var/lib/flux`) |
| `ALLOW_REGISTRATION` | `true` | `false` esconde a aba de cadastro e bloqueia o endpoint. Exceções: quando ainda não há nenhum usuário e quem chega por convite com e-mail permitido. |
| `RESEND_API_KEY` | (nenhum) | Chave do Resend, só para o botão "Reportar bug" |

---

## 📋 Status do projeto

✅ **Em produção** desde 04/2026, com usuários reais. Versão atual no `package.json`.

🚧 **Próximas ideias** (não prometidas):
- Comentários nos cards
- Anexos (com upload)
- Mais de um workspace por usuário
- Notificações push
- Recuperação de senha por e-mail

---

## 🤝 Contribuindo

Veja o [CONTRIBUTING.md](CONTRIBUTING.md).

---

<div align="center">

Feito com ☕ no Brasil 🇧🇷

</div>
