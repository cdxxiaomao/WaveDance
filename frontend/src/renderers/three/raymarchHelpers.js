/**
 * 全屏 raymarch 公共工具（Phase 29+ 有机渐变 3D 系列）。
 *
 * **重要**：新 renderer 请将 `shaderChunks/smin.glsl`、`calcNormal.glsl` 等
 * **复制粘贴**进各自 fragment shader，勿 import 或修改 `liquidBlobRenderer.js`。
 */
import * as THREE from "three";
import sminChunk from "./shaderChunks/smin.glsl?raw";
import gradientMixChunk from "./shaderChunks/gradientMix.glsl?raw";
import calcNormalChunk from "./shaderChunks/calcNormal.glsl?raw";

/** 与 liquidBlob 同档步数上限 */
export const MARCH_STEPS = 72;

/** 体积 raymarch（星云等）建议步数上限 */
export const VOLUME_MARCH_STEPS = 48;

/** 供新 renderer 复制进 shader 的 GLSL chunk 字符串 */
export const GLSL_SMIN = sminChunk.trim();
export const GLSL_GRADIENT_MIX = gradientMixChunk.trim();
export const GLSL_CALC_NORMAL = calcNormalChunk.trim();

export const RAYMARCH_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * 创建标准 raymarch uniform 包（time / 分辨率 / 频谱三分量）。
 * @param {Record<string, import('three').IUniform>} [extra]
 */
export function createRaymarchUniforms(extra = {}) {
  return {
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_treble: { value: 0 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
    ...extra,
  };
}

/**
 * 平滑更新频谱 uniform（与 liquidBlob 缓落策略一致）。
 * @param {Record<string, import('three').IUniform>} uniforms
 * @param {{ bass?: number, mid?: number, treble?: number }} spectrum
 * @param {{ bass?: number, mid?: number, treble?: number }} state
 * @param {{ bass?: number, mid?: number, treble?: number }} [rates]
 */
export function updateSpectrumUniforms(uniforms, spectrum, state, rates = {}) {
  const bassRate = rates.bass ?? 0.22;
  const midRate = rates.mid ?? 0.18;
  const trebleRate = rates.treble ?? 0.16;

  const bass = spectrum?.bass ?? 0;
  const mid = spectrum?.mid ?? 0;
  const treble = spectrum?.treble ?? 0;

  state.bass = (state.bass ?? 0) + (bass - (state.bass ?? 0)) * bassRate;
  state.mid = (state.mid ?? 0) + (mid - (state.mid ?? 0)) * midRate;
  state.treble = (state.treble ?? 0) + (treble - (state.treble ?? 0)) * trebleRate;

  uniforms.u_bass.value = state.bass;
  uniforms.u_mid.value = state.mid;
  uniforms.u_treble.value = state.treble;
}

/**
 * 同步 canvas 分辨率 uniform 与 composer（若有）。
 * @param {import('three').WebGLRenderer} renderer
 * @param {Record<string, import('three').IUniform>} uniforms
 * @param {import('postprocessing').EffectComposer | null} [composer]
 */
export function syncRaymarchResolution(renderer, uniforms, composer) {
  const size = renderer.getSize(new THREE.Vector2());
  uniforms.u_resolution.value.set(size.x, size.y);
  composer?.setSize(size.x, size.y);
}

/**
 * 10 行搭好全屏 raymarch quad：PlaneGeometry(2,2) + ShaderMaterial + scene.add。
 * @param {import('three').Scene} scene
 * @param {{ fragmentShader: string, uniforms?: Record<string, import('three').IUniform>, vertexShader?: string }} options
 */
export function createFullscreenQuadScene(scene, options) {
  const uniforms = options.uniforms ?? createRaymarchUniforms();
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: options.vertexShader ?? RAYMARCH_VERTEX,
    fragmentShader: options.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  scene.add(quad);

  function dispose() {
    scene.remove(quad);
    geometry.dispose();
    material.dispose();
  }

  return { quad, material, uniforms, geometry, dispose };
}

/** @param {string} hex @param {string} fallback */
export function hexToVec3Color(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/** @param {number} mergeStrength 0~100 → smin k */
export function mergeStrengthToK(mergeStrength) {
  const t = Math.min(100, Math.max(0, Number(mergeStrength) || 0)) / 100;
  return 0.06 + t * 0.42;
}
