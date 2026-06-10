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
  Pass,
  CopyPass,
} from "postprocessing";

const AFTERIMAGE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const AFTERIMAGE_FRAGMENT = /* glsl */ `
precision highp float;

uniform float damp;
uniform float darkDecay;
uniform sampler2D tOld;
uniform sampler2D tNew;
varying vec2 vUv;

float lum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 old = texture2D(tOld, vUv);
  vec4 neu = texture2D(tNew, vUv);
  float oLum = lum(old.rgb);
  float decay = mix(damp * darkDecay, damp, smoothstep(0.0, 0.14, oLum));
  old.rgb *= decay;
  old.a *= mix(damp * darkDecay * 0.55, damp, smoothstep(0.0, 0.1, oLum));
  gl_FragColor = max(old, neu);
}
`;

/** 余辉衰减百分比（10~90，低=长拖尾）→ damp 系数 */
export function decayPercentToDamp(decayPercent) {
  const t = (Math.min(90, Math.max(10, Math.round(Number(decayPercent) || 55))) - 10) / 80;
  return 0.985 - t * 0.205;
}

/**
 * 磷光余辉反馈 Pass：混合上一帧残影与当前帧，暗部更快衰减。
 */
export class AfterimagePass extends Pass {
  constructor() {
    super("AfterimagePass");
    this.needsSwap = true;
    this.uniforms = {
      damp: { value: decayPercentToDamp(55) },
      darkDecay: { value: 0.42 },
      tOld: { value: null },
      tNew: { value: null },
    };
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: AFTERIMAGE_VERTEX,
      fragmentShader: AFTERIMAGE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.feedbackCopyPass = new CopyPass(undefined, true);
    this.blendTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      stencilBuffer: false,
      depthBuffer: false,
    });
    this.blendTarget.texture.name = "AfterimagePass.Blend";
    this.outputCopyPass = new CopyPass(undefined, true);
  }

  /** @param {number} decayPercent */
  setDecayPercent(decayPercent) {
    this.uniforms.damp.value = decayPercentToDamp(decayPercent);
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget | null} inputBuffer
   * @param {import('three').WebGLRenderTarget | null} outputBuffer
   */
  render(renderer, inputBuffer, outputBuffer) {
    if (!inputBuffer) return;

    this.uniforms.tNew.value = inputBuffer.texture;
    this.uniforms.tOld.value = this.feedbackCopyPass.texture;

    const dest = this.renderToScreen ? this.blendTarget : outputBuffer;
    renderer.setRenderTarget(dest);
    renderer.render(this.scene, this.camera);

    this.feedbackCopyPass.render(renderer, dest, null);

    if (this.renderToScreen) {
      this.needsSwap = false;
      this.outputCopyPass.renderToScreen = true;
      this.outputCopyPass.render(renderer, this.blendTarget, null);
    } else {
      this.needsSwap = true;
    }
  }

  /** @param {number} width @param {number} height */
  setSize(width, height) {
    this.feedbackCopyPass.setSize(width, height);
    this.blendTarget.setSize(width, height);
    this.outputCopyPass.setSize(width, height);
  }

  dispose() {
    this.fullscreenMaterial?.dispose();
    this.feedbackCopyPass.dispose();
    this.blendTarget.dispose();
    this.outputCopyPass.dispose();
  }
}

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
 * 磷光余辉后处理链：RenderPass → AfterimagePass → 可选 Bloom。
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {{ decayPercent?: number, bloomEnabled?: boolean, bloomStrength?: number }} [options]
 */
export function createPhosphorTrailComposer(renderer, scene, camera, options = {}) {
  const composer = createBasicComposer(renderer, scene, camera);
  const afterimagePass = new AfterimagePass();
  afterimagePass.setDecayPercent(options.decayPercent ?? 55);
  composer.addPass(afterimagePass);

  /** @type {BloomEffect | null} */
  let bloomEffect = null;
  if (options.bloomEnabled !== false) {
    bloomEffect = new BloomEffect({
      intensity: options.bloomStrength ?? 0.9,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.35,
      mipmapBlur: true,
    });
    composer.addPass(new EffectPass(camera, bloomEffect));
  }

  return { composer, afterimagePass, bloomEffect };
}

/**
 * @param {EffectComposer} composer
 * @param {AfterimagePass | null | undefined} afterimagePass
 */
export function disposeComposer(composer, afterimagePass) {
  afterimagePass?.dispose();
  composer?.dispose();
}
