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
const boardsOwned = db.prepare('SELECT COUNT(*) AS c FROM boards WHERE owner_id = ?').get(user.id).c;
const memberships  = db.prepare('SELECT COUNT(*) AS c FROM board_members WHERE user_id = ?').get(user.id).c;
const sessions     = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(user.id).c;

console.log(`Usuário: ${user.name} <${emailLower}> (id ${user.id})`);
console.log(`  → ${boardsOwned} board(s) que ele(a) é OWNER serão deletados (com listas, cards, convites)`);
console.log(`  → ${memberships} board(s) onde ele(a) é membro perderá acesso`);
console.log(`  → ${sessions} sessão(ões) ativas serão invalidadas`);

// Simple confirmation: pass --yes to skip
if (!process.argv.includes('--yes')) {
  console.error('\n⚠  Adicione --yes ao final pra confirmar a exclusão.');
  console.error(`   Ex: node scripts/delete-user.js ${emailLower} --yes`);
  process.exit(1);
}

db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
console.log(`\n✅ Usuário "${emailLower}" removido.`);
