#!/usr/bin/env node
// One-shot seed: adds the 18 cards of the "Ranking & Pontuação" sprint
// (from The-Boolean-Bar's docs/SPRINT_RANKING.md) to the existing
// "Projeto de Bollean bar | Sprint 4" board (id 14), in its Backlog column.
//
// Cards are created with NO assignee — the squad self-assigns at planning.
// Usage (on the VM):
//   DATA_DIR=/var/lib/flux node scripts/seed-sprint-ranking-cards.js
//
// Idempotent: aborts if cards tagged "[Ranking " already exist in the column.

const db = require('../server/db');

const BOARD_ID = 14;
const LIST_TITLE = 'Backlog';

const board = db.prepare('SELECT id, title FROM boards WHERE id = ?').get(BOARD_ID);
if (!board) {
  console.error(`❌ Board ${BOARD_ID} não encontrada.`);
  process.exit(1);
}
if (!/sprint\s*4/i.test(board.title)) {
  console.error(`❌ Board ${BOARD_ID} tem título inesperado ("${board.title}") — abortando por segurança.`);
  process.exit(1);
}

const list = db.prepare(
  'SELECT id, title FROM lists WHERE board_id = ? AND title = ?'
).get(board.id, LIST_TITLE);
if (!list) {
  console.error(`❌ Coluna "${LIST_TITLE}" não encontrada na board ${board.id}.`);
  process.exit(1);
}

// Idempotency guard — não duplica se rodar de novo.
const already = db.prepare(
  "SELECT COUNT(*) AS n FROM cards WHERE list_id = ? AND title LIKE '[Ranking %'"
).get(list.id).n;
if (already > 0) {
  console.error(`❌ Já existem ${already} cards "[Ranking ...]" na coluna. Abortando pra não duplicar.`);
  process.exit(1);
}

// MUST → prioridade alta · STRETCH → prioridade baixa.
function dbPriority(tag) {
  return tag === 'MUST' ? 'alta' : 'baixa';
}

function buildDesc(c) {
  const lines = [
    `Épico: ${c.epic}`,
    `Área: ${c.area}`,
    `Estimativa: ${c.estimate}`,
    `Prioridade: ${c.tag}`,
  ];
  if (c.files) lines.push(`Arquivos: ${c.files}`);
  lines.push('', 'Descrição:', c.summary, '', 'Critério de Aceite:');
  for (const cr of c.criteria) lines.push(`- ${cr}`);
  if (c.notes) lines.push('', `Obs: ${c.notes}`);
  return lines.join('\n');
}

