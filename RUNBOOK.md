# Flux — Manual de operação

> Comandos pra manter o Flux rodando em **https://rsc3-flux.duckdns.org**.
> Tudo aqui assume que você está conectado via SSH na VM (`gcloud compute ssh flux --zone=us-west1-a`).

---

## 📦 Env vars que o servidor usa

| Var | Obrigatória? | Default | Pra que serve |
|---|---|---|---|
| `DATA_DIR` | sim em prod | repo dir | Onde mora o `database.sqlite`. **DEVE** ser `/var/lib/flux` em produção. |
| `NODE_ENV` | sim em prod | — | `production` ativa cookie `Secure` (precisa de HTTPS). |
| `PORT` | não | `3000` | Porta do Express. |
| `ALLOW_REGISTRATION` | não | `true` | `false` esconde a aba "Criar conta" e bloqueia cadastros novos (com exceção pra quem chega via link de convite com email na whitelist — v1.4.0+). |
| `RESEND_API_KEY` | só pra bug report | — | Chave do Resend pra enviar emails de bug. |
| `BUG_REPORT_TO` | não | `chongrenato@gmail.com` | Email pra onde os bugs são enviados. |

### Onde elas moram em produção

Arquitetura de **single source of truth**:

```
/home/CHONGRENATOO/.flux.env                 (chmod 600, fora do repo)
  └─ source canônica de TODAS as env vars do flux
        ↓ (lido a cada pm2 reload do ecosystem)
/home/CHONGRENATOO/flux-ecosystem.config.js  (fora do repo)
  └─ executa loadEnvFile() e passa pro PM2 como env: {...}
        ↓
PM2 daemon → spawn flux com essas envs
```

