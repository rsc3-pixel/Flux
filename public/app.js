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
  flags: {},                          // { key: {enabled, message} } from /api/flags
  finance: {                          // financial module — populated when view opens
    categories: [],
    transactions: [],
    monthYM: null,                    // 'YYYY-MM' currently shown
    filterType: '',                   // '' | 'income' | 'expense'
    filterCategory: '',               // '' | category id
    editingId: null,
    editingType: 'expense',
  },
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
  'dollar-sign':       '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
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
  'help-circle':       '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
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
  'conta-a-pagar': { label: '💸 CONTA A PAGAR', color: '#DB2777' },
};

// Returns {label, color} for the card's category pill, or null if no category.
// Custom category (per-card label+color) takes priority over the whitelist.
function cardCategoryPill(card) {
  if (card.custom_category_label && card.custom_category_color) {
    return { label: card.custom_category_label.toUpperCase(), color: card.custom_category_color };
  }
  if (card.category && CATEGORIES[card.category]) return CATEGORIES[card.category];
  return null;
}

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

// Feature flag helpers. flagEnabled() defaults to true if a flag isn't loaded
// yet (or fails to load) — fail-OPEN is intentional: a network blip shouldn't
// hide working features for the user. To force-disable, the owner has to
// actively set enabled=false in the admin panel.
function flagEnabled(key) {
  const f = state.flags?.[key];
  return f === undefined || f.enabled !== false;
}
function flagMessage(key) {
  return state.flags?.[key]?.message || '';
}
async function loadFlags() {
  try { state.flags = await api.get('/api/flags'); }
  catch { state.flags = {}; /* fail-open: features stay visible */ }
}

// Whether the current user can interact with the finance module — owner
// always; non-owners only when the 'financial' flag is on. Used to gate
// the kanban-side bridge (category 'conta-a-pagar', mark-paid button, etc)
// so non-owners don't create finance state they can't see anywhere. Server
// enforces the same rule with userHasFinanceAccess().
function hasFinanceAccess() {
  return flagEnabled('financial') || isOwnerEffective();
}

// Same owner-gate as finance, applied to the recurring-cards feature.
function hasRecurringAccess() {
  return flagEnabled('recurring_cards') || isOwnerEffective();
}

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
  // Load feature flags before first render so the UI knows which features
  // to hide. Doesn't block the user — fail-open if it errors.
  await loadFlags();
  applyFeatureFlags();
  applyPreviewBanner();
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
  // Welcome must run BEFORE checkWhatsNew — both share `mt_last_seen_version`
  // as the "existing user" signal, and checkWhatsNew sets it silently on
  // first-ever load, which would otherwise mask brand-new users from seeing
  // the welcome.
  checkWelcomeModal();
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

  // Honor server-side registration lock: hide the "Criar conta" tab when off,
  // EXCEPT when the user arrived via an invite link — in that case the server
  // will let them register if their email matches the invite's whitelist, so
  // we must keep the tab visible.
  try {
    const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
    const regTab = document.querySelector('.auth-tab[data-auth-tab="register"]');
    const allowViaInvite = !!state.pendingInviteToken;
    const showRegister = cfg.registrationEnabled !== false || allowViaInvite;
    if (regTab) regTab.style.display = showRegister ? '' : 'none';
    if (!showRegister) {
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

// Preview mode: when an owner clicks "Entrar em modo preview" in the admin
// panel, we set this localStorage flag and treat them as a regular user (the
// "Admin" sidebar button hides, feature flags apply normally). To exit, the
// user clicks the persistent yellow banner at the top — see #previewBanner.
const PREVIEW_KEY = 'mt_preview_mode';
function isPreviewMode() { return localStorage.getItem(PREVIEW_KEY) === 'true'; }
function setPreviewMode(on) {
  if (on) localStorage.setItem(PREVIEW_KEY, 'true');
  else    localStorage.removeItem(PREVIEW_KEY);
}
// "Effective" owner = real owner AND not in preview. Use this everywhere a
// UI surface should hide for non-owners.
function isOwnerEffective() {
  return !!state.user?.is_owner && !isPreviewMode();
}

// Show/hide the persistent yellow banner that lets the owner exit preview.
// Only renders when the user IS a real owner AND preview is on — defensive
// against a non-owner ending up with the localStorage flag set somehow.
function applyPreviewBanner() {
  const banner = document.getElementById('previewBanner');
  if (!banner) return;
  const visible = !!state.user?.is_owner && isPreviewMode();
  banner.classList.toggle('hidden', !visible);
  // body padding-top so the fixed banner doesn't cover the topbar
  document.body.classList.toggle('preview-on', visible);
}

// Activate preview mode and reload so all visibility decisions re-run from a
// clean slate (renderUserMenu, applyFeatureFlags, etc).
function enterPreview() {
  setPreviewMode(true);
  location.reload();
}
function exitPreview() {
  setPreviewMode(false);
  location.reload();
}

// Apply feature flags to the UI. Called once after loadFlags() during boot,
// and again whenever the owner toggles a flag from the admin panel.
function applyFeatureFlags() {
  // 'report_bug' OFF → hide the "Reportar bug" button in the sidebar
  const bugBtn = document.getElementById('reportBugBtn');
  if (bugBtn) bugBtn.classList.toggle('hidden', !flagEnabled('report_bug'));
  // 'financial' visibility:
  //   - flag ON  → all users see it
  //   - flag OFF → only the real owner sees it (in-development override)
  //   - preview mode → respects the flag like a regular user (so owner can
  //     QA exactly what others see). isOwnerEffective() returns false in preview.
  // Server enforces the same rule: requireFinancialFlag lets owners through
  // regardless of the flag state.
  const finBtn = document.getElementById('financialNavBtn');
  const finVisible = flagEnabled('financial') || isOwnerEffective();
  if (finBtn) finBtn.classList.toggle('hidden', !finVisible);
}

function renderUserMenu() {
  if (!state.user) return;
  const seed = state.user.email || state.user.name;
  $('#userAvatar').innerHTML = avatarImg(seed, 32, state.user.name);
  $('#userMenuName').textContent = state.user.name.split(/\s+/)[0];
  $('#userMenuFullName').textContent = state.user.name;
  $('#userMenuEmail').textContent = state.user.email;
  // Reveal the "Admin" sidebar button only for OWNERS WHO AREN'T IN PREVIEW
  // MODE. Defense-in-depth: server still blocks /api/admin/* with 404 for
  // non-owners. In preview mode, the real owner stops seeing this button so
  // the experience matches a regular user's.
  const adminBtn = $('#adminNavBtn');
  if (adminBtn) adminBtn.classList.toggle('hidden', !isOwnerEffective());
}

// Friendly labels for known flags. Unknown flags fall back to the raw key —
// so adding a new flag in the DB Just Works even before this map updates.
const FLAG_META = {
  report_bug:        { label: 'Reportar bug',        desc: 'Botão "Reportar bug" na sidebar (envia email via Resend)' },
  invites:           { label: 'Convites de membros', desc: 'Permite gerar links de convite no modal Membros do quadro' },
  financial:         { label: 'Módulo financeiro',   desc: 'View "Finanças" para acompanhar contas e transações (em construção)' },
  registration_open: { label: 'Cadastros abertos',   desc: 'Quando ON, qualquer pessoa pode criar conta na tela de login. Quando OFF, novos usuários só entram via convite com email na whitelist.' },
  recurring_cards:   { label: 'Cards recorrentes',   desc: 'Permite marcar um card pra repetir todo mês — gera N cópias futuras com a mesma data deslocada (luz, água, mensalidades, plantão fixo). Owner sempre vê.' },
};

async function renderAdmin() {
  const root = $('#adminContent');
  if (!root) return;
  root.innerHTML = '<p class="muted-small">Carregando...</p>';
  try {
    const [flags, users] = await Promise.all([
      api.get('/api/admin/flags'),
      api.get('/api/admin/users'),
    ]);
    root.innerHTML = `
      <div class="dashboard-widget">
        <h3>Modo preview</h3>
        <p class="muted-small">Veja o app exatamente como um usuário comum vê — sem o botão Admin, com as feature flags aplicadas. Útil pra validar mudanças antes de liberar pra outros. Você sai pelo banner amarelo no topo.</p>
        <button type="button" class="btn btn-primary" id="adminEnterPreviewBtn">Entrar em modo preview</button>
      </div>
      <div class="dashboard-widget">
        <h3>Feature flags</h3>
        <p class="muted-small">Liga/desliga módulos sem precisar de deploy. A mensagem opcional aparece no lugar da feature pros usuários quando ela está desligada.</p>
        <div class="admin-flags-list" id="adminFlagsList"></div>
      </div>
      <div class="dashboard-widget">
        <h3>Usuários (${users.length})</h3>
        <p class="muted-small">Substituí o uso de <code>npm run list-users</code> na VM. Suspender bloqueia login mas não apaga dados.</p>
        <input type="search" id="adminUsersSearch" placeholder="Filtrar por email ou nome..." class="admin-users-search" />
        <div id="adminUsersList" class="admin-users-list"></div>
      </div>
    `;
    renderAdminFlags(flags);
    renderAdminUsers(users);
    $('#adminUsersSearch').addEventListener('input', (e) => {
      renderAdminUsers(users, e.target.value.trim().toLowerCase());
    });
    $('#adminEnterPreviewBtn').addEventListener('click', enterPreview);
  } catch {
    root.innerHTML = '<p class="muted-small" style="color: var(--color-danger);">Sem acesso ao painel admin.</p>';
  }
}

function renderAdminUsers(users, filter = '') {
  const wrap = $('#adminUsersList');
  if (!wrap) return;
  wrap.innerHTML = '';
  const filtered = filter
    ? users.filter(u => u.email.toLowerCase().includes(filter) || (u.name || '').toLowerCase().includes(filter))
    : users;
  if (filtered.length === 0) {
    wrap.innerHTML = '<p class="muted-small">Nenhum usuário encontrado.</p>';
    return;
  }
  for (const u of filtered) {
    const row = document.createElement('div');
    row.className = 'admin-user-row' + (u.suspended_at ? ' suspended' : '');
    const isMe = u.id === state.user?.id;
    const lastSeen = u.last_seen ? formatRelativeTime(u.last_seen) : 'nunca';
    const tags = [
      u.is_owner ? '<span class="admin-user-tag owner">owner</span>' : '',
      u.suspended_at ? '<span class="admin-user-tag suspended">suspenso</span>' : '',
      isMe ? '<span class="admin-user-tag self">você</span>' : '',
    ].filter(Boolean).join('');

    // Owner can't suspend/delete themselves nor other owners (server enforces too).
    const canMutate = !isMe && !u.is_owner;
    const suspendBtn = canMutate
      ? (u.suspended_at
          ? `<button class="btn btn-ghost" data-action="reactivate">Reativar</button>`
          : `<button class="btn btn-ghost" data-action="suspend">Suspender</button>`)
      : '';
    const deleteBtn = canMutate
      ? `<button class="btn btn-ghost btn-danger-ghost" data-action="delete">Excluir</button>`
      : '';
    const action = suspendBtn + deleteBtn;

    row.innerHTML = `
      <div class="admin-user-avatar">${avatarImg(u.email, 36, u.name)}</div>
      <div class="admin-user-info">
        <div class="admin-user-name"><strong>${escapeHtml(u.name || '(sem nome)')}</strong> ${tags}</div>
        <div class="admin-user-email">${escapeHtml(u.email)}</div>
        <div class="admin-user-stats">
          ${u.boards_owned} quadro(s) próprio(s) · ${u.boards_member} compartilhado(s) · ${u.cards} card(s) · cadastrado ${formatRelativeTime(u.created_at)} · último acesso ${lastSeen}
        </div>
      </div>
      <div class="admin-user-actions">${action}</div>
    `;
    row.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'delete') openDeleteUserModal(u);
        else                                  toggleSuspend(u, btn.dataset.action);
      });
    });
    wrap.appendChild(row);
  }
}

