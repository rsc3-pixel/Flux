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

// Disable the trustProxy validator in express-rate-limit v8: it's overly
// strict and warns on every request even though we've correctly set
// `app.set('trust proxy', 1)` above. Without disabling, the logs get
// flooded with ValidationError stack traces that obscure real issues.
const RL_VALIDATE = { trustProxy: false };

// Rate limiter for auth endpoints (5 attempts / 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: RL_VALIDATE,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// Rate limiter for bug reports (3 / hour per IP) — defense against spam
const bugReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: RL_VALIDATE,
  message: { error: 'Muitos reports. Tente novamente em 1 hora.' },
});

// ---- Input validation helpers ----
const PRIORITY_VALUES = new Set(['baixa', 'media', 'alta']);
const ROLE_VALUES = new Set(['admin', 'membro']);
const CATEGORY_VALUES = new Set([
  'design-system', 'critico', 'pesquisa', 'feature',
  'documentacao', 'bug', 'ui-design', 'lista',
  'conta-a-pagar', // Special: when set, card can carry amount + finance category, and "Marcar como pago" creates a finance transaction
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

const CUSTOM_LABEL_MAX = 30;
function validCustomCategoryLabel(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t.length < 1 || t.length > CUSTOM_LABEL_MAX) return undefined;
  return t;
}
function validCustomCategoryColor(v) {
  if (v == null || v === '') return null;
  return typeof v === 'string' && COLOR_RE.test(v) ? v : undefined;
}

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

// Reads the current state of the 'registration_open' feature flag. Owner-
// toggleable from the admin panel; default true if the row is missing.
function isRegistrationOpen() {
  const f = db.prepare("SELECT enabled FROM feature_flags WHERE key = 'registration_open'").get();
  return !f || !!f.enabled;
}

// Public config endpoint — lets the front-end know whether to show the
// "Criar conta" tab on the auth screen.
app.get('/api/config', (_req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  res.json({
    // Always allow registration when there are no users yet (bootstrap),
    // otherwise honor the registration_open feature flag.
    registrationEnabled: userCount === 0 || isRegistrationOpen(),
  });
});

// Public version endpoint — frontend compares with localStorage to decide
// whether to show the "Novidades" modal.
app.get('/api/version', (_req, res) => {
  res.json({ current: version.current, releases: version.releases });
});

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { email, password, name, inviteToken } = req.body || {};
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Email, senha e nome obrigatórios' });
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Email inválido' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Senha precisa ter ao menos 8 caracteres' });
  if (typeof name !== 'string' || !name.trim())
    return res.status(400).json({ error: 'Nome inválido' });

  const emailLower = email.toLowerCase();

  // Honor the registration_open feature flag, with TWO bootstrap exceptions:
  //  1. Very first user (zero accounts) — always allowed.
  //  2. User is registering with an inviteToken whose whitelist includes
  //     this email — they were explicitly invited by an existing user, so
  //     letting them register is the entire point of the invite.
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0 && !isRegistrationOpen()) {
    let hasValidInvite = false;
    if (typeof inviteToken === 'string' && inviteToken) {
      const inv = db.prepare('SELECT id FROM invites WHERE token = ?').get(inviteToken);
      if (inv) {
        const slot = db.prepare(
          'SELECT 1 FROM invite_allowed_emails WHERE invite_id = ? AND email = ? AND used_at IS NULL'
        ).get(inv.id, emailLower);
        if (slot) hasValidInvite = true;
      }
    }
    if (!hasValidInvite) {
      return res.status(403).json({ error: 'Cadastros estão desabilitados. Use um link de convite com seu email.' });
    }
  }

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

  // Suspended accounts can't log in — owner needs to reactivate first.
  // 403 (not 401) so the user knows the credentials were correct, just blocked.
  if (user.suspended_at)
    return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o administrador.' });

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

// Public flag map — frontend reads this on boot to know which features to
// render. Returns the bare minimum (key/enabled/message) — admin-only audit
// fields (updated_at, updated_by) are NOT exposed here.
app.get('/api/flags', (_req, res) => {
  const rows = db.prepare('SELECT key, enabled, message FROM feature_flags').all();
  const out = {};
  for (const f of rows) out[f.key] = { enabled: !!f.enabled, message: f.message || '' };
  res.json(out);
});

// =================================================================
// ADMIN (owner only) — see auth.requireOwner. All admin routes return 404
// when the caller isn't an owner, so the surface area stays invisible.
// =================================================================
app.get('/api/admin/ping', auth.requireOwner, (req, res) => {
  res.json({ ok: true, owner: { id: req.user.id, email: req.user.email } });
});

// Full flag list with audit info (when changed, by whom). Same data as the
// public /api/flags but enriched.
app.get('/api/admin/flags', auth.requireOwner, (req, res) => {
  const rows = db.prepare(`
    SELECT f.key, f.enabled, f.message, f.updated_at, u.name AS updated_by_name
    FROM feature_flags f
    LEFT JOIN users u ON u.id = f.updated_by
    ORDER BY f.key
  `).all();
  res.json(rows.map(f => ({
    key: f.key,
    enabled: !!f.enabled,
    message: f.message || '',
    updated_at: f.updated_at,
    updated_by_name: f.updated_by_name,
  })));
});

