/**
 * Floating panel windows — drag, resize, lock/unlock, layout persist.
 * Unlock → move & size freely. Lock → stay put. Saved in localStorage.
 */

const STORAGE = 'flyans-panel-layout-v1';
const Z_BASE = 50000;
let zTop = Z_BASE;

/** @type {Map<string, ReturnType<typeof attachWindow>>} */
const windows = new Map();

function loadAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveAll(map) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function ensureStyles() {
  if (document.getElementById('panel-windows-css')) return;
  const css = document.createElement('style');
  css.id = 'panel-windows-css';
  css.textContent = `
    .fly-win {
      box-sizing: border-box !important;
      max-width: none !important;
      max-height: none !important;
      overflow: auto;
    }
    .fly-win.fly-win-free {
      position: fixed !important;
      right: auto !important;
      bottom: auto !important;
      margin: 0 !important;
      transform: none !important;
    }
    .fly-win-handle {
      cursor: grab;
      user-select: none;
      -webkit-app-region: no-drag;
      touch-action: none;
    }
    .fly-win:not(.fly-win-locked) .fly-win-handle:active { cursor: grabbing; }
    .fly-win.fly-win-locked .fly-win-handle { cursor: default; }
    .fly-win-grip {
      position: absolute; z-index: 6; width: 14px; height: 14px;
      right: 2px; bottom: 2px; cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, #555 50%, #555 62%, transparent 62%),
                  linear-gradient(135deg, transparent 68%, #888 68%, #888 80%, transparent 80%);
      opacity: .85; touch-action: none;
    }
    .fly-win.fly-win-locked .fly-win-grip { display: none; }
    .fly-win-lock {
      border: 1px solid #333; background: #141414; color: #e8e8e8;
      border-radius: 7px; padding: 6px 10px; font: 600 11px/1 system-ui,sans-serif;
      cursor: pointer; min-height: 32px; margin-left: auto;
    }
    .fly-win-lock:hover { border-color: #555; color: #fff; }
    .fly-win-lock[aria-pressed="true"] {
      background: #222; border-color: #666; color: #fff;
    }
    .fly-win-tools {
      display: flex; align-items: center; gap: 6px; flex: none; margin-left: auto;
    }
    .fly-panel-bar .fly-win-tools { margin-left: 0; }
    .fly-win.fly-win-dragging, .fly-win.fly-win-resizing {
      opacity: .96; outline: 1px solid #555;
    }
  `;
  document.head.appendChild(css);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function readLayout(id) {
  return loadAll()[id] || null;
}

function writeLayout(id, patch) {
  const all = loadAll();
  all[id] = { ...(all[id] || {}), ...patch };
  saveAll(all);
  return all[id];
}

function bringFront(el) {
  zTop += 1;
  el.style.zIndex = String(zTop);
}

/**
 * Convert whatever CSS placement the panel has into explicit left/top/width/height.
 */
function materialize(el, minW, minH) {
  const r = el.getBoundingClientRect();
  const w = clamp(r.width || minW, minW, window.innerWidth - 8);
  const h = clamp(r.height || minH, minH, window.innerHeight - 8);
  let left = r.left;
  let top = r.top;
  left = clamp(left, 0, Math.max(0, window.innerWidth - w));
  top = clamp(top, 0, Math.max(0, window.innerHeight - h));
  el.classList.add('fly-win-free');
  el.style.setProperty('left', `${Math.round(left)}px`, 'important');
  el.style.setProperty('top', `${Math.round(top)}px`, 'important');
  el.style.setProperty('width', `${Math.round(w)}px`, 'important');
  el.style.setProperty('height', `${Math.round(h)}px`, 'important');
  el.style.setProperty('right', 'auto', 'important');
  el.style.setProperty('bottom', 'auto', 'important');
  return { left, top, width: w, height: h };
}

function applySaved(el, layout, minW, minH) {
  if (!layout || !Number.isFinite(layout.left) || !Number.isFinite(layout.top)) return false;
  const w = clamp(layout.width || minW, minW, window.innerWidth - 8);
  const h = clamp(layout.height || minH, minH, window.innerHeight - 8);
  const left = clamp(layout.left, 0, Math.max(0, window.innerWidth - w));
  const top = clamp(layout.top, 0, Math.max(0, window.innerHeight - h));
  el.classList.add('fly-win-free');
  el.style.setProperty('left', `${Math.round(left)}px`, 'important');
  el.style.setProperty('top', `${Math.round(top)}px`, 'important');
  el.style.setProperty('width', `${Math.round(w)}px`, 'important');
  el.style.setProperty('height', `${Math.round(h)}px`, 'important');
  el.style.setProperty('right', 'auto', 'important');
  el.style.setProperty('bottom', 'auto', 'important');
  return true;
}

function findOrMakeHandle(el, handleSelector) {
  if (handleSelector) {
    const h = el.querySelector(handleSelector);
    if (h) {
      h.classList.add('fly-win-handle');
      return h;
    }
  }
  let bar = el.querySelector(':scope > .fly-panel-bar');
  if (bar) {
    bar.classList.add('fly-win-handle');
    return bar;
  }
  const h3 = el.querySelector(':scope > h3, :scope > header');
  if (h3) {
    h3.classList.add('fly-win-handle');
    return h3;
  }
  bar = document.createElement('div');
  bar.className = 'fly-panel-bar fly-win-handle';
  bar.innerHTML = `<span class="fly-panel-title">${el.getAttribute('aria-label') || el.id || 'Panel'}</span>`;
  if (el.firstChild) el.insertBefore(bar, el.firstChild);
  else el.appendChild(bar);
  return bar;
}

function ensureTools(handle, lockBtn) {
  let tools = handle.querySelector(':scope > .fly-win-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'fly-win-tools';
    handle.appendChild(tools);
  }
  if (!tools.contains(lockBtn)) tools.appendChild(lockBtn);
  return tools;
}

/**
 * @param {HTMLElement} el
 * @param {{ id?: string, minW?: number, minH?: number, handle?: string, defaultLocked?: boolean, resize?: boolean }} opts
 */
export function attachWindow(el, opts = {}) {
  if (!el || el.dataset.flyWinAttached === '1') {
    return windows.get(opts.id || el?.id) || null;
  }
  ensureStyles();
  const id = opts.id || el.id;
  if (!id) return null;
  const minW = opts.minW ?? 200;
  const minH = opts.minH ?? 120;
  const canResize = opts.resize !== false;
  const saved = readLayout(id);
  const locked = saved?.locked ?? (opts.defaultLocked !== false); // default locked = stay put

  el.classList.add('fly-win');
  el.dataset.flyWinAttached = '1';
  el.dataset.flyWinId = id;
  if (getComputedStyle(el).position === 'static') el.style.position = 'fixed';

  if (saved && Number.isFinite(saved.left)) applySaved(el, saved, minW, minH);
  if (locked) el.classList.add('fly-win-locked');
  else el.classList.remove('fly-win-locked');

  const handle = findOrMakeHandle(el, opts.handle);
  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'fly-win-lock';
  lockBtn.title = 'Lock / unlock position & size';
  const paintLock = () => {
    const on = el.classList.contains('fly-win-locked');
    // Button shows the action you can take (and pressed = currently locked).
    lockBtn.textContent = on ? 'Unlock' : 'Lock';
    lockBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    lockBtn.title = on
      ? 'Panel is locked — click to unlock drag & resize'
      : 'Panel is free — click to lock it in place';
  };
  paintLock();
  ensureTools(handle, lockBtn);

  let grip = null;
  if (canResize) {
    grip = document.createElement('div');
    grip.className = 'fly-win-grip';
    grip.title = 'Drag to resize';
    el.appendChild(grip);
  }

  const state = {
    id,
    el,
    locked: () => el.classList.contains('fly-win-locked'),
    setLocked(on) {
      el.classList.toggle('fly-win-locked', !!on);
      paintLock();
      const r = el.getBoundingClientRect();
      writeLayout(id, {
        locked: !!on,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
      });
    }
  };

  lockBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.setLocked(!state.locked());
  });

  el.addEventListener('pointerdown', () => bringFront(el), true);

  // —— drag ——
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (state.locked()) return;
    if (e.button !== 0) return;
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    e.preventDefault();
    bringFront(el);
    if (!el.classList.contains('fly-win-free')) materialize(el, minW, minH);
    const r = el.getBoundingClientRect();
    drag = {
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
      pid: e.pointerId
    };
    el.classList.add('fly-win-dragging');
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  const onDragMove = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const w = el.getBoundingClientRect().width;
    const h = el.getBoundingClientRect().height;
    const left = clamp(e.clientX - drag.ox, 0, window.innerWidth - Math.min(w, 40));
    const top = clamp(e.clientY - drag.oy, 0, window.innerHeight - 40);
    el.style.setProperty('left', `${Math.round(left)}px`, 'important');
    el.style.setProperty('top', `${Math.round(top)}px`, 'important');
  };
  const onDragEnd = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag = null;
    el.classList.remove('fly-win-dragging');
    const r = el.getBoundingClientRect();
    writeLayout(id, {
      locked: state.locked(),
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height
    });
  };
  handle.addEventListener('pointermove', onDragMove);
  handle.addEventListener('pointerup', onDragEnd);
  handle.addEventListener('pointercancel', onDragEnd);

  // —— resize ——
  let resize = null;
  if (grip) {
    grip.addEventListener('pointerdown', (e) => {
      if (state.locked()) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      bringFront(el);
      if (!el.classList.contains('fly-win-free')) materialize(el, minW, minH);
      const r = el.getBoundingClientRect();
      resize = {
        x: e.clientX,
        y: e.clientY,
        w: r.width,
        h: r.height,
        pid: e.pointerId
      };
      el.classList.add('fly-win-resizing');
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    const onResizeMove = (e) => {
      if (!resize || e.pointerId !== resize.pid) return;
      const nw = clamp(resize.w + (e.clientX - resize.x), minW, window.innerWidth - 8);
      const nh = clamp(resize.h + (e.clientY - resize.y), minH, window.innerHeight - 8);
      el.style.setProperty('width', `${Math.round(nw)}px`, 'important');
      el.style.setProperty('height', `${Math.round(nh)}px`, 'important');
    };
    const onResizeEnd = (e) => {
      if (!resize || e.pointerId !== resize.pid) return;
      resize = null;
      el.classList.remove('fly-win-resizing');
      const r = el.getBoundingClientRect();
      writeLayout(id, {
        locked: state.locked(),
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
      });
    };
    grip.addEventListener('pointermove', onResizeMove);
    grip.addEventListener('pointerup', onResizeEnd);
    grip.addEventListener('pointercancel', onResizeEnd);
  }

  windows.set(id, state);
  return state;
}

/**
 * Wire every known studio chrome panel.
 */
export function setupPanelWindows() {
  ensureStyles();
  const specs = [
    { id: 'lab', minW: 180, minH: 220, handle: ':scope > .fly-panel-bar' },
    { id: 'quick-controls', minW: 220, minH: 160, handle: ':scope > .fly-panel-bar' },
    { id: 'community-panel', minW: 240, minH: 200, handle: ':scope > .fly-panel-bar, :scope > header' },
    { id: 'chat', minW: 220, minH: 200, handle: ':scope > .fly-panel-bar, :scope > header' },
    { id: 'dock', minW: 320, minH: 48, handle: ':scope > .fly-panel-bar' },
    { id: 'options-panel', minW: 240, minH: 200, handle: ':scope > h3' },
    { id: 'chronicle-panel', minW: 240, minH: 180, handle: ':scope > h3' },
    { id: 'lifestory', minW: 200, minH: 120, handle: ':scope > h3' }
  ];
  const out = [];
  for (const s of specs) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    out.push(attachWindow(el, s));
  }

  // App modal card (Help / About / Keys / Welcome) — drag + resize the card itself
  const card = document.querySelector('.app-modal-card');
  if (card) {
    out.push(
      attachWindow(card, {
        id: 'app-modal-card',
        minW: 280,
        minH: 200,
        handle: ':scope > header',
        defaultLocked: false
      })
    );
  }

  // Re-attach when Options / Chronicle rebuild their h3 (content replaceChildren)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (!(t instanceof HTMLElement)) continue;
      if (t.id === 'options-panel' || t.id === 'chronicle-panel' || t.id === 'lifestory') {
        // Headers may have been rebuilt — ensure handle class + tools survive
        if (t.dataset.flyWinAttached === '1') {
          const handle = findOrMakeHandle(t, ':scope > h3');
          const existing = t.querySelector('.fly-win-lock');
          if (!existing) {
            // Full re-attach if lock vanished with replaceChildren
            t.dataset.flyWinAttached = '';
            windows.delete(t.id);
            attachWindow(t, specs.find((s) => s.id === t.id) || { id: t.id });
          } else {
            ensureTools(handle, existing);
          }
        }
      }
    }
  });
  for (const id of ['options-panel', 'chronicle-panel', 'lifestory']) {
    const el = document.getElementById(id);
    if (el) mo.observe(el, { childList: true });
  }

  return out;
}

export function resetPanelLayouts() {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    /* ignore */
  }
  location.reload();
}

export { windows as panelWindows };