// State for the in-flight deletion (the user being targeted by the modal)
let _deleteUserTarget = null;

function openDeleteUserModal(user) {
  _deleteUserTarget = user;
  $('#deleteUserSummary').innerHTML = `
    <p>Você está prestes a excluir <strong>${escapeHtml(user.name || user.email)}</strong> (${escapeHtml(user.email)}).</p>
    <p class="muted-small">Vai apagar:</p>
    <ul class="muted-small">
      <li>${user.boards_owned} quadro(s) próprio(s) (com listas, cards, convites)</li>
      <li>${user.boards_member} acesso(s) como membro em quadros de outros</li>
      <li>${user.cards} card(s) em quadros próprios</li>
      <li>Workspace, sessões, atividade e tudo mais relacionado</li>
    </ul>
  `;
  const input = $('#deleteUserConfirm');
  const btn = $('#deleteUserConfirmBtn');
  input.value = '';
  btn.disabled = true;
  $('#deleteUserModal').classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function closeDeleteUserModal() {
  $('#deleteUserModal').classList.add('hidden');
  _deleteUserTarget = null;
}

async function confirmDeleteUser() {
  const u = _deleteUserTarget;
  if (!u) return;
  const input = $('#deleteUserConfirm');
  const btn = $('#deleteUserConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  // The api.delete helper doesn't support a body, so use fetch directly here.
  // The confirm_email in the body is what protects against accidental clicks.
  try {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_email: input.value.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Falha ao excluir usuário.');
      btn.disabled = false;
      btn.textContent = 'Excluir permanentemente';
      return;
    }
    closeDeleteUserModal();
    const fresh = await api.get('/api/admin/users');
    const filter = $('#adminUsersSearch')?.value.trim().toLowerCase() || '';
    renderAdminUsers(fresh, filter);
    // Refresh the user-count in the section header
    const widgetH3 = document.querySelector('#adminContent .dashboard-widget:nth-child(2) h3');
    if (widgetH3) widgetH3.textContent = `Usuários (${fresh.length})`;
  } catch {
    alert('Falha ao excluir usuário (erro de rede). Tenta de novo.');
    btn.disabled = false;
    btn.textContent = 'Excluir permanentemente';
  }
}

async function toggleSuspend(user, action) {
  const suspending = action === 'suspend';
  const confirmMsg = suspending
    ? `Suspender ${user.name || user.email}? Eles vão perder acesso até você reativar.`
    : `Reativar ${user.name || user.email}?`;
  if (!confirm(confirmMsg)) return;
  try {
    await api.patch(`/api/admin/users/${user.id}/suspend`, { suspended: suspending });
    // Re-fetch the list to reflect the change (status, last_seen reset, etc.)
    const fresh = await api.get('/api/admin/users');
    const filter = $('#adminUsersSearch')?.value.trim().toLowerCase() || '';
    renderAdminUsers(fresh, filter);
  } catch {
    alert('Falha ao atualizar suspensão. Tenta de novo.');
  }
}

function renderAdminFlags(flags) {
  const list = $('#adminFlagsList');
  if (!list) return;
  list.innerHTML = '';
  for (const f of flags) {
    const meta = FLAG_META[f.key] || { label: f.key, desc: '' };
    const row = document.createElement('div');
    row.className = 'admin-flag-row';
    const updatedLine = f.updated_at
      ? `<p class="admin-flag-meta">Última edição: ${formatRelativeTime(f.updated_at)}${f.updated_by_name ? ` por ${escapeHtml(f.updated_by_name)}` : ''}</p>`
      : '';
    row.innerHTML = `
      <div class="admin-flag-header">
        <strong>${escapeHtml(meta.label)}</strong>
        <code class="admin-flag-key">${escapeHtml(f.key)}</code>
        <div class="admin-flag-toggle">
          <span class="admin-flag-state">${f.enabled ? 'Ativo' : 'Desligado'}</span>
          <label class="switch">
            <input type="checkbox" ${f.enabled ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
      ${meta.desc ? `<p class="muted-small">${escapeHtml(meta.desc)}</p>` : ''}
      <textarea class="admin-flag-message" placeholder="Mensagem de manutenção (opcional, máx 500 chars)" maxlength="500">${escapeHtml(f.message || '')}</textarea>
      ${updatedLine}
    `;
    const cb = row.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => saveFlag(f.key, { enabled: cb.checked }));
    const ta = row.querySelector('textarea');
    ta.addEventListener('blur', () => {
      if (ta.value !== (f.message || '')) saveFlag(f.key, { message: ta.value });
    });
    list.appendChild(row);
  }
}

async function saveFlag(key, patch) {
  try {
    await api.patch(`/api/admin/flags/${encodeURIComponent(key)}`, patch);
    // Reload flags + reapply UI side-effects so toggles take effect immediately.
    await loadFlags();
    applyFeatureFlags();
    // Refresh the admin list so updated_at / label state reflect the change.
    const fresh = await api.get('/api/admin/flags');
    renderAdminFlags(fresh);
  } catch {
    alert(`Falha ao salvar flag "${key}". Tenta de novo.`);
  }
}

// ============ FINANCE ============
// Helpers — money is stored as integer cents server-side; the UI converts
// on display ("R$ 12,50") and on input parsing ("12,50" or "12.50" → 1250).
function centsToBrl(cents) {
  const v = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `R$ ${v}`;
}
function parseBrlToCents(str) {
  // Accepts "12,50", "12.50", "12", "1.234,56", "1234.56" → 1250 / 1250 / 1200 / 123456 / 123456
  const cleaned = String(str || '').trim().replace(/[^\d,.\-]/g, '');
  if (!cleaned) return null;
  // Brazil-style: comma is decimal sep, dot is thousands. If only dots and no
  // comma, treat dots as decimal (US-style accident). Tolerant.
  const hasComma = cleaned.includes(',');
  const normalized = hasComma
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const f = Number(normalized);
  if (!Number.isFinite(f) || f < 0) return null;
  return Math.round(f * 100);
}
function monthLabel(ym) {
  // ym = "YYYY-MM"; returns "Maio 2026" pt-BR
  const [y, m] = ym.split('-').map(Number);
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[m - 1]} ${y}`;
}
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of next month = last day of current
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}
function todayYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function renderFinancial() {
  const f = state.finance;
  if (!f.monthYM) f.monthYM = todayYM();
  // Categories rarely change — fetch once per session
  if (f.categories.length === 0) {
    try { f.categories = await api.get('/api/finance/categories'); }
    catch { f.categories = []; }
  }
  // Run transactions list and summary in parallel — both hit the DB but on
  // different aggregations, so the round-trip is one network turn.
  const [_, summary] = await Promise.all([
    loadFinanceTransactions(),
    api.get(`/api/finance/summary?month=${f.monthYM}`).catch(() => null),
  ]);
  f.summary = summary;
  renderFinanceMonthLabel();
  renderFinanceCategoryFilter();
  renderFinanceSummary();
  renderFinanceTopCategories();
  renderFinanceList();
}

async function loadFinanceTransactions() {
  const f = state.finance;
  const { from, to } = monthRange(f.monthYM);
  const params = new URLSearchParams({ from, to, limit: '500' });
  if (f.filterType)     params.set('type', f.filterType);
  if (f.filterCategory) params.set('category', f.filterCategory);
  try {
    f.transactions = await api.get('/api/finance/transactions?' + params.toString());
  } catch {
    f.transactions = [];
  }
}

function renderFinanceMonthLabel() {
  $('#financeMonthLabel').textContent = monthLabel(state.finance.monthYM);
}

function renderFinanceCategoryFilter() {
  const sel = $('#financeFilterCategory');
  if (!sel) return;
  const current = state.finance.filterCategory;
  sel.innerHTML = '<option value="">Todas categorias</option>';
  for (const c of state.finance.categories.filter(c => !c.archived)) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon || ''} ${c.name} (${c.kind === 'income' ? 'receita' : 'despesa'})`.trim();
    if (String(c.id) === String(current)) opt.selected = true;
    sel.appendChild(opt);
  }
}

