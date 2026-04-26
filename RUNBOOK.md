# Flux — Manual de operação

> Comandos pra manter o Flux rodando em **https://rsc3-flux.duckdns.org**.
> Tudo aqui assume que você está conectado via SSH na VM (`gcloud compute ssh flux --zone=us-west1-a`).

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

### Abrir cadastros (qualquer pessoa pode criar conta)

```bash
cd ~/Flux
pm2 delete flux
DATA_DIR=/var/lib/flux NODE_ENV=production PORT=3000 ALLOW_REGISTRATION=true pm2 start server/server.js --name flux
pm2 save
```

### Fechar cadastros (só usuários existentes podem logar)

```bash
cd ~/Flux
pm2 delete flux
DATA_DIR=/var/lib/flux NODE_ENV=production PORT=3000 ALLOW_REGISTRATION=false pm2 start server/server.js --name flux
pm2 save
```

### Verificar qual modo está ativo

```bash
pm2 env flux | grep ALLOW_REGISTRATION
```

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