**Conteúdo típico do `~/.flux.env`** (formato `KEY=value`, sem `export`, sem aspas):

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATA_DIR=/var/lib/flux
NODE_ENV=production
ALLOW_REGISTRATION=false
```

### Atualizar uma env var (workflow oficial)

```bash
nano ~/.flux.env                             # editar o que quiser
pm2 reload ~/flux-ecosystem.config.js        # re-executa loadEnvFile()
pm2 save                                     # snapshot pra resistir reboot
```

> ⚠️ **Atenção**: `pm2 restart flux --update-env` **NÃO é suficiente** — esse comando só re-passa o env do shell atual, não re-executa o ecosystem.config.js. Use `pm2 reload <ecosystem>` pra realmente puxar o `.flux.env` novo.

### Verificar qual env tá ativa de verdade no processo

```bash
# Direto do /proc do processo node — fonte da verdade absoluta
NEW_PID=$(pm2 jlist | python3 -c "import sys,json; print([p['pid'] for p in json.load(sys.stdin) if p['name']=='flux'][0])")
sudo cat /proc/$NEW_PID/environ | tr '\0' '\n' | grep -E '^(RESEND|DATA_DIR|ALLOW_REG|NODE_ENV)'
```

> Não use `pm2 env <id>` — ele mostra **cache**, pode estar desatualizado se você não recarregou o ecosystem.

### Persistência através de reboot

`~/.flux.env` + `~/flux-ecosystem.config.js` + `pm2 save` cobre tudo:
- ✅ Reboot da VM
- ✅ `sudo systemctl restart pm2-CHONGRENATOO`
- ✅ `pm2 reload`/`pm2 restart flux`
- ✅ Mudança de hardware do GCP

**Não dependa de `~/.bashrc` / `~/.profile`** pra envs do flux — bashrc roda só em shell **interativo**, e o systemd lança o PM2 daemon como non-interactive. (Exceção: `DATA_DIR` continua no bashrc também porque é usado pelos scripts NPM que você roda manualmente — ver seção abaixo.)

---

## ⚠ Variável de ambiente OBRIGATÓRIA: `DATA_DIR`

O banco de produção mora em `/var/lib/flux/database.sqlite`. Os scripts NPM (`create-user`, `delete-user`, `list-users`) só encontram esse banco se a env var `DATA_DIR=/var/lib/flux` estiver setada — caso contrário, eles caem num fallback (`server/database.sqlite` dentro do repo) e operam num banco completamente diferente do app.

Pra evitar isso, está exportada permanentemente no `.bashrc` e `.profile` do usuário `CHONGRENATOO`. Toda sessão SSH nova já carrega com `DATA_DIR=/var/lib/flux`.

**Se algum dia precisar rodar de outro shell ou conta**, confira primeiro:

```bash
echo "DATA_DIR=$DATA_DIR"
```

Se aparecer vazio, prefixa todos os comandos `npm run …` com:

```bash
DATA_DIR=/var/lib/flux npm run ...
```

---

## 🔌 Conexão SSH

No PowerShell da sua máquina:

```powershell
gcloud compute ssh flux --zone=us-west1-a
```

Pra sair: `exit` (ou só fecha a janela — não afeta o servidor).

---

## 🚀 Deploy de mudanças (atualizar código)

Depois de fazer `git push` no seu PC, na VM:

```bash
cd ~/Flux
git pull
npm install --omit=dev
pm2 restart flux
```

> O banco fica em `/var/lib/flux/database.sqlite` — fora do repo, não é tocado pelo `git pull`.

---

## 📣 Atualizar a tela de "Novidades"

Toda atualização do app deve ter uma entrada nova em [server/version.js](server/version.js). O modal "Novidades" mostra automaticamente todos os releases que o usuário ainda não viu.

**Passos quando publicar uma feature/fix nova:**

1. **No PC**, abra `server/version.js`.
2. **Bumpa a versão** em `package.json` (`"version": "1.1.0"` → `"1.2.0"`). Use semver:
   - Patch (`1.1.0` → `1.1.1`): bug fix
   - Minor (`1.1.0` → `1.2.0`): feature nova
   - Major (`1.1.0` → `2.0.0`): mudança que quebra algo (raro)
3. **Adiciona um bloco no TOPO do array `releases`** (ordem: mais novo primeiro):
   ```js
   {
     version: '1.2.0',
     date: '2026-05-10',
     notes: [
       '✨ Anexos em cards — agora dá pra colar imagens',
       '🐛 Correção do filtro de prioridade que sumia em mobile',
     ],
   },
   ```
4. **Se a release mexeu em `index.html`, `app.js` ou `styles.css`**, atualize também `public/sw.js` na linha do `const CACHE = 'flux-v...'` pra refletir a nova versão (ex: `'flux-v1.2.0'`). Sem isso, o service worker continua servindo o shell antigo nos celulares que já têm o app instalado.
5. **Commit + push** no GitHub.
6. **Na VM**: `cd ~/Flux && git pull && pm2 restart flux`.
7. Quando o usuário fizer login (ou abrir o app numa sessão já ativa), o modal aparece sozinho e marca a versão como vista no `localStorage`. Não vai aparecer de novo até a próxima atualização.

> Use emojis no início de cada nota pra deixar visual: ✨ feature, 🐛 fix, 🔧 melhoria, 🔒 segurança, ⚡ performance, 📱 mobile.

### Service worker — gotcha de cache no mobile

Desde v1.1.2 o SW usa **network-first pros arquivos críticos** (HTML/CSS/JS), então atualizações chegam logo na próxima visita. Mas o **nome do cache** ainda funciona como "selo": se você esquecer de bumpar a string `CACHE` em `public/sw.js`, o SW antigo continua usando a mesma "caixa" de cache e pode servir uma versão obsoleta de assets secundários (logos, vendor) por algum tempo. Sempre bumpa o `CACHE` junto com a versão.

Se um usuário disser "tá vendo a versão antiga no celular", primeiro pede pra ele:

1. Recarregar a página.
2. Se persistir: limpar dados do site (Chrome mobile → menu do site → "Limpar dados").
3. Se ele tem o PWA instalado: desinstala e reinstala.

---

## 👥 Gerenciar usuários

### Criar usuário (recomendado quando cadastro está fechado)

```bash
cd ~/Flux
npm run create-user -- email@dominio.com "senha-temporaria" "Nome Completo"
```

A pessoa loga com essa senha e depois troca em Settings.

### Listar usuários + sessões ativas

```bash
cd ~/Flux
npm run list-users
```

### Deletar usuário (cascateia tudo dele)

```bash
cd ~/Flux
npm run delete-user -- email@dominio.com --yes
```

---

## 🔐 Cadastros (abrir / fechar)

> Desde **v1.4.0** (convites com whitelist de emails), `false` é o padrão recomendado: pessoas convidadas via link continuam conseguindo criar conta normalmente, mas estranhos sem convite não conseguem.

### Fechar cadastros (recomendado em produção)

```bash
sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' ~/.flux.env
pm2 reload ~/flux-ecosystem.config.js
pm2 save
```

### Abrir cadastros (qualquer pessoa pode criar conta — uso pra demos / testes)

```bash
sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=true/' ~/.flux.env
pm2 reload ~/flux-ecosystem.config.js
pm2 save
```

### Verificar qual modo está ativo

Forma rápida (do **seu PC**, sem precisar SSH):

```bash
curl -s https://rsc3-flux.duckdns.org/api/config
# {"registrationEnabled":true} ou {"registrationEnabled":false}
```

Se quiser confirmar dentro da VM, use o método do `/proc` documentado na seção de env vars acima.

Ou abre `https://rsc3-flux.duckdns.org` numa aba anônima — se aparece a aba "Criar conta", está aberto.