// Renders a small "X% vs mês anterior" indicator. Direction good/bad depends
// on the metric: more income = good (green), more expense = bad (red),
// positive balance delta = good. Returns HTML or empty string when there's
// no previous data to compare against.
function deltaPill(currentCents, previousCents, kind) {
  if (!previousCents) return '<span class="finance-delta neutral">—</span>';
  const diff = currentCents - previousCents;
  if (diff === 0) return '<span class="finance-delta neutral">igual ao mês anterior</span>';
  const pct = Math.round((Math.abs(diff) / Math.abs(previousCents)) * 100);
  const arrow = diff > 0 ? '↑' : '↓';
  // 'good' meaning depends on context: more income = good; more expense = bad
  const good = (kind === 'income' && diff > 0) || (kind === 'expense' && diff < 0) || (kind === 'balance' && diff > 0);
  const cls = good ? 'positive' : 'negative';
  return `<span class="finance-delta ${cls}">${arrow} ${pct}% vs mês anterior</span>`;
}

function renderFinanceSummary() {
  const f = state.finance;
  // Server provides authoritative monthly totals; fall back to client-side
  // sum of the visible list if the summary endpoint failed.
  let income, expense, balance, prev;
  if (f.summary?.current) {
    income  = f.summary.current.income_cents;
    expense = f.summary.current.expense_cents;
    balance = f.summary.current.balance_cents;
    prev    = f.summary.previous;
  } else {
    income = expense = 0;
    for (const t of f.transactions) {
      if (t.type === 'income')  income  += t.amount_cents;
      if (t.type === 'expense') expense += t.amount_cents;
    }
    balance = income - expense;
    prev = null;
  }
  const balanceClass = balance >= 0 ? 'positive' : 'negative';
  $('#financeSummary').innerHTML = `
    <div class="finance-summary-card">
      <span class="finance-summary-label">Receitas</span>
      <span class="finance-summary-value positive">${centsToBrl(income)}</span>
      ${prev ? deltaPill(income, prev.income_cents, 'income') : ''}
    </div>
    <div class="finance-summary-card">
      <span class="finance-summary-label">Despesas</span>
      <span class="finance-summary-value negative">${centsToBrl(expense)}</span>
      ${prev ? deltaPill(expense, prev.expense_cents, 'expense') : ''}
    </div>
    <div class="finance-summary-card finance-summary-balance">
      <span class="finance-summary-label">Saldo do mês</span>
      <span class="finance-summary-value ${balanceClass}">${centsToBrl(balance)}</span>
      ${prev ? deltaPill(balance, prev.balance_cents, 'balance') : ''}
    </div>
  `;
}

