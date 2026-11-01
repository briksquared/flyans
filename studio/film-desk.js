/**
 * Film desk — cast the smartest flies, dress them, run the lot,
 * and let them train to make their own videos into riffs/videos/
 * (same idea as songs landing in riffs/takes/).
 */

const CAST_KEY = 'flyans-film-cast-v1';
const SKILL_KEY = 'flyans-film-skill-v1';

const SLATE_IDEAS = [
  { id: 'dawn-esplanade', title: 'Dawn on the Esplanade of Pyramids', cam: 'esplanade', preset: 'dawn', seconds: 14 },
  { id: 'approach-ten', title: 'Ten Temples to the Studio', cam: 'esplanade', preset: 'meadow', seconds: 16 },
  { id: 'dawn-pyramid', title: 'House of Moving Light', cam: 'filmpyramid', preset: 'dawn', seconds: 12 },
  { id: 'backlot-walk', title: 'Backlot Walkthrough', cam: 'backlot', preset: 'meadow', seconds: 10 },
  { id: 'green-key', title: 'Green Screen Rehearsal', cam: 'soundstage', preset: 'meadow', seconds: 9 },
  { id: 'golden-crane', title: 'Golden Hour Crane Shot', cam: 'filmset', preset: 'goldenhour', seconds: 14 },
  { id: 'night-call', title: 'Night Call — Lights Up', cam: 'filmset', preset: 'moonlit', seconds: 11 },
  { id: 'prop-yard', title: 'Prop Yard Tour', cam: 'filmset', preset: 'meadow', seconds: 10 },
  { id: 'airstrip', title: 'Airstrip Arrival', cam: 'filmset', preset: 'dusk', seconds: 12 },
  { id: 'costume', title: 'Wardrobe Change', cam: 'filmset', preset: 'meadow', seconds: 8 }
];

