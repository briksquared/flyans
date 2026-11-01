/**
 * Real-program chrome for the colony studio: Help, About, Shortcuts,
 * first-run welcome, and a session/autosave status pill.
 * Works in browser (:8776) and inside FLYANS (Electron).
 */

const FIRST_RUN_KEY = 'flyans-first-run-v1';
const SESSION_KEY = 'flyans-session-meta';

/** @typedef {{ saveWorld?: () => void, openOptions?: () => void, openChronicle?: () => void, togglePhoto?: () => void, toggleCinema?: () => void, setRole?: (r: string) => void }} ShellApi */

/**
 * @param {ShellApi} api
 */
export function setupAppShell(api = {}) {
  injectStyles();
  ensureDom();
  wireButtons(api);
  wireKeyboard(api);
  wireFlyansMenu(api);
  paintSession();
  maybeFirstRun();
  return {
    openHelp,
    openAbout,
    openShortcuts,
    noteSaved,
    noteAutosave,
    setSaveStatus,
    paintSession
  };
}

function ensureDom() {
  if (!document.getElementById('app-session')) {
    const pill = document.createElement('div');
    pill.id = 'app-session';
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML = `<span class="as-dot" aria-hidden="true"></span><span class="as-text">Session…</span>`;
    document.body.appendChild(pill);
  }
  if (!document.getElementById('app-modals')) {
    const wrap = document.createElement('div');
    wrap.id = 'app-modals';
    wrap.innerHTML = `
      <div id="app-modal" class="app-modal" hidden role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div class="app-modal-card">
          <header>
            <h2 id="app-modal-title">Help</h2>
            <button type="button" class="app-modal-x" title="Close (Esc)">×</button>
          </header>
          <div class="app-modal-body" id="app-modal-body"></div>
          <footer class="app-modal-foot">
            <button type="button" class="app-modal-ok">Got it</button>
          </footer>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.app-modal-x').onclick = closeModal;
    wrap.querySelector('.app-modal-ok').onclick = closeModal;
    wrap.querySelector('#app-modal').addEventListener('click', (e) => {
      if (e.target.id === 'app-modal') closeModal();
    });
  }
  // Help entry on quick-controls (guest + admin)
  const qc = document.getElementById('quick-controls');
  if (qc && !document.getElementById('app-help-btn')) {
    const row = document.createElement('div');
    row.className = 'qc-row';
    row.id = 'app-help-row';
    row.innerHTML = `
      <span class="qc-label">app</span>
      <button type="button" class="qc-gear" id="app-help-btn" title="Help (F1)">❓ Help</button>
      <button type="button" class="qc-gear" id="app-keys-btn" title="Keyboard shortcuts (?)">⌨ Keys</button>
      <button type="button" class="qc-gear" id="app-about-btn" title="About">ℹ About</button>
      <button type="button" class="qc-gear admin-only" data-role="admin" id="app-save-btn" title="Save world (Ctrl+S)">💾 Save</button>`;
    qc.appendChild(row);
  }
}

function wireButtons(api) {
  document.getElementById('app-help-btn')?.addEventListener('click', () => openHelp());
  document.getElementById('app-keys-btn')?.addEventListener('click', () => openShortcuts());
  document.getElementById('app-about-btn')?.addEventListener('click', () => openAbout());
  document.getElementById('app-save-btn')?.addEventListener('click', () => {
    try {
      api.saveWorld?.();
      noteSaved('World save requested');
    } catch (e) {
      noteAutosave('Save failed', true);
    }
  });
}

function wireKeyboard(api) {
  addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'Escape') {
      const modal = document.getElementById('app-modal');
      if (modal && !modal.hidden) {
        e.preventDefault();
        closeModal();
        return;
      }
    }
    if (e.key === 'F1') {
      e.preventDefault();
      openHelp();
      return;
    }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openShortcuts();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (document.body.classList.contains('role-guest')) {
        noteAutosave('Guest mode — switch to Admin to save', true);
        return;
      }
      try {
        api.saveWorld?.();
        noteSaved('Saved (Ctrl+S)');
      } catch (_) {
        noteAutosave('Save failed', true);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      api.openOptions?.();
      return;
    }
    // Slash focuses the quick-bar filter (when not typing elsewhere).
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const filter = document.getElementById('quickbar-filter');
      const dock = document.getElementById('dock');
      if (filter && dock && !dock.classList.contains('minimized')) {
        e.preventDefault();
        try {
          dock.classList.remove('quickbar-collapsed');
          localStorage.setItem('fly-quickbar-collapsed', '0');
          const toggle = document.getElementById('quickbar-toggle');
          if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
            toggle.textContent = '▾ Quick buttons';
          }
        } catch {
          /* ignore */
        }
        filter.focus();
        filter.select();
      }
    }
  });
}

function wireFlyansMenu(api) {
  const fly = typeof window !== 'undefined' ? window.FLYANS : null;
  if (!fly || typeof fly.onCommand !== 'function') return;
  fly.onCommand((cmd) => {
    switch (cmd) {
      case 'help':
        openHelp();
        break;
      case 'about':
        openAbout();
        break;
      case 'shortcuts':
        openShortcuts();
        break;
      case 'save':
        try {
          api.saveWorld?.();
          noteSaved('Saved from menu');
        } catch (_) {
          noteAutosave('Save failed', true);
        }
        break;
      case 'options':
        api.openOptions?.();
        break;
      case 'chronicle':
        api.openChronicle?.();
        break;
      case 'photo':
        api.togglePhoto?.();
        break;
      case 'cinema':
        api.toggleCinema?.();
        break;
      case 'guest':
        api.setRole?.('guest');
        break;
      case 'admin':
        api.setRole?.('admin');
        break;
      default:
        break;
    }
  });
}

function openHelp() {
  showModal(
    'Help',
    `
    <p class="app-lead">FLYANS is a living fly colony observatory. Explore the valley, watch the flies live their day, and steer the colony — build, rites, commands.</p>
    <h3>Getting around</h3>
    <ul>
      <li>Drag to orbit · scroll to zoom · right-drag to pan</li>
      <li>Places / weather rows jump the camera and sky</li>
      <li><b>World</b> (Alt+0) frames the whole valley · <b>B1–B4</b> camera bookmarks (Alt+1–4; Alt+Shift+digit to save)</li>
      <li><b>Photo (P)</b> hides chrome for a clean shot · <b>Cinema (C)</b> trims UI</li>
      <li>Bottom-left <b>readiness chips</b> — FPS, save, season</li>
      <li><b>/</b> filters quick commands · <b>export / import world</b> share a colony JSON</li>
      <li>Camera path: <kbd>Alt</kbd>+<kbd>R</kbd> record · <kbd>Alt</kbd>+<kbd>K</kbd> keyframe · <kbd>Alt</kbd>+<kbd>P</kbd> play</li>
      <li>Temple rites: <em>earth rite</em> · <em>west rite</em> · <em>water rite</em></li>
    </ul>
    <h3>Movie studio</h3>
    <ul>
      <li>North-corner lot past the Jade · <b>Esplanade of Pyramids</b> (ten temples)</li>
      <li>Film desk: cast · dress · film school · approach shot → videos in <code>riffs/videos/</code></li>
      <li>Say <em>esplanade</em>, <em>film lot</em>, <em>stage 2</em>, or <em>approach shot</em></li>
    </ul>
    <h3>The living colony</h3>
    <ul>
      <li>Flies keep their own hours: market, craft, evening music, roost</li>
      <li>Rain sends them indoors; clear skies bring them back out</li>
      <li>Status bar shows who is living · beat chip names the current hour of life</li>
    </ul>
    <p class="app-foot-note">Press <kbd>F1</kbd> anytime · <kbd>?</kbd> for shortcuts · <kbd>Ctrl+S</kbd> to save.</p>`
  );
}

function openShortcuts() {
  showModal(
    'Keyboard shortcuts',
    `
    <table class="app-keys">
      <tr><td><kbd>F1</kbd></td><td>Help</td></tr>
      <tr><td><kbd>?</kbd></td><td>This shortcuts list</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save world</td></tr>
      <tr><td><kbd>/</kbd></td><td>Filter quick-bar commands</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>R</kbd></td><td>Toggle camera-path recording</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>K</kbd></td><td>Add path keyframe</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>P</kbd></td><td>Play camera path</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>,</kbd></td><td>Options</td></tr>
      <tr><td><kbd>P</kbd></td><td>Photo mode</td></tr>
      <tr><td><kbd>C</kbd></td><td>Cinematic chrome</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>0</kbd></td><td>Frame whole valley</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>1</kbd>–<kbd>4</kbd></td><td>Go to camera bookmark</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>4</kbd></td><td>Save bookmark</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close panels / exit photo</td></tr>
    </table>
    <p class="app-foot-note">In FLYANS, the app menu also has File · View · Colony · Help.</p>`
  );
}

function openAbout() {
  const ver = window.__STUDIO_VERSION || '—';
  const date = window.__STUDIO_DATE || '';
  const build = window.__STUDIO_BUILD || '';
  const port = location.port || '80';
  const role = document.body.dataset.uiRole || 'admin';
  const flyVer = window.FLYANS?.version ? '…' : null;
  showModal(
    'About',
    `
    <p class="app-lead"><b>FLYANS</b> — fly colony observatory</p>
    <ul class="app-meta">
      <li>Studio <b>v${ver}</b>${date ? ` · ${date}` : ''}</li>
      <li>Port <b>:${port}</b> · role <b>${role}</b></li>
      ${build ? `<li class="app-muted">${escapeHtml(build)}</li>` : ''}
    </ul>
    <p class="app-foot-note">Gabe · God · Ruler · King</p>`
  );
  if (window.FLYANS?.version) {
    window.FLYANS.version().then((v) => {
      const body = document.getElementById('app-modal-body');
      if (!body || document.getElementById('app-modal-title')?.textContent !== 'About') return;
      const li = document.createElement('li');
      li.innerHTML = `App shell <b>FLYANS ${escapeHtml(String(v))}</b>`;
      body.querySelector('.app-meta')?.prepend(li);
    }).catch(() => {});
  }
}

function maybeFirstRun() {
  try {
    if (localStorage.getItem(FIRST_RUN_KEY) === '1') return;
  } catch {
    return;
  }
  setTimeout(() => {
    showModal(
      'Welcome',
      `
      <p class="app-lead">Welcome to the colony.</p>
      <p>You're looking at a living valley of flies — they work, feast, teach, and roost on their own.</p>
      <ul>
        <li>Build, hold rites, and run commands — or just watch the colony live</li>
        <li>Press <kbd>F1</kbd> for help anytime</li>
      </ul>`
    );
    try {
      localStorage.setItem(FIRST_RUN_KEY, '1');
    } catch {
      /* ignore */
    }
  }, 2200);
}

function showModal(title, html) {
  const modal = document.getElementById('app-modal');
  const t = document.getElementById('app-modal-title');
  const body = document.getElementById('app-modal-body');
  if (!modal || !t || !body) return;
  t.textContent = title;
  body.innerHTML = html;
  modal.hidden = false;
}

function closeModal() {
  const modal = document.getElementById('app-modal');
  if (modal) modal.hidden = true;
}

function paintSession() {
  const el = document.getElementById('app-session');
  if (!el) return;
  const text = el.querySelector('.as-text');
  let meta = {};
  try {
    meta = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
  } catch {
    meta = {};
  }
  const when = meta.lastSave ? relativeTime(meta.lastSave) : null;
  const role = document.body.dataset.uiRole || 'admin';
  if (text) {
    text.textContent = when
      ? `Saved ${when} · ${role}`
      : `Ready · ${role}`;
  }
  el.classList.toggle('warn', !!meta.error);
  el.classList.add('on');
}

export function noteSaved(detail) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ lastSave: Date.now(), detail: String(detail || 'ok'), error: false })
    );
  } catch {
    /* ignore */
  }
  const el = document.getElementById('app-session');
  if (el) {
    el.classList.remove('warn');
    el.classList.add('flash');
    const text = el.querySelector('.as-text');
    if (text) text.textContent = detail || 'Saved';
    setTimeout(() => {
      el.classList.remove('flash');
      paintSession();
    }, 2200);
  }
}

export function noteAutosave(detail, isError = false) {
  const el = document.getElementById('app-session');
  if (!el) return;
  el.classList.toggle('warn', !!isError);
  el.classList.add('on', 'flash');
  const text = el.querySelector('.as-text');
  if (text) text.textContent = detail || (isError ? 'Save issue' : 'Autosaved');
  setTimeout(() => {
    el.classList.remove('flash');
    if (!isError) paintSession();
  }, 2400);
}

/**
 * Autosave status light — saving / saved / paused (lease) / error / idle.
 * @param {'idle'|'saving'|'saved'|'paused'|'error'} state
 * @param {string} [detail]
 */
export function setSaveStatus(state, detail) {
  const el = document.getElementById('app-session');
  if (!el) return;
  const text = el.querySelector('.as-text');
  el.classList.remove('warn', 'saving', 'saved', 'paused', 'flash');
  el.classList.add('on');
  const labels = {
    idle: null,
    saving: detail || 'Saving…',
    saved: detail || 'Saved',
    paused: detail || 'Another tab is saving',
    error: detail || 'Save issue'
  };
  if (state === 'error' || state === 'paused') el.classList.add('warn');
  if (state === 'saving') el.classList.add('saving', 'flash');
  if (state === 'saved') el.classList.add('saved', 'flash');
  if (state === 'paused') el.classList.add('paused');
  if (text && labels[state]) text.textContent = labels[state];
  if (state === 'saved') {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ lastSave: Date.now(), detail: String(detail || 'ok'), error: false })
      );
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      el.classList.remove('flash', 'saved');
      paintSession();
    }, 2600);
  } else if (state === 'idle') {
    paintSession();
  }
}

function relativeTime(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectStyles() {
  if (document.getElementById('app-shell-css')) return;
  const style = document.createElement('style');
  style.id = 'app-shell-css';
  style.textContent = `
    #app-session{
      position:fixed;z-index:48;right:12px;bottom:12px;pointer-events:none;
      display:flex;align-items:center;gap:8px;opacity:0;transition:opacity .35s ease;
      font:500 12px/1.3 system-ui,sans-serif;color:#c8c8c8;padding:8px 12px;border-radius:8px;
      background:#000;border:1px solid #2a2a2a;box-shadow:0 8px 24px #0008;
    }
    #app-session.on{opacity:.92}
    #app-session.flash{opacity:1;border-color:#555;color:#f0f0f0}
    #app-session.warn{border-color:#664444;color:#e8c8c8}
    #app-session.saving{border-color:#6a5a2a;color:#f0e6c0}
    #app-session.saved{border-color:#2a4a32;color:#c8e8d0}
    #app-session.paused{border-color:#5a4a28;color:#e8d8b0}
    #app-session .as-dot{width:8px;height:8px;border-radius:50%;background:#7a7a7a;box-shadow:none}
    #app-session.warn .as-dot{background:#c07070}
    #app-session.saving .as-dot{background:#d4b84a;box-shadow:0 0 0 0 rgba(212,184,74,.55);animation:as-pulse 1s ease-out infinite}
    #app-session.saved .as-dot{background:#4caf70}
    #app-session.paused .as-dot{background:#c9a227}
    @keyframes as-pulse{
      0%{box-shadow:0 0 0 0 rgba(212,184,74,.55)}
      70%{box-shadow:0 0 0 8px rgba(212,184,74,0)}
      100%{box-shadow:0 0 0 0 rgba(212,184,74,0)}
    }
    body.photomode #app-session,body.cinematic #app-session{opacity:0 !important}
    body.role-guest #app-save-btn{display:none !important}
    .app-modal{
      position:fixed;inset:0;z-index:100100;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.72);padding:24px;
    }
    .app-modal[hidden]{display:none !important}
    .app-modal-card{
      width:min(440px,92vw);max-height:min(78vh,640px);overflow:auto;
      background:#000;border:1px solid #2a2a2a;border-radius:12px;
      box-shadow:0 24px 64px #000a;color:#e6e6e6;
      font:14px/1.45 system-ui,Segoe UI,sans-serif;
    }
    .app-modal-card header{
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:16px 18px 10px;border-bottom:1px solid #222;
    }
    .app-modal-card h2{margin:0;font:600 16px/1.2 system-ui,sans-serif;color:#f2f2f2}
    .app-modal-x{border:0;background:transparent;color:#888;font:22px/1 sans-serif;cursor:pointer;padding:0 4px}
    .app-modal-x:hover{color:#fff}
    .app-modal-body{padding:14px 18px 6px}
    .app-modal-body h3{margin:16px 0 6px;font:600 12px/1.2 system-ui,sans-serif;
      letter-spacing:.06em;text-transform:uppercase;color:#a8a8a8}
    .app-modal-body ul{margin:0 0 8px;padding-left:1.15em}
    .app-modal-body li{margin:0.4em 0}
    .app-lead{margin:0 0 10px;color:#eaeaea}
    .app-meta{list-style:none;padding:0;margin:0}
    .app-meta li{padding:6px 0;border-bottom:1px solid #1e1e1e}
    .app-muted{color:#888;font-size:12px}
    .app-foot-note{margin:12px 0 4px;font-size:12px;color:#888}
    .app-modal-foot{padding:10px 18px 16px;display:flex;justify-content:flex-end}
    .app-modal-ok{
      font:600 13px/1 system-ui,sans-serif;color:#111;background:#e8e8e8;
      border:0;border-radius:8px;padding:10px 18px;min-height:40px;cursor:pointer;
    }
    .app-modal-ok:hover{background:#fff}
    kbd{
      display:inline-block;font:600 11px/1 ui-monospace,monospace;padding:3px 7px;border-radius:4px;
      background:#141414;border:1px solid #333;color:#e0e0e0;
    }
    table.app-keys{width:100%;border-collapse:collapse;font:13px/1.4 system-ui,sans-serif}
    table.app-keys td{padding:8px 4px;border-bottom:1px solid #1e1e1e;vertical-align:middle}
    table.app-keys td:first-child{width:42%;white-space:nowrap}
  `;
  document.head.appendChild(style);
}
