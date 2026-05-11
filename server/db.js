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

// ---- CARD ↔ FINANCE LINK (Iteration 8.5 / PR5) ----
// A card with category 'conta-a-pagar' can carry a money amount + a finance
// category. When the user clicks "Marcar como pago" the server creates a
// finance transaction (source_card_id = card.id) and stamps cards.paid_at,
// which makes the kanban preview show "✅ Pago em DD/MM" and locks the
// "Marcar como pago" action.
const cardColsForFinance = db.prepare('PRAGMA table_info(cards)').all().map(c => c.name);
if (!cardColsForFinance.includes('amount_cents')) {
  db.exec('ALTER TABLE cards ADD COLUMN amount_cents INTEGER');
}
if (!cardColsForFinance.includes('finance_category_id')) {
  db.exec('ALTER TABLE cards ADD COLUMN finance_category_id INTEGER REFERENCES finance_categories(id) ON DELETE SET NULL');
}
if (!cardColsForFinance.includes('paid_at')) {
  db.exec('ALTER TABLE cards ADD COLUMN paid_at DATETIME');
}

// ---- CUSTOM CATEGORY (per-card label + color) ----
// User-defined category instead of the whitelist. When set, `category` MUST be
// NULL (server enforces). Color stored as #RRGGBB.
if (!cardColsForFinance.includes('custom_category_label')) {
  db.exec('ALTER TABLE cards ADD COLUMN custom_category_label TEXT');
}
if (!cardColsForFinance.includes('custom_category_color')) {
  db.exec('ALTER TABLE cards ADD COLUMN custom_category_color TEXT');
}

// ---- RECURRING CARDS ----
// Cards generated together as a monthly series share a series_id. No "template"
// row — each card stands on its own. The id is just an identifier so future
// features (e.g., bulk-delete a series, extend a series) can find related cards.
if (!cardColsForFinance.includes('series_id')) {
  db.exec('ALTER TABLE cards ADD COLUMN series_id INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cards_series ON cards(series_id)');
}

// ---- FINANCIAL MODULE — schema only (Iteration 8.1) ----
// Personal finance tracking (Pierre-style, much smaller scope). No multi-
// account support yet — every transaction is implicitly in the user's single
// "wallet". The future-proof shape is a separate finance_accounts table; for
// now we just track transactions + categories per user.
//
// IMPORTANT: amount stored as INTEGER cents (1250 = R$ 12,50). Avoids the
// classic float-precision bug (0.1 + 0.2 != 0.3). UI converts on display/input.
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    icon        TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_finance_cat_user ON finance_categories(user_id, kind, position);

  CREATE TABLE IF NOT EXISTS finance_transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    category_id      INTEGER,
    type             TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0),
    description      TEXT NOT NULL DEFAULT '',
    transaction_date DATE NOT NULL,
    source_card_id   INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)        REFERENCES users(id)               ON DELETE CASCADE,
    FOREIGN KEY (category_id)    REFERENCES finance_categories(id)  ON DELETE SET NULL,
    FOREIGN KEY (source_card_id) REFERENCES cards(id)               ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_finance_tx_user_date ON finance_transactions(user_id, transaction_date DESC);
  CREATE INDEX IF NOT EXISTS idx_finance_tx_category  ON finance_transactions(category_id);
