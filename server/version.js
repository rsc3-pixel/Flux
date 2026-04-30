// Versão atual do app + lista de release notes mostradas no modal "Novidades".
//
// Quando publicar uma atualização nova, faz 3 coisas:
//   1. Bumpa o `version` aqui (ex: "1.1.0" -> "1.2.0")
//   2. Adiciona um bloco no TOPO do array `releases` com a versão nova e o que mudou
//   3. Faz commit + push, depois `git pull && pm2 restart flux` na VM
//
// O frontend compara o `version` retornado por GET /api/version com o que está
// no localStorage do usuário. Se for diferente (e ele já tinha visto algum antes),
// abre o modal mostrando todos os releases acumulados desde a última versão vista.
// Se ele nunca tinha visto nada (primeiro login pós-feature), só registra silenciosamente.

const releases = [
  {
    version: '1.3.0',
    date: '2026-04-30',
    notes: [
      '🖱️ Arraste os quadros na sidebar pra reordenar do seu jeito — o que estiver no topo é o que abre primeiro quando você entra no site',
      '📌 A ordem é por usuário — cada membro de um quadro compartilhado pode organizar a sidebar como preferir, sem afetar os outros',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-04-26',
    notes: [
      '✅ Checklist nos cards — adicione subtarefas/itens em qualquer card, marque como feito e acompanhe o progresso. Perfeito pra lista de compras, passos de uma tarefa ou subtarefas',
      '🟢 Nova categoria LISTA — cor verde-esmeralda pra quando o card é uma lista de itens (ex.: lista de mercado)',
      '📊 Progresso no card — quando o card tem checklist, o quadro mostra um indicador "2/5 ✓" pra você ver o avanço sem abrir',
    ],
  },
  {
    version: '1.1.3',
    date: '2026-04-26',
    notes: [
      '⚡ App agora atualiza sozinho — quando uma versão nova é publicada, o app recarrega automaticamente sem você precisar fazer nada',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-04-26',
    notes: [
      '📱 Atualizações agora chegam no celular sem precisar reinstalar — service worker passou a usar estratégia network-first pra carregar a versão mais nova',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-04-26',
    notes: [
      '🔧 Corrige modal "Novidades" que não aparecia na primeira vez',
      '🔒 Reconhecimento correto do IP atrás do proxy (rate limit mais robusto)',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-26',
    notes: [
      '🐛 Botão "Reportar bug" na sidebar — agora dá pra mandar feedback direto pro time sem sair do app',
      '✨ Modal "Novidades" — toda atualização nova vai aparecer aqui pra você não perder nenhuma melhoria',
    ],
  },
];

module.exports = {
  current: releases[0].version,
  releases,
};
