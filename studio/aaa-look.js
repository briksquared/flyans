/**
 * AAA look bootstrap — HDRI day env, material kit, cinematic defaults.
 * Called from studio after renderer/scene exist. Compare-only visuals; no graph changes.
 */
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const DAY_HDR = 'tex/sky_1k.hdr';
const NIGHT_HDR = 'tex/local/highline-night.hdr';

function prepMap(tex, repeat = 2) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  return tex;
}

/** Load day HDR into PMREM; returns Promise<THREE.Texture|null>. */
export function loadDayEnvironment(renderer) {
  return new Promise((resolve) => {
    try {
      new RGBELoader().load(
        DAY_HDR,
        (texture) => {
          const gen = new THREE.PMREMGenerator(renderer);
          const env = gen.fromEquirectangular(texture).texture;
          gen.dispose();
          texture.dispose();
          resolve(env);
        },
        undefined,
        () => resolve(null)
      );
    } catch {
      resolve(null);
    }
  });
}

export { DAY_HDR, NIGHT_HDR };

/** Shared house/town material kit using on-disk textures. */
export function applyMaterialKit(materials = {}) {
  const loader = new THREE.TextureLoader();
  const {
    wallMat,
    floorMat,
    woodMat,
    roofMat
  } = materials;

  try {
    if (wallMat) {
      const plaster = prepMap(loader.load('tex/clay_plaster_1k.jpg'), 2.4);
      wallMat.map = plaster;
      wallMat.color.setHex(0xffffff);
      wallMat.roughness = 0.82;
      wallMat.metalness = 0.02;
      wallMat.envMapIntensity = 0.85;
      wallMat.needsUpdate = true;
    }
  } catch (e) {
    console.warn('aaa wall kit', e);
  }

  try {
    if (floorMat && !floorMat.map) {
      const floor = prepMap(loader.load('tex/concrete_floor_02_diff_1k.jpg'), 3);
      floorMat.map = floor;
      floorMat.color.setHex(0xffffff);
      floorMat.roughness = 0.9;
      floorMat.needsUpdate = true;
    } else if (floorMat?.map) {
      floorMat.envMapIntensity = Math.max(floorMat.envMapIntensity || 0.5, 0.7);
      floorMat.needsUpdate = true;
    }
  } catch (e) {
    console.warn('aaa floor kit', e);
  }

  try {
    if (woodMat) {
      const wood = prepMap(loader.load('tex/wood_cabinet_worn_long_1k.jpg'), 1.6);
      woodMat.map = wood;
      woodMat.color.setHex(0xffffff);
      woodMat.roughness = 0.78;
      woodMat.envMapIntensity = 0.7;
      woodMat.needsUpdate = true;
    }
  } catch (e) {
    console.warn('aaa wood kit', e);
  }

  try {
    if (roofMat) {
      const tile = prepMap(loader.load('tex/terrazzo_tiles_1k.jpg'), 2.2);
      roofMat.map = tile;
      roofMat.color.setHex(0xffffff);
      roofMat.roughness = 0.7;
      roofMat.envMapIntensity = 0.9;
      roofMat.needsUpdate = true;
    }
  } catch (e) {
    console.warn('aaa roof kit', e);
  }
}

/**
 * Soft ground contact discs under agents (fly feet / temple steps read).
 * Multiply-ish dark blob; updated each frame for nearby crew only.
 */
export function createContactBlobPool(scene, { count = 80, radius = 0.62 } = {}) {
  const geo = new THREE.CircleGeometry(radius, 18);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x0a0806,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    depthTest: true
  });
  const group = new THREE.Group();
  group.name = 'contact-blobs';
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 1;
    group.add(m);
    blobs.push(m);
  }
  scene.add(group);
  return {
    group,
    update(bodies, camera, budget = count) {
      const cam = camera.position;
      const scored = [];
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!b?.g || b.lowDetail) continue;
        const p = b.g.position;
        const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 420 * 420) continue;
        scored.push({ b, d2 });
      }
      scored.sort((a, c) => a.d2 - c.d2);
      const n = Math.min(budget, blobs.length, scored.length);
      for (let i = 0; i < blobs.length; i++) {
        if (i >= n) {
          blobs[i].visible = false;
          continue;
        }
        const body = scored[i].b;
        const p = body.g.position;
        const m = blobs[i];
        m.visible = true;
        m.position.set(p.x, 0.04, p.z);
        const s = 0.7 + Math.min(1.4, (body.g.scale?.x || 1) * 0.9);
        m.scale.set(s, s, s);
        const fade = 1 - Math.min(1, Math.sqrt(scored[i].d2) / 420);
        m.material.opacity = 0.12 + 0.26 * fade;
      }
    }
  };
}

/** Density rises when camera is high/far (summit establishing shot). Fog color tracks sky. */
export function updateAltitudeFog(scene, camera, {
  base = 0.00032,
  highY = 220,
  farXZ = 900,
  maxMult = 2.4,
  skyHex = null
} = {}) {
  if (!scene.fog || !scene.fog.isFogExp2) return;
  const y = Math.max(0, camera.position.y);
  const xz = Math.hypot(camera.position.x, camera.position.z);
  const yFactor = Math.min(1, y / highY);
  const xzFactor = Math.min(1, xz / farXZ);
  const mult = 1 + (maxMult - 1) * Math.max(yFactor, xzFactor * 0.85);
  scene.fog.density = base * mult;
  if (skyHex != null && scene.fog.color) {
    try { scene.fog.color.setHex(skyHex); } catch (_) { /* ignore */ }
  }
  return { yFactor, xzFactor, mult };
}

/** Kill toy flat shading on a material list / scene walk. */
export function unflattenMaterials(root) {
  const visit = (m) => {
    if (!m || m.userData?.aaaUnflat) return;
    if (m.flatShading) {
      m.flatShading = false;
      m.needsUpdate = true;
    }
    if ('envMapIntensity' in m && (m.envMapIntensity ?? 1) < 0.45) {
      // Mild lift only — 0.75+ on pale stone read as chalk/white under HDR.
      m.envMapIntensity = 0.55;
      m.needsUpdate = true;
    }
    m.userData.aaaUnflat = true;
  };
  if (root?.isMaterial) {
    visit(root);
    return;
  }
  root?.traverse?.((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(visit);
  });
}
