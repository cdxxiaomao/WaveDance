import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";
import {
  MARCH_STEPS,
  GLSL_CALC_NORMAL,
  GLSL_GRADIENT_MIX,
  GLSL_SMIN,
  RAYMARCH_VERTEX,
  createRaymarchUniforms,
  createFullscreenQuadScene,
  mergeStrengthToK,
  syncRaymarchResolution,
  updateSpectrumUniforms,
  hexToVec3Color,
} from "./raymarchHelpers.js";

const MAX_PEARLS = 10;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_peak;
uniform vec2 u_resolution;
uniform int u_pearlCount;
uniform vec3 u_pearlCenters[${MAX_PEARLS}];
uniform float u_pearlRadii[${MAX_PEARLS}];
uniform float u_pearlT[${MAX_PEARLS}];
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform float u_mergeK;

varying vec2 vUv;

${GLSL_SMIN}

${GLSL_GRADIENT_MIX}

float mapScene(vec3 p) {
  float d = 100.0;
  for (int i = 0; i < ${MAX_PEARLS}; i++) {
    if (i >= u_pearlCount) break;
    float sd = length(p - u_pearlCenters[i]) - u_pearlRadii[i];
    d = (i == 0) ? sd : smin(d, sd, u_mergeK);
  }
  return d;
}

${GLSL_CALC_NORMAL}

