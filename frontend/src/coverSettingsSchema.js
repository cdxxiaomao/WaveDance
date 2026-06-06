import { clampInt } from "./visualizationSchema.js";
import { normalizeHexColor } from "./lyricsSettingsSchema.js";

/** @typedef {typeof DEFAULT_COVER_WINDOW_CONFIG} CoverWindowConfig */

export const DEFAULT_COVER_WINDOW_CONFIG = {
  borderEnabled: true,
  borderSizePx: 1,
  borderColor: "#c4a574",
  borderOpacity: 28,
  borderRadiusPercent: 4,
  shadowAngleDeg: 90,
  shadowBlurPx: 24,
  shadowColor: "#000000",
  shadowOpacity: 35,
  rotationEnabled: false,
  rotationSpeed: 30,
};

const STORAGE_PREFIX = "wavedance.coverWin.";

export function normalizeCoverWindowLabel(label) {
  const s = String(label ?? "").trim();
  if (s.startsWith("cover-")) return s;
  return "";
}

function storageKey(windowLabel) {
  const id = normalizeCoverWindowLabel(windowLabel);
  if (!id) return null;
  return `${STORAGE_PREFIX}${id}.config`;
}

function hexToRgba(hex, alpha) {
  const h = normalizeHexColor(hex, "#000000").slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function coverShadowOffset(config) {
  const blur = config.shadowBlurPx;
  if (blur <= 0) return { ox: 0, oy: 0, blur: 0 };
  const distance = Math.max(1, Math.round(blur * 0.25));
  const rad = (config.shadowAngleDeg * Math.PI) / 180;
  return {
    ox: Math.round(Math.cos(rad) * distance),
    oy: Math.round(Math.sin(rad) * distance),
    blur,
  };
}

function buildCoverBoxShadow(config) {
  const { ox, oy, blur } = coverShadowOffset(config);
  if (blur <= 0) return "none";
  const color = hexToRgba(config.shadowColor, config.shadowOpacity / 100);
  return `${ox}px ${oy}px ${blur}px ${color}`;
}

/** 阴影在各方向所需留白，避免被窗口裁切 */
export function computeCoverShadowInset(config) {
  const { ox, oy, blur } = coverShadowOffset(normalizeCoverWindowConfig(config));
  if (blur <= 0) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return {
    top: blur + Math.max(0, -oy),
    right: blur + Math.max(0, ox),
    bottom: blur + Math.max(0, oy),
    left: blur + Math.max(0, -ox),
  };
}

/** @param {HTMLElement | null} body @param {CoverWindowConfig} config */
export function applyCoverShadowInset(body, config) {
  if (!body) return;
  const inset = computeCoverShadowInset(config);
  const uniform = Math.max(inset.top, inset.right, inset.bottom, inset.left);
  body.style.setProperty("--cover-shadow-inset-top", `${uniform}px`);
  body.style.setProperty("--cover-shadow-inset-right", `${uniform}px`);
  body.style.setProperty("--cover-shadow-inset-bottom", `${uniform}px`);
  body.style.setProperty("--cover-shadow-inset-left", `${uniform}px`);
}

/** @param {unknown} raw */
export function normalizeCoverWindowConfig(raw) {
  const base = { ...DEFAULT_COVER_WINDOW_CONFIG };
  if (!raw || typeof raw !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (raw);

  base.borderEnabled = o.borderEnabled !== false;
  base.borderSizePx = clampInt(o.borderSizePx, 0, 12);
  base.borderColor = normalizeHexColor(o.borderColor, base.borderColor);
  base.borderOpacity = clampInt(o.borderOpacity, 0, 100);
  if (typeof o.borderRadiusPercent === "number") {
    base.borderRadiusPercent = clampInt(o.borderRadiusPercent, 0, 50);
  } else if (typeof o.borderRadiusPx === "number") {
    base.borderRadiusPercent = clampInt(Math.round((Number(o.borderRadiusPx) / 240) * 100), 0, 50);
  }
  base.shadowAngleDeg = clampInt(o.shadowAngleDeg, 0, 359);
  base.shadowBlurPx = clampInt(o.shadowBlurPx, 0, 80);
  base.shadowColor = normalizeHexColor(o.shadowColor, base.shadowColor);
  base.shadowOpacity = clampInt(o.shadowOpacity, 0, 100);
  base.rotationEnabled = o.rotationEnabled === true;
  base.rotationSpeed = clampInt(o.rotationSpeed, 1, 100);

  return base;
}

/** 旋转速度 1–100，数值越大转得越快；返回一圈所需秒数 */
export function coverRotationDurationSec(speed) {
  const s = clampInt(speed, 1, 100);
  return 120 / s;
}

/** @param {Storage} ls @param {string} windowLabel */
export function readCoverWindowConfig(ls, windowLabel) {
  const key = storageKey(windowLabel);
  if (!key) return { ...DEFAULT_COVER_WINDOW_CONFIG };
  try {
    const raw = ls.getItem(key);
    if (!raw) return { ...DEFAULT_COVER_WINDOW_CONFIG };
    return normalizeCoverWindowConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COVER_WINDOW_CONFIG };
  }
}

/** @param {Storage} ls @param {string} windowLabel @param {CoverWindowConfig} config */
export function writeCoverWindowConfig(ls, windowLabel, config) {
  const key = storageKey(windowLabel);
  if (!key) return;
  ls.setItem(key, JSON.stringify(normalizeCoverWindowConfig(config)));
}

/**
 * @param {unknown} payload
 * @param {string} expectedLabel
 * @returns {CoverWindowConfig | null}
 */
export function parseCoverStyleEventPayload(payload, expectedLabel) {
  const label = normalizeCoverWindowLabel(expectedLabel);
  if (!label) return null;
  if (!payload || typeof payload !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (payload);
  if (typeof o.windowLabel === "string") {
    if (normalizeCoverWindowLabel(o.windowLabel) !== label) return null;
    return normalizeCoverWindowConfig(o.config);
  }
  return null;
}

/** @param {string} windowLabel @param {CoverWindowConfig} config */
export function buildCoverStyleEventPayload(windowLabel, config) {
  return {
    windowLabel: normalizeCoverWindowLabel(windowLabel),
    config: normalizeCoverWindowConfig(config),
  };
}

/** @param {HTMLElement | null} frame @param {CoverWindowConfig} config */
export function applyCoverWindowStyle(frame, config) {
  if (!frame) return;
  const c = normalizeCoverWindowConfig(config);

  frame.style.setProperty("--cover-radius", `${c.borderRadiusPercent}%`);

  if (c.borderEnabled && c.borderSizePx > 0) {
    frame.style.setProperty("--cover-border-width", `${c.borderSizePx}px`);
    frame.style.setProperty(
      "--cover-border-color",
      hexToRgba(c.borderColor, c.borderOpacity / 100),
    );
  } else {
    frame.style.setProperty("--cover-border-width", "0");
    frame.style.setProperty("--cover-border-color", "transparent");
  }

  frame.style.setProperty("--cover-box-shadow", buildCoverBoxShadow(c));
  frame.classList.toggle("cover-frame-no-shadow", c.shadowBlurPx <= 0);

  frame.style.setProperty(
    "--cover-rotation-duration",
    `${coverRotationDurationSec(c.rotationSpeed)}s`,
  );
  frame.classList.toggle("cover-rotation-enabled", c.rotationEnabled);
}
