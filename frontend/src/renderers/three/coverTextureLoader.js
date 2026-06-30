import * as THREE from "three";
import { convertFileSrc } from "@tauri-apps/api/core";
import { buildEdgeAndDepth } from "./coverParticle/coverEdgeProcessor.js";

const DEFAULT_COLOR_MIX_MS = 1400;
const LOG_PREFIX = "[WaveDance] coverTextureLoader";

/**
 * @typedef {Object} CoverArtState
 * @property {boolean} active
 * @property {string} title
 * @property {string} artist
 * @property {string} artworkPath
 * @property {number} artworkRevision
 * @property {string} [artworkDataUrl]
 */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * @param {unknown} state
 * @returns {CoverArtState}
 */
export function normalizeCoverArtState(state) {
  const s = state && typeof state === "object" ? state : {};
  return {
    active: Boolean(s.active),
    title: typeof s.title === "string" ? s.title.trim() : "",
    artist: typeof s.artist === "string" ? s.artist.trim() : "",
    artworkPath: typeof s.artworkPath === "string" ? s.artworkPath.trim() : "",
    artworkRevision: Number(s.artworkRevision) || 0,
    artworkDataUrl: typeof s.artworkDataUrl === "string" ? s.artworkDataUrl : "",
  };
}

/** @param {number} v 0.75~1.55 */
export function coverTextureSizeForResolution(v) {
  const normalized = clamp(Number(v) || 1, 0.75, 1.55);
  if (normalized >= 1.32) return 512;
  if (normalized >= 1.1) return 384;
  return 256;
}

/**
 * 居中裁成正方形 Canvas。
 * @param {CanvasImageSource} img
 * @param {number} size
 */
export function makeSquareCoverCanvas(img, size) {
  const cv = document.createElement("canvas");
  const s = Math.max(1, Math.floor(size));
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;

  const srcW = "naturalWidth" in img ? img.naturalWidth || img.width || 1 : img.width || 1;
  const srcH = "naturalHeight" in img ? img.naturalHeight || img.height || 1 : img.height || 1;
  const side = Math.min(srcW, srcH);
  const sx = (srcW - side) * 0.5;
  const sy = (srcH - side) * 0.5;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, s, s);
  return cv;
}

/** @param {CoverArtState} state */
function buildArtworkUrl(state) {
  if (!state.artworkPath) return "";
  const base = convertFileSrc(state.artworkPath);
  return `${base}${base.includes("?") ? "&" : "?"}v=${state.artworkRevision}`;
}

/** @param {CoverArtState} state */
function coverStateKey(state) {
  if (!state.active) return "idle";
  return `${state.title}|${state.artist}|${state.artworkPath}|${state.artworkRevision}|${state.artworkDataUrl ? "data" : ""}`;
}

/**
 * @param {HTMLCanvasElement} cv
 */
function createCanvasTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Canvas 尺寸或类型变化时必须重建纹理，否则 glTexSubImage 会溢出（ANGLE/macOS 常见）。
 * @param {THREE.Texture | null} tex
 * @param {HTMLCanvasElement} cv
 * @returns {THREE.CanvasTexture}
 */
function assignCanvasTexture(tex, cv) {
  const prev = tex?.image;
  const needsRecreate =
    !tex ||
    tex instanceof THREE.DataTexture ||
    !(prev instanceof HTMLCanvasElement) ||
    prev.width !== cv.width ||
    prev.height !== cv.height;

  if (needsRecreate) {
    tex?.dispose();
    return createCanvasTexture(cv);
  }

  tex.image = cv;
  tex.needsUpdate = true;
  return /** @type {THREE.CanvasTexture} */ (tex);
}

/**
 * 管理封面纹理生命周期，与 renderer 解耦。
 * @param {{ colorMixDurationMs?: number }} [options]
 */
