/**
 * Movie studio in the far NORTH CORNER (NW mountain pocket — east is houses).
 * Esplanade of Pyramids: ten stepped pyramids along the road from the city
 * north all the way into that corner.
 */

function disposeGroup(scene, name) {
  const prior = scene.getObjectByName(name);
  if (!prior) return;
  scene.remove(prior);
  prior.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose?.();
    }
  });
}

function steppedPyramid(THREE, meshAt, stone, paint, glass, x, z, base, faceYaw, opts = {}) {
  const g = new THREE.Group();
  const accent =
    opts.accent ||
    new THREE.MeshStandardMaterial({
      color: 0x5a5348,
      roughness: 0.92,
      metalness: 0.03,
      envMapIntensity: 0.45,
      userData: { skipOctanePolish: true }
    });
  const tiers = [base, base * 0.82, base * 0.64, base * 0.48, base * 0.34, base * 0.22];
  let y = 0;
  for (let i = 0; i < tiers.length; i++) {
    const s = tiers[i];
    const h = 11 + (i === tiers.length - 1 ? 9 : 1);
    const m = meshAt(new THREE.BoxGeometry(s, h, s), stone, 0, y + h / 2, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    // Recessed band under each terrace — reads as masonry, not a toy stack
    if (i < tiers.length - 1) {
      const band = meshAt(new THREE.BoxGeometry(s * 0.98, 1.4, s * 0.98), accent, 0, y + h - 0.4, 0);
      g.add(band);
    }
    y += h * 0.92;
  }
  // Real stair flight (steps) facing the avenue
  const steps = 10;
  const stairW = base * 0.2;
  for (let s = 0; s < steps; s++) {
    const t = s / steps;
    const sh = 2.2;
    const step = meshAt(
      new THREE.BoxGeometry(stairW, sh, base * 0.08),
      paint,
      0,
      sh / 2 + s * 1.85,
      base * 0.48 - s * (base * 0.042)
    );
    g.add(step);
  }
  // Corner buttresses
  const butt = base * 0.08;
  for (const [bx, bz] of [
    [-base * 0.42, -base * 0.42],
    [base * 0.42, -base * 0.42],
    [-base * 0.42, base * 0.42],
    [base * 0.42, base * 0.42]
  ]) {
    g.add(meshAt(new THREE.BoxGeometry(butt, y * 0.55, butt), accent, bx, y * 0.28, bz));
  }
  const cap = meshAt(new THREE.BoxGeometry(base * 0.14, 10, base * 0.14), paint, 0, y + 5, 0);
  g.add(cap);
  if (glass) {
    const lens = meshAt(new THREE.SphereGeometry(base * 0.045, 12, 10), glass, 0, y + 12, 0);
    g.add(lens);
  }
  g.position.set(x, 0, z);
  g.rotation.y = faceYaw;
  g.userData.height = y + 16;
  return g;
}

/** @param {object} ctx */
export function buildFilmLot(ctx) {
  const {
    THREE,
    scene,
    fieldMid,
    fieldR,
    LANDSCAPE_R,
    TEMPLE_X = 0,
    TEMPLE_Z,
    TEMPLE_BASE_HALF,
    SPOT,
    SPOT_FACE,
    CAMS,
    ROADS,
    TEMPLES,
    areaLabel,
    meshAt
  } = ctx;
  if (!THREE || !scene) return null;
  disposeGroup(scene, 'film-lot');
  disposeGroup(scene, 'esplanade-of-pyramids');

  // Far NORTH CORNER — NW mountain pocket (east = houses / Mixed City; SW = elder ruins).
  // Deep into the ring so it reads as “back in the corner.”
  const dR = LANDSCAPE_R - 520;
  const dAng = -2.2; // NNW corner
  const CX = Math.cos(dAng) * dR;
  const CZ = fieldMid + Math.sin(dAng) * dR;

  const tx = (TEMPLE_X || 0) - CX;
  const tz = (Number.isFinite(TEMPLE_Z) ? TEMPLE_Z : fieldMid) - CZ;
  const td = Math.hypot(tx, tz) || 1;
  const axx = tx / td;
  const axz = tz / td;
  const pxx = -axz;
  const pxz = axx;
  const P = (a, s) => [CX + axx * a + pxx * s, CZ + axz * a + pxz * s];
  const faceYaw = Math.atan2(axx, axz);

  SPOT.filmset = [CX, CZ];
  SPOT_FACE.filmset = [axx, axz];
  SPOT.backlot = P(80, 0);
  SPOT_FACE.backlot = [axx, axz];
  SPOT.soundstage = P(-40, 0);
  SPOT_FACE.soundstage = [axx, axz];
  SPOT.wardrobe = P(20, 90);
  SPOT_FACE.wardrobe = [axx, axz];
  SPOT.propyard = P(20, -100);
  SPOT_FACE.propyard = [axx, axz];
  // Start just north of the Jade Colossus so the procession reads:
  // Great Temple → Jade promenade → Esplanade of Pyramids → north-corner studio.
  {
    const jadeZ = fieldMid - (fieldR || 200) * 2.25;
    const templeFoot =
      Number.isFinite(TEMPLE_Z) && Number.isFinite(TEMPLE_BASE_HALF)
        ? TEMPLE_Z - TEMPLE_BASE_HALF - 2
        : jadeZ + 120;
    // Prefer past the Jade; never south of the temple foot.
    const startZ = Math.min(templeFoot, jadeZ - 70);
    SPOT.esplanade = [TEMPLE_X || 0, startZ];
  }
  // Face along the avenue toward the studio (north into the corner)
  {
    const ex = CX - SPOT.esplanade[0];
    const ez = CZ - SPOT.esplanade[1];
    const ed = Math.hypot(ex, ez) || 1;
    SPOT_FACE.esplanade = [ex / ed, ez / ed];
  }

  const frame = (cx, cz, h, d, atY) => {
    const townX = TEMPLE_X || 0;
    const townZ = Number.isFinite(TEMPLE_Z) ? TEMPLE_Z : fieldMid;
    const vx = townX - cx;
    const vz = townZ - cz;
    const L = Math.hypot(vx, vz) || 1;
    return { pos: [cx + (vx / L) * d, h, cz + (vz / L) * d], at: [cx, atY, cz] };
  };
  CAMS.filmset = frame(CX, CZ, 120, 300, 28);
  CAMS.backlot = frame(...P(80, 0), 55, 160, 12);
  CAMS.soundstage = frame(...P(-40, 0), 48, 140, 10);
  CAMS.filmpyramid = frame(...P(-140, 0), 95, 240, 42);
  CAMS.esplanade = frame((SPOT.esplanade[0] + CX) / 2, (SPOT.esplanade[1] + CZ) / 2, 160, 420, 36);
  // Mid / gate cams filled after avenue math below (placeholders until then)
  CAMS.esplanade_mid = CAMS.esplanade;
  CAMS.studio_gate = CAMS.filmset;

  const group = new THREE.Group();
  group.name = 'film-lot';
  group.frustumCulled = false;
  scene.add(group);

  const stone = new THREE.MeshStandardMaterial({
    color: 0x7a7264,
    roughness: 0.9,
    metalness: 0.04,
    envMapIntensity: 0.5
  });
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e,
    roughness: 0.95,
    metalness: 0.02,
    envMapIntensity: 0.35
  });
  const stageBlack = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.45, metalness: 0.55 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.82, metalness: 0.02 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.9, metalness: 0 });
  const green = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.7, metalness: 0.05 });
  const paint = new THREE.MeshStandardMaterial({
    color: 0x8a8070,
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.55
  });
  const red = new THREE.MeshStandardMaterial({ color: 0xa04040, roughness: 0.6, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc4a060, roughness: 0.4, metalness: 0.45 });
  // No MeshPhysical transmission — it blooms the HDR path into a white wash.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x6a8aaa,
    roughness: 0.25,
    metalness: 0.35,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 0.7
  });
  for (const m of [stone, asphalt, stageBlack, steel, wood, canvas, green, paint, red, gold, glass]) {
    m.userData.skipOctanePolish = true;
  }

  // —— Ground apron ——
  {
    const pad = meshAt(new THREE.CylinderGeometry(220, 220, 1.2, 48), asphalt, CX, 0.4, CZ);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // —— Studio pyramid at the corner lot (“House of Moving Light”) ——
  {
    const [px, pz] = P(-140, 0);
    const pyr = steppedPyramid(THREE, meshAt, stone, paint, glass, px, pz, 118, faceYaw);
    group.add(pyr);
    try {
      areaLabel('Film pyramid', 'House of Moving Light — north-corner studio', px, pyr.userData.height, pz);
    } catch {
      /* ignore */
    }
    if (Array.isArray(TEMPLES)) TEMPLES.push({ x: px, z: pz, r: 70 });
  }

  // —— Soundstages (3 black hangars); stage 2 is open so you can see inside ——
  for (let i = -1; i <= 1; i++) {
    const [sx, sz] = P(-50, i * 70);
    const open = i === 0;
    if (open) {
      // Floor + three walls + roof — door face open toward town
      const floor = meshAt(new THREE.BoxGeometry(70, 1, 48), stageBlack, sx, 0.5, sz);
      floor.rotation.y = faceYaw;
      floor.receiveShadow = true;
      group.add(floor);
      const back = meshAt(new THREE.BoxGeometry(70, 36, 1.5), stageBlack, sx - axx * 24, 18, sz - axz * 24);
      back.rotation.y = faceYaw;
      group.add(back);
      for (const side of [-1, 1]) {
        const wall = meshAt(
          new THREE.BoxGeometry(1.5, 36, 48),
          stageBlack,
          sx + pxx * side * 35,
          18,
          sz + pxz * side * 35
        );
        wall.rotation.y = faceYaw;
        group.add(wall);
      }
      const roof = meshAt(new THREE.BoxGeometry(72, 1.5, 50), steel, sx, 36, sz);
      roof.rotation.y = faceYaw;
      group.add(roof);
      // Interior green cyc + grid floor marks
      const cyc = meshAt(new THREE.BoxGeometry(64, 28, 1), green, sx - axx * 22, 14, sz - axz * 22);
      cyc.rotation.y = faceYaw;
      group.add(cyc);
      for (let g = -2; g <= 2; g++) {
        const line = meshAt(
          new THREE.BoxGeometry(60, 0.12, 0.4),
          paint,
          sx + pxx * g * 8,
          1.15,
          sz + pxz * g * 8
        );
        line.rotation.y = faceYaw;
        line.renderOrder = 2;
        group.add(line);
      }
      // Softbox truss inside
      for (let L = -1; L <= 1; L++) {
        const soft = new THREE.Mesh(
          new THREE.BoxGeometry(10, 8, 1.2),
          new THREE.MeshStandardMaterial({
            color: 0xe8dcc0,
            emissive: 0x886644,
            emissiveIntensity: 0.28,
            roughness: 0.6,
            userData: { skipOctanePolish: true }
          })
        );
        soft.position.set(sx + pxx * L * 16, 28, sz + pxz * L * 16 + axx * 8);
        soft.rotation.y = faceYaw;
        group.add(soft);
      }
      try {
        areaLabel('Stage 2', 'Open soundstage · green cyc · softboxes', sx, 42, sz);
      } catch {
        /* ignore */
      }
    } else {
      const hall = meshAt(new THREE.BoxGeometry(70, 36, 48), stageBlack, sx, 18, sz);
      hall.rotation.y = faceYaw;
      hall.castShadow = true;
      group.add(hall);
      const door = meshAt(new THREE.BoxGeometry(18, 22, 1.2), steel, sx + axx * 25, 11, sz + axz * 25);
      door.rotation.y = faceYaw;
      group.add(door);
    }
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(8, 2, 4),
      new THREE.MeshStandardMaterial({
        color: 0xe8d8a8,
        emissive: 0xaa8844,
        emissiveIntensity: 0.35,
        roughness: 0.55,
        userData: { skipOctanePolish: true }
      })
    );
    lamp.position.set(sx, 34, sz);
    group.add(lamp);
  }

  // —— Open backlot facades ——
  for (let i = 0; i < 5; i++) {
    const [fx, fz] = P(70 + i * 8, -40 + i * 28);
    const facade = meshAt(new THREE.BoxGeometry(6, 28 + (i % 3) * 6, 36), paint, fx, 14 + (i % 3) * 3, fz);
    facade.rotation.y = faceYaw + Math.PI / 2;
    facade.castShadow = true;
    group.add(facade);
    // Windows
    for (let w = 0; w < 3; w++) {
      const win = meshAt(new THREE.BoxGeometry(1.2, 4, 5), glass, fx + pxx * (8 - w * 8), 12 + w * 2, fz + pxz * (8 - w * 8));
      group.add(win);
    }
  }

  // —— Green screen wall ——
  {
    const [gx, gz] = P(40, 120);
    const gs = meshAt(new THREE.BoxGeometry(4, 40, 90), green, gx, 20, gz);
    gs.rotation.y = faceYaw;
    group.add(gs);
    try {
      areaLabel('Green screen', 'Key anything — sky, jungle, space', gx, 44, gz);
    } catch {
      /* ignore */
    }
  }

  // —— Wardrobe trailers ——
  for (let i = 0; i < 3; i++) {
    const [wx, wz] = P(10, 70 + i * 28);
    const trail = meshAt(new THREE.BoxGeometry(14, 10, 36), canvas, wx, 5, wz);
    trail.rotation.y = faceYaw;
    trail.castShadow = true;
    group.add(trail);
    // Rack of “costumes” (colored bars)
    for (let c = 0; c < 6; c++) {
      const hue = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(c / 6, 0.55, 0.45),
        roughness: 0.7
      });
      const bar = meshAt(new THREE.BoxGeometry(0.6, 8, 2), hue, wx + pxx * (c * 3 - 7.5), 6, wz + pxz * (c * 3 - 7.5));
      group.add(bar);
    }
  }

  // —— Prop yard: furniture ——
  const propRoot = new THREE.Group();
  propRoot.name = 'film-props';
  group.add(propRoot);
  const propCatalog = [];
  function addProp(kind, mesh, label) {
    propRoot.add(mesh);
    propCatalog.push({ kind, mesh, label });
  }
  {
    const [bx, bz] = P(30, -90);
    // Tables
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Group();
      t.add(meshAt(new THREE.BoxGeometry(10, 0.6, 6), wood, 0, 4, 0));
      t.add(meshAt(new THREE.BoxGeometry(0.7, 4, 0.7), wood, -4, 2, -2));
      t.add(meshAt(new THREE.BoxGeometry(0.7, 4, 0.7), wood, 4, 2, -2));
      t.add(meshAt(new THREE.BoxGeometry(0.7, 4, 0.7), wood, -4, 2, 2));
      t.add(meshAt(new THREE.BoxGeometry(0.7, 4, 0.7), wood, 4, 2, 2));
      t.position.set(bx + pxx * (i * 14 - 30), 0, bz + pxz * (i * 14 - 30));
      addProp('furniture', t, 'table');
    }
    // Chairs
    for (let i = 0; i < 8; i++) {
      const ch = new THREE.Group();
      ch.add(meshAt(new THREE.BoxGeometry(3.2, 0.4, 3.2), wood, 0, 2.2, 0));
      ch.add(meshAt(new THREE.BoxGeometry(3.2, 4, 0.4), wood, 0, 4.2, -1.4));
      ch.position.set(bx + axx * 25 + pxx * (i * 8 - 28), 0, bz + axz * 25 + pxz * (i * 8 - 28));
      addProp('furniture', ch, 'chair');
    }
    // Sofas
    for (let i = 0; i < 3; i++) {
      const sofa = meshAt(new THREE.BoxGeometry(14, 4, 6), new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.85 }), 0, 2, 0);
      const g = new THREE.Group();
      g.add(sofa);
      g.add(meshAt(new THREE.BoxGeometry(14, 4, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a4555, roughness: 0.85 }), 0, 4, -2.4));
      g.position.set(bx - axx * 20 + pxx * (i * 20 - 20), 0, bz - axz * 20 + pxz * (i * 20 - 20));
      addProp('furniture', g, 'sofa');
    }
  }

  // —— Vehicles ——
  function makeCar(colorHex) {
    const g = new THREE.Group();
    const body = meshAt(new THREE.BoxGeometry(16, 5, 8), new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.35 }), 0, 4, 0);
    g.add(body);
    g.add(meshAt(new THREE.BoxGeometry(8, 4, 7.5), glass, 1, 7.5, 0));
    for (const [x, z] of [
      [-5, -4],
      [-5, 4],
      [5, -4],
      [5, 4]
    ]) {
      const wh = meshAt(new THREE.CylinderGeometry(2, 2, 1.2, 12), steel, x, 2, z);
      wh.rotation.z = Math.PI / 2;
      g.add(wh);
    }
    return g;
  }
  {
    const colors = [0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0xecf0f1];
    for (let i = 0; i < colors.length; i++) {
      const [vx, vz] = P(100, -60 + i * 22);
      const car = makeCar(colors[i]);
      car.position.set(vx, 0, vz);
      car.rotation.y = faceYaw + Math.PI / 2;
      addProp('vehicle', car, 'car');
    }
    // Truck
    const [tx2, tz2] = P(120, -40);
    const truck = new THREE.Group();
    truck.add(meshAt(new THREE.BoxGeometry(22, 8, 10), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.3 }), 0, 6, 0));
    truck.add(meshAt(new THREE.BoxGeometry(10, 7, 9.5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.2 }), -12, 7, 0));
    truck.position.set(tx2, 0, tz2);
    truck.rotation.y = faceYaw;
    addProp('vehicle', truck, 'truck');
  }

  // —— Airplane on a short strip ——
  {
    const [ax, az] = P(180, 0);
    const strip = meshAt(new THREE.BoxGeometry(40, 0.6, 220), asphalt, ax, 0.3, az);
    strip.rotation.y = faceYaw;
    group.add(strip);
    const plane = new THREE.Group();
    plane.add(meshAt(new THREE.CylinderGeometry(3.5, 3, 36, 12), new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.4, metalness: 0.5 }), 0, 6, 0));
    const wing = meshAt(new THREE.BoxGeometry(40, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xd0d4dc, roughness: 0.45, metalness: 0.4 }), 0, 7, 0);
    plane.add(wing);
    plane.add(meshAt(new THREE.BoxGeometry(12, 0.6, 6), steel, -14, 10, 0));
    plane.position.set(ax, 0, az);
    plane.rotation.y = faceYaw;
    addProp('vehicle', plane, 'plane');
    try {
      areaLabel('Airstrip', 'Fly-in arrivals · aerial plates', ax, 28, az);
    } catch {
      /* ignore */
    }
  }

  // —— Filming equipment: cameras, lights, boom, crane, clapper ——
  const gearRoot = new THREE.Group();
  gearRoot.name = 'film-gear';
  group.add(gearRoot);
  function cameraOnTripod(x, y, z) {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.CylinderGeometry(0.4, 1.2, 8, 8), steel, 0, 4, 0));
    g.add(meshAt(new THREE.BoxGeometry(3, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.3 }), 0, 9, 0));
    g.add(meshAt(new THREE.CylinderGeometry(1.2, 1.4, 3, 12), steel, 0, 9, 3.2));
    g.position.set(x, y, z);
    gearRoot.add(g);
    return g;
  }
  for (let i = 0; i < 4; i++) {
    const [cx, cz] = P(55 + i * 5, -20 + i * 18);
    cameraOnTripod(cx, 0, cz);
  }
  // Soft lights
  for (let i = 0; i < 5; i++) {
    const [lx, lz] = P(45, 30 + i * 16);
    const stand = meshAt(new THREE.CylinderGeometry(0.3, 0.8, 16, 8), steel, lx, 8, lz);
    gearRoot.add(stand);
    const soft = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, emissive: 0x886644, emissiveIntensity: 0.3, roughness: 0.65 })
    );
    soft.position.set(lx + axx * 2, 16, lz + axz * 2);
    soft.rotation.y = faceYaw;
    gearRoot.add(soft);
  }
  // Crane
  {
    const [crx, crz] = P(90, 40);
    const base = meshAt(new THREE.BoxGeometry(10, 4, 10), steel, crx, 2, crz);
    gearRoot.add(base);
    const arm = meshAt(new THREE.BoxGeometry(4, 3, 70), steel, crx + axx * 30, 22, crz + axz * 30);
    arm.rotation.y = faceYaw;
    gearRoot.add(arm);
    cameraOnTripod(crx + axx * 60, 18, crz + axz * 60);
  }
  // Clapperboard on set
  {
    const [clx, clz] = P(50, 0);
    const board = meshAt(new THREE.BoxGeometry(8, 6, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }), clx, 5, clz);
    gearRoot.add(board);
    const stripe = meshAt(new THREE.BoxGeometry(8, 1.4, 0.7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), clx, 7.5, clz);
    gearRoot.add(stripe);
  }
  // Director chairs
  for (let i = 0; i < 3; i++) {
    const [dx, dz] = P(48, 8 + i * 10);
    const chair = new THREE.Group();
    chair.add(meshAt(new THREE.BoxGeometry(4, 0.3, 4), canvas, 0, 4, 0));
    chair.add(meshAt(new THREE.BoxGeometry(4, 5, 0.3), canvas, 0, 6.5, -1.8));
    chair.add(meshAt(new THREE.BoxGeometry(0.4, 8, 0.4), wood, -1.6, 4, -1.6));
    chair.add(meshAt(new THREE.BoxGeometry(0.4, 8, 0.4), wood, 1.6, 4, -1.6));
    chair.add(meshAt(new THREE.BoxGeometry(0.4, 8, 0.4), wood, -1.6, 4, 1.6));
    chair.add(meshAt(new THREE.BoxGeometry(0.4, 8, 0.4), wood, 1.6, 4, 1.6));
    chair.position.set(dx, 0, dz);
    gearRoot.add(chair);
  }

  // —— Production office ——
  {
    const [ox, oz] = P(-20, 110);
    const office = meshAt(new THREE.BoxGeometry(40, 16, 28), paint, ox, 8, oz);
    office.rotation.y = faceYaw;
    office.castShadow = true;
    group.add(office);
    group.add(meshAt(new THREE.BoxGeometry(12, 8, 1), glass, ox + axx * 20, 8, oz + axz * 20));
  }

  // —— Lot fence + main gate marquee ——
  {
    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a40,
      roughness: 0.55,
      metalness: 0.4,
      envMapIntensity: 0.4,
      userData: { skipOctanePolish: true }
    });
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const r = 210;
      const fx = CX + Math.cos(ang) * r;
      const fz = CZ + Math.sin(ang) * r;
      const post = meshAt(new THREE.BoxGeometry(1.2, 8, 1.2), fenceMat, fx, 4, fz);
      group.add(post);
      if (i % 2 === 0) {
        const rail = meshAt(new THREE.BoxGeometry(18, 0.5, 0.5), fenceMat, fx, 5.5, fz);
        rail.rotation.y = ang + Math.PI / 2;
        group.add(rail);
      }
    }
    const [mx, mz] = P(200, 0);
    const marquee = meshAt(new THREE.BoxGeometry(48, 10, 4), paint, mx, 14, mz);
    marquee.rotation.y = faceYaw;
    group.add(marquee);
    const board = meshAt(
      new THREE.BoxGeometry(44, 6, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x1a1a1e,
        roughness: 0.6,
        userData: { skipOctanePolish: true }
      }),
      mx + axx * 2.2,
      14,
      mz + axz * 2.2
    );
    board.rotation.y = faceYaw;
    group.add(board);
  }

  // —— Water tower + craft tent ——
  {
    const [wx, wz] = P(-90, -130);
    const leg = new THREE.MeshStandardMaterial({
      color: 0x55555c,
      roughness: 0.5,
      metalness: 0.55,
      userData: { skipOctanePolish: true }
    });
    for (const [ox, oz] of [
      [-6, -6],
      [6, -6],
      [-6, 6],
      [6, 6]
    ]) {
      group.add(meshAt(new THREE.CylinderGeometry(0.7, 0.9, 42, 6), leg, wx + ox, 21, wz + oz));
    }
    group.add(meshAt(new THREE.CylinderGeometry(10, 10, 14, 16), steel, wx, 48, wz));
    group.add(meshAt(new THREE.ConeGeometry(11, 8, 16), paint, wx, 58, wz));
    const [tx, tz] = P(60, 150);
    const tent = meshAt(new THREE.BoxGeometry(28, 8, 20), canvas, tx, 4, tz);
    tent.rotation.y = faceYaw;
    group.add(tent);
    group.add(meshAt(new THREE.ConeGeometry(18, 6, 4), red, tx, 10, tz));
  }

  // Stage number plates on hangar doors
  for (let i = -1; i <= 1; i++) {
    const [sx, sz] = P(-50 + 24, i * 70);
    const plate = meshAt(
      new THREE.BoxGeometry(8, 5, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x111114,
        roughness: 0.5,
        userData: { skipOctanePolish: true }
      }),
      sx,
      28,
      sz
    );
    plate.rotation.y = faceYaw;
    group.add(plate);
  }

  try {
    areaLabel('Film lot', 'North-corner studio · soundstages · backlot · props', CX, 52, CZ);
  } catch {
    /* ignore */
  }

  // —— Esplanade of Pyramids: ten along the road from the great temple north into the corner ——
  const esplanade = new THREE.Group();
  esplanade.name = 'esplanade-of-pyramids';
  esplanade.frustumCulled = false;
  scene.add(esplanade);

  const startX = SPOT.esplanade[0];
  const startZ = SPOT.esplanade[1];
  const endX = CX;
  const endZ = CZ;
  const spanX = endX - startX;
  const spanZ = endZ - startZ;
  const spanLen = Math.hypot(spanX, spanZ) || 1;
  const ux = spanX / spanLen;
  const uz = spanZ / spanLen;
  const sx = -uz;
  const sz = ux;
  const roadYaw = Math.atan2(ux, uz);
  const along = (t, side = 0, off = 0) => [
    startX + spanX * t + sx * (side * off),
    startZ + spanZ * t + sz * (side * off)
  ];

  // Processional road all the way to the studio
  {
    const roadW = 42;
    const road = meshAt(
      new THREE.BoxGeometry(roadW, 0.8, spanLen),
      asphalt,
      (startX + endX) / 2,
      0.25,
      (startZ + endZ) / 2
    );
    road.rotation.y = roadYaw;
    road.receiveShadow = true;
    esplanade.add(road);
    // Center strip (darker stone — light paint was washing the avenue white under HDR)
    const strip = meshAt(
      new THREE.BoxGeometry(6, 0.9, spanLen * 0.98),
      stone,
      (startX + endX) / 2,
      0.32,
      (startZ + endZ) / 2
    );
    strip.rotation.y = roadYaw;
    esplanade.add(strip);
    if (Array.isArray(ROADS)) {
      ROADS.push({ ax: startX, az: startZ, bx: endX, bz: endZ, w: roadW });
    }
  }

  // Gateway pylons — city / Jade end + guardian sphinxes
  for (const side of [-1, 1]) {
    const [gx, gz] = along(0.02, side, 28);
    const pylon = meshAt(new THREE.BoxGeometry(10, 52, 10), stone, gx, 26, gz);
    pylon.castShadow = true;
    esplanade.add(pylon);
    esplanade.add(meshAt(new THREE.BoxGeometry(14, 6, 14), paint, gx, 52, gz));
    esplanade.add(meshAt(new THREE.BoxGeometry(4, 8, 4), gold, gx, 58, gz));
    // Guardian: body + head facing the avenue
    const [sx0, sz0] = along(0.04, side, 48);
    const body = meshAt(new THREE.BoxGeometry(18, 10, 28), stone, sx0, 5, sz0);
    body.rotation.y = roadYaw;
    esplanade.add(body);
    const head = meshAt(new THREE.BoxGeometry(10, 10, 10), paint, sx0 + ux * 14, 14, sz0 + uz * 14);
    head.rotation.y = roadYaw;
    esplanade.add(head);
    esplanade.add(meshAt(new THREE.BoxGeometry(12, 3, 4), gold, sx0 + ux * 14, 20, sz0 + uz * 14));
  }
  try {
    const [gox, goz] = along(0.03, 0, 0);
    areaLabel('Esplanade gate', 'Past the Jade · ten temples to the studio', gox, 56, goz);
  } catch {
    /* ignore */
  }
  // Arrival pylons — studio end
  for (const side of [-1, 1]) {
    const [gx, gz] = along(0.96, side, 32);
    const pylon = meshAt(new THREE.BoxGeometry(12, 64, 12), stone, gx, 32, gz);
    pylon.castShadow = true;
    esplanade.add(pylon);
    esplanade.add(meshAt(new THREE.BoxGeometry(16, 7, 16), paint, gx, 64, gz));
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xcc7722, emissive: 0x884400, emissiveIntensity: 0.4, roughness: 0.5 })
    );
    flame.position.set(gx, 72, gz);
    esplanade.add(flame);
  }

  // Torch posts down the centerline (between pyramid pairs)
  for (let i = 0; i < 9; i++) {
    const t = 0.1 + (i / 8) * 0.8;
    const [tx, tz] = along(t, 0, 0);
    const post = meshAt(new THREE.CylinderGeometry(1.2, 1.6, 18, 8), stone, tx, 9, tz);
    esplanade.add(post);
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 1.8, 2.2, 10),
      new THREE.MeshStandardMaterial({ color: 0xcc9944, emissive: 0x885500, emissiveIntensity: 0.35, roughness: 0.55 })
    );
    bowl.position.set(tx, 19, tz);
    esplanade.add(bowl);
  }

  const N = 10;
  const flank = 100;
  const bases = [72, 64, 80, 58, 76, 62, 70, 66, 78, 60];
  const names = [
    'First Light',
    'Second Cut',
    'Third Take',
    'Fourth Reel',
    'Fifth Gate',
    'Sixth Mark',
    'Seventh Cue',
    'Eighth Frame',
    'Ninth Call',
    'Tenth Arrival'
  ];
  // Warm→cool stone progression along the avenue (reads as a sequence, not ten clones)
  const stoneHex = [0x8a7a62, 0x84755e, 0x7e7160, 0x786d62, 0x726864, 0x6c6460, 0x68605c, 0x645c58, 0x605854, 0x5c5450];
  const pyramids = [];
  for (let i = 0; i < N; i++) {
    // Spread along the avenue; leave clear pads at temple foot and studio apron
    const t = 0.08 + (i / (N - 1)) * 0.84;
    const side = i % 2 === 0 ? -1 : 1;
    const [px, pz] = along(t, side, flank);
    // Stairs face the road (inward), not down the avenue
    const face = Math.atan2(-sx * side, -sz * side);
    const localStone = new THREE.MeshStandardMaterial({
      color: stoneHex[i],
      roughness: 0.9,
      metalness: 0.04,
      envMapIntensity: 0.48,
      userData: { skipOctanePolish: true }
    });
    const accentHex = [
      0x6a5a48, 0x665648, 0x62544a, 0x5e524c, 0x5a504e, 0x564c4a, 0x524846, 0x4e4442, 0x4a403e, 0x463c3a
    ][i];
    const localAccent = new THREE.MeshStandardMaterial({
      color: accentHex,
      roughness: 0.94,
      metalness: 0.02,
      envMapIntensity: 0.4,
      userData: { skipOctanePolish: true }
    });
    const pyr = steppedPyramid(
      THREE,
      meshAt,
      localStone,
      paint,
      i === N - 1 ? glass : null,
      px,
      pz,
      bases[i],
      face,
      { accent: localAccent }
    );
    pyr.name = `esplanade-pyramid-${i + 1}`;
    pyr.userData.pyramidIndex = i + 1;
    pyr.userData.pyramidName = names[i];
    esplanade.add(pyr);

    // Courtyard pad + low wall facing the road
    const [cxp, czp] = along(t, side, flank * 0.55);
    const pad = meshAt(new THREE.CylinderGeometry(bases[i] * 0.55, bases[i] * 0.55, 0.6, 24), asphalt, cxp, 0.2, czp);
    pad.receiveShadow = true;
    esplanade.add(pad);
    // Banner pole between pyramid and road
    const [bx, bz] = along(t, side, 48);
    esplanade.add(meshAt(new THREE.CylinderGeometry(0.6, 0.8, 28, 6), stone, bx, 14, bz));
    const cloth = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08 + i * 0.07, 0.45, 0.38),
      roughness: 0.85,
      userData: { skipOctanePolish: true }
    });
    const banner = meshAt(new THREE.BoxGeometry(0.3, 12, 7), cloth, bx + sx * side * 3.5, 18, bz + sz * side * 3.5);
    banner.rotation.y = roadYaw;
    esplanade.add(banner);

    pyramids.push({ i: i + 1, name: names[i], x: px, z: pz, t, side, base: bases[i] });
    if (Array.isArray(TEMPLES)) TEMPLES.push({ x: px, z: pz, r: bases[i] * 0.55 + 12 });
    // Per-pyramid camera (town-facing pullback)
    if (CAMS) {
      CAMS[`esp${i + 1}`] = frame(px, pz, 55 + bases[i] * 0.35, 140 + bases[i], pyr.userData.height * 0.35);
    }
    try {
      if (i === 0 || i === 4 || i === 9) {
        areaLabel(names[i], `Esplanade pyramid ${i + 1} of 10`, px, (pyr.userData.height || 60) + 8, pz);
      }
    } catch {
      /* ignore */
    }
  }

  // Waystone mile markers every ~2 pyramids on the center strip
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + i * 0.18;
    const [mx, mz] = along(t, 0, 0);
    esplanade.add(meshAt(new THREE.BoxGeometry(3, 5, 3), paint, mx, 2.5, mz));
    esplanade.add(meshAt(new THREE.BoxGeometry(4.5, 1.2, 4.5), gold, mx, 5.5, mz));
  }

  // Reflecting pools on the centerline between pyramid pairs
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2a4058,
    roughness: 0.15,
    metalness: 0.35,
    transparent: true,
    opacity: 0.85,
    envMapIntensity: 0.9,
    userData: { skipOctanePolish: true }
  });
  for (let i = 0; i < 4; i++) {
    const t = 0.22 + i * 0.18;
    const [wx, wz] = along(t, 0, 0);
    const curb = meshAt(new THREE.BoxGeometry(26, 0.7, 44), paint, wx, 0.2, wz);
    curb.rotation.y = roadYaw;
    esplanade.add(curb);
    const pool = meshAt(new THREE.BoxGeometry(22, 0.4, 40), waterMat, wx, 0.55, wz);
    pool.rotation.y = roadYaw;
    esplanade.add(pool);
  }

  // Alias cams for named jumps
  if (CAMS) {
    CAMS.firstlight = CAMS.esp1;
    CAMS.fifthgate = CAMS.esp5;
    CAMS.tentharrival = CAMS.esp10;
    CAMS.stage2 = frame(...P(-50, 0), 28, 90, 8);
  }

  // Mid-avenue look / gather spot
  SPOT.esplanade_mid = along(0.5, 0, 0);
  SPOT_FACE.esplanade_mid = [ux, uz];
  SPOT.studio_gate = along(0.94, 0, 0);
  SPOT_FACE.studio_gate = [ux, uz];
  CAMS.esplanade_mid = frame(SPOT.esplanade_mid[0], SPOT.esplanade_mid[1], 110, 90, 24);
  CAMS.studio_gate = frame(SPOT.studio_gate[0], SPOT.studio_gate[1], 85, 160, 18);

  try {
    areaLabel(
      'Esplanade of Pyramids',
      'Ten temples from the city into the north-corner movie studio',
      (startX + endX) / 2 + sx * 40,
      48,
      (startZ + endZ) / 2 + sz * 40
    );
  } catch {
    /* ignore */
  }

  const lot = {
    group,
    esplanade,
    center: { x: CX, z: CZ },
    face: { x: axx, z: axz },
    avenue: { start: [startX, startZ], end: [endX, endZ], len: spanLen, ux, uz, sx, sz },
    pyramids,
    propCatalog,
    spots: {
      filmset: SPOT.filmset,
      backlot: SPOT.backlot,
      soundstage: SPOT.soundstage,
      wardrobe: SPOT.wardrobe,
      propyard: SPOT.propyard,
      esplanade: SPOT.esplanade,
      esplanade_mid: SPOT.esplanade_mid,
      studio_gate: SPOT.studio_gate
    }
  };
  window.__FILM_LOT = lot;
  return lot;
}