---

## 📊 Logs e monitoramento

### Ver logs ao vivo

```bash
pm2 logs flux
```

(Ctrl+C pra sair)

### Ver últimas N linhas

```bash
pm2 logs flux --lines 50 --nostream
```

### Status dos processos

```bash
pm2 status
```

### Uso de memória / CPU

```bash
pm2 monit
```

(`q` pra sair)

---

## 🔄 Reiniciar serviços

### Reiniciar só o Flux

```bash
pm2 restart flux
```

### Reiniciar nginx (raramente necessário)

```bash
sudo systemctl reload nginx
```

### Reiniciar a VM inteira

```bash
sudo reboot
```

> Tudo sobe sozinho no boot (PM2 + nginx). Espera uns 30s e acessa o site.

---

## 💾 Backup automático (Cloud Storage)

Configurado em **2026-04-26**. Roda todo dia às **03:00 UTC (00:00 Brasília)** via cron, salva no bucket `gs://flux-backups-rsc3`, mantém os últimos 30 dias.

### Listar backups disponíveis

```bash
gcloud storage ls gs://flux-backups-rsc3/
```

### Forçar backup manual agora

```bash
/usr/local/bin/flux-backup.sh
```

### Ver logs do cron

```bash
tail -50 /var/log/flux-backup.log
```

### Restaurar um backup

```bash
# 1. Baixar backup desejado pra VM
gcloud storage cp gs://flux-backups-rsc3/database-2026-04-27.sqlite /tmp/restore.sqlite

# 2. Parar Flux pra liberar lock no DB
pm2 stop flux

# 3. Substituir banco em uso
cp /tmp/restore.sqlite /var/lib/flux/database.sqlite

# 4. Reiniciar Flux
pm2 start flux
```

### Onde fica a config

| Item | Caminho |
|---|---|
| Script de backup | `/usr/local/bin/flux-backup.sh` |
| Cron job | `/etc/cron.d/flux-backup` |
| Log | `/var/log/flux-backup.log` |
| Bucket | `gs://flux-backups-rsc3` |
| Retenção | 30 dias (configurada no script) |

### Onde editar a retenção

Edita a linha `RETENTION_DAYS=30` em `/usr/local/bin/flux-backup.sh`:

```bash
sudo nano /usr/local/bin/flux-backup.sh
```

---

## 💾 Backup manual do banco (alternativo)

### Copiar banco pra local seguro na VM

```bash
sudo cp /var/lib/flux/database.sqlite ~/flux-backup-$(date +%Y%m%d).sqlite
```

### Baixar banco pro seu PC (rodar do PowerShell local)

```powershell
gcloud compute scp flux:/var/lib/flux/database.sqlite ./flux-backup.sqlite --zone=us-west1-a
```

> Salva no diretório atual do PowerShell.

### Restaurar um backup

```bash
pm2 stop flux
sudo cp ~/flux-backup-XXXXXXXX.sqlite /var/lib/flux/database.sqlite
sudo chown $USER /var/lib/flux/database.sqlite
pm2 start flux
```

---

## 🔒 Certificado HTTPS

> O certbot já configura **renovação automática** via systemd timer. Você raramente precisa mexer aqui.

### Verificar quando vence

```bash
sudo certbot certificates
```

### Forçar renovação manualmente

```bash
sudo certbot renew
```

### Ver se a renovação automática está ativa

```bash
sudo systemctl status certbot.timer --no-pager
```