function renderFinanceTopCategories() {
  const wrap = $('#financeTopCategories');
  if (!wrap) return;
  const top = state.finance.summary?.top_expense_categories || [];
  if (top.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  const max = Math.max(...top.map(c => c.total));
  // Bar chart: each row is icon + name | bar | value. Bar width is % of max.
  wrap.innerHTML = `
    <div class="finance-top-header">Top categorias (despesas do mês)</div>
    <div class="finance-top-list">
      ${top.map(c => {
        const pct = Math.max(2, Math.round((c.total / max) * 100));
        return `
          <div class="finance-top-row">
            <span class="finance-top-icon">${c.icon || '📦'}</span>
            <span class="finance-top-name">${escapeHtml(c.name)}</span>
            <div class="finance-top-bar-track">
              <div class="finance-top-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="finance-top-amount">${centsToBrl(c.total)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFinanceList() {
  const list = $('#financeList');
  list.innerHTML = '';
  const txs = state.finance.transactions;
  if (txs.length === 0) {
    list.innerHTML = '<p class="muted-small finance-empty">Nenhuma transação neste período. Use o + pra adicionar.</p>';
    return;
  }
  // Group by date for visual hierarchy
  const groups = {};
  for (const t of txs) {
    if (!groups[t.transaction_date]) groups[t.transaction_date] = [];
    groups[t.transaction_date].push(t);
  }
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  for (const date of sortedDates) {
    const dateGroup = document.createElement('div');
    dateGroup.className = 'finance-date-group';
    const [y, m, d] = date.split('-');
    dateGroup.innerHTML = `<div class="finance-date-header">${d}/${m}/${y}</div>`;
    for (const t of groups[date]) {
      const row = document.createElement('div');
      row.className = 'finance-tx-row';
      const sign = t.type === 'income' ? '+' : '-';
      const colorClass = t.type === 'income' ? 'positive' : 'negative';
      const icon = t.category_icon || (t.type === 'income' ? '💰' : '💸');
      const cat = t.category_name || '(sem categoria)';
      const desc = t.description ? `<div class="finance-tx-desc">${escapeHtml(t.description)}</div>` : '';
      row.innerHTML = `
        <span class="finance-tx-icon">${icon}</span>
        <div class="finance-tx-info">
          <div class="finance-tx-cat">${escapeHtml(cat)}</div>
          ${desc}
        </div>
        <span class="finance-tx-amount ${colorClass}">${sign} ${centsToBrl(t.amount_cents)}</span>
      `;
      row.addEventListener('click', () => openFinanceTxModal(t));
      dateGroup.appendChild(row);
    }
    list.appendChild(dateGroup);
  }
}

function changeFinanceMonth(delta) {
  const [y, m] = state.finance.monthYM.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.finance.monthYM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderFinancial();
}

// ---- Modal: create / edit a transaction ----
function openFinanceTxModal(tx) {
  const f = state.finance;
  f.editingId = tx?.id || null;
  f.editingType = tx?.type || 'expense';
  $('#financeTxModalTitle').textContent = tx ? 'Editar transação' : 'Nova transação';
  $('#financeTxAmount').value      = tx ? (tx.amount_cents / 100).toFixed(2).replace('.', ',') : '';
  $('#financeTxDate').value        = tx ? tx.transaction_date : todayISO();
  $('#financeTxDescription').value = tx ? (tx.description || '') : '';
  $('#financeTxError').classList.add('hidden');
  $('#financeTxDeleteBtn').classList.toggle('hidden', !tx);
  // Type toggle visual
  $$('#financeTxModal [data-tx-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.txType === f.editingType)
  );
  renderFinanceTxModalCategories();
  if (tx?.category_id) $('#financeTxCategory').value = tx.category_id;
  $('#financeTxModal').classList.remove('hidden');
  setTimeout(() => $('#financeTxAmount').focus(), 50);
}
function closeFinanceTxModal() {
  $('#financeTxModal').classList.add('hidden');
  state.finance.editingId = null;
}
function renderFinanceTxModalCategories() {
  const sel = $('#financeTxCategory');
  sel.innerHTML = '<option value="">— sem categoria —</option>';
  const cats = state.finance.categories.filter(c => !c.archived && c.kind === state.finance.editingType);
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon || ''} ${c.name}`.trim();
    sel.appendChild(opt);
  }
}
function setFinanceTxType(type) {
  state.finance.editingType = type;
  $$('#financeTxModal [data-tx-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.txType === type)
  );
  renderFinanceTxModalCategories();
}
async function saveFinanceTx() {
  const f = state.finance;
  const errEl = $('#financeTxError');
  errEl.classList.add('hidden');
  const amount_cents = parseBrlToCents($('#financeTxAmount').value);
  if (amount_cents === null || amount_cents <= 0) {
    errEl.textContent = 'Valor inválido. Use formato 12,50';
    errEl.classList.remove('hidden');
    return;
  }
  const transaction_date = $('#financeTxDate').value;
  if (!transaction_date) {
    errEl.textContent = 'Data obrigatória';
    errEl.classList.remove('hidden');
    return;
  }
  const description = $('#financeTxDescription').value.trim();
  const category_id = $('#financeTxCategory').value || null;
  const payload = { type: f.editingType, amount_cents, transaction_date, description, category_id: category_id ? parseInt(category_id) : null };
  try {
    if (f.editingId) await api.patch(`/api/finance/transactions/${f.editingId}`, payload);
    else             await api.post('/api/finance/transactions', payload);
    closeFinanceTxModal();
    await renderFinancial();
  } catch {
    errEl.textContent = 'Falha ao salvar. Tente de novo.';
    errEl.classList.remove('hidden');
  }
}
async function deleteFinanceTx() {
  const id = state.finance.editingId;
  if (!id) return;
  if (!confirm('Excluir esta transação? Não dá pra desfazer.')) return;
  try {
    await api.delete(`/api/finance/transactions/${id}`);
    closeFinanceTxModal();
    await renderFinancial();
  } catch {
    alert('Falha ao excluir. Tente de novo.');
  }
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
  // Pass the invite token from the URL (if any) so the server can let this
  // registration through even when ALLOW_REGISTRATION=false, provided the
  // email matches the invite's whitelist.
  const body = {
    name: $('#registerName').value.trim(),
    email: $('#registerEmail').value.trim(),
    password: $('#registerPassword').value,
  };
  if (state.pendingInviteToken) body.inviteToken = state.pendingInviteToken;
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
const WORKSPACE_VIEWS = new Set(['settings', 'activity', 'analytics', 'admin', 'financial', 'today', 'help']);

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
    admin: '#adminView', financial: '#financialView', today: '#todayView',
    help: '#helpView',
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
  if (state.view === 'admin')     return renderAdmin();
  if (state.view === 'financial') return renderFinancial();
  if (state.view === 'today')     return renderToday();
  if (state.view === 'help')      return; // help page is static HTML, no render needed
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
  if (state.boards.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'boards-nav-empty';
    hint.textContent = 'Nenhum quadro ainda — use o botão abaixo pra criar o primeiro.';
    nav.appendChild(hint);
    return;
  }
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

  // Empty state for brand-new boards: explain the concept in plain Portuguese
  // rather than dropping the user into an empty page with just an "+" button.
  if (board.lists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanban-empty';
    empty.innerHTML = `
      <div class="kanban-empty-emoji">🎯</div>
      <h3>Vamos começar?</h3>
      <p>Um quadro funciona como uma agenda em colunas. Cada coluna é uma etapa do trabalho —
      por exemplo: <strong>A fazer</strong>, <strong>Fazendo</strong> e <strong>Pronto</strong>.
      Cada tarefa vira um cartão que você arrasta entre as colunas conforme avança.</p>
      <p class="kanban-empty-hint">Clique no botão <strong>+ Adicionar lista</strong> ali do lado pra criar sua primeira coluna.</p>
    `;
    container.appendChild(empty);
  }

  for (const list of board.lists) container.appendChild(renderList(list));

  const addBtn = document.createElement('button');
  addBtn.className = 'add-list-btn';
  addBtn.textContent = '+ Adicionar lista';
  addBtn.title = 'Cria uma coluna nova no quadro (ex: A fazer, Fazendo, Pronto)';
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

  const visibleCards = list.cards.filter(matchesSearch);
  for (const card of visibleCards) cardsContainer.appendChild(renderCard(card));

  // Empty state — distinguishes "no cards at all" from "filtered out".
  if (visibleCards.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'list-empty-msg';
    emptyMsg.textContent = list.cards.length === 0
      ? 'Vazio. Use o + abaixo pra adicionar a primeira tarefa.'
      : 'Nenhuma tarefa bate com a busca.';
    cardsContainer.appendChild(emptyMsg);
  }

  el.appendChild(cardsContainer);

  // Card-level drag: works on touch + mouse, allows moving between lists.
  // delay/delayOnTouchOnly: on touch devices the user must press-and-hold for
  // 200ms before drag starts — quick taps/swipes then pass through to the list
  // for scrolling. Without this, every touch on a card was interpreted as the
  // start of a drag, making it impossible to scroll long lists on mobile.
  Sortable.create(cardsContainer, {
    group: 'cards',         // same group across all lists → cards move freely between
    animation: 180,
    delay: 200,
    delayOnTouchOnly: true,
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
  addCard.title = 'Adiciona uma tarefa nesta coluna';
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

  // Category pill on top (if set). Custom category takes priority — when both
  // exist (shouldn't, server prevents) custom wins.
  const pillData = cardCategoryPill(card);
  if (pillData) {
    const pill = document.createElement('div');
    pill.className = 'card-category';
    pill.style.setProperty('--cat-color', pillData.color);
    pill.style.setProperty('--cat-bg', pillData.color + '1A');  // ~10% opacity
    pill.textContent = pillData.label;
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

  // CONTA-A-PAGAR cards: show R$ value + paid status (or due date hint) on the
  // card preview so the kanban board itself acts as a "bills calendar".
  // Hidden for users without finance access — they'd see numbers they can't
  // act on, which is more confusing than helpful.
  if (card.category === 'conta-a-pagar' && hasFinanceAccess() && (card.amount_cents != null || card.paid_at)) {
    const billPreview = document.createElement('div');
    billPreview.className = 'card-bill-preview';
    const amt = card.amount_cents != null ? centsToBrl(card.amount_cents) : '—';
    if (card.paid_at) {
      const dt = new Date(card.paid_at.replace(' ', 'T') + 'Z');
      billPreview.innerHTML = `<span class="card-bill-amount">${amt}</span><span class="card-bill-paid">✅ Pago em ${dt.toLocaleDateString('pt-BR')}</span>`;
    } else {
      const due = card.due_date ? new Date(card.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : null;
      billPreview.innerHTML = `<span class="card-bill-amount">${amt}</span>${due ? `<span class="card-bill-due">vence ${due}</span>` : ''}`;
    }
    el.appendChild(billPreview);
  }

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
    grid.innerHTML = `<p class="gallery-empty">Nenhuma tarefa por aqui ainda. Use o botão <strong>+</strong> dentro de uma coluna no Kanban pra criar a primeira.</p>`;
    return;
  }

  for (const card of cards) {
    const el = document.createElement('div');
    el.className = `gallery-card priority-${card.priority || 'media'}`;
    const pillData = cardCategoryPill(card);
    const catHtml = pillData
      ? `<div class="card-category" style="--cat-color:${pillData.color};--cat-bg:${pillData.color}1A">${escapeHtml(pillData.label)}</div>`
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
    wrap.innerHTML = '<div class="gantt-empty">Pra ver o cronograma, edite uma tarefa e preencha a <strong>data de início</strong> e/ou <strong>data de vencimento</strong>.</div>';
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

// ============ WORKSPACE: HOJE ============
// Aggregates cards from all boards the user can see that touch [today, today+7].
// "Hoje" bucket = anything covering today; "Próximos 7 dias" = the rest, by day.
async function renderToday() {
  const container = $('#todayContent');
  container.innerHTML = '<div class="today-empty">Carregando...</div>';
  let data;
  try { data = await api.get('/api/today'); }
  catch {
    container.innerHTML = '<div class="today-empty">Erro ao carregar.</div>';
    return;
  }
  const { today, cards } = data;

  // Update header with the date in pt-BR (e.g., "Hoje · seg, 12 de maio")
  const todayDate = new Date(today + 'T00:00:00');
  const weekdays = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const months   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  $('#todayTitle').textContent = `Hoje · ${weekdays[todayDate.getDay()]}, ${todayDate.getDate()} de ${months[todayDate.getMonth()]}`;

  // Bucket: a card "covers today" if any of its dates equal today, or its
  // [start, due] range includes today.
  const todayCards = [];
  const futureByDay = {};
  for (const c of cards) {
    const due = c.due_date;
    const start = c.start_date;
    const coversToday =
      due === today ||
      start === today ||
      (start && due && start <= today && due >= today);
    if (coversToday) { todayCards.push(c); continue; }
    // Pick the primary upcoming date — earliest of (start, due) that's >= today
    const candidates = [start, due].filter(d => d && d > today).sort();
    const dayKey = candidates[0];
    if (!dayKey) continue; // nothing useful (shouldn't happen given the SQL)
    (futureByDay[dayKey] ||= []).push(c);
  }

  container.innerHTML = '';

  // --- HOJE section ---
  const todaySection = document.createElement('div');
  todaySection.className = 'today-section';
  const todayHeader = document.createElement('h3');
  todayHeader.className = 'today-section-title';
  todayHeader.textContent = `Hoje (${todayCards.length})`;
  todaySection.appendChild(todayHeader);
  if (todayCards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'today-empty';
    empty.textContent = 'Nada por hoje. Aproveita 🙂';
    todaySection.appendChild(empty);
  } else {
    for (const c of todayCards) todaySection.appendChild(renderTodayItem(c, today));
  }
  container.appendChild(todaySection);

  // --- PRÓXIMOS 7 DIAS section ---
  const futureSection = document.createElement('div');
  futureSection.className = 'today-section';
  const futureHeader = document.createElement('h3');
  futureHeader.className = 'today-section-title';
  const totalFuture = Object.values(futureByDay).reduce((sum, arr) => sum + arr.length, 0);
  futureHeader.textContent = `Próximos 7 dias (${totalFuture})`;
  futureSection.appendChild(futureHeader);
  const sortedDays = Object.keys(futureByDay).sort();
  if (sortedDays.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'today-empty';
    empty.textContent = 'Nenhuma tarefa programada pra esta semana.';
    futureSection.appendChild(empty);
  } else {
    for (const dayKey of sortedDays) {
      const dayGroup = document.createElement('div');
      dayGroup.className = 'today-day-group';
      const daySep = document.createElement('div');
      daySep.className = 'today-day-sep';
      daySep.textContent = humanFutureDay(dayKey, today);
      dayGroup.appendChild(daySep);
      for (const c of futureByDay[dayKey]) dayGroup.appendChild(renderTodayItem(c, today));
      futureSection.appendChild(dayGroup);
    }
  }
  container.appendChild(futureSection);

  injectIcons(container);
}

// Renders a "Quarta, 14 de maio" / "Amanhã" / "Segunda" depending on proximity
function humanFutureDay(dayKey, todayKey) {
  const d = new Date(dayKey + 'T00:00:00');
  const t = new Date(todayKey + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  const weekdaysFull = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const months   = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  if (diff === 1) return `Amanhã · ${weekdaysFull[d.getDay()].toLowerCase()}, ${d.getDate()} de ${months[d.getMonth()]}`;
  if (diff > 1 && diff < 7) return `${weekdaysFull[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`;
  return `${d.getDate()} de ${months[d.getMonth()]}`;
}

// Single card item in the Today/Future list. Reuses card category pill.
function renderTodayItem(card, todayKey) {
  const el = document.createElement('div');
  el.className = `today-item priority-${card.priority || 'media'}`;
  el.tabIndex = 0;
  el.addEventListener('click', () => openCardModal(card));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') openCardModal(card); });

  const pill = cardCategoryPill(card);
  const pillHtml = pill
    ? `<div class="card-category" style="--cat-color:${pill.color};--cat-bg:${pill.color}1A">${escapeHtml(pill.label)}</div>`
    : '';

  // Date hint: range → "23/05 → 02/06"; single → "vence 14/05"; running → "até 02/06"
  const fmtBR = (d) => { const x = new Date(d + 'T00:00:00'); return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}`; };
  let dateHint = '';
  if (card.start_date && card.due_date) {
    if (card.start_date <= todayKey && card.due_date >= todayKey) {
      dateHint = card.due_date === todayKey ? `termina hoje` : `vai até ${fmtBR(card.due_date)}`;
    } else {
      dateHint = `${fmtBR(card.start_date)} → ${fmtBR(card.due_date)}`;
    }
  } else if (card.due_date) {
    dateHint = card.due_date === todayKey ? 'vence hoje' : `vence ${fmtBR(card.due_date)}`;
  } else if (card.start_date) {
    dateHint = card.start_date === todayKey ? 'começa hoje' : `começa ${fmtBR(card.start_date)}`;
  }

  const assigneeHtml = card.assignee
    ? `<span class="today-assignee">${avatarImg(card.assignee, 20, card.assignee)}${escapeHtml(card.assignee)}</span>`
    : '';

  el.innerHTML = `
    ${pillHtml}
    <div class="today-item-title">${escapeHtml(card.title)}</div>
    <div class="today-item-meta">
      <span class="today-item-board" title="${escapeHtml(card.board_title)} · ${escapeHtml(card.list_title)}">
        <span class="today-board-dot" style="background:${card.board_color || '#999'}"></span>${escapeHtml(card.board_title)}
      </span>
      ${dateHint ? `<span class="today-item-date">${dateHint}</span>` : ''}
      ${assigneeHtml}
    </div>
  `;
  return el;
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
    container.innerHTML = '<div class="activity-empty">Ainda não rolou nenhuma atividade. Quando você (ou alguém do quadro) criar/editar uma tarefa, aparece aqui.</div>';
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
  // Custom category overrides the whitelist value when both somehow exist.
  const hasCustom = !!(card?.custom_category_label && card?.custom_category_color);
  $('#cardCategoryInput').value = hasCustom ? '__custom__' : (card?.category || '');
  $('#cardCustomCategoryLabel').value = hasCustom ? card.custom_category_label : '';
  $('#cardCustomCategoryColor').value = hasCustom ? card.custom_category_color : '#6366F1';
  applyCardCustomCategoryVisibility();
  $('#cardPriorityInput').value = card?.priority || 'media';
  $('#cardStartInput').value = card?.start_date || '';
  $('#cardDueInput').value = card?.due_date || '';
  $('#cardAssigneeInput').value = card?.assignee || '';
  // Hide the "Conta a pagar" option from users without finance access (server
  // also rejects with 403 if they bypass the UI). Cards already saved with
  // this category remain editable but the finance section stays hidden.
  const contaOption = $('#cardCategoryInput').querySelector('option[value="conta-a-pagar"]');
  if (contaOption) contaOption.hidden = !hasFinanceAccess();
  // Finance bridge fields (only visible when category=conta-a-pagar AND user has access)
  $('#cardAmountInput').value = card?.amount_cents != null ? (card.amount_cents / 100).toFixed(2).replace('.', ',') : '';
  applyCardFinanceVisibility(card);
  $('#cardModalTitle').textContent = card ? 'Editar Card' : 'Novo Card';
  $('#cardDeleteBtn').style.display = card ? '' : 'none';

  // Recurrence section: only visible when creating a new card AND user has access.
  // Editing an existing card never shows this — recurrence is decided at creation.
  const recSection = $('#cardRecurrenceSection');
  const showRecurrence = !card?.id && hasRecurringAccess();
  recSection.classList.toggle('hidden', !showRecurrence);
  $('#cardRecurrenceToggle').checked = false;
  $('#cardRecurrenceMonths').value = 6;
  $('#cardRecurrenceMonthsRow').classList.add('hidden');

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

// Show/hide the custom-category inputs (label + color) based on the current
// select value. The select's "__custom__" sentinel is the only trigger.
function applyCardCustomCategoryVisibility() {
  const isCustom = $('#cardCategoryInput').value === '__custom__';
  $('#cardCustomCategorySection').classList.toggle('hidden', !isCustom);
}

// Show/hide the finance bridge fields based on the current category. Card may
// be null (new card), undefined (creating), or a saved object (with paid_at).
// Also hidden when the user has no finance access — defense in depth alongside
// the option-hiding in openCardModal (covers cards already saved with this category).
async function applyCardFinanceVisibility(card) {
  const isConta = $('#cardCategoryInput').value === 'conta-a-pagar';
  const section = $('#cardFinanceSection');
  const visible = isConta && hasFinanceAccess();
  section.classList.toggle('hidden', !visible);
  if (!visible) return;

  // Lazy-load finance categories if not in state.finance.categories yet
  if (!state.finance.categories || state.finance.categories.length === 0) {
    try { state.finance.categories = await api.get('/api/finance/categories'); }
    catch { state.finance.categories = []; }
  }
  // Populate the finance category select with EXPENSE categories only
  const sel = $('#cardFinanceCategoryInput');
  sel.innerHTML = '<option value="">— sem categoria —</option>';
  for (const c of state.finance.categories.filter(c => !c.archived && c.kind === 'expense')) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon || ''} ${c.name}`.trim();
    sel.appendChild(opt);
  }
  if (card?.finance_category_id) sel.value = card.finance_category_id;

  // "Marcar como pago" button vs "✅ Pago" badge depending on paid_at
  const paidBadge = $('#cardPaidBadge');
  const paidBtn   = $('#cardMarkPaidBtn');
  if (card?.paid_at) {
    const dt = new Date(card.paid_at.replace(' ', 'T') + 'Z');
    paidBadge.textContent = `✅ Pago em ${dt.toLocaleDateString('pt-BR')}`;
    paidBadge.classList.remove('hidden');
    paidBtn.classList.add('hidden');
  } else {
    paidBadge.classList.add('hidden');
    paidBtn.classList.remove('hidden');
    // Disable until card has been saved (needs id + amount > 0)
    const hasId  = !!$('#cardId').value;
    const hasAmt = parseBrlToCents($('#cardAmountInput').value) > 0;
    paidBtn.disabled = !hasId || !hasAmt;
    paidBtn.title = !hasId ? 'Salve o card primeiro' : (!hasAmt ? 'Informe o valor primeiro' : '');
  }
}

async function markCardAsPaid() {
  const id = $('#cardId').value;
  if (!id) return;
  if (!confirm('Marcar este card como pago? Vai criar uma transação em Finanças e não dá pra desfazer.')) return;
  try {
    await api.post(`/api/cards/${id}/mark-paid`, {});
  } catch (err) {
    alert('Falha ao marcar como pago. Verifica se o valor está preenchido.');
    return;
  }
  // Refresh the board so the card preview shows the paid badge + close modal
  closeAllModals();
  if (state.currentBoardId) await loadBoard(state.currentBoardId);
  // Bonus: if user is on Finanças view, reload it so the new tx appears
  if (state.view === 'financial') renderFinancial();
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
  const catSelect = $('#cardCategoryInput').value;
  const isCustom = catSelect === '__custom__';
  const customLabel = isCustom ? $('#cardCustomCategoryLabel').value.trim() : '';
  const customColor = isCustom ? $('#cardCustomCategoryColor').value : '';
  if (isCustom && !customLabel) {
    alert('Digite um nome pra categoria personalizada.');
    return;
  }
  const payload = {
    list_id:     parseInt($('#cardListId').value),
    title:       $('#cardTitleInput').value.trim(),
    description: $('#cardDescInput').value,
    category:    isCustom ? null : (catSelect || null),
    priority:    $('#cardPriorityInput').value,
    start_date:  $('#cardStartInput').value || null,
    due_date:    $('#cardDueInput').value || null,
    assignee:    $('#cardAssigneeInput').value,
    custom_category_label: isCustom ? customLabel : null,
    custom_category_color: isCustom ? customColor : null,
  };
  // Finance bridge — only send fields when (a) user has finance access AND
  // (b) category is conta-a-pagar. Without finance access, omitting these
  // fields prevents pointless 403s from the server (which would also reject).
  if (hasFinanceAccess()) {
    if (payload.category === 'conta-a-pagar') {
      const amt = parseBrlToCents($('#cardAmountInput').value);
      payload.amount_cents = amt && amt > 0 ? amt : null;
      const fcid = $('#cardFinanceCategoryInput').value;
      payload.finance_category_id = fcid ? parseInt(fcid) : null;
    } else {
      // User changed away from conta-a-pagar — wipe the finance bridge values
      payload.amount_cents = null;
      payload.finance_category_id = null;
    }
  }
  if (!payload.title) return;
  if (id) {
    await api.put(`/api/cards/${id}`, payload);
  } else {
    // New card — check if user wants to create a monthly series instead
    const recurring = !$('#cardRecurrenceSection').classList.contains('hidden')
                       && $('#cardRecurrenceToggle').checked;
    if (recurring) {
      if (!payload.due_date) {
        alert('Pra criar um card que repete todo mês, preencha a data de vencimento — é o dia que vai recorrer.');
        return;
      }
      payload.recurrence_months = parseInt($('#cardRecurrenceMonths').value) || 6;
      try {
        await api.post('/api/cards/recurring', payload);
      } catch (err) {
        alert('Falha ao criar série recorrente. Tente novamente.');
        return;
      }
    } else {
      await api.post('/api/cards', payload);
    }
  }
  closeAllModals();
  await refreshAfterCardChange();
}

async function deleteCard() {
  const id = $('#cardId').value;
  if (!id) return;
  if (!confirm('Excluir este card?')) return;
  await api.delete(`/api/cards/${id}`);
  closeAllModals();
  await refreshAfterCardChange();
}

// Reload the right view after a card mutation. From Today view, the card may
// belong to a different board than state.currentBoardId — calling loadBoard
// here would also redirect away from Today (loadBoard auto-jumps off
// workspace-level views), so refresh Today directly instead.
async function refreshAfterCardChange() {
  if (state.view === 'today') return renderToday();
  if (state.currentBoardId)   return loadBoard(state.currentBoardId);
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
// Per-modal-open: list of emails the user typed into the chips input but
// hasn't yet submitted as a single invite. Reset when the modal opens.
let inviteEmailsBuffer = [];
// Set of extra board IDs (besides the current board) the new invite covers.
let inviteExtraBoards = new Set();

async function openMembersModal() {
  if (!state.currentBoard) return;
  $('#membersModal').classList.remove('hidden');

  // Reset invite composer to a clean state every open
  inviteEmailsBuffer = [];
  inviteExtraBoards = new Set();
  $('#inviteEmailInput').value = '';
  $('#inviteEmailError').classList.add('hidden');
  $('#inviteLinkArea').classList.add('hidden');
  renderInviteChips();

  const canManage = state.currentBoard.role === 'owner' || state.currentBoard.role === 'admin';
  // Hide invite UI when (a) user can't manage OR (b) the 'invites' feature
  // flag is off (owner-controlled kill switch).
  const invitesAllowed = canManage && flagEnabled('invites');
  $('#inviteSection').classList.toggle('hidden', !invitesAllowed);
  $('#pendingInvitesSection').classList.toggle('hidden', !invitesAllowed);

  await renderMembersList();
  if (invitesAllowed) {
    renderExtraBoardsList();
    await renderPendingInvites();
  }
}

// Renders the checkbox list of "other boards I manage" the user can include
// in the invite. The current board is implicit (always covered) and excluded
// here. Hides the section entirely when there's nothing to add.
function renderExtraBoardsList() {
  const wrap = $('#extraBoardsList');
  const section = $('#inviteExtraBoardsSection');
  const counter = $('#extraBoardsCount');
  wrap.innerHTML = '';

  // Filter to boards the user can manage: owner OR admin role on the board.
  // state.boards comes from /api/boards, which doesn't include role. We treat
  // owned boards (where state.user.id == owner_id) plus boards we know we're
  // admin/owner of via state.currentBoard.role. Cheapest correct heuristic:
  // assume the user can manage any board they own. For boards where they're
  // a member, the server will reject them at POST time (canManage check), so
  // worst case the UI offers an option that fails — acceptable safety net.
  const candidates = (state.boards || []).filter((b) =>
    b.id !== state.currentBoardId && b.owner_id === state.user?.id
  );

  if (candidates.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  for (const b of candidates) {
    const row = document.createElement('label');
    row.className = 'extra-board-row';
    const id = `eb-${b.id}`;
    const accent = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#6b7280';
    row.style.setProperty('--eb-color', accent);
    row.innerHTML = `
      <span class="eb-color"></span>
      <span class="eb-title">${escapeHtml(b.title)}</span>
      <label class="switch">
        <input type="checkbox" id="${id}" data-board-id="${b.id}" />
        <span class="switch-slider"></span>
      </label>
    `;
    const cb = row.querySelector('input[type="checkbox"]');
    cb.checked = inviteExtraBoards.has(b.id);
    cb.addEventListener('change', () => {
      if (cb.checked) inviteExtraBoards.add(b.id);
      else            inviteExtraBoards.delete(b.id);
      updateExtraBoardsCounter();
    });
    wrap.appendChild(row);
  }
  updateExtraBoardsCounter();
}

function updateExtraBoardsCounter() {
  const n = inviteExtraBoards.size;
  $('#extraBoardsCount').textContent = n === 0 ? '' : `(${n} selecionado${n > 1 ? 's' : ''})`;
}

function renderInviteChips() {
  const list = $('#inviteChipsList');
  list.innerHTML = '';
  for (const email of inviteEmailsBuffer) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span class="chip-email">${escapeHtml(email)}</span>`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'chip-remove';
    rm.setAttribute('aria-label', `Remover ${email}`);
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      inviteEmailsBuffer = inviteEmailsBuffer.filter((e) => e !== email);
      renderInviteChips();
    });
    chip.appendChild(rm);
    list.appendChild(chip);
  }
  $('#inviteChipsCounter').textContent = `${inviteEmailsBuffer.length} / 20 emails`;
  $('#generateInviteBtn').disabled = inviteEmailsBuffer.length === 0;
}

