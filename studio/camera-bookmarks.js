/**
 * Named camera bookmarks + "frame the whole world" jump.
 * Bookmarks persist in localStorage; slots 1–4 via Alt+digit / Alt+Shift+digit.
 */

const KEY = 'flyans-cam-bookmarks-v1';
const SLOTS = 4;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, SLOTS)));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} api
 * @param {() => {x:number,z:number,r:number}} api.worldView
 * @param {(p:{pos:number[],at:number[]}, instant?:boolean) => void} api.go
 * @param {() => {pos:number[], at:number[]}} api.capture
 * @param {(msg:string) => void} [api.note]
 */
export function setupCameraBookmarks(api = {}) {
  ensureUi(api);
  wireKeys(api);
  return {
    saveSlot: (i) => saveSlot(api, i),
    goSlot: (i) => goSlot(api, i),
    frameWorld: () => frameWorld(api),
    list: () => load()
  };
}

function saveSlot(api, index) {
  const i = Math.max(0, Math.min(SLOTS - 1, index | 0));
  const shot = api.capture?.();
  if (!shot?.pos || !shot?.at) return false;
  const list = load();
  while (list.length < SLOTS) list.push(null);
  list[i] = {
    name: `Bookmark ${i + 1}`,
    pos: shot.pos.map(Number),
    at: shot.at.map(Number),
    t: Date.now()
  };
  save(list);
  paintSlots();
  try {
    api.note?.(`Saved camera bookmark ${i + 1}`);
  } catch {
    /* ignore */
  }
  return true;
}

function goSlot(api, index) {
  const i = Math.max(0, Math.min(SLOTS - 1, index | 0));
  const list = load();
  const b = list[i];
  if (!b?.pos || !b?.at) {
    try {
      api.note?.(`Bookmark ${i + 1} empty — Alt+Shift+${i + 1} to save`);
    } catch {
      /* ignore */
    }
    return false;
  }
  api.go?.(b, true);
  return true;
}

function frameWorld(api) {
  const w = api.worldView?.();
  if (!w) return false;
  const R = Math.max(400, w.r * 1.35);
  api.go?.(
    {
      pos: [w.x, R * 0.72, w.z + R * 0.95],
      at: [w.x, 8, w.z]
    },
    true
  );
  try {
    api.note?.('Framed the whole valley');
  } catch {
    /* ignore */
  }
  return true;
}

function wireKeys(api) {
  addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (!e.altKey) return;
    const n = e.key;
    if (n >= '1' && n <= '4') {
      e.preventDefault();
      const i = +n - 1;
      if (e.shiftKey) saveSlot(api, i);
      else goSlot(api, i);
    }
    if (e.key === '0' || e.key === ')') {
      e.preventDefault();
      frameWorld(api);
    }
  });
}

function ensureUi(api) {
  const qc = document.getElementById('quick-controls');
  if (!qc || document.getElementById('cam-bookmarks-row')) return;
  const row = document.createElement('div');
  row.className = 'qc-row';
  row.id = 'cam-bookmarks-row';
  row.innerHTML = `<span class="qc-label">cam</span>
    <button type="button" class="qc-gear" data-frame-world title="Frame the whole valley (Alt+0)">World</button>
    <button type="button" class="qc-gear" data-bm="0" title="Alt+1 go · Alt+Shift+1 save">B1</button>
    <button type="button" class="qc-gear" data-bm="1" title="Alt+2 go · Alt+Shift+2 save">B2</button>
    <button type="button" class="qc-gear" data-bm="2" title="Alt+3 go · Alt+Shift+3 save">B3</button>
    <button type="button" class="qc-gear" data-bm="3" title="Alt+4 go · Alt+Shift+4 save">B4</button>
    <button type="button" class="qc-gear" id="cam-bm-save" title="Save current view into next empty / B1">Save view</button>`;
  qc.insertBefore(row, qc.children[1] || null);
  row.querySelector('[data-frame-world]')?.addEventListener('click', () => frameWorld(api));
  row.querySelectorAll('[data-bm]').forEach((b) => {
    b.addEventListener('click', (ev) => {
      const i = +b.dataset.bm;
      if (ev.shiftKey) saveSlot(api, i);
      else goSlot(api, i);
    });
    b.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      saveSlot(api, +b.dataset.bm);
    });
  });
  row.querySelector('#cam-bm-save')?.addEventListener('click', () => {
    const list = load();
    let i = list.findIndex((x) => !x);
    if (i < 0) i = 0;
    saveSlot(api, i);
  });
  paintSlots();
}

function paintSlots() {
  const list = load();
  for (let i = 0; i < SLOTS; i++) {
    const b = document.querySelector(`#cam-bookmarks-row [data-bm="${i}"]`);
    if (!b) continue;
    b.classList.toggle('on', !!list[i]);
    b.title = list[i]
      ? `Go to bookmark ${i + 1} (Alt+${i + 1}) · right-click / Shift+click to overwrite`
      : `Empty — Alt+Shift+${i + 1} or right-click to save`;
  }
}
