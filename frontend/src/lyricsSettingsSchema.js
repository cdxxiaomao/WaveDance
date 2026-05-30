import { clampInt } from "./visualizationSchema.js";

/** 横向：当前行与预备行上下排列；纵向：竖排文字（古籍式，单字自上而下） */
export const LYRICS_LAYOUT = {
  horizontal: "horizontal",
  vertical: "vertical",
};

export const LYRICS_ALIGN_H = {
  left: "left",
  center: "center",
  right: "right",
};

export const LYRICS_ALIGN_V = {
  top: "top",
  center: "center",
  bottom: "bottom",
};

export const LYRICS_TRANSITION = {
  none: "none",
  crossfade: "crossfade",
  slideUp: "slideUp",
  scaleFade: "scaleFade",
  blur: "blur",
  reveal: "reveal",
};

export const LYRICS_TRANSITION_OPTIONS = [
  { id: LYRICS_TRANSITION.none, label: "无（即时切换）" },
  { id: LYRICS_TRANSITION.crossfade, label: "交叉淡入淡出" },
  { id: LYRICS_TRANSITION.slideUp, label: "上滑接力" },
  { id: LYRICS_TRANSITION.scaleFade, label: "缩放强调" },
  { id: LYRICS_TRANSITION.blur, label: "模糊过渡" },
  { id: LYRICS_TRANSITION.reveal, label: "逐字显现" },
];

export const LYRICS_FONT_PRESETS = [
  { id: "system", label: "系统默认", value: 'system-ui, -apple-system, "PingFang SC", "Helvetica Neue", sans-serif' },
  { id: "pingfang", label: "苹方", value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "songti", label: "宋体", value: '"Songti SC", "STSong", serif' },
  { id: "heiti", label: "黑体", value: '"Heiti SC", "STHeiti", "Microsoft YaHei", sans-serif' },
  { id: "kaiti", label: "楷体", value: '"Kaiti SC", "STKaiti", serif' },
];

/** @typedef {typeof DEFAULT_LYRICS_WINDOW_CONFIG} LyricsWindowConfig */

export const DEFAULT_LYRICS_WINDOW_CONFIG = {
  fontPresetId: "system",
  fontFamily: LYRICS_FONT_PRESETS[0].value,
  currentFontSizePx: 18,
  currentColor: "#edd6ad",
  nextFontSizePx: 14,
  nextColor: "#c4a574",
  alignHorizontal: LYRICS_ALIGN_H.center,
  alignVertical: LYRICS_ALIGN_V.center,
  layout: LYRICS_LAYOUT.horizontal,
  lineHeightPercent: 140,
  blockGapPx: 12,
  transitionEffect: LYRICS_TRANSITION.none,
};

const STORAGE_PREFIX = "wavedance.lyricsWin.";

const FLEX_START = "flex-start";
const FLEX_CENTER = "center";
const FLEX_END = "flex-end";

function normalizeAlignHorizontal(raw, fallback) {
  const s = String(raw ?? "");
  if (s === LYRICS_ALIGN_H.left || s === LYRICS_ALIGN_H.right) return s;
  return fallback === LYRICS_ALIGN_H.left || fallback === LYRICS_ALIGN_H.right
    ? fallback
    : LYRICS_ALIGN_H.center;
}

function normalizeAlignVertical(raw, fallback) {
  const s = String(raw ?? "");
  if (s === LYRICS_ALIGN_V.top || s === LYRICS_ALIGN_V.bottom) return s;
  return fallback === LYRICS_ALIGN_V.top || fallback === LYRICS_ALIGN_V.bottom
    ? fallback
    : LYRICS_ALIGN_V.center;
}

/** @param {string} value @param {string} [layout] */
function alignHorizontalToFlex(value, layout) {
  const vertical = layout === LYRICS_LAYOUT.vertical;
  if (value === LYRICS_ALIGN_H.left) return vertical ? FLEX_END : FLEX_START;
  if (value === LYRICS_ALIGN_H.right) return vertical ? FLEX_START : FLEX_END;
  return FLEX_CENTER;
}

function alignVerticalToFlex(value) {
  if (value === LYRICS_ALIGN_V.top) return FLEX_START;
  if (value === LYRICS_ALIGN_V.bottom) return FLEX_END;
  return FLEX_CENTER;
}

export function normalizeLyricsWindowLabel(label) {
  const s = String(label ?? "").trim();
  if (s.startsWith("lyrics-")) return s;
  return "";
}

function storageKey(windowLabel) {
  const id = normalizeLyricsWindowLabel(windowLabel);
  if (!id) return null;
  return `${STORAGE_PREFIX}${id}.config`;
}

export function normalizeHexColor(input, fallback) {
  const s = String(input ?? "").trim();
  const body = s.startsWith("#") ? s.slice(1) : s;
  if (body.length === 6 && /^[0-9a-fA-F]{6}$/.test(body)) {
    return `#${body.toLowerCase()}`;
  }
  return fallback;
}