const EMAIL_RE_CLIENT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tryAddInviteEmail(rawInput) {
  const errorEl = $('#inviteEmailError');
  errorEl.classList.add('hidden');
  errorEl.textContent = '';

  // Allow paste with multiple emails separated by , ; or whitespace
  const candidates = String(rawInput || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (candidates.length === 0) return false;

  const ownerOrSelfEmails = new Set();
  if (state.user?.email) ownerOrSelfEmails.add(state.user.email.toLowerCase());
  // Also block existing members so the user gets immediate feedback.
  const memberEmails = new Set(
    (state.boardMembers || []).map((m) => (m.email || '').toLowerCase())
  );

  let added = 0;
  const reasons = [];
  for (const e of candidates) {
    if (!EMAIL_RE_CLIENT.test(e))            { reasons.push(`Email inválido: ${e}`); continue; }
    if (e.length > 200)                       { reasons.push(`Email muito longo: ${e}`); continue; }
    if (inviteEmailsBuffer.includes(e))       { reasons.push(`Já adicionado: ${e}`); continue; }
    if (ownerOrSelfEmails.has(e))             { reasons.push(`Esse é o seu email`); continue; }
    if (memberEmails.has(e))                  { reasons.push(`${e} já é membro`); continue; }
    if (inviteEmailsBuffer.length >= 20)      { reasons.push(`Máximo 20 emails por convite`); break; }
    inviteEmailsBuffer.push(e);
    added++;
  }

  if (added > 0) renderInviteChips();
  if (reasons.length > 0) {
    errorEl.textContent = reasons[0]; // Show the first issue; user can read more if they care
    errorEl.classList.remove('hidden');
  }
  return added > 0;
}

function setupInviteChipsInput() {
  const input = $('#inviteEmailInput');
  const addBtn = $('#inviteAddEmailBtn');
  if (!input || input.dataset.wired === 'true') return;
  input.dataset.wired = 'true';

  const commit = () => {
    const v = input.value.trim();
    if (!v) return;
    if (tryAddInviteEmail(v)) input.value = '';
  };

  addBtn.addEventListener('click', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && input.value === '' && inviteEmailsBuffer.length > 0) {
      // Gmail-style: backspace on empty input removes the last chip
      e.preventDefault();
      inviteEmailsBuffer.pop();
      renderInviteChips();
    } else if (e.key === ',' || e.key === ';') {
      // Comma/semicolon also commits — common when copying lists
      e.preventDefault();
      commit();
    }
  });
  input.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text');
    if (text && /[,;\s]/.test(text)) {
      // Multi-email paste — handle ourselves so we can split + dedupe
      e.preventDefault();
      tryAddInviteEmail(text);
      input.value = '';
    }
  });
}

