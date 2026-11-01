import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {
  loadSomaAtlas,
  layoutSoma,
  buildIdIndex,
  createSomaPoints,
  loadFlybodyMesh
} from './brain-anatomy.js';

// Regional schematic. Positions are illustration coordinates, not EM coordinates.
// Visual language: black charcoal tissue, cyan = negative / sensory cool, UV = positive / drive.
// Morphology uses MaleCNS / FlyEM cached skeletons (CC-BY 4.0) when present — never invented.
// Live thought field: real MaleCNS soma cloud (nmf/brain-atlas) + Flybody mesh (nmf/flybody).

const UV = 0x9a6ad4;
const UV_SOFT = 0x6e4a9a;
const CYAN = 0x62c9ff;
const CHARCOAL = 0x2a2a32;
const STONE = 0x3a3a42;

// Live "thought" field — pattern from mingdianliu/flybrain-playground (soma Points +
// lastSpike fluorescence) and cobanov/fly-connectome-template (activity attribute),
// recolored to colony UV/cyan. Schematic seat positions, not EM soma XYZ.
const THOUGHT_VERT = /* glsl */ `
attribute float lastSpike;
attribute float polar;
uniform float now;
uniform float dpr;
uniform float pointScale;
varying float activity;
varying float pol;
void main() {
  activity = exp(-max(0.0, now - lastSpike) / 90.0);
  pol = polar;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = dpr * pointScale * (1.15 + activity * 6.5);
}`;
const THOUGHT_FRAG = /* glsl */ `
uniform float base;
varying float activity;
varying float pol;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float edge = 1.0 - smoothstep(0.2, 1.0, d);
  vec3 coldPos = vec3(0.28, 0.18, 0.42);
  vec3 coldNeg = vec3(0.12, 0.32, 0.42);
  vec3 hotPos = mix(vec3(0.60, 0.42, 0.92), vec3(1.0, 0.86, 0.55), clamp(activity * 1.4, 0.0, 1.0));
  vec3 hotNeg = mix(vec3(0.10, 0.72, 0.95), vec3(0.85, 0.98, 1.0), clamp(activity * 1.4, 0.0, 1.0));
  vec3 cold = mix(coldNeg, coldPos, step(0.0, pol));
  vec3 hot = mix(hotNeg, hotPos, step(0.0, pol));
  vec3 color = mix(cold, hot, clamp(activity * 3.2, 0.0, 1.0));
  float alpha = (base * 0.35 + activity * 0.95) * edge;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(color, alpha);
}`;

