/**
 * MaleCNS soma atlas + Flybody mesh loaders for studio brain live/atlas views.
 * Soma: measured positions from studio/nmf/brain-atlas (export_brain_atlas.py).
 * Flybody mesh packaging via cobanov/fly-connectome-template (attribution required).
 */
import * as THREE from 'three';

const GROUP_COLORS = [
  new THREE.Color(0x81b5c8), // optic
  new THREE.Color(0xcfcac0), // central
  new THREE.Color(0xdfb672), // descending
  new THREE.Color(0xaf9bc3), // vnc
  new THREE.Color(0x6c7777) // other
];

export async function loadSomaAtlas(base = 'nmf/brain-atlas/') {
  const manifest = await (await fetch(base + 'manifest.json')).json();
  const [posBuf, idBuf, grpBuf] = await Promise.all(
    ['positions.bin', 'ids.bin', 'groups.bin'].map(async (name) => {
      const r = await fetch(base + name);
      if (!r.ok) throw new Error('atlas ' + name);
      return r.arrayBuffer();
    })
  );
  const positions = new Float32Array(posBuf);
  const ids = new Uint32Array(idBuf);
  const groups = new Uint8Array(grpBuf);
  if (positions.length !== manifest.count * 3 || ids.length !== manifest.count || groups.length !== manifest.count) {
    throw new Error('atlas length mismatch');
  }
  return { manifest, positions, ids, groups };
}

/** Center + rigid flip + uniform scale into schematic brain units (~±2). */
export function layoutSoma(positions, groups, { maxGroup = 2, targetSpan = 5.2 } = {}) {
  const xyz = [];
  const keepIds = [];
  const keepGroups = [];
  const keepSrc = [];
  const bounds = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] > maxGroup) continue;
    // Native XY; rigid 180° about X (template convention) — no axis stretch.
    p.set(positions[i * 3], -positions[i * 3 + 1], -positions[i * 3 + 2]);
    xyz.push(p.x, p.y, p.z);
    keepIds.push(i);
    keepGroups.push(groups[i]);
    keepSrc.push(i);
    bounds.expandByPoint(p);
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = targetSpan / Math.max(size.x, size.y, size.z, 1e-6);
  for (let i = 0; i < xyz.length; i += 3) {
    xyz[i] = (xyz[i] - center.x) * scale;
    xyz[i + 1] = (xyz[i + 1] - center.y) * scale;
    xyz[i + 2] = (xyz[i + 2] - center.z) * scale;
  }
  return {
    xyz: new Float32Array(xyz),
    groups: new Uint8Array(keepGroups),
    srcIndex: keepSrc,
    scale,
    center
  };
}

export function buildIdIndex(ids, srcIndex) {
  const map = new Map();
  for (let j = 0; j < srcIndex.length; j++) {
    map.set(ids[srcIndex[j]], j);
  }
  return map;
}

export function createSomaPoints(layout, thoughtVert, thoughtFrag) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(layout.xyz, 3));
  const last = new Float32Array(layout.xyz.length / 3);
  last.fill(-1e9);
  geo.setAttribute('lastSpike', new THREE.BufferAttribute(last, 1).setUsage(THREE.DynamicDrawUsage));
  const polar = new Float32Array(layout.xyz.length / 3);
  for (let i = 0; i < polar.length; i++) {
    polar[i] = layout.groups[i] === 0 ? -1 : 1;
  }
  geo.setAttribute('polar', new THREE.BufferAttribute(polar, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      now: { value: 0 },
      dpr: { value: Math.min(devicePixelRatio, 2) },
      pointScale: { value: 1.35 },
      base: { value: 0.1 }
    },
    vertexShader: thoughtVert,
    fragmentShader: thoughtFrag
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.last = last;
  return points;
}

export async function loadFlybodyMesh(base = 'nmf/flybody/') {
  const meta = await (await fetch(base + 'model.json')).json();
  const buffer = await (await fetch(base + meta.binary)).arrayBuffer();
  const root = new THREE.Group();
  const colors = {
    body: 0x9e6834,
    black: 0x15110e,
    red: 0xad331f,
    ocelli: 0xe6b351,
    'bristle-brown': 0x281c10,
    lower: 0xbb8949,
    brown: 0x52351f
  };
  const materials = {};
  for (const [key, color] of Object.entries(colors)) {
    materials[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  }
  materials.membrane = new THREE.MeshStandardMaterial({
    color: 0xaabbcc,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  for (const part of meta.parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array(buffer.slice(part.positionByteOffset, part.positionByteOffset + part.positionCount * 12)),
        3
      )
    );
    geometry.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(buffer.slice(part.indexByteOffset, part.indexByteOffset + part.indexCount * 4)),
        1
      )
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials[part.material] ?? materials.body);
    mesh.position.fromArray(meta.pivots[part.group]);
    root.add(mesh);
  }
  const bounds = new THREE.Box3().setFromObject(root);
  root.position.sub(bounds.getCenter(new THREE.Vector3()));
  // Sit under the schematic brain; scale to ~2.2 units tall.
  const size = bounds.getSize(new THREE.Vector3());
  const s = 2.2 / Math.max(size.y, 1e-6);
  root.scale.setScalar(s);
  root.position.y = -2.35;
  root.rotation.y = Math.PI * 0.15;
  root.userData.flybody = true;
  return root;
}

export { GROUP_COLORS };
