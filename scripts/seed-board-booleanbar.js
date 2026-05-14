#!/usr/bin/env node
// One-shot seed: creates the "Booleanbar Squad" Kanban board in the owner's
// default workspace, with 8 columns (WIP limits in the title) and 8 starter
// cards distributed per the squad's intake plan.
//
// Usage:
//   DATA_DIR=/var/lib/flux node scripts/seed-board-booleanbar.js [owner-email]
// Default owner email: chongrenato@gmail.com

const db = require('../server/db');

const OWNER_EMAIL = (process.argv[2] || 'chongrenato@gmail.com').toLowerCase();
const BOARD_TITLE = 'Booleanbar Squad';
const BOARD_COLOR = '#0079bf';

const user = db.prepare('SELECT id, name FROM users WHERE LOWER(email) = ?').get(OWNER_EMAIL);
if (!user) {
  console.error(`❌ Usuário não encontrado: ${OWNER_EMAIL}`);
  process.exit(1);
}
const ws = db.prepare('SELECT id FROM workspaces WHERE owner_id = ? ORDER BY id LIMIT 1').get(user.id);
if (!ws) {
  console.error(`❌ Workspace não encontrado para ${OWNER_EMAIL}`);
  process.exit(1);
}

const dup = db.prepare(
  'SELECT id FROM boards WHERE title = ? AND owner_id = ?'
).get(BOARD_TITLE, user.id);
if (dup) {
  console.error(`❌ Já existe board "${BOARD_TITLE}" (id ${dup.id}) pra esse owner. Apague antes de re-rodar.`);
  process.exit(1);
}

const LISTS = [
  'Backlog · ∞',
  'Refinamento / Spike · [3]',
  'Pronto pra Dev · ∞',
  'Em Dev · [5]',
  'Em Code Review · [3]',
  'Em Teste (Dev) · [2]',
  'Em Validação (Prod) · [2]',
  'Pronto · ∞',
];

const DoR_DoD = `📐 DoR (pra entrar em Pronto pra Dev):
   - [ ] descrição clara
   - [ ] critério de aceite escrito
   - [ ] T-shirt size acordado
   - [ ] riscos listados (mexe em types.h? muda protocolo WS?)

🎯 DoD (pra entrar em Pronto):
   - [ ] build Win + Linux passa
   - [ ] PR aprovado (Renato + par)
   - [ ] smoke test passa
   - [ ] Gabriel validou inputs de estresse
   - [ ] testado em prod`;

function buildDesc({ summary, criteria, layer, type, size, owner, risks, status, links }) {
  const parts = [
    `📋 Descrição:`,
    `   ${summary}`,
    ``,
    `✅ Critério de Aceite:`,
    ...criteria.map((c) => `   - [ ] ${c}`),
    ``,
    `🏷️ Labels:`,
    `   • Camada: ${layer}`,
    `   • Tipo:   ${type}`,
    `   • Size:   ${size}`,
    ``,
    `👤 Owner: ${owner}`,
    ``,
    `🔗 Vínculos: ${links || '—'}`,
  ];
  if (risks) parts.push('', `⚠️  Riscos: ${risks}`);
  if (status) parts.push('', `📊 Status: ${status}`);
  parts.push('', DoR_DoD);
  return parts.join('\n');
}

