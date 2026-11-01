/**
 * FLYANS / studio panel chrome — pop in/out + UI scale.
 * Each registered panel gets a bar with Pop in (collapse to edge tab) / Pop out (restore).
 * Scale shrinks chrome so the world stays visible; persisted in localStorage.
 * Chrome look: black panels, gray-white type — no purple/gold tab wash.
 */
const STORAGE_SCALE = 'flyans-ui-scale';
const STORAGE_PANELS = 'flyans-panels-collapsed';

const DEFAULT_PANELS = [
  { id: 'lab', label: 'Lab', edge: 'left' },
  { id: 'quick-controls', label: 'Controls', edge: 'top' },
  { id: 'community-panel', label: 'Actions', edge: 'right' },
  { id: 'chat', label: 'Desk', edge: 'right' },
  { id: 'dock', label: 'Dock', edge: 'bottom' }
];

function loadCollapsed() {
  // Cinematic default: world first — chrome popped in until the user pops out.
  const cinematic = {
    lab: true,
    'quick-controls': true,
    'community-panel': true,
    chat: true,
    dock: true
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_PANELS) || 'null');
    if (raw && typeof raw === 'object') return { ...cinematic, ...raw };
  } catch {
    /* ignore */
  }
  return cinematic;
}

function saveCollapsed(map) {
  try {
    localStorage.setItem(STORAGE_PANELS, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadScale() {
  try {
    const z = parseFloat(localStorage.getItem(STORAGE_SCALE));
    if (Number.isFinite(z) && z >= 0.55 && z <= 1.15) return z;
  } catch {
    /* ignore */
  }
  // Default compact so the colony reads first; FLYANS high-DPI stays usable.
  return 0.82;
}

function saveScale(z) {
  try {
    localStorage.setItem(STORAGE_SCALE, String(z));
  } catch {
    /* ignore */
  }
}

function ensureStyles() {
  if (document.getElementById('panel-chrome-css')) return;
  const css = document.createElement('style');
  css.id = 'panel-chrome-css';
  css.textContent = `
    :root { --fly-ui-scale: 0.82; }
    .fly-panel { position: relative; }
    .fly-panel-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 10px; margin: 0 0 8px; border-radius: 8px;
      background: #000; border: 1px solid #2a2a2a;
      font: 600 12px/1.2 system-ui,Segoe UI,sans-serif; color: #d0d0d0; letter-spacing: .04em;
      -webkit-app-region: no-drag;
    }
    .fly-panel-bar .fly-panel-title { opacity: .95; text-transform: uppercase; font-size: 11px; color: #e8e8e8; }
    .fly-panel-bar button {
      border: 1px solid #333; background: #141414; color: #e8e8e8;
      border-radius: 7px; padding: 6px 12px; font: 600 12px/1.2 system-ui,sans-serif;
      cursor: pointer; min-height: 34px;
    }
    .fly-panel-bar button:hover { background: #1c1c1c; border-color: #555; color: #fff; }
    .fly-panel.is-popped-in { display: none !important; }
    .fly-panel-tab {
      position: fixed; z-index: 40; padding: 12px 16px; border-radius: 10px; min-height: 44px;
      background: #000; border: 1px solid #333;
      color: #eaeaea; font: 600 14px/1.2 system-ui,Segoe UI,sans-serif; cursor: pointer;
      box-shadow: 0 8px 24px #000a; letter-spacing: .04em;
    }
    .fly-panel-tab:hover { background: #141414; border-color: #555; color: #fff; }
    /* Base edges only — exact offsets applied by layoutEdgeTabs() so siblings never stack */
    .fly-panel-tab[data-edge="left"] { left: 10px; transform: rotate(-90deg); transform-origin: left center; }
    .fly-panel-tab[data-edge="right"] { right: 10px; writing-mode: vertical-rl; }
    .fly-panel-tab[data-edge="top"] { top: 10px; }
    .fly-panel-tab[data-edge="bottom"] { bottom: 56px; }
    #fly-ui-scale-bar {
      position: fixed; z-index: 45; left: 50%; bottom: 10px; transform: translateX(-50%) scale(var(--fly-ui-scale));
      transform-origin: bottom center;
      display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px;
      background: #000; border: 1px solid #2a2a2a;
      color: #c8c8c8; font: 600 12px/1 system-ui,sans-serif; box-shadow: 0 8px 24px #0008;
    }
    #fly-ui-scale-bar input[type=range] { width: 96px; accent-color: #aaa; }
    #fly-ui-scale-bar button {
      border: 1px solid #333; background: #141414; color: #e8e8e8;
      border-radius: 7px; padding: 6px 10px; font: inherit; cursor: pointer; min-height: 34px;
    }
    #fly-ui-scale-bar button:hover { border-color: #555; color: #fff; }
    /* NEVER use CSS zoom here — on Electron DPR ~2.21 it permanently softens text/UI.
       Scale via width + font only (native pixels stay 1:1). */
    /* Width rules skip .fly-win-free so user drag/resize layout wins */
    #lab.fly-panel:not(.fly-win-free) {
      width: calc(224px * var(--fly-ui-scale)) !important;
      max-width: min(42vw, calc(320px * var(--fly-ui-scale)));
    }
    #community-panel.fly-panel:not(.fly-win-free) {
      width: min(calc(300px * var(--fly-ui-scale)), calc(100vw - 24px)) !important;
    }
    #chat.fly-panel.open:not(.fly-win-free) {
      width: min(calc(320px * var(--fly-ui-scale)), calc(100vw - 24px));
    }
    #dock.fly-panel {
      font-size: calc(10px * var(--fly-ui-scale));
    }
    #quick-controls.fly-panel:not(.fly-win-free) {
      font-size: calc(13px * var(--fly-ui-scale));
    }
  `;
  document.head.appendChild(css);
}

/** Space tabs on the same edge so they never cover each other. */
function layoutEdgeTabs(registry) {
  const byEdge = { left: [], right: [], top: [], bottom: [] };
  for (const e of registry) {
    const tab = e.tab;
    if (!tab || tab.hidden) continue;
    const edge = tab.dataset.edge || 'right';
    (byEdge[edge] || byEdge.right).push(tab);
  }
  const vh = Math.max(360, window.innerHeight || 800);
  const vw = Math.max(480, window.innerWidth || 1200);

  byEdge.left.forEach((tab, i, arr) => {
    const t = 22 + (i + 0.5) * (56 / Math.max(1, arr.length));
    tab.style.top = `${Math.min(78, Math.max(18, t))}vh`;
    tab.style.left = '10px';
    tab.style.right = '';
    tab.style.bottom = '';
  });
  byEdge.right.forEach((tab, i, arr) => {
    // Spread along the right edge with clear gaps (was: all at top 42% → piled up)
    const span = Math.min(58, 18 + arr.length * 14);
    const start = 22;
    const step = arr.length > 1 ? span / (arr.length - 1) : 0;
    tab.style.top = `${start + i * step}vh`;
    tab.style.right = '10px';
    tab.style.left = '';
    tab.style.bottom = '';
  });
  byEdge.top.forEach((tab, i, arr) => {
    const totalW = arr.length * 140;
    const gap = 16;
    const start = Math.max(12, (vw - (arr.length * 140 + (arr.length - 1) * gap)) / 2);
    tab.style.top = '10px';
    tab.style.left = `${start + i * (140 + gap)}px`;
    tab.style.right = '';
    tab.style.bottom = '';
    tab.style.transform = 'none';
  });
  byEdge.bottom.forEach((tab, i, arr) => {
    const gap = 16;
    const w = 120;
    const start = Math.max(12, (vw - (arr.length * w + (arr.length - 1) * gap)) / 2);
    tab.style.bottom = '56px';
    tab.style.left = `${start + i * (w + gap)}px`;
    tab.style.right = '';
    tab.style.top = '';
    tab.style.transform = 'none';
  });
  void vh;
}

function setScale(z) {
  const scale = Math.max(0.55, Math.min(1.15, z));
  document.documentElement.style.setProperty('--fly-ui-scale', String(scale));
  saveScale(scale);
  const label = document.getElementById('fly-ui-scale-val');
  if (label) label.textContent = Math.round(scale * 100) + '%';
  const range = document.getElementById('fly-ui-scale-range');
  if (range && Math.abs(parseFloat(range.value) - scale) > 0.001) range.value = String(scale);
  window.dispatchEvent(new Event('resize'));
  return scale;
}

function makeBar(label, onPopIn) {
  const bar = document.createElement('div');
  bar.className = 'fly-panel-bar fly-win-handle';
  bar.innerHTML = `<span class="fly-panel-title">${label}</span><div class="fly-win-tools"><button type="button" data-pop="in" title="Hide this panel (leave a tab to restore)">Pop in</button></div>`;
  bar.querySelector('[data-pop="in"]').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPopIn();
  });
  return bar;
}

function makeTab(label, edge, onPopOut) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'fly-panel-tab';
  tab.dataset.edge = edge;
  tab.textContent = label;
  tab.title = 'Show ' + label;
  tab.addEventListener('click', onPopOut);
  document.body.appendChild(tab);
  return tab;
}

