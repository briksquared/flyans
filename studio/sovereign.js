/**
 * One fly rules: God, Ruler, and King — role "You" (Gabe).
 * Colony graph untouched; this is presentation + sidecar priority only.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SOVEREIGN_ROLE = 'You';
export const SOVEREIGN_TITLES = ['God', 'Ruler', 'King'];

const UV = 0x9a6ad4;
const GOLD = 0xe8c86a;

let flybodyTemplate = null;
let flybodyPromise = null;
let opticCache = null;
let opticFetchedAt = 0;
let restBusy = false;
let restHint = null;
/** Rolling compare samples: { t, yaw, colonySteer, stimulus } — compare-only. */
const opticHistory = [];
const OPTIC_HISTORY_MAX = 48;

export function isSovereign(bodyOrGroup) {
  const g = bodyOrGroup?.g || bodyOrGroup;
  if (!g?.userData) return false;
  return !!(g.userData.sovereign || g.userData.role === SOVEREIGN_ROLE);
}

export function sovereignTitleLine(name = 'Gabe') {
  return `${name} · ${SOVEREIGN_TITLES.join(' · ')}`;
}

/** Attach crown, halo, and title to an existing fly group. Idempotent. */
export function crownFly(g, { scaleBoost = 1.35 } = {}) {
  if (!g?.isObject3D || g.userData.sovereignCrowned) return g;
  g.userData.sovereign = true;
  g.userData.sovereignCrowned = true;
  g.userData.titles = SOVEREIGN_TITLES.slice();
  g.userData.displayName = sovereignTitleLine(g.userData.name || 'Gabe');
  g.userData.title = SOVEREIGN_TITLES.join(' · ');

  const base = g.scale.x || 1;
  g.scale.setScalar(base * scaleBoost);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.018, 10, 36),
    new THREE.MeshBasicMaterial({
      color: UV,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.55, 0);
  halo.name = 'sovereign-halo';
  g.add(halo);

  const crown = new THREE.Group();
  crown.name = 'sovereign-crown';
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.012, 8, 24),
    new THREE.MeshStandardMaterial({
      color: GOLD,
      metalness: 0.7,
      roughness: 0.35,
      emissive: GOLD,
      emissiveIntensity: 0.25
    })
  );
  band.rotation.x = Math.PI / 2;
  crown.add(band);
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.08, 5),
      new THREE.MeshStandardMaterial({
        color: GOLD,
        metalness: 0.65,
        roughness: 0.4,
        emissive: UV,
        emissiveIntensity: 0.15
      })
    );
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    spike.position.set(Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07);
    crown.add(spike);
  }
  crown.position.set(0, 0.42, -0.02);
  g.add(crown);

  g.traverse((obj) => {
    if (!obj.isSprite || !obj.material?.map?.image) return;
    const canvas = obj.material.map.image;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 18px Palatino Linotype, Palatino, Georgia, serif';
    ctx.fillStyle = '#e8c86a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sovereignTitleLine(g.userData.name || 'Gabe'), canvas.width / 2, canvas.height / 2);
    obj.material.map.needsUpdate = true;
    obj.scale.set(1.05, 0.16, 1);
    obj.position.y = 0.92;
  });

  const lamp = new THREE.PointLight(UV, 1.4, 6, 2);
  lamp.position.set(0, 0.6, 0);
  lamp.name = 'sovereign-lamp';
  g.add(lamp);

  return g;
}

/** Spin halo / crown each frame. */
export function tickSovereign(g, dt) {
  if (!isSovereign(g)) return;
  const halo = g.getObjectByName('sovereign-halo');
  if (halo) halo.rotation.z += dt * 1.2;
  const crown = g.getObjectByName('sovereign-crown');
  if (crown) crown.rotation.y += dt * 0.35;
}

/**
 * Sovereign motor step — no-op in the public build.
 * The colony's own stepConnectome is always the authority; this returns null
 * so the sovereign fly uses the same colony behaviour as everyone else.
 */
export async function sovereignRestStep() {
  return null;
}

/** Fire-and-forget REST; caches last motor hint for blending. */
export function queueSovereignRest(inputs) {
  if (restBusy) return restHint;
  restBusy = true;
  sovereignRestStep(inputs).then((out) => {
    restHint = out;
    restBusy = false;
  }).catch(() => {
    restBusy = false;
  });
  return restHint;
}

