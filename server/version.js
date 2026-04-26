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
