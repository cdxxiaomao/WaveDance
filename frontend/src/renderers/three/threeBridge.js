import { createThreeContext } from "./threeContext.js";
import { createThreeModeRenderer, hasThreeMode } from "./threeModeRegistry.js";
import { buildSpectrumUniforms, disposeSpectrumUniformsCache } from "./spectrumUniforms.js";
import { processSpectrumPoints } from "../shapePipeline.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";
import { createCoverTextureLoader } from "./coverTextureLoader.js";

/**
 * Three.js 渲染桥接层：管理 context、模式切换与 dispose。
 * @returns {{
 *   init: (canvas: HTMLCanvasElement) => void,
 *   setMode: (modeId: string) => void,
 *   render: (points: number[], shapeConfig: object, styleConfig: object, frameMeta: object) => void,
 *   resize: (width: number, height: number) => void,
 *   dispose: () => void,
 *   isActive: () => boolean,
 *   getActiveMode: () => string | null,
 *   getCoverTextureLoader: () => import('./coverTextureLoader.js').ReturnType<typeof createCoverTextureLoader>,
 * }}
 */
export function createThreeBridge() {
  /** @type {import('./threeContext.js').ThreeContext | null} */
  let ctx = null;
  /** @type {{ render: Function, dispose: Function } | null} */
  let activeRenderer = null;
  /** @type {string | null} */
  let activeModeId = null;
  const easedState = [];
  const warnedModes = new Set();
  /** @type {ReturnType<typeof createCoverTextureLoader> | null} */
  let coverTextureLoader = null;
  let lastCoverTickMs = 0;

  function init(canvas) {
    if (ctx) return;
    ctx = createThreeContext(canvas);
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
    ctx.resize(w, h);
  }

  function setMode(modeId) {
    const next = String(modeId ?? "");
    if (next === activeModeId && activeRenderer) return;

    if (activeRenderer) {
      activeRenderer.dispose();
      activeRenderer = null;
    }

    if (ctx?.scene) {
      while (ctx.scene.children.length > 0) {
        ctx.scene.remove(ctx.scene.children[0]);
      }
    }

    activeModeId = next;

    if (!hasThreeMode(next)) {
      if (!warnedModes.has(next)) {
        console.warn(`[WaveDance] Three 模式「${next}」尚未实现，保持空白`);
        warnedModes.add(next);
      }
      return;
    }

    if (!ctx) {
      console.warn("[WaveDance] threeBridge 未初始化，无法创建 Three renderer");
      return;
    }

    activeRenderer = createThreeModeRenderer(next, ctx);
    if (!activeRenderer) {
      console.error(`[WaveDance] 创建 Three renderer 失败：${next}`);
    }
  }

  function ensureCoverTextureLoader() {
    if (!coverTextureLoader) {
      coverTextureLoader = createCoverTextureLoader();
    }
    return coverTextureLoader;
  }

  function syncCoverTextures(frameMeta, styleConfig) {
    const loader = ensureCoverTextureLoader();
    const cover = frameMeta?.cover;
    const coverResolution = styleConfig?.coverResolution ?? frameMeta?.coverResolution ?? 1.0;
    if (cover) {
      loader.update(cover, coverResolution);
    }

    const now = performance.now();
    const dt = lastCoverTickMs > 0 ? (now - lastCoverTickMs) / 1000 : 0;
    lastCoverTickMs = now;
    loader.tick(dt);
    return { loader, coverResolution };
  }

  function render(points, shapeConfig, styleConfig, frameMeta) {
    if (!ctx) return;

    const { loader, coverResolution } = syncCoverTextures(frameMeta, styleConfig);

    if (!activeRenderer) {
      ctx.renderer.setClearColor(0x000000, 0);
      ctx.renderer.clear();
      return;
    }

    const shape = shapeConfig ?? DEFAULT_CONFIG.line.shape;
    const processed = processSpectrumPoints(points, shape, easedState);
    const spectrum = buildSpectrumUniforms(processed);

    activeRenderer.render(points, shapeConfig, styleConfig, {
      ...(frameMeta ?? {}),
      coverTextures: loader.getTextures(),
      coverResolution,
    }, spectrum, processed);
  }

  function resize(width, height) {
    ctx?.resize(width, height);
  }

  function clear() {
    if (!ctx) return;
    ctx.renderer.setClearColor(0x000000, 0);
    ctx.renderer.clear(true, true, true);
  }

  function dispose() {
    if (activeRenderer) {
      activeRenderer.dispose();
      activeRenderer = null;
    }
    if (coverTextureLoader) {
      coverTextureLoader.dispose();
      coverTextureLoader = null;
    }
    lastCoverTickMs = 0;
    if (ctx) {
      ctx.dispose();
      ctx = null;
    }
    disposeSpectrumUniformsCache();
    activeModeId = null;
    easedState.length = 0;
    warnedModes.clear();
  }

  function isActive() {
    return ctx !== null;
  }

  function getActiveMode() {
    return activeModeId;
  }

  function hasActiveRenderer() {
    return activeRenderer !== null;
  }

  function getCoverTextureLoader() {
    return ensureCoverTextureLoader();
  }

  return {
    init,
    setMode,
    render,
    resize,
    clear,
    dispose,
    isActive,
    getActiveMode,
    hasActiveRenderer,
    getCoverTextureLoader,
  };
}
