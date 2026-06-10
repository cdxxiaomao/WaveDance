import * as THREE from "three";
import { createGlitchSpectrumComposer, disposeComposer } from "./postProcessing.js";
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
uniform vec3 u_baseColor;
uniform float u_freqReversed;
uniform float u_scanlineOpacity;
uniform float u_time;
uniform vec2 u_resolution;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float specX = u_freqReversed > 0.5 ? 1.0 - uv.x : uv.x;
  float amp = texture2D(u_spectrum, vec2(specX, 0.5)).r;
  amp = clamp(amp, 0.0, 1.0);

  float floorY = 0.04;
  float barTop = floorY + amp * 0.9;
  float barMask = smoothstep(barTop + 0.004, barTop, uv.y) * smoothstep(floorY - 0.004, floorY, uv.y);
  float crest = smoothstep(barTop - 0.018, barTop, uv.y) * smoothstep(barTop + 0.006, barTop, uv.y);

  vec3 col = u_baseColor * (barMask * (0.35 + amp * 0.85) + crest * 0.55);
  float alpha = clamp(barMask * 0.92 + crest * 0.35, 0.0, 1.0);

  if (u_scanlineOpacity > 0.001) {
    float scan = sin((uv.y + u_time * 0.04) * u_resolution.y * 1.35) * 0.5 + 0.5;
    col *= 1.0 - scan * u_scanlineOpacity * 0.22;
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
export function createGlitchSpectrumRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    u_spectrum: { value: null },
    u_baseColor: { value: hexToColor(DEFAULT_CONFIG.threeGlitchSpectrum.baseColor, DEFAULT_CONFIG.threeGlitchSpectrum.baseColor) },
    u_freqReversed: { value: 0 },
    u_scanlineOpacity: { value: DEFAULT_CONFIG.threeGlitchSpectrum.scanlineOpacity / 100 },
    u_time: { value: 0 },
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
  let rgbSplitPx = DEFAULT_CONFIG.threeGlitchSpectrum.rgbSplitPx;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let lastBurstMs = 0;
  let glitchPulse = 0;

  function rebuildComposer() {
    const key = String(rgbSplitPx);
    if (key === lastComposerKey && composerBundle) return;
    disposeComposer(composerBundle?.composer);
    composerBundle = null;
    lastComposerKey = key;

    composerBundle = createGlitchSpectrumComposer(renderer, scene, camera, { rgbSplitPx });
    const size = renderer.getSize(new THREE.Vector2());
    composerBundle.composer.setSize(size.x, size.y);
  }

  rebuildComposer();

  function syncComposerSize() {
    if (!composerBundle?.composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composerBundle.composer.setSize(size.x, size.y);
    uniforms.u_resolution.value.set(size.x, size.y);
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const nextRgbSplit = clampInt(style.rgbSplitPx, 0, 12, DEFAULT_CONFIG.threeGlitchSpectrum.rgbSplitPx);
    if (nextRgbSplit !== rgbSplitPx) {
      rgbSplitPx = nextRgbSplit;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    const safeDt = dt > 0 ? dt : 1 / 60;
    elapsed += safeDt;
    uniforms.u_time.value = elapsed;

    const glitchIntensity = clampInt(
      style.glitchIntensity,
      0,
      100,
      DEFAULT_CONFIG.threeGlitchSpectrum.glitchIntensity,
    );
    const scanlineOpacity = clampInt(
      style.scanlineOpacity,
      0,
      100,
      DEFAULT_CONFIG.threeGlitchSpectrum.scanlineOpacity,
    );
    const triggerThreshold = clampInt(
      style.triggerThreshold,
      0,
      100,
      DEFAULT_CONFIG.threeGlitchSpectrum.triggerThreshold,
    );
    const cooldownMs = clampInt(
      style.cooldownMs,
      30,
      2000,
      DEFAULT_CONFIG.threeGlitchSpectrum.cooldownMs,
    );

    uniforms.u_freqReversed.value = style.freqReversed ? 1 : 0;
    uniforms.u_scanlineOpacity.value = scanlineOpacity / 100;
    if (style.baseColor) {
      uniforms.u_baseColor.value.copy(
        hexToColor(style.baseColor, DEFAULT_CONFIG.threeGlitchSpectrum.baseColor),
      );
    }
    if (spectrum?.spectrumTexture) {
      uniforms.u_spectrum.value = spectrum.spectrumTexture;
    }

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;
    const peakPercent = Number.isFinite(peak) ? peak * 100 : 0;
    const now = performance.now();

    if (peakPercent >= triggerThreshold && now - lastBurstMs >= cooldownMs) {
      lastBurstMs = now;
      glitchPulse = 1;
      const { glitchEffect } = composerBundle;
      glitchEffect.time = glitchEffect.breakPoint.x + 0.001;
      glitchEffect.breakPoint.y = 0.05 + (glitchIntensity / 100) * 0.16;
    }

    glitchPulse = Math.max(0, glitchPulse - safeDt * 6.5);

    const { glitchEffect, scanlineEffect } = composerBundle;
    const intensityNorm = glitchIntensity / 100;
    const pulse = glitchPulse * intensityNorm;
    const rgbScale = rgbSplitPx > 0 ? rgbSplitPx / 12 : 0;
    glitchEffect.strength.set(
      0.08 + pulse * 0.35 * (1 + rgbScale * 0.4),
      0.25 + pulse * 0.95 * (1 + rgbScale * 0.65),
    );
    glitchEffect.columns = 0.04 + intensityNorm * 0.08;
    glitchEffect.ratio = 0.72 + intensityNorm * 0.12;
    scanlineEffect.blendMode.setOpacity(scanlineOpacity / 100);

    renderer.setClearColor(0x000000, 0);
    try {
      composerBundle.composer.render(safeDt);
    } catch (err) {
      console.warn("[WaveDance] 故障频谱后处理渲染失败，回退直绘", err);
      disposeComposer(composerBundle.composer);
      composerBundle = null;
      lastComposerKey = "";
      rebuildComposer();
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composerBundle?.composer);
    composerBundle = null;
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
    clock.stop();
  }

  return { render, dispose };
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