---

## 🧯 Troubleshooting

### Site fora do ar — "502 Bad Gateway"

Significa que o nginx está rodando mas o Flux não responde.

```bash
pm2 status                    # status do flux deveria estar 'online'
pm2 logs flux --lines 30      # vê o que tá quebrado
pm2 restart flux              # tenta reiniciar
```

### Site fora do ar — "Connection refused"

Significa que o nginx caiu.

```bash
sudo systemctl status nginx
sudo systemctl restart nginx
```

### Cookie de sessão não persiste (login "pisca" e volta)

Quase sempre é problema de HTTPS. Verifica:

```bash
curl -I https://rsc3-flux.duckdns.org    # tem que retornar 200
curl -I http://rsc3-flux.duckdns.org     # tem que retornar 301 redirect
pm2 env flux | grep NODE_ENV             # tem que ser 'production'
```

### Disco cheio

```bash
df -h    # ver espaço usado
```

Logs do PM2 podem crescer. Pra limpar:

```bash
pm2 flush
```

### Usuário criado mas senha "não pega"

Quase sempre é `DATA_DIR` faltando ao rodar `create-user` — o usuário foi parar num banco fantasma dentro do repo (`server/database.sqlite`) que o app de produção não enxerga. Pra confirmar:

```bash
echo "DATA_DIR=$DATA_DIR"   # tem que ser /var/lib/flux
ls ~/Flux/server/database.sqlite 2>&1   # NÃO deve existir
```

Se houver um `database.sqlite` órfão no repo, apaga ele junto com os arquivos auxiliares de WAL e recria o usuário com `DATA_DIR` setado:

```bash
rm -f ~/Flux/server/database.sqlite ~/Flux/server/database.sqlite-wal ~/Flux/server/database.sqlite-shm
DATA_DIR=/var/lib/flux npm run create-user -- email@dominio.com "senha-correta" "Nome"
```

---

## 🛡️ Proteção contra commit acidental de segredos

Duas camadas (defesa em profundidade):

### Camada 1 — GitHub Actions (`.github/workflows/gitleaks.yml`)