export function createCoverTextureLoader(options = {}) {
  const colorMixDurationMs = options.colorMixDurationMs ?? DEFAULT_COLOR_MIX_MS;

  /** @type {THREE.CanvasTexture | null} */
  let coverTex = null;
  /** @type {THREE.CanvasTexture | null} */
  let prevCoverTex = null;
  /** @type {THREE.DataTexture | null} */
  let edgeTex = null;
  let hasCover = false;
  let hasDepth = false;
  let colorMixT = 1;
  let applyToken = 0;
  let lastUpdateKey = "";

  function ensureEdgeTex() {
    if (edgeTex?.image instanceof HTMLCanvasElement) return edgeTex;
    const cv = document.createElement("canvas");
    cv.width = 1;
    cv.height = 1;
    edgeTex?.dispose();
    edgeTex = createCanvasTexture(cv);
    return edgeTex;
  }

  function disposeTexture(tex) {
    tex?.dispose();
  }

  function copyCoverToPrev() {
    const img = coverTex?.image;
    if (!(img instanceof HTMLCanvasElement)) return;

    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    cv.getContext("2d")?.drawImage(img, 0, 0);

    if (prevCoverTex) {
      prevCoverTex = assignCanvasTexture(prevCoverTex, cv);
    } else {
      prevCoverTex = createCanvasTexture(cv);
    }
  }

  /** @param {number} token */
  function coverApplyStillCurrent(token) {
    return token === applyToken;
  }

  function applyCoverCanvas(cv, token, logSuffix = "") {
    if (!coverApplyStillCurrent(token)) return false;

    const hadCover = hasCover && coverTex?.image;
    if (hadCover) copyCoverToPrev();

    coverTex = assignCanvasTexture(coverTex, cv);

    try {
      const edgeCv = buildEdgeAndDepth(cv);
      edgeTex = assignCanvasTexture(edgeTex, edgeCv);
      hasDepth = true;
    } catch (err) {
      console.warn(`${LOG_PREFIX}: 边缘纹理生成失败`, err);
      hasDepth = false;
    }

    hasCover = true;
    colorMixT = hadCover && prevCoverTex ? 0 : 1;
    console.info(`${LOG_PREFIX}: 封面加载成功${logSuffix}`);
    return true;
  }

  /** @param {string} reason */
  function setNoCover(reason) {
    hasCover = false;
    hasDepth = false;
    colorMixT = 1;
    disposeTexture(coverTex);
    disposeTexture(prevCoverTex);
    coverTex = null;
    prevCoverTex = null;
    console.info(`${LOG_PREFIX}: 无封面 (${reason})`);
  }

  /**
   * @param {string} dataUrl
   * @param {number} token
   * @param {number} resolution
   * @param {boolean} [isFallback]
   */
  function loadFromDataUrl(dataUrl, token, resolution, isFallback = false) {
    const img = new Image();
    img.onload = () => {
      if (!coverApplyStillCurrent(token)) return;
      const cv = makeSquareCoverCanvas(img, coverTextureSizeForResolution(resolution));
      applyCoverCanvas(cv, token, isFallback ? "（dataUrl fallback）" : "");
    };
    img.onerror = () => {
      if (!coverApplyStillCurrent(token)) return;
      console.warn(`${LOG_PREFIX}: dataUrl 加载失败`);
      setNoCover("dataUrl-failed");
    };
    img.src = dataUrl;
  }

  /**
   * @param {string} url
   * @param {string} fallbackDataUrl
   * @param {number} token
   * @param {number} resolution
   */
  function loadFromUrl(url, fallbackDataUrl, token, resolution) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!coverApplyStillCurrent(token)) return;
      const cv = makeSquareCoverCanvas(img, coverTextureSizeForResolution(resolution));
      applyCoverCanvas(cv, token);
    };
    img.onerror = () => {
      if (!coverApplyStillCurrent(token)) return;
      if (fallbackDataUrl.startsWith("data:")) {
        console.warn(`${LOG_PREFIX}: 路径加载失败，fallback 到 dataUrl`);
        loadFromDataUrl(fallbackDataUrl, token, resolution, true);
        return;
      }
      console.warn(`${LOG_PREFIX}: 封面加载失败`);
      setNoCover("load-failed");
    };
    img.src = url;
  }

  /**
   * @param {CoverArtState} state
   * @param {number} [resolution]
   */
  function update(state, resolution = 1.0) {
    const normalized = normalizeCoverArtState(state);
    const res = clamp(Number(resolution) || 1, 0.75, 1.55);
    const key = `${coverStateKey(normalized)}|${res.toFixed(3)}`;
    if (key === lastUpdateKey) return;
    lastUpdateKey = key;

    applyToken += 1;
    const token = applyToken;

    if (!normalized.active) {
      setNoCover("not-active");
      return;
    }

    const url = buildArtworkUrl(normalized);
    if (url) {
      loadFromUrl(url, normalized.artworkDataUrl, token, res);
      return;
    }

    if (normalized.artworkDataUrl.startsWith("data:")) {
      loadFromDataUrl(normalized.artworkDataUrl, token, res);
      return;
    }

    setNoCover("no-artwork");
  }

  /** @param {number} dt 秒 */
  function tick(dt) {
    if (!hasCover || colorMixT >= 1) return;
    const duration = Math.max(1, colorMixDurationMs);
    colorMixT = Math.min(1, colorMixT + (Math.max(0, dt) * 1000) / duration);
  }

  function getTextures() {
    ensureEdgeTex();
    return {
      coverTex,
      prevCoverTex,
      edgeTex,
      colorMixT,
      hasCover,
      hasDepth,
    };
  }

  function dispose() {
    applyToken += 1;
    disposeTexture(coverTex);
    disposeTexture(prevCoverTex);
    disposeTexture(edgeTex);
    coverTex = null;
    prevCoverTex = null;
    edgeTex = null;
    hasCover = false;
    hasDepth = false;
    colorMixT = 1;
    lastUpdateKey = "";
  }

  return { update, getTextures, tick, dispose };
}