function loadJson(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function brainScore(body) {
  try {
    if (typeof window.brainEnergyOf === 'function') {
      const key = body?.g?.userData?.role || body?.g?.userData?.brainRole;
      const e = window.brainEnergyOf(key);
      if (Number.isFinite(e)) return e;
    }
  } catch {
    /* ignore */
  }
  // Fallback: prefer named roles that already do camera / social / teaching work
  const role = String(body?.g?.userData?.role || '');
  if (/Photo|Social|Web|Cue|Engineer|Producer|Teacher/i.test(role)) return 2;
  return 1;
}

/**
 * @param {object} api
 */
export function setupFilmDesk(api = {}) {
  ensureStyles();
  ensurePanel();
  const state = {
    cast: loadJson(CAST_KEY, []),
    skills: loadJson(SKILL_KEY, {}), // role -> 0..1 film craft
    shooting: false,
    nextAuto: performance.now() * 0.001 + 90 + Math.random() * 60,
    lastFile: ''
  };

  const panel = document.getElementById('film-desk');
  const status = () => panel?.querySelector('#film-desk-status');
  const castEl = () => panel?.querySelector('#film-desk-cast');
  const paint = () => {
    const c = castEl();
    if (!c) return;
    c.replaceChildren();
    if (!state.cast.length) {
      const empty = document.createElement('div');
      empty.className = 'fd-muted';
      empty.textContent = 'No cast yet — pick the smartest flies.';
      c.append(empty);
    } else {
      for (const row of state.cast) {
        const sk = Math.round((state.skills[row.role] || 0) * 100);
        const div = document.createElement('div');
        div.className = 'fd-cast-row';
        div.textContent = `${row.name} · ${row.role} · craft ${sk}%`;
        c.append(div);
      }
    }
    if (status()) {
      status().textContent = state.lastFile
        ? `Last fly video → ${state.lastFile}`
        : 'Fly videos save to riffs/videos/ (like songs → riffs/takes/).';
    }
  };
  paint();

  function pickSmartest(n = 12) {
    const crew = typeof api.crew === 'function' ? api.crew() : [];
    const ranked = crew
      .filter((b) => b?.g?.userData?.name)
      .map((b) => ({
        body: b,
        name: b.g.userData.name,
        role: b.g.userData.role || b.g.userData.name,
        score: brainScore(b) + (state.skills[b.g.userData.role] || 0) * 10
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
    state.cast = ranked.map(({ name, role, score }) => ({ name, role, score }));
    saveJson(CAST_KEY, state.cast);
    paint();
    return state.cast;
  }

  function gatherCast(where = 'filmset') {
    const lot = window.__FILM_LOT;
    const spotKey = where === 'esplanade' || where === 'esplanade_mid' ? where : 'filmset';
    const spot =
      lot?.spots?.[spotKey] ||
      window.SPOT?.[spotKey] ||
      lot?.spots?.filmset ||
      window.SPOT?.filmset;
    if (!spot || !api.crew) return 0;
    const want = new Set(state.cast.map((c) => c.role));
    const avenue = lot?.avenue;
    const pyramids = lot?.pyramids || [];
    let n = 0;
    let idx = 0;
    for (const b of api.crew()) {
      const role = b.g?.userData?.role;
      if (!want.has(role)) continue;
      let x;
      let z;
      if ((spotKey === 'esplanade' || spotKey === 'esplanade_mid') && avenue && pyramids.length) {
        // Spread cast along the avenue between the ten pyramids
        const t = 0.12 + (idx / Math.max(1, want.size - 1)) * 0.76;
        const side = idx % 2 === 0 ? -1 : 1;
        const off = 18 + (idx % 3) * 6;
        x = avenue.start[0] + (avenue.end[0] - avenue.start[0]) * t + avenue.sx * side * off;
        z = avenue.start[1] + (avenue.end[1] - avenue.start[1]) * t + avenue.sz * side * off;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 28;
        x = spot[0] + Math.cos(ang) * r;
        z = spot[1] + Math.sin(ang) * r;
      }
      try {
        if (b.g) b.g.position.set(x, b.g.position.y || 1.2, z);
        b.x = x;
        b.z = z;
      } catch {
        /* ignore */
      }
      n++;
      idx++;
    }
    try {
      api.camera?.(spotKey === 'esplanade' || spotKey === 'esplanade_mid' ? 'esplanade' : 'filmset');
    } catch {
      /* ignore */
    }
    return n;
  }

  function dressCast(look = 'star') {
    const THREE = window.THREE || api.THREE;
    if (!THREE || !api.crew) return 0;
    const want = new Set(state.cast.map((c) => c.role));
    let n = 0;
    for (const b of api.crew()) {
      if (!want.has(b.g?.userData?.role)) continue;
      const g = b.g;
      if (!g) continue;
      let kit = g.getObjectByName('film-costume');
      if (kit) g.remove(kit);
      kit = new THREE.Group();
      kit.name = 'film-costume';
      const mat =
        look === 'director'
          ? new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })
          : look === 'crew'
            ? new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.55 })
            : new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.45, metalness: 0.4 });
      // Tiny hat / cape cue — reads at colony scale
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.55, 8), mat);
      hat.position.set(0, 1.55, 0);
      kit.add(hat);
      if (look === 'star') {
        const cape = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.55), mat);
        cape.position.set(0, 0.7, -0.35);
        kit.add(cape);
      }
      g.add(kit);
      n++;
    }
    return n;
  }

  function trainCast(amount = 0.08) {
    for (const c of state.cast) {
      const prev = state.skills[c.role] || 0;
      state.skills[c.role] = Math.min(1, prev + amount);
    }
    saveJson(SKILL_KEY, state.skills);
    paint();
  }

  async function saveFlyVideo(blob, meta) {
    const notes = {
      title: meta.title || 'fly-take',
      inn: 0,
      out: meta.seconds || 0,
      marks: meta.marks || [{ t: 0, label: 'Action' }],
      kind: 'fly',
      library: 'riffs',
      cast: state.cast.map((c) => c.name),
      slate: meta.slateId || ''
    };
    const body = new FormData();
    body.append('video', blob, 'fly-take.webm');
    body.append('notes', JSON.stringify(notes));
    const res = await fetch('/save', { method: 'POST', body });
    if (!res.ok) throw new Error('save ' + res.status);
    const saved = await res.json();
    state.lastFile = saved.file || '';
    trainCast(0.05 + Math.random() * 0.05);
    paint();
    try {
      api.note?.('film', `Fly video saved: ${notes.title}`);
    } catch {
      /* ignore */
    }
    return saved;
  }

  function truckAlongEsplanade(seconds) {
    const lot = window.__FILM_LOT;
    const av = lot?.avenue;
    if (!av || !api.truckCamera) return Promise.resolve();
    const dur = Math.max(4, seconds || 12);
    return api.truckCamera({
      from: {
        x: av.start[0] + av.ux * (av.len * 0.12) - av.sx * 60,
        y: 55,
        z: av.start[1] + av.uz * (av.len * 0.12) - av.sz * 60
      },
      to: {
        x: av.start[0] + av.ux * (av.len * 0.88) - av.sx * 70,
        y: 70,
        z: av.start[1] + av.uz * (av.len * 0.88) - av.sz * 70
      },
      lookFrom: { x: av.start[0] + av.ux * (av.len * 0.2), y: 20, z: av.start[1] + av.uz * (av.len * 0.2) },
      lookTo: { x: av.end[0], y: 24, z: av.end[1] },
      seconds: dur
    });
  }

  async function shootSlate(idea, { auto = false } = {}) {
    if (state.shooting) return { ok: false, reason: 'already shooting' };
    if (api.isRecording?.()) return { ok: false, reason: 'owner is recording' };
    const slate = idea || SLATE_IDEAS[(Math.random() * SLATE_IDEAS.length) | 0];
    state.shooting = true;
    try {
      if (!state.cast.length) pickSmartest(12);
      const gatherWhere =
        slate.cam === 'esplanade' || slate.id === 'dawn-esplanade' || slate.id === 'approach-ten'
          ? 'esplanade'
          : 'filmset';
      gatherCast(gatherWhere);
      if (api.environment) {
        try {
          api.environment({ preset: slate.preset, weather: 'clear' });
        } catch {
          /* ignore */
        }
      }
      const doTruck = slate.id === 'approach-ten' || slate.id === 'dawn-esplanade';
      try {
        if (!doTruck) api.camera?.(slate.cam || 'filmset');
      } catch {
        /* ignore */
      }
      if (auto) {
        try {
          document.body.classList.add('cinematic');
        } catch {
          /* ignore */
        }
      }

      const canvas = api.canvas?.() || document.querySelector('canvas');
      if (!canvas?.captureStream) throw new Error('no canvas stream');
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const chunks = [];
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const done = new Promise((resolve, reject) => {
        rec.ondataavailable = (e) => {
          if (e.data?.size) chunks.push(e.data);
        };
        rec.onerror = () => reject(new Error('recorder error'));
        rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
      });
      rec.start(200);
      if (status()) status().textContent = `Rolling · ${slate.title}…`;
      const secs = slate.seconds || 10;
      if (doTruck) {
        // Truck while recording — approach shot down the ten temples
        await Promise.race([truckAlongEsplanade(secs), new Promise((r) => setTimeout(r, secs * 1000))]);
      } else {
        await new Promise((r) => setTimeout(r, secs * 1000));
      }
      rec.stop();
      const blob = await done;
      const saved = await saveFlyVideo(blob, {
        title: `${slate.title} · ${state.cast.slice(0, 3).map((c) => c.name).join('-') || 'cast'}`,
        seconds: slate.seconds,
        slateId: slate.id,
        marks: [
          { t: 0, label: 'Action' },
          { t: Math.max(1, (slate.seconds || 10) - 1), label: 'Cut' }
        ]
      });
      return { ok: true, saved, slate };
    } catch (err) {
      if (status()) status().textContent = 'Shoot failed · ' + (err?.message || err);
      return { ok: false, reason: String(err?.message || err) };
    } finally {
      state.shooting = false;
      if (auto) {
        try {
          if (!document.body.dataset.cinLock) document.body.classList.remove('cinematic');
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Autonomy: flies rehearse film craft and drop takes into riffs/videos/
  function tick(dt) {
    const featOn = window.FLY_FEAT?.flyVideos !== false;
    if (!featOn || state.shooting) return;
    if (api.isRecording?.()) return;
    if (document.body.classList.contains('role-guest')) return;
    const T = performance.now() * 0.001;
    if (T < state.nextAuto) return;
    // Pace with film skill — better cast shoots a bit more often, still leisurely
    const avg =
      state.cast.reduce((s, c) => s + (state.skills[c.role] || 0), 0) / Math.max(1, state.cast.length);
    state.nextAuto = T + (140 - avg * 40) + Math.random() * 80;
    if (!state.cast.length) pickSmartest(10);
    // Quiet train pulse even when not shooting
    if (Math.random() < 0.35) {
      trainCast(0.02);
      gatherCast(Math.random() < 0.45 ? 'esplanade' : 'filmset');
      if (status()) status().textContent = 'Cast rehearsing on the lot / avenue…';
      return;
    }
    // Bias toward the signature approach shot a chunk of the time
    const pick =
      Math.random() < 0.28
        ? SLATE_IDEAS.find((s) => s.id === 'approach-ten') || null
        : null;
    shootSlate(pick, { auto: true });
  }

  // Wire UI
  panel?.querySelector('#film-pick')?.addEventListener('click', () => {
    const cast = pickSmartest(12);
    if (status()) status().textContent = `Cast ${cast.length} smartest flies.`;
  });
  panel?.querySelector('#film-gather')?.addEventListener('click', () => {
    const n = gatherCast('filmset');
    if (status()) status().textContent = `Gathered ${n} on the film lot.`;
  });
  panel?.querySelector('#film-gather-esp')?.addEventListener('click', () => {
    const n = gatherCast('esplanade');
    if (status()) status().textContent = `Gathered ${n} along the Esplanade.`;
  });
  panel?.querySelector('#film-dress')?.addEventListener('click', () => {
    const n = dressCast('star');
    if (status()) status().textContent = `Dressed ${n} for camera.`;
  });
  panel?.querySelector('#film-train')?.addEventListener('click', () => {
    trainCast(0.12);
    if (status()) status().textContent = 'Film school drill — craft up.';
  });
  panel?.querySelector('#film-shoot')?.addEventListener('click', () => {
    shootSlate(null, { auto: false });
  });
  panel?.querySelector('#film-shoot-approach')?.addEventListener('click', () => {
    shootSlate(
      SLATE_IDEAS.find((s) => s.id === 'approach-ten') || SLATE_IDEAS[1],
      { auto: false }
    );
  });
  panel?.querySelector('#film-goto')?.addEventListener('click', () => {
    try {
      api.camera?.('filmset', true);
    } catch {
      /* ignore */
    }
  });
  panel?.querySelector('#film-goto-esp')?.addEventListener('click', () => {
    try {
      api.camera?.('esplanade', true);
    } catch {
      /* ignore */
    }
  });
  panel?.querySelector('.fd-close')?.addEventListener('click', () => {
    if (panel) panel.hidden = true;
  });

  // Quick-controls button
  const qc = document.getElementById('quick-controls');
  if (qc && !document.getElementById('film-desk-toggle')) {
    const row = document.createElement('div');
    row.className = 'qc-row';
    row.innerHTML = `<span class="qc-label">film</span>
      <button type="button" class="qc-gear" id="film-desk-toggle" title="Film lot — cast, dress, shoot">🎬 Film lot</button>
      <button type="button" class="qc-gear" data-cam="filmset" title="Jump to north-corner movie studio">Lot</button>
      <button type="button" class="qc-gear" data-cam="esplanade" title="Esplanade of Pyramids">Esplanade</button>
      <button type="button" class="qc-gear" data-cam="stage2" title="Open soundstage">Stage 2</button>
      <button type="button" class="qc-gear" data-cam="filmpyramid" title="House of Moving Light">Pyramid</button>`;
    qc.insertBefore(row, qc.children[2] || null);
    // Own handlers (instant) — do not depend on the later qc querySelectorAll pass / glide.
    row.querySelectorAll('[data-cam]').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          api.camera?.(b.dataset.cam, true);
        } catch {
          /* ignore */
        }
      });
    });
    row.querySelector('#film-desk-toggle').addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        try {
          window.setupPanelWindows && null;
        } catch {
          /* ignore */
        }
        try {
          import('./panel-windows.js').then((m) => m.attachWindow?.(panel, { id: 'film-desk', minW: 260, minH: 220, handle: ':scope > h3' }));
        } catch {
          /* ignore */
        }
      }
    });
  }

  window.__FILM_DESK = {
    pickSmartest,
    gatherCast,
    dressCast,
    trainCast,
    shootSlate,
    tick,
    slateIdeas: SLATE_IDEAS,
    state
  };
  return window.__FILM_DESK;
}

