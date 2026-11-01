/**
 * Colony sits on a mountain summit. Zoom out → slopes fall away into a cloud sea.
 * Geometry is measured from town center; plateau stays at y=0 so existing world coords stay valid.
 */
import * as THREE from 'three';

function fbm2(x, z, seed = 0) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let o = 0; o < 5; o++) {
    const n = Math.sin((x * f + seed) * 12.9898 + (z * f) * 78.233 + o * 19.1) * 43758.5453;
    v += (n - Math.floor(n) - 0.5) * a;
    a *= 0.5;
    f *= 2.05;
  }
  return v;
}

/**
 * Radial summit mesh: flat colony top, then cliffs / slopes into the mist.
 * @returns {{ group: THREE.Group, plateauR: number, cloudY: number }}
 */
export function buildSummitPedestal(scene, {
  cx = 0,
  cz = 0,
  plateauR = 420,
  outerR = 2800,
  drop = 1100,
  radialSegs = 96,
  rings = 42
} = {}) {
  const group = new THREE.Group();
  group.name = 'summit-pedestal';

  const positions = [];
  const colors = [];
  const indices = [];
  const rock = new THREE.Color(0x6e6558);
  const cliff = new THREE.Color(0x4a453c);
  const moss = new THREE.Color(0x4f5c42);
  const snow = new THREE.Color(0xd8d4cc);
  const tmp = new THREE.Color();

  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    // Ease: long flat, then steep drop, then long skirt into clouds.
    const rim = t < 0.12 ? 0 : Math.pow((t - 0.12) / 0.88, 1.35);
    const r = plateauR + (outerR - plateauR) * t;
    for (let i = 0; i <= radialSegs; i++) {
      const a = (i / radialSegs) * Math.PI * 2;
      const noise = fbm2(Math.cos(a) * r * 0.004, Math.sin(a) * r * 0.004, 3.1);
      const ridge = fbm2(Math.cos(a * 3) * 0.7, Math.sin(a * 2) * 0.7, 9.2) * 0.35;
      const y = t < 0.12
        ? noise * 2.5
        : -drop * rim + noise * (40 + rim * 120) + ridge * rim * 90;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r * (1 + ridge * 0.04);
      positions.push(x, y, z);
      if (t < 0.1) tmp.copy(moss);
      else if (rim > 0.85) tmp.copy(snow).lerp(cliff, 0.35);
      else if (rim > 0.35) tmp.copy(cliff).lerp(rock, 0.4 + noise * 0.2);
      else tmp.copy(rock).lerp(moss, 0.25);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }

  const stride = radialSegs + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = j * stride + i;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: false,
    envMapIntensity: 0.55
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = true;
  group.add(mesh);

  // Inner plateau disc so the town floor never shows a hole at the rim.
  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(plateauR * 1.02, 64),
    new THREE.MeshStandardMaterial({
      color: 0x5a6a4e,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.35
    })
  );
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(cx, -0.4, cz);
  cap.receiveShadow = true;
  group.add(cap);

  scene.add(group);
  // Keep the cloud deck well under the plateau so bird's-eye / zoom-out isn't inside weather.
  return { group, plateauR, cloudY: -drop * 0.38, outerR, drop };
}

/**
 * Soft cloud sea around / below the summit — visible when the camera pulls back.
 */
export function buildCloudSea(scene, {
  cx = 0,
  cz = 0,
  innerR = 500,
  outerR = 3200,
  y = -240,
  count = 90
} = {}) {
  const group = new THREE.Group();
  group.name = 'cloud-sea';

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf2f4f8,
    emissive: 0xb8c4d8,
    emissiveIntensity: 0.18,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    flatShading: false
  });

  let seed = 90210;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = innerR + rnd() * (outerR - innerR);
    const puff = new THREE.Group();
    const n = 4 + ((rnd() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const s = 28 + rnd() * 70;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), cloudMat);
      b.position.set((rnd() - 0.5) * 110, (rnd() - 0.5) * 14, (rnd() - 0.5) * 110);
      b.scale.set(1 + rnd() * 0.6, 0.28 + rnd() * 0.2, 1 + rnd() * 0.5);
      b.frustumCulled = false;
      puff.add(b);
    }
    puff.position.set(cx + Math.cos(a) * rad, y + (rnd() - 0.5) * 50, cz + Math.sin(a) * rad);
    puff.userData.drift = 0.015 + rnd() * 0.04;
    puff.userData.baseY = puff.position.y;
    puff.userData.phase = rnd() * 6.28;
    group.add(puff);
  }

  // Thin haze disc under the colony for density when looking down the cliffs.
  const haze = new THREE.Mesh(
    new THREE.RingGeometry(innerR * 0.7, outerR * 0.95, 64),
    new THREE.MeshBasicMaterial({
      color: 0xdde4ef,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.set(cx, y - 30, cz);
  group.add(haze);

  // Darker under-cloud band — cliffs read as standing above weather, not floating in white.
  const underDark = new THREE.Mesh(
    new THREE.RingGeometry(innerR * 0.5, outerR * 0.7, 48),
    new THREE.MeshBasicMaterial({
      color: 0x1a2230,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  underDark.rotation.x = -Math.PI / 2;
  underDark.position.set(cx, y - 55, cz);
  group.add(underDark);

  scene.add(group);
  return group;
}

export function tickCloudSea(group, now) {
  if (!group) return;
  const t = now * 0.001;
  for (const puff of group.children) {
    if (!puff.userData?.drift) continue;
    puff.rotation.y += puff.userData.drift * 0.01;
    puff.position.y = puff.userData.baseY + Math.sin(t * 0.15 + puff.userData.phase) * 6;
  }
}
