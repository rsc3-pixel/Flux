// ============ STATE ============
const SETTINGS_KEY = 'mt_settings';
const DEFAULT_SETTINGS = {
  theme: 'system',          // 'light' | 'dark' | 'system'
  primaryColor: '#0052CC',
  compact: false,
  showIds: false,
  contrast: 'normal',       // 'normal' | 'high'
};

const state = {
  user: null,                         // { id, email, name } when logged in
  workspace: null,                    // { id, name, plan, board_count }
  pendingInviteToken: null,           // captured from ?invite=... in URL
  boards: [],
  currentBoardId: null,
  currentBoard: null,                 // also includes .role for current user
  view: 'kanban',                     // 'kanban' | 'table' | 'cards' | 'calendar' | 'gantt' | 'dashboard' | 'settings' | 'activity' | 'analytics'
  lastBoardView: 'kanban',            // last per-board view (so workspace views know where to return)
  searchTerm: '',
  visibleCols: { priority: true, assignee: true, due_date: true, description: false },
  filters: { category: '', priority: '', assignee: '', due: '' },
  boardMembers: [],                   // populated when board loads
  collapsedGroups: new Set(),
  calendarDate: new Date(),           // first day of currently shown month
  wizardStep: 1,
  wizardData: {},
  settings: loadSettings(),
};

// ============ ICONS (Lucide line icons, MIT licensed) ============
// Inner content of each Lucide SVG. Wrapped by svgIcon() with the standard
// 24x24 viewBox + currentColor stroke so colors follow the theme.
const ICONS = {
  'kanban-square':     '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>',
  'table':             '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  'layout-grid':       '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  'calendar':          '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  'gantt-chart':       '<path d="M8 6h10"/><path d="M6 12h9"/><path d="M11 18h7"/>',
  'bar-chart-3':       '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'settings':          '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'menu':              '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  'search':            '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'users':             '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'sliders':           '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  'more-vertical':     '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  'pencil':            '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  'trash':             '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  'plus':              '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'x':                 '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'log-out':           '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  'chevron-down':      '<path d="m6 9 6 6 6-6"/>',
  'chevron-left':      '<path d="m15 18-6-6 6-6"/>',
  'chevron-right':     '<path d="m9 18 6-6-6-6"/>',
  'copy':              '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'sun':               '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  'moon':              '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'monitor':           '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  'check':             '<path d="M20 6 9 17l-5-5"/>',
  'bell':              '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'activity':          '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'box':               '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'bug':               '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  'check-square':      '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'arrow-up':          '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  'arrow-down':        '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
};

function svgIcon(name) {
  if (!ICONS[name]) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Walks the (sub-)tree and replaces [data-icon] elements' content with a
// <span class="icon">svg</span>. Skips already-injected ones so it's safe to
// call repeatedly. data-icon-only="true" replaces all content (icon-only btn);
// otherwise the SVG is prepended (icon + label).
function injectIcons(root = document) {
  const els = root.querySelectorAll('[data-icon]:not([data-icon-injected])');
  for (const el of els) {
    const name = el.dataset.icon;
    if (!ICONS[name]) continue;
    const span = document.createElement('span');
    span.className = 'icon';
    span.dataset.anim = el.dataset.anim || 'pop';
    span.innerHTML = svgIcon(name);
    if (el.dataset.iconOnly === 'true') { el.innerHTML = ''; el.appendChild(span); }
    else el.prepend(span);
    el.dataset.iconInjected = 'true';
  }
}

// On click, restart the icon's animation. Works for any [data-icon] element.
function setupIconAnimations() {
  document.addEventListener('click', (e) => {
    const owner = e.target.closest('[data-icon-injected]');
    const ic = owner?.querySelector('.icon');
    if (!ic) return;
    const anim = 'anim-' + (ic.dataset.anim || 'pop');
    ic.classList.remove(anim);
    void ic.offsetWidth; // force reflow → restart animation
    ic.classList.add(anim);
  });
}

// Category metadata (label + color). Keys must match server CATEGORY_VALUES.
const CATEGORIES = {
  'design-system': { label: 'DESIGN SYSTEM', color: '#0052CC' },
  'critico':       { label: 'CRÍTICO',       color: '#EF4444' },
  'pesquisa':      { label: 'PESQUISA',      color: '#7C3AED' },
  'feature':       { label: 'FEATURE',       color: '#10B981' },
  'documentacao':  { label: 'DOCUMENTAÇÃO',  color: '#F59E0B' },
  'bug':           { label: 'BUG',           color: '#F97316' },
  'ui-design':     { label: 'UI DESIGN',     color: '#06B6D4' },
  'lista':         { label: 'LISTA',         color: '#059669' },
};

// DiceBear avatar URL (SVG, no API key needed)
function avatarUrl(seed, size = 80) {
  const safe = encodeURIComponent((seed || 'anon').toLowerCase().trim());
  return `https://api.dicebear.com/9.x/personas/svg?seed=${safe}&size=${size}&backgroundType=solid&backgroundColor=eef1f6,ffd5dc,d1f5e0,fce4d6,e0e7ff`;
}

function avatarImg(seed, size = 32, alt = '') {
  return `<img src="${avatarUrl(seed, size * 2)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============ API HELPERS ============
async function request(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  if (res.status === 401 && state.user) {
    // Session expired: bounce back to auth screen
    state.user = null;
    showAuthScreen();
  }
  return res;
}

const api = {
  get:    async (url)       => (await request(url)).json(),
  post:   async (url, body) => (await request(url, { method: 'POST',   body: JSON.stringify(body) })).json(),
  put:    async (url, body) => (await request(url, { method: 'PUT',    body: JSON.stringify(body) })).json(),
  patch:  async (url, body) => (await request(url, { method: 'PATCH',  body: JSON.stringify(body) })).json(),
  delete: async (url)       => request(url, { method: 'DELETE' }),
};

// ============ AUTH BOOT ============
async function bootAuth() {
  // Each step is wrapped so a single failure can't strand the user on a blank
  // page. Without these guards, a network error during /api/auth/me (common
  // when the PWA's service worker is mid-upgrade) would reject bootAuth and
  // leave both #authScreen and #appShell hidden — user sees only the body
  // background, which on the auth screen reads as a "blue screen".
  try { applySettings(); } catch (e) { console.warn('applySettings failed', e); }
  try { injectIcons(); setupIconAnimations(); } catch (e) { console.warn('icons failed', e); }

  try {
    const params = new URLSearchParams(window.location.search);
    state.pendingInviteToken = params.get('invite');
  } catch {}

  try { setupAuthListeners(); } catch (e) { console.warn('auth listeners failed', e); }

  // Try to load current user. If the network call rejects entirely (offline,
  // SW abort during upgrade, server unreachable), fall through to the auth
  // screen so the user has something to interact with instead of a void.
  try {
    const meRes = await request('/api/auth/me');
    if (meRes.ok) {
      state.user = await meRes.json();
      await afterLogin();
      return;
    }
  } catch (err) {
    console.error('Boot: /api/auth/me failed', err);
  }
  // Either not logged in or the call failed — show the auth screen.
  try {
    await showAuthScreen();
  } catch (err) {
    // Last-resort fallback: if even showing the auth screen throws, surface
    // the boot-error banner so the user can reload manually.
    console.error('Boot: showAuthScreen failed', err);
    showBootError();
  }
}

// Surface a minimal recovery UI when the JS boot fails catastrophically.
// Without this, the user stares at the body background (often the auth-screen
// gradient if it briefly appeared) with no way to recover except clearing
// site data manually.
function showBootError() {
  const el = document.getElementById('bootError');
  if (el) el.classList.remove('hidden');
}

async function afterLogin() {
  showAppShell();
  renderUserMenu();

  // If we arrived with an invite token, accept it before showing the app
  if (state.pendingInviteToken) {
    try {
      const accept = await api.post(`/api/invites/${state.pendingInviteToken}/accept`, {});
      if (accept.board_id) {
        await loadBoards();
        await loadBoard(accept.board_id);
        clearInviteFromUrl();
        setupEventListeners();
        return;
      }
    } catch (e) {
      console.warn('Falha ao aceitar convite', e);
    }
    clearInviteFromUrl();
  }

  await init();
  checkWhatsNew();
}

function clearInviteFromUrl() {
  state.pendingInviteToken = null;
  window.history.replaceState({}, '', window.location.pathname);
}

async function showAuthScreen() {
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
  $('#loginError')?.classList.add('hidden');
  $('#registerError')?.classList.add('hidden');

  // Honor server-side registration lock: hide the "Criar conta" tab when off
  try {
    const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
    const regTab = document.querySelector('.auth-tab[data-auth-tab="register"]');
    if (regTab) regTab.style.display = cfg.registrationEnabled === false ? 'none' : '';
    // If currently on the register tab but it's disabled, switch to login
    if (cfg.registrationEnabled === false) {
      document.querySelector('.auth-tab[data-auth-tab="login"]')?.click();
    }
  } catch {}

  // If invite token present, fetch info to render banner
  if (state.pendingInviteToken) {
    fetch(`/api/invites/${state.pendingInviteToken}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(info => {
        if (info?.board_title) {
          $('#inviteBanner').innerHTML =
            `🎉 <strong>${escapeHtml(info.inviter)}</strong> te convidou para o quadro <strong>"${escapeHtml(info.board_title)}"</strong> como <strong>${escapeHtml(info.role)}</strong>.<br>Faça login ou crie sua conta para aceitar.`;
          $('#inviteBanner').classList.remove('hidden');
        }
      });
  } else {
    $('#inviteBanner').classList.add('hidden');
  }

  setTimeout(() => $('#loginEmail').focus(), 50);
}

function showAppShell() {
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
}

function renderUserMenu() {
  if (!state.user) return;
  const seed = state.user.email || state.user.name;
  $('#userAvatar').innerHTML = avatarImg(seed, 32, state.user.name);
  $('#userMenuName').textContent = state.user.name.split(/\s+/)[0];
  $('#userMenuFullName').textContent = state.user.name;
  $('#userMenuEmail').textContent = state.user.email;
}

// ============ AUTH FORMS ============
let _authListenersDone = false;
function setupAuthListeners() {
  if (_authListenersDone) return;
  _authListenersDone = true;
  $$('.auth-tab').forEach(t => t.addEventListener('click', () => {
    $$('.auth-tab').forEach(x => x.classList.toggle('active', x === t));
    const which = t.dataset.authTab;
    $('#loginForm').classList.toggle('hidden', which !== 'login');
    $('#registerForm').classList.toggle('hidden', which !== 'register');
  }));

  $('#loginForm').addEventListener('submit', doLogin);
  $('#registerForm').addEventListener('submit', doRegister);
}

async function doLogin(e) {
  e.preventDefault();
  $('#loginError').classList.add('hidden');
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: $('#loginEmail').value.trim(),
      password: $('#loginPassword').value,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    $('#loginError').textContent = err.error || 'Falha no login';
    $('#loginError').classList.remove('hidden');
    return;
  }
  state.user = await res.json();
  await afterLogin();
}

async function doRegister(e) {
  e.preventDefault();
  $('#registerError').classList.add('hidden');
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('#registerName').value.trim(),
      email: $('#registerEmail').value.trim(),
      password: $('#registerPassword').value,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    $('#registerError').textContent = err.error || 'Falha no cadastro';
    $('#registerError').classList.remove('hidden');
    return;
  }
  state.user = await res.json();
  await afterLogin();
}

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  state.user = null;
  state.boards = [];
  state.currentBoard = null;
  state.currentBoardId = null;
  showAuthScreen();
}

