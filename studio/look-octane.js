/**
 * Cinematic / Octane-leaning look helpers for the colony renderer.
 * Does not invent geometry — grades light, post, and material response.
 */
import * as THREE from 'three';

/** Richer grade than flat sat/contrast — warm highs, cool lows, soft grain, filmic curve. */
export const OCTANE_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.42 },
    sat: { value: 1.18 },
    contrast: { value: 1.08 },
    warmth: { value: 0.08 },
    lift: { value: 0.03 },
    grain: { value: 0.035 },
    time: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float sat;
    uniform float contrast;
    uniform float warmth;
    uniform float lift;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    vec3 filmic(vec3 x){
      // Mild ACES-ish curve so midtones stay rich without crushing blacks.
      x = max(x, 0.0);
      float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
      return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      // Warm highlights / cool shadows (Octane-ish split toning).
      vec3 warm = col * vec3(1.0 + warmth, 1.0 + warmth * 0.45, 1.0 - warmth * 0.55);
      vec3 cool = col * vec3(1.0 - warmth * 0.35, 1.0, 1.0 + warmth * 0.55);
      col = mix(cool, warm, smoothstep(0.18, 0.72, l));
      col = (col - 0.5) * contrast + 0.5 + lift;
      col = filmic(col);
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * vignette;
      col *= clamp(v, 0.0, 1.0);
      float g = (hash(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * grain;
      col += g;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `
};

export const OCTANE_GFX_DEFAULTS = {
  bloom: 0, // OFF — clean video / social open (Graphics panel can re-enable)
  bloomThresh: 0.92,
  ao: false, // OFF by default — GTAO was a major FPS killer; Graphics panel can re-enable
  sat: 1.18,
  contrast: 1.08,
  vignette: 0.42,
  // DoF OFF by default — BokehPass softens the entire frame and reads as "everything blurry".
  // Opt in from Graphics → Depth of field when you want a cinematic still.
  dof: false,
  dofBlur: 0.0045,
  warmth: 0.08,
  lift: 0.03,
  grain: 0.035
};

/** Soften the "toy block" read: richer env response, less chalk-flat roughness. */
export function polishSceneMaterials(root, { envBoost = 1.12 } = {}) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    // Film lot / esplanade own their look — do not chalk them white via env boost.
    let p = obj.parent;
    while (p) {
      if (p.name === 'film-lot' || p.name === 'esplanade-of-pyramids') return;
      p = p.parent;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m || m.userData?.octanePolished || m.userData?.skipOctanePolish) continue;
      if (m.flatShading) {
        m.flatShading = false;
      }
      // Skip emissive practicals — boosting them washes the frame through bloom.
      const ei = m.emissiveIntensity || 0;
      if (ei > 0.25) {
        m.userData.octanePolished = true;
        continue;
      }
      if ('envMapIntensity' in m) {
        const base = Number.isFinite(m.envMapIntensity) ? m.envMapIntensity : 1;
        // Cap harder on light stone so HDR + ACES does not read as "all white".
        const lum = m.color ? 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b : 0.5;
        const boost = lum > 0.55 ? Math.min(envBoost, 1.05) : envBoost;
        m.envMapIntensity = Math.min(1.45, Math.max(0.35, base * boost));
      }
      if ('roughness' in m && Number.isFinite(m.roughness)) {
        // Pull plastic-shiny and chalk-matte toward photographic stone/paint.
        if (m.roughness < 0.25) m.roughness = 0.35;
        if (m.roughness > 0.98) m.roughness = 0.88;
      }
      if ('metalness' in m && Number.isFinite(m.metalness) && m.metalness > 0.85) {
        m.metalness = 0.72;
      }
      if ('clearcoat' in m && m.clearcoat === 0 && m.transparent && (m.opacity ?? 1) < 0.95) {
        // Glass-ish surfaces get a touch of coat.
        m.clearcoat = 0.35;
        if ('clearcoatRoughness' in m) m.clearcoatRoughness = 0.12;
      }
      m.userData.octanePolished = true;
      m.needsUpdate = true;
    }
  });
}

export function applyOctaneRenderer(renderer) {
  if (!renderer) return;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Keep exposure near 1 — forcing ≥1.05 chalked pale stone under HDR + bloom.
  if (!Number.isFinite(renderer.toneMappingExposure) || renderer.toneMappingExposure <= 0) {
    renderer.toneMappingExposure = 0.95;
  } else {
    renderer.toneMappingExposure = Math.min(1.05, Math.max(0.85, renderer.toneMappingExposure));
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