function ensureStyles() {
  if (document.getElementById('film-desk-css')) return;
  const css = document.createElement('style');
  css.id = 'film-desk-css';
  css.textContent = `
    #film-desk{
      position:fixed;left:12px;top:120px;z-index:99997;width:300px;max-height:min(70vh,560px);overflow:auto;
      background:#000;border:1px solid #2a2a2a;border-radius:10px;padding:12px 14px 14px;
      box-shadow:0 12px 40px #000a;font:13px/1.4 system-ui,sans-serif;color:#e6e6e6;
    }
    #film-desk[hidden]{display:none}
    #film-desk h3{margin:0 0 6px;font:600 15px/1.2 system-ui,sans-serif;color:#f2f2f2;
      display:flex;justify-content:space-between;align-items:center;gap:8px}
    #film-desk .fd-close{border:0;background:none;color:#888;font-size:18px;cursor:pointer}
    #film-desk .fd-sub{color:#888;font-size:12px;margin:0 0 10px}
    #film-desk .fd-row{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
    #film-desk button{
      font:500 12px/1.2 system-ui,sans-serif;color:#e8e8e8;background:#141414;
      border:1px solid #333;border-radius:8px;padding:8px 10px;min-height:34px;cursor:pointer;
    }
    #film-desk button:hover{border-color:#555;color:#fff}
    #film-desk-cast{border-top:1px solid #222;padding-top:8px;margin-top:4px;max-height:160px;overflow:auto}
    #film-desk .fd-cast-row{padding:4px 0;border-bottom:1px solid #1a1a1a;font-size:12px;color:#d0d0d0}
    #film-desk .fd-muted{color:#888;font-size:12px;padding:6px 0}
    #film-desk-status{margin-top:8px;font-size:11px;color:#a8a8a8;word-break:break-all}
  `;
  document.head.appendChild(css);
}

function ensurePanel() {
  if (document.getElementById('film-desk')) return;
  const el = document.createElement('div');
  el.id = 'film-desk';
  el.hidden = true;
  el.setAttribute('aria-label', 'Film lot desk');
  el.innerHTML = `
    <h3>🎬 Film lot <button type="button" class="fd-close" title="Close">×</button></h3>
    <p class="fd-sub">North-corner studio · Esplanade of Pyramids · fly takes → <code>riffs/videos/</code></p>
    <div class="fd-row">
      <button type="button" id="film-goto">Go to lot</button>
      <button type="button" id="film-goto-esp">Esplanade</button>
      <button type="button" id="film-pick">Cast smartest</button>
      <button type="button" id="film-gather">Places · lot</button>
      <button type="button" id="film-gather-esp">Places · avenue</button>
      <button type="button" id="film-dress">Dress</button>
      <button type="button" id="film-train">Film school</button>
      <button type="button" id="film-shoot">Shoot a take</button>
      <button type="button" id="film-shoot-approach">Approach shot</button>
    </div>
    <div id="film-desk-cast"></div>
    <div id="film-desk-status"></div>
  `;
  document.body.appendChild(el);
}

export { SLATE_IDEAS };
