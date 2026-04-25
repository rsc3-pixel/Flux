#!/usr/bin/env node
// Usage: npm run list-users
// Or:    node scripts/list-users.js

const db = require('../server/db');

const users = db.prepare(`
  SELECT
    u.id, u.email, u.name, u.created_at,
    (SELECT COUNT(*) FROM boards WHERE owner_id = u.id)         AS owned,
    (SELECT COUNT(*) FROM board_members WHERE user_id = u.id)   AS member_of,
    (SELECT COUNT(*) FROM sessions WHERE user_id = u.id
       AND (expires_at IS NULL OR expires_at > datetime('now'))) AS active_sessions
  FROM users u
  ORDER BY u.id
`).all();

if (!users.length) {
  console.log('Nenhum usuário cadastrado.');
  process.exit(0);
}

console.log(`Usuários (${users.length}):\n`);
for (const u of users) {
  console.log(`  #${u.id}  ${u.name}  <${u.email}>`);
  console.log(`        criado: ${u.created_at}  |  owner de ${u.owned} board(s)  |  membro de ${u.member_of}  |  ${u.active_sessions} sessão(ões) ativa(s)\n`);
}
