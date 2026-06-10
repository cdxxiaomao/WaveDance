import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";
import {
  VOLUME_MARCH_STEPS,
  GLSL_GRADIENT_MIX,
  RAYMARCH_VERTEX,
  createRaymarchUniforms,
  createFullscreenQuadScene,
  syncRaymarchResolution,
  updateSpectrumUniforms,
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
uniform vec3 u_colorCore;
uniform vec3 u_colorMid;
uniform vec3 u_colorEdge;
uniform float u_densityScale;
uniform float u_noiseScale;
uniform float u_swirlSpeed;
uniform float u_marchSteps;

varying vec2 vUv;

${GLSL_FBM_SNOISE_3D}

${GLSL_GRADIENT_MIX}

mat3 rotYMat(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

float nebulaDensity(vec3 p) {
  float swirl = u_time * u_swirlSpeed * (1.0 + u_mid * 0.35);
  vec3 q = rotYMat(swirl) * p;

  float coreRadius = 0.42 + u_bass * 0.28;
  float dist = length(q);
  float envelope = smoothstep(coreRadius * 1.55, coreRadius * 0.08, dist);

  vec3 np = q * u_noiseScale;
  float t = u_time * 0.08;
  float n = fbmSnoise3(np + vec3(t * 0.4, t * 0.25, -t * 0.18));
  n += 0.55 * fbmSnoise3(np * 2.05 + vec3(1.9, -t * 0.32, 2.4));
  n += 0.22 * fbmSnoise3(np * 3.8 + vec3(-t * 0.15, 3.1, t * 0.2));
  n = n * 0.5 + 0.5;

  float density = envelope * (0.22 + 0.78 * n);
  density *= u_densityScale * (0.75 + u_bass * 0.55 + u_treble * 0.12);
  return max(density, 0.0);
}

vec3 nebulaColor(vec3 p, float density) {
  float dist = length(p);
  float coreRadius = 0.42 + u_bass * 0.28;
  float t = clamp(dist / max(coreRadius * 1.35, 0.01), 0.0, 1.0);
  t = clamp(t + u_mid * 0.08 - density * 0.15, 0.0, 1.0);
  vec3 col = mixColor3(u_colorCore, u_colorMid, u_colorEdge, t);
  col *= 0.55 + density * 0.95;
  col += u_colorCore * density * u_bass * 0.35;
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.02, 2.65);
  vec3 rd = normalize(vec3(uv, -1.58));

  float maxDist = 5.5;
  float stepSize = maxDist / max(u_marchSteps, 8.0);
  float t = 0.04;
  float transmittance = 1.0;
  vec3 accumulated = vec3(0.0);

  for (int i = 0; i < ${VOLUME_MARCH_STEPS}; i++) {
    if (float(i) >= u_marchSteps) break;

    vec3 p = ro + rd * t;
    float density = nebulaDensity(p);

    if (density > 0.004) {
      vec3 col = nebulaColor(p, density);
      float alpha = 1.0 - exp(-density * stepSize * 3.2);
      accumulated += transmittance * col * alpha;
      transmittance *= 1.0 - alpha;
    }

    if (transmittance < 0.025) break;

    t += stepSize;
    if (t > maxDist) break;
  }

  float outAlpha = clamp(1.0 - transmittance, 0.0, 0.96);
  if (outAlpha < 0.004) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 col = accumulated / max(outAlpha, 0.001);
  col *= 0.88 + u_bass * 0.18;
  gl_FragColor = vec4(col, outAlpha);
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
export function createNebulaVolumeRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeNebulaVolume;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const uniforms = createRaymarchUniforms({
    u_colorCore: { value: hexToVec3Color(cfg.colorCore, cfg.colorCore) },
    u_colorMid: { value: hexToVec3Color(cfg.colorMid, cfg.colorMid) },
    u_colorEdge: { value: hexToVec3Color(cfg.colorEdge, cfg.colorEdge) },
    u_densityScale: { value: cfg.densityScale },
    u_noiseScale: { value: cfg.noiseScale },
    u_swirlSpeed: { value: cfg.swirlSpeed },
    u_marchSteps: { value: cfg.marchSteps },
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
        luminanceThreshold: 0.06,
        luminanceSmoothing: 0.38,
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

    const densityScale = clampFloat(Number(style.densityScale), 0.4, 2.5, cfg.densityScale);
    const noiseScale = clampFloat(Number(style.noiseScale), 0.6, 4.0, cfg.noiseScale);
    const swirlSpeed = clampFloat(Number(style.swirlSpeed), 0.1, 2.0, cfg.swirlSpeed);
    const marchSteps = clampInt(Number(style.marchSteps), 32, 48, cfg.marchSteps);
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
      bass: 0.1,
      mid: 0.085,
      treble: 0.075,
    });

    uniforms.u_densityScale.value = densityScale;
    uniforms.u_noiseScale.value = noiseScale;
    uniforms.u_swirlSpeed.value = swirlSpeed;
    uniforms.u_marchSteps.value = marchSteps;
    uniforms.u_colorCore.value.copy(hexToVec3Color(style.colorCore, cfg.colorCore));
    uniforms.u_colorMid.value.copy(hexToVec3Color(style.colorMid, cfg.colorMid));
    uniforms.u_colorEdge.value.copy(hexToVec3Color(style.colorEdge, cfg.colorEdge));

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 星云团后处理渲染失败，回退直绘", err);
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