float nearestPearlT(vec3 p) {
  float bestT = 0.0;
  float bestD = 1e6;
  for (int i = 0; i < ${MAX_PEARLS}; i++) {
    if (i >= u_pearlCount) break;
    float d = length(p - u_pearlCenters[i]);
    if (d < bestD) {
      bestD = d;
      bestT = u_pearlT[i];
    }
  }
  return bestT;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.02, 2.85);
  vec3 rd = normalize(vec3(uv, -1.65));

  float t = 0.0;
  float hit = -1.0;
  vec3 p;

  for (int i = 0; i < ${MARCH_STEPS}; i++) {
    p = ro + rd * t;
    float d = mapScene(p);
    if (d < 0.0012) {
      hit = t;
      break;
    }
    t += max(d * 0.9, 0.002);
    if (t > 8.5) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);

  float hueT = nearestPearlT(p);
  hueT = clamp(hueT + u_mid * 0.14 + u_peak * 0.1, 0.0, 1.0);
  vec3 col = mixColor3(u_color1, u_color2, u_color3, hueT);

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.8);
  float shade = 0.54 + 0.46 * dot(n, normalize(vec3(0.28, 0.82, 0.48)));
  col *= shade + u_bass * 0.55 + u_treble * 0.22 + u_peak * 0.3;
  col += fresnel * (mix(u_color2, u_color3, hueT) * (0.5 + u_peak * 0.28) + vec3(0.14, 0.12, 0.1));

  float edgeSoft = smoothstep(0.013, 0.0, mapScene(p));
  float alpha = clamp(0.76 + fresnel * 0.24 + u_bass * 0.16 + u_peak * 0.14, 0.0, 1.0) * edgeSoft;

  gl_FragColor = vec4(col, alpha);
}
`;

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
 * @param {number} elapsed
 * @param {number} swaySpeed
 * @param {number} chainRadius
 * @param {number} pearlSize
 * @param {number} bass
 * @param {number} peak
 * @param {Float32Array} centers
 * @param {Float32Array} radii
 * @param {Float32Array} pearlT
 */
function updatePearlChainField(count, elapsed, swaySpeed, chainRadius, pearlSize, bass, peak, centers, radii, pearlT) {
  const sway = elapsed * swaySpeed;
  const baseRadius = pearlSize * (1.0 + bass * 0.55 + peak * 0.22);

  for (let i = 0; i < count; i++) {
    const u = count <= 1 ? 0.5 : i / (count - 1);
    pearlT[i] = u;

    const angle = u * Math.PI * 1.65 - Math.PI * 0.35;
    const x = Math.sin(angle + sway * 0.58) * chainRadius * 0.92;
    const y = Math.sin(u * Math.PI + sway * 0.38) * chainRadius * 0.44 - 0.04;
    const z = Math.cos(angle + sway * 0.48) * chainRadius * 0.62;

    centers[i * 3] = x;
    centers[i * 3 + 1] = y;
    centers[i * 3 + 2] = z;

    const pulse = 0.93 + 0.09 * Math.sin(sway * 0.65 + i * 1.35);
    radii[i] = baseRadius * pulse;
  }
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createPearlChainRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threePearlChain;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const pearlCenters = new Array(MAX_PEARLS).fill(0).map(() => new THREE.Vector3());
  const pearlRadii = new Float32Array(MAX_PEARLS);
  const pearlT = new Float32Array(MAX_PEARLS);
  const cpuCenters = new Float32Array(MAX_PEARLS * 3);

  const uniforms = createRaymarchUniforms({
    u_pearlCount: { value: cfg.pearlCount },
    u_pearlCenters: { value: pearlCenters },
    u_pearlRadii: { value: pearlRadii },
    u_pearlT: { value: pearlT },
    u_color1: { value: hexToVec3Color(cfg.color1, cfg.color1) },
    u_color2: { value: hexToVec3Color(cfg.color2, cfg.color2) },
    u_color3: { value: hexToVec3Color(cfg.color3, cfg.color3) },
    u_mergeK: { value: mergeStrengthToK(cfg.mergeStrength) },
    u_peak: { value: 0 },
  });

  const { dispose: disposeQuad } = createFullscreenQuadScene(scene, {
    vertexShader: RAYMARCH_VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
  });

  let composer = null;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let peakSmoothed = 0;
  const spectrumState = { bass: 0, mid: 0, treble: 0 };

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
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

  updatePearlChainField(
    cfg.pearlCount,
    0,
    cfg.swaySpeed,
    cfg.chainRadius,
    cfg.pearlSize,
    0,
    0,
    cpuCenters,
    pearlRadii,
    pearlT,
  );
  for (let i = 0; i < MAX_PEARLS; i++) {
    if (i < cfg.pearlCount) {
      pearlCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
    }
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const pearlCount = clampInt(Number(style.pearlCount), 5, 10, cfg.pearlCount);
    const chainRadius = clampFloat(Number(style.chainRadius), 0.4, 1.2, cfg.chainRadius);
    const pearlSize = clampFloat(Number(style.pearlSize), 0.12, 0.35, cfg.pearlSize);
    const swaySpeed = clampFloat(Number(style.swaySpeed), 0.2, 2.0, cfg.swaySpeed);
    const mergeStrength = clampInt(Number(style.mergeStrength), 0, 100, cfg.mergeStrength);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : cfg.bloomEnabled;
    const nextBloomStrength = Number(style.bloomStrength) || cfg.bloomStrength;

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
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

    updatePearlChainField(
      pearlCount,
      elapsed,
      swaySpeed,
      chainRadius,
      pearlSize,
      spectrumState.bass ?? 0,
      peakSmoothed,
      cpuCenters,
      pearlRadii,
      pearlT,
    );

    for (let i = 0; i < MAX_PEARLS; i++) {
      if (i < pearlCount) {
        pearlCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
      } else {
        pearlCenters[i].set(0, -10, 0);
        pearlRadii[i] = 0.001;
        pearlT[i] = 0;
      }
    }

    uniforms.u_pearlCount.value = pearlCount;
    uniforms.u_mergeK.value = mergeStrengthToK(mergeStrength);
    uniforms.u_color1.value.copy(hexToVec3Color(style.color1, cfg.color1));
    uniforms.u_color2.value.copy(hexToVec3Color(style.color2, cfg.color2));
    uniforms.u_color3.value.copy(hexToVec3Color(style.color3, cfg.color3));

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 珍珠链 Bloom 渲染失败，回退直绘", err);
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
