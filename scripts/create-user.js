#!/usr/bin/env node
// Usage: npm run create-user -- email password "Full Name"
// Or:    node scripts/create-user.js email password "Full Name"

const db = require('../server/db');
const bcrypt = require('bcryptjs');

const [, , email, password, ...nameParts] = process.argv;
const name = nameParts.join(' ').trim();

if (!email || !password || !name) {
  console.error('Uso: node scripts/create-user.js <email> <senha> <nome>');
  console.error('Ex:  node scripts/create-user.js maria@x.com SenhaForte123 "Maria Silva"');
  process.exit(1);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_RE.test(email))           { console.error('❌ Email inválido'); process.exit(1); }
if (password.length < 8)             { console.error('❌ Senha precisa ter ao menos 8 caracteres'); process.exit(1); }
if (name.length < 1 || name.length > 100) { console.error('❌ Nome inválido'); process.exit(1); }

const emailLower = email.toLowerCase();
const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
if (exists) { console.error(`❌ Já existe usuário com email "${emailLower}" (id ${exists.id})`); process.exit(1); }

const result = db.transaction(() => {
  const isFirstUser = db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0;
  const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
                 .run(emailLower, bcrypt.hashSync(password, 10), name);
  const userId = info.lastInsertRowid;
  if (isFirstUser) {
    db.prepare('UPDATE boards SET owner_id = ? WHERE owner_id IS NULL').run(userId);
  }
  // Default workspace
  const ws = db.prepare('INSERT INTO workspaces (name, owner_id, plan) VALUES (?, ?, ?)')
               .run('Pessoal', userId, 'free');
  db.prepare('UPDATE boards SET workspace_id = ? WHERE owner_id = ? AND workspace_id IS NULL')
    .run(ws.lastInsertRowid, userId);
  return userId;
})();

console.log(`✅ Usuário criado: ${name} <${emailLower}> (id ${result})`);
console.log(`   Workspace "Pessoal" também criado.`);
