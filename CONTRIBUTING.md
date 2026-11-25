# Contribuindo com o Flux

## Ambiente

```bash
npm install
npm start          # http://localhost:3000
```

O banco local fica em `server/database.sqlite` e é criado no primeiro boot. Ele é separado do banco de produção
e não vai para o git.

## Decisões de arquitetura

| Decisão | Por quê |
|---|---|
| **JavaScript puro no front**, sem framework | O app é uma SPA pequena; um framework traria build e dependências sem ganho proporcional |
| **SQLite** (better-sqlite3), não Postgres | Um processo, um arquivo, backup é copiar o arquivo. Cabe com folga numa VM e2-micro |
| **Sessão em cookie httpOnly**, não JWT | Logout e expiração são um `DELETE` na tabela `sessions`; JWT exigiria lista de revogação |
| **Migrations no boot** (`server/db.js`) | Cada alteração de schema é idempotente (`IF NOT EXISTS`, checagem de coluna), então subir o servidor sempre deixa o banco na versão certa |
| **Sem CORS** | Front e API são same-origin |
| **Um workspace por usuário** | Escopo atual; trocar de workspace é uma evolução planejada, não um bug |

## Convenções

- **Comentários no código em inglês**; **mensagens para o usuário em português**.
- **Toda rota valida a entrada** contra whitelist ou regex antes de tocar no banco, e confere se o usuário tem
  acesso ao quadro (evita IDOR).
- **Alteração de schema** entra em `server/db.js` como migration idempotente. Nunca editar uma tabela à mão em
  produção.
- **Ação que muda dado** registra no `activity_log` com o helper `logActivity()` (exceto ações de alta frequência
  e baixo valor, como marcar item de checklist).
- **Nova versão**: atualizar `server/version.js` (versão + nota no topo de `releases`) e o `version` do
  `package.json`. A nota aparece no modal "Novidades".
- **Service worker**: ao mudar arquivos estáticos, subir a versão do cache em `public/sw.js`, senão o celular
  continua servindo a versão antiga.

## Antes de abrir um pull request

1. Testar a rota alterada com `curl` (ou pela UI) logado como Owner e como Membro.
2. Conferir o fluxo no celular (largura de 375 px) e no desktop.
3. Não commitar `.env`, banco ou chaves. O CI roda o Gitleaks em todo push e o hook em `scripts/install-hooks.sh`
   faz a mesma checagem localmente.

## Operação em produção

Deploy, logs, backup e troubleshooting estão no [RUNBOOK.md](RUNBOOK.md).
