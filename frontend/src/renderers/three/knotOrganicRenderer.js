import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";
import {
  GLSL_GRADIENT_MIX,
  RAYMARCH_VERTEX,
  createRaymarchUniforms,
  createFullscreenQuadScene,
  syncRaymarchResolution,
  updateSpectrumUniforms,
  hexToVec3Color,
} from "./raymarchHelpers.js";
import { prependNoiseGlsl, GLSL_FBM_SNOISE_3D } from "./noiseGlsl.js";

/** 扭结 SDF 比球体类场景重，步数略低以保帧率 */
const KNOT_MARCH_STEPS = 56;
/** 粗采样找最近相位 + Newton 精修，替代 64 段折线近似 */
const KNOT_COARSE_SAMPLES = 12;
const KNOT_NEWTON_STEPS = 4;

const FRAGMENT = prependNoiseGlsl(/* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_peak;
uniform vec2 u_resolution;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform float u_knotP;
uniform float u_knotQ;
uniform float u_tubeRadius;
uniform float u_surfaceNoise;
uniform float u_rotationSpeed;

varying vec2 vUv;

${GLSL_FBM_SNOISE_3D}

${GLSL_GRADIENT_MIX}

// 沿闭合曲线 cyclic 三色渐变：c0 → c1 → c2 → c0，首尾平滑衔接
vec3 mixColor3Cyclic(vec3 c0, vec3 c1, vec3 c2, float t) {
  t = fract(t);
  float seg = t * 3.0;
  float idx = floor(seg);
  float f = fract(seg);
  f = f * f * (3.0 - 2.0 * f);
  if (idx < 1.0) return mix(c0, c1, f);
  if (idx < 2.0) return mix(c1, c2, f);
  return mix(c2, c0, f);
}

mat3 rotYMat(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotXMat(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

vec3 transformScene(vec3 p) {
  float ang = u_time * u_rotationSpeed;
  return rotYMat(ang * 0.72) * rotXMat(ang * 0.38) * p;
}

vec3 knotPos(float t, float p, float q) {
  float r = cos(q * t) + 2.0;
  return vec3(r * cos(p * t), r * sin(p * t), -sin(q * t)) * 0.27;
}

vec3 knotTangent(float t, float p, float q) {
  float cq = cos(q * t);
  float sq = sin(q * t);
  float cp = cos(p * t);
  float sp = sin(p * t);
  float r = cq + 2.0;
  float dr = -q * sq;
  return vec3(dr * cp - r * p * sp, dr * sp + r * p * cp, -q * cq) * 0.27;
}

// 粗采样 + Newton：O(16) 量级，替代 64 段折线距离
float knotClosestT(vec3 p, float pK, float qK) {
  float bestT = 0.0;
  float bestD = 1e6;
  for (int i = 0; i < ${KNOT_COARSE_SAMPLES}; i++) {
    float t = 6.2831853 * float(i) / float(${KNOT_COARSE_SAMPLES});
    vec3 kp = knotPos(t, pK, qK);
    float d = length(p - kp);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  float t = bestT;
  for (int j = 0; j < ${KNOT_NEWTON_STEPS}; j++) {
    vec3 c = knotPos(t, pK, qK);
    vec3 tangent = knotTangent(t, pK, qK);
    t += dot(p - c, tangent) / max(dot(tangent, tangent), 1e-4);
  }
  return t;
}

float sdKnotTube(vec3 p, float pK, float qK, float tube) {
  float t = knotClosestT(p, pK, qK);
  return length(p - knotPos(t, pK, qK)) - tube;
}

float knotPhaseAt(vec3 p, float pK, float qK) {
  float t = knotClosestT(p, pK, qK);
  return fract(t / 6.2831853 + u_time * 0.04 + u_mid * 0.06);
}

// raymarch / 法线仅用平滑管体 SDF，避免每步 FBM
float mapKnotCore(vec3 p) {
  vec3 q = transformScene(p);
  float tube = u_tubeRadius * (1.0 + u_bass * 0.42 + u_peak * 0.18);
  return sdKnotTube(q, u_knotP, u_knotQ, tube);
}

vec3 calcNormal(vec3 p) {
  const float e = 0.0015;
  vec2 ev = vec2(e, 0.0);
  return normalize(vec3(
    mapKnotCore(p + ev.xyy) - mapKnotCore(p - ev.xyy),
    mapKnotCore(p + ev.yxy) - mapKnotCore(p - ev.yxy),
    mapKnotCore(p + ev.yyx) - mapKnotCore(p - ev.yyx)
  ));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.02, 2.75);
  vec3 rd = normalize(vec3(uv, -1.62));

  float t = 0.0;
  float hit = -1.0;
  vec3 p;

  for (int i = 0; i < ${KNOT_MARCH_STEPS}; i++) {
    p = ro + rd * t;
    float d = mapKnotCore(p);
    if (d < 0.0011) {
      hit = t;
      break;
    }
    t += max(d * 0.88, 0.002);
    if (t > 8.5) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 localP = transformScene(p);

  float hueT = knotPhaseAt(localP, u_knotP, u_knotQ);
  hueT = fract(hueT + u_peak * 0.08);
  vec3 col = mixColor3Cyclic(u_color1, u_color2, u_color3, hueT);

  float noiseAmp = u_surfaceNoise * (0.08 + u_treble * 0.14);
  float ripple = fbmSnoise3(localP * 6.5 + vec3(u_time * 0.18, -u_time * 0.12, u_time * 0.08));
  col *= 1.0 + ripple * noiseAmp;

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.6);
  float shade = 0.52 + 0.48 * dot(n, normalize(vec3(0.26, 0.84, 0.46)));
  col *= shade + u_bass * 0.52 + u_treble * 0.24 + u_peak * 0.28;
  col += fresnel * (mixColor3Cyclic(u_color1, u_color2, u_color3, hueT + 0.12) * (0.48 + u_peak * 0.26) + vec3(0.12, 0.1, 0.14));

  float edgeSoft = smoothstep(0.012, 0.0, mapKnotCore(p));
  float alpha = clamp(0.74 + fresnel * 0.22 + u_bass * 0.14 + u_peak * 0.12, 0.0, 1.0) * edgeSoft;

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
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createKnotOrganicRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeKnotOrganic;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const uniforms = createRaymarchUniforms({
    u_color1: { value: hexToVec3Color(cfg.color1, cfg.color1) },
    u_color2: { value: hexToVec3Color(cfg.color2, cfg.color2) },
    u_color3: { value: hexToVec3Color(cfg.color3, cfg.color3) },
    u_knotP: { value: cfg.knotP },
    u_knotQ: { value: cfg.knotQ },
    u_tubeRadius: { value: cfg.tubeRadius },
    u_surfaceNoise: { value: cfg.surfaceNoise / 100 },
    u_rotationSpeed: { value: (cfg.rotationSpeedDeg * Math.PI) / 180 },
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
        mipmapBlur: false,
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    syncRaymarchResolution(renderer, uniforms, composer);
  }

  rebuildComposer();

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const knotP = clampInt(Number(style.knotP), 2, 4, cfg.knotP);
    const knotQ = clampInt(Number(style.knotQ), 3, 7, cfg.knotQ);
    const tubeRadius = clampFloat(Number(style.tubeRadius), 0.06, 0.28, cfg.tubeRadius);
    const surfaceNoise = clampInt(Number(style.surfaceNoise), 0, 100, cfg.surfaceNoise);
    const rotationSpeedDeg = clampInt(Number(style.rotationSpeedDeg), 0, 30, cfg.rotationSpeedDeg);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : cfg.bloomEnabled;
    const nextBloomStrength = Number(style.bloomStrength) || cfg.bloomStrength;

    if (
      nextBloomEnabled !== bloomEnabled ||
      Math.abs(nextBloomStrength - bloomStrength) > 0.01
    ) {
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
      bass: 0.3,
      mid: 0.24,
      treble: 0.28,
    });

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;
    peakSmoothed += (peak - peakSmoothed) * 0.28;
    uniforms.u_peak.value = peakSmoothed;

    uniforms.u_color1.value.copy(hexToVec3Color(style.color1, cfg.color1));
    uniforms.u_color2.value.copy(hexToVec3Color(style.color2, cfg.color2));
    uniforms.u_color3.value.copy(hexToVec3Color(style.color3, cfg.color3));
    uniforms.u_knotP.value = knotP;
    uniforms.u_knotQ.value = knotQ;
    uniforms.u_tubeRadius.value = tubeRadius;
    uniforms.u_surfaceNoise.value = surfaceNoise / 100;
    uniforms.u_rotationSpeed.value = (rotationSpeedDeg * Math.PI) / 180;

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 扭结有机体后处理渲染失败，回退直绘", err);
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