// User listing for the admin panel. Includes the basics + activity proxies
// (last_seen via most-recent session, board/card counts) so the owner has
// enough context to decide whether to suspend/delete someone.
app.get('/api/admin/users', auth.requireOwner, (req, res) => {
  const users = db.prepare(`
    SELECT
      u.id, u.email, u.name, u.created_at, u.is_owner, u.suspended_at,
      (SELECT MAX(created_at) FROM sessions WHERE user_id = u.id) AS last_seen,
      (SELECT COUNT(*) FROM boards WHERE owner_id = u.id) AS boards_owned,
      (SELECT COUNT(*) FROM board_members WHERE user_id = u.id) AS boards_member,
      (SELECT COUNT(*) FROM cards c
        JOIN lists l ON l.id = c.list_id
        JOIN boards b ON b.id = l.board_id
        WHERE b.owner_id = u.id) AS cards_in_owned_boards
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    created_at: u.created_at,
    is_owner: !!u.is_owner,
    suspended_at: u.suspended_at,
    last_seen: u.last_seen,
    boards_owned: u.boards_owned,
    boards_member: u.boards_member,
    cards: u.cards_in_owned_boards,
  })));
});

// Suspend/reactivate a user. Body: { suspended: true|false }. The owner can't
// suspend themselves — would lock the admin panel out.
app.patch('/api/admin/users/:id/suspend', auth.requireOwner, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0)
    return res.status(400).json({ error: 'ID inválido' });
  if (targetId === req.user.id)
    return res.status(400).json({ error: 'Você não pode suspender a si mesmo' });

  const target = db.prepare('SELECT id, email, suspended_at FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  const suspend = req.body?.suspended === true;
  if (suspend) {
    db.prepare('UPDATE users SET suspended_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetId);
    // Kill any open sessions immediately so the user gets bounced on next request.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
  } else {
    db.prepare('UPDATE users SET suspended_at = NULL WHERE id = ?').run(targetId);
  }
  const updated = db.prepare('SELECT id, email, suspended_at FROM users WHERE id = ?').get(targetId);
  res.json({ id: updated.id, email: updated.email, suspended_at: updated.suspended_at });
});

// Hard-delete a user and everything they own. IRREVERSIBLE. Mirrors the
// cleanup in scripts/delete-user.js (invites.created_by + boards.owner_id
// don't cascade automatically, so we clear them by hand).
//
// Defense in depth:
//  - Owner can't delete themselves (would orphan the platform)
//  - Owner can't delete other owners (multi-owner scenario; nuke each other = bad)
//  - Body must include confirm_email matching the target's email (case-insensitive)
//    — protects against accidental clicks even when authenticated
app.delete('/api/admin/users/:id', auth.requireOwner, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0)
    return res.status(400).json({ error: 'ID inválido' });
  if (targetId === req.user.id)
    return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });

  const target = db.prepare('SELECT id, email, name, is_owner FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (target.is_owner)
    return res.status(403).json({ error: 'Não é possível excluir outro owner' });

  const confirm = String(req.body?.confirm_email || '').trim().toLowerCase();
  if (confirm !== target.email.toLowerCase())
    return res.status(400).json({ error: 'O email de confirmação não bate com o do usuário' });

  // Same cleanup as scripts/delete-user.js. Wrapped in a transaction so a
  // partial failure rolls back instead of leaving the DB in a half-deleted state.
  db.transaction(() => {
    db.prepare('DELETE FROM invites WHERE created_by = ?').run(target.id);
    db.prepare('DELETE FROM boards WHERE owner_id = ?').run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    // sessions, board_members, workspaces, activity_log, board_user_order
    // cascade automatically from users.
  })();

  res.json({ id: target.id, email: target.email, deleted: true });
});

// Curated list of short, easy-to-type Portuguese words for generating temporary
// passwords. Pattern: word-word-NN (two random words + 2 digits). Designed to
// be dictate-able over WhatsApp without confusion ("aluvial" out, "agua" in).
const RESET_PW_WORDS = [
  'azul','rosa','luz','agua','fogo','sol','lua','mar','rio','vento',
  'casa','flor','folha','ouro','prata','verde','rubi','jade','manga','uva',
  'mel','sal','chuva','neve','onda','pedra','nuvem','gelo','areia','palha',
];
function generateMemorablePassword() {
  const a = RESET_PW_WORDS[Math.floor(Math.random() * RESET_PW_WORDS.length)];
  const b = RESET_PW_WORDS[Math.floor(Math.random() * RESET_PW_WORDS.length)];
  const n = 10 + Math.floor(Math.random() * 90); // 10..99, no leading-zero ambiguity
  return `${a}-${b}-${n}`;
}

// Owner resets a user's password to a memorable temporary value. Returns the
// plaintext ONCE so the owner can copy + relay via WhatsApp; never stored
// plaintext anywhere else. Invalidates the target's existing sessions so they
// get bounced on next request and must log in with the new password.
app.post('/api/admin/users/:id/reset-password', auth.requireOwner, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0)
    return res.status(400).json({ error: 'ID inválido' });
  if (targetId === req.user.id)
    return res.status(400).json({ error: 'Para trocar sua própria senha use Configurações' });

  const target = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  const newPassword = generateMemorablePassword();
  const hash = auth.hashPassword(newPassword);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, targetId);
    // Force re-login on all devices the target is currently logged in on
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
  })();
  res.json({ email: target.email, name: target.name, password: newPassword });
});

// User changes their own password. Requires the current password to confirm
// identity. Logs out OTHER sessions (other devices) but keeps the current
// session alive so the user doesn't get bounced on the device they're on.
app.post('/api/me/change-password', (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || !current_password)
    return res.status(400).json({ error: 'Informe a senha atual' });
  if (typeof new_password !== 'string' || new_password.length < 8)
    return res.status(400).json({ error: 'A nova senha precisa ter ao menos 8 caracteres' });
  if (current_password === new_password)
    return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual' });

  const me = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!me) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!auth.verifyPassword(current_password, me.password_hash))
    return res.status(400).json({ error: 'Senha atual incorreta' });

  const currentToken = req.cookies?.mt_session;
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(auth.hashPassword(new_password), me.id);
    // Kill all OTHER sessions; keep the current one so the user stays logged in here
    if (currentToken) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(me.id, currentToken);
    } else {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id);
    }
  })();
  res.json({ ok: true });
});

// Toggle a flag's enabled state and/or its maintenance message. Body fields
// are optional — pass only what you want to change.
app.patch('/api/admin/flags/:key', auth.requireOwner, (req, res) => {
  const key = String(req.params.key || '').slice(0, 64);
  const existing = db.prepare('SELECT * FROM feature_flags WHERE key = ?').get(key);
  if (!existing) return res.status(404).json({ error: 'Flag não encontrada' });

  const enabled = req.body?.enabled === undefined
    ? existing.enabled
    : (req.body.enabled ? 1 : 0);
  const message = typeof req.body?.message === 'string'
    ? req.body.message.slice(0, 500)
    : existing.message;

  db.prepare(`
    UPDATE feature_flags
    SET enabled = ?, message = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
    WHERE key = ?
  `).run(enabled, message, req.user.id, key);

  res.json({ key, enabled: !!enabled, message });
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
  // Per-user ordering: boards the user has dragged sort by their saved position;
  // boards without an entry fall back to created_at DESC (newest first).
  const boards = db.prepare(`
    SELECT DISTINCT b.*, o.position AS user_position FROM boards b
    LEFT JOIN board_members    m ON m.board_id = b.id
    LEFT JOIN board_user_order o ON o.board_id = b.id AND o.user_id = ?
    WHERE b.owner_id = ? OR m.user_id = ?
    ORDER BY CASE WHEN o.position IS NULL THEN 1 ELSE 0 END,
             o.position ASC,
             b.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id);
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

// Persist the user's preferred sidebar order. Body: { boardIds: [3, 1, 2] }.
// Only IDs the user can actually view are kept; unknown IDs are silently dropped.
app.patch('/api/boards/reorder', (req, res) => {
  const { boardIds } = req.body;
  if (!Array.isArray(boardIds))
    return res.status(400).json({ error: 'boardIds deve ser um array' });
  if (boardIds.length > 500)
    return res.status(400).json({ error: 'Lista grande demais' });

  const clean = [];
  const seen = new Set();
  for (const raw of boardIds) {
    const id = parseInt(raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    if (!auth.canView(req.user.id, id)) continue;
    seen.add(id);
    clean.push(id);
  }

  const upsert = db.prepare(`
    INSERT INTO board_user_order (user_id, board_id, position) VALUES (?, ?, ?)
    ON CONFLICT(user_id, board_id) DO UPDATE SET position = excluded.position
  `);
  db.transaction(() => {
    for (let i = 0; i < clean.length; i++) upsert.run(req.user.id, clean[i], i);
  })();

  res.json({ ok: true, count: clean.length });
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
  const { list_id, title, description, priority, due_date, start_date, assignee, category,
          amount_cents, finance_category_id,
          custom_category_label, custom_category_color } = req.body;
  if (!list_id || !title) return res.status(400).json({ error: 'list_id e title obrigatórios' });
  const boardId = auth.boardIdFromList(list_id);
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const p = validPriority(priority);
  const sd = validDate(start_date);
  const dd = validDate(due_date);
  const cat = validCategory(category);
  const customLabel = validCustomCategoryLabel(custom_category_label);
  const customColor = validCustomCategoryColor(custom_category_color);
  if (p === undefined)  return res.status(400).json({ error: 'priority inválida' });
  if (sd === undefined) return res.status(400).json({ error: 'start_date inválida (YYYY-MM-DD)' });
  if (dd === undefined) return res.status(400).json({ error: 'due_date inválida (YYYY-MM-DD)' });
  if (cat === undefined) return res.status(400).json({ error: 'category inválida' });
  if (customLabel === undefined) return res.status(400).json({ error: 'custom_category_label inválido (1-30 chars)' });
  if (customColor === undefined) return res.status(400).json({ error: 'custom_category_color inválida (#RRGGBB)' });
  // Custom label and color must come together, and cannot coexist with whitelist category
  if ((customLabel == null) !== (customColor == null))
    return res.status(400).json({ error: 'custom_category_label e custom_category_color devem vir juntos' });
  if (customLabel != null && cat != null)
    return res.status(400).json({ error: 'category e custom category são mutuamente exclusivos' });
  // Finance-access gate (same rule as PUT). Blocks both setting category to
  // conta-a-pagar AND passing amount/finance_category_id directly.
  const finAccess = userHasFinanceAccess(req.user);
  if (cat === 'conta-a-pagar' && !finAccess)
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });
  if (!finAccess && (amount_cents != null || finance_category_id != null))
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });

  // Validate amount_cents (integer >= 0) and finance_category_id (belongs to user)
  let amt = null;
  if (amount_cents != null && amount_cents !== '') {
    const n = Math.round(Number(amount_cents));
    if (!Number.isInteger(n) || n < 0 || n > 99999999999)
      return res.status(400).json({ error: 'amount_cents inválido' });
    amt = n;
  }
  let fcid = null;
  if (finance_category_id != null && finance_category_id !== '') {
    const cid = parseInt(finance_category_id);
    const owns = db.prepare('SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?').get(cid, req.user.id);
    if (!owns) return res.status(400).json({ error: 'finance_category_id inválido' });
    fcid = cid;
  }

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM cards WHERE list_id = ?')
                   .get(list_id).p;
  const info = db.prepare(`
    INSERT INTO cards (list_id, title, description, priority, due_date, start_date, assignee, category,
                       position, amount_cents, finance_category_id,
                       custom_category_label, custom_category_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(list_id, String(title).slice(0, 200), String(description || '').slice(0, 5000),
         p || 'media', dd, sd, String(assignee || '').slice(0, 100), cat,
         maxPos + 1, amt, fcid, customLabel, customColor);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
  const listTitle = db.prepare('SELECT title FROM lists WHERE id = ?').get(list_id)?.title;
  logBoardActivity(req, 'card.created', boardId, 'card', card.id, { title: card.title, list: listTitle });
  res.status(201).json(card);
});

// Add `monthsAhead` months to a YYYY-MM-DD date, clamping the day to the last
// day of the target month (e.g., Jan 31 + 1 month → Feb 28 or 29).
function shiftMonthsClamp(yyyymmdd, monthsAhead) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + monthsAhead, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const daysInTarget = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, daysInTarget);
  const pad = (n) => String(n).padStart(2, '0');
  return `${ty}-${pad(tm + 1)}-${pad(clampedDay)}`;
}

// Create a monthly recurring series: N cards with the same title/category/etc,
// each with due_date (and start_date, if set) shifted by 1, 2, ..., N-1 months.
// All cards share a `series_id` so we can find related cards later. Runs inside
// a transaction so partial failures don't leave orphans.
app.post('/api/cards/recurring', (req, res) => {
  if (!userHasRecurringAccess(req.user))
    return res.status(403).json({ error: 'Sem acesso a cards recorrentes' });

  const { list_id, title, description, priority, due_date, start_date, assignee, category,
          amount_cents, finance_category_id,
          custom_category_label, custom_category_color,
          recurrence_months } = req.body;

  if (!list_id || !title) return res.status(400).json({ error: 'list_id e title obrigatórios' });
  if (!due_date)          return res.status(400).json({ error: 'due_date obrigatório (define o dia do mês)' });
  const boardId = auth.boardIdFromList(list_id);
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const months = parseInt(recurrence_months);
  if (!Number.isInteger(months) || months < 2 || months > 12)
    return res.status(400).json({ error: 'recurrence_months inválido (2 a 12)' });

  const p = validPriority(priority);
  const sd = validDate(start_date);
  const dd = validDate(due_date);
  const cat = validCategory(category);
  const customLabel = validCustomCategoryLabel(custom_category_label);
  const customColor = validCustomCategoryColor(custom_category_color);
  if (p === undefined)  return res.status(400).json({ error: 'priority inválida' });
  if (sd === undefined) return res.status(400).json({ error: 'start_date inválida' });
  if (dd === undefined || dd === null) return res.status(400).json({ error: 'due_date inválida' });
  if (cat === undefined) return res.status(400).json({ error: 'category inválida' });
  if (customLabel === undefined) return res.status(400).json({ error: 'custom_category_label inválido' });
  if (customColor === undefined) return res.status(400).json({ error: 'custom_category_color inválida' });
  if ((customLabel == null) !== (customColor == null))
    return res.status(400).json({ error: 'custom label e color devem vir juntos' });
  if (customLabel != null && cat != null)
    return res.status(400).json({ error: 'category e custom category são mutuamente exclusivos' });

  // Finance-access gate same as POST /api/cards
  const finAccess = userHasFinanceAccess(req.user);
  if (cat === 'conta-a-pagar' && !finAccess)
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });
  if (!finAccess && (amount_cents != null || finance_category_id != null))
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });

  let amt = null;
  if (amount_cents != null && amount_cents !== '') {
    const n = Math.round(Number(amount_cents));
    if (!Number.isInteger(n) || n < 0 || n > 99999999999)
      return res.status(400).json({ error: 'amount_cents inválido' });
    amt = n;
  }
  let fcid = null;
  if (finance_category_id != null && finance_category_id !== '') {
    const cid = parseInt(finance_category_id);
    const owns = db.prepare('SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?').get(cid, req.user.id);
    if (!owns) return res.status(400).json({ error: 'finance_category_id inválido' });
    fcid = cid;
  }

  const safeTitle = String(title).slice(0, 200);
  const safeDesc  = String(description || '').slice(0, 5000);
  const safeAssg  = String(assignee || '').slice(0, 100);
  const finalPriority = p || 'media';

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM cards WHERE list_id = ?')
                   .get(list_id).p;

  const insert = db.prepare(`
    INSERT INTO cards (list_id, title, description, priority, due_date, start_date, assignee, category,
                       position, amount_cents, finance_category_id,
                       custom_category_label, custom_category_color, series_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Two-pass: insert first card to get an id, use that id as series_id, then
  // update + insert the rest. Avoids needing a separate "series" table.
  const created = db.transaction((seriesAnchorDate, seriesAnchorStart) => {
    const ids = [];
    for (let i = 0; i < months; i++) {
      const shiftedDue   = shiftMonthsClamp(seriesAnchorDate, i);
      const shiftedStart = seriesAnchorStart ? shiftMonthsClamp(seriesAnchorStart, i) : null;
      // series_id placeholder NULL on first insert — we patch it after we know the first id
      const info = insert.run(list_id, safeTitle, safeDesc, finalPriority,
                              shiftedDue, shiftedStart, safeAssg, cat,
                              maxPos + 1 + i, amt, fcid,
                              customLabel, customColor, null);
      ids.push(info.lastInsertRowid);
    }
    // First inserted id becomes the series_id (acts as anchor)
    const sid = ids[0];
    db.prepare(`UPDATE cards SET series_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
      .run(sid, ...ids);
    return ids;
  })(dd, sd);

  const listTitle = db.prepare('SELECT title FROM lists WHERE id = ?').get(list_id)?.title;
  logBoardActivity(req, 'card.created', boardId, 'card', created[0],
    { title: safeTitle, list: listTitle, series_count: months });

  const cards = db.prepare(`SELECT * FROM cards WHERE id IN (${created.map(() => '?').join(',')}) ORDER BY due_date`)
                  .all(...created);
  res.status(201).json({ series_id: created[0], count: created.length, cards });
});

app.put('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const boardId = auth.boardIdFromCard(id);
  if (!boardId) return res.status(404).json({ error: 'Card não encontrado' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });
  const { title, description, priority, due_date, start_date, assignee, list_id, position, category,
          amount_cents, finance_category_id,
          custom_category_label, custom_category_color } = req.body;

  const p = validPriority(priority);
  const sd = validDate(start_date);
  const dd = validDate(due_date);
  const cat = validCategory(category);
  const customLabel = validCustomCategoryLabel(custom_category_label);
  const customColor = validCustomCategoryColor(custom_category_color);
  if (p === undefined)  return res.status(400).json({ error: 'priority inválida' });
  if (sd === undefined) return res.status(400).json({ error: 'start_date inválida (YYYY-MM-DD)' });
  if (dd === undefined) return res.status(400).json({ error: 'due_date inválida (YYYY-MM-DD)' });
  if (cat === undefined) return res.status(400).json({ error: 'category inválida' });
  if (customLabel === undefined) return res.status(400).json({ error: 'custom_category_label inválido (1-30 chars)' });
  if (customColor === undefined) return res.status(400).json({ error: 'custom_category_color inválida (#RRGGBB)' });
  if ((customLabel == null) !== (customColor == null))
    return res.status(400).json({ error: 'custom_category_label e custom_category_color devem vir juntos' });
  if (customLabel != null && cat != null)
    return res.status(400).json({ error: 'category e custom category são mutuamente exclusivos' });
  // Same finance-access gate as POST /api/cards. Also blocks anyone without
  // access from passing amount_cents or finance_category_id (silent no-op
  // would leave them confused; explicit 403 is honest).
  const finAccess = userHasFinanceAccess(req.user);
  if (cat === 'conta-a-pagar' && !finAccess)
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });
  if (!finAccess && (amount_cents !== undefined || finance_category_id !== undefined))
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });

  // amount_cents (only meaningful for category='conta-a-pagar', but accepted
  // generically — UI hides the field for other categories). null clears it.
  let amt = null;
  if (amount_cents !== undefined) {
    if (amount_cents === null || amount_cents === '') amt = null;
    else {
      const n = Math.round(Number(amount_cents));
      if (!Number.isInteger(n) || n < 0 || n > 99999999999) return res.status(400).json({ error: 'amount_cents inválido' });
      amt = n;
    }
  }
  // finance_category_id: validate it belongs to the requesting user (anti-IDOR)
  let fcid = undefined; // undefined = don't change
  if (finance_category_id !== undefined) {
    if (finance_category_id === null || finance_category_id === '') fcid = null;
    else {
      const cid = parseInt(finance_category_id);
      const owns = db.prepare('SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?').get(cid, req.user.id);
      if (!owns) return res.status(400).json({ error: 'finance_category_id inválido' });
      fcid = cid;
    }
  }

  // If user is moving the card to another list, the target list must be on a board they can edit
  if (list_id != null) {
    const targetBoard = auth.boardIdFromList(list_id);
    if (!targetBoard || !auth.canEdit(req.user.id, targetBoard))
      return res.status(403).json({ error: 'Sem permissão na lista de destino' });
  }

  const before = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  db.prepare(`
    UPDATE cards SET
      title                 = COALESCE(?, title),
      description           = COALESCE(?, description),
      priority              = COALESCE(?, priority),
      due_date              = ?,
      start_date            = ?,
      assignee              = COALESCE(?, assignee),
      list_id               = COALESCE(?, list_id),
      position              = COALESCE(?, position),
      category              = ?,
      amount_cents          = COALESCE(?, amount_cents),
      finance_category_id   = COALESCE(?, finance_category_id),
      custom_category_label = ?,
      custom_category_color = ?
    WHERE id = ?
  `).run(
    title       != null ? String(title).slice(0, 200) : null,
    description != null ? String(description).slice(0, 5000) : null,
    p,
    dd, sd,
    assignee    != null ? String(assignee).slice(0, 100) : null,
    list_id, position, cat,
    amount_cents !== undefined ? amt : null,  // explicit null clears via COALESCE-only-on-undefined; for clearing, we'd need a different SQL
    fcid !== undefined ? fcid : null,
    customLabel, customColor,
    id
  );
  // COALESCE quirk: passing `null` keeps the existing value. To EXPLICITLY clear
  // amount_cents/finance_category_id (user passed null in body), we follow up:
  if (amount_cents === null || amount_cents === '') {
    db.prepare('UPDATE cards SET amount_cents = NULL WHERE id = ?').run(id);
  }
  if (finance_category_id === null || finance_category_id === '') {
    db.prepare('UPDATE cards SET finance_category_id = NULL WHERE id = ?').run(id);
  }
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

// "Marcar como pago" — bridge between Kanban and Finanças. Card must:
//   - have category 'conta-a-pagar' (so the action only fires where it makes sense)
//   - have amount_cents > 0 (the amount to record)
//   - not be already paid (paid_at IS NULL)
// Creates a finance transaction (type=expense, amount=card.amount_cents,
// category=card.finance_category_id, date=card.due_date or today,
// source_card_id=card.id) and stamps cards.paid_at. The card stays where
// it is — the user can move it to "Concluído" themselves if they want.
app.post('/api/cards/:id/mark-paid', (req, res) => {
  // Finance-access gate: non-owners without the 'financial' flag can't
  // create transactions through the kanban side door.
  if (!userHasFinanceAccess(req.user))
    return res.status(403).json({ error: 'Sem acesso ao módulo financeiro' });
  const id = parseInt(req.params.id);
  const boardId = auth.boardIdFromCard(id);
  if (!boardId) return res.status(404).json({ error: 'Card não encontrado' });
  if (!auth.canEdit(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!card) return res.status(404).json({ error: 'Card não encontrado' });
  if (card.category !== 'conta-a-pagar')
    return res.status(400).json({ error: 'Card não é uma conta a pagar' });
  if (!card.amount_cents || card.amount_cents <= 0)
    return res.status(400).json({ error: 'Defina o valor antes de marcar como pago' });
  if (card.paid_at)
    return res.status(409).json({ error: 'Esta conta já foi marcada como paga' });

  // If finance_category_id is set, validate it still belongs to the user (could have been deleted)
  let categoryIdToUse = null;
  if (card.finance_category_id) {
    const owns = db.prepare('SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?')
                   .get(card.finance_category_id, req.user.id);
    if (owns) categoryIdToUse = card.finance_category_id;
  }
  // Use due_date if set; otherwise today (UTC date — keeps it deterministic)
  const txDate = card.due_date || new Date().toISOString().slice(0, 10);

  const result = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO finance_transactions
        (user_id, category_id, type, amount_cents, description, transaction_date, source_card_id)
      VALUES (?, ?, 'expense', ?, ?, ?, ?)
    `).run(req.user.id, categoryIdToUse, card.amount_cents, card.title, txDate, card.id);
    db.prepare('UPDATE cards SET paid_at = CURRENT_TIMESTAMP WHERE id = ?').run(card.id);
    return info.lastInsertRowid;
  })();

  logBoardActivity(req, 'card.paid', boardId, 'card', card.id,
    { title: card.title, amount_cents: card.amount_cents });
  res.json({ transaction_id: result, paid_at: new Date().toISOString(), amount_cents: card.amount_cents });
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

// Sanitize and dedupe a list of email strings. Returns lowercased, trimmed,
// validated, deduped list. Throws if any single email is malformed so the
// server can return a precise error.
function normalizeEmailList(input, max = 20) {
  if (!Array.isArray(input)) throw { code: 400, msg: 'emails deve ser uma lista' };
  if (input.length === 0)    throw { code: 400, msg: 'Adicione ao menos um email' };
  if (input.length > max)    throw { code: 400, msg: `Máximo ${max} emails por convite` };
  const seen = new Set();
  const clean = [];
  for (const raw of input) {
    if (typeof raw !== 'string') throw { code: 400, msg: 'Email inválido na lista' };
    const e = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(e))   throw { code: 400, msg: `Email inválido: ${raw}` };
    if (e.length > 200)      throw { code: 400, msg: 'Email muito longo' };
    if (seen.has(e)) continue;
    seen.add(e);
    clean.push(e);
  }
  return clean;
}

app.post('/api/boards/:id/invites', (req, res) => {
  const primaryBoardId = parseInt(req.params.id);
  if (!auth.canManage(req.user.id, primaryBoardId))
    return res.status(403).json({ error: 'Sem permissão neste quadro' });
  const role = ['admin', 'membro'].includes(req.body.role) ? req.body.role : 'membro';

  // New flow: emails array required. Each email is whitelisted for this invite.
  let emails;
  try { emails = normalizeEmailList(req.body.emails); }
  catch (e) { return res.status(e.code || 400).json({ error: e.msg || 'Erro' }); }

  // Multi-board: optional list of additional boards this invite also covers.
  // Validate each id is a manageable board for this user (no IDOR), dedupe,
  // drop the primary if it accidentally appears, cap at 10 extras (11 total
  // including the primary) so a typo doesn't generate a sprawling invite.
  let extraBoards = [];
  if (req.body.extra_boards != null) {
    if (!Array.isArray(req.body.extra_boards))
      return res.status(400).json({ error: 'extra_boards deve ser uma lista' });
    if (req.body.extra_boards.length > 10)
      return res.status(400).json({ error: 'Máximo 10 quadros adicionais por convite' });
    const seen = new Set([primaryBoardId]);
    for (const raw of req.body.extra_boards) {
      const bid = parseInt(raw);
      if (!Number.isInteger(bid) || bid <= 0 || seen.has(bid)) continue;
      if (!auth.canManage(req.user.id, bid))
        return res.status(403).json({ error: 'Sem permissão em algum dos quadros selecionados' });
      seen.add(bid);
      extraBoards.push(bid);
    }
  }
  const allBoardIds = [primaryBoardId, ...extraBoards];

  // Reject if any of the invited emails belongs to the owner of ANY of the
  // covered boards (they're already in by definition).
  const ownerEmails = new Set(
    db.prepare(`
      SELECT u.email FROM users u JOIN boards b ON b.owner_id = u.id
      WHERE b.id IN (${allBoardIds.map(() => '?').join(',')})
    `).all(...allBoardIds).map((r) => r.email?.toLowerCase()).filter(Boolean)
  );
  for (const e of emails) {
    if (ownerEmails.has(e)) {
      return res.status(400).json({ error: `${e} já é dono de um dos quadros` });
    }
  }

  const token = auth.newToken();
  const result = db.transaction(() => {
    const info = db.prepare('INSERT INTO invites (board_id, token, role, created_by) VALUES (?, ?, ?, ?)')
                   .run(primaryBoardId, token, role, req.user.id);
    const inviteId = info.lastInsertRowid;
    const insertEmail = db.prepare('INSERT INTO invite_allowed_emails (invite_id, email) VALUES (?, ?)');
    for (const e of emails) insertEmail.run(inviteId, e);
    const insertBoard = db.prepare('INSERT INTO invite_boards (invite_id, board_id) VALUES (?, ?)');
    for (const bid of extraBoards) insertBoard.run(inviteId, bid);
    return inviteId;
  })();

  res.status(201).json({ id: result, token, role, emails, board_ids: allBoardIds });
});

// List pending invites for a board, with the per-email status (entered / pending).
// Includes invites where this board is either the primary OR an extra. Used by
// the Members modal's "Convites pendentes" section.
app.get('/api/boards/:id/invites', (req, res) => {
  const boardId = parseInt(req.params.id);
  if (!auth.canManage(req.user.id, boardId))
    return res.status(403).json({ error: 'Sem permissão' });

  const invites = db.prepare(`
    SELECT id, token, role, created_at, used_at, created_by, board_id AS primary_board_id
    FROM invites
    WHERE board_id = ?
       OR id IN (SELECT invite_id FROM invite_boards WHERE board_id = ?)
    ORDER BY created_at DESC
  `).all(boardId, boardId);

  const emailStmt = db.prepare(`
    SELECT a.email, a.used_at, u.name AS user_name
    FROM invite_allowed_emails a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.invite_id = ?
    ORDER BY a.email
  `);
  const boardsStmt = db.prepare(`
    SELECT b.id, b.title FROM (
      SELECT ? AS id
      UNION
      SELECT board_id FROM invite_boards WHERE invite_id = ?
    ) AS x JOIN boards b ON b.id = x.id
    ORDER BY b.id
  `);

  const out = invites.map((inv) => {
    const emails = emailStmt.all(inv.id);
    const boards = boardsStmt.all(inv.primary_board_id, inv.id);
    return {
      id: inv.id,
      token: inv.token,
      role: inv.role,
      created_at: inv.created_at,
      // Legacy (no whitelist rows): expose the old used_at + flag so the UI
      // can render "single-use, used by ?" instead of a list of emails.
      legacy: emails.length === 0,
      used_at: inv.used_at,
      emails,                       // [{email, used_at, user_name}]
      boards,                       // [{id, title}] — every board this invite covers
      primary_board_id: inv.primary_board_id,
    };
  });
  res.json(out);
});

app.delete('/api/invites/:id', (req, res) => {
  const inviteId = parseInt(req.params.id);
  const inv = db.prepare('SELECT board_id FROM invites WHERE id = ?').get(inviteId);
  if (!inv) return res.status(404).json({ error: 'Convite não encontrado' });
  if (!auth.canManage(req.user.id, inv.board_id))
    return res.status(403).json({ error: 'Sem permissão' });
  db.prepare('DELETE FROM invites WHERE id = ?').run(inviteId);
  // CASCADE in the schema cleans up invite_allowed_emails automatically.
  res.status(204).end();
});

app.post('/api/invites/:token/accept', (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Convite inválido' });

  // Build the full list of boards this invite covers: the primary (invites.board_id)
  // plus any extras in invite_boards. For legacy single-board invites the extras
  // table is empty so this collapses to just [board_id].
  const extraIds = db.prepare('SELECT board_id FROM invite_boards WHERE invite_id = ?')
                     .all(inv.id).map((r) => r.board_id);
  const allBoardIds = [inv.board_id, ...extraIds];

  // Owner-of-all-boards short-circuit: if the user already owns every board the
  // invite covers, accepting is a no-op (and the legacy "you're owner" message
  // is still accurate). For mixed cases, we'll just skip boards they own below.
  const ownedBoards = new Set(
    db.prepare(`SELECT id FROM boards WHERE owner_id = ? AND id IN (${allBoardIds.map(()=>'?').join(',')})`)
      .all(req.user.id, ...allBoardIds).map((r) => r.id)
  );
  if (ownedBoards.size === allBoardIds.length) {
    return res.status(400).json({ error: 'Você já é o dono dos quadros deste convite' });
  }

  const allowed = db.prepare('SELECT email, used_at FROM invite_allowed_emails WHERE invite_id = ?').all(inv.id);
  const isLegacy = allowed.length === 0;

  if (isLegacy) {
    if (inv.used_at) return res.status(410).json({ error: 'Convite já utilizado' });
  } else {
    const userEmail = (req.user.email || '').toLowerCase();
    const slot = allowed.find((a) => a.email === userEmail);
    if (!slot) return res.status(403).json({ error: 'Você não foi convidado para este quadro' });
    if (slot.used_at) return res.status(410).json({ error: 'Você já entrou neste quadro' });
  }

  // Add the user as a member of every covered board (skip ones they already own).
  const findExisting = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?');
  const updateExisting = db.prepare('UPDATE board_members SET role = ? WHERE id = ?');
  const insertNew = db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const bid of allBoardIds) {
      if (ownedBoards.has(bid)) continue;
      const existing = findExisting.get(bid, req.user.id);
      if (existing) updateExisting.run(inv.role, existing.id);
      else          insertNew.run(bid, req.user.id, inv.role);
    }
    if (isLegacy) {
      db.prepare('UPDATE invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(inv.id);
    } else {
      db.prepare(`UPDATE invite_allowed_emails
                  SET used_at = CURRENT_TIMESTAMP, user_id = ?
                  WHERE invite_id = ? AND email = ?`)
        .run(req.user.id, inv.id, req.user.email.toLowerCase());
    }
  })();

  // Log per board so the activity feed of each one shows the new member
  for (const bid of allBoardIds) {
    if (ownedBoards.has(bid)) continue;
    logBoardActivity(req, 'member.added', bid, 'member', req.user.id,
      { name: req.user.name, role: inv.role });
  }
  // Frontend redirects to the first non-owned board (usually the primary)
  const landingBoardId = allBoardIds.find((bid) => !ownedBoards.has(bid)) || inv.board_id;
  res.json({ board_id: landingBoardId, role: inv.role, board_ids: allBoardIds });
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

// "Hoje" view — cards from ALL boards the user owns/can-view that touch the
// window [today, today+7]. A card "touches" the window if any of its dates fall
// inside it, OR if its [start, due] range overlaps it. Client buckets them as
// "Hoje" (anything covering today) vs "Próximos 7 dias" (the rest).
app.get('/api/today', (req, res) => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayKey = fmt(today);
  const end = new Date(today); end.setDate(end.getDate() + 7);
  const endKey = fmt(end);

  const cards = db.prepare(`
    SELECT
      c.id, c.list_id, c.title, c.description, c.priority,
      c.due_date, c.start_date, c.assignee, c.category, c.position,
      c.amount_cents, c.finance_category_id, c.paid_at,
      c.custom_category_label, c.custom_category_color,
      l.title AS list_title, l.board_id,
      b.title AS board_title, b.color AS board_color
    FROM cards c
    JOIN lists l  ON l.id = c.list_id
    JOIN boards b ON b.id = l.board_id
    LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
    WHERE (b.owner_id = ? OR m.user_id IS NOT NULL)
      AND (
        -- Range card overlapping the window
        (c.start_date IS NOT NULL AND c.due_date IS NOT NULL
         AND c.start_date <= ? AND c.due_date >= ?)
        OR
        -- Single-date by due_date in window
        (c.due_date IS NOT NULL AND c.due_date >= ? AND c.due_date <= ?)
        OR
        -- Single-date by start_date in window (card with only start_date)
        (c.start_date IS NOT NULL AND c.due_date IS NULL
         AND c.start_date >= ? AND c.start_date <= ?)
      )
    ORDER BY COALESCE(c.due_date, c.start_date), c.position
  `).all(req.user.id, req.user.id,
         endKey, todayKey,        // range overlap
         todayKey, endKey,        // due_date in window
         todayKey, endKey);       // start_date in window (no due)

  // Enrich each card with checklist items so the LISTA preview works the same
  // here as on the board view.
  const checklistStmt = db.prepare('SELECT * FROM checklist_items WHERE card_id = ? ORDER BY position, id');
  for (const c of cards) c.checklist_items = checklistStmt.all(c.id);

  res.json({ today: todayKey, end: endKey, cards });
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

// =================================================================
// FINANCE — personal finance module (Iteration 8.2 / PR2)
// All routes here require auth (already enforced by app.use('/api', requireAuth))
// PLUS the 'financial' feature flag must be enabled. RBAC is per-user — every
// query is scoped to req.user.id, never accepts user_id from the body/params.
// =================================================================

// Returns true when the user can interact with the finance module — owner
// always; non-owners only when the 'financial' flag is on. Reused by both
// the /api/finance/* middleware AND the card → finance bridge endpoints
// (PUT /api/cards, POST /mark-paid) so non-owners can't create transactions
// silently via the kanban side door when the module is hidden from them.
function userHasFinanceAccess(user) {
  if (!user) return false;
  if (user.is_owner) return true;
  const f = db.prepare("SELECT enabled FROM feature_flags WHERE key = 'financial'").get();
  return !!(f && f.enabled);
}

// Same owner-gate pattern: owner always; non-owners only when 'recurring_cards' is on.
function userHasRecurringAccess(user) {
  if (!user) return false;
  if (user.is_owner) return true;
  const f = db.prepare("SELECT enabled FROM feature_flags WHERE key = 'recurring_cards'").get();
  return !!(f && f.enabled);
}

// Gate all /api/finance/* behind the feature flag. Returns 503 with the
// (optional) maintenance message from the flag — same UX as any other flag.
function requireFinancialFlag(req, res, next) {
  if (req.user?.is_owner) return next();
  const f = db.prepare("SELECT enabled, message FROM feature_flags WHERE key = 'financial'").get();
  if (!f || !f.enabled) {
    return res.status(503).json({
      error: f?.message || 'Módulo financeiro temporariamente indisponível',
    });
  }
  next();
}

// Validators (kept inline — small, no need for a class)
const FINANCE_KIND = new Set(['income', 'expense']);
function parseAmountCents(v) {
  const n = Math.round(Number(v));
  if (!Number.isInteger(n) || n < 0 || n > 99999999999) return null; // cap ~R$ 999M
  return n;
}
function parseDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  // Accept ISO dates only — no Date parsing magic, avoids timezone surprises
  return v;
}

// ---- CATEGORIES ----
app.get('/api/finance/categories', requireFinancialFlag, (req, res) => {
  // Lazy seed — first time the user opens Finanças, populate the 11 defaults.
  db.ensureDefaultCategories(req.user.id);
  const rows = db.prepare(`
    SELECT id, name, kind, icon, position, archived
    FROM finance_categories
    WHERE user_id = ?
    ORDER BY archived ASC, kind DESC, position ASC, id ASC
  `).all(req.user.id);
  res.json(rows.map(r => ({ ...r, archived: !!r.archived })));
});

app.post('/api/finance/categories', requireFinancialFlag, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 50);
  const kind = req.body?.kind;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  if (!FINANCE_KIND.has(kind)) return res.status(400).json({ error: 'Tipo deve ser income ou expense' });
  const icon = String(req.body?.icon || '').slice(0, 8);
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM finance_categories WHERE user_id = ? AND kind = ?')
                   .get(req.user.id, kind).m;
  const info = db.prepare(
    'INSERT INTO finance_categories (user_id, name, kind, icon, position) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, name, kind, icon, maxPos + 1);
  res.status(201).json({ id: info.lastInsertRowid, name, kind, icon, position: maxPos + 1, archived: false });
});

app.patch('/api/finance/categories/:id', requireFinancialFlag, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM finance_categories WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 50) : existing.name;
  if (!name) return res.status(400).json({ error: 'Nome não pode ficar vazio' });
  const icon = req.body?.icon !== undefined ? String(req.body.icon).slice(0, 8) : existing.icon;
  const position = req.body?.position !== undefined ? parseInt(req.body.position) : existing.position;
  const archived = req.body?.archived !== undefined ? (req.body.archived ? 1 : 0) : existing.archived;
  db.prepare('UPDATE finance_categories SET name = ?, icon = ?, position = ?, archived = ? WHERE id = ?')
    .run(name, icon, position, archived, id);
  res.json({ id, name, kind: existing.kind, icon, position, archived: !!archived });
});