/** @param {unknown} raw */
export function normalizeLyricsWindowConfig(raw) {
  const base = { ...DEFAULT_LYRICS_WINDOW_CONFIG };
  if (!raw || typeof raw !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (raw);

  const presetId = typeof o.fontPresetId === "string" ? o.fontPresetId : base.fontPresetId;
  const preset = LYRICS_FONT_PRESETS.find((p) => p.id === presetId) ?? LYRICS_FONT_PRESETS[0];
  base.fontPresetId = preset.id;
  base.fontFamily =
    typeof o.fontFamily === "string" && o.fontFamily.trim() ? o.fontFamily.trim() : preset.value;

  base.currentFontSizePx = clampInt(o.currentFontSizePx, 10, 48);
  base.nextFontSizePx = clampInt(o.nextFontSizePx, 8, 36);
  base.currentColor = normalizeHexColor(o.currentColor, base.currentColor);
  base.nextColor = normalizeHexColor(o.nextColor, base.nextColor);

  if (typeof o.alignHorizontal === "string" || typeof o.alignVertical === "string") {
    base.alignHorizontal = normalizeAlignHorizontal(o.alignHorizontal, base.alignHorizontal);
    base.alignVertical = normalizeAlignVertical(o.alignVertical, base.alignVertical);
  } else {
    const legacy = String(o.textAlign ?? "");
    base.alignHorizontal = normalizeAlignHorizontal(legacy, base.alignHorizontal);
    base.alignVertical = LYRICS_ALIGN_V.center;
  }

  const layout = String(o.layout ?? "");
  base.layout = layout === LYRICS_LAYOUT.vertical ? LYRICS_LAYOUT.vertical : LYRICS_LAYOUT.horizontal;

  base.lineHeightPercent = clampInt(o.lineHeightPercent, 100, 250);
  base.blockGapPx = clampInt(o.blockGapPx, 0, 48);

  const transition = String(o.transitionEffect ?? "");
  const allowed = new Set(LYRICS_TRANSITION_OPTIONS.map((item) => item.id));
  base.transitionEffect = allowed.has(transition) ? transition : base.transitionEffect;

  return base;
}

/** @param {Storage} ls @param {string} windowLabel */
export function readLyricsWindowConfig(ls, windowLabel) {
  const key = storageKey(windowLabel);
  if (!key) return { ...DEFAULT_LYRICS_WINDOW_CONFIG };
  try {
    const raw = ls.getItem(key);
    if (!raw) return { ...DEFAULT_LYRICS_WINDOW_CONFIG };
    return normalizeLyricsWindowConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_LYRICS_WINDOW_CONFIG };
  }
}

/** @param {Storage} ls @param {string} windowLabel @param {LyricsWindowConfig} config */
export function writeLyricsWindowConfig(ls, windowLabel, config) {
  const key = storageKey(windowLabel);
  if (!key) return;
  ls.setItem(key, JSON.stringify(normalizeLyricsWindowConfig(config)));
}

/**
 * 解析样式事件 payload，仅当 windowLabel 与当前窗一致时返回配置。
 * @param {unknown} payload
 * @param {string} expectedLabel
 * @returns {LyricsWindowConfig | null}
 */
export function parseLyricsStyleEventPayload(payload, expectedLabel) {
  const label = normalizeLyricsWindowLabel(expectedLabel);
  if (!label) return null;
  if (!payload || typeof payload !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (payload);
  if (typeof o.windowLabel === "string") {
    if (normalizeLyricsWindowLabel(o.windowLabel) !== label) return null;
    return normalizeLyricsWindowConfig(o.config);
  }
  return null;
}

/** @param {string} windowLabel @param {LyricsWindowConfig} config */
export function buildLyricsStyleEventPayload(windowLabel, config) {
  return {
    windowLabel: normalizeLyricsWindowLabel(windowLabel),
    config: normalizeLyricsWindowConfig(config),
  };
}

/** @param {HTMLElement | null} root @param {LyricsWindowConfig} config */
export function applyLyricsWindowStyle(root, config) {
  if (!root) return;
  const c = normalizeLyricsWindowConfig(config);
  root.style.setProperty("--lyrics-font-family", c.fontFamily);
  root.style.setProperty("--lyrics-current-size", `${c.currentFontSizePx}px`);
  root.style.setProperty("--lyrics-current-color", c.currentColor);
  root.style.setProperty("--lyrics-next-size", `${c.nextFontSizePx}px`);
  root.style.setProperty("--lyrics-next-color", c.nextColor);
  root.style.setProperty("--lyrics-text-align", c.alignHorizontal);
  root.style.setProperty("--lyrics-line-height", String(c.lineHeightPercent / 100));
  root.style.setProperty("--lyrics-block-gap", `${c.blockGapPx}px`);

  const hFlex = alignHorizontalToFlex(c.alignHorizontal, c.layout);
  const vFlex = alignVerticalToFlex(c.alignVertical);
  if (c.layout === LYRICS_LAYOUT.horizontal) {
    root.style.setProperty("--lyrics-justify-content", vFlex);
    root.style.setProperty("--lyrics-align-items", hFlex);
    root.style.setProperty("--lyrics-align-self", hFlex);
  } else {
    root.style.setProperty("--lyrics-justify-content", hFlex);
    root.style.setProperty("--lyrics-align-items", vFlex);
    root.style.setProperty("--lyrics-align-self", "auto");
  }

  root.classList.toggle("layout-horizontal", c.layout === LYRICS_LAYOUT.horizontal);
  root.classList.toggle("layout-vertical", c.layout === LYRICS_LAYOUT.vertical);
  root.classList.toggle("is-vertical-motion", c.layout === LYRICS_LAYOUT.vertical);
  root.dataset.lyricsTransition = c.transitionEffect;
  root.dataset.textAlign = c.alignHorizontal;
}