Roda automaticamente em **todo push e PR pra main**. Escaneia o histórico inteiro com [gitleaks](https://github.com/gitleaks/gitleaks) usando os padrões de `.gitleaks.toml` (Resend, DuckDNS + defaults pra AWS/GitHub/Slack/etc).

Se achar segredo → **falha o workflow** + comentário no PR. Não bloqueia o push em si (ele já passou nesse momento), mas você descobre rápido e dá pra rotacionar imediatamente.

### Camada 2 — Pre-commit hook local (opcional)

Bloqueia o commit ANTES dele acontecer. Bash puro, sem deps externas. Ativar uma vez:

```bash
bash scripts/install-hooks.sh
```

Daí em diante, todo `git commit` escaneia os arquivos staged. Se achar `re_xxxxx`, `ghp_xxxxx`, `sk-xxxxx`, etc, bloqueia com mensagem precisa (qual padrão + arquivo + linha).

Pra burlar (NÃO recomendado, só em emergência): `git commit --no-verify`.

### Testar se o hook funciona

```bash
echo 'RESEND_API_KEY="re_FAKE_TEST_chave_de_30_caracteres_aqui"' > /tmp/test.txt
cp /tmp/test.txt ./test-leak.txt
git add test-leak.txt
git commit -m "test"   # deve bloquear
rm test-leak.txt
git restore --staged test-leak.txt 2>/dev/null || true
```

Você deve ver:

```
✗ Pre-commit: secret patterns found in staged files:

  Pattern: re_[A-Za-z0-9_]{20,}
    test-leak.txt:1:RESEND_API_KEY="re_FAKE_TEST_chave_de_30_caracteres_aqui"
```

---

## 🐛 Reportar bug — Resend (envio de email)

O botão "Reportar bug" na sidebar abre um modal que envia email pra `chongrenato@gmail.com` via [Resend](https://resend.com). Free tier dá 100 emails/dia.

### Setup inicial (já feito — só refazer se trocar de conta)

1. Cria conta em https://resend.com (login com GitHub ou Google).
2. Em **API Keys**, gera uma chave nova (escopo: "Sending access").
3. Copia a chave (`re_...`).
4. Na VM, atualiza a env via `.flux.env` (workflow oficial — ver seção de Env vars):
   ```bash
   nano ~/.flux.env
   # editar a linha RESEND_API_KEY=re_xxxxx
   pm2 reload ~/flux-ecosystem.config.js
   pm2 save
   ```
5. Testa clicando em "Reportar bug" no app.

### Sender e destinatário

- **Sender (from)**: `Flux Bug Report <onboarding@resend.dev>` — sandbox grátis do Resend, sem precisar verificar domínio.
- **Recipient (to)**: cai onde a env var `BUG_REPORT_TO` apontar. Resend free tier exige que o destinatário seja o email da conta Resend.

### Trocar a chave (se vazar ou expirar)

1. Gera nova key no painel Resend.
2. Revoga a antiga lá mesmo.
3. Repete o passo 4 do setup acima com a chave nova (edita `~/.flux.env` + `pm2 reload`).

> **Importante sobre vazamento**: Resend monitora ativamente chaves expostas em GitHub/Slack/Discord/chats e revoga automaticamente em minutos. Se você suspeita que vazou (commit acidental, paste em ferramenta com log), assume que já foi revogada — rotaciona imediatamente.

### Se o botão "Reportar bug" parar de funcionar

```bash
# Ver logs recentes do flux com filtro
pm2 logs flux --lines 50 --nostream 2>&1 | grep -iE 'bug|resend|error'

# Verificar env REAL do processo (mascarando a chave)
NEW_PID=$(pm2 jlist | python3 -c "import sys,json; print([p['pid'] for p in json.load(sys.stdin) if p['name']=='flux'][0])")
sudo cat /proc/$NEW_PID/environ | tr '\0' '\n' | grep RESEND_API_KEY | sed -E 's/(=re_).{4}.*/\1****(masked)/'
```

Possíveis causas:
- `RESEND_API_KEY` não setada → o endpoint retorna **503** "Sistema de envio de bugs indisponível"
  - Fix: editar `~/.flux.env` + `pm2 reload`
- Chave inválida/revogada → log mostra `Resend API error 401 "API key is invalid"` → endpoint retorna **502**
  - Fix: rotacionar a chave (passos da seção "Trocar a chave")
- Email destino não é o da conta Resend → log mostra `403 "You can only send testing emails to your own email address"` → endpoint retorna **502**
  - Fix: ajustar `BUG_REPORT_TO` no `~/.flux.env` ou verificar domínio próprio no Resend
- Quota mensal estourada (3.000/mês) → resposta da Resend retorna 429
- Email do destinatário fora do permitido (free tier limita) → resposta 403

---

## 🌐 Domínio (DuckDNS)

### Atualizar IP do domínio (se IP da VM mudar)

Loga em https://www.duckdns.org/ e atualiza no campo `current ip` dos domínios `rsc3-flux` e `rsc3-boolean`.

> Desde 2026-04-26 o IP da VM é **estático** (reservado como `flux-static-ip` no GCP), então **não muda mais com reboot**. Mas se um dia precisar trocar de VM/região, atualiza aqui.

### Como o IP estático foi configurado

Console GCP → VPC → Endereços IP → o IP efêmero da VM foi promovido a estático com o nome `flux-static-ip` em `us-west1`. **Custo zero** porque está atribuído a uma VM em execução. Se a VM for excluída (não desligada — excluída), o IP volta a cobrar (~US$ 7/mês) até ser liberado.

---

## 📁 Onde ficam as coisas na VM

| Item | Caminho |
|---|---|
| Código | `/home/CHONGRENATOO/Flux/` |
| Banco SQLite | `/var/lib/flux/database.sqlite` |
| Logs do PM2 | `/home/CHONGRENATOO/.pm2/logs/` |
| Config do nginx | `/etc/nginx/sites-available/flux` |
| Certificado SSL | `/etc/letsencrypt/live/rsc3-flux.duckdns.org/` |
| Service do PM2 (boot) | `/etc/systemd/system/pm2-CHONGRENATOO.service` |

---

## 💸 Custo

**R$ 0,00/mês** — VM e2-micro está dentro do free tier permanente do GCP (us-west1, us-central1 ou us-east1). DuckDNS é gratuito. Let's Encrypt é gratuito.

Único custo possível: se o tráfego de saída exceder 1 GB/mês pra fora dos EUA — improvável pra uso pessoal.