export function lastRestHint() {
  return restHint;
}

export async function fetchOpticCompare() {
  // Compare-only optic readout removed from the public build.
  return null;
}

/** Poll optic probe at most every `minMs`. */
export async function refreshOpticCompare(minMs = 15000) {
  const now = performance.now();
  if (opticCache && now - opticFetchedAt < minMs) return opticCache;
  const next = await fetchOpticCompare();
  if (next) {
    opticCache = next;
    opticFetchedAt = now;
  }
  return opticCache;
}

export function opticYawNote(optic = opticCache) {
  if (!optic || !optic.ok) return null;
  const yaw = Number(optic.yawLast);
  const mean = Number(optic.yawMean);
  if (!Number.isFinite(yaw)) return null;
  return {
    yawLast: yaw,
    yawMean: Number.isFinite(mean) ? mean : yaw,
    stimulus: optic.stimulus || '—',
    compareNote: optic.compareNote || ''
  };
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i];
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 1e-12 || vy <= 1e-12) return 0;
  return cov / Math.sqrt(vx * vy);
}

/** Push one compare sample; returns current numeric summary. */
export function recordOpticSample(yaw, colonySteer, stimulus) {
  if (!Number.isFinite(yaw) || !Number.isFinite(colonySteer)) return null;
  opticHistory.push({
    t: performance.now(),
    yaw,
    colonySteer,
    stimulus: stimulus || '—',
  });
  while (opticHistory.length > OPTIC_HISTORY_MAX) opticHistory.shift();
  return opticCorrelationSummary();
}

export function opticCorrelationSummary() {
  const n = opticHistory.length;
  if (n < 1) return { n: 0, r: null, yawSeries: [], steerSeries: [] };
  const yawSeries = opticHistory.map((s) => s.yaw);
  const steerSeries = opticHistory.map((s) => s.colonySteer);
  return {
    n,
    r: pearson(yawSeries, steerSeries),
    yawSeries,
    steerSeries,
    last: opticHistory[n - 1],
  };
}

export function getOpticHistory() {
  return opticHistory.slice();
}

/**
 * Compare-only A/B: sidecar optic yaw vs colony steering proxy (east−west inputs).
 * LIVE_CHANNELS: [1]=eastward target, [2]=westward target.
 * Does not feed sidecar output back into stepConnectome.
 */
export function compareOpticColonyAB(optic, inputs) {
  if (!optic?.ok || !Array.isArray(inputs) || inputs.length < 3) return null;
  const yaw = Number(optic.yawLast);
  if (!Number.isFinite(yaw)) return null;
  // Channel map: eastward − westward ≈ colony optic/steering proxy
  const colonySteer = (Number(inputs[1]) || 0) - (Number(inputs[2]) || 0);
  const stim = String(optic.stimulus || '').toLowerCase();
  let expectedSign = Math.sign(yaw) || 0;
  if (stim === 'rightward') expectedSign = 1;
  else if (stim === 'leftward') expectedSign = -1;
  const colonySign = Math.sign(colonySteer);
  const signAgree =
    colonySign === 0 ||
    expectedSign === 0 ||
    colonySign === expectedSign ||
    (Math.abs(colonySteer) < 0.02 && Math.abs(yaw) < 0.02);
  const corr = recordOpticSample(yaw, colonySteer, optic.stimulus);
  return {
    yawLast: yaw,
    colonySteer,
    delta: yaw - colonySteer,
    signAgree,
    stimulus: optic.stimulus || '—',
    channels: { east: Number(inputs[1]) || 0, west: Number(inputs[2]) || 0 },
    r: corr?.r ?? null,
    n: corr?.n ?? 0,
    yawSeries: corr?.yawSeries || [],
    steerSeries: corr?.steerSeries || [],
    note: 'Compare-only; colony graph unchanged',
  };
}

export function formatOpticAbLine(ab, note) {
  if (!note) return 'probe offline';
  const base = `${note.yawLast.toFixed(4)} (${note.stimulus})`;
  if (!ab) return base;
  const tag = ab.signAgree ? 'sign✓' : 'sign≠';
  const rBit =
    ab.r == null || !Number.isFinite(ab.r)
      ? `n=${ab.n || 0}`
      : `r=${ab.r.toFixed(2)} n=${ab.n}`;
  return `${base} · E−W ${ab.colonySteer.toFixed(3)} · ${tag} · ${rBit}`;
}

