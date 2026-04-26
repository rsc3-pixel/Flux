const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const version = require('./version');

const app = express();
const PORT = process.env.PORT || 3000;

// We sit behind nginx as a reverse proxy, which sets X-Forwarded-For with the
// real client IP. Tell Express to trust exactly one hop so req.ip reflects the
// actual user (not 127.0.0.1), which makes express-rate-limit count correctly.
app.set('trust proxy', 1);

// CORS intentionally NOT enabled: the front-end is served by this same Express
// app, so all requests are same-origin. Allowing CORS with credentials would
// open the door to CSRF and credentialed cross-origin data theft.

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(auth.loadUser); // populates req.user if session cookie is valid

// The service worker MUST never be cached by the browser. If it is, deploys
// don't propagate: the browser keeps using the old SW (and its old shell
// cache) until the cached SW expires. no-store forces revalidation on every
// page load, which is the only path that lets a new SW take over.
app.use('/sw.js', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiter for auth endpoints (5 attempts / 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// Rate limiter for bug reports (3 / hour per IP) — defense against spam
const bugReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos reports. Tente novamente em 1 hora.' },
});

// ---- Input validation helpers ----
const PRIORITY_VALUES = new Set(['baixa', 'media', 'alta']);
const ROLE_VALUES = new Set(['admin', 'membro']);
const CATEGORY_VALUES = new Set([
  'design-system', 'critico', 'pesquisa', 'feature',
  'documentacao', 'bug', 'ui-design', 'lista',
]);
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validPriority(v)  { return v == null ? null : (PRIORITY_VALUES.has(v) ? v : undefined); }
function validCategory(v)  { return v == null || v === '' ? null : (CATEGORY_VALUES.has(v) ? v : undefined); }
function validDate(v)      { return v == null || v === '' ? null : (DATE_RE.test(v) ? v : undefined); }
function validColor(v)     { return v == null ? null : (COLOR_RE.test(v) ? v : undefined); }
function validRole(v)      { return ROLE_VALUES.has(v); }
// Returns: null/value if OK, or `undefined` to signal "invalid"

// =================================================================
// AUTH
// =================================================================
// Helper: tag activities with the user's workspace + the affected board
function logBoardActivity(req, action, boardId, entityType, entityId, details) {
  const wsId = boardId ? auth.workspaceIdFromBoard(boardId) : auth.defaultWorkspaceForUser(req.user.id)?.id;
  if (!wsId) return;
  auth.logActivity({
    workspaceId: wsId,
    userId: req.user.id,
    action, entityType, entityId, boardId, details,
  });
}

// Public config endpoint — lets the front-end know whether to show the
// "Criar conta" tab on the auth screen.
app.get('/api/config', (_req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  res.json({
    // Always allow registration when there are no users yet (bootstrap),
    // otherwise honor the ALLOW_REGISTRATION env var (default on).
    registrationEnabled: userCount === 0 || process.env.ALLOW_REGISTRATION !== 'false',
  });
});

// Public version endpoint — frontend compares with localStorage to decide
// whether to show the "Novidades" modal.
app.get('/api/version', (_req, res) => {
  res.json({ current: version.current, releases: version.releases });
});

