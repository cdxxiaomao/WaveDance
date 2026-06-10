import * as THREE from "three";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  GlitchEffect,
  GlitchMode,
  ScanlineEffect,
  BlendFunction,
} from "postprocessing";

/**
 * 创建基础 EffectComposer（RenderPass only）。
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 */
export function createBasicComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  return composer;
}

/**
 * 创建带 Bloom 的后处理链工厂。
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {{ intensity?: number, luminanceThreshold?: number, luminanceSmoothing?: number, mipmapBlur?: boolean }} [options]
 */
export function createBloomComposer(renderer, scene, camera, options = {}) {
  const composer = createBasicComposer(renderer, scene, camera);
  const bloom = new BloomEffect({
    intensity: options.intensity ?? 1.0,
    luminanceThreshold: options.luminanceThreshold ?? 0.2,
    luminanceSmoothing: options.luminanceSmoothing ?? 0.3,
    mipmapBlur: options.mipmapBlur ?? true,
  });
  composer.addPass(new EffectPass(camera, bloom));
  return composer;
}

/**
 * 故障频谱后处理链：RenderPass → Glitch + Scanline。
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {{ rgbSplitPx?: number }} [options]
 */
export function createGlitchSpectrumComposer(renderer, scene, camera, options = {}) {
  const rgbSplitPx = Math.max(0, Math.min(12, Math.round(Number(options.rgbSplitPx) || 0)));
  const chromaticAberrationOffset = rgbSplitPx > 0 ? new THREE.Vector2(0, 0) : null;

  const composer = createBasicComposer(renderer, scene, camera);
  const glitchEffect = new GlitchEffect({
    chromaticAberrationOffset,
    delay: new THREE.Vector2(90, 180),
    duration: new THREE.Vector2(0.05, 0.14),
    strength: new THREE.Vector2(0.15, 0.85),
    columns: 0.06,
    ratio: 0.78,
  });
  glitchEffect.mode = GlitchMode.SPORADIC;

  const scanlineEffect = new ScanlineEffect({
    blendFunction: BlendFunction.OVERLAY,
    density: 1.35,
    scrollSpeed: 0.06,
  });

  composer.addPass(new EffectPass(camera, glitchEffect, scanlineEffect));
  return { composer, glitchEffect, scanlineEffect, chromaticAberrationOffset };
}

/**
 * @param {EffectComposer} composer
 */
export function disposeComposer(composer) {
  composer?.dispose();
}
