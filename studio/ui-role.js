/**
 * Admin vs Guest chrome.
 * Admin = full backend (lab, dock, community, options, colony commands).
 * Guest = look / weather / places / photo / cinema — no colony surgery.
 * Persists in localStorage. Spectator port stays read-only guest-only.
 */
const STORAGE = 'flyans-ui-role';
const STORAGE_LOCK = 'flyans-ui-guest-lock';

/** @typedef {'admin'|'guest'} UiRole */

export function loadRole() {
  try {
    const v = localStorage.getItem(STORAGE);
    if (v === 'admin' || v === 'guest') return v;
  } catch {
    /* ignore */
  }
  // First visit on the owner port: Admin (this is your machine). Guests you switch.
  return 'admin';
}

export function saveRole(role) {
  try {
    localStorage.setItem(STORAGE, role);
  } catch {
    /* ignore */
  }
}

export function isGuestLocked() {
  try {
    return localStorage.getItem(STORAGE_LOCK) === '1';
  } catch {
    return false;
  }
}

export function setGuestLock(on) {
  try {
    if (on) localStorage.setItem(STORAGE_LOCK, '1');
    else localStorage.removeItem(STORAGE_LOCK);
  } catch {
    /* ignore */
  }
}

/**
 * Apply role to the document. Spectator force-guest (no admin chrome).
 * @param {UiRole} role
 * @param {{ readOnly?: boolean }} [opts]
 */
export function applyRole(role, opts = {}) {
  const readOnly = !!opts.readOnly;
  const effective = readOnly ? 'guest' : role;
  document.body.classList.toggle('role-admin', effective === 'admin');
  document.body.classList.toggle('role-guest', effective === 'guest');
  document.body.dataset.uiRole = effective;

  // Pop admin panels away when entering guest so the world reads first.
  if (effective === 'guest') {
    try {
      const lab = document.getElementById('lab');
      if (lab) lab.classList.add('is-popped-in');
      const dock = document.getElementById('dock');
      if (dock) dock.classList.add('is-popped-in');
      const community = document.getElementById('community-panel');
      if (community) {
        community.hidden = true;
        community.classList.add('is-popped-in');
      }
      const chat = document.getElementById('chat');
      if (chat) chat.classList.remove('open');
      const options = document.getElementById('options-panel');
      if (options) options.hidden = true;
      const chron = document.getElementById('chronicle-panel');
      if (chron) chron.hidden = true;
    } catch {
      /* ignore */
    }
  }

  const badge = document.getElementById('ui-role-badge');
  if (badge) {
    badge.textContent = effective === 'admin' ? 'Admin' : 'Guest';
    badge.title =
      effective === 'admin'
        ? 'Admin mode — full colony controls. Click to switch to Guest.'
        : 'Guest mode — look & explore only. Shift+Alt+A (or click) for Admin.';
    badge.dataset.role = effective;
  }

  const lockBtn = document.getElementById('ui-role-lock');
  if (lockBtn) {
    const locked = isGuestLocked();
    lockBtn.hidden = effective !== 'admin' && !locked;
    lockBtn.textContent = locked ? 'Unlock guest' : 'Lock guest';
    lockBtn.title = locked
      ? 'Guest lock on — Admin needs Shift+Alt+A'
      : 'Lock Guest so casual clicks cannot open Admin';
  }

  try {
    polishGuestChrome();
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('flyans-ui-role', { detail: { role: effective } }));
  return effective;
}

/**
 * Wire badge + keyboard. Call once after DOM is ready.
 * @param {{ readOnly?: boolean, onChange?: (role: UiRole) => void }} [opts]
 */
export function setupUiRole(opts = {}) {
  const readOnly = !!opts.readOnly;
  let role = loadRole();
  if (readOnly) role = 'guest';

  ensureChrome();
  applyRole(role, { readOnly });

  const set = (next) => {
    if (readOnly) return;
    if (next === 'admin' && isGuestLocked()) {
      // Still allow Shift+Alt+A path — caller already decided.
    }
    role = next;
    saveRole(role);
    applyRole(role, { readOnly });
    opts.onChange?.(role);
  };

  // No role-switcher chrome and no Admin/Guest hotkeys in the public build.
  void set;

  return {
    getRole: () => (readOnly ? 'guest' : role),
    setRole: set,
    apply: () => applyRole(role, { readOnly })
  };
}

function noteUnlockHint() {
  const el = document.getElementById('fly-status');
  if (el) {
    const prev = el.innerHTML;
    el.innerHTML = 'Guest locked — press <b>Shift+Alt+A</b> for Admin';
    setTimeout(() => {
      try {
        el.innerHTML = prev;
      } catch {
        /* ignore */
      }
    }, 2800);
  }
}

function ensureChrome() {
  // Public build: single play mode — no role-switcher chrome is injected.
}

/** Soft glass polish for guest explore chrome (called after role applies). */
export function polishGuestChrome() {
  const qc = document.getElementById('quick-controls');
  if (!qc) return;
  qc.classList.toggle('guest-chrome', document.body.classList.contains('role-guest'));
}
