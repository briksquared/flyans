/**
 * Cinematic camera path recorder — drop keyframes, play them back as a tour.
 * Alt+R toggle record · Alt+K add keyframe · Alt+P play · Alt+Shift+C clear
 */

const KEY = 'flyans-cam-path-v1';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function save(frames) {
  try {
    localStorage.setItem(KEY, JSON.stringify(frames.slice(0, 64)));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} api
 * @param {() => {pos:number[], at:number[]}} api.capture
 * @param {(frames:object[]) => void} api.play
 * @param {() => void} [api.stop]
 * @param {(msg:string) => void} [api.note]
 */
export function setupCamPath(api = {}) {
  let recording = false;
  let frames = load();
  ensureUi();
  paint();
  wireKeys();
  return {
    addKeyframe,
    clear,
    play,
    toggleRecord,
    list: () => frames.slice(),
    isRecording: () => recording
  };

  function addKeyframe() {
    const shot = api.capture?.();
    if (!shot?.pos || !shot?.at) return false;
    frames.push({
      pos: shot.pos.map(Number),
      at: shot.at.map(Number),
      hold: 3.5,
      t: Date.now()
    });
    if (frames.length > 64) frames = frames.slice(-64);
    save(frames);
    paint();
    api.note?.(`Path keyframe ${frames.length}`);
    return true;
  }

  function clear() {
    frames = [];
    save(frames);
    recording = false;
    paint();
    api.stop?.();
    api.note?.('Camera path cleared');
  }

  function play() {
    if (frames.length < 2) {
      api.note?.('Need at least 2 keyframes (Alt+K while recording)');
      return false;
    }
    recording = false;
    paint();
    api.play?.(frames.map((f) => ({ pos: f.pos, at: f.at, hold: f.hold || 3.5 })));
    api.note?.(`Playing ${frames.length}-stop camera path`);
    return true;
  }

  function toggleRecord() {
    recording = !recording;
    paint();
    api.note?.(recording ? 'Path record ON — Alt+K adds a keyframe' : 'Path record OFF');
  }

  function wireKeys() {
    addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (!e.altKey) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleRecord();
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (!recording) toggleRecord();
        addKeyframe();
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        play();
      }
      if ((e.key === 'c' || e.key === 'C') && e.shiftKey) {
        e.preventDefault();
        clear();
      }
    });
  }

  function ensureUi() {
    const row = document.getElementById('tour-buttons');
    if (!row || document.getElementById('cam-path-rec')) return;
    const wrap = document.createElement('div');
    wrap.id = 'cam-path-bar';
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 0;width:100%;';
    wrap.innerHTML = `
      <button type="button" id="cam-path-rec" title="Alt+R">● Rec path</button>
      <button type="button" id="cam-path-add" title="Alt+K">+ Key</button>
      <button type="button" id="cam-path-play" title="Alt+P">▶ Play path</button>
      <button type="button" id="cam-path-clear" title="Alt+Shift+C">Clear</button>
      <span id="cam-path-count" class="quiet" style="align-self:center;font-size:10px;color:#888;"></span>`;
    row.parentElement?.insertBefore(wrap, row.nextSibling);
    document.getElementById('cam-path-rec')?.addEventListener('click', () => toggleRecord());
    document.getElementById('cam-path-add')?.addEventListener('click', () => addKeyframe());
    document.getElementById('cam-path-play')?.addEventListener('click', () => play());
    document.getElementById('cam-path-clear')?.addEventListener('click', () => clear());
  }

  function paint() {
    const rec = document.getElementById('cam-path-rec');
    const count = document.getElementById('cam-path-count');
    if (rec) {
      rec.classList.toggle('on', recording);
      rec.textContent = recording ? '● Recording…' : '● Rec path';
    }
    if (count) count.textContent = frames.length ? `${frames.length} keys` : 'no keys yet';
  }
}