`);

// Lazy seed of default categories for a user. Called by the finance API
// before any read so users that never open Finanças don't have rows created
// uselessly. Idempotent: only inserts if the user has zero categories yet.
const DEFAULT_CATEGORIES = [
  { kind: 'expense', name: 'Alimentação',  icon: '🍽️' },
  { kind: 'expense', name: 'Mercado',      icon: '🛒' },
  { kind: 'expense', name: 'Moradia',      icon: '🏠' },
  { kind: 'expense', name: 'Transporte',   icon: '🚗' },
  { kind: 'expense', name: 'Lazer',        icon: '🎮' },
  { kind: 'expense', name: 'Saúde',        icon: '💊' },
  { kind: 'expense', name: 'Educação',     icon: '📚' },
  { kind: 'expense', name: 'Outros',       icon: '📦' },
  { kind: 'income',  name: 'Salário',      icon: '💰' },
  { kind: 'income',  name: 'Freelance',    icon: '💼' },
  { kind: 'income',  name: 'Outros',       icon: '✨' },
];
function ensureDefaultCategories(userId) {
  const has = db.prepare('SELECT 1 FROM finance_categories WHERE user_id = ? LIMIT 1').get(userId);
  if (has) return;
  const insert = db.prepare(
    'INSERT INTO finance_categories (user_id, name, kind, icon, position) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((c, i) => insert.run(userId, c.name, c.kind, c.icon, i));
  })();
}

// ---- USER SUSPENSION (Iteration 7.2) ----
// Soft-disable an account from the admin panel without deleting it. Suspended
// users can't log in (auth.loadUser drops their sessions) and can't authenticate
// new ones. Owners can't suspend themselves (server-enforced) — would lock the
// admin panel.
const userColsForSuspend = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColsForSuspend.includes('suspended_at')) {
  db.exec('ALTER TABLE users ADD COLUMN suspended_at DATETIME');
}

// ---- FEATURE FLAGS (Iteration 7.1) ----
// Toggleable modules. Owners flip values from the admin panel; the frontend
// fetches them on boot via /api/flags and hides UI accordingly. Backend
// routes that protect a feature should also check the flag before serving.
//
// 'message' is shown in the disabled feature's place (e.g. "Reportar bug está
// em manutenção"). Empty string = silent disable (just hide).
db.exec(`
  CREATE TABLE IF NOT EXISTS feature_flags (
    key        TEXT PRIMARY KEY,
    enabled    INTEGER NOT NULL DEFAULT 1,
    message    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
`);
// Seed initial flags. INSERT OR IGNORE preserves owner-edited values across
// reboots — only adds rows for flags that don't exist yet.
const seedFlag = db.prepare('INSERT OR IGNORE INTO feature_flags (key, enabled) VALUES (?, ?)');
seedFlag.run('report_bug', 1);  // Default ON: bug-report button in sidebar
seedFlag.run('invites', 1);     // Default ON: invite system (Members modal)
seedFlag.run('financial', 0);   // Default OFF: future financial module (PR pending)
seedFlag.run('recurring_cards', 0); // Default OFF: recurring monthly cards (owner gates rollout)
// 'registration_open' migrates the old ALLOW_REGISTRATION env var into a
// runtime-toggleable flag. Initial value reads the env (default closed if
// ALLOW_REGISTRATION=false), so first boot preserves the previous behavior.
// After that, INSERT OR IGNORE keeps whatever the owner toggled in the panel.
const initialRegOpen = process.env.ALLOW_REGISTRATION === 'false' ? 0 : 1;
seedFlag.run('registration_open', initialRegOpen);

// ---- OWNER FLAG (Iteration 7) ----
// Single is_owner=1 user has access to /admin (manage users, feature flags,
// platform stats). Bootstrap: the user with email matching OWNER_EMAIL env
// (default chongrenato@gmail.com) is automatically promoted on every boot —
// idempotent UPDATE, so demoting an owner needs to be a manual SQL change
// AFTER renaming OWNER_EMAIL to something else.
const userColsForOwner = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColsForOwner.includes('is_owner')) {
  db.exec('ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0');
}
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'chongrenato@gmail.com').toLowerCase();
db.prepare('UPDATE users SET is_owner = 1 WHERE LOWER(email) = ?').run(OWNER_EMAIL);

// ---- INVITE EXTRA BOARDS (Iteration 6.1) ----
// One invite can cover multiple boards. invites.board_id keeps the "primary"
// board (for back-compat with the legacy single-board flow); any additional
// boards live here. Accepting the invite makes the user a member of the
// primary AND every board listed here.
db.exec(`
  CREATE TABLE IF NOT EXISTS invite_boards (
    invite_id INTEGER NOT NULL,
    board_id  INTEGER NOT NULL,
    PRIMARY KEY (invite_id, board_id),
    FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE CASCADE,
    FOREIGN KEY (board_id)  REFERENCES boards(id)  ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_invite_boards_board ON invite_boards(board_id);
`);

// ---- INVITE ALLOWED EMAILS (Iteration 6) ----
// Each invite can carry a whitelist of emails. The link only works for users
// whose login email matches one of the entries. Multiple emails per invite =
// the owner generates ONE link and shares it with the whole team; each person
// claims their slot once. Legacy invites (no rows here) keep the old single-use
// behavior driven by invites.used_at.
db.exec(`
  CREATE TABLE IF NOT EXISTS invite_allowed_emails (
    invite_id INTEGER NOT NULL,
    email     TEXT NOT NULL,
    used_at   DATETIME,
    user_id   INTEGER,
    PRIMARY KEY (invite_id, email),
    FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_invite_emails_invite ON invite_allowed_emails(invite_id);
  CREATE INDEX IF NOT EXISTS idx_invite_emails_email  ON invite_allowed_emails(email);
`);

// ---- BOARD ORDER PER USER (Iteration 5) ----
// Each user can drag boards in the sidebar to set their own order.
// Boards without an entry sort after the explicit ones, falling back to created_at DESC.
db.exec(`
  CREATE TABLE IF NOT EXISTS board_user_order (
    user_id  INTEGER NOT NULL,
    board_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, board_id),
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_board_order_user ON board_user_order(user_id, position);
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

// Attach the finance helper as a method on the db instance so existing
// `require('./db')` callers don't break (they get the same db object back).
db.ensureDefaultCategories = ensureDefaultCategories;

module.exports = db;
