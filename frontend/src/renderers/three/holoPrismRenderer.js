import * as THREE from "three";
import { createChromaticComposer, disposeComposer } from "./postProcessing.js";
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

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2 u_resolution;
uniform float u_rotY;
uniform float u_rotX;
uniform int u_prismSides;
uniform float u_prismRadius;
uniform float u_prismHeight;
uniform vec3 u_tintLow;
uniform vec3 u_tintHigh;
uniform float u_spectralStrength;

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

float sdPolygon(vec2 p, float n, float r) {
  float a = atan(p.y, p.x) + 3.14159265;
  float m = mod(a, 6.28318530 / n) - 3.14159265 / n;
  return cos(m) * length(p) - r;
}

float sdPrism(vec3 p, float r, float h, float n) {
  vec2 d = vec2(sdPolygon(p.xz, n, r), abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float mapScene(vec3 p) {
  vec3 rp = rotY(u_rotY) * rotX(u_rotX * 0.35) * p;
  float scale = 1.0 + u_bass * 0.1 + u_mid * 0.04;
  rp /= scale;
  return sdPrism(rp, u_prismRadius, u_prismHeight, float(u_prismSides)) * scale;
}

${GLSL_CALC_NORMAL}

vec3 spectralRainbow(float t) {
  return 0.55 + 0.45 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.06, 2.8);
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
    if (t > 8.5) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);

  vec3 rp = rotY(u_rotY) * rotX(u_rotX * 0.35) * p;
  float angleT = fract(atan(rp.x, rp.z) / 6.2831853 + 0.5);
  vec3 tintCol = mix(u_tintLow, u_tintHigh, angleT);

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.8);
  vec3 lightDir = normalize(vec3(0.28, 0.9, 0.42));
  vec3 refl = reflect(rd, n);
  float spec = pow(max(dot(refl, lightDir), 0.0), 44.0);

  float edgeFactor = smoothstep(0.18, 0.92, fresnel);
  float spectralMix = u_spectralStrength * edgeFactor * (0.65 + u_treble * 0.35);
  vec3 spectral = spectralRainbow(angleT + fresnel * 0.42 + dot(n, rd) * 0.18);
  vec3 col = mix(tintCol, spectral, spectralMix);

  col += vec3(1.0) * spec * (0.7 + u_treble * 0.4);
  col += tintCol * fresnel * 0.32;
  col *= 0.52 + 0.48 * dot(n, lightDir) + u_bass * 0.32;

  float edgeSoft = smoothstep(0.012, 0.0, mapScene(p));
  float alpha = clamp(0.76 + fresnel * 0.24 + spec * 0.12, 0.0, 1.0) * edgeSoft;

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
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createHoloPrismRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeHoloPrism;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const uniforms = createRaymarchUniforms({
    u_rotY: { value: 0 },
    u_rotX: { value: 0 },
    u_prismSides: { value: cfg.prismSides },
    u_prismRadius: { value: 0.52 },
    u_prismHeight: { value: 0.72 },
    u_tintLow: { value: hexToVec3Color(cfg.tintLow, cfg.tintLow) },
    u_tintHigh: { value: hexToVec3Color(cfg.tintHigh, cfg.tintHigh) },
    u_spectralStrength: { value: cfg.spectralStrength / 100 },
  });

  const { dispose: disposeQuad } = createFullscreenQuadScene(scene, {
    vertexShader: RAYMARCH_VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
  });

  let composer = null;
  /** @type {import('postprocessing').ChromaticAberrationEffect | null} */
  let chromaticEffect = null;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let baseChromaticOffset = cfg.chromaticOffset;
  let chromaticPulse = 0;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  const spectrumState = { bass: 0, mid: 0, treble: 0 };

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    chromaticEffect = null;
    lastComposerKey = key;

    const result = createChromaticComposer(renderer, scene, camera, {
      offset: baseChromaticOffset,
      radialModulation: true,
      bloomEnabled,
      bloomStrength,
      bloomThreshold: 0.06,
    });
    composer = result.composer;
    chromaticEffect = result.chromaticEffect;

    syncRaymarchResolution(renderer, uniforms, composer);
  }

  rebuildComposer();

  function applyChromaticOffset(offset) {
    if (!chromaticEffect) return;
    const boosted = offset * (1.0 + chromaticPulse * 2.8);
    chromaticEffect.offset.set(boosted, boosted * 0.5);
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const prismSides = clampInt(Number(style.prismSides), 4, 8, cfg.prismSides);
    const rotationSpeedDeg = clampFloat(Number(style.rotationSpeedDeg), 0, 30, cfg.rotationSpeedDeg);
    const spectralStrength = clampInt(Number(style.spectralStrength), 0, 100, cfg.spectralStrength);
    const pulseOnPeak =
      style.pulseOnPeak !== undefined ? Boolean(style.pulseOnPeak) : cfg.pulseOnPeak;
    const nextChromaticOffset = clampFloat(Number(style.chromaticOffset), 0, 0.02, cfg.chromaticOffset);
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

    baseChromaticOffset = nextChromaticOffset;

    syncRaymarchResolution(renderer, uniforms, composer);

    const dt = clock.getDelta();
    elapsed += dt > 0 ? dt : 1 / 60;
    uniforms.u_time.value = elapsed;
    updateSpectrumUniforms(uniforms, spectrum, spectrumState);

    const rotSpeed = (rotationSpeedDeg * Math.PI) / 180;
    uniforms.u_rotY.value = elapsed * rotSpeed;
    uniforms.u_rotX.value = elapsed * rotSpeed * 0.28 + (spectrumState.mid ?? 0) * 0.12;

    uniforms.u_prismSides.value = prismSides;
    uniforms.u_spectralStrength.value = spectralStrength / 100;
    uniforms.u_tintLow.value.copy(hexToVec3Color(style.tintLow, cfg.tintLow));
    uniforms.u_tintHigh.value.copy(hexToVec3Color(style.tintHigh, cfg.tintHigh));

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;
    if (pulseOnPeak && peak > 0.35) {
      chromaticPulse = Math.max(chromaticPulse, peak * 0.85);
    }
    chromaticPulse *= 0.9;
    applyChromaticOffset(baseChromaticOffset);

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 全息棱镜后处理渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      chromaticEffect = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    chromaticEffect = null;
    disposeQuad();
    clock.stop();
  }

  return { render, dispose };
}
