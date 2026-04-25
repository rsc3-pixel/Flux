const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SESSION_COOKIE = 'mt_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: SESSION_TTL_MS,
  secure: process.env.NODE_ENV === 'production',
};

// ---------- Password ----------
function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}
// Pre-computed bcrypt hash of a constant string. Used to perform a dummy
// compareSync when the email doesn't exist, so login response time is the
// same whether the email exists or not (defends against email enumeration
// via timing oracle).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-just-for-timing', 10);
function dummyVerify() {
  bcrypt.compareSync('whatever', DUMMY_HASH);
}

// ---------- Sessions ----------
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(res, userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt);
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
  return token;
}

function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(SESSION_COOKIE);
}

// ---------- Middleware ----------
function loadUser(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const session = db.prepare(`
      SELECT * FROM sessions
      WHERE token = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(token);
    if (session) {
      req.user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(session.user_id);
    } else {
      // Token invalid or expired: clear the cookie + delete any stale row
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      res.clearCookie(SESSION_COOKIE);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

// ---------- Permissions ----------
// Returns role string ('owner'|'admin'|'membro') or null if no access.
function getBoardRole(userId, boardId) {
  const board = db.prepare('SELECT owner_id FROM boards WHERE id = ?').get(boardId);
  if (!board) return null;
  if (board.owner_id === userId) return 'owner';
  const m = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(boardId, userId);
  return m ? m.role : null;
}

function canView(userId, boardId)   { return getBoardRole(userId, boardId) !== null; }
function canEdit(userId, boardId)   { return getBoardRole(userId, boardId) !== null; } // any member can edit cards/lists
function canManage(userId, boardId) {
  const role = getBoardRole(userId, boardId);
  return role === 'owner' || role === 'admin';
}
function canDeleteBoard(userId, boardId) {
  return getBoardRole(userId, boardId) === 'owner';
}

// Resolve board_id from list_id or card_id
function boardIdFromList(listId) {
  return db.prepare('SELECT board_id FROM lists WHERE id = ?').get(listId)?.board_id;
}
function boardIdFromCard(cardId) {
  return db.prepare(`
    SELECT lists.board_id AS board_id
    FROM cards JOIN lists ON cards.list_id = lists.id
    WHERE cards.id = ?
  `).get(cardId)?.board_id;
}

// Resolve workspace_id from board_id (boards.workspace_id since iter 3)
function workspaceIdFromBoard(boardId) {
  return db.prepare('SELECT workspace_id FROM boards WHERE id = ?').get(boardId)?.workspace_id;
}

// Get the user's default workspace (single per user for now)
function defaultWorkspaceForUser(userId) {
  return db.prepare('SELECT * FROM workspaces WHERE owner_id = ? ORDER BY id LIMIT 1').get(userId);
}

// Insert an activity log entry. Failures are swallowed so logging never breaks
// the underlying request.
const _logStmt = db.prepare(`
  INSERT INTO activity_log (workspace_id, user_id, action, entity_type, entity_id, board_id, details)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
function logActivity({ workspaceId, userId, action, entityType, entityId, boardId, details }) {
  try {
    _logStmt.run(
      workspaceId,
      userId ?? null,
      action,
      entityType ?? null,
      entityId ?? null,
      boardId ?? null,
      details ? JSON.stringify(details) : null,
    );
  } catch (e) {
    console.warn('[activity_log] failed:', e.message);
  }
}

// Express middleware wrappers that 403 when permission denied.
function requireBoardAccess(getBoardId, level = 'view') {
  return (req, res, next) => {
    const boardId = getBoardId(req);
    if (!boardId) return res.status(404).json({ error: 'Recurso não encontrado' });
    const allow =
      level === 'manage'        ? canManage(req.user.id, boardId)        :
      level === 'delete-board'  ? canDeleteBoard(req.user.id, boardId)   :
                                  canEdit(req.user.id, boardId); // 'view' or 'edit'
    if (!allow) return res.status(403).json({ error: 'Sem permissão' });
    req.boardId = boardId;
    next();
  };
}

module.exports = {
  hashPassword, verifyPassword, dummyVerify,
  createSession, destroySession,
  loadUser, requireAuth,
  getBoardRole, canView, canEdit, canManage, canDeleteBoard,
  boardIdFromList, boardIdFromCard, workspaceIdFromBoard, defaultWorkspaceForUser,
  logActivity,
  requireBoardAccess,
  newToken,
  SESSION_COOKIE,
};