// ── Os 18 itens do SPRINT_RANKING ────────────────────────────────────────────
const ITEMS = [
  // Épico 1 — Sala de até 8 jogadores
  {
    id: '1.1', tag: 'MUST', epic: 'Sala de até 8 jogadores', area: 'Engine C',
    estimate: '0,5h', files: 'engine/core/types.h',
    title: 'MAX_PLAYERS 7→8 no engine',
    summary: 'Subir MAX_PLAYERS de 7 para 8 em types.h. ATENÇÃO: rodar `make clean` antes de rebuildar — mudar types.h sem clean causa segfault em runtime (struct stale).',
    criteria: ['Cria 8 jogadores sem crash nos 2 modos (Lógica e Dados)'],
  },
  {
    id: '1.2', tag: 'MUST', epic: 'Sala de até 8 jogadores', area: 'Servidor (Node)',
    estimate: '0,5h', files: 'web/web_server.js',
    title: 'MAX_PLAYERS_PER_ROOM 7→8 no servidor',
    summary: 'Subir MAX_PLAYERS_PER_ROOM de 7 para 8 no servidor.',
    criteria: ['8ª pessoa consegue entrar na sala', 'Erro "sala cheia" só aparece a partir do 9º'],
  },
  {
    id: '1.3', tag: 'MUST', epic: 'Sala de até 8 jogadores', area: 'Frontend',
    estimate: '2h', files: 'web/src/pages/WaitingRoom.tsx, GamePage.tsx, DiceGameOnline.tsx',
    title: 'Ajustar telas para 8 jogadores',
    summary: 'Ajustar as telas para exibir 8 jogadores (arco de cartas no GamePage, lista da WaitingRoom, mesa do DiceGameOnline).',
    criteria: ['8 jogadores visíveis sem overflow em desktop e mobile'],
    notes: 'Maior risco de estourar a estimativa — o GamePage usa um hack de zoom. Começar cedo.',
  },
  // Épico 2 — Dados dinâmicos por nº de jogadores
  {
    id: '2.1', tag: 'MUST', epic: 'Dados dinâmicos por nº de jogadores', area: 'Engine C',
    estimate: '1h', files: 'engine/modules/dice_flow.c',
    title: 'Dados dinâmicos por nº de jogadores',
    summary: 'Criar a função dados_iniciais(n) que substitui o valor fixo 5. Escala: 2-3 jogadores → 5 dados, 4-5 → 4, 6-8 → 3.',
    criteria: ['Nº de dados muda conforme o nº de jogadores', 'JSON_DICE_STATE reflete o novo dice_count'],
  },
  {
    id: '2.2', tag: 'STRETCH', epic: 'Dados dinâmicos por nº de jogadores', area: 'Frontend',
    estimate: '0,5h',
    title: 'Mostrar regra "N jogadores = M dados" no lobby',
    summary: 'Mostrar a regra "N jogadores = M dados" no lobby, antes de iniciar a partida.',
    criteria: ['Texto da regra visível no lobby antes do start'],
  },
  // Épico 3 — Pontuação e bônus
  {
    id: '3.1', tag: 'MUST', epic: 'Pontuação e bônus', area: 'Gestão (PM)',
    estimate: '1h',
    title: 'Definir tabela de pontuação',
    summary: 'Definir a tabela de pontos + fórmulas de bônus e penalidade num doc curto. BLOQUEIA 3.2 e 3.3 — precisa sair primeiro.',
    criteria: ['Doc com valores numéricos aprovado pelo squad'],
    notes: 'Já existe um rascunho da proposta em docs/SCORING.md no repo The-Boolean-Bar — falta o squad ratificar.',
  },
  {
    id: '3.2', tag: 'MUST', epic: 'Pontuação e bônus', area: 'Engine C — Dados',
    estimate: '3h', files: 'engine/modules/dice_flow.c',
    title: 'Pontuação no engine de Dados',
    summary: 'No engine de Dados: contar rodadas, acumular pontos por ação e aplicar penalidade por erro / dado perdido.',
    criteria: ['Partida soma pontos internamente, verificável em log'],
  },
  {
    id: '3.3', tag: 'STRETCH', epic: 'Pontuação e bônus', area: 'Engine C — Lógica',
    estimate: '3h', files: 'engine/modules/game_flow.c',
    title: 'Pontuação no engine de Lógica',
    summary: 'Mesma mecânica de pontuação no modo Lógica: rodadas, pontos por ação, bônus por vencer sem perder vidas.',
    criteria: ['Mesma mecânica de pontuação funcionando no modo Lógica'],
  },
  {
    id: '3.4', tag: 'MUST', epic: 'Pontuação e bônus', area: 'Engine C',
    estimate: '1,5h',
    title: 'Estender JSON_VICTORY com pontuação',
    summary: 'Estender o evento JSON_VICTORY com a pontuação final, nº de rodadas e o breakdown de bônus por jogador.',
    criteria: ['JSON_VICTORY traz pontuação por jogador'],
  },
  {
    id: '3.5', tag: 'STRETCH', epic: 'Pontuação e bônus', area: 'Frontend',
    estimate: '2h',
    title: 'Tela de relatório final da partida',
    summary: 'Tela de relatório final da partida com o breakdown de pontos e bônus.',
    criteria: ['Ao fim da partida, todos veem o detalhamento de pontos / bônus'],
  },
  // Épico 4 — Ranking em tempo real / TV
  {
    id: '4.1', tag: 'MUST', epic: 'Ranking em tempo real / TV', area: 'Servidor (Node)',
    estimate: '1h', files: 'web/web_server.js, web/leaderboard.json',
    title: 'leaderboard.json com pontos',
    summary: 'leaderboard.json passa a guardar "points" além de "wins"; getTopWinners ordena por pontos.',
    criteria: ['recordWin soma pontos', 'Ranking ordenado por pontuação'],
  },
  {
    id: '4.2', tag: 'MUST', epic: 'Ranking em tempo real / TV', area: 'Servidor (Node)',
    estimate: '1h', files: 'web/web_server.js',
    title: 'Push automático do ranking ao fim da partida',
    summary: 'Broadcast automático do leaderboard quando qualquer partida termina (hoje a atualização é manual / pull).',
    criteria: ['Toda tela de ranking aberta atualiza sozinha ao fim de qualquer partida'],
  },
  {
    id: '4.3', tag: 'MUST', epic: 'Ranking em tempo real / TV', area: 'Frontend',
    estimate: '3h',
    title: 'Modo TV — ranking ao vivo',
    summary: 'Modo TV: layout de tela grande, auto-update, sem inputs, legível à distância.',
    criteria: ['Rota de TV exibe o ranking ao vivo'],
  },
  {
    id: '4.4', tag: 'STRETCH', epic: 'Ranking em tempo real / TV', area: 'Servidor + Frontend',
    estimate: '2h',
    title: 'Painel de salas ativas na TV',
    summary: 'Painel de salas / jogos ativos na TV (servidor expõe um snapshot das salas).',
    criteria: ['TV mostra o nº de salas e o status de cada jogo'],
  },
  // Épico 5 — QA, deploy e logística
  {
    id: '5.1', tag: 'MUST', epic: 'QA, deploy e logística', area: 'QA',
    estimate: '1,5h',
    title: 'Teste de salas simultâneas',
    summary: 'Testar 2+ salas simultâneas — rankings independentes e o leaderboard agregando certo.',
    criteria: ['Partidas paralelas terminam e a TV reflete ambas'],
  },
  {
    id: '5.2', tag: 'MUST', epic: 'QA, deploy e logística', area: 'QA',
    estimate: '1h',
    title: 'Teste de sala cheia (8 jogadores)',
    summary: 'Testar sala cheia (8 jogadores) nos 2 modos.',
    criteria: ['8 jogadores (humanos + bots) jogam Lógica e Dados sem crash'],
  },
  {
    id: '5.3', tag: 'MUST', epic: 'QA, deploy e logística', area: 'Servidor (Node)',
    estimate: '1h',
    title: 'Deploy na VM + teste da TV',
    summary: 'Deploy na VM (git pull → make clean → build → pm2 restart) + teste da TV ao vivo.',
    criteria: ['Produção no ar em rsc3-boolean.duckdns.org com tudo funcionando'],
  },
  {
    id: '5.4', tag: 'MUST', epic: 'QA, deploy e logística', area: 'Gestão (PM)',
    estimate: '0,5h',
    title: 'Confirmar TV física na sala',
    summary: 'Confirmar a TV física na sala + cabo / conexão (HDMI, navegador) antes da apresentação.',
    criteria: ['TV testada com a URL antes do dia da apresentação'],
  },
];

// ── Inserção ─────────────────────────────────────────────────────────────────
const startPos = db.prepare(
  'SELECT COALESCE(MAX(position), -1) AS p FROM cards WHERE list_id = ?'
).get(list.id).p + 1;

const inserted = db.transaction(() => {
  const insert = db.prepare(`
    INSERT INTO cards (list_id, title, description, priority, assignee, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let pos = startPos;
  for (const c of ITEMS) {
    insert.run(
      list.id,
      `[Ranking ${c.id}] ${c.title}`,
      buildDesc(c),
      dbPriority(c.tag),
      '', // sem responsável — squad se atribui no planning
      pos++
    );
  }
  return ITEMS.length;
})();

console.log(`✅ ${inserted} cards adicionados à coluna "${list.title}" da board "${board.title}" (id ${board.id}).`);
console.log(`   Posições ${startPos}..${startPos + inserted - 1}. Todos sem responsável.`);