/**
 * @param {{ id: string, label: string, edge: string }[]} panels
 */
export function setupPanelChrome(panels = DEFAULT_PANELS) {
  // Always refresh injected CSS so a soft reload drops purple/gold leftovers
  const prior = document.getElementById('panel-chrome-css');
  if (prior) prior.remove();
  ensureStyles();
  const collapsed = loadCollapsed();
  setScale(loadScale());

  const registry = [];
  const relayout = () => layoutEdgeTabs(registry);

  for (const spec of panels) {
    const el = document.getElementById(spec.id);
    if (!el) continue;
    el.classList.add('fly-panel');

    // Don't double-chrome
    if (el.querySelector(':scope > .fly-panel-bar')) continue;

    const popIn = () => {
      el.classList.add('is-popped-in');
      // community-panel also uses hidden attribute
      if (spec.id === 'community-panel') el.hidden = true;
      if (spec.id === 'chat') el.classList.remove('open');
      collapsed[spec.id] = true;
      saveCollapsed(collapsed);
      if (!entry.tab) entry.tab = makeTab(spec.label, spec.edge, popOut);
      entry.tab.hidden = false;
      relayout();
    };
    const popOut = () => {
      el.classList.remove('is-popped-in');
      if (spec.id === 'community-panel') el.hidden = false;
      if (spec.id === 'chat') el.classList.add('open');
      collapsed[spec.id] = false;
      saveCollapsed(collapsed);
      if (entry.tab) entry.tab.hidden = true;
      relayout();
    };

    const bar = makeBar(spec.label, popIn);
    // Insert bar at top of panel content
    if (el.firstChild) el.insertBefore(bar, el.firstChild);
    else el.appendChild(bar);

    // For community-panel, wire existing close to pop-in
    const closeBtn = el.querySelector('#actions-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        popIn();
      });
    }

    const entry = { spec, el, popIn, popOut, tab: null };
    registry.push(entry);

    if (collapsed[spec.id]) popIn();
    else if (spec.id === 'community-panel' && el.hidden) {
      // stay hidden until user opens Actions — still offer tab
      entry.tab = makeTab(spec.label, spec.edge, popOut);
    }
  }

  // Scale strip
  if (!document.getElementById('fly-ui-scale-bar')) {
    const strip = document.createElement('div');
    strip.id = 'fly-ui-scale-bar';
    strip.innerHTML = `
      <span>UI</span>
      <button type="button" data-act="smaller" title="Shrink panels">−</button>
      <input id="fly-ui-scale-range" type="range" min="0.55" max="1.15" step="0.01" />
      <button type="button" data-act="bigger" title="Enlarge panels">+</button>
      <span id="fly-ui-scale-val"></span>
      <button type="button" data-act="pop-all-in" title="Hide all chrome panels">Pop all in</button>
      <button type="button" data-act="pop-all-out" title="Show all chrome panels">Pop all out</button>
      <button type="button" data-act="reset-layout" title="Clear saved panel positions and sizes">Reset layout</button>
    `;
    document.body.appendChild(strip);
    const range = strip.querySelector('#fly-ui-scale-range');
    range.value = String(loadScale());
    setScale(loadScale());
    range.addEventListener('input', () => setScale(parseFloat(range.value)));
    strip.querySelector('[data-act="smaller"]').addEventListener('click', () => setScale(loadScale() - 0.05));
    strip.querySelector('[data-act="bigger"]').addEventListener('click', () => setScale(loadScale() + 0.05));
    strip.querySelector('[data-act="pop-all-in"]').addEventListener('click', () => {
      for (const e of registry) e.popIn();
      relayout();
    });
    strip.querySelector('[data-act="pop-all-out"]').addEventListener('click', () => {
      for (const e of registry) e.popOut();
      relayout();
    });
    strip.querySelector('[data-act="reset-layout"]').addEventListener('click', () => {
      try {
        localStorage.removeItem('flyans-panel-layout-v1');
      } catch {
        /* ignore */
      }
      location.reload();
    });
  }

  // Also put Pop in on each top-level <details> inside lab + community (section panels).
  for (const rootId of ['lab', 'community-panel']) {
    const root = document.getElementById(rootId);
    if (!root) continue;
    root.querySelectorAll(':scope > details').forEach((det) => {
      if (det.dataset.flySectionChrome) return;
      det.dataset.flySectionChrome = '1';
      const summary = det.querySelector(':scope > summary');
      if (!summary) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fly-section-pop';
      btn.textContent = 'Pop in';
      btn.title = 'Collapse this section';
      btn.style.cssText =
        'float:right;margin-left:8px;border:1px solid #333;background:#141414;color:#c8c8c8;border-radius:7px;padding:4px 10px;font:600 11px system-ui,sans-serif;cursor:pointer;min-height:28px;';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        det.open = false;
      });
      summary.appendChild(btn);
    });
  }

  window.addEventListener('resize', relayout);
  relayout();

  return { registry, setScale, loadScale, layoutEdgeTabs: relayout };
}

export { DEFAULT_PANELS, setScale, loadScale };
