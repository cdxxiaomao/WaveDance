/** @typedef {{ colorLow: string, colorMid: string, colorHigh: string, groundColor: string }} SoundFieldTheme */

/** @type {Record<string, SoundFieldTheme>} */
export const SOUND_FIELD_THEMES = {
  indigo: {
    colorLow: "#1a1a2e",
    colorMid: "#4a4580",
    colorHigh: "#8f7cff",
    groundColor: "#0a0a12",
  },
  ocean: {
    colorLow: "#0c1929",
    colorMid: "#1e4d6b",
    colorHigh: "#38bdf8",
    groundColor: "#060d14",
  },
  ember: {
    colorLow: "#1a0f0a",
    colorMid: "#7c2d12",
    colorHigh: "#fb923c",
    groundColor: "#0a0604",
  },
};

/** @param {string} themeId */
export function normalizeSoundFieldThemeId(themeId) {
  const id = String(themeId ?? "").trim();
  return id in SOUND_FIELD_THEMES ? id : "indigo";
}

/**
 * @param {{ themeId?: string, colorLow?: string, colorMid?: string, colorHigh?: string, groundColor?: string }} style
 * @param {import('../../../visualizationSchema.js').typeof import('../../../visualizationSchema.js').DEFAULT_CONFIG.threeSoundField} [cfgDefaults]
 */
export function resolveSoundFieldColors(style, cfgDefaults) {
  const themeId = normalizeSoundFieldThemeId(style?.themeId);
  const theme = SOUND_FIELD_THEMES[themeId];
  const fallback = cfgDefaults ?? SOUND_FIELD_THEMES.indigo;
  return {
    themeId,
    colorLow: pickHex(style?.colorLow, theme.colorLow, fallback.colorLow),
    colorMid: pickHex(style?.colorMid, theme.colorMid, fallback.colorMid),
    colorHigh: pickHex(style?.colorHigh, theme.colorHigh, fallback.colorHigh),
    groundColor: pickHex(style?.groundColor, theme.groundColor, fallback.groundColor),
  };
}

/** @param {unknown} value @param {string} themed @param {string} fallback */
function pickHex(value, themed, fallback) {
  const raw = typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : themed;
  return /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : fallback;
}