app.post('/api/auth/register', authLimiter, (req, res) => {
  // Honor the ALLOW_REGISTRATION lock (with bootstrap exception for the very first user)
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0 && process.env.ALLOW_REGISTRATION === 'false') {
    return res.status(403).json({ error: 'Cadastros estão desabilitados nesta instância' });
  }

  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Email, senha e nome obrigatórios' });
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Email inválido' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Senha precisa ter ao menos 8 caracteres' });
  if (typeof name !== 'string' || !name.trim())
    return res.status(400).json({ error: 'Nome inválido' });

  const emailLower = email.toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
  if (exists) return res.status(409).json({ error: 'Email já cadastrado' });

  // Atomic: count + insert + claim unowned boards in a single transaction so
  // two concurrent registrations can't both become "first user".
  const result = db.transaction(() => {
    const isFirstUser = db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0;
    const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
                   .run(emailLower, auth.hashPassword(password), name.trim().slice(0, 100));
    const userId = info.lastInsertRowid;
    if (isFirstUser) {
      db.prepare('UPDATE boards SET owner_id = ? WHERE owner_id IS NULL').run(userId);
    }
    // Create the user's default workspace
    const wsInfo = db.prepare('INSERT INTO workspaces (name, owner_id, plan) VALUES (?, ?, ?)')
                     .run('Pessoal', userId, 'free');
    // Link any boards (just claimed or pre-existing without workspace) to this workspace
    db.prepare('UPDATE boards SET workspace_id = ? WHERE owner_id = ? AND workspace_id IS NULL')
      .run(wsInfo.lastInsertRowid, userId);
    return userId;
  })();

  auth.createSession(res, result);
  res.status(201).json({ id: result, email: emailLower, name: name.trim() });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  // Always run a bcrypt comparison (real or dummy) so response time doesn't
  // reveal whether the email exists.
  const ok = user
    ? auth.verifyPassword(password, user.password_hash)
    : (auth.dummyVerify(), false);
  if (!user || !ok)
    return res.status(401).json({ error: 'Email ou senha inválidos' });

  auth.createSession(res, user.id);
  res.json({ id: user.id, email: user.email, name: user.name });
});

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  res.json(req.user);
});

// Public: invite preview (so unauthenticated users can see what they're invited to)
app.get('/api/invites/:token', (req, res) => {
  const inv = db.prepare(`
    SELECT i.*, b.title AS board_title, b.color AS board_color, u.name AS inviter_name
    FROM invites i
    JOIN boards b ON b.id = i.board_id
    JOIN users u  ON u.id = i.created_by
    WHERE i.token = ?
  `).get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Convite inválido' });
  if (inv.used_at) return res.status(410).json({ error: 'Convite já utilizado' });
  res.json({
    board_id:    inv.board_id,
    board_title: inv.board_title,
    board_color: inv.board_color,
    role:        inv.role,
    inviter:     inv.inviter_name,
  });
});

// =================================================================
// All routes below require authentication
// =================================================================
app.use('/api', auth.requireAuth);

// =================================================================
// BUG REPORTS
// =================================================================
app.post('/api/report-bug', bugReportLimiter, async (req, res) => {
  const { description, url } = req.body || {};

  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Descrição é obrigatória' });
  }
  if (description.length > 2000) {
    return res.status(400).json({ error: 'Descrição muito longa (máx 2000 caracteres)' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('Bug report received but RESEND_API_KEY not configured');
    return res.status(503).json({ error: 'Sistema de envio de bugs indisponível no momento' });
  }

  const userAgent = req.get('User-Agent') || '(unknown)';
  const reportUrl = typeof url === 'string' && url.length < 500 ? url : '(unknown)';
  const subject = `[Flux Bug] ${req.user.name}: ${description.trim().slice(0, 60)}`;
  const emailBody = [
    `From: ${req.user.name} <${req.user.email}> (id ${req.user.id})`,
    `URL: ${reportUrl}`,
    `User-Agent: ${userAgent}`,
    `Time: ${new Date().toISOString()}`,
    '',
    '--- Description ---',
    description.trim(),
  ].join('\n');

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Flux Bug Report <onboarding@resend.dev>',
        to: process.env.BUG_REPORT_TO || 'chongrenato@gmail.com',
        subject,
        text: emailBody,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => '(no body)');
      console.error('Resend API error', resendRes.status, errText);
      return res.status(502).json({ error: 'Falha ao enviar bug. Tente novamente.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Bug report send failed', err);
    res.status(502).json({ error: 'Falha ao enviar bug. Tente novamente.' });
  }
});

