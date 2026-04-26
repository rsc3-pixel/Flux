#!/usr/bin/env node
// Usage: npm run delete-user -- email
// Or:    node scripts/delete-user.js email

const db = require('../server/db');

const [, , email] = process.argv;
if (!email) {
  console.error('Uso: node scripts/delete-user.js <email>');
  process.exit(1);
}

const emailLower = email.toLowerCase();
const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(emailLower);
if (!user) { console.error(`❌ Usuário "${emailLower}" não encontrado`); process.exit(1); }

// Show what will be cascade-deleted so the operator confirms scope
const boardsOwned  = db.prepare('SELECT COUNT(*) AS c FROM boards WHERE owner_id = ?').get(user.id).c;
const memberships  = db.prepare('SELECT COUNT(*) AS c FROM board_members WHERE user_id = ?').get(user.id).c;
const sessions     = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(user.id).c;
const invitesMade  = db.prepare('SELECT COUNT(*) AS c FROM invites WHERE created_by = ?').get(user.id).c;
const workspaces   = db.prepare('SELECT COUNT(*) AS c FROM workspaces WHERE owner_id = ?').get(user.id).c;

console.log(`Usuário: ${user.name} <${emailLower}> (id ${user.id})`);
console.log(`  → ${boardsOwned} board(s) que ele(a) é OWNER serão deletados (com listas, cards, convites)`);
console.log(`  → ${memberships} board(s) onde ele(a) é membro perderá acesso`);
console.log(`  → ${sessions} sessão(ões) ativas serão invalidadas`);
console.log(`  → ${invitesMade} convite(s) criado(s) por ele(a) serão removidos`);
console.log(`  → ${workspaces} workspace(s) que ele(a) é OWNER serão deletados (com activity_log)`);

// Simple confirmation: pass --yes to skip
if (!process.argv.includes('--yes')) {
  console.error('\n⚠  Adicione --yes ao final pra confirmar a exclusão.');
  console.error(`   Ex: node scripts/delete-user.js ${emailLower} --yes`);
  process.exit(1);
}

// Clean up rows that don't cascade automatically, then delete the user.
// Wrapped in a transaction so any failure rolls everything back.
const deleteEverything = db.transaction(() => {
  // invites.created_by has no ON DELETE CASCADE — must be cleared manually
  db.prepare('DELETE FROM invites WHERE created_by = ?').run(user.id);
  // boards.owner_id was added via ALTER TABLE without cascade — clear owned boards
  // (their lists, cards, board_members and remaining invites cascade from boards)
  db.prepare('DELETE FROM boards WHERE owner_id = ?').run(user.id);
  // sessions, board_members, workspaces, activity_log all cascade from users
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
});
deleteEverything();

console.log(`\n✅ Usuário "${emailLower}" removido.`);
