#!/usr/bin/env node
// One-shot: creates a single board-14 invite whitelisting Fernando + Cauã so
// both can join "Projeto de Bollean bar | Sprint 4".
//   - Fernando (falp2@cesar.school) has no Flux account — the link lets him
//     register even with public sign-ups closed (email matches the whitelist).
//   - Cauã (cauaregoo12@gmail.com, user #7) already has an account — opening
//     the link logged in just accepts and joins the board.
//
// Replicates POST /api/boards/:id/invites (server.js) directly on the DB.
// Usage (on the VM):
//   DATA_DIR=/var/lib/flux node scripts/seed-booleanbar-invite.js
//
// Idempotent: aborts if an invite for board 14 already whitelists Fernando.

const crypto = require('crypto');
const db = require('../server/db');

const BOARD_ID = 14;
const INVITER_USER_ID = 2; // Renato Chong — existing member of board 14
const BASE_URL = 'https://rsc3-flux.duckdns.org';
const EMAILS = ['falp2@cesar.school', 'cauaregoo12@gmail.com'];

const board = db.prepare('SELECT id, title FROM boards WHERE id = ?').get(BOARD_ID);
if (!board) {
  console.error(`❌ Board ${BOARD_ID} não encontrada.`);
  process.exit(1);
}
if (!/sprint\s*4/i.test(board.title)) {
  console.error(`❌ Board ${BOARD_ID} com título inesperado ("${board.title}") — abortando.`);
  process.exit(1);
}

// Idempotency: já existe convite pra board 14 cobrindo o Fernando?
const dup = db.prepare(`
  SELECT i.token FROM invites i
  JOIN invite_allowed_emails a ON a.invite_id = i.id
  WHERE i.board_id = ? AND a.email = ?
`).get(BOARD_ID, EMAILS[0]);
if (dup) {
  console.error(`❌ Já existe convite pra board ${BOARD_ID} com ${EMAILS[0]}.`);
  console.error(`   Link existente: ${BASE_URL}/?invite=${dup.token}`);
  process.exit(1);
}

const token = crypto.randomBytes(32).toString('hex'); // mesmo formato do auth.newToken()

db.transaction(() => {
  const info = db.prepare(
    'INSERT INTO invites (board_id, token, role, created_by) VALUES (?, ?, ?, ?)'
  ).run(BOARD_ID, token, 'membro', INVITER_USER_ID);
  const inviteId = info.lastInsertRowid;
  const insertEmail = db.prepare('INSERT INTO invite_allowed_emails (invite_id, email) VALUES (?, ?)');
  for (const e of EMAILS) insertEmail.run(inviteId, e.toLowerCase());
})();

console.log(`✅ Convite criado para a board "${board.title}" (id ${board.id}).`);
console.log(`   Emails liberados: ${EMAILS.join(', ')}`);
console.log(`   Papel: membro`);
console.log('');
console.log('🔗 LINK DO CONVITE (o mesmo link serve pros dois):');
console.log(`   ${BASE_URL}/?invite=${token}`);