app.delete('/api/finance/categories/:id', requireFinancialFlag, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT id FROM finance_categories WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });
  // ON DELETE SET NULL on transactions — past transactions stay, just lose the category.
  db.prepare('DELETE FROM finance_categories WHERE id = ?').run(id);
  res.status(204).end();
});

// ---- TRANSACTIONS ----
// Filters: from=YYYY-MM-DD, to=YYYY-MM-DD, type=income|expense, category=ID, limit=N (max 500)
app.get('/api/finance/transactions', requireFinancialFlag, (req, res) => {
  // All filters reference the transactions table (t.*) — using bare column
  // names would be ambiguous against the LEFT JOIN with finance_categories.
  const where = ['t.user_id = ?'];
  const args = [req.user.id];
  const from = parseDate(req.query.from || '');
  const to   = parseDate(req.query.to   || '');
  if (from) { where.push('t.transaction_date >= ?'); args.push(from); }
  if (to)   { where.push('t.transaction_date <= ?'); args.push(to); }
  if (FINANCE_KIND.has(req.query.type)) { where.push('t.type = ?'); args.push(req.query.type); }
  if (req.query.category) {
    const cid = parseInt(req.query.category);
    if (Number.isInteger(cid)) { where.push('t.category_id = ?'); args.push(cid); }
  }
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  const rows = db.prepare(`
    SELECT t.id, t.category_id, t.type, t.amount_cents, t.description,
           t.transaction_date, t.source_card_id, t.created_at,
           c.name AS category_name, c.icon AS category_icon
    FROM finance_transactions t
    LEFT JOIN finance_categories c ON c.id = t.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.transaction_date DESC, t.id DESC
    LIMIT ?
  `).all(...args, limit);
  res.json(rows);
});