// ============ INIT ============
async function init() {
  await loadWorkspace();
  await loadBoards();
  if (state.boards.length > 0) {
    await loadBoard(state.boards[0].id);
  } else {
    $('#boardTitle').textContent = 'Crie um quadro para começar';
    $('#listsContainer').innerHTML = '';
  }
  setupEventListeners();
}

async function loadWorkspace() {
  // We still need state.workspace.id for the activity/analytics endpoints,
  // even though the visual workspace card was removed.
  try { state.workspace = await api.get('/api/workspaces/me'); }
  catch { /* graceful: workspace might not exist for very old accounts */ }
}

async function loadBoards() {
  state.boards = await api.get('/api/boards');
  renderBoardsNav();
}

async function loadBoard(boardId) {
  state.currentBoardId = boardId;
  state.currentBoard = await api.get(`/api/boards/${boardId}`);
  // Fetch members in parallel for the avatar pile (cheap, doesn't gate render)
  api.get(`/api/boards/${boardId}/members`).then(m => {
    state.boardMembers = Array.isArray(m) ? m : [];
    renderAvatarPile();
  }).catch(() => { state.boardMembers = []; });
  renderBoardsNav();
  applyRoleVisibility();
  // If the user was in a workspace-level view (Activity/Analytics/Settings),
  // jump back to the per-board view they had open before.
  if (WORKSPACE_VIEWS.has(state.view)) {
    return switchView(state.lastBoardView || 'kanban');
  }
  renderCurrentView();
}

function renderAvatarPile() {
  const el = $('#avatarPile');
  if (!el) return;
  el.innerHTML = '';
  const members = state.boardMembers.slice(0, 4);
  for (const m of members) {
    const a = document.createElement('span');
    a.className = 'pile-avatar';
    a.title = `${m.name} (${m.role})`;
    a.innerHTML = avatarImg(m.email, 30, m.name);
    el.appendChild(a);
  }
  if (state.boardMembers.length > 4) {
    const more = document.createElement('span');
    more.className = 'pile-avatar pile-more';
    more.textContent = `+${state.boardMembers.length - 4}`;
    el.appendChild(more);
  }
  el.onclick = openMembersModal;
}

function applyRoleVisibility() {
  const role = state.currentBoard?.role;
  const canManage = role === 'owner' || role === 'admin';
  const canDelete = role === 'owner';
  $('#renameBoardBtn').classList.toggle('hidden', !canManage);
  $('#deleteBoardBtn').classList.toggle('hidden', !canDelete);
  // Hide the entire ⋮ menu trigger if there are no actions to show
  $('#boardMoreBtn').classList.toggle('hidden', !canManage && !canDelete);
  // Members button visible to anyone with view access — invite controls hide inside the modal for non-managers
}

// Workspace-level views don't operate on a board
const WORKSPACE_VIEWS = new Set(['settings', 'activity', 'analytics']);

function switchView(viewName) {
  // Remember the last per-board view, so workspace-level views (Settings,
  // Activity, Analytics) know where to return when the user picks a board.
  if (!WORKSPACE_VIEWS.has(viewName)) state.lastBoardView = viewName;
  state.view = viewName;
  $$('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
  $$('.bottom-nav-item').forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
  $$('.ws-nav-item').forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
  $('#settingsBtn')?.classList.toggle('active', viewName === 'settings');
  $$('.board-view').forEach(s => s.classList.add('hidden'));
  const map = {
    kanban: '#kanbanView', table: '#tableView', cards: '#cardsView',
    calendar: '#calendarView', gantt: '#ganttView', dashboard: '#dashboardView',
    settings: '#settingsView', activity: '#activityView', analytics: '#analyticsView',
  };
  $(map[viewName])?.classList.remove('hidden');
  // Hide per-board view tabs when in a workspace-level view
  $('#viewTabs').style.display = WORKSPACE_VIEWS.has(viewName) ? 'none' : '';
  // Close mobile sidebar on view change
  closeSidebar();
  renderCurrentView();
}

function renderCurrentView() {
  if (state.view === 'settings')  return renderSettings();
  if (state.view === 'activity')  return renderActivity();
  if (state.view === 'analytics') return renderWorkspaceAnalytics();
  if (!state.currentBoard) return;
  if (state.view === 'kanban')    renderKanban();
  if (state.view === 'table')     renderTable();
  if (state.view === 'cards')     renderCardsGallery();
  if (state.view === 'calendar')  renderCalendar();
  if (state.view === 'gantt')     renderGantt();
  if (state.view === 'dashboard') renderDashboard();
}

function allCards() {
  if (!state.currentBoard) return [];
  return state.currentBoard.lists.flatMap(l => l.cards.map(c => ({ ...c, _list: l })));
}

// ============ BOARDS NAV ============
function renderBoardsNav() {
  const nav = $('#boardsNav');
  nav.innerHTML = '';
  for (const b of state.boards) {
    const btn = document.createElement('button');
    btn.dataset.boardId = b.id;
    btn.textContent = b.title;
    if (/^#[0-9a-f]{6}$/i.test(b.color || '')) btn.style.setProperty('--board-accent', b.color);
    if (b.id === state.currentBoardId) btn.classList.add('active');
    btn.addEventListener('click', () => loadBoard(b.id));
    nav.appendChild(btn);
  }
  // Drag-and-drop reorder. Long-press on touch avoids drag-on-tap; on desktop
  // the click fires immediately because Sortable only triggers onEnd after movement.
  Sortable.create(nav, {
    animation: 180,
    delay: 150,
    delayOnTouchOnly: true,
    ghostClass: 'board-nav-ghost',
    chosenClass: 'board-nav-chosen',
    dragClass: 'board-nav-drag',
    onEnd: handleBoardsNavEnd,
  });
}

async function handleBoardsNavEnd() {
  const nav = $('#boardsNav');
  const boardIds = [...nav.querySelectorAll('button[data-board-id]')]
    .map(el => parseInt(el.dataset.boardId))
    .filter(Number.isInteger);
  // Optimistic local reorder so subsequent renders match what the user sees
  state.boards.sort((a, b) => boardIds.indexOf(a.id) - boardIds.indexOf(b.id));
  try {
    await api.patch('/api/boards/reorder', { boardIds });
  } catch {
    // Server rejected — pull canonical order back from the DB
    await loadBoards();
  }
}

// ============ KANBAN VIEW ============
// Drag&drop powered by SortableJS (handles mouse + touch transparently).
// We initialize fresh Sortable instances on each render — old ones are
// garbage-collected when their DOM elements are removed.

function renderKanban() {
  const board = state.currentBoard;
  $('#boardTitle').textContent = board.title;

  const container = $('#listsContainer');
  container.innerHTML = '';

  for (const list of board.lists) container.appendChild(renderList(list));

  const addBtn = document.createElement('button');
  addBtn.className = 'add-list-btn';
  addBtn.textContent = '+ Adicionar lista';
  addBtn.addEventListener('click', addList);
  container.appendChild(addBtn);

  // List-level drag: pick up by header, reorder horizontally
  Sortable.create(container, {
    group: 'lists',
    animation: 180,
    handle: '.list-header',
    draggable: '.list',
    filter: '.add-list-btn, input, button.list-delete',
    preventOnFilter: false,
    ghostClass: 'list-ghost',
    chosenClass: 'list-chosen',
    dragClass: 'list-drag',
    onEnd: handleListsEnd,
  });
}

async function handleListsEnd() {
  const container = $('#listsContainer');
  const updates = [...container.querySelectorAll('.list')].map((el, i) => ({
    id: parseInt(el.dataset.listId),
    position: i,
  }));
  try {
    await api.post('/api/lists/reorder', updates);
    // Sync local state so renders use the new order without a network reload
    for (const u of updates) {
      const list = state.currentBoard.lists.find(l => l.id === u.id);
      if (list) list.position = u.position;
    }
    state.currentBoard.lists.sort((a, b) => a.position - b.position);
  } catch {
    await loadBoard(state.currentBoardId);
  }
}

function renderList(list) {
  const el = document.createElement('div');
  el.className = 'list';
  el.dataset.listId = list.id;

  const header = document.createElement('div');
  header.className = 'list-header';
  const titleInput = document.createElement('input');
  titleInput.value = list.title;
  titleInput.addEventListener('blur', () => {
    if (titleInput.value.trim() && titleInput.value !== list.title)
      api.put(`/api/lists/${list.id}`, { title: titleInput.value.trim() });
  });
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') titleInput.blur(); });

  const delBtn = document.createElement('button');
  delBtn.className = 'list-delete';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', async () => {
    if (confirm(`Excluir "${list.title}" e todos os cards?`)) {
      await api.delete(`/api/lists/${list.id}`);
      await loadBoard(state.currentBoardId);
    }
  });

  header.appendChild(titleInput);
  header.appendChild(delBtn);
  el.appendChild(header);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'cards-container';
  cardsContainer.dataset.listId = list.id;

  for (const card of list.cards.filter(matchesSearch)) {
    cardsContainer.appendChild(renderCard(card));
  }

  el.appendChild(cardsContainer);

  // Card-level drag: works on touch + mouse, allows moving between lists
  Sortable.create(cardsContainer, {
    group: 'cards',         // same group across all lists → cards move freely between
    animation: 180,
    ghostClass: 'card-ghost',
    chosenClass: 'card-chosen',
    dragClass: 'card-drag',
    forceFallback: false,
    fallbackOnBody: true,   // drag mirror lives in body so it doesn't get clipped
    swapThreshold: 0.65,
    onEnd: handleCardsEnd,
  });

  const addCard = document.createElement('button');
  addCard.className = 'add-card-btn';
  addCard.textContent = '+ Adicionar card';
  addCard.addEventListener('click', () => openCardModal(null, list.id));
  el.appendChild(addCard);

  return el;
}

async function handleCardsEnd() {
  // Sortable already moved the DOM; gather the new order from ALL lists
  // (cards may have moved between lists, so we re-index everything).
  const updates = [];
  $$('.cards-container').forEach(container => {
    const listId = parseInt(container.dataset.listId);
    [...container.querySelectorAll('.card')].forEach((cardEl, i) => {
      updates.push({ id: parseInt(cardEl.dataset.cardId), list_id: listId, position: i });
    });
  });
  if (!updates.length) return;
  try {
    await api.post('/api/cards/reorder', updates);
    syncCardPositionsLocally(updates);
  } catch {
    await loadBoard(state.currentBoardId);
  }
}

