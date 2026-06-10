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

const MAX_GEMS = 3;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2 u_resolution;
uniform int u_gemCount;
uniform vec3 u_gemCenters[${MAX_GEMS}];
uniform float u_gemScales[${MAX_GEMS}];
uniform float u_rotY;
uniform float u_rotX;
uniform float u_facetSharp;
uniform vec3 u_colorCore;
uniform vec3 u_colorEdge;
uniform vec3 u_colorHighlight;

varying vec2 vUv;

mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdGem(vec3 p, float facet) {
  float oct = sdOctahedron(p, 0.74 + u_bass * 0.06);
  float box = sdRoundBox(p, vec3(0.4, 0.5, 0.36), 0.05);
  return mix(box, oct, facet);
}

float mapSingleGem(vec3 p, int idx) {
  vec3 c = u_gemCenters[idx];
  float scale = u_gemScales[idx];
  vec3 gp = p - c;
  gp = rotY(u_rotY + float(idx) * 0.55) * gp;
  gp = rotX(u_rotX * 0.65 + float(idx) * 0.18) * gp;
  gp /= scale;
  return sdGem(gp, u_facetSharp) * scale;
}

float mapScene(vec3 p) {
  float d = 100.0;
  for (int i = 0; i < ${MAX_GEMS}; i++) {
    if (i >= u_gemCount) break;
    d = min(d, mapSingleGem(p, i));
  }
  return d;
}

${GLSL_CALC_NORMAL}

float nearestGemDepth(vec3 p) {
  float best = 1.0;
  for (int i = 0; i < ${MAX_GEMS}; i++) {
    if (i >= u_gemCount) break;
    float dist = length(p - u_gemCenters[i]) / max(u_gemScales[i], 0.01);
    best = min(best, dist);
  }
  return clamp(best, 0.0, 1.0);
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.04, 2.75);
  vec3 rd = normalize(vec3(uv, -1.62));

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
    if (t > 8.0) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);

  float depthT = nearestGemDepth(p);
  float coreMix = pow(1.0 - depthT, 1.6);
  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.2);

  vec3 lightDir = normalize(vec3(0.32, 0.88, 0.42));
  vec3 refl = reflect(rd, n);
  float spec = pow(max(dot(refl, lightDir), 0.0), 52.0);
  spec += pow(max(dot(refl, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 28.0) * 0.35;

  vec3 col = mix(u_colorCore, u_colorEdge, fresnel * 0.72 + depthT * 0.28);
  col = mix(col, u_colorCore, coreMix * 0.82);
  col += u_colorHighlight * spec * (0.85 + u_treble * 0.45);
  col += u_colorEdge * fresnel * 0.38;

  float shade = 0.5 + 0.5 * dot(n, lightDir);
  col *= shade + u_bass * 0.38 + u_mid * 0.12;

  float edgeSoft = smoothstep(0.012, 0.0, mapScene(p));
  float alpha = clamp(0.78 + fresnel * 0.22 + spec * 0.15, 0.0, 1.0) * edgeSoft;

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
 * @param {number} bass
 * @param {Float32Array} centers
 * @param {Float32Array} scales
 */
function updateGemLayout(count, bass, centers, scales) {
  const pulse = 1.0 + bass * 0.14;
  const positions = [
    [0, 0.02, 0],
    [-0.58, 0.06, 0.12],
    [0.56, -0.05, -0.1],
  ];
  const baseScales = [0.72, 0.62, 0.58];

  for (let i = 0; i < MAX_GEMS; i++) {
    if (i < count) {
      centers[i * 3] = positions[i][0];
      centers[i * 3 + 1] = positions[i][1];
      centers[i * 3 + 2] = positions[i][2];
      scales[i] = baseScales[i] * pulse;
    } else {
      centers[i * 3] = 0;
      centers[i * 3 + 1] = -10;
      centers[i * 3 + 2] = 0;
      scales[i] = 0.001;
    }
  }
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createCrystalGemRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeCrystalGem;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const gemCenters = new Array(MAX_GEMS).fill(0).map(() => new THREE.Vector3());
  const gemScales = new Float32Array(MAX_GEMS);
  const cpuCenters = new Float32Array(MAX_GEMS * 3);

  const uniforms = createRaymarchUniforms({
    u_gemCount: { value: cfg.gemCount },
    u_gemCenters: { value: gemCenters },
    u_gemScales: { value: gemScales },
    u_rotY: { value: 0 },
    u_rotX: { value: 0 },
    u_facetSharp: { value: cfg.facetSharpness / 100 },
    u_colorCore: { value: hexToVec3Color(cfg.colorCore, cfg.colorCore) },
    u_colorEdge: { value: hexToVec3Color(cfg.colorEdge, cfg.colorEdge) },
    u_colorHighlight: { value: hexToVec3Color(cfg.colorHighlight, cfg.colorHighlight) },
  });

  const { dispose: disposeQuad } = createFullscreenQuadScene(scene, {
    vertexShader: RAYMARCH_VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
  });

  let composer = null;
  let chromaticEnabled = cfg.chromaticEnabled;
  let chromaticOffset = cfg.chromaticOffset;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  const spectrumState = { bass: 0, mid: 0, treble: 0 };

  function rebuildComposer() {
    const key = `${chromaticEnabled}:${chromaticOffset.toFixed(4)}:${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (chromaticEnabled) {
      const result = createChromaticComposer(renderer, scene, camera, {
        offset: chromaticOffset,
        bloomEnabled,
        bloomStrength,
        bloomThreshold: 0.08,
      });
      composer = result.composer;
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

  updateGemLayout(cfg.gemCount, 0, cpuCenters, gemScales);
  for (let i = 0; i < MAX_GEMS; i++) {
    gemCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
  }

  function render(_points, _shapeConfig, styleConfig, _frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const gemCount = clampInt(Number(style.gemCount), 1, 3, cfg.gemCount);
    const facetSharpness = clampInt(Number(style.facetSharpness), 0, 100, cfg.facetSharpness);
    const rotationSpeedDeg = clampFloat(Number(style.rotationSpeedDeg), 0, 30, cfg.rotationSpeedDeg);
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
    updateSpectrumUniforms(uniforms, spectrum, spectrumState);

    const rotSpeed = (rotationSpeedDeg * Math.PI) / 180;
    uniforms.u_rotY.value = elapsed * rotSpeed;
    uniforms.u_rotX.value = elapsed * rotSpeed * 0.42;

    updateGemLayout(gemCount, spectrumState.bass ?? 0, cpuCenters, gemScales);
    for (let i = 0; i < MAX_GEMS; i++) {
      gemCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
    }

    uniforms.u_gemCount.value = gemCount;
    uniforms.u_facetSharp.value = facetSharpness / 100;
    uniforms.u_colorCore.value.copy(hexToVec3Color(style.colorCore, cfg.colorCore));
    uniforms.u_colorEdge.value.copy(hexToVec3Color(style.colorEdge, cfg.colorEdge));
    uniforms.u_colorHighlight.value.copy(hexToVec3Color(style.colorHighlight, cfg.colorHighlight));

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 宝石晶体后处理渲染失败，回退直绘", err);
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
