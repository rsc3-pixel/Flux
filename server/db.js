const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// In production (Fly.io / containers) the SQLite file lives on a mounted
// volume so it survives deploys. Locally it stays alongside the code.
// Set DATA_DIR=/data when running in a container with a volume mounted at /data.
const DATA_DIR = process.env.DATA_DIR || __dirname;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const dbPath = path.join(DATA_DIR, 'database.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    color      TEXT DEFAULT '#0079bf',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id   INTEGER NOT NULL,
    title      TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority    TEXT DEFAULT 'media',
    due_date    DATE,
    assignee    TEXT DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(board_id);
  CREATE INDEX IF NOT EXISTS idx_cards_list  ON cards(list_id);
`);

// ---- AUTH / MULTI-USER TABLES ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS board_members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    role       TEXT NOT NULL DEFAULT 'membro',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (board_id, user_id),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id   INTEGER NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    role       TEXT NOT NULL DEFAULT 'membro',
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at    DATETIME,
    FOREIGN KEY (board_id)   REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_members_board ON board_members(board_id);
  CREATE INDEX IF NOT EXISTS idx_members_user  ON board_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// ---- Migrations (safe: skipped if column already exists) ----
const cardCols = db.prepare('PRAGMA table_info(cards)').all().map(c => c.name);
if (!cardCols.includes('start_date')) {
  db.exec('ALTER TABLE cards ADD COLUMN start_date DATE');
}

const boardCols = db.prepare('PRAGMA table_info(boards)').all().map(c => c.name);
if (!boardCols.includes('owner_id')) {
  db.exec('ALTER TABLE boards ADD COLUMN owner_id INTEGER REFERENCES users(id)');
}

const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name);
if (!sessionCols.includes('expires_at')) {
  db.exec('ALTER TABLE sessions ADD COLUMN expires_at DATETIME');
  // Backfill existing sessions with a 30-day expiry from now
  db.exec(`UPDATE sessions SET expires_at = datetime('now', '+30 days') WHERE expires_at IS NULL`);
}

if (!cardCols.includes('category')) {
  db.exec('ALTER TABLE cards ADD COLUMN category TEXT');
}

// ---- WORKSPACE + ACTIVITY tables (Iteration 3) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    plan       TEXT NOT NULL DEFAULT 'free',
    owner_id   INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    user_id      INTEGER,
    action       TEXT NOT NULL,
    entity_type  TEXT,
    entity_id    INTEGER,
    board_id     INTEGER,
    details      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_activity_ws_time ON activity_log(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_board   ON activity_log(board_id);
`);

if (!boardCols.includes('workspace_id')) {
  db.exec('ALTER TABLE boards ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id)');
}

// ---- CHECKLIST ITEMS (Iteration 4) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS checklist_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    INTEGER NOT NULL,
    text       TEXT NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_checklist_card ON checklist_items(card_id);
`);

// Backfill: every user without a workspace gets a default "Pessoal" one,
// and every board without a workspace_id is linked to its owner's workspace.
db.transaction(() => {
  const usersWithoutWs = db.prepare(`
    SELECT u.id, u.name FROM users u
    LEFT JOIN workspaces w ON w.owner_id = u.id
    WHERE w.id IS NULL
  `).all();
  const insertWs = db.prepare('INSERT INTO workspaces (name, owner_id, plan) VALUES (?, ?, ?)');
  for (const u of usersWithoutWs) {
    insertWs.run('Pessoal', u.id, 'free');
  }

  // Link orphan boards to their owner's workspace
  const orphanBoards = db.prepare(`
    SELECT b.id, b.owner_id FROM boards b WHERE b.workspace_id IS NULL AND b.owner_id IS NOT NULL
  `).all();
  const findWs = db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1');
  const linkBoard = db.prepare('UPDATE boards SET workspace_id = ? WHERE id = ?');
  for (const b of orphanBoards) {
    const ws = findWs.get(b.owner_id);
    if (ws) linkBoard.run(ws.id, b.id);
  }
})();

// Periodic cleanup of expired sessions on boot
db.exec(`DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`);

const boardCount = db.prepare('SELECT COUNT(*) AS c FROM boards').get().c;
if (boardCount === 0) {
  const insertBoard = db.prepare('INSERT INTO boards (title, color) VALUES (?, ?)');
  const boardInfo = insertBoard.run('Meu Primeiro Quadro', '#0079bf');
  const boardId = boardInfo.lastInsertRowid;

  const insertList = db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)');
  const todoId  = insertList.run(boardId, 'A Fazer', 0).lastInsertRowid;
  const doingId = insertList.run(boardId, 'Em Andamento', 1).lastInsertRowid;
                  insertList.run(boardId, 'Concluído', 2);

  const insertCard = db.prepare(
    'INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)'
  );
  insertCard.run(todoId,  'Bem-vindo ao Flux!', 'Clique nos cards para editar.', 'alta', 0);
  insertCard.run(todoId,  'Arraste este card para outra lista', '', 'media', 1);
  insertCard.run(doingId, 'Crie novos quadros pelo menu', '', 'baixa', 0);
}

module.exports = db;