app.post('/api/finance/transactions', requireFinancialFlag, (req, res) => {
  const type = req.body?.type;
  if (!FINANCE_KIND.has(type)) return res.status(400).json({ error: 'Tipo deve ser income ou expense' });
  const amount = parseAmountCents(req.body?.amount_cents);
  if (amount === null) return res.status(400).json({ error: 'Valor inválido (deve ser inteiro em centavos, >= 0)' });
  const date = parseDate(req.body?.transaction_date);
  if (!date) return res.status(400).json({ error: 'Data inválida (use YYYY-MM-DD)' });
  const description = String(req.body?.description || '').slice(0, 500);
  // Validate category belongs to the user (anti-IDOR — never trust category_id blindly)
  let categoryId = null;
  if (req.body?.category_id != null) {
    const cid = parseInt(req.body.category_id);
    const cat = db.prepare('SELECT id FROM finance_categories WHERE id = ? AND user_id = ?').get(cid, req.user.id);
    if (!cat) return res.status(400).json({ error: 'Categoria inválida' });
    categoryId = cid;
  }
  const info = db.prepare(`
    INSERT INTO finance_transactions
      (user_id, category_id, type, amount_cents, description, transaction_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, categoryId, type, amount, description, date);
  res.status(201).json({
    id: info.lastInsertRowid,
    category_id: categoryId, type, amount_cents: amount, description,
    transaction_date: date, source_card_id: null,
  });
});

app.patch('/api/finance/transactions/:id', requireFinancialFlag, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM finance_transactions WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Transação não encontrada' });
  const type = req.body?.type !== undefined
    ? (FINANCE_KIND.has(req.body.type) ? req.body.type : null)
    : existing.type;
  if (!type) return res.status(400).json({ error: 'Tipo inválido' });
  const amount = req.body?.amount_cents !== undefined
    ? parseAmountCents(req.body.amount_cents)
    : existing.amount_cents;
  if (amount === null) return res.status(400).json({ error: 'Valor inválido' });
  const date = req.body?.transaction_date !== undefined
    ? parseDate(req.body.transaction_date)
    : existing.transaction_date;
  if (!date) return res.status(400).json({ error: 'Data inválida' });
  const description = req.body?.description !== undefined
    ? String(req.body.description).slice(0, 500)
    : existing.description;
  let categoryId = existing.category_id;
  if (req.body?.category_id !== undefined) {
    if (req.body.category_id === null) {
      categoryId = null;
    } else {
      const cid = parseInt(req.body.category_id);
      const cat = db.prepare('SELECT id FROM finance_categories WHERE id = ? AND user_id = ?').get(cid, req.user.id);
      if (!cat) return res.status(400).json({ error: 'Categoria inválida' });
      categoryId = cid;
    }
  }
  db.prepare(`
    UPDATE finance_transactions
    SET category_id = ?, type = ?, amount_cents = ?, description = ?, transaction_date = ?
    WHERE id = ?
  `).run(categoryId, type, amount, description, date, id);
  res.json({ id, category_id: categoryId, type, amount_cents: amount, description, transaction_date: date });
});

// ---- DASHBOARD ----
// Aggregated summary for one month: totals (current + previous for the delta)
// + top 5 expense categories. Cheap enough to compute on demand — SQLite
// indexes by (user_id, transaction_date DESC) make these queries instant.
app.get('/api/finance/summary', requireFinancialFlag, (req, res) => {
  const ym = String(req.query.month || '').match(/^(\d{4})-(\d{2})$/);
  if (!ym) return res.status(400).json({ error: 'Mês inválido (use YYYY-MM)' });
  const [, y, m] = ym;
  const monthY = parseInt(y), monthM = parseInt(m);
  // Range helpers — last day computed via Date(year, month, 0).getDate()
  const fromCur = `${y}-${m}-01`;
  const toCur   = `${y}-${m}-${String(new Date(monthY, monthM, 0).getDate()).padStart(2, '0')}`;
  const prev    = new Date(monthY, monthM - 2, 1); // -2 because Date months are 0-indexed
  const prevY = prev.getFullYear(), prevM = prev.getMonth() + 1;
  const fromPrev = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
  const toPrev   = `${prevY}-${String(prevM).padStart(2, '0')}-${String(new Date(prevY, prevM, 0).getDate()).padStart(2, '0')}`;

  // Sum income/expense for a date range (1 query, GROUP BY type)
  const totalsStmt = db.prepare(`
    SELECT type, COALESCE(SUM(amount_cents), 0) AS total
    FROM finance_transactions
    WHERE user_id = ? AND transaction_date BETWEEN ? AND ?
    GROUP BY type
  `);
  const totalsFor = (from, to) => {
    const rows = totalsStmt.all(req.user.id, from, to);
    let income = 0, expense = 0;
    for (const r of rows) {
      if (r.type === 'income')  income  = r.total;
      if (r.type === 'expense') expense = r.total;
    }
    return { income_cents: income, expense_cents: expense, balance_cents: income - expense };
  };

  // Top 5 expense categories this month (excludes "sem categoria" — those
  // show up in the transaction list anyway and would dominate sometimes)
  const topCategories = db.prepare(`
    SELECT c.id, c.name, c.icon, c.kind, SUM(t.amount_cents) AS total
    FROM finance_transactions t
    JOIN finance_categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND t.transaction_date BETWEEN ? AND ? AND t.type = 'expense'
    GROUP BY c.id, c.name, c.icon, c.kind
    ORDER BY total DESC
    LIMIT 5
  `).all(req.user.id, fromCur, toCur);

  res.json({
    month: `${y}-${m}`,
    current: totalsFor(fromCur, toCur),
    previous: totalsFor(fromPrev, toPrev),
    top_expense_categories: topCategories,
  });
});

app.delete('/api/finance/transactions/:id', requireFinancialFlag, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT id FROM finance_transactions WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Transação não encontrada' });
  db.prepare('DELETE FROM finance_transactions WHERE id = ?').run(id);
  res.status(204).end();
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