// =================================================================
// BOARDS
// =================================================================
app.get('/api/boards', (req, res) => {
  const boards = db.prepare(`
    SELECT DISTINCT b.* FROM boards b
    LEFT JOIN board_members m ON m.board_id = b.id
    WHERE b.owner_id = ? OR m.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id, req.user.id);
  res.json(boards);
});

app.get('/api/boards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!auth.canView(req.user.id, id))
    return res.status(403).json({ error: 'Sem permissão' });

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
  if (!board) return res.status(404).json({ error: 'Board não encontrado' });

  const lists = db.prepare('SELECT * FROM lists WHERE board_id = ? ORDER BY position').all(board.id);
  const cardStmt = db.prepare('SELECT * FROM cards WHERE list_id = ? ORDER BY position');
  const checklistStmt = db.prepare('SELECT * FROM checklist_items WHERE card_id = ? ORDER BY position, id');
  for (const list of lists) {
    list.cards = cardStmt.all(list.id);
    for (const card of list.cards) {
      card.checklist_items = checklistStmt.all(card.id);
    }
  }

  board.lists = lists;
  board.role = auth.getBoardRole(req.user.id, id);
  res.json(board);
});

app.post('/api/boards', (req, res) => {
  const { title, color } = req.body;
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const c = validColor(color);
  if (c === undefined) return res.status(400).json({ error: 'Cor inválida (formato #rrggbb)' });
  const ws = auth.defaultWorkspaceForUser(req.user.id);
  const info = db.prepare('INSERT INTO boards (title, color, owner_id, workspace_id) VALUES (?, ?, ?, ?)')
                 .run(String(title).slice(0, 200), c || '#0079bf', req.user.id, ws?.id);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(info.lastInsertRowid);
  logBoardActivity(req, 'board.created', board.id, 'board', board.id, { title: board.title });
  res.status(201).json(board);
});

app.put('/api/boards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!auth.canManage(req.user.id, id))
    return res.status(403).json({ error: 'Apenas Admin/Owner pode editar' });
  const { title, color } = req.body;
  const c = validColor(color);
  if (c === undefined) return res.status(400).json({ error: 'Cor inválida (formato #rrggbb)' });
  const before = db.prepare('SELECT title, color FROM boards WHERE id = ?').get(id);
  db.prepare('UPDATE boards SET title = COALESCE(?, title), color = COALESCE(?, color) WHERE id = ?')
    .run(title != null ? String(title).slice(0, 200) : null, c, id);
  const after = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
  if (title && before?.title !== after.title) {
    logBoardActivity(req, 'board.renamed', id, 'board', id, { from: before.title, to: after.title });
  }
  res.json(after);
});

app.delete('/api/boards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!auth.canDeleteBoard(req.user.id, id))
    return res.status(403).json({ error: 'Apenas o Owner pode excluir' });
  const before = db.prepare('SELECT title, workspace_id FROM boards WHERE id = ?').get(id);
  db.prepare('DELETE FROM boards WHERE id = ?').run(id);
  // Use the captured workspace_id since the board no longer exists to look it up
  if (before) {
    auth.logActivity({
      workspaceId: before.workspace_id, userId: req.user.id,
      action: 'board.deleted', entityType: 'board', entityId: id,
      details: { title: before.title },
    });
  }
  res.status(204).end();
});

// =================================================================
// LISTS
// =================================================================
app.post('/api/lists', (req, res) => {
  const { board_id, title } = req.body;
  if (!board_id || !title) return res.status(400).json({ error: 'board_id e title obrigatórios' });
  if (!auth.canEdit(req.user.id, board_id))
    return res.status(403).json({ error: 'Sem permissão' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM lists WHERE board_id = ?')
                   .get(board_id).p;
  const info = db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)')
                 .run(board_id, String(title).slice(0, 100), maxPos + 1);
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid);
  logBoardActivity(req, 'list.created', board_id, 'list', list.id, { title: list.title });
  res.status(201).json(list);
});

app.put('/api/lists/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const boardId = auth.boardIdFromList(id);
  if (!boardId) return res.status(404).json({ error: 'Lista não encontrada' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const { title, position } = req.body;
  db.prepare('UPDATE lists SET title = COALESCE(?, title), position = COALESCE(?, position) WHERE id = ?')
    .run(title != null ? String(title).slice(0, 100) : null, position, id);
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(id));
});

app.delete('/api/lists/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const boardId = auth.boardIdFromList(id);
  if (!boardId) return res.status(404).json({ error: 'Lista não encontrada' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const before = db.prepare('SELECT title FROM lists WHERE id = ?').get(id);
  db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  logBoardActivity(req, 'list.deleted', boardId, 'list', id, { title: before?.title });
  res.status(204).end();
});

app.post('/api/lists/reorder', (req, res) => {
  const updates = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Array esperado' });
  // Verify the user can edit every affected board
  for (const u of updates) {
    const bId = auth.boardIdFromList(u.id);
    if (!bId || !auth.canEdit(req.user.id, bId))
      return res.status(403).json({ error: 'Sem permissão' });
  }
  const stmt = db.prepare('UPDATE lists SET position = ? WHERE id = ?');
  db.transaction((arr) => { for (const u of arr) stmt.run(u.position, u.id); })(updates);
  res.json({ ok: true });
});

// =================================================================
// CARDS
// =================================================================
app.post('/api/cards', (req, res) => {
  const { list_id, title, description, priority, due_date, start_date, assignee, category } = req.body;
  if (!list_id || !title) return res.status(400).json({ error: 'list_id e title obrigatórios' });
  const boardId = auth.boardIdFromList(list_id);
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const p = validPriority(priority);
  const sd = validDate(start_date);
  const dd = validDate(due_date);
  const cat = validCategory(category);
  if (p === undefined)  return res.status(400).json({ error: 'priority inválida' });
  if (sd === undefined) return res.status(400).json({ error: 'start_date inválida (YYYY-MM-DD)' });
  if (dd === undefined) return res.status(400).json({ error: 'due_date inválida (YYYY-MM-DD)' });
  if (cat === undefined) return res.status(400).json({ error: 'category inválida' });

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM cards WHERE list_id = ?')
                   .get(list_id).p;
  const info = db.prepare(`
    INSERT INTO cards (list_id, title, description, priority, due_date, start_date, assignee, category, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(list_id, String(title).slice(0, 200), String(description || '').slice(0, 5000),
         p || 'media', dd, sd, String(assignee || '').slice(0, 100), cat, maxPos + 1);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
  const listTitle = db.prepare('SELECT title FROM lists WHERE id = ?').get(list_id)?.title;
  logBoardActivity(req, 'card.created', boardId, 'card', card.id, { title: card.title, list: listTitle });
  res.status(201).json(card);
});

app.put('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const boardId = auth.boardIdFromCard(id);
  if (!boardId) return res.status(404).json({ error: 'Card não encontrado' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const { title, description, priority, due_date, start_date, assignee, list_id, position, category } = req.body;

  const p = validPriority(priority);
  const sd = validDate(start_date);
  const dd = validDate(due_date);
  const cat = validCategory(category);
  if (p === undefined)  return res.status(400).json({ error: 'priority inválida' });
  if (sd === undefined) return res.status(400).json({ error: 'start_date inválida (YYYY-MM-DD)' });
  if (dd === undefined) return res.status(400).json({ error: 'due_date inválida (YYYY-MM-DD)' });
  if (cat === undefined) return res.status(400).json({ error: 'category inválida' });

  // If user is moving the card to another list, the target list must be on a board they can edit
  if (list_id != null) {
    const targetBoard = auth.boardIdFromList(list_id);
    if (!targetBoard || !auth.canEdit(req.user.id, targetBoard))
      return res.status(403).json({ error: 'Sem permissão na lista de destino' });
  }

  const before = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  db.prepare(`
    UPDATE cards SET
      title       = COALESCE(?, title),
      description = COALESCE(?, description),
      priority    = COALESCE(?, priority),
      due_date    = ?,
      start_date  = ?,
      assignee    = COALESCE(?, assignee),
      list_id     = COALESCE(?, list_id),
      position    = COALESCE(?, position),
      category    = ?
    WHERE id = ?
  `).run(
    title       != null ? String(title).slice(0, 200) : null,
    description != null ? String(description).slice(0, 5000) : null,
    p,
    dd, sd,
    assignee    != null ? String(assignee).slice(0, 100) : null,
    list_id, position, cat, id
  );
  const after = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  // Log a "moved" event when the list changed; otherwise a generic "updated"
  if (before && after.list_id !== before.list_id) {
    const fromList = db.prepare('SELECT title FROM lists WHERE id = ?').get(before.list_id)?.title;
    const toList   = db.prepare('SELECT title FROM lists WHERE id = ?').get(after.list_id)?.title;
    logBoardActivity(req, 'card.moved', boardId, 'card', id,
      { title: after.title, from: fromList, to: toList });
  } else if (title && before?.title !== after.title) {
    logBoardActivity(req, 'card.renamed', boardId, 'card', id,
      { from: before.title, to: after.title });
  }
  res.json(after);
});

app.delete('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const boardId = auth.boardIdFromCard(id);
  if (!boardId) return res.status(404).json({ error: 'Card não encontrado' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const before = db.prepare('SELECT title FROM cards WHERE id = ?').get(id);
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  logBoardActivity(req, 'card.deleted', boardId, 'card', id, { title: before?.title });
  res.status(204).end();
});

app.post('/api/cards/reorder', (req, res) => {
  const updates = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Array esperado' });
  for (const u of updates) {
    const bId = auth.boardIdFromCard(u.id);
    if (!bId || !auth.canEdit(req.user.id, bId))
      return res.status(403).json({ error: 'Sem permissão' });
  }
  const stmt = db.prepare('UPDATE cards SET list_id = ?, position = ? WHERE id = ?');
  db.transaction((arr) => { for (const u of arr) stmt.run(u.list_id, u.position, u.id); })(updates);
  res.json({ ok: true });
});

// =================================================================
// CHECKLIST ITEMS
// =================================================================
// Resolve a checklist item with its parent card + board (single join, used by
// PATCH/DELETE for both ownership check and activity logging).
function getChecklistItemContext(itemId) {
  return db.prepare(`
    SELECT ci.id, ci.card_id, ci.text, ci.completed, ci.position,
           c.title AS card_title, l.board_id
    FROM checklist_items ci
    JOIN cards c ON c.id = ci.card_id
    JOIN lists l ON l.id = c.list_id
    WHERE ci.id = ?
  `).get(itemId);
}

app.post('/api/cards/:id/checklist', (req, res) => {
  const cardId = parseInt(req.params.id);
  const boardId = auth.boardIdFromCard(cardId);
  if (!boardId) return res.status(404).json({ error: 'Card não encontrado' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim())
    return res.status(400).json({ error: 'Texto obrigatório' });
  if (text.length > 500)
    return res.status(400).json({ error: 'Texto muito longo (máx 500 caracteres)' });

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM checklist_items WHERE card_id = ?')
                   .get(cardId).p;
  const info = db.prepare('INSERT INTO checklist_items (card_id, text, position) VALUES (?, ?, ?)')
                 .run(cardId, text.trim().slice(0, 500), maxPos + 1);
  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(info.lastInsertRowid);
  const cardTitle = db.prepare('SELECT title FROM cards WHERE id = ?').get(cardId)?.title;
  logBoardActivity(req, 'checklist.item_added', boardId, 'checklist_item', item.id,
    { text: item.text, card: cardTitle, card_id: cardId });
  res.status(201).json(item);
});

// PATCH text or completed flag. Toggle-only updates intentionally do NOT log
// activity (would be too noisy on a shopping-list use case).
app.patch('/api/checklist/:itemId', (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const ctx = getChecklistItemContext(itemId);
  if (!ctx) return res.status(404).json({ error: 'Item não encontrado' });
  if (!auth.canEdit(req.user.id, ctx.board_id))
    return res.status(403).json({ error: 'Sem permissão' });

  const { text, completed } = req.body || {};
  let newText = null, newCompleted = null;
  if (text !== undefined) {
    if (typeof text !== 'string' || !text.trim())
      return res.status(400).json({ error: 'Texto inválido' });
    if (text.length > 500)
      return res.status(400).json({ error: 'Texto muito longo (máx 500 caracteres)' });
    newText = text.trim().slice(0, 500);
  }
  if (completed !== undefined) {
    if (typeof completed !== 'boolean')
      return res.status(400).json({ error: 'completed deve ser boolean' });
    newCompleted = completed ? 1 : 0;
  }
  if (newText === null && newCompleted === null)
    return res.status(400).json({ error: 'Nada para atualizar' });

  db.prepare(`
    UPDATE checklist_items SET
      text      = COALESCE(?, text),
      completed = COALESCE(?, completed)
    WHERE id = ?
  `).run(newText, newCompleted, itemId);

  res.json(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(itemId));
});

app.delete('/api/checklist/:itemId', (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const ctx = getChecklistItemContext(itemId);
  if (!ctx) return res.status(404).json({ error: 'Item não encontrado' });
  if (!auth.canEdit(req.user.id, ctx.board_id))
    return res.status(403).json({ error: 'Sem permissão' });

  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(itemId);
  logBoardActivity(req, 'checklist.item_removed', ctx.board_id, 'checklist_item', itemId,
    { text: ctx.text, card: ctx.card_title, card_id: ctx.card_id });
  res.status(204).end();
});

app.patch('/api/cards/:id/checklist/reorder', (req, res) => {
  const cardId = parseInt(req.params.id);
  const boardId = auth.boardIdFromCard(cardId);
  if (!boardId) return res.status(404).json({ error: 'Card não encontrado' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids deve ser array' });
  if (ids.length === 0) return res.json({ ok: true });
  if (!ids.every(n => Number.isInteger(n)))
    return res.status(400).json({ error: 'ids deve conter inteiros' });

  // Reject if any provided id doesn't belong to this card (prevents shuffling
  // someone else's items via a card you can edit).
  const placeholders = ids.map(() => '?').join(',');
  const ownCount = db.prepare(`
    SELECT COUNT(*) AS c FROM checklist_items WHERE card_id = ? AND id IN (${placeholders})
  `).get(cardId, ...ids).c;
  if (ownCount !== ids.length)
    return res.status(400).json({ error: 'Item fora do card informado' });

  const stmt = db.prepare('UPDATE checklist_items SET position = ? WHERE id = ?');
  db.transaction(() => { ids.forEach((id, i) => stmt.run(i, id)); })();

  res.json({ ok: true });
});

// =================================================================
// MEMBERS & INVITES
// =================================================================
app.get('/api/boards/:id/members', (req, res) => {
  const boardId = parseInt(req.params.id);
  if (!auth.canView(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const owner = db.prepare(`
    SELECT u.id, u.email, u.name, 'owner' AS role
    FROM users u JOIN boards b ON b.owner_id = u.id
    WHERE b.id = ?
  `).get(boardId);
  const members = db.prepare(`
    SELECT u.id, u.email, u.name, m.role
    FROM board_members m JOIN users u ON u.id = m.user_id
    WHERE m.board_id = ?
    ORDER BY u.name
  `).all(boardId);
  res.json([owner, ...members].filter(Boolean));
});

app.delete('/api/boards/:id/members/:userId', (req, res) => {
  const boardId = parseInt(req.params.id);
  const userId  = parseInt(req.params.userId);
  if (!auth.canManage(req.user.id, boardId))
    return res.status(403).json({ error: 'Apenas Admin/Owner pode remover membros' });
  // Prevent removing the owner
  const ownerId = db.prepare('SELECT owner_id FROM boards WHERE id = ?').get(boardId)?.owner_id;
  if (ownerId === userId)
    return res.status(400).json({ error: 'Não é possível remover o owner' });
  const removed = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(boardId, userId);
  logBoardActivity(req, 'member.removed', boardId, 'member', userId, { name: removed?.name });
  res.status(204).end();
});

app.put('/api/boards/:id/members/:userId', (req, res) => {
  const boardId = parseInt(req.params.id);
  const userId  = parseInt(req.params.userId);
  const { role } = req.body;
  if (!['admin', 'membro'].includes(role))
    return res.status(400).json({ error: 'Role inválida' });
  if (!auth.canManage(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const ownerId = db.prepare('SELECT owner_id FROM boards WHERE id = ?').get(boardId)?.owner_id;
  if (ownerId === userId)
    return res.status(400).json({ error: 'Owner não tem role configurável' });
  db.prepare('UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?')
    .run(role, boardId, userId);
  const target = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  logBoardActivity(req, 'member.role_changed', boardId, 'member', userId, { name: target?.name, role });
  res.json({ ok: true });
});

app.post('/api/boards/:id/invites', (req, res) => {
  const boardId = parseInt(req.params.id);
  if (!auth.canManage(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const role = ['admin', 'membro'].includes(req.body.role) ? req.body.role : 'membro';
  const token = auth.newToken();
  db.prepare('INSERT INTO invites (board_id, token, role, created_by) VALUES (?, ?, ?, ?)')
    .run(boardId, token, role, req.user.id);
  res.status(201).json({ token, role });
});

app.post('/api/invites/:token/accept', (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Convite inválido' });
  if (inv.used_at) return res.status(410).json({ error: 'Convite já utilizado' });

  const ownerId = db.prepare('SELECT owner_id FROM boards WHERE id = ?').get(inv.board_id)?.owner_id;
  if (ownerId === req.user.id)
    return res.status(400).json({ error: 'Você é owner deste quadro' });

  // Add as member (or update role if already a member)
  const existing = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?')
                     .get(inv.board_id, req.user.id);
  if (existing) {
    db.prepare('UPDATE board_members SET role = ? WHERE id = ?').run(inv.role, existing.id);
  } else {
    db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)')
      .run(inv.board_id, req.user.id, inv.role);
  }
  db.prepare('UPDATE invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(inv.id);
  logBoardActivity(req, 'member.added', inv.board_id, 'member', req.user.id,
    { name: req.user.name, role: inv.role });
  res.json({ board_id: inv.board_id, role: inv.role });
});

// =================================================================
// WORKSPACE / ACTIVITY / ANALYTICS (Iteration 3)
// =================================================================

// Returns the current user's default workspace (only one per user for now)
app.get('/api/workspaces/me', (req, res) => {
  const ws = auth.defaultWorkspaceForUser(req.user.id);
  if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });
  // Counts for the workspace card display
  const boardCount = db.prepare(`
    SELECT COUNT(DISTINCT b.id) AS c
    FROM boards b
    LEFT JOIN board_members m ON m.board_id = b.id
    WHERE b.workspace_id = ? AND (b.owner_id = ? OR m.user_id = ?)
  `).get(ws.id, req.user.id, req.user.id).c;
  res.json({ ...ws, board_count: boardCount });
});

// Activity feed for the current workspace, filtered to boards the user can see
app.get('/api/workspaces/:id/activity', (req, res) => {
  const wsId = parseInt(req.params.id);
  const own = auth.defaultWorkspaceForUser(req.user.id);
  if (!own || own.id !== wsId) return res.status(403).json({ error: 'Sem permissão' });

  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = db.prepare(`
    SELECT a.*, u.name AS user_name, u.email AS user_email, b.title AS board_title
    FROM activity_log a
    LEFT JOIN users  u ON u.id = a.user_id
    LEFT JOIN boards b ON b.id = a.board_id
    WHERE a.workspace_id = ?
      AND (a.board_id IS NULL OR EXISTS (
        SELECT 1 FROM boards bb
        LEFT JOIN board_members m ON m.board_id = bb.id
        WHERE bb.id = a.board_id AND (bb.owner_id = ? OR m.user_id = ?)
      ))
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(wsId, req.user.id, req.user.id, limit);

  res.json(rows.map(r => ({
    ...r,
    details: r.details ? JSON.parse(r.details) : null,
  })));
});

// Aggregated workspace metrics
app.get('/api/workspaces/:id/analytics', (req, res) => {
  const wsId = parseInt(req.params.id);
  const own = auth.defaultWorkspaceForUser(req.user.id);
  if (!own || own.id !== wsId) return res.status(403).json({ error: 'Sem permissão' });

  // Boards the user can see in this workspace
  const visibleBoardIds = db.prepare(`
    SELECT DISTINCT b.id FROM boards b
    LEFT JOIN board_members m ON m.board_id = b.id
    WHERE b.workspace_id = ? AND (b.owner_id = ? OR m.user_id = ?)
  `).all(wsId, req.user.id, req.user.id).map(r => r.id);

  if (visibleBoardIds.length === 0) {
    return res.json({
      totals: { boards: 0, lists: 0, cards: 0, members: 0 },
      completedThisWeek: 0,
      topAssignees: [],
      cardsByBoard: [],
      activityByDay: [],
    });
  }

  const placeholders = visibleBoardIds.map(() => '?').join(',');

  const totals = {
    boards: visibleBoardIds.length,
    lists: db.prepare(`SELECT COUNT(*) AS c FROM lists WHERE board_id IN (${placeholders})`).get(...visibleBoardIds).c,
    cards: db.prepare(`
      SELECT COUNT(*) AS c FROM cards c
      JOIN lists l ON l.id = c.list_id
      WHERE l.board_id IN (${placeholders})
    `).get(...visibleBoardIds).c,
    members: db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS c FROM (
        SELECT user_id FROM board_members WHERE board_id IN (${placeholders})
        UNION
        SELECT owner_id AS user_id FROM boards WHERE id IN (${placeholders})
      )
    `).get(...visibleBoardIds, ...visibleBoardIds).c,
  };

  // Completed this week = cards in lists matching /conclu|feito|done/i, last 7 days
  // Approximation: use card.created_at since we don't track "completed_at"
  const completedThisWeek = db.prepare(`
    SELECT COUNT(*) AS c
    FROM cards c JOIN lists l ON l.id = c.list_id
    WHERE l.board_id IN (${placeholders})
      AND (LOWER(l.title) LIKE '%conclu%' OR LOWER(l.title) LIKE '%feito%' OR LOWER(l.title) LIKE '%done%')
      AND c.created_at >= datetime('now', '-7 days')
  `).get(...visibleBoardIds).c;

  const topAssignees = db.prepare(`
    SELECT TRIM(c.assignee) AS name, COUNT(*) AS count
    FROM cards c JOIN lists l ON l.id = c.list_id
    WHERE l.board_id IN (${placeholders}) AND c.assignee IS NOT NULL AND c.assignee != ''
    GROUP BY TRIM(c.assignee)
    ORDER BY count DESC
    LIMIT 8
  `).all(...visibleBoardIds);

  const cardsByBoard = db.prepare(`
    SELECT b.title AS board, COUNT(c.id) AS count
    FROM boards b
    LEFT JOIN lists l ON l.board_id = b.id
    LEFT JOIN cards c ON c.list_id = l.id
    WHERE b.id IN (${placeholders})
    GROUP BY b.id
    ORDER BY count DESC
  `).all(...visibleBoardIds);

  const activityByDay = db.prepare(`
    SELECT DATE(created_at) AS date, COUNT(*) AS count
    FROM activity_log
    WHERE workspace_id = ? AND created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date
  `).all(wsId);

  res.json({ totals, completedThisWeek, topAssignees, cardsByBoard, activityByDay });
});

// 404 handler for unmatched API routes (returns JSON instead of HTML)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Generic error handler — must be LAST. Suppresses stack traces and file paths
// from reaching the client; logs them server-side for debugging.
app.use((err, req, res, _next) => {
  // Body-parser limit / JSON parse errors come through here
  const status = err.status || err.statusCode || 500;
  const isClientErr = status >= 400 && status < 500;
  if (!isClientErr) console.error(`[${req.method} ${req.path}]`, err);
  const msg =
    err.type === 'entity.too.large' ? 'Payload muito grande' :
    err.type === 'entity.parse.failed' || err instanceof SyntaxError ? 'JSON inválido' :
    isClientErr ? (err.message || 'Requisição inválida') :
    'Erro interno';
  res.status(status).json({ error: msg });
});

app.listen(PORT, () => {
  console.log(`Flux rodando em http://localhost:${PORT}`);
});