// listIdx → which LISTS column (0=Backlog, 1=Refinamento, 2=Pronto pra Dev, ...)
const CARDS = [
  // ── Backlog ──────────────────────────────────────────────────────────
  {
    listIdx: 0,
    title: '#6 Samples de áudio realistas',
    category: 'feature',
    priority: 'media',
    assignee: 'Luís',
    description: buildDesc({
      summary:
        'Trocar os efeitos sonoros atuais por samples mais realistas (dados sendo agitados, copo batendo na mesa, fichas).',
      criteria: [
        'Pelo menos 3 SFX novos integrados (roll, pick-up, slam)',
        'Volume balanceado com a música ambiente',
        'Tocam só quando aba do jogo está em foco',
      ],
      layer: 'frontend',
      type: 'feature',
      size: 'P',
      owner: 'Luís',
    }),
  },
  {
    listIdx: 0,
    title: '#7 Documentar protocolo WS em docs/',
    category: 'documentacao',
    priority: 'media',
    assignee: 'Gabriel',
    description: buildDesc({
      summary:
        'Escrever referência canônica do protocolo WebSocket (mensagens cliente↔servidor, estados, payloads).',
      criteria: [
        'docs/ws-protocol.md commitado',
        'Cada mensagem com tipo, direção, payload de exemplo',
        'Diagrama de máquina de estados do jogo',
      ],
      layer: 'docs',
      type: 'doc',
      size: 'P',
      owner: 'Gabriel',
    }),
  },
  {
    listIdx: 0,
    title: '#8 Testes automatizados do engine',
    category: 'feature',
    priority: 'media',
    assignee: 'Gabriel + Matheus',
    description: buildDesc({
      summary:
        'Suíte de testes do engine em C cobrindo regras de turno, blefe, contestação e edge cases.',
      criteria: [
        'Framework de teste escolhido e rodando em CI',
        '≥ 80% de cobertura nas funções de game_flow.c e dice_flow.c',
        'CI quebra build se algum teste falhar',
      ],
      layer: 'engine + QA',
      type: 'feature',
      size: 'G',
      owner: 'Gabriel + Matheus',
    }),
  },

  // ── Refinamento / Spike ──────────────────────────────────────────────
  {
    listIdx: 1,
    title: '#1 IA estatística do bot',
    category: 'feature',
    priority: 'alta',
    assignee: 'João Pedro + Fernando',
    description: buildDesc({
      summary:
        'Bot calcula probabilidade da aposta atual baseado em frequências e decide blefar/duvidar com peso (não mais 30% fixo).',
      criteria: [
        'Função de probabilidade implementada e testada',
        'Bot consulta probabilidade antes de cada decisão',
        'Threshold de blefe configurável',
        'Comportamento empiricamente diferente do baseline aleatório',
      ],
      layer: 'server + lógica',
      type: 'feature',
      size: 'GG',
      owner: 'João Pedro + Fernando',
      risks: 'Precisa testes empíricos pra calibrar; sem oráculo objetivo de "bom jogador".',
      status: 'Precisa Spike antes — quebrar em 3 sub-cards (1. heurística logic, 2. heurística dice, 3. integração no maybeTriggerBot).',
    }),
  },
  {
    listIdx: 1,
    title: '#2 Engine pula jogador desconectado',
    category: 'feature',
    priority: 'alta',
    assignee: 'Cauã + Matheus',
    description: buildDesc({
      summary:
        'Quando jogador desconecta mid-game, próximo turno pula o slot sem fechar a sala.',
      criteria: [
        'Slot do jogador marcado como "ausente" sem destruir sala',
        'Turno avança automaticamente após timeout configurável',
        'Reconnect dentro de janela X devolve o jogador à mesa',
        'Sala só fecha se sobrarem < 2 jogadores ativos',
      ],
      layer: 'engine C',
      type: 'feature',
      size: 'GG',
      owner: 'Cauã + Matheus',
      risks: 'Refactor profundo em game_flow.c E dice_flow.c, alto risco de segfault.',
      status: 'Precisa Spike — desenhar state machine antes de codar.',
    }),
  },
  {
    listIdx: 1,
    title: '#3 Refatorar GamePage mobile',
    category: 'feature',
    priority: 'media',
    assignee: 'Luís + Renato',
    description: buildDesc({
      summary:
        'Eliminar `zoom: 0.65/0.75/0.85` no GamePage e adotar layout responsivo nativo.',
      criteria: [
        'Sem `zoom` em nenhum CSS do GamePage',
        'Layout testado nos viewports 375px, 768px, 1024px, 1440px',
        'Touch targets ≥ 44×44px em mobile',
        'Sem overflow horizontal em nenhum breakpoint',
      ],
      layer: 'frontend',
      type: 'refactor',
      size: 'G',
      owner: 'Luís + Renato',
      risks: 'Regressão visual no desktop existente.',
    }),
  },

  // ── Pronto pra Dev ───────────────────────────────────────────────────
  {
    listIdx: 2,
    title: '#4 Slider de volume da música',
    category: 'feature',
    priority: 'baixa',
    assignee: 'Luís',
    description: buildDesc({
      summary:
        '`<input type="range">` 0–100 no painel de settings, persiste em localStorage `booleanbar_music_volume`, default 50.',
      criteria: [
        'Slider visível no painel de settings',
        'Audio element respeita `audio.volume = value/100`',
        'Valor persistido entre sessões via localStorage',
        'Default 50 quando chave ausente',
      ],
      layer: 'frontend',
      type: 'feature',
      size: 'PP',
      owner: 'Luís',
    }),
  },
  {
    listIdx: 2,
    title: '#5 Bot envia Enter automático',
    category: 'bug',
    priority: 'media',
    assignee: 'Matheus',
    description: buildDesc({
      summary:
        'Quando engine espera `\\n` em sala só-de-bots, server injeta `\\n` após 800ms pra sala não travar.',
      criteria: [
        'Detecção: sala 100% bots + engine bloqueado em read()',
        'Timer de 800ms dispara injeção de `\\n`',
        'Não afeta sala com jogador humano presente',
        'Cleanup do timer no fim do turno',
      ],
      layer: 'server',
      type: 'bug',
      size: 'P',
      owner: 'Matheus',
    }),
  },
];

const result = db.transaction(() => {
  const boardInfo = db
    .prepare('INSERT INTO boards (title, color, owner_id, workspace_id) VALUES (?, ?, ?, ?)')
    .run(BOARD_TITLE, BOARD_COLOR, user.id, ws.id);
  const boardId = boardInfo.lastInsertRowid;

  const listIds = [];
  const insertList = db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)');
  for (let i = 0; i < LISTS.length; i++) {
    listIds.push(insertList.run(boardId, LISTS[i], i).lastInsertRowid);
  }

  const posCounter = new Array(LISTS.length).fill(0);
  const insertCard = db.prepare(`
    INSERT INTO cards (list_id, title, description, priority, assignee, category, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of CARDS) {
    const lid = listIds[c.listIdx];
    insertCard.run(lid, c.title, c.description, c.priority, c.assignee, c.category, posCounter[c.listIdx]++);
  }

  db.prepare(`
    INSERT INTO activity_log (workspace_id, board_id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, 'board.created', 'board', ?, ?)
  `).run(ws.id, boardId, user.id, boardId, JSON.stringify({ title: BOARD_TITLE, seeded: true }));

  return { boardId, listCount: listIds.length, cardCount: CARDS.length };
})();

console.log(`✅ Board "${BOARD_TITLE}" criado (id ${result.boardId})`);
console.log(`   ${result.listCount} colunas, ${result.cardCount} cards.`);
console.log(`   Owner: ${user.name} <${OWNER_EMAIL}>`);