export function createBrainView(host) {
  let regionPred = null;
  let onRegionPick = null;
  let onRegionHover = null;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x050506, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D fly brain schematic');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.25, 8.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 16;

  scene.add(new THREE.HemisphereLight(0xb8b4c0, 0x08080c, 0.95));
  const key = new THREE.DirectionalLight(0xe8e4f0, 2.2);
  key.position.set(-2.5, 4, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(UV, 0.85);
  rim.position.set(3.5, -0.5, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(CYAN, 0.35);
  fill.position.set(0, -2, 4);
  scene.add(fill);

  const group = new THREE.Group();
  group.scale.setScalar(1.22);
  scene.add(group);

  const lobes = [];
  function lobe(name, x, y, z, sx, sy, sz, color, meta = {}) {
    const geometry = new THREE.SphereGeometry(1, 40, 28);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const ripple = 1 + 0.03 * Math.sin(px * 9 + py * 5) + 0.02 * Math.sin(py * 11 - pz * 7);
      p.setXYZ(i, px * ripple, py * ripple, pz * ripple);
    }
    geometry.computeVertexNormals();
    const tissue = new THREE.Color(color).lerp(new THREE.Color(CHARCOAL), 0.55);
    const material = new THREE.MeshPhysicalMaterial({
      color: tissue,
      roughness: 0.62,
      metalness: 0.02,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
      clearcoat: 0.12,
      clearcoatRoughness: 0.7,
      emissive: new THREE.Color(UV_SOFT),
      emissiveIntensity: 0.04
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.userData = { name, region: meta.region || name, baseEmissive: 0.04 };
    group.add(mesh);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 14, 10)),
      new THREE.LineBasicMaterial({ color: 0x5a5a66, transparent: true, opacity: 0.07, depthWrite: false })
    );
    wire.position.copy(mesh.position);
    wire.scale.copy(mesh.scale);
    group.add(wire);
    lobes.push({ name, mesh, meta });
  }

  // Layout mirrors the 2D SVG atlas: optic flanks, central core, MB dorsal, AL ventral, VNC cascade.
  lobe('Left optic lobe', -1.65, 0.5, 0, 0.85, 1.05, 0.7, 0x4a6a7a, { region: 'optic' });
  lobe('Right optic lobe', 1.65, 0.5, 0, 0.85, 1.05, 0.7, 0x4a6a7a, { region: 'optic' });
  lobe('Central brain', 0, 0.55, 0, 1.13, 1.05, 0.7, STONE, { region: 'central' });
  for (const side of [-1, 1]) {
    lobe('Mushroom body', side * 0.52, 1.04, 0.5, 0.37, 0.42, 0.3, 0x5a4870, { region: 'mushroom' });
    lobe('Antennal lobe', side * 0.43, -0.08, 0.53, 0.33, 0.3, 0.28, 0x3a5a52, { region: 'antennal' });
  }
  lobe('Central complex', 0, 0.46, 0.64, 0.4, 0.19, 0.18, 0x5a5440, { region: 'central-complex' });
  lobe('Gnathal ganglion', 0, -0.58, 0, 0.48, 0.33, 0.38, 0x3a504c, { region: 'gng' });
  lobe('Neck connective', 0, -1.1, 0, 0.13, 0.45, 0.13, 0x4a4a52, { region: 'neck' });
  for (let i = 0; i < 3; i++) {
    lobe('Ventral nerve cord', 0, -1.62 - i * 0.4, 0, 0.32 - i * 0.05, 0.27, 0.27, 0x4a423e, { region: 'vnc' });
  }

  // Floating HTML region tags (FlyWire / VFB pattern: name the neuropil). Clickable → seat filter.
  const tagHost = document.createElement('div');
  tagHost.id = 'brain-region-tags';
  tagHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  host.style.position = host.style.position || 'relative';
  host.append(tagHost);
  const tagEls = lobes
    .filter((l, i, arr) => arr.findIndex((o) => o.name === l.name) === i)
    .slice(0, 8)
    .map((l) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = l.meta.region || l.name;
      el.title = 'Filter seats · ' + l.name;
      el.style.cssText =
        'position:absolute;transform:translate(-50%,-50%);font:600 8px/1.1 Palatino Linotype,Palatino,Georgia,serif;' +
        'color:#c8c8d0;background:rgba(8,8,10,.82);padding:1px 4px;border:1px solid rgba(154,106,212,.35);' +
        'border-radius:2px;white-space:nowrap;opacity:0.9;pointer-events:auto;cursor:pointer;z-index:2;';
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRegionPick?.({
          region: l.meta.region,
          name: l.name,
          side: /left/i.test(l.name) ? 'L' : /right/i.test(l.name) ? 'R' : null
        });
      });
      tagHost.append(el);
      return { el, mesh: l.mesh, meta: l.meta, name: l.name };
    });

  const reconstruction = new THREE.Group();
  scene.add(reconstruction);
  const inspector = document.createElement('div');
  inspector.id = 'neuron-inspector';
  inspector.innerHTML =
    '<label>Reconstructed neuron <select aria-label="Reconstructed neuron"></select></label>' +
    '<p role="status"></p>' +
    '<a href="https://male-cns.janelia.org/download/" target="_blank" rel="noopener">MaleCNS / FlyEM · CC-BY 4.0</a>';
  host.parentElement.insertAdjacentElement('beforebegin', inspector);
  const neuronSelect = inspector.querySelector('select');
  const neuronStatus = inspector.querySelector('p');
  let catalog = null,
    selectedCell = null,
    loadID = 0,
    neuronLine = null,
    neuronMessage = 'Loading reconstruction catalog…';
  const cache = new Map();
  const catalogReady = fetch('nmf/neurons/index.json')
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((data) => {
      catalog = new Set(data.bodies);
      refreshCells();
    })
    .catch(() => {
      neuronMessage = 'Reconstruction catalog unavailable';
      neuronStatus.textContent = neuronMessage;
    });

  function refreshCells() {
    neuronSelect.replaceChildren();
    for (const cell of fly?.readout || []) {
      if (regionPred && !regionPred(cell)) continue;
      if (catalog?.has(cell.body)) {
        const option = document.createElement('option');
        option.value = cell.body;
        option.textContent = `${cell.body} · ${cell.type || cell.superclass || 'neuron'}`;
        neuronSelect.append(option);
      }
    }
    neuronSelect.disabled = !neuronSelect.options.length;
    if (!neuronSelect.options.length) {
      neuronMessage = regionPred
        ? 'No cached reconstructions in this region filter.'
        : 'No cached reconstruction for this fly; no anatomy is invented.';
      neuronStatus.textContent = neuronMessage;
    }
    loadNeuron();
  }

  async function loadNeuron() {
    const request = ++loadID;
    selectedCell = (fly?.readout || []).find((c) => String(c.body) === neuronSelect.value);
    if (neuronLine) {
      reconstruction.remove(neuronLine);
      neuronLine.geometry.dispose();
      neuronLine.material.dispose();
      neuronLine = null;
    }
    if (!selectedCell) {
      neuronMessage = 'No cached reconstruction for this fly; no anatomy is invented.';
      neuronStatus.textContent = neuronMessage;
      return;
    }
    neuronMessage = 'Loading body ' + selectedCell.body + '…';
    neuronStatus.textContent = neuronMessage;
    try {
      const bodyId = selectedCell.body;
      let data = cache.get(bodyId);
      if (!data) {
        const r = await fetch(`nmf/neurons/${bodyId}.json`);
        if (!r.ok) throw Error('unavailable');
        data = await r.json();
        cache.set(bodyId, data);
      }
      if (request !== loadID) return;
      const nodes = new Map(data.nodes.map((n) => [n[0], n]));
      const positions = [];
      for (const n of data.nodes) {
        const parent = nodes.get(n[4]);
        if (parent) positions.push(n[1], -n[2], -n[3], parent[1], -parent[2], -parent[3]);
      }
      if (!positions.length) throw Error('empty skeleton');
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeBoundingBox();
      const center = geo.boundingBox.getCenter(new THREE.Vector3());
      const size = geo.boundingBox.getSize(new THREE.Vector3());
      geo.translate(-center.x, -center.y, -center.z);
      const scale = 4.5 / Math.max(size.x, size.y, size.z);
      geo.scale(scale, scale, scale);
      neuronLine = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: UV, transparent: true, opacity: 0.92 })
      );
      reconstruction.add(neuronLine);
      neuronMessage = `Body ${bodyId} · ${positions.length / 6} reconstructed segments · ${selectedCell.nt || 'unknown transmitter'}. Native coordinates, centered and uniformly scaled; not live firing.`;
      neuronStatus.textContent = neuronMessage;
    } catch (error) {
      if (request === loadID) {
        neuronMessage = 'Reconstruction unavailable; saved readout remains available.';
        neuronStatus.textContent = neuronMessage;
      }
    }
  }
  neuronSelect.addEventListener('change', loadNeuron);

  const plot = document.createElement('canvas');
  plot.id = 'neural-readout';
  plot.width = 600;
  plot.height = 370;
  plot.setAttribute('aria-label', 'Saved model output by neuron and MIDI stimulus');
  host.parentElement.insertAdjacentElement('afterend', plot);

  let body = null,
    mode = 'live',
    signals = true,
    paused = true,
    fly = null,
    notes = [],
    elapsed = 0,
    manualNote = 0,
    lastFrame = '',
    hoverLobe = null,
    selectedRegion = null,
    selectedSide = null;
  const ray = new THREE.Raycaster();

  function lobeMeshes() {
    return lobes.map((l) => l.mesh);
  }

  function lobeMatchesSelection(mesh, meta) {
    if (!selectedRegion || meta.region !== selectedRegion) return false;
    if (!selectedSide) return true;
    if (selectedSide === 'L') return /left/i.test(mesh.userData.name);
    if (selectedSide === 'R') return /right/i.test(mesh.userData.name);
    return true;
  }

  function applyRegionGlow() {
    const filtering = !!selectedRegion;
    for (const { mesh, meta } of lobes) {
      const selected = lobeMatchesSelection(mesh, meta);
      const hovered = hoverLobe === mesh;
      mesh.material.emissiveIntensity = selected ? 0.55 : hovered ? 0.32 : mesh.userData.baseEmissive;
      mesh.material.opacity = selected ? 0.82 : filtering ? 0.22 : 0.52;
      mesh.material.emissive.setHex(selected || hovered ? UV : UV_SOFT);
    }
  }

  function clearHover() {
    if (hoverLobe) {
      hoverLobe = null;
      applyRegionGlow();
      onRegionHover?.(null);
    }
  }

  function pickLobe(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      ),
      camera
    );
    return ray.intersectObjects(lobeMeshes())[0] || null;
  }

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (mode === 'morphology') {
      host.title = neuronMessage;
      clearHover();
      return;
    }
    if (mode === 'live') {
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -(((event.clientY - rect.top) / rect.height) * 2 - 1)
        ),
        camera
      );
      const edgeHit = ray.intersectObjects(circuitGroup.children).find((h) => h.object.userData.cell);
      if (edgeHit) {
        const { cell, side, index } = edgeHit.object.userData;
        host.title = `Body ${cell.body} · ${cell.type || cell.superclass} · ${cell.nt} · ${side < 0 ? 'input' : 'output'} ${side < 0 ? body?.brainLive?.inputs[index] : body?.brainLive?.raw[index]}`;
        clearHover();
        return;
      }
    }
    const hit = pickLobe(event);
    const prev = hoverLobe;
    hoverLobe = hit?.object || null;
    if (hoverLobe !== prev) applyRegionGlow();
    if (hit) {
      host.title = hit.object.userData.name + ' · click to filter seats';
      onRegionHover?.({
        region: hit.object.userData.region,
        name: hit.object.userData.name
      });
    } else {
      host.title =
        mode === 'live'
          ? 'Verified edges only. UV = positive · cyan = negative · black = zero. Click a region to filter seats.'
          : 'Drag to rotate · scroll to zoom · click a region to filter seats';
      if (prev) onRegionHover?.(null);
    }
  });
  renderer.domElement.addEventListener('pointerleave', clearHover);

  renderer.domElement.addEventListener('click', (event) => {
    if (mode === 'morphology' || !onRegionPick) return;
    if (mode === 'live') {
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -(((event.clientY - rect.top) / rect.height) * 2 - 1)
        ),
        camera
      );
      if (ray.intersectObjects(circuitGroup.children).find((h) => h.object.userData.cell)) return;
    }
    const hit = pickLobe(event);
    if (!hit) return;
    onRegionPick({
      region: hit.object.userData.region,
      name: hit.object.userData.name,
      side: /left/i.test(hit.object.userData.name) ? 'L' : /right/i.test(hit.object.userData.name) ? 'R' : null
    });
  });

  plot.addEventListener('pointermove', (event) => {
    const r = plot.getBoundingClientRect(),
      x = ((event.clientX - r.left) * 600) / r.width,
      y = ((event.clientY - r.top) * 370) / r.height;
    const cols = fly?.activity?.length || 0;
    const visible = (fly?.readout || []).filter((c) => !regionPred || regionPred(c));
    const rows = visible.length;
    const col = Math.floor((x - 140) / (440 / Math.max(1, cols))),
      row = Math.floor((y - 48) / (290 / Math.max(1, rows)));
    const cell = visible[row];
    const src = cell ? fly.readout.indexOf(cell) : -1;
    const value = fly?.activity?.[col]?.[src];
    plot.title =
      col >= 0 && col < cols && cell && Number.isFinite(value)
        ? `Body ${cell.body} · stimulus ${col + 1} · pitch ${notes[col]?.pitch ?? '?'} · velocity ${notes[col]?.velocity ?? '?'} · output ${value} model units`
        : '';
  });

  function draw(rowIndex) {
    const ctx = plot.getContext('2d');
    ctx.clearRect(0, 0, 600, 370);
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, 600, 370);
    ctx.font = '15px Segoe UI';
    ctx.fillStyle = '#c8c8d0';
    ctx.fillText(
      regionPred ? 'Saved model output · region filter on · not a live recording' : 'Saved model output · not a live recording',
      12,
      22
    );
    const allRows = fly?.readout || [],
      values = fly?.activity || [];
    const rowIndexMap = [];
    const rows = [];
    allRows.forEach((cell, i) => {
      if (regionPred && !regionPred(cell)) return;
      rowIndexMap.push(i);
      rows.push(cell);
    });
    if (!allRows.length || !values.length) {
      ctx.fillStyle = '#7a7a82';
      ctx.fillText('No saved neural data for this fly.', 12, 64);
      return;
    }
    if (!rows.length) {
      ctx.fillStyle = '#7a7a82';
      ctx.fillText('No seats in the active region filter.', 12, 64);
      return;
    }
    const finite = values.flat().filter(Number.isFinite),
      peak = Math.max(0, ...finite.map(Math.abs));
    const w = 440 / values.length,
      h = 290 / rows.length;
    ctx.font = '12px Consolas';
    values.forEach((_, j) => {
      ctx.fillStyle = j === rowIndex ? '#e4d8f2' : '#7a7a82';
      ctx.fillText(`N${j + 1} v${notes[j]?.velocity ?? '?'}`, 143 + j * w, 43);
    });
    rows.forEach((cell, i) => {
      const src = rowIndexMap[i];
      ctx.fillStyle = '#a8a8b0';
      ctx.fillText(String(cell.body), 10, 48 + (i + 0.65) * h);
      values.forEach((v, j) => {
        const value = v[src],
          valid = Number.isFinite(value),
          strength = valid && peak ? Math.abs(value) / peak : 0;
        ctx.fillStyle = valid
          ? value < 0
            ? `rgba(98,201,255,${0.15 + strength * 0.85})`
            : `rgba(154,106,212,${0.15 + strength * 0.85})`
          : '#121214';
        ctx.fillRect(140 + j * w, 48 + i * h, w - 2, h - 2);
        ctx.strokeStyle = '#222226';
        ctx.strokeRect(140 + j * w, 48 + i * h, w - 2, h - 2);
        ctx.fillStyle = strength > 0.55 ? '#050506' : '#c8c8d0';
        ctx.fillText(valid ? (value === 0 ? '0' : value.toExponential(2)) : '—', 146 + j * w, 48 + (i + 0.65) * h);
      });
    });
    ctx.strokeStyle = UV;
    ctx.lineWidth = 2;
    ctx.strokeRect(140 + rowIndex * w, 48, w - 2, 290 - 2);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#7a7a82';
    ctx.fillText(`Scale: ±${peak.toExponential(3)} model units · zero stays black`, 12, 361);
  }

  const circuitGroup = new THREE.Group();
  scene.add(circuitGroup);
  const anatomyGroup = new THREE.Group();
  scene.add(anatomyGroup);
  let circuitLines = [];
  let thoughtPoints = null;
  let thoughtLast = null;
  let thoughtDriveIdx = [];
  let thoughtReadoutIdx = [];
  let thoughtNow = 0;
  let somaPoints = null;
  let somaIdIndex = null;
  let somaReady = false;
  let flybodyRoot = null;
  const credit = document.createElement('p');
  credit.id = 'brain-anatomy-credit';
  credit.style.cssText =
    'margin:.35rem 0 0;font:11px/1.35 Palatino Linotype,Palatino,Georgia,serif;color:#8a8a92;';
  credit.innerHTML =
    'Soma atlas: MaleCNS v1.0 CC-BY · ' +
    'Built with <a href="https://github.com/cobanov/fly-connectome-template" target="_blank" rel="noopener">fly-connectome-template</a> by ' +
    '<a href="https://github.com/cobanov" target="_blank" rel="noopener">Mert Cobanov</a> (Flybody mesh packaging) · ' +
    'thought glow pattern: <a href="https://github.com/mingdianliu/flybrain-playground" target="_blank" rel="noopener">flybrain-playground</a>';
  host.parentElement.insertAdjacentElement('afterend', credit);

  // Real measured somata + anatomical body (async; schematic lobes stay as fallback).
  loadSomaAtlas()
    .then((atlas) => {
      const layout = layoutSoma(atlas.positions, atlas.groups, { maxGroup: 2, targetSpan: 5.4 });
      somaIdIndex = buildIdIndex(atlas.ids, layout.srcIndex);
      somaPoints = createSomaPoints(layout, THOUGHT_VERT, THOUGHT_FRAG);
      somaPoints.visible = false;
      anatomyGroup.add(somaPoints);
      somaReady = true;
      credit.title = `${atlas.manifest.brainCount.toLocaleString()} brain somata loaded`;
    })
    .catch((err) => {
      console.warn('soma atlas unavailable', err);
      credit.textContent += ' · soma atlas not loaded';
    });
  loadFlybodyMesh()
    .then((root) => {
      flybodyRoot = root;
      flybodyRoot.visible = false;
      anatomyGroup.add(root);
    })
    .catch((err) => console.warn('flybody mesh unavailable', err));

  const telemetry = document.createElement('p');
  telemetry.id = 'live-telemetry';
  host.parentElement.insertAdjacentElement('afterend', telemetry);
  const exportButton = document.createElement('button');
  exportButton.textContent = 'Download live brain data';
  telemetry.after(exportButton);
  const liveDetails = document.createElement('details');
  liveDetails.id = 'live-io';
  liveDetails.innerHTML = '<summary>Live inputs, outputs & data export</summary>';
  telemetry.before(liveDetails);
  liveDetails.append(telemetry, exportButton);
  exportButton.onclick = () => {
    const data = {
      channels: [
        'target distance',
        'eastward target',
        'westward target',
        'southward target',
        'northward target',
        'height',
        'travelling',
        'working',
        'resting',
        'daylight',
        'rain',
        'job progress'
      ],
      role: body?.g.userData.role,
      source: body?.g.userData.brainRole,
      model: 'Reduced connectome; schematic display; scene sensor mapping',
      drive: fly?.drive,
      readout: fly?.readout,
      circuit: fly?.circuit,
      live: body?.brainLive
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fly-live-brain.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  function applyCircuitRegionFilter() {
    for (const obj of circuitGroup.children) {
      if (!obj.userData?.cell) continue;
      const on = !regionPred || regionPred(obj.userData.cell);
      obj.visible = on;
      if (obj.material) obj.material.opacity = on ? 1 : 0.12;
    }
    for (const edge of circuitLines) {
      const a = fly?.drive?.[edge.i],
        b = fly?.readout?.[edge.j];
      edge.regionOn = !regionPred || (a && regionPred(a)) || (b && regionPred(b));
    }
  }

  function buildCircuit() {
    for (const obj of [...circuitGroup.children]) {
      obj.geometry?.dispose();
      obj.material?.dispose();
      circuitGroup.remove(obj);
    }
    circuitLines = [];
    thoughtPoints = null;
    thoughtLast = null;
    thoughtDriveIdx = [];
    thoughtReadoutIdx = [];
    if (!fly?.circuit) return;
    const point = (i, side, n) => new THREE.Vector3(side * 1.45, 1.8 - (i * 3.6) / Math.max(1, n - 1), 0.9);
    for (const [cells, side] of [
      [fly.drive, -1],
      [fly.readout, 1]
    ]) {
      for (const [i, cell] of cells.entries()) {
        const node = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 10, 8),
          new THREE.MeshBasicMaterial({
            color: side < 0 ? 0xffd788 : UV,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
          })
        );
        node.position.copy(point(i, side, cells.length));
        node.userData = { cell, side, index: i };
        circuitGroup.add(node);
      }
    }
    // Thought cloud: jittered sparks around each seat + along arcs (playground-style).
    const sparkPos = [];
    const sparkPol = [];
    const driveBuckets = Array.from({ length: fly.drive.length }, () => []);
    const readoutBuckets = Array.from({ length: fly.readout.length }, () => []);
    const edgeBuckets = [];
    const rng = (seed) => {
      let s = (seed * 1103515245 + 12345) >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s >>> 0) / 0xffffffff;
      };
    };
    const placeCluster = (origin, polar, bucket, seed, n = 7) => {
      const rand = rng(seed);
      for (let k = 0; k < n; k++) {
        const idx = sparkPos.length / 3;
        const ox = (rand() - 0.5) * 0.28;
        const oy = (rand() - 0.5) * 0.28;
        const oz = (rand() - 0.5) * 0.22;
        sparkPos.push(origin.x + ox, origin.y + oy, origin.z + oz);
        sparkPol.push(polar);
        bucket.push(idx);
      }
    };
    fly.drive.forEach((cell, i) => {
      placeCluster(point(i, -1, fly.drive.length), 1, driveBuckets[i], 1000 + i * 17, 8);
    });
    fly.readout.forEach((cell, i) => {
      placeCluster(point(i, 1, fly.readout.length), 1, readoutBuckets[i], 5000 + i * 19, 8);
    });
    for (const [i, j, count, weight] of fly.circuit.edges) {
      const start = point(i, -1, fly.drive.length),
        end = point(j, 1, fly.readout.length),
        points = [];
      const edgeBucket = [];
      const rand = rng(7000 + i * 31 + j * 17);
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const p = start
          .clone()
          .lerp(end, t)
          .add(new THREE.Vector3(0, Math.sin(t * Math.PI) * 0.15, Math.sin(t * Math.PI) * 0.3));
        points.push(p);
        if (k > 0 && k < 12 && k % 2 === 0) {
          const idx = sparkPos.length / 3;
          sparkPos.push(p.x + (rand() - 0.5) * 0.08, p.y + (rand() - 0.5) * 0.08, p.z + (rand() - 0.5) * 0.08);
          sparkPol.push(weight < 0 ? -1 : 1);
          edgeBucket.push(idx);
        }
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: weight < 0 ? CYAN : UV,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      circuitGroup.add(line);
      circuitLines.push({ line, points, weight, i, j, count, regionOn: true, sparkIdx: edgeBucket });
      edgeBuckets.push(edgeBucket);
    }
    // Soft volumetric fill inside lobes so the field reads as a brain, not two rails.
    for (const lobe of lobes) {
      const m = lobe.mesh;
      const polar = /optic|antennal/i.test(lobe.meta.region) ? -1 : 1;
      const rand = rng(lobe.name.length * 97 + Math.round(m.position.x * 100));
      for (let k = 0; k < 28; k++) {
        const u = rand() * 2 - 1,
          v = rand() * 2 - 1,
          w = rand() * 2 - 1;
        if (u * u + v * v + w * w > 1) continue;
        sparkPos.push(
          m.position.x + u * m.scale.x * 0.72,
          m.position.y + v * m.scale.y * 0.72,
          m.position.z + w * m.scale.z * 0.72
        );
        sparkPol.push(polar);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
    geo.setAttribute('polar', new THREE.Float32BufferAttribute(sparkPol, 1));
    thoughtLast = new Float32Array(sparkPos.length / 3);
    thoughtLast.fill(-1e9);
    geo.setAttribute('lastSpike', new THREE.BufferAttribute(thoughtLast, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        now: { value: 0 },
        dpr: { value: Math.min(devicePixelRatio, 2) },
        pointScale: { value: 2.4 },
        base: { value: 0.14 }
      },
      vertexShader: THOUGHT_VERT,
      fragmentShader: THOUGHT_FRAG
    });
    thoughtPoints = new THREE.Points(geo, mat);
    thoughtPoints.frustumCulled = false;
    circuitGroup.add(thoughtPoints);
    thoughtDriveIdx = driveBuckets;
    thoughtReadoutIdx = readoutBuckets;
    applyCircuitRegionFilter();
  }

  let lastTelemetry = 0,
    lastRender = 0;
  const tmp = new THREE.Vector3();
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);

  function projectTags() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h || mode === 'morphology' || mode === 'live') {
      for (const t of tagEls) t.el.style.display = 'none';
      return;
    }
    for (const t of tagEls) {
      t.mesh.getWorldPosition(tmp);
      tmp.project(camera);
      if (tmp.z > 1) {
        t.el.style.display = 'none';
        continue;
      }
      t.el.style.display = 'block';
      t.el.style.left = ((tmp.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
      t.el.style.top = ((-tmp.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    }
  }

  return {
    setSelection(_body, nextFly, nextNotes) {
      body = _body;
      fly = nextFly;
      buildCircuit();
      notes = nextNotes;
      elapsed = 0;
      manualNote = 0;
      lastFrame = '';
      refreshCells();
    },
    setMode(value) {
      mode = ['atlas', 'morphology', 'live'].includes(value) ? value : 'readout';
      lastFrame = '';
    },
    setSignals(value) {
      signals = value;
    },
    setPaused(value) {
      paused = value;
    },
    setNote(value) {
      manualNote = Math.max(0, Math.min(value, (fly?.activity?.length || 1) - 1));
      elapsed = manualNote;
    },
    onRegionPick(cb) {
      onRegionPick = typeof cb === 'function' ? cb : null;
    },
    onRegionHover(cb) {
      onRegionHover = typeof cb === 'function' ? cb : null;
    },
    setRegionHighlight(spec) {
      if (!spec) {
        selectedRegion = null;
        selectedSide = null;
      } else if (typeof spec === 'string') {
        selectedRegion = spec;
        selectedSide = null;
      } else {
        selectedRegion = spec.region || null;
        selectedSide = spec.side || null;
      }
      applyRegionGlow();
      for (const t of tagEls) {
        const on = selectedRegion && t.meta.region === selectedRegion;
        t.el.style.borderColor = on ? 'rgba(154,106,212,.9)' : 'rgba(154,106,212,.35)';
        t.el.style.color = on ? '#e4d8f2' : '#c8c8d0';
        t.el.style.opacity = selectedRegion && !on ? '0.35' : '0.9';
      }
    },
    setRegionFilter(pred) {
      regionPred = typeof pred === 'function' ? pred : null;
      lastFrame = '';
      applyCircuitRegionFilter();
      refreshCells();
    },
    update(dt) {
      if (!host.offsetParent || !host.getClientRects().length || host.closest('details:not([open])')) return;
      const time = performance.now();
      if (time - lastRender < 50) return;
      lastRender = time;
      if (!paused) elapsed += dt;
      const rowIndex = paused ? manualNote : Math.floor(elapsed) % Math.max(1, fly?.activity?.length || 1);
      manualNote = rowIndex;
      const keyFrame = mode + ':' + rowIndex;
      if (keyFrame !== lastFrame) {
        draw(rowIndex);
        lastFrame = keyFrame;
      }
      plot.hidden = mode === 'atlas' || !signals;
      group.visible = mode !== 'morphology';
      reconstruction.visible = mode === 'morphology';
      inspector.hidden = mode !== 'morphology';
      if (neuronLine && fly) {
        const cellIndex = fly.readout.indexOf(selectedCell),
          value = fly.activity?.[rowIndex]?.[cellIndex];
        neuronLine.material.color.setHex(
          !Number.isFinite(value) || value === 0 ? 0x5a5a66 : value < 0 ? CYAN : UV
        );
      }
      circuitGroup.visible = mode === 'live';
      liveDetails.hidden = telemetry.hidden = exportButton.hidden = mode !== 'live';
      thoughtNow += dt * 1000;
      const showAnatomy = (mode === 'live' || mode === 'atlas' || mode === 'readout') && somaReady;
      if (somaPoints) {
        somaPoints.visible = showAnatomy && mode !== 'morphology';
        if (somaPoints.material?.uniforms) somaPoints.material.uniforms.now.value = thoughtNow;
      }
      if (flybodyRoot) flybodyRoot.visible = (mode === 'live' || mode === 'atlas') && !!flybodyRoot;
      // Dim schematic lobes when real somata are up so the cloud reads first.
      for (const l of lobes) {
        if (l.mesh.material) {
          l.mesh.material.opacity = showAnatomy && mode !== 'morphology' ? 0.18 : 0.52;
        }
      }
      // Readout/atlas: flash measured somata from saved activity for the scrubbed note.
      if (somaPoints && somaIdIndex && fly?.readout && (mode === 'atlas' || mode === 'readout')) {
        const row = fly.activity?.[rowIndex];
        if (row) {
          fly.readout.forEach((cell, i) => {
            const v = row[i];
            if (!cell?.body || !Number.isFinite(v) || Math.abs(v) < 1e-6) return;
            const idx = somaIdIndex.get(Number(cell.body));
            if (idx != null) somaPoints.userData.last[idx] = thoughtNow;
          });
          somaPoints.geometry.attributes.lastSpike.needsUpdate = true;
        }
      }
      if (mode === 'live') {
        group.visible = true;
        reconstruction.visible = false;
        plot.hidden = true;
        inspector.hidden = true;
        const live = body?.brainLive;
        const visibleEdges = circuitLines.filter((e) => e.regionOn !== false);
        if (thoughtPoints?.material?.uniforms) {
          thoughtPoints.material.uniforms.now.value = thoughtNow;
          thoughtPoints.visible = !!signals && !somaReady;
        }
        const fire = (bucket, strength) => {
          if (!thoughtLast || !bucket || strength < 0.04) return;
          for (const idx of bucket) thoughtLast[idx] = thoughtNow;
        };
        const fireBody = (bodyId, strength) => {
          if (!somaPoints || !somaIdIndex || strength < 0.04) return;
          const idx = somaIdIndex.get(Number(bodyId));
          if (idx == null) return;
          somaPoints.userData.last[idx] = thoughtNow;
        };
        circuitLines.forEach((edge, i) => {
          const value = live?.signals?.[i] || 0,
            strength = Math.min(1, Math.abs(value) / Math.max(1, Math.abs(edge.weight)));
          const show = signals && strength > 1e-6 && edge.regionOn !== false;
          edge.line.visible = show;
          edge.line.material.opacity = show ? 0.05 + strength * 0.55 : 0;
          if (show) {
            fire(thoughtDriveIdx[edge.i], strength);
            fire(thoughtReadoutIdx[edge.j], strength);
            fire(edge.sparkIdx, strength);
            const driveCell = fly?.drive?.[edge.i];
            const readCell = fly?.readout?.[edge.j];
            if (driveCell?.body) fireBody(driveCell.body, strength);
            if (readCell?.body) fireBody(readCell.body, strength);
          }
        });
        // Also light readout seats from output amplitudes.
        if (fly?.readout && live?.outputs) {
          fly.readout.forEach((cell, i) => {
            const strength = Math.min(1, Math.abs(live.outputs[i] || 0));
            if (cell?.body) fireBody(cell.body, strength);
          });
        }
        if (thoughtPoints?.geometry?.attributes?.lastSpike) {
          thoughtPoints.geometry.attributes.lastSpike.needsUpdate = true;
        }
        if (somaPoints?.geometry?.attributes?.lastSpike) {
          somaPoints.geometry.attributes.lastSpike.needsUpdate = true;
        }
        const energy = Math.min(1, Math.abs(live?.energy || 0));
        for (const l of lobes) {
          if (l.mesh.material?.emissiveIntensity != null) {
            const base = l.mesh.userData.baseEmissive || 0.04;
            l.mesh.material.emissiveIntensity = base + energy * 0.35;
          }
        }
        // Sovereign light/food probes: optic lobes answer light; central answers food.
        const probes = live?.probes || body?.g?.userData?.probes;
        if (probes && somaPoints?.userData?.last) {
          const last = somaPoints.userData.last;
          const n = last.length;
          const nowSpike = thoughtNow;
          if (probes.light > 0.45) {
            for (let i = 0; i < Math.min(40, n); i += 3) last[i] = nowSpike;
          }
          if (probes.food > 0.45) {
            for (let i = 1; i < Math.min(40, n); i += 3) last[i] = nowSpike;
          }
        }
        if (probes) {
          for (const l of lobes) {
            const reg = l.mesh.userData.region;
            const boost = reg === 'optic' ? (probes.light || 0) : reg === 'central' ? (probes.food || 0) : 0;
            if (boost && l.mesh.material?.emissiveIntensity != null) {
              l.mesh.material.emissiveIntensity += boost * 0.25;
            }
          }
        }
        if (time - lastTelemetry > 200) {
          lastTelemetry = time;
          const filterNote = regionPred ? ` · region filter ${visibleEdges.length}/${circuitLines.length} edges` : '';
          const anatomyNote = somaReady
            ? ' · MaleCNS soma cloud (measured) + Flybody mesh'
            : ' · schematic thought sparks';
          telemetry.textContent = live
            ? (() => {
                const crown = body.g.userData.sovereign || body.g.userData.role === 'You';
                const who = body.g.userData.displayName || body.g.userData.name;
                const titles = crown ? ' · God · Ruler · King' : '';
                const oy = live.opticYaw || body.g.userData.opticYaw;
                const opticBit = oy ? ` · optic yaw ${Number(oy.yawLast).toFixed(4)} (sidecar ${oy.stimulus||'—'})` : '';
                const pr = live.probes || body.g.userData.probes;
                const probeBit = pr ? ` · probes light ${Number(pr.light).toFixed(2)} food ${Number(pr.food).toFixed(2)}` : '';
                const restBit = live.restMotor ? ' · REST motor hint' : '';
                return `${who}${titles} · ${window.FLIES_READ_ONLY ? 'Saved tick' : 'Tick'} ${live.tick} · ${circuitLines.length} verified edges${filterNote}${anatomyNote}${opticBit}${probeBit}${restBit} · ${live.speed.toFixed(2)} m/s. UV = +, cyan = -. Scene sensors are assigned channels, not measured biological spikes.`;
              })()
            : 'Waiting for live sensor data.';
        }
      }
      controls.update();
      projectTags();
      renderer.render(scene, camera);
      return {
        neuronMessage,
        rowIndex,
        hasReadout: !!fly?.activity?.length,
        notes,
        count: fly?.activity?.length || 0
      };
    }
  };
}
