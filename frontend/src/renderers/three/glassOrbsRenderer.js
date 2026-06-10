import * as THREE from "three";
import {
  createBloomComposer,
  createBasicComposer,
  createChromaticComposer,
  disposeComposer,
} from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";
import {
  MARCH_STEPS,
  GLSL_CALC_NORMAL,
  RAYMARCH_VERTEX,
  createRaymarchUniforms,
  createFullscreenQuadScene,
  syncRaymarchResolution,
  updateSpectrumUniforms,
  hexToVec3Color,
} from "./raymarchHelpers.js";
import { prependNoiseGlsl } from "./noiseGlsl.js";

const MAX_ORBS = 5;
const BASE_RADIUS = 0.28;

const FRAGMENT = prependNoiseGlsl(/* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_peak;
uniform vec2 u_resolution;
uniform int u_orbCount;
uniform vec3 u_orbCenters[${MAX_ORBS}];
uniform float u_orbRadii[${MAX_ORBS}];
uniform vec3 u_orbColors[${MAX_ORBS}];
uniform float u_transmission;
uniform float u_refraction;
uniform float u_stackScale;

varying vec2 vUv;

float sdSphere(vec3 p, vec3 c, float r) {
  return length(p - c) - r;
}

float mapScene(vec3 p) {
  float d = 100.0;
  for (int i = 0; i < ${MAX_ORBS}; i++) {
    if (i >= u_orbCount) break;
    d = min(d, sdSphere(p, u_orbCenters[i], u_orbRadii[i]));
  }
  return d;
}

${GLSL_CALC_NORMAL}

vec3 orbColorAt(int idx) {
  if (idx == 0) return u_orbColors[0];
  if (idx == 1) return u_orbColors[1];
  if (idx == 2) return u_orbColors[2];
  if (idx == 3) return u_orbColors[3];
  return u_orbColors[4];
}

int nearestOrbIndex(vec3 pt) {
  int best = 0;
  float bestSd = 1e6;
  for (int i = 0; i < ${MAX_ORBS}; i++) {
    if (i >= u_orbCount) break;
    float sd = sdSphere(pt, u_orbCenters[i], u_orbRadii[i]);
    if (sd < bestSd) {
      bestSd = sd;
      best = i;
    }
  }
  return best;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.0, 2.85);
  vec3 rd = normalize(vec3(uv, -1.65));

  float t = 0.0;
  float hit = -1.0;
  vec3 p;

  for (int i = 0; i < ${MARCH_STEPS}; i++) {
    p = ro + rd * t;
    float d = mapScene(p);
    if (d < 0.001) {
      hit = t;
      break;
    }
    t += max(d * 0.88, 0.002);
    if (t > 9.0) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);

  int hitOrb = nearestOrbIndex(p);
  vec3 baseCol = orbColorAt(hitOrb);

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.4);
  vec3 lightDir = normalize(vec3(0.28, 0.86, 0.46));
  vec3 refl = reflect(rd, n);
  float spec = pow(max(dot(refl, lightDir), 0.0), 48.0);

  // 假折射：仅在当前球内部做亮度/色相微扰，不切换到另一颗球的颜色
  float noiseVal = snoise(p * 2.8 + vec3(u_time * 0.12, u_mid * 0.35, 0.0));
  vec3 refractCol = baseCol * (0.9 + 0.14 * noiseVal);
  refractCol += baseCol * noiseVal * u_refraction * 0.22;
  vec3 col = mix(baseCol, refractCol, clamp(u_refraction * 0.65 + fresnel * 0.12, 0.0, 0.82));

  // 边缘 fresnel 仅在叠放接触区轻混相邻球色，避免整球双色硬切
  int rimOrb = nearestOrbIndex(p + n * 0.05);
  if (rimOrb != hitOrb && fresnel > 0.72) {
    vec3 rimCol = orbColorAt(rimOrb);
    col = mix(col, rimCol, (fresnel - 0.72) * 0.28);
  }

  col += vec3(1.0) * spec * (0.55 + u_treble * 0.5 + u_peak * 0.38);
  col *= 0.56 + 0.44 * dot(n, lightDir) + u_bass * 0.42 + u_peak * 0.28;

  float edgeSoft = smoothstep(0.012, 0.0, mapScene(p));
  float alpha = mix(0.94, 0.34, u_transmission);
  alpha = clamp(alpha * (0.68 + fresnel * 0.32 + spec * 0.12), 0.0, 1.0) * edgeSoft;

  gl_FragColor = vec4(col, alpha);
}
`);

/** @param {number} value @param {number} min @param {number} max @param {number} fallback */
function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {number} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {number} count
 * @param {number} spacing
 * @param {number} scaleMul
 * @param {Float32Array} centers
 * @param {Float32Array} radii
 */
function updateOrbStackLayout(count, spacing, scaleMul, centers, radii) {
  const totalSpan = Math.max(0, count - 1) * spacing;
  const startY = -totalSpan * 0.5;

  for (let i = 0; i < MAX_ORBS; i++) {
    if (i < count) {
      const phase = i * 1.35;
      centers[i * 3] = Math.sin(phase) * spacing * 0.18;
      centers[i * 3 + 1] = startY + i * spacing;
      centers[i * 3 + 2] = Math.cos(phase * 0.85) * spacing * 0.12;
      const sizePulse = 0.94 + (i % 2) * 0.08;
      radii[i] = BASE_RADIUS * scaleMul * sizePulse;
    } else {
      centers[i * 3] = 0;
      centers[i * 3 + 1] = -10;
      centers[i * 3 + 2] = 0;
      radii[i] = 0.001;
    }
  }
}

/** @param {string} hex @param {string} fallback */
function safeHex(hex, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createGlassOrbsRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeGlassOrbs;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const orbCenters = new Array(MAX_ORBS).fill(0).map(() => new THREE.Vector3());
  const orbRadii = new Float32Array(MAX_ORBS);
  const cpuCenters = new Float32Array(MAX_ORBS * 3);
  const orbColors = new Array(MAX_ORBS).fill(0).map((_, i) =>
    hexToVec3Color(cfg[`color${i + 1}`], cfg[`color${i + 1}`]),
  );

  const uniforms = createRaymarchUniforms({
    u_orbCount: { value: cfg.orbCount },
    u_orbCenters: { value: orbCenters },
    u_orbRadii: { value: orbRadii },
    u_orbColors: { value: orbColors },
    u_transmission: { value: cfg.transmission / 100 },
    u_refraction: { value: cfg.refractionStrength / 100 * 0.08 },
    u_stackScale: { value: 1 },
    u_peak: { value: 0 },
  });

  const { dispose: disposeQuad } = createFullscreenQuadScene(scene, {
    vertexShader: RAYMARCH_VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
  });

  let composer = null;
  /** @type {import('postprocessing').BloomEffect | null} */
  let bloomEffect = null;
  let chromaticEnabled = cfg.chromaticEnabled;
  let chromaticOffset = cfg.chromaticOffset;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let peakSmoothed = 0;
  const spectrumState = { bass: 0, mid: 0, treble: 0 };

  function rebuildComposer() {
    const key = `${chromaticEnabled}:${chromaticOffset.toFixed(4)}:${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    bloomEffect = null;
    lastComposerKey = key;

    if (chromaticEnabled) {
      const result = createChromaticComposer(renderer, scene, camera, {
        offset: chromaticOffset,
        bloomEnabled,
        bloomStrength,
        bloomThreshold: 0.08,
      });
      composer = result.composer;
      bloomEffect = result.bloomEffect;
    } else if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.08,
        luminanceSmoothing: 0.35,
        mipmapBlur: true,
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    syncRaymarchResolution(renderer, uniforms, composer);
  }

  rebuildComposer();

  updateOrbStackLayout(cfg.orbCount, cfg.stackSpacing, 1, cpuCenters, orbRadii);
  for (let i = 0; i < MAX_ORBS; i++) {
    orbCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const orbCount = clampInt(Number(style.orbCount), 2, 5, cfg.orbCount);
    const stackSpacing = clampFloat(Number(style.stackSpacing), 0.2, 0.6, cfg.stackSpacing);
    const transmission = clampInt(Number(style.transmission), 0, 100, cfg.transmission);
    const refractionStrength = clampInt(Number(style.refractionStrength), 0, 100, cfg.refractionStrength);
    const breatheWithPeak =
      style.breatheWithPeak !== undefined ? Boolean(style.breatheWithPeak) : cfg.breatheWithPeak;
    const nextChromaticEnabled =
      style.chromaticEnabled !== undefined ? Boolean(style.chromaticEnabled) : cfg.chromaticEnabled;
    const nextChromaticOffset = clampFloat(Number(style.chromaticOffset), 0, 0.02, cfg.chromaticOffset);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : cfg.bloomEnabled;
    const nextBloomStrength = Number(style.bloomStrength) || cfg.bloomStrength;

    if (
      nextChromaticEnabled !== chromaticEnabled ||
      Math.abs(nextChromaticOffset - chromaticOffset) > 0.0001 ||
      nextBloomEnabled !== bloomEnabled ||
      Math.abs(nextBloomStrength - bloomStrength) > 0.01
    ) {
      chromaticEnabled = nextChromaticEnabled;
      chromaticOffset = nextChromaticOffset;
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncRaymarchResolution(renderer, uniforms, composer);

    const dt = clock.getDelta();
    elapsed += dt > 0 ? dt : 1 / 60;
    uniforms.u_time.value = elapsed;
    updateSpectrumUniforms(uniforms, spectrum, spectrumState, {
      bass: 0.32,
      mid: 0.28,
      treble: 0.24,
    });

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;
    peakSmoothed += (peak - peakSmoothed) * 0.28;
    uniforms.u_peak.value = peakSmoothed;

    const bass = spectrumState.bass ?? 0;
    const breathe = breatheWithPeak ? 1 + peakSmoothed * 0.38 + bass * 0.14 : 1 + bass * 0.06;

    if (bloomEffect) {
      bloomEffect.intensity = bloomStrength * (1 + peakSmoothed * 0.5 + bass * 0.12);
    }

    updateOrbStackLayout(orbCount, stackSpacing, breathe, cpuCenters, orbRadii);
    for (let i = 0; i < MAX_ORBS; i++) {
      orbCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
    }

    uniforms.u_orbCount.value = orbCount;
    uniforms.u_transmission.value = transmission / 100;
    uniforms.u_refraction.value = (refractionStrength / 100) * 0.08;
    uniforms.u_stackScale.value = breathe;

    for (let i = 0; i < MAX_ORBS; i++) {
      const key = `color${i + 1}`;
      const fallback = cfg[key];
      const hex = safeHex(style[key], fallback);
      orbColors[i].copy(hexToVec3Color(hex, fallback));
    }

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 玻璃球栈后处理渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    disposeQuad();
    clock.stop();
  }

  return { render, dispose };
}