function renderCard(card) {
  const el = document.createElement('div');
  el.className = `card priority-${card.priority || 'media'}`;
  el.dataset.cardId = card.id;

  // Category pill on top (if set)
  if (card.category && CATEGORIES[card.category]) {
    const cat = CATEGORIES[card.category];
    const pill = document.createElement('div');
    pill.className = 'card-category';
    pill.style.setProperty('--cat-color', cat.color);
    pill.style.setProperty('--cat-bg', cat.color + '1A');  // ~10% opacity
    pill.textContent = cat.label;
    el.appendChild(pill);
  }

  // Card ID (when toggle is on)
  if (state.settings.showIds) {
    const id = document.createElement('div');
    id.className = 'card-id';
    id.textContent = `#${card.id}`;
    el.appendChild(id);
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = card.title;
  el.appendChild(titleEl);

  // LISTA cards: show a read-only preview of items right on the card so you
  // can see what's on the list at a glance. Tapping the card opens the
  // dedicated lista view (a clean editor — not the full Editar Card modal).
  if (card.category === 'lista') {
    const items = card.checklist_items || [];
    if (items.length > 0) {
      const preview = document.createElement('div');
      preview.className = 'card-lista-preview';
      const max = 6;
      for (const item of items.slice(0, max)) {
        const line = document.createElement('div');
        line.className = 'card-lista-preview-line' + (item.completed ? ' is-done' : '');
        line.innerHTML = `<span class="card-lista-preview-box">${item.completed ? '✓' : ''}</span><span>${escapeHtml(item.text)}</span>`;
        preview.appendChild(line);
      }
      if (items.length > max) {
        const more = document.createElement('div');
        more.className = 'card-lista-preview-more';
        more.textContent = `+${items.length - max} item${items.length - max > 1 ? 's' : ''}`;
        preview.appendChild(more);
      }
      el.appendChild(preview);
    }
  }

  const meta = buildMeta(card);
  if (meta) el.appendChild(meta);

  // LISTA cards open the dedicated lista view; everything else opens the
  // standard Editar Card modal.
  if (card.category === 'lista') {
    el.addEventListener('click', () => openListaView(card));
  } else {
    el.addEventListener('click', () => openCardModal(card));
  }
  return el;
}

function buildMeta(card) {
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  if (card.due_date) {
    const b = document.createElement('span');
    b.className = 'card-badge';
    if (isOverdue(card.due_date)) b.classList.add('due-overdue');
    b.textContent = '📅 ' + formatDate(card.due_date);
    meta.appendChild(b);
  }

  // Checklist progress badge — only on cards that DON'T render the inline list
  // (LISTA cards already show items + count inline above; the badge would dupe it).
  const items = card.checklist_items || [];
  if (items.length > 0 && card.category !== 'lista') {
    const done = items.filter(i => i.completed).length;
    const b = document.createElement('span');
    b.className = 'card-badge card-checklist-badge';
    if (done === items.length) b.classList.add('is-complete');
    b.textContent = `☑ ${done}/${items.length}`;
    meta.appendChild(b);
  }

  if (card.assignee) {
    // mini-avatar (DiceBear seed = assignee name) on the right
    const av = document.createElement('span');
    av.className = 'mini-avatar';
    av.title = card.assignee;
    av.style.marginLeft = 'auto';
    av.innerHTML = avatarImg(card.assignee, 22, card.assignee);
    meta.appendChild(av);
  }
  return meta.children.length ? meta : null;
}

// Mutates state.currentBoard to match the new positions/list assignments
// the user made via drag&drop, without doing a full network reload. Keeps
// the UI smooth — no rerender flicker, no scroll position lost.
function syncCardPositionsLocally(updates) {
  if (!state.currentBoard) return;
  const cardsById = new Map();
  for (const list of state.currentBoard.lists) {
    for (const card of list.cards) cardsById.set(card.id, card);
  }
  for (const u of updates) {
    const card = cardsById.get(u.id);
    if (card) { card.list_id = u.list_id; card.position = u.position; }
  }
  for (const list of state.currentBoard.lists) {
    list.cards = [...cardsById.values()]
      .filter(c => c.list_id === list.id)
      .sort((a, b) => a.position - b.position);
  }
}


// ============ TABLE VIEW (grouped) ============
function renderTable() {
  const board = state.currentBoard;
  $('#tableBoardTitle').textContent = board.title;

  const wrap = $('#tableGroups');
  wrap.innerHTML = '';

  for (const list of board.lists) {
    const cards = list.cards.filter(matchesSearch);
    wrap.appendChild(renderTableGroup(list, cards));
  }
}

function renderTableGroup(list, cards) {
  const block = document.createElement('div');
  block.className = 'group-block';
  const color = colorFromString(list.title);
  block.style.setProperty('--group-color', color);

  // Title
  const collapsed = state.collapsedGroups.has(list.id);
  const title = document.createElement('div');
  title.className = 'group-title';
  title.innerHTML = `<span class="toggle-arrow">${collapsed ? '▶' : '▼'}</span> ${escapeHtml(list.title)} <span class="group-count">(${cards.length})</span>`;
  title.addEventListener('click', () => {
    if (collapsed) state.collapsedGroups.delete(list.id);
    else state.collapsedGroups.add(list.id);
    renderTable();
  });
  block.appendChild(title);

  if (collapsed) return block;

  const content = document.createElement('div');
  content.className = 'group-content';

  const table = document.createElement('table');
  table.className = 'cards-table';

  // Header
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  trHead.innerHTML = `
    <th class="table-row-checkbox"><input type="checkbox" data-group-check="${list.id}" /></th>
    <th>Tarefa</th>
    ${state.visibleCols.priority ? '<th>Prioridade</th>' : ''}
    ${state.visibleCols.assignee ? '<th>Responsável</th>' : ''}
    ${state.visibleCols.due_date ? '<th>Vencimento</th>' : ''}
    ${state.visibleCols.description ? '<th>Descrição</th>' : ''}
    <th>Ações</th>
  `;
  thead.appendChild(trHead);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const card of cards) {
    const tr = document.createElement('tr');
    const safeP = safePriority(card.priority);
    tr.innerHTML = `
      <td class="table-row-checkbox"><input type="checkbox" data-card-check="${parseInt(card.id) || 0}" /></td>
      <td><strong>${escapeHtml(card.title)}</strong></td>
      ${state.visibleCols.priority ? `<td><span class="tag-priority ${safeP}">${safeP}</span></td>` : ''}
      ${state.visibleCols.assignee ? `<td>${escapeHtml(card.assignee || '—')}</td>` : ''}
      ${state.visibleCols.due_date ? `<td>${card.due_date ? (isOverdue(card.due_date) ? `<span style="color:#eb5a46;font-weight:600">${escapeHtml(formatDate(card.due_date))} ⚠</span>` : escapeHtml(formatDate(card.due_date))) : '—'}</td>` : ''}
      ${state.visibleCols.description ? `<td>${escapeHtml((card.description || '').slice(0, 60))}${(card.description || '').length > 60 ? '...' : ''}</td>` : ''}
      <td><button class="btn btn-ghost" data-edit="${parseInt(card.id) || 0}">Editar</button></td>
    `;
    tr.querySelector('[data-edit]').addEventListener('click', () => openCardModal(card));
    tbody.appendChild(tr);
  }

  // Add task row
  const addRow = document.createElement('tr');
  addRow.className = 'add-task-row';
  const colspan = 2 + Object.values(state.visibleCols).filter(Boolean).length + 1;
  addRow.innerHTML = `<td colspan="${colspan}">+ Adicionar tarefa</td>`;
  addRow.addEventListener('click', () => openCardModal(null, list.id));
  tbody.appendChild(addRow);

  // Summary row
  if (cards.length) {
    const summary = document.createElement('tr');
    summary.className = 'group-summary-row';
    const cells = [`<td></td>`, `<td><em>${cards.length} ${cards.length === 1 ? 'tarefa' : 'tarefas'}</em></td>`];
    if (state.visibleCols.priority) cells.push(`<td>${renderPriorityBar(cards)}</td>`);
    if (state.visibleCols.assignee) cells.push(`<td>${uniqueAssignees(cards)}</td>`);
    if (state.visibleCols.due_date) cells.push(`<td>${renderDateRange(cards)}</td>`);
    if (state.visibleCols.description) cells.push(`<td></td>`);
    cells.push(`<td></td>`);
    summary.innerHTML = cells.join('');
    tbody.appendChild(summary);
  }

  table.appendChild(tbody);
  content.appendChild(table);
  block.appendChild(content);
  return block;
}

function renderPriorityBar(cards) {
  const counts = { alta: 0, media: 0, baixa: 0 };
  for (const c of cards) counts[c.priority] = (counts[c.priority] || 0) + 1;
  const total = cards.length || 1;
  const segs = ['alta', 'media', 'baixa']
    .filter(p => counts[p] > 0)
    .map(p => `<div class="seg-${p}" style="width:${(counts[p] / total * 100).toFixed(1)}%" title="${counts[p]} ${p}">${counts[p]}</div>`)
    .join('');
  return `<div class="priority-bar">${segs}</div>`;
}

function renderDateRange(cards) {
  const dates = cards.map(c => c.due_date).filter(Boolean).sort();
  if (!dates.length) return '—';
  const first = escapeHtml(formatDate(dates[0]));
  const last = escapeHtml(formatDate(dates[dates.length - 1]));
  if (first === last) return `<span class="date-range-pill">${first}</span>`;
  return `<span class="date-range-pill">${first} → ${last}</span>`;
}

function uniqueAssignees(cards) {
  const set = new Set(cards.map(c => c.assignee).filter(Boolean));
  if (!set.size) return '—';
  return [...set].slice(0, 3).join(', ') + (set.size > 3 ? ` +${set.size - 3}` : '');
}

