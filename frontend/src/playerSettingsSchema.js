import { clampInt, readWindowStorageString, writeWindowStorageString } from "./visualizationSchema.js";
import { normalizeHexColor } from "./lyricsSettingsSchema.js";

export const PLAYER_WINDOW_LABEL = "music-player";

export const DEFAULT_PLAYER_WINDOW_CONFIG = {
  bgColor: "#080a12",
  bgAlphaPercent: 72,
  blurEnabled: true,
};

function hexToRgb(hex) {
  const h = normalizeHexColor(hex, "#080a12").slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return value === "true" || value === "1";
}

export function normalizePlayerWindowConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    bgColor: normalizeHexColor(src.bgColor, DEFAULT_PLAYER_WINDOW_CONFIG.bgColor),
    bgAlphaPercent: clampInt(
      src.bgAlphaPercent ?? src.bgAlpha ?? DEFAULT_PLAYER_WINDOW_CONFIG.bgAlphaPercent,
      0,
      100,
    ),
    blurEnabled:
      typeof src.blurEnabled === "boolean"
        ? src.blurEnabled
        : DEFAULT_PLAYER_WINDOW_CONFIG.blurEnabled,
  };
}

export function readPlayerWindowConfig(ls, windowLabel = PLAYER_WINDOW_LABEL) {
  const savedColor = readWindowStorageString(ls, windowLabel, "mainBgColor");
  const savedAlpha = readWindowStorageString(ls, windowLabel, "mainBgAlpha");
  const savedBlur = readWindowStorageString(ls, windowLabel, "overlayBlur");
  return normalizePlayerWindowConfig({
    bgColor: /^#[0-9A-Fa-f]{6}$/.test(savedColor ?? "") ? savedColor.toLowerCase() : undefined,
    bgAlphaPercent: savedAlpha,
    blurEnabled: parseBoolean(savedBlur, DEFAULT_PLAYER_WINDOW_CONFIG.blurEnabled),
  });
}

export function writePlayerWindowConfig(ls, windowLabel, config) {
  const normalized = normalizePlayerWindowConfig(config);
  writeWindowStorageString(ls, windowLabel, "mainBgColor", normalized.bgColor);
  writeWindowStorageString(ls, windowLabel, "mainBgAlpha", String(normalized.bgAlphaPercent));
  writeWindowStorageString(ls, windowLabel, "overlayBlur", String(normalized.blurEnabled));
  return normalized;
}

export function buildPlayerStyleEventPayload(windowLabel, config) {
  const normalized = normalizePlayerWindowConfig(config);
  return {
    label: windowLabel,
    color: normalized.bgColor,
    alpha: normalized.bgAlphaPercent / 100,
    blurEnabled: normalized.blurEnabled,
  };
}

/** @param {HTMLElement | null} appEl @param {ReturnType<typeof normalizePlayerWindowConfig>} config */
export function applyPlayerWindowStyle(appEl, config) {
  if (!appEl) return;
  const normalized = normalizePlayerWindowConfig(config);
  const { r, g, b } = hexToRgb(normalized.bgColor);
  const alpha = normalized.bgAlphaPercent / 100;
  appEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
