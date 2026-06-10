import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";

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
 * @param {EffectComposer} composer
 */
export function disposeComposer(composer) {
  composer?.dispose();
}
