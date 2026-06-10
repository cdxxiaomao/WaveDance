import * as THREE from "three";
import { createPhosphorTrailComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const SPECTRUM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SPECTRUM_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_spectrum;
uniform vec3 u_lineColor;
uniform vec3 u_glowColor;
uniform float u_freqReversed;
uniform float u_lineWidth;
uniform float u_mirrorEnabled;
uniform vec2 u_resolution;

varying vec2 vUv;

float sampleAmp(float x) {
  float specX = u_freqReversed > 0.5 ? 1.0 - x : x;
  return clamp(texture2D(u_spectrum, vec2(specX, 0.5)).r, 0.0, 1.0);
}

float lineMask(float uvY, float lineY, float amp) {
  float dist = abs(uvY - lineY);
  float core = smoothstep(u_lineWidth * 1.35, 0.0, dist);
  float glow = exp(-dist * 24.0) * (0.35 + amp * 0.65);
  return core + glow * 0.85;
}

void main() {
  vec2 uv = vUv;
  float baseline = 0.12;
  float amp = sampleAmp(uv.x);
  float lineY = baseline + amp * 0.76;

  float mask = lineMask(uv.y, lineY, amp);
  vec3 col = u_lineColor * mask * (0.75 + amp * 0.85);
  col += u_glowColor * mask * (0.28 + amp * 0.45);
  float alpha = clamp(mask * (0.88 + amp * 0.4), 0.0, 1.0);

  if (u_mirrorEnabled > 0.5) {
    float mirrorY = baseline - (lineY - baseline);
    float mMask = lineMask(uv.y, mirrorY, amp) * 0.72;
    col += u_lineColor * mMask * 0.45 + u_glowColor * mMask * 0.22;
    alpha = max(alpha, clamp(mMask * 0.65, 0.0, 0.85));
  }

  gl_FragColor = vec4(col, alpha);
}
`;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createPhosphorTrailRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    u_spectrum: { value: null },
    u_lineColor: { value: hexToColor(DEFAULT_CONFIG.threePhosphorTrail.lineColor, DEFAULT_CONFIG.threePhosphorTrail.lineColor) },
    u_glowColor: { value: hexToColor(DEFAULT_CONFIG.threePhosphorTrail.glowColor, DEFAULT_CONFIG.threePhosphorTrail.glowColor) },
    u_freqReversed: { value: 0 },
    u_lineWidth: { value: 0.012 },
    u_mirrorEnabled: { value: 0 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SPECTRUM_VERTEX,
    fragmentShader: SPECTRUM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let composerBundle = null;
  let bloomEnabled = DEFAULT_CONFIG.threePhosphorTrail.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threePhosphorTrail.bloomStrength;
  let decayPercent = DEFAULT_CONFIG.threePhosphorTrail.decayPercent;
  let lastComposerKey = "";

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}:${decayPercent}`;
    if (key === lastComposerKey && composerBundle) return;
    disposeComposer(composerBundle?.composer, composerBundle?.afterimagePass);
    composerBundle = null;
    lastComposerKey = key;

    composerBundle = createPhosphorTrailComposer(renderer, scene, camera, {
      decayPercent,
      bloomEnabled,
      bloomStrength,
    });
    const size = renderer.getSize(new THREE.Vector2());
    composerBundle.composer.setSize(size.x, size.y);
  }

  rebuildComposer();

  function syncComposerSize() {
    if (!composerBundle?.composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composerBundle.composer.setSize(size.x, size.y);
    uniforms.u_resolution.value.set(size.x, size.y);
    const lineWidthPx = clampInt(
      composerBundle._lineWidthPx ?? DEFAULT_CONFIG.threePhosphorTrail.lineWidthPx,
      1,
      12,
      DEFAULT_CONFIG.threePhosphorTrail.lineWidthPx,
    );
    uniforms.u_lineWidth.value = (lineWidthPx / Math.max(size.y, 1)) * 2;
  }

  function render(_points, _shapeConfig, styleConfig, _frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const nextBloomEnabled =
      style.bloomEnabled !== undefined
        ? Boolean(style.bloomEnabled)
        : DEFAULT_CONFIG.threePhosphorTrail.bloomEnabled;
    const nextBloomStrength =
      Number(style.bloomStrength) || DEFAULT_CONFIG.threePhosphorTrail.bloomStrength;
    const nextDecay = clampInt(
      style.decayPercent,
      10,
      90,
      DEFAULT_CONFIG.threePhosphorTrail.decayPercent,
    );
    const lineWidthPx = clampInt(
      style.lineWidthPx,
      1,
      12,
      DEFAULT_CONFIG.threePhosphorTrail.lineWidthPx,
    );

    if (
      nextBloomEnabled !== bloomEnabled ||
      Math.abs(nextBloomStrength - bloomStrength) > 0.01 ||
      nextDecay !== decayPercent
    ) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      decayPercent = nextDecay;
      lastComposerKey = "";
      rebuildComposer();
    } else if (composerBundle) {
      composerBundle._lineWidthPx = lineWidthPx;
      composerBundle.afterimagePass?.setDecayPercent(decayPercent);
    }

    syncComposerSize();
    if (composerBundle) composerBundle._lineWidthPx = lineWidthPx;

    uniforms.u_freqReversed.value = style.freqReversed ? 1 : 0;
    uniforms.u_mirrorEnabled.value =
      style.mirrorEnabled !== undefined
        ? style.mirrorEnabled
          ? 1
          : 0
        : DEFAULT_CONFIG.threePhosphorTrail.mirrorEnabled
          ? 1
          : 0;

    if (style.lineColor) {
      uniforms.u_lineColor.value.copy(
        hexToColor(style.lineColor, DEFAULT_CONFIG.threePhosphorTrail.lineColor),
      );
    }
    if (style.glowColor) {
      uniforms.u_glowColor.value.copy(
        hexToColor(style.glowColor, DEFAULT_CONFIG.threePhosphorTrail.glowColor),
      );
    }
    if (spectrum?.spectrumTexture) {
      uniforms.u_spectrum.value = spectrum.spectrumTexture;
    }

    renderer.setClearColor(0x000000, 0);
    try {
      composerBundle?.composer.render();
    } catch (err) {
      console.warn("[WaveDance] 磷光余辉后处理渲染失败，回退直绘", err);
      disposeComposer(composerBundle?.composer, composerBundle?.afterimagePass);
      composerBundle = null;
      lastComposerKey = "";
      rebuildComposer();
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composerBundle?.composer, composerBundle?.afterimagePass);
    composerBundle = null;
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return { render, dispose };
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
