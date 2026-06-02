import { clampInt } from "./visualizationSchema.js";
import {
  LYRICS_ALIGN_H,
  LYRICS_ALIGN_V,
  LYRICS_FONT_PRESETS,
  LYRICS_LAYOUT,
  normalizeHexColor,
} from "./lyricsSettingsSchema.js";

/** @typedef {typeof DEFAULT_SONGINFO_WINDOW_CONFIG} SongInfoWindowConfig */

export const DEFAULT_SONGINFO_WINDOW_CONFIG = {
  fontPresetId: "system",
  fontFamily: LYRICS_FONT_PRESETS[0].value,
  titleFontSizePx: 20,
  titleColor: "#edd6ad",
  artistFontSizePx: 16,
  artistColor: "#c4a574",
  albumFontSizePx: 14,
  albumColor: "#9a8f7a",
  alignHorizontal: LYRICS_ALIGN_H.center,
  alignVertical: LYRICS_ALIGN_V.center,
  layout: LYRICS_LAYOUT.horizontal,
  lineHeightPercent: 140,
  blockGapPx: 10,
};

const STORAGE_PREFIX = "wavedance.songinfoWin.";

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

export function normalizeSongInfoWindowLabel(label) {
  const s = String(label ?? "").trim();
  if (s.startsWith("songinfo-")) return s;
  return "";
}

function storageKey(windowLabel) {
  const id = normalizeSongInfoWindowLabel(windowLabel);
  if (!id) return null;
  return `${STORAGE_PREFIX}${id}.config`;
}

/** @param {unknown} raw */
export function normalizeSongInfoWindowConfig(raw) {
  const base = { ...DEFAULT_SONGINFO_WINDOW_CONFIG };
  if (!raw || typeof raw !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (raw);

  const presetId = typeof o.fontPresetId === "string" ? o.fontPresetId : base.fontPresetId;
  const preset = LYRICS_FONT_PRESETS.find((p) => p.id === presetId) ?? LYRICS_FONT_PRESETS[0];
  base.fontPresetId = preset.id;
  base.fontFamily =
    typeof o.fontFamily === "string" && o.fontFamily.trim() ? o.fontFamily.trim() : preset.value;

  base.titleFontSizePx = clampInt(o.titleFontSizePx, 10, 48);
  base.artistFontSizePx = clampInt(o.artistFontSizePx, 8, 36);
  base.albumFontSizePx = clampInt(o.albumFontSizePx, 8, 36);
  base.titleColor = normalizeHexColor(o.titleColor, base.titleColor);
  base.artistColor = normalizeHexColor(o.artistColor, base.artistColor);
  base.albumColor = normalizeHexColor(o.albumColor, base.albumColor);

  base.alignHorizontal = normalizeAlignHorizontal(o.alignHorizontal, base.alignHorizontal);
  base.alignVertical = normalizeAlignVertical(o.alignVertical, base.alignVertical);

  const layout = String(o.layout ?? "");
  base.layout = layout === LYRICS_LAYOUT.vertical ? LYRICS_LAYOUT.vertical : LYRICS_LAYOUT.horizontal;

  base.lineHeightPercent = clampInt(o.lineHeightPercent, 85, 250);
  base.blockGapPx = clampInt(o.blockGapPx, 0, 48);

  return base;
}

/** @param {Storage} ls @param {string} windowLabel */
export function readSongInfoWindowConfig(ls, windowLabel) {
  const key = storageKey(windowLabel);
  if (!key) return { ...DEFAULT_SONGINFO_WINDOW_CONFIG };
  try {
    const raw = ls.getItem(key);
    if (!raw) return { ...DEFAULT_SONGINFO_WINDOW_CONFIG };
    return normalizeSongInfoWindowConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SONGINFO_WINDOW_CONFIG };
  }
}

/** @param {Storage} ls @param {string} windowLabel @param {SongInfoWindowConfig} config */
export function writeSongInfoWindowConfig(ls, windowLabel, config) {
  const key = storageKey(windowLabel);
  if (!key) return;
  ls.setItem(key, JSON.stringify(normalizeSongInfoWindowConfig(config)));
}

/**
 * @param {unknown} payload
 * @param {string} expectedLabel
 * @returns {SongInfoWindowConfig | null}
 */
export function parseSongInfoStyleEventPayload(payload, expectedLabel) {
  const label = normalizeSongInfoWindowLabel(expectedLabel);
  if (!label) return null;
  if (!payload || typeof payload !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (payload);
  if (typeof o.windowLabel === "string") {
    if (normalizeSongInfoWindowLabel(o.windowLabel) !== label) return null;
    return normalizeSongInfoWindowConfig(o.config);
  }
  return null;
}

/** @param {string} windowLabel @param {SongInfoWindowConfig} config */
export function buildSongInfoStyleEventPayload(windowLabel, config) {
  return {
    windowLabel: normalizeSongInfoWindowLabel(windowLabel),
    config: normalizeSongInfoWindowConfig(config),
  };
}

/** @param {HTMLElement | null} root @param {SongInfoWindowConfig} config */
export function applySongInfoWindowStyle(root, config) {
  if (!root) return;
  const c = normalizeSongInfoWindowConfig(config);
  root.style.setProperty("--songinfo-font-family", c.fontFamily);
  root.style.setProperty("--songinfo-title-size", `${c.titleFontSizePx}px`);
  root.style.setProperty("--songinfo-title-color", c.titleColor);
  root.style.setProperty("--songinfo-artist-size", `${c.artistFontSizePx}px`);
  root.style.setProperty("--songinfo-artist-color", c.artistColor);
  root.style.setProperty("--songinfo-album-size", `${c.albumFontSizePx}px`);
  root.style.setProperty("--songinfo-album-color", c.albumColor);
  root.style.setProperty("--songinfo-text-align", c.alignHorizontal);
  root.style.setProperty("--songinfo-line-height", String(c.lineHeightPercent / 100));
  root.style.setProperty("--songinfo-block-gap", `${c.blockGapPx}px`);

  const hFlex = alignHorizontalToFlex(c.alignHorizontal, c.layout);
  const vFlex = alignVerticalToFlex(c.alignVertical);
  if (c.layout === LYRICS_LAYOUT.horizontal) {
    root.style.setProperty("--songinfo-justify-content", vFlex);
    root.style.setProperty("--songinfo-align-items", hFlex);
    root.style.setProperty("--songinfo-align-self", hFlex);
  } else {
    root.style.setProperty("--songinfo-justify-content", hFlex);
    root.style.setProperty("--songinfo-align-items", vFlex);
    root.style.setProperty("--songinfo-align-self", "auto");
  }

  root.classList.toggle("layout-horizontal", c.layout === LYRICS_LAYOUT.horizontal);
  root.classList.toggle("layout-vertical", c.layout === LYRICS_LAYOUT.vertical);
  root.dataset.textAlign = c.alignHorizontal;
  root.dataset.verticalAlign = c.alignVertical;
}