function colorFromString(s) {
  const palette = ['#0079bf', '#61bd4f', '#eb5a46', '#c377e0', '#ff9f1a', '#00c2e0', '#f2d600'];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

// ============ CARDS GALLERY ============
function renderCardsGallery() {
  const board = state.currentBoard;
  $('#cardsBoardTitle').textContent = board.title;

  const grid = $('#cardsGallery');
  grid.innerHTML = '';

  const cards = allCards().filter(matchesSearch);
  if (!cards.length) {
    grid.innerHTML = `<p style="color:white;font-size:14px">Nenhum card encontrado.</p>`;
    return;
  }

  for (const card of cards) {
    const el = document.createElement('div');
    el.className = `gallery-card priority-${card.priority || 'media'}`;
    const cat = CATEGORIES[card.category];
    const catHtml = cat
      ? `<div class="card-category" style="--cat-color:${cat.color};--cat-bg:${cat.color}1A">${escapeHtml(cat.label)}</div>`
      : '';
    const idHtml = state.settings.showIds ? `<div class="card-id">#${parseInt(card.id) || 0}</div>` : '';
    el.innerHTML = `
      <div class="gallery-list-tag">${escapeHtml(card._list.title)}</div>
      ${catHtml}
      ${idHtml}
      <h4>${escapeHtml(card.title)}</h4>
      ${card.description ? `<div class="gallery-desc">${escapeHtml(card.description)}</div>` : '<div class="gallery-desc"></div>'}
    `;
    const meta = buildMeta(card);
    if (meta) el.appendChild(meta);
    el.addEventListener('click', () => openCardModal(card));
    grid.appendChild(el);
  }
}

// ============ CALENDAR ============
function renderCalendar() {
  const board = state.currentBoard;
  $('#calendarBoardTitle').textContent = board.title;

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const ref = state.calendarDate;
  const year = ref.getFullYear();
  const month = ref.getMonth();
  $('#monthLabel').textContent = `${monthNames[month]} ${year}`;

  const grid = $('#calendarGrid');
  grid.innerHTML = '';

  const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  for (const w of weekdays) {
    const h = document.createElement('div');
    h.className = 'calendar-weekday';
    h.textContent = w;
    grid.appendChild(h);
  }

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Index cards by due date
  const cardsByDate = {};
  for (const c of allCards().filter(matchesSearch)) {
    if (c.due_date) (cardsByDate[c.due_date] ||= []).push(c);
  }

  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';

    let dayNum, cellDate;
    if (i < startDay) {
      dayNum = daysPrevMonth - startDay + i + 1;
      cellDate = new Date(year, month - 1, dayNum);
      cell.classList.add('other-month');
    } else if (i >= startDay + daysInMonth) {
      dayNum = i - (startDay + daysInMonth) + 1;
      cellDate = new Date(year, month + 1, dayNum);
      cell.classList.add('other-month');
    } else {
      dayNum = i - startDay + 1;
      cellDate = new Date(year, month, dayNum);
    }

    const dateKey = `${cellDate.getFullYear()}-${String(cellDate.getMonth()+1).padStart(2,'0')}-${String(cellDate.getDate()).padStart(2,'0')}`;
    if (dateKey === todayKey) cell.classList.add('today');

    const dn = document.createElement('span');
    dn.className = 'day-number';
    dn.textContent = dayNum;
    cell.appendChild(dn);

    const cards = cardsByDate[dateKey] || [];
    for (const c of cards.slice(0, 4)) {
      const cardEl = document.createElement('div');
      cardEl.className = `calendar-card priority-${c.priority || 'media'}`;
      cardEl.textContent = c.title;
      cardEl.title = c.title;
      cardEl.addEventListener('click', () => openCardModal(c));
      cell.appendChild(cardEl);
    }
    if (cards.length > 4) {
      const more = document.createElement('div');
      more.style.fontSize = '11px';
      more.style.color = 'var(--text-secondary)';
      more.textContent = `+${cards.length - 4} mais`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }
}

// ============ DASHBOARD ============
function renderDashboard() {
  const board = state.currentBoard;
  $('#dashboardBoardTitle').textContent = `Panorama — ${board.title}`;

  const cards = allCards();
  const total = cards.length;

  // Detect "done"-like list
  const doneList = board.lists.find(l => /conclu|feito|done/i.test(l.title));
  const doneCount = doneList ? doneList.cards.length : 0;

  // In progress = lists with "andament|progresso|progress|doing"
  const progressList = board.lists.find(l => /andament|progress|doing/i.test(l.title));
  const progressCount = progressList ? progressList.cards.length : 0;

  const overdue = cards.filter(c => c.due_date && isOverdue(c.due_date) && (!doneList || c.list_id !== doneList.id));

  // KPIs
  const kpiRow = $('#kpiRow');
  kpiRow.innerHTML = '';
  kpiRow.appendChild(kpiCard('Todas as tarefas', total, '', '#0079bf'));
  kpiRow.appendChild(kpiCard('Concluído', doneCount, total ? `${Math.round(doneCount/total*100)}% do total` : '', '#61bd4f'));
  kpiRow.appendChild(kpiCard('Em andamento', progressCount, '', '#f2d600'));
  kpiRow.appendChild(kpiCard('Atrasadas', overdue.length, overdue.length ? 'Atenção!' : 'Tudo no prazo', '#eb5a46'));

  // Chart: by status (list)
  const statusData = board.lists.map(l => ({
    label: l.title,
    value: l.cards.length,
    color: colorFromString(l.title),
  })).filter(d => d.value > 0);
  renderPieChart($('#chartByStatus'), statusData);

  // Chart: by assignee (top 8)
  const assigneeMap = {};
  for (const c of cards) {
    const a = c.assignee?.trim() || 'Sem responsável';
    assigneeMap[a] = (assigneeMap[a] || 0) + 1;
  }
  const assigneeData = Object.entries(assigneeMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  renderBarChart($('#chartByAssignee'), assigneeData);

  // Chart: by priority
  const priorityCounts = { alta: 0, media: 0, baixa: 0 };
  for (const c of cards) priorityCounts[c.priority || 'media']++;
  const priorityData = [
    { label: 'Alta',  value: priorityCounts.alta,  color: '#eb5a46' },
    { label: 'Média', value: priorityCounts.media, color: '#f2d600' },
    { label: 'Baixa', value: priorityCounts.baixa, color: '#61bd4f' },
  ].filter(d => d.value > 0);
  renderPieChart($('#chartByPriority'), priorityData);

  // Overdue list
  const overdueEl = $('#overdueList');
  overdueEl.innerHTML = '';
  if (!overdue.length) {
    overdueEl.innerHTML = '<p class="chart-empty">Nenhuma tarefa atrasada 🎉</p>';
  } else {
    for (const c of overdue.sort((a, b) => a.due_date.localeCompare(b.due_date))) {
      const div = document.createElement('div');
      div.className = 'overdue-item';
      div.innerHTML = `
        <div class="overdue-title">${escapeHtml(c.title)}</div>
        <div class="overdue-meta">📅 ${escapeHtml(formatDate(c.due_date))} · ${escapeHtml(c._list.title)}${c.assignee ? ' · 👤 ' + escapeHtml(c.assignee) : ''}</div>
      `;
      div.addEventListener('click', () => openCardModal(c));
      overdueEl.appendChild(div);
    }
  }
}

function kpiCard(label, value, sub, color) {
  const el = document.createElement('div');
  el.className = 'kpi-card';
  el.style.setProperty('--kpi-color', color);
  el.innerHTML = `
    <div class="kpi-label"><span class="kpi-dot"></span> ${escapeHtml(label)}</div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${escapeHtml(sub)}</div>
  `;
  return el;
}

// ---------- SVG CHARTS ----------
function renderPieChart(container, data) {
  container.innerHTML = '';
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) {
    container.innerHTML = '<p class="chart-empty">Sem dados para exibir</p>';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'chart-pie-wrap';

  const size = 180, r = 80, cx = size / 2, cy = size / 2;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${pieSlices(data, total, cx, cy, r)}</svg>`;
  wrap.innerHTML = svg;

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  for (const d of data) {
    const pct = (d.value / total * 100).toFixed(0);
    legend.insertAdjacentHTML('beforeend',
      `<div class="legend-item">
        <span class="legend-swatch" style="background:${d.color}"></span>
        ${escapeHtml(d.label)} <strong>${d.value}</strong> <span style="color:#5e6c84">(${pct}%)</span>
      </div>`);
  }
  wrap.appendChild(legend);
  container.appendChild(wrap);
}

function pieSlices(data, total, cx, cy, r) {
  // Single 100% slice: use a circle (paths can't draw a full 360° arc)
  if (data.length === 1) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${data[0].color}"/>`;
  }
  let angle = -Math.PI / 2;
  let svg = '';
  for (const d of data) {
    const slice = (d.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + slice);
    const y2 = cy + r * Math.sin(angle + slice);
    const largeArc = slice > Math.PI ? 1 : 0;
    svg += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${d.color}" stroke="white" stroke-width="2"/>`;
    angle += slice;
  }
  return svg;
}

function renderBarChart(container, data) {
  container.innerHTML = '';
  if (!data.length) {
    container.innerHTML = '<p class="chart-empty">Sem dados para exibir</p>';
    return;
  }

  const max = Math.max(...data.map(d => d.value));
  const rowHeight = 28, gap = 6, labelWidth = 110, valueWidth = 30, padding = 10;
  const w = container.clientWidth || 320;
  const h = data.length * (rowHeight + gap) + padding * 2;
  const barAreaWidth = Math.max(80, w - labelWidth - valueWidth - padding * 2);

  let svg = `<svg class="chart-bars" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
  data.forEach((d, i) => {
    const y = padding + i * (rowHeight + gap);
    const barWidth = (d.value / max) * barAreaWidth;
    const labelText = d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label;
    svg += `
      <text class="bar-label" x="${labelWidth - 6}" y="${y + rowHeight/2 + 4}" text-anchor="end">${escapeHtml(labelText)}</text>
      <rect class="bar" x="${labelWidth}" y="${y}" width="${barWidth}" height="${rowHeight}" rx="3"/>
      <text class="bar-value" x="${labelWidth + barWidth + 6}" y="${y + rowHeight/2 + 4}">${d.value}</text>
    `;
  });
  svg += '</svg>';
  container.innerHTML = svg;
}

// ============ GANTT / CRONOGRAMA ============
function renderGantt() {
  const board = state.currentBoard;
  $('#ganttBoardTitle').textContent = `Cronograma — ${board.title}`;

  const cards = allCards()
    .filter(matchesSearch)
    .filter(c => c.due_date || c.start_date)
    .map(c => ({
      ...c,
      _start: c.start_date || c.due_date,
      _end:   c.due_date   || c.start_date,
    }));

  const wrap = $('#ganttWrapper');
  wrap.innerHTML = '';

  if (!cards.length) {
    wrap.innerHTML = '<div class="gantt-empty">Adicione data de início ou vencimento aos cards pra ver o cronograma.</div>';
    $('#ganttRangeLabel').textContent = '';
    return;
  }

  // Range
  const allDates = cards.flatMap(c => [c._start, c._end]).sort();
  const minDate = parseDate(allDates[0]);
  const maxDate = parseDate(allDates[allDates.length - 1]);
  // Pad ±2 days for breathing room
  const start = addDays(minDate, -2);
  const end   = addDays(maxDate, 2);
  const totalDays = daysBetween(start, end) + 1;

  $('#ganttRangeLabel').textContent = `${formatDate(toIso(start))} → ${formatDate(toIso(end))} (${totalDays} dias)`;

  const dayWidth = 36;
  const labelColWidth = 220;

  const grid = document.createElement('div');
  grid.className = 'gantt-grid';
  grid.style.gridTemplateColumns = `${labelColWidth}px repeat(${totalDays}, ${dayWidth}px)`;

  const todayKey = toIso(new Date());

  // Header row
  const headerLabel = document.createElement('div');
  headerLabel.className = 'gantt-cell label-cell header-cell first-row';
  headerLabel.textContent = 'Tarefa';
  grid.appendChild(headerLabel);
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    const cell = document.createElement('div');
    cell.className = 'gantt-cell header-cell';
    if (dow === 0 || dow === 6) cell.classList.add('weekend');
    if (toIso(d) === todayKey) cell.classList.add('today');
    cell.innerHTML = `<div>${d.getDate()}</div><div style="font-size:9px">${['D','S','T','Q','Q','S','S'][dow]}</div>`;
    grid.appendChild(cell);
  }

  // Card rows
  for (const c of cards) {
    const labelCell = document.createElement('div');
    labelCell.className = 'gantt-cell label-cell';
    labelCell.innerHTML = `<span class="gantt-list-tag">${escapeHtml(c._list.title.slice(0, 8))}</span> ${escapeHtml(c.title)}`;
    labelCell.addEventListener('click', () => openCardModal(c));
    grid.appendChild(labelCell);

    // Track row spanning all day columns
    const track = document.createElement('div');
    track.className = 'gantt-bar-track';
    track.style.gridColumn = `2 / span ${totalDays}`;

    // Inner day backgrounds (weekends/today)
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(start, i);
      const dow = d.getDay();
      if (dow === 0 || dow === 6 || toIso(d) === todayKey) {
        const bg = document.createElement('div');
        bg.className = 'gantt-day-line ' + (toIso(d) === todayKey ? 'today-bg' : 'weekend-bg');
        bg.style.left = (i * dayWidth) + 'px';
        bg.style.setProperty('--day-width', dayWidth + 'px');
        track.appendChild(bg);
      }
    }

    const startOffset = daysBetween(start, parseDate(c._start));
    const endOffset   = daysBetween(start, parseDate(c._end));
    const barLeft  = startOffset * dayWidth + 2;
    const barWidth = Math.max(dayWidth - 4, (endOffset - startOffset + 1) * dayWidth - 4);

    const bar = document.createElement('div');
    bar.className = `gantt-bar priority-${c.priority || 'media'}`;
    bar.style.left = barLeft + 'px';
    bar.style.width = barWidth + 'px';
    bar.textContent = c.title;
    bar.title = `${c.title} · ${formatDate(c._start)} → ${formatDate(c._end)}`;
    bar.addEventListener('click', () => openCardModal(c));
    track.appendChild(bar);

    grid.appendChild(track);
  }

  wrap.appendChild(grid);
}

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// ============ WORKSPACE: ACTIVITY ============
async function renderActivity() {
  const container = $('#activityTimeline');
  container.innerHTML = '<div class="activity-empty">Carregando atividade...</div>';
  if (!state.workspace) return;
  let entries;
  try {
    entries = await api.get(`/api/workspaces/${state.workspace.id}/activity?limit=200`);
  } catch {
    container.innerHTML = '<div class="activity-empty">Erro ao carregar atividade.</div>';
    return;
  }
  container.innerHTML = '';
  if (!entries.length) {
    container.innerHTML = '<div class="activity-empty">Nenhuma atividade registrada ainda. Crie um card ou edite algo.</div>';
    return;
  }

  let lastDay = '';
  for (const e of entries) {
    const dayLabel = humanDay(e.created_at);
    if (dayLabel !== lastDay) {
      const sep = document.createElement('div');
      sep.className = 'activity-day-sep';
      sep.textContent = dayLabel;
      container.appendChild(sep);
      lastDay = dayLabel;
    }
    container.appendChild(renderActivityItem(e));
  }
}

function renderActivityItem(e) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  const seed = e.user_email || e.user_name || 'system';
  item.innerHTML = `
    <span class="activity-avatar">${e.user_id ? avatarImg(seed, 36, e.user_name || '') : '🤖'}</span>
    <div class="activity-body">
      <div class="activity-text">${activityText(e)}</div>
      <div class="activity-meta">
        <span>${humanTime(e.created_at)}</span>
        ${e.board_title ? `<span>·</span><span>${escapeHtml(e.board_title)}</span>` : ''}
      </div>
    </div>
  `;
  if (e.board_id) {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      loadBoard(e.board_id).then(() => switchView('kanban'));
    });
  }
  return item;
}

function activityText(e) {
  const who = e.user_name ? `<strong>${escapeHtml(e.user_name)}</strong>` : '<strong>Alguém</strong>';
  const d = e.details || {};
  const t = (label) => `<span class="a-target">${escapeHtml(label)}</span>`;
  switch (e.action) {
    case 'board.created':       return `${who} <span class="a-action">criou o quadro</span> ${t(d.title || '?')}`;
    case 'board.renamed':       return `${who} <span class="a-action">renomeou</span> ${t(d.from || '?')} → ${t(d.to || '?')}`;
    case 'board.deleted':       return `${who} <span class="a-action">excluiu o quadro</span> ${t(d.title || '?')}`;
    case 'list.created':        return `${who} <span class="a-action">criou a lista</span> ${t(d.title || '?')}`;
    case 'list.deleted':        return `${who} <span class="a-action">excluiu a lista</span> ${t(d.title || '?')}`;
    case 'card.created':        return `${who} <span class="a-action">criou o card</span> ${t(d.title || '?')}${d.list ? ` <span class="a-action">em</span> ${t(d.list)}` : ''}`;
    case 'card.moved':          return `${who} <span class="a-action">moveu</span> ${t(d.title || '?')} <span class="a-action">de</span> ${t(d.from || '?')} <span class="a-action">para</span> ${t(d.to || '?')}`;
    case 'card.renamed':        return `${who} <span class="a-action">renomeou um card</span>: ${t(d.from || '?')} → ${t(d.to || '?')}`;
    case 'card.deleted':        return `${who} <span class="a-action">excluiu o card</span> ${t(d.title || '?')}`;
    case 'member.added':        return `${who} <span class="a-action">entrou como</span> ${t(d.role || 'membro')}`;
    case 'member.removed':      return `${who} <span class="a-action">removeu</span> ${t(d.name || '?')}`;
    case 'member.role_changed': return `${who} <span class="a-action">mudou o papel de</span> ${t(d.name || '?')} <span class="a-action">para</span> ${t(d.role || '?')}`;
    case 'checklist.item_added':   return `${who} <span class="a-action">adicionou</span> ${t(d.text || '?')} <span class="a-action">à checklist de</span> ${t(d.card || '?')}`;
    case 'checklist.item_removed': return `${who} <span class="a-action">removeu</span> ${t(d.text || '?')} <span class="a-action">da checklist de</span> ${t(d.card || '?')}`;
    default:                    return `${who} <span class="a-action">${escapeHtml(e.action)}</span>`;
  }
}

function humanDay(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const today = new Date(); today.setHours(0,0,0,0);
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
  const day = new Date(d); day.setHours(0,0,0,0);
  if (day.getTime() === today.getTime()) return 'Hoje';
  if (day.getTime() === yest.getTime())  return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function humanTime(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1)   return 'agora mesmo';
  if (m < 60)  return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ============ WORKSPACE: ANALYTICS ============
async function renderWorkspaceAnalytics() {
  if (!state.workspace) return;
  let data;
  try { data = await api.get(`/api/workspaces/${state.workspace.id}/analytics`); }
  catch { return; }

  const kpi = $('#wsKpiRow');
  kpi.innerHTML = '';
  kpi.appendChild(kpiCard('Quadros',           data.totals.boards,  '', '#0052CC'));
  kpi.appendChild(kpiCard('Listas',            data.totals.lists,   '', '#7C3AED'));
  kpi.appendChild(kpiCard('Cards',             data.totals.cards,   '', '#10B981'));
  kpi.appendChild(kpiCard('Membros',           data.totals.members, '', '#F59E0B'));
  kpi.appendChild(kpiCard('Concluídos 7 dias', data.completedThisWeek, 'na semana', '#06B6D4'));

  // Cards by board (bar chart, reuse renderBarChart)
  renderBarChart($('#wsChartByBoard'),
    data.cardsByBoard.map(b => ({ label: b.board, value: b.count })));

  // Top assignees
  renderBarChart($('#wsChartByAssignee'),
    data.topAssignees.map(a => ({ label: a.name, value: a.count })));

  // Activity trend — simple SVG line/area chart over last 30 days
  renderActivityTrend($('#wsActivityTrend'), data.activityByDay);
}

function renderActivityTrend(container, points) {
  container.innerHTML = '';
  // Build a 30-day series, filling gaps with 0
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = points.find(p => p.date === key);
    days.push({ date: key, count: found ? found.count : 0 });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  const w = container.clientWidth || 600;
  const h = 220;
  const padX = 30, padY = 24;
  const innerW = w - padX * 2, innerH = h - padY * 2;
  const stepX = innerW / (days.length - 1);

  const xy = days.map((d, i) => [padX + i * stepX, padY + innerH - (d.count / max) * innerH]);
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `M ${padX} ${padY + innerH} ${xy.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L ${padX + innerW} ${padY + innerH} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#trendGrad)"/>
      <path d="${line}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linejoin="round"/>
      ${xy.map(([x, y], i) => days[i].count > 0
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--color-primary)"/>` : '').join('')}
      <text x="${padX}" y="${h - 6}" font-size="10" fill="var(--color-text-muted)">${days[0].date.slice(5)}</text>
      <text x="${padX + innerW}" y="${h - 6}" text-anchor="end" font-size="10" fill="var(--color-text-muted)">${days[days.length-1].date.slice(5)}</text>
      <text x="${padX - 4}" y="${padY + 4}" text-anchor="end" font-size="10" fill="var(--color-text-muted)">${max}</text>
      <text x="${padX - 4}" y="${padY + innerH}" text-anchor="end" font-size="10" fill="var(--color-text-muted)">0</text>
    </svg>
  `;
}

// ============ MODAL: CARD ============
function openCardModal(card, listId = null) {
  $('#cardId').value = card?.id || '';
  $('#cardListId').value = card?.list_id || listId || '';
  $('#cardTitleInput').value = card?.title || '';
  $('#cardDescInput').value = card?.description || '';
  $('#cardCategoryInput').value = card?.category || '';
  $('#cardPriorityInput').value = card?.priority || 'media';
  $('#cardStartInput').value = card?.start_date || '';
  $('#cardDueInput').value = card?.due_date || '';
  $('#cardAssigneeInput').value = card?.assignee || '';
  $('#cardModalTitle').textContent = card ? 'Editar Card' : 'Novo Card';
  $('#cardDeleteBtn').style.display = card ? '' : 'none';

  // Checklist is per-card data, only available once the card has been saved.
  // For new cards we hide the whole section; user can add items after first save.
  const section = $('#checklistSection');
  if (card?.id) {
    section.classList.remove('hidden');
    state.editingChecklist = (card.checklist_items || []).map(it => ({ ...it }));
    state.editingCardId = card.id;
    renderChecklist();
    // Reset add-item input UI to its closed state
    $('#checklistInputRow').classList.add('hidden');
    $('#checklistInput').value = '';
  } else {
    section.classList.add('hidden');
    state.editingChecklist = [];
    state.editingCardId = null;
  }

  $('#cardModal').classList.remove('hidden');
  setTimeout(() => $('#cardTitleInput').focus(), 50);
}

// ============ CHECKLIST ============
function renderChecklist() {
  const list = $('#checklistList');
  const items = state.editingChecklist || [];
  list.innerHTML = '';

  const total = items.length;
  const done  = items.filter(i => i.completed).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

  // Header progress + bar visibility
  $('#checklistProgress').textContent = total === 0 ? '' : `${done}/${total}`;
  $('#checklistProgressBar').classList.toggle('hidden', total === 0);
  $('#checklistProgressBar').querySelector('.checklist-progress-fill').style.width = pct + '%';
  $('#checklistSection').classList.toggle('checklist-empty', total === 0);

  // Toggle the "Adicionar checklist" vs "Adicionar item" label
  const empty = total === 0;
  $('#checklistAddBtn').classList.toggle('is-empty', empty);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const li = document.createElement('li');
    li.className = 'checklist-item' + (it.completed ? ' is-done' : '');
    li.dataset.itemId = it.id;
    li.innerHTML = `
      <button type="button" class="checklist-checkbox" data-action="toggle" aria-label="Marcar"></button>
      <span class="checklist-text" data-action="edit">${escapeHtml(it.text)}</span>
      <div class="checklist-actions">
        <button type="button" class="checklist-icon-btn" data-action="up"     ${i === 0 ? 'disabled' : ''} aria-label="Subir"     data-icon="arrow-up"   data-icon-only="true" data-anim="slide"></button>
        <button type="button" class="checklist-icon-btn" data-action="down"   ${i === items.length - 1 ? 'disabled' : ''} aria-label="Descer"  data-icon="arrow-down" data-icon-only="true" data-anim="slide"></button>
        <button type="button" class="checklist-icon-btn checklist-delete-btn" data-action="delete" aria-label="Excluir" data-icon="x" data-icon-only="true" data-anim="shake"></button>
      </div>
    `;
    list.appendChild(li);
  }
  injectIcons(list);
}

async function checklistAddItem(text) {
  const cardId = state.editingCardId;
  if (!cardId || !text.trim()) return;
  try {
    const item = await api.post(`/api/cards/${cardId}/checklist`, { text: text.trim() });
    if (item && item.id) {
      state.editingChecklist.push(item);
      renderChecklist();
      // Mirror into in-memory board so the card preview badge updates without
      // a full reload after the modal closes.
      mirrorChecklistToBoard(cardId);
    }
  } catch (e) {
    alert('Falha ao adicionar item da checklist.');
  }
}

async function checklistToggleItem(itemId) {
  const it = state.editingChecklist.find(i => i.id === itemId);
  if (!it) return;
  const next = !it.completed;
  // Optimistic
  it.completed = next ? 1 : 0;
  renderChecklist();
  try {
    await api.patch(`/api/checklist/${itemId}`, { completed: next });
    mirrorChecklistToBoard(state.editingCardId);
  } catch (e) {
    it.completed = next ? 0 : 1; // revert
    renderChecklist();
    alert('Falha ao atualizar item.');
  }
}

async function checklistDeleteItem(itemId) {
  const idx = state.editingChecklist.findIndex(i => i.id === itemId);
  if (idx < 0) return;
  const removed = state.editingChecklist.splice(idx, 1)[0];
  renderChecklist();
  try {
    await api.delete(`/api/checklist/${itemId}`);
    mirrorChecklistToBoard(state.editingCardId);
  } catch (e) {
    state.editingChecklist.splice(idx, 0, removed);
    renderChecklist();
    alert('Falha ao excluir item.');
  }
}

async function checklistEditItem(itemId) {
  const it = state.editingChecklist.find(i => i.id === itemId);
  if (!it) return;
  const next = prompt('Editar item:', it.text);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === it.text) return;
  const before = it.text;
  it.text = trimmed;
  renderChecklist();
  try {
    await api.patch(`/api/checklist/${itemId}`, { text: trimmed });
    mirrorChecklistToBoard(state.editingCardId);
  } catch (e) {
    it.text = before;
    renderChecklist();
    alert('Falha ao editar item.');
  }
}

async function checklistMoveItem(itemId, direction) {
  const items = state.editingChecklist;
  const idx = items.findIndex(i => i.id === itemId);
  if (idx < 0) return;
  const swapWith = idx + direction;
  if (swapWith < 0 || swapWith >= items.length) return;
  [items[idx], items[swapWith]] = [items[swapWith], items[idx]];
  renderChecklist();
  try {
    await api.patch(`/api/cards/${state.editingCardId}/checklist/reorder`,
      { ids: items.map(i => i.id) });
    mirrorChecklistToBoard(state.editingCardId);
  } catch (e) {
    [items[idx], items[swapWith]] = [items[swapWith], items[idx]];
    renderChecklist();
    alert('Falha ao reordenar.');
  }
}

// Sync the local edit state into state.currentBoard so the card preview's
// progress badge / inline list reflects checklist changes immediately. We
// also re-render the current view so the board updates even when the user
// closes the modal with X/Cancel (no implicit Save needed).
function mirrorChecklistToBoard(cardId) {
  if (!state.currentBoard || !cardId) return;
  for (const list of state.currentBoard.lists) {
    const card = list.cards.find(c => c.id === cardId);
    if (card) {
      card.checklist_items = state.editingChecklist.map(it => ({ ...it }));
      renderCurrentView();
      return;
    }
  }
}

async function saveCard(e) {
  e.preventDefault();
  const id = $('#cardId').value;
  const payload = {
    list_id:     parseInt($('#cardListId').value),
    title:       $('#cardTitleInput').value.trim(),
    description: $('#cardDescInput').value,
    category:    $('#cardCategoryInput').value || null,
    priority:    $('#cardPriorityInput').value,
    start_date:  $('#cardStartInput').value || null,
    due_date:    $('#cardDueInput').value || null,
    assignee:    $('#cardAssigneeInput').value,
  };
  if (!payload.title) return;
  if (id) await api.put(`/api/cards/${id}`, payload);
  else    await api.post('/api/cards', payload);
  closeAllModals();
  await loadBoard(state.currentBoardId);
}

async function deleteCard() {
  const id = $('#cardId').value;
  if (!id) return;
  if (!confirm('Excluir este card?')) return;
  await api.delete(`/api/cards/${id}`);
  closeAllModals();
  await loadBoard(state.currentBoardId);
}

// ============ MODAL: LISTA (dedicated, Samsung Notes-style) ============
// Used only for cards with category === 'lista'. A clean editor: title at top,
// items as <checkbox + input> rows, plus a permanent empty buffer row at the
// end that creates a new item when typed. Enter in an item moves to next; on
// the buffer it submits and stays focused for rapid entry. Backspace on an
// empty row deletes that item and steps back to the previous one.
function openListaView(card) {
  state.listaCard = card;

  // Title
  const titleInput = $('#listaTitleInput');
  titleInput.value = card.title || '';
  titleInput.onblur = async () => {
    const next = titleInput.value.trim();
    if (!next) { titleInput.value = card.title || ''; return; }
    if (next === card.title) return;
    try {
      await api.put(`/api/cards/${card.id}`, { title: next });
      card.title = next;
    } catch {
      titleInput.value = card.title || '';
    }
  };
  titleInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = $('#listaItems').querySelector('input.lista-item-text');
      first?.focus();
    }
  };

  // Items
  renderListaItems(card);

  $('#listaModal').classList.remove('hidden');
  setTimeout(() => {
    // Auto-focus the buffer input so user can start typing immediately
    const buf = $('#listaItems').querySelector('.lista-buffer .lista-item-text');
    buf?.focus();
  }, 50);
}

function renderListaItems(card) {
  const wrap = $('#listaItems');
  wrap.innerHTML = '';
  const items = card.checklist_items || (card.checklist_items = []);
  for (const item of items) {
    wrap.appendChild(makeListaItemRow(card, item, items, wrap));
  }
  wrap.appendChild(makeListaBufferRow(card, items, wrap));
}

function makeListaItemRow(card, item, items, wrap) {
  const row = document.createElement('div');
  row.className = 'lista-row' + (item.completed ? ' is-done' : '');
  row.dataset.itemId = item.id;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'lista-check';
  cb.checked = !!item.completed;
  cb.addEventListener('change', async () => {
    const next = cb.checked;
    item.completed = next ? 1 : 0;
    row.classList.toggle('is-done', next);
    try {
      await api.patch(`/api/checklist/${item.id}`, { completed: next });
    } catch {
      cb.checked = !next;
      item.completed = next ? 0 : 1;
      row.classList.toggle('is-done', !next);
    }
  });
  row.appendChild(cb);

  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'lista-item-text';
  text.value = item.text;
  text.maxLength = 500;

  text.addEventListener('blur', async () => {
    const next = text.value.trim();
    if (!next) {
      // Cleared on blur → delete the item
      try {
        await api.delete(`/api/checklist/${item.id}`);
        const idx = items.findIndex(i => i.id === item.id);
        if (idx >= 0) items.splice(idx, 1);
        row.remove();
      } catch {
        text.value = item.text;
      }
      return;
    }
    if (next === item.text) return;
    try {
      await api.patch(`/api/checklist/${item.id}`, { text: next });
      item.text = next;
    } catch {
      text.value = item.text;
    }
  });
  text.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextTextEl = row.nextElementSibling?.querySelector('.lista-item-text');
      nextTextEl?.focus();
    } else if (e.key === 'Backspace' && text.value === '') {
      e.preventDefault();
      const prev = row.previousElementSibling?.querySelector('.lista-item-text');
      try {
        await api.delete(`/api/checklist/${item.id}`);
        const idx = items.findIndex(i => i.id === item.id);
        if (idx >= 0) items.splice(idx, 1);
        row.remove();
        prev?.focus();
      } catch {}
    }
  });
  row.appendChild(text);

  return row;
}

function makeListaBufferRow(card, items, wrap) {
  const row = document.createElement('div');
  row.className = 'lista-row lista-buffer';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'lista-check';
  cb.disabled = true;
  cb.tabIndex = -1;
  row.appendChild(cb);

  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'lista-item-text';
  text.placeholder = 'Adicionar item...';
  text.maxLength = 500;

  const submit = async () => {
    const txt = text.value.trim();
    if (!txt) return null;
    try {
      const created = await api.post(`/api/cards/${card.id}/checklist`, { text: txt });
      if (!card.checklist_items) card.checklist_items = [];
      card.checklist_items.push(created);
      items.push(created);
      const newRow = makeListaItemRow(card, created, items, wrap);
      wrap.insertBefore(newRow, row);
      text.value = '';
      return created;
    } catch {
      return null;
    }
  };

  text.addEventListener('blur', submit);
  text.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const created = await submit();
      if (created) text.focus();
    } else if (e.key === 'Backspace' && text.value === '') {
      const prev = row.previousElementSibling?.querySelector('.lista-item-text');
      if (prev) {
        e.preventDefault();
        prev.focus();
      }
    }
  });
  row.appendChild(text);

  return row;
}

async function closeListaView() {
  // Force any focused input to commit (blur) before closing
  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    document.activeElement.blur();
  }
  $('#listaModal').classList.add('hidden');
  // Reload the board so card preview reflects any changes
  if (state.currentBoardId) await loadBoard(state.currentBoardId);
  state.listaCard = null;
}

async function deleteListaCard() {
  const card = state.listaCard;
  if (!card) return;
  if (!confirm(`Excluir a lista "${card.title}"?`)) return;
  try {
    await api.delete(`/api/cards/${card.id}`);
    $('#listaModal').classList.add('hidden');
    state.listaCard = null;
    await loadBoard(state.currentBoardId);
  } catch {
    alert('Falha ao excluir.');
  }
}

// ============ WIZARD: NEW BOARD ============
const LIST_PRESETS = {
  kanban: ['A Fazer', 'Em Andamento', 'Concluído'],
  status: ['Pendente', 'Em Progresso', 'Em Revisão', 'Feito'],
  sprint: ['Backlog', 'Esta Semana', 'Hoje', 'Concluído'],
  custom: [],
};

function openWizard() {
  state.wizardStep = 1;
  state.wizardData = {};
  $('#wizBoardName').value = '';
  $('#wizBoardColor').value = '#0079bf';
  $$('input[name="listPreset"]').forEach(r => r.checked = r.value === 'kanban');
  $('#wizCustomLists').value = '';
  $('#customListsArea').classList.add('hidden');
  $$('input[name="defaultView"]').forEach(r => r.checked = r.value === 'kanban');
  $('#wizInitialTasks').value = '';
  showWizardStep(1);
  $('#wizardModal').classList.remove('hidden');
  setTimeout(() => $('#wizBoardName').focus(), 50);
}

function showWizardStep(n) {
  state.wizardStep = n;
  $$('.wizard-step').forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === n));
  $$('.step-dot').forEach(d => {
    const dn = parseInt(d.dataset.stepDot);
    d.classList.toggle('active', dn === n);
    d.classList.toggle('done', dn < n);
  });
  $('#wizPrevBtn').style.visibility = n === 1 ? 'hidden' : '';
  $('#wizNextBtn').classList.toggle('hidden', n === 4);
  $('#wizFinishBtn').classList.toggle('hidden', n !== 4);
}

function wizardNext() {
  if (state.wizardStep === 1) {
    const name = $('#wizBoardName').value.trim();
    if (!name) { $('#wizBoardName').focus(); return; }
    state.wizardData.name = name;
    state.wizardData.color = $('#wizBoardColor').value;
  }
  if (state.wizardStep === 2) {
    const preset = $$('input[name="listPreset"]:checked')[0].value;
    let lists = LIST_PRESETS[preset];
    if (preset === 'custom') {
      lists = $('#wizCustomLists').value.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lists.length) { alert('Adicione pelo menos uma lista.'); return; }
    }
    state.wizardData.lists = lists;
  }
  if (state.wizardStep === 3) {
    state.wizardData.view = $$('input[name="defaultView"]:checked')[0].value;
  }
  if (state.wizardStep < 4) showWizardStep(state.wizardStep + 1);
}

function wizardPrev() {
  if (state.wizardStep > 1) showWizardStep(state.wizardStep - 1);
}

async function wizardFinish() {
  state.wizardData.tasks = $('#wizInitialTasks').value.split('\n').map(t => t.trim()).filter(Boolean);

  const board = await api.post('/api/boards', { title: state.wizardData.name, color: state.wizardData.color });

  // Create lists
  const createdLists = [];
  for (const listName of state.wizardData.lists) {
    const l = await api.post('/api/lists', { board_id: board.id, title: listName });
    createdLists.push(l);
  }

  // Add initial tasks to first list
  if (createdLists.length && state.wizardData.tasks.length) {
    for (const task of state.wizardData.tasks) {
      await api.post('/api/cards', { list_id: createdLists[0].id, title: task });
    }
  }

  closeAllModals();
  await loadBoards();
  await loadBoard(board.id);
  switchView(state.wizardData.view);
}

// ============ MEMBERS MODAL ============
async function openMembersModal() {
  if (!state.currentBoard) return;
  $('#membersModal').classList.remove('hidden');
  $('#inviteLinkArea').classList.add('hidden');
  const canManage = state.currentBoard.role === 'owner' || state.currentBoard.role === 'admin';
  $('#generateInviteBtn').disabled = !canManage;
  $('#inviteRoleSelect').disabled = !canManage;
  await renderMembersList();
}

async function renderMembersList() {
  const list = $('#membersList');
  list.innerHTML = '<p class="muted-small">Carregando...</p>';
  const members = await api.get(`/api/boards/${state.currentBoardId}/members`);
  list.innerHTML = '';
  const canManage = state.currentBoard.role === 'owner' || state.currentBoard.role === 'admin';

  for (const m of members) {
    const row = document.createElement('div');
    row.className = 'member-row';

    // m.role comes from the server-validated set ['owner','admin','membro'],
    // but escape anyway as defense-in-depth in case validation regresses.
    const safeRole = ['owner','admin','membro'].includes(m.role) ? m.role : 'membro';
    const roleControl = (safeRole === 'owner' || !canManage)
      ? `<span class="member-role-badge ${safeRole}">${safeRole}</span>`
      : `<select data-role-for="${parseInt(m.id) || 0}">
          <option value="membro" ${safeRole === 'membro' ? 'selected' : ''}>Membro</option>
          <option value="admin"  ${safeRole === 'admin'  ? 'selected' : ''}>Admin</option>
        </select>`;

    const removeBtn = (safeRole !== 'owner' && canManage && m.id !== state.user.id)
      ? `<button class="remove-member-btn" data-remove="${parseInt(m.id) || 0}" title="Remover">×</button>`
      : '';

    row.innerHTML = `
      <span class="user-avatar">${avatarImg(m.email, 32, m.name)}</span>
      <div class="member-info">
        <strong>${escapeHtml(m.name)}${m.id === state.user.id ? ' (você)' : ''}</strong>
        <small>${escapeHtml(m.email)}</small>
      </div>
      ${roleControl}
      ${removeBtn}
    `;

    const sel = row.querySelector('select[data-role-for]');
    if (sel) sel.addEventListener('change', async () => {
      await api.put(`/api/boards/${state.currentBoardId}/members/${m.id}`, { role: sel.value });
      await renderMembersList();
    });

    const rm = row.querySelector('[data-remove]');
    if (rm) rm.addEventListener('click', async () => {
      if (!confirm(`Remover ${m.name} do quadro?`)) return;
      await api.delete(`/api/boards/${state.currentBoardId}/members/${m.id}`);
      await renderMembersList();
    });

    list.appendChild(row);
  }
}

async function generateInvite() {
  const role = $('#inviteRoleSelect').value;
  const inv = await api.post(`/api/boards/${state.currentBoardId}/invites`, { role });
  if (!inv.token) return;
  const link = `${window.location.origin}/?invite=${inv.token}`;
  $('#inviteLinkInput').value = link;
  $('#inviteLinkArea').classList.remove('hidden');
}

function copyInviteLink() {
  const input = $('#inviteLinkInput');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = $('#copyInviteBtn');
    const orig = btn.textContent;
    btn.textContent = '✅ Copiado!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

// ============ LIST OPS ============
async function addList() {
  const title = prompt('Nome da nova lista:');
  if (!title?.trim()) return;
  await api.post('/api/lists', { board_id: state.currentBoardId, title: title.trim() });
  await loadBoard(state.currentBoardId);
}

// ============ HELPERS ============
function matchesSearch(card) {
  // Text search
  if (state.searchTerm) {
    const t = state.searchTerm.toLowerCase();
    const hit = (card.title || '').toLowerCase().includes(t)
             || (card.description || '').toLowerCase().includes(t)
             || (card.assignee || '').toLowerCase().includes(t);
    if (!hit) return false;
  }
  // Filters
  const f = state.filters;
  if (f.category && card.category !== f.category) return false;
  if (f.priority && card.priority !== f.priority) return false;
  if (f.assignee && !(card.assignee || '').toLowerCase().includes(f.assignee.toLowerCase())) return false;
  if (f.due) {
    if (!card.due_date) return false;
    const today = new Date(new Date().toDateString());
    const due = new Date(card.due_date);
    if (f.due === 'overdue' && !(due < today)) return false;
    if (f.due === 'today'   && due.getTime() !== today.getTime()) return false;
    if (f.due === 'week') {
      const week = new Date(today); week.setDate(week.getDate() + 7);
      if (!(due >= today && due <= week)) return false;
    }
  }
  return true;
}

function activeFilterCount() {
  const f = state.filters;
  return ['category','priority','assignee','due'].filter(k => f[k]).length;
}

function refreshFilterUI() {
  const n = activeFilterCount();
  const badge = $('#filtersCount');
  if (!badge) return;
  if (n > 0) { badge.textContent = String(n); badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

function isOverdue(dateStr) {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function formatDate(dateStr) {
  // Defense-in-depth: only accept strict YYYY-MM-DD; anything else returns "—"
  // so output is never controlled by attacker-supplied content.
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const ALLOWED_PRIORITIES = new Set(['baixa', 'media', 'alta']);
function safePriority(p) { return ALLOWED_PRIORITIES.has(p) ? p : 'media'; }

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function closeAllModals() {
  $$('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  $('#columnsMenu')?.classList.add('hidden');
}

// ============ BUG REPORT ============
function openBugModal() {
  $('#bugDescription').value = '';
  const status = $('#bugStatus');
  status.classList.add('hidden');
  status.textContent = '';
  status.classList.remove('error', 'success');
  $('#bugSubmitBtn').disabled = false;
  $('#bugSubmitBtn').textContent = 'Enviar';
  $('#bugModal').classList.remove('hidden');
  setTimeout(() => $('#bugDescription').focus(), 50);
}

async function submitBugReport(e) {
  e.preventDefault();
  const description = $('#bugDescription').value.trim();
  const status = $('#bugStatus');
  const submitBtn = $('#bugSubmitBtn');

  if (!description) return;

  status.classList.remove('hidden', 'error', 'success');
  status.textContent = 'Enviando...';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  try {
    const res = await request('/api/report-bug', {
      method: 'POST',
      body: JSON.stringify({ description, url: location.href }),
    });
    if (res.ok) {
      status.classList.add('success');
      status.textContent = '✓ Bug enviado, obrigado pelo feedback!';
      submitBtn.textContent = 'Enviado';
      setTimeout(closeAllModals, 1800);
    } else {
      const data = await res.json().catch(() => ({}));
      status.classList.add('error');
      status.textContent = data.error || 'Erro ao enviar. Tente novamente.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
    }
  } catch (err) {
    status.classList.add('error');
    status.textContent = 'Falha de conexão. Tente novamente.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar';
  }
}

// ============ WHAT'S NEW ============
const SEEN_VERSION_KEY = 'mt_last_seen_version';

async function checkWhatsNew() {
  try {
    const res = await request('/api/version');
    if (!res.ok) return;
    const { current, releases } = await res.json();
    if (!current || !Array.isArray(releases) || releases.length === 0) return;

    // Surface the version in the sidebar (under the "Reportar bug" button)
    const versionEl = $('#sidebarVersion');
    if (versionEl) versionEl.textContent = `v${current}`;

    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    // First-time visitor: silently mark current as seen, don't bother them.
    if (!seen) {
      localStorage.setItem(SEEN_VERSION_KEY, current);
      return;
    }
    // Already saw this version: nothing to show.
    if (seen === current) return;

    // Otherwise show ONLY the latest release. We don't backfill older releases
    // they might have missed — keeps the modal short and never repetitive.
    showWhatsNewModal(current, [releases[0]]);
  } catch (err) {
    // Silent failure — version check is best-effort, never blocks the app.
    console.warn('Falha ao checar novidades', err);
  }
}

function showWhatsNewModal(current, newReleases) {
  $('#whatsNewVersion').textContent = `v${current}`;
  const html = newReleases.map(r => `
    <div class="whats-new-release">
      <strong>v${escapeHtml(r.version)}</strong>${r.date ? ` <span class="whats-new-date">— ${escapeHtml(r.date)}</span>` : ''}
      <ul class="whats-new-list">
        ${r.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
  $('#whatsNewContent').innerHTML = html;

  // Mark as seen no matter HOW the modal is dismissed (OK button, X close,
  // backdrop click). We attach once per show; the listeners pull from the DOM.
  const markSeen = () => localStorage.setItem(SEEN_VERSION_KEY, current);
  const modal = $('#whatsNewModal');
  modal.classList.remove('hidden');

  $('#whatsNewOkBtn').onclick = () => { markSeen(); closeAllModals(); };
  modal.querySelector('.modal-close').onclick = () => { markSeen(); closeAllModals(); };
  modal.onclick = (e) => {
    // Click on the backdrop (outside .modal) also dismisses + marks seen
    if (e.target === modal) { markSeen(); closeAllModals(); }
  };
}

// ============ SETTINGS ============
function renderSettings() {
  // Reflect persisted state in the form controls
  applySettings();
}

function applySettings() {
  const s = state.settings;
  const root = document.documentElement;

  // Theme (resolve 'system' to actual preference)
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const actual = s.theme === 'system' ? (sysDark ? 'dark' : 'light') : s.theme;
  root.setAttribute('data-theme', actual);

  // Primary color tokens
  root.style.setProperty('--color-primary', s.primaryColor);
  root.style.setProperty('--color-primary-hover', darkenHex(s.primaryColor, 15));
  root.style.setProperty('--color-primary-soft', `rgba(${hexToRgb(s.primaryColor)}, 0.10)`);

  // Compact + contrast
  root.setAttribute('data-compact', s.compact ? 'true' : 'false');
  root.setAttribute('data-contrast', s.contrast === 'high' ? 'high' : 'normal');

  // Reflect in form controls (if rendered)
  const themeRadio = document.querySelector(`input[name="theme"][value="${s.theme}"]`);
  if (themeRadio) themeRadio.checked = true;
  const colorInput = $('#primaryColorHex');
  if (colorInput) colorInput.value = s.primaryColor.toUpperCase();
  $$('.color-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color.toLowerCase() === s.primaryColor.toLowerCase());
  });
  const compact = $('#compactToggle');     if (compact) compact.checked = s.compact;
  const showIds = $('#showIdsToggle');     if (showIds) showIds.checked = s.showIds;
  const contrast = $('#contrastToggle');   if (contrast) contrast.checked = s.contrast === 'high';
}

function updateSetting(patch) {
  Object.assign(state.settings, patch);
  saveSettings();
  applySettings();
  // Some settings (compact, showIds) affect rendering of cards
  if ('compact' in patch || 'showIds' in patch) {
    if (state.view !== 'settings') renderCurrentView();
  }
}

function darkenHex(hex, percent) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const f = 1 - percent / 100;
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * f);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * f);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * f);
  return '#' + [r, g, b].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '0,82,204';
  return `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
}

// ============ MOBILE: SIDEBAR DRAWER + FAB ============
function openSidebar()  { $('#sidebar').classList.add('open'); $('#sidebarOverlay').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarOverlay').classList.remove('show'); }

function fabAction() {
  // FAB opens a new card on the first list of the current board
  if (!state.currentBoard) return openWizard();
  const firstList = state.currentBoard.lists[0];
  if (firstList) openCardModal(null, firstList.id);
  else addList();
}

// ============ EVENTS ============
let _appListenersDone = false;
function setupEventListeners() {
  if (_appListenersDone) return;
  _appListenersDone = true;
  $('#newBoardBtn').addEventListener('click', openWizard);

  $$('.view-tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  $('#searchInput').addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    renderCurrentView();
  });

  // Card modal
  $('#cardForm').addEventListener('submit', saveCard);
  $('#cardDeleteBtn').addEventListener('click', deleteCard);

  // Checklist (event delegation on the list — items are dynamic)
  $('#checklistList').addEventListener('click', (e) => {
    const li = e.target.closest('.checklist-item');
    if (!li) return;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const itemId = parseInt(li.dataset.itemId);
    if (action === 'toggle') checklistToggleItem(itemId);
    else if (action === 'edit')   checklistEditItem(itemId);
    else if (action === 'delete') checklistDeleteItem(itemId);
    else if (action === 'up')     checklistMoveItem(itemId, -1);
    else if (action === 'down')   checklistMoveItem(itemId, +1);
  });
  $('#checklistAddBtn').addEventListener('click', () => {
    $('#checklistInputRow').classList.remove('hidden');
    $('#checklistInput').focus();
  });
  // Submit via button OR Enter key (we can't use a real <form> here because
  // this row sits inside the card modal's <form>, and forms can't nest).
  const checklistConfirm = async () => {
    const input = $('#checklistInput');
    const text = input.value.trim();
    if (!text) return;
    await checklistAddItem(text);
    input.value = '';
    input.focus();
  };
  $('#checklistConfirmBtn').addEventListener('click', checklistConfirm);
  $('#checklistInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      checklistConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      $('#checklistInput').value = '';
      $('#checklistInputRow').classList.add('hidden');
    }
  });
  $('#checklistCancelBtn').addEventListener('click', () => {
    $('#checklistInput').value = '';
    $('#checklistInputRow').classList.add('hidden');
  });

  // Lista modal (dedicated lista view, separate from Editar Card)
  $$('[data-close-lista]').forEach(b => b.addEventListener('click', closeListaView));
  $('#listaDeleteCardBtn').addEventListener('click', deleteListaCard);

  // Board ops
  $('#renameBoardBtn').addEventListener('click', async () => {
    const newTitle = prompt('Novo nome do quadro:', state.currentBoard.title);
    if (!newTitle?.trim()) return;
    await api.put(`/api/boards/${state.currentBoardId}`, { title: newTitle.trim() });
    await loadBoards();
    await loadBoard(state.currentBoardId);
  });

  $('#deleteBoardBtn').addEventListener('click', async () => {
    if (!state.currentBoard) return;
    if (!confirm(`Excluir "${state.currentBoard.title}" e todo seu conteúdo?`)) return;
    await api.delete(`/api/boards/${state.currentBoardId}`);
    state.currentBoardId = null;
    state.currentBoard = null;
    await loadBoards();
    if (state.boards.length) await loadBoard(state.boards[0].id);
    else { $('#boardTitle').textContent = 'Crie um quadro para começar'; $('#listsContainer').innerHTML = ''; }
  });

  // Wizard
  $('#wizNextBtn').addEventListener('click', wizardNext);
  $('#wizPrevBtn').addEventListener('click', wizardPrev);
  $('#wizFinishBtn').addEventListener('click', wizardFinish);
  $$('input[name="listPreset"]').forEach(r => r.addEventListener('change', () => {
    const checked = $('input[name="listPreset"]:checked').value;
    $('#customListsArea').classList.toggle('hidden', checked !== 'custom');
  }));
  $$('[data-close-wizard]').forEach(b => b.addEventListener('click', () => $('#wizardModal').classList.add('hidden')));

  // Column toggle (table view)
  $('#columnsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#columnsMenu').classList.toggle('hidden');
  });
  $$('#columnsMenu input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.visibleCols[cb.dataset.col] = cb.checked;
      renderTable();
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.column-toggle')) $('#columnsMenu')?.classList.add('hidden');
  });

  // Calendar nav
  $('#prevMonthBtn').addEventListener('click', () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#nextMonthBtn').addEventListener('click', () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
    renderCalendar();
  });
  $('#todayBtn').addEventListener('click', () => {
    state.calendarDate = new Date();
    renderCalendar();
  });

  // Board "more" menu (⋮) — Renomear / Excluir
  $('#boardMoreBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#boardMoreMenu').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.board-more')) $('#boardMoreMenu')?.classList.add('hidden');
  });

  // Members modal
  $('#membersBtn').addEventListener('click', openMembersModal);
  $('#generateInviteBtn').addEventListener('click', generateInvite);
  $('#copyInviteBtn').addEventListener('click', copyInviteLink);

  // Filters dropdown
  $('#filtersBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#filtersMenu').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filters-wrap')) $('#filtersMenu')?.classList.add('hidden');
  });
  for (const [id, key] of [['filterCategory','category'],['filterPriority','priority'],['filterDue','due']]) {
    $('#'+id).addEventListener('change', (e) => { state.filters[key] = e.target.value; refreshFilterUI(); renderCurrentView(); });
  }
  $('#filterAssignee').addEventListener('input', (e) => { state.filters.assignee = e.target.value; refreshFilterUI(); renderCurrentView(); });
  $('#filtersClearBtn').addEventListener('click', () => {
    state.filters = { category:'', priority:'', assignee:'', due:'' };
    $('#filterCategory').value = ''; $('#filterPriority').value = ''; $('#filterAssignee').value = ''; $('#filterDue').value = '';
    refreshFilterUI();
    renderCurrentView();
  });

  // User menu
  $('#userMenuBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#userMenuDropdown').classList.toggle('hidden');
  });
  $('#logoutBtn').addEventListener('click', doLogout);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) $('#userMenuDropdown')?.classList.add('hidden');
  });

  // Bottom nav (mobile) — for workspace-level views (settings/activity/analytics),
  // re-tapping an active item returns the user to their last per-board view.
  $$('.bottom-nav-item').forEach(t => t.addEventListener('click', () => {
    const target = t.dataset.view;
    if (state.view === target && WORKSPACE_VIEWS.has(target)) {
      switchView(state.lastBoardView || 'kanban');
    } else {
      switchView(target);
    }
  }));

  // Workspace nav (sidebar) — same toggle behavior. Skip action buttons that
  // don't have a data-view (e.g. "Reportar bug" opens a modal instead).
  $$('.ws-nav-item').forEach(t => t.addEventListener('click', () => {
    const target = t.dataset.view;
    if (!target) return;
    if (state.view === target && WORKSPACE_VIEWS.has(target)) {
      switchView(state.lastBoardView || 'kanban');
    } else {
      switchView(target);
    }
  }));

  // Bug report modal
  $('#reportBugBtn')?.addEventListener('click', openBugModal);
  $('#bugForm')?.addEventListener('submit', submitBugReport);

  // Refresh button on Activity view
  $('#refreshActivityBtn')?.addEventListener('click', renderActivity);

  // Topbar gear icon — toggles Settings (clicking again returns to your board)
  $('#settingsBtn').addEventListener('click', () => {
    if (state.view === 'settings') switchView(state.lastBoardView || 'kanban');
    else switchView('settings');
  });

  // Hamburger drawer (mobile)
  $('#hamburgerBtn').addEventListener('click', () => {
    if ($('#sidebar').classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  $('#sidebarOverlay').addEventListener('click', closeSidebar);

  // FAB (mobile)
  $('#fab').addEventListener('click', fabAction);

  // Settings controls
  $$('input[name="theme"]').forEach(r => r.addEventListener('change', () => updateSetting({ theme: r.value })));
  $$('.color-swatch').forEach(sw => sw.addEventListener('click', () => updateSetting({ primaryColor: sw.dataset.color })));
  $('#primaryColorHex').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) updateSetting({ primaryColor: v });
    else applySettings(); // revert
  });
  $('#compactToggle').addEventListener('change', (e) => updateSetting({ compact: e.target.checked }));
  $('#showIdsToggle').addEventListener('change', (e) => updateSetting({ showIds: e.target.checked }));
  $('#contrastToggle').addEventListener('change', (e) => updateSetting({ contrast: e.target.checked ? 'high' : 'normal' }));

  // Listen for system theme changes when user picked 'system'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') applySettings();
  });

  // Generic modal close
  $$('[data-close]').forEach(b => b.addEventListener('click', closeAllModals));
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', (e) => { if (e.target === bd) closeAllModals(); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
}

// Register service worker so the app is installable as a PWA + works
// (partially) offline. Only runs over HTTPS or on localhost.
//
// Update strategy: when a new SW takes control of an *existing* page (i.e.
// the user already had a SW installed), reload once so the freshly-cached
// shell loads. This avoids the "stuck on old version" problem on devices
// where the user installed the PWA before a deploy.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Snapshot whether there was already a controller. If yes, any later
      // controllerchange means we just got an update — safe to reload. If
      // no, this is a first install on a fresh device and reloading would
      // be a wasteful flicker.
      const hadController = Boolean(navigator.serviceWorker.controller);
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !hadController) return;
        refreshing = true;
        window.location.reload();
      });

      // Force an explicit update check on every page load. Combined with
      // Cache-Control: no-store on /sw.js (set by the server), this turns
      // the browser's normally-lazy 24h SW revalidation into "always check".
      reg.update().catch(() => { /* offline is fine */ });
    } catch (err) {
      console.warn('[sw] registration failed:', err);
    }
  });
}

bootAuth();
