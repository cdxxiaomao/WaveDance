import * as THREE from "three";

/** @param {WebGL2RenderingContext | WebGLRenderingContext | null} glContext */
function loseWebGlContext(glContext) {
  if (!glContext) return;
  try {
    glContext.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // ignore
  }
}

/**
 * 创建 Three.js 渲染上下文（Scene / Camera / WebGLRenderer）。
 * Three r163+ 需要 WebGL2；与 vanilla（WebGL1）互斥，切换时 dispose 释放上下文。
 * @param {HTMLCanvasElement} canvas
 */
export function createThreeContext(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = true;

  const glContext = renderer.getContext();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 2.5);

  /** @param {number} width CSS 像素宽 */
  /** @param {number} height CSS 像素高 */
  function resize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    renderer.dispose();
    if (typeof renderer.forceContextLoss === "function") {
      renderer.forceContextLoss();
    }
    loseWebGlContext(glContext);
  }

  return { renderer, scene, camera, glContext, resize, dispose };
}

/** @typedef {ReturnType<typeof createThreeContext>} ThreeContext */