/** Draw yaw (cyan) vs colony steer (amber) into a canvas — compare-only sparkline. */
export function drawOpticAbSpark(canvas, ab) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width || 120;
  const h = canvas.height || 28;
  ctx.clearRect(0, 0, w, h);
  const ys = ab?.yawSeries || [];
  const ss = ab?.steerSeries || [];
  if (ys.length < 2) {
    ctx.fillStyle = '#5a5a62';
    ctx.font = '10px Consolas,monospace';
    ctx.fillText('optic A/B…', 4, h / 2 + 3);
    return;
  }
  const all = ys.concat(ss);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-6) { lo -= 0.01; hi += 0.01; }
  const mapY = (v) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
  const draw = (series, color) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    for (let i = 0; i < series.length; i++) {
      const x = 2 + (i / (series.length - 1)) * (w - 4);
      const y = mapY(series[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = '#2a2a30';
  ctx.beginPath();
  ctx.moveTo(0, mapY(0));
  ctx.lineTo(w, mapY(0));
  ctx.stroke();
  draw(ss, '#c9a227');
  draw(ys, '#6ec8ff');
}

/**
 * Light + food scene probes for the crowned fly.
 * Light from daylight hour; food from distance to kitchen spot.
 */
export function sovereignProbeInputs(body, { hour = 12, kitchen = null } = {}) {
  const day = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  let food = 0.35;
  if (kitchen && body) {
    const dx = (kitchen[0] ?? kitchen.x ?? 0) - body.x;
    const dz = (kitchen[1] ?? kitchen.z ?? 0) - body.z;
    const d = Math.hypot(dx, dz);
    food = Math.min(1, 1 / (1 + d / 18));
  }
  return { light: day, food };
}

/** Apply light/food onto LIVE_CHANNELS indices (daylight=9, job progress=11). */
export function applySovereignProbes(inputs, probes) {
  if (!Array.isArray(inputs) || !probes) return inputs;
  const out = inputs.slice();
  if (out.length > 9) out[9] = Math.max(out[9] ?? 0, probes.light);
  if (out.length > 11) out[11] = Math.max(out[11] ?? 0, probes.food * 0.85);
  return out;
}

function ensureFlybodyTemplate() {
  if (flybodyTemplate) return Promise.resolve(flybodyTemplate);
  if (flybodyPromise) return flybodyPromise;
  flybodyPromise = new Promise((resolve) => {
    const loader = new GLTFLoader();
    const urls = ['nmf/flybody-glb/flybody.glb', 'nmf/flybody-glb/neuromechfly.glb'];
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) {
        flybodyTemplate = null;
        resolve(null);
        return;
      }
      const url = urls[i++];
      loader.load(
        url,
        (gltf) => {
          flybodyTemplate = gltf.scene;
          flybodyTemplate.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = false;
              o.receiveShadow = false;
            }
          });
          resolve(flybodyTemplate);
        },
        undefined,
        () => tryNext()
      );
    };
    tryNext();
  });
  return flybodyPromise;
}

/** Attach a scaled Flybody GLB under the crowned world fly. Idempotent.
 *  Mesh source: studio/nmf/flybody-glb (same assets as flywire-neuro frontend).
 */
export async function attachSovereignFlybody(g) {
  if (!g?.isObject3D || g.userData.sovereignFlybody) return g;
  g.userData.sovereignFlybody = true;
  const tmpl = await ensureFlybodyTemplate();
  if (!tmpl) {
    g.userData.sovereignFlybodyOk = false;
    return g;
  }
  const body = tmpl.clone(true);
  body.name = 'sovereign-flybody';
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1e-6);
  // Slightly larger than procedural proxy so the king reads as embodied.
  const s = 0.85 / span;
  body.scale.setScalar(s);
  body.position.set(0, 0.04, 0);
  body.rotation.y = Math.PI;
  body.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = Math.min(m.opacity ?? 1, 0.92);
      m.depthWrite = true;
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0.2, 0.25);
      if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.55, 0.45);
    }
  });
  g.add(body);
  g.userData.sovereignFlybodyOk = true;
  g.userData.sovereignFlybodySrc = 'nmf/flybody-glb (flywire-neuro twin)';
  return g;
}

/** Crown + body mesh for the king. */
export function exaltSovereign(g) {
  crownFly(g);
  attachSovereignFlybody(g).catch(() => {});
  return g;
}