async function renderPendingInvites() {
  const wrap = $('#pendingInvitesList');
  wrap.innerHTML = '<p class="muted-small">Carregando...</p>';
  let invites = [];
  try {
    invites = await api.get(`/api/boards/${state.currentBoardId}/invites`);
  } catch {
    wrap.innerHTML = '<p class="muted-small">Falha ao carregar convites.</p>';
    return;
  }

  // Hide the legacy single-use invites that have already been used — they're
  // not interesting to anyone anymore and would just clutter the list.
  invites = invites.filter((inv) => !(inv.legacy && inv.used_at));

  if (invites.length === 0) {
    wrap.innerHTML = '<p class="muted-small">Nenhum convite pendente.</p>';
    return;
  }

  wrap.innerHTML = '';
  for (const inv of invites) {
    const card = document.createElement('div');
    card.className = 'pending-invite-card';

    const header = document.createElement('div');
    header.className = 'pending-invite-header';
    const enteredCount = inv.emails.filter((e) => e.used_at).length;
    const totalCount = inv.emails.length;
    const summary = inv.legacy
      ? 'Link antigo (1 uso)'
      : `${totalCount} email(s), ${enteredCount} entrou(aram)`;
    header.innerHTML = `
      <strong>${inv.role === 'admin' ? '🛡️ Admin' : '👤 Membro'}</strong>
      <span class="pi-meta">${summary} · ${formatRelativeTime(inv.created_at)}</span>
    `;

    const body = document.createElement('div');
    body.className = 'pending-invite-body';

    // Show the list of boards this invite covers (only when more than one,
    // since single-board is the implicit default).
    if (Array.isArray(inv.boards) && inv.boards.length > 1) {
      const boardsLine = document.createElement('div');
      boardsLine.className = 'pending-invite-boards-line';
      const label = document.createElement('span');
      label.className = 'muted-small';
      label.textContent = `Cobre ${inv.boards.length} quadros: `;
      boardsLine.appendChild(label);
      for (const b of inv.boards) {
        const tag = document.createElement('span');
        tag.className = 'pi-board-tag' + (b.id === inv.primary_board_id ? ' primary' : '');
        tag.textContent = b.title;
        boardsLine.appendChild(tag);
      }
      body.appendChild(boardsLine);
    }

    if (inv.legacy) {
      const note = document.createElement('p');
      note.className = 'muted-small';
      note.textContent = 'Convite antigo, sem email amarrado. Qualquer pessoa logada com o link entra (uma vez).';
      body.appendChild(note);
    } else {
      for (const e of inv.emails) {
        const row = document.createElement('div');
        row.className = 'pi-email-row';
        const entered = !!e.used_at;
        row.innerHTML = `
          <span class="pi-status ${entered ? 'entered' : 'pending'}">${entered ? '✓' : '○'}</span>
          <span class="pi-email">${escapeHtml(e.email)}</span>
          <span class="pi-when">${entered ? `entrou ${formatRelativeTime(e.used_at)}${e.user_name ? ` (${escapeHtml(e.user_name)})` : ''}` : 'aguardando'}</span>
        `;
        body.appendChild(row);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'pending-invite-actions';
    const link = `${window.location.origin}/?invite=${inv.token}`;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost';
    copyBtn.textContent = '📋 Copiar link';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(link).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = '✅ Copiado!';
        setTimeout(() => { copyBtn.textContent = orig; }, 1500);
      });
    });
    const revokeBtn = document.createElement('button');
    revokeBtn.type = 'button';
    revokeBtn.className = 'btn btn-ghost';
    revokeBtn.textContent = '🗑 Revogar';
    revokeBtn.addEventListener('click', async () => {
      if (!confirm('Revogar este convite? O link deixa de funcionar imediatamente.')) return;
      try {
        await api.delete(`/api/invites/${inv.id}`);
        await renderPendingInvites();
      } catch (err) {
        alert('Falha ao revogar convite.');
      }
    });
    actions.appendChild(copyBtn);
    actions.appendChild(revokeBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    wrap.appendChild(card);
  }
}

