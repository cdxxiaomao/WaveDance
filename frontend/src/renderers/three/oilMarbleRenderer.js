import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";
import {
  MARCH_STEPS,
  GLSL_CALC_NORMAL,
  GLSL_GRADIENT_MIX,
  RAYMARCH_VERTEX,
  createRaymarchUniforms,
  createFullscreenQuadScene,
  updateSpectrumUniforms,
  syncRaymarchResolution,
  hexToVec3Color,
} from "./raymarchHelpers.js";
import { prependNoiseGlsl, GLSL_FBM_SNOISE_3D } from "./noiseGlsl.js";

const FRAGMENT = prependNoiseGlsl(/* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2 u_resolution;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform vec3 u_color4;
uniform int u_colorCount;
uniform float u_flowSpeed;
uniform float u_noiseScale;
uniform float u_warpStrength;
uniform float u_reactiveness;

varying vec2 vUv;

${GLSL_FBM_SNOISE_3D}

${GLSL_GRADIENT_MIX}

float mapScene(vec3 p) {
  return abs(length(p) - 0.78) - 0.032;
}

vec3 domainWarp(vec3 p) {
  float ws = u_warpStrength * 0.012 * (1.0 + u_mid * 0.55);
  float flow = u_flowSpeed * (1.0 + u_bass * u_reactiveness * 0.008);
  float t = u_time * flow;
  vec3 q = p * u_noiseScale;
  vec3 w;
  w.x = fbmSnoise3(q + vec3(t * 0.31, 0.0, t * 0.17));
  w.y = fbmSnoise3(q + vec3(5.2, t * 0.29, 1.7));
  w.z = fbmSnoise3(q + vec3(2.8, 4.1, t * 0.23));
  return w * ws;
}

float marbleField(vec3 p) {
  vec3 wp = p + domainWarp(p);
  float flow = u_flowSpeed * (1.0 + u_bass * u_reactiveness * 0.008);
  float t = u_time * flow;
  float n = fbmSnoise3(wp * u_noiseScale + vec3(t * 0.12, t * 0.08, -t * 0.05));
  n += 0.38 * fbmSnoise3(wp * u_noiseScale * 1.85 + vec3(-t * 0.07, t * 0.11, t * 0.04));
  n += 0.18 * fbmSnoise3(wp * u_noiseScale * 3.2 + vec3(t * 0.05, -t * 0.09, 0.0));
  return clamp(n * 0.42 + 0.5 + u_treble * 0.06, 0.0, 1.0);
}

${GLSL_CALC_NORMAL}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.02, 2.75);
  vec3 rd = normalize(vec3(uv, -1.62));

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
    t += max(d * 0.88, 0.002);
    if (t > 7.5) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 sampleP = p - n * 0.018;

  float hueT = marbleField(sampleP);
  vec3 stops[4];
  stops[0] = u_color1;
  stops[1] = u_color2;
  stops[2] = u_color3;
  stops[3] = u_color4;
  vec3 col = mixColorStops(stops, u_colorCount, hueT);

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.6);
  float shade = 0.52 + 0.48 * dot(n, normalize(vec3(0.25, 0.85, 0.45)));
  col *= shade + u_bass * 0.38 + u_treble * 0.12;
  col += fresnel * (mix(u_color2, u_color3, hueT) * 0.45 + vec3(0.1));

  float edgeSoft = smoothstep(0.014, 0.0, mapScene(p));
  float alpha = clamp(0.74 + fresnel * 0.22 + u_bass * 0.1, 0.0, 1.0) * edgeSoft;

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
export function createOilMarbleRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeOilMarble;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const uniforms = createRaymarchUniforms({
    u_color1: { value: hexToVec3Color(cfg.color1, cfg.color1) },
    u_color2: { value: hexToVec3Color(cfg.color2, cfg.color2) },
    u_color3: { value: hexToVec3Color(cfg.color3, cfg.color3) },
    u_color4: { value: hexToVec3Color(cfg.color4, cfg.color4) },
    u_colorCount: { value: cfg.color4Enabled ? 4 : 3 },
    u_flowSpeed: { value: cfg.flowSpeed },
    u_noiseScale: { value: cfg.noiseScale },
    u_warpStrength: { value: cfg.warpStrength },
    u_reactiveness: { value: cfg.reactiveness },
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

  function render(_points, _shapeConfig, styleConfig, _frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const flowSpeed = clampFloat(Number(style.flowSpeed), 0.2, 2.5, cfg.flowSpeed);
    const noiseScale = clampFloat(Number(style.noiseScale), 0.8, 4.5, cfg.noiseScale);
    const warpStrength = clampInt(Number(style.warpStrength), 0, 100, cfg.warpStrength);
    const reactiveness = clampInt(Number(style.reactiveness), 0, 100, cfg.reactiveness);
    const color4Enabled =
      style.color4Enabled !== undefined ? Boolean(style.color4Enabled) : cfg.color4Enabled;
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
    updateSpectrumUniforms(uniforms, spectrum, spectrumState);

    uniforms.u_color1.value.copy(hexToVec3Color(style.color1, cfg.color1));
    uniforms.u_color2.value.copy(hexToVec3Color(style.color2, cfg.color2));
    uniforms.u_color3.value.copy(hexToVec3Color(style.color3, cfg.color3));
    uniforms.u_color4.value.copy(hexToVec3Color(style.color4, cfg.color4));
    uniforms.u_colorCount.value = color4Enabled ? 4 : 3;
    uniforms.u_flowSpeed.value = flowSpeed;
    uniforms.u_noiseScale.value = noiseScale;
    uniforms.u_warpStrength.value = warpStrength;
    uniforms.u_reactiveness.value = reactiveness;

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 油彩大理石 Bloom 渲染失败，回退直绘", err);
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