// Lightweight relative-time formatter (PT-BR). Avoids pulling in Intl.RelativeTimeFormat
// boilerplate; "X dias atrás" granularity is enough for invites.
function formatRelativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'há 1 dia';
  if (d < 30) return `há ${d} dias`;
  const mo = Math.floor(d / 30);
  return mo === 1 ? 'há 1 mês' : `há ${mo} meses`;
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
  if (inviteEmailsBuffer.length === 0) return;
  const role = $('#inviteRoleSelect').value;
  const btn = $('#generateInviteBtn');
  btn.disabled = true;
  const origLabel = btn.textContent;
  btn.textContent = 'Gerando...';
  let inv;
  try {
    inv = await api.post(`/api/boards/${state.currentBoardId}/invites`, {
      role,
      emails: inviteEmailsBuffer,
      extra_boards: [...inviteExtraBoards],
    });
  } catch (err) {
    alert('Falha ao gerar convite. Verifique os emails e tente novamente.');
    btn.disabled = false;
    btn.textContent = origLabel;
    return;
  }
  if (!inv.token) {
    btn.disabled = false;
    btn.textContent = origLabel;
    return;
  }
  const link = `${window.location.origin}/?invite=${inv.token}`;
  $('#inviteLinkInput').value = link;
  $('#inviteLinkArea').classList.remove('hidden');
  // Reset the composer so the "Generate" button reflects the empty state and
  // the user can either copy the link they just made or compose another batch.
  inviteEmailsBuffer = [];
  inviteExtraBoards = new Set();
  renderInviteChips();
  renderExtraBoardsList();
  btn.textContent = origLabel;
  await renderPendingInvites();
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

function startNewInvite() {
  // Hide the link area, focus the email input — composer already empty
  $('#inviteLinkArea').classList.add('hidden');
  $('#inviteEmailInput').focus();
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
      status.textContent = '✓ Mensagem enviada, obrigado pelo contato!';
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

// ============ TOUR (interactive product walkthrough) ============
// Vanilla spotlight: a single highlight box positioned via getBoundingClientRect
// uses a huge box-shadow to darken everything outside it. Popover is a fixed
// element anchored next to the target. Steps target real DOM elements by
// selector; if a selector misses (sidebar collapsed on mobile, optional nav
// item hidden), the step is skipped.
const TOUR_STEPS = [
  {
    selector: '#boardsNav, .sidebar-section:has(#boardsNav)',
    fallback: '.sidebar',
    title: '📋 Seus quadros',
    text: 'Aqui na barra lateral ficam todos os seus quadros. Cada quadro pode ser um projeto, uma área da vida (Casa, Trabalho), ou uma escala/agenda.',
    placement: 'right',
    mobileDrawer: 'open',
  },
  {
    selector: '#newBoardBtn',
    title: '➕ Criar um quadro',
    text: 'Clique aqui pra criar seu primeiro quadro. Dê um nome e escolha uma cor — depois é só criar as colunas e tarefas dentro dele.',
    placement: 'right',
    mobileDrawer: 'open',
  },
  {
    selector: '#viewTabs',
    // Mobile uses bottom-nav for primary view switching — #viewTabs is
    // display:none on small screens. .bottom-nav has Kanban/Calendar/Dashboard.
    mobileSelector: '.bottom-nav',
    title: '🔀 Trocar de visão',
    text: 'Cada quadro tem várias visões. Kanban é a clássica (colunas com cartões); tem também Tabela, Calendário, Cronograma e mais. Passe o mouse nas abas pra ver o que cada uma faz.',
    mobileText: 'Aqui embaixo você troca entre as principais visões do quadro: Kanban (clássica em colunas), Calendário, Dashboard e Configurações.',
    placement: 'bottom',
    mobileDrawer: 'closed',
    // The view tabs are hidden on workspace-level views (help, today, settings…)
    // Since the tour is launched FROM "Como usar" (a workspace view), the tabs
    // won't be visible. Switch to kanban first if a board is loaded.
    beforeShow: () => {
      if (state.currentBoardId && WORKSPACE_VIEWS.has(state.view)) {
        switchView('kanban');
      }
    },
  },
  {
    selector: '[data-view="today"]',
    title: '☀️ A tela "Hoje"',
    text: 'Esse atalho mostra tudo que tá programado pra hoje e pros próximos 7 dias, juntando tarefas de todos os seus quadros. Bom pra abrir o app de manhã.',
    placement: 'right',
    mobileDrawer: 'open',
  },
  {
    selector: '[data-view="help"]',
    title: '📖 Ajuda quando precisar',
    text: 'Travou? "Como usar" tem o guia completo em português. E "Contato" ali do lado manda mensagem direto pro time — dúvida, sugestão ou bug, tudo pelo mesmo canal.',
    placement: 'right',
    mobileDrawer: 'open',
  },
];

let _tour = { idx: 0, sidebarWasClosed: false };

function isMobileTour() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function startTour() {
  _tour.idx = 0;
  // Track initial sidebar drawer state so we can restore at endTour
  const sidebar = $('.sidebar');
  _tour.sidebarWasClosed = !!(sidebar && !sidebar.classList.contains('open'));
  // Make sure no welcome modal is still on top
  $('#welcomeModal')?.classList.add('hidden');
  $('#tourOverlay').classList.remove('hidden');
  showTourStep();
  // Re-position on resize/scroll while tour is active
  window.addEventListener('resize', positionTourStep);
  window.addEventListener('scroll', positionTourStep, true);
}

function showTourStep() {
  const step = TOUR_STEPS[_tour.idx];
  if (!step) return endTour();
  // Run any pre-step action (e.g., navigating to a view that makes the target visible)
  if (step.beforeShow) step.beforeShow();
  // Sync mobile sidebar drawer state for this step. Snap the change instantly
  // (no animation) so getBoundingClientRect reads the final position immediately;
  // otherwise we'd measure a mid-transition value and the highlight would be wrong.
  if (isMobileTour()) {
    const sidebar = $('.sidebar');
    if (sidebar) {
      const wantsOpen = step.mobileDrawer !== 'closed';
      const isOpen = sidebar.classList.contains('open');
      if (wantsOpen !== isOpen) {
        sidebar.style.transition = 'none';
        sidebar.classList.toggle('open', wantsOpen);
        sidebar.offsetHeight; // force reflow
        sidebar.style.transition = '';
      }
    }
  }
  // Pick selector + text: prefer mobile-specific ones when on touch viewport
  const onMobile = isMobileTour();
  const selector = (onMobile && step.mobileSelector) ? step.mobileSelector : step.selector;
  let target = document.querySelector(selector);
  if (!target && step.fallback) target = document.querySelector(step.fallback);
  // Skip if target missing OR present-but-invisible (display:none → zero rect)
  const rect = target ? target.getBoundingClientRect() : null;
  if (!target || (rect.width === 0 && rect.height === 0)) {
    _tour.idx += 1;
    return showTourStep();
  }
  // Scroll into view (mobile: top so popover at bottom doesn't overlap; desktop: center)
  target.scrollIntoView({
    block: onMobile ? 'start' : 'center',
    inline: 'center',
    behavior: 'instant',
  });

  $('#tourTitle').textContent = step.title;
  $('#tourText').textContent = (onMobile && step.mobileText) ? step.mobileText : step.text;
  $('#tourProgress').textContent = `${_tour.idx + 1} / ${TOUR_STEPS.length}`;
  $('#tourPrevBtn').classList.toggle('hidden', _tour.idx === 0);
  $('#tourNextBtn').textContent = _tour.idx === TOUR_STEPS.length - 1 ? 'Concluir' : 'Próximo';
  // Position highlight + popover after a tick so layout is settled (especially
  // important after beforeShow may have switched views or drawer was toggled)
  requestAnimationFrame(positionTourStep);
}

function positionTourStep() {
  const step = TOUR_STEPS[_tour.idx];
  if (!step) return;
  const onMobile = isMobileTour();
  const selector = (onMobile && step.mobileSelector) ? step.mobileSelector : step.selector;
  let target = document.querySelector(selector);
  if (!target && step.fallback) target = document.querySelector(step.fallback);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const PAD = 6; // pixels of breathing room around the highlight

  const highlight = $('#tourHighlight');
  highlight.style.top    = (rect.top - PAD) + 'px';
  highlight.style.left   = (rect.left - PAD) + 'px';
  highlight.style.width  = (rect.width + PAD * 2) + 'px';
  highlight.style.height = (rect.height + PAD * 2) + 'px';

  const popover = $('#tourPopover');
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // MOBILE: bottom-sheet placement (full-width pinned to top or bottom of
  // viewport depending on where the highlight sits). Predictable, never
  // overlaps the highlight, no clamping math.
  if (onMobile) {
    popover.classList.add('tour-popover-mobile');
    const highlightCenter = rect.top + rect.height / 2;
    const placeAtBottom = highlightCenter < vh / 2;
    if (placeAtBottom) {
      popover.style.top    = 'auto';
      popover.style.bottom = '16px';
    } else {
      popover.style.top    = '16px';
      popover.style.bottom = 'auto';
    }
    popover.style.left  = '';
    popover.style.right = '';
    popover.style.visibility = 'visible';
    return;
  }

  // DESKTOP: place near the target with placement preference, clamp to viewport
  popover.classList.remove('tour-popover-mobile');
  popover.style.bottom = '';
  popover.style.right = '';
  popover.style.visibility = 'hidden';
  popover.style.top = '0';
  popover.style.left = '0';
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;
  const GAP = 16;

  let top, left;
  if (step.placement === 'bottom') {
    top = rect.bottom + GAP;
    left = rect.left + (rect.width / 2) - (pw / 2);
  } else if (step.placement === 'top') {
    top = rect.top - ph - GAP;
    left = rect.left + (rect.width / 2) - (pw / 2);
  } else { // 'right' (default)
    top = rect.top + (rect.height / 2) - (ph / 2);
    left = rect.right + GAP;
  }
  // If popover would overflow right, flip to the left of the target
  if (left + pw > vw - 12) {
    if (step.placement === 'right') {
      left = rect.left - pw - GAP;
    } else {
      left = vw - pw - 12;
    }
  }
  // Clamp to viewport
  if (left < 12) left = 12;
  if (top < 12)  top = 12;
  if (top + ph > vh - 12) top = vh - ph - 12;

  popover.style.top  = top + 'px';
  popover.style.left = left + 'px';
  popover.style.visibility = 'visible';
}

function endTour() {
  $('#tourOverlay').classList.add('hidden');
  $('#tourPopover').classList.remove('tour-popover-mobile');
  window.removeEventListener('resize', positionTourStep);
  window.removeEventListener('scroll', positionTourStep, true);
  // Restore sidebar drawer to whatever state it was in when the tour started
  const sidebar = $('.sidebar');
  if (sidebar) {
    if (_tour.sidebarWasClosed) sidebar.classList.remove('open');
    else                        sidebar.classList.add('open');
  }
  _tour.sidebarWasClosed = false;
}

// Shown once per device for brand-new users only. Detection: existing users
// have `mt_last_seen_version` set (from prior whats-new init), so they're
// silently marked as having seen the welcome too — no annoying popup for them.
const SEEN_WELCOME_KEY = 'mt_seen_welcome';
function checkWelcomeModal() {
  if (localStorage.getItem(SEEN_WELCOME_KEY)) return;
  // Existing user (has seen whats-new before) — they already know the app.
  if (localStorage.getItem(SEEN_VERSION_KEY)) {
    localStorage.setItem(SEEN_WELCOME_KEY, '1');
    return;
  }
  // Brand-new user: show the intro slides.
  showWelcomeModal();
}

function showWelcomeModal() {
  let slide = 1;
  const total = 3;
  const modal = $('#welcomeModal');
  modal.classList.remove('hidden');

  const renderSlide = () => {
    $$('.welcome-slide').forEach(el => {
      el.classList.toggle('hidden', parseInt(el.dataset.slide) !== slide);
    });
    $$('.welcome-dot').forEach(d => {
      d.classList.toggle('active', parseInt(d.dataset.dot) === slide);
    });
    $('#welcomePrevBtn').classList.toggle('hidden', slide === 1);
    $('#welcomeNextBtn').textContent = slide === total ? 'Começar' : 'Próximo';
  };
  renderSlide();

  // Mark seen + close, idempotent
  const dismiss = () => {
    localStorage.setItem(SEEN_WELCOME_KEY, '1');
    modal.classList.add('hidden');
  };

  $('#welcomeNextBtn').onclick = () => {
    if (slide >= total) dismiss();
    else { slide += 1; renderSlide(); }
  };
  $('#welcomePrevBtn').onclick = () => {
    if (slide > 1) { slide -= 1; renderSlide(); }
  };
  $('#welcomeSkipBtn').onclick = dismiss;
  modal.onclick = (e) => { if (e.target === modal) dismiss(); };
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

  // Admin: preview-mode exit button (in the persistent yellow banner)
  $('#previewExitBtn')?.addEventListener('click', exitPreview);

  // Finance view + modal
  $('#financeMonthPrev')?.addEventListener('click', () => changeFinanceMonth(-1));
  $('#financeMonthNext')?.addEventListener('click', () => changeFinanceMonth(+1));
  $('#financeFilterType')?.addEventListener('change', (e) => {
    state.finance.filterType = e.target.value;
    renderFinancial();
  });
  $('#financeFilterCategory')?.addEventListener('change', (e) => {
    state.finance.filterCategory = e.target.value;
    renderFinancial();
  });
  $('#financeAddBtn')?.addEventListener('click', () => openFinanceTxModal(null));
  $('#financeTxCloseBtn')?.addEventListener('click', closeFinanceTxModal);
  $('#financeTxCancelBtn')?.addEventListener('click', closeFinanceTxModal);
  $('#financeTxSaveBtn')?.addEventListener('click', saveFinanceTx);
  $('#financeTxDeleteBtn')?.addEventListener('click', deleteFinanceTx);
  $$('#financeTxModal [data-tx-type]').forEach(b =>
    b.addEventListener('click', () => setFinanceTxType(b.dataset.txType))
  );
  $('#financeTxModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'financeTxModal') closeFinanceTxModal();
  });

  // Admin: delete-user confirmation modal
  $('#deleteUserCloseBtn')?.addEventListener('click', closeDeleteUserModal);
  $('#deleteUserCancelBtn')?.addEventListener('click', closeDeleteUserModal);
  $('#deleteUserConfirm')?.addEventListener('input', (e) => {
    const expected = (_deleteUserTarget?.email || '').toLowerCase();
    const typed    = e.target.value.trim().toLowerCase();
    $('#deleteUserConfirmBtn').disabled = !expected || typed !== expected;
  });
  $('#deleteUserConfirmBtn')?.addEventListener('click', confirmDeleteUser);
  // Click on backdrop closes
  $('#deleteUserModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'deleteUserModal') closeDeleteUserModal();
  });

  $$('.view-tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  $('#searchInput').addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    renderCurrentView();
  });

  // Card modal
  $('#cardForm').addEventListener('submit', saveCard);
  $('#cardDeleteBtn').addEventListener('click', deleteCard);
  // Card-finance bridge: re-render finance section when category or amount changes,
  // and wire the "Marcar como pago" button
  $('#cardCategoryInput').addEventListener('change', () => {
    applyCardFinanceVisibility(null);
    applyCardCustomCategoryVisibility();
  });
  $('#cardRecurrenceToggle')?.addEventListener('change', (e) => {
    $('#cardRecurrenceMonthsRow').classList.toggle('hidden', !e.target.checked);
  });
  $('#cardAmountInput')?.addEventListener('input', () => {
    const btn = $('#cardMarkPaidBtn');
    if (!btn || btn.classList.contains('hidden')) return;
    const hasId  = !!$('#cardId').value;
    const hasAmt = parseBrlToCents($('#cardAmountInput').value) > 0;
    btn.disabled = !hasId || !hasAmt;
  });
  $('#cardMarkPaidBtn')?.addEventListener('click', markCardAsPaid);

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
    else { $('#boardTitle').textContent = 'Crie seu primeiro quadro'; $('#listsContainer').innerHTML = '<div class="kanban-empty"><div class="kanban-empty-emoji">👋</div><h3>Bem-vindo ao Flux!</h3><p>Aqui você organiza suas tarefas em quadros. Cada quadro é tipo um projeto, dividido em colunas (etapas) e tarefas que você arrasta entre elas.</p><p class="kanban-empty-hint">Use o botão <strong>Novo Quadro</strong> na barra lateral pra criar o primeiro.</p></div>'; }
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

  // Brand "home" — clicking the Flux logo/title in the sidebar takes the user
  // back to the kanban view of the current board. If they're in a workspace-
  // level view (Activity/Analytics/Settings), goes back to the last per-board
  // view they had open. No-op if no board is loaded yet.
  $('#brandHome')?.addEventListener('click', () => {
    if (!state.currentBoardId) return;
    const target = WORKSPACE_VIEWS.has(state.view) ? (state.lastBoardView || 'kanban') : 'kanban';
    switchView(target);
  });

  // Members modal
  $('#membersBtn').addEventListener('click', openMembersModal);
  $('#generateInviteBtn').addEventListener('click', generateInvite);
  $('#copyInviteBtn').addEventListener('click', copyInviteLink);
  $('#newInviteBtn').addEventListener('click', startNewInvite);
  setupInviteChipsInput();

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
  $('#refreshTodayBtn')?.addEventListener('click', renderToday);

  // Tour wiring
  $('#tourNextBtn')?.addEventListener('click', () => {
    if (_tour.idx >= TOUR_STEPS.length - 1) endTour();
    else { _tour.idx += 1; showTourStep(); }
  });
  $('#tourPrevBtn')?.addEventListener('click', () => {
    if (_tour.idx > 0) { _tour.idx -= 1; showTourStep(); }
  });
  $('#tourSkipBtn')?.addEventListener('click', endTour);
  $('#helpStartTourBtnTop')?.addEventListener('click', startTour);
  $('#helpAskQuestionBtn')?.addEventListener('click', openBugModal);
  $('#welcomeStartTourBtn')?.addEventListener('click', () => {
    // Dismiss welcome (mark seen) and immediately start the tour
    localStorage.setItem(SEEN_WELCOME_KEY, '1');
    $('#welcomeModal').classList.add('hidden');
    startTour();
  });

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
