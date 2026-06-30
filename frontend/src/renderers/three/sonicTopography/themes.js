import * as THREE from "three";

/** @typedef {Object} SonicThemeColors
 * @property {string} id
 * @property {string} name
 * @property {THREE.Color} uBaseColor1
 * @property {THREE.Color} uBaseColor2
 * @property {THREE.Color} uFogColor
 * @property {THREE.Color} uCoolCore
 * @property {THREE.Color} uCoolEdge
 * @property {THREE.Color} uWarmCore
 * @property {THREE.Color} uWarmEdge
 * @property {THREE.Color} uRippleColor
 * @property {number} uGlowIntensity
 */

/** @param {string} hex @param {string} fallback */
function color(hex, fallback) {
  return new THREE.Color(/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback);
}

/** @type {Record<string, SonicThemeColors>} */
const THEMES = {
  "minimal-monochrome": {
    id: "minimal-monochrome",
    name: "极简单色",
    uBaseColor1: color("#3a3a42", "#3a3a42"),
    uBaseColor2: color("#9a9aa8", "#9a9aa8"),
    uFogColor: color("#08080c", "#08080c"),
    uCoolCore: color("#6a7080", "#6a7080"),
    uCoolEdge: color("#b8bcc8", "#b8bcc8"),
    uWarmCore: color("#888890", "#888890"),
    uWarmEdge: color("#d0d0d8", "#d0d0d8"),
    uRippleColor: color("#c8c8d8", "#c8c8d8"),
    uGlowIntensity: 0.55,
  },
  "ink-wash": {
    id: "ink-wash",
    name: "水墨",
    uBaseColor1: color("#2a3038", "#2a3038"),
    uBaseColor2: color("#7a8490", "#7a8490"),
    uFogColor: color("#0a1014", "#0a1014"),
    uCoolCore: color("#4a5a68", "#4a5a68"),
    uCoolEdge: color("#9aacb8", "#9aacb8"),
    uWarmCore: color("#6a5a4a", "#6a5a4a"),
    uWarmEdge: color("#c8b8a0", "#c8b8a0"),
    uRippleColor: color("#a0b8c8", "#a0b8c8"),
    uGlowIntensity: 0.45,
  },
  nocturnal: {
    id: "nocturnal",
    name: "夜行",
    uBaseColor1: color("#1a1a2e", "#1a1a2e"),
    uBaseColor2: color("#4a4580", "#4a4580"),
    uFogColor: color("#060810", "#060810"),
    uCoolCore: color("#3a4a80", "#3a4a80"),
    uCoolEdge: color("#8090d0", "#8090d0"),
    uWarmCore: color("#503a70", "#503a70"),
    uWarmEdge: color("#b090d0", "#b090d0"),
    uRippleColor: color("#8090ff", "#8090ff"),
    uGlowIntensity: 0.65,
  },
  "neon-tokyo": {
    id: "neon-tokyo",
    name: "霓虹东京",
    uBaseColor1: color("#1a0a20", "#1a0a20"),
    uBaseColor2: color("#602060", "#602060"),
    uFogColor: color("#0a0010", "#0a0010"),
    uCoolCore: color("#00c8d8", "#00c8d8"),
    uCoolEdge: color("#80ffff", "#80ffff"),
    uWarmCore: color("#ff2080", "#ff2080"),
    uWarmEdge: color("#ff80c0", "#ff80c0"),
    uRippleColor: color("#ff40a0", "#ff40a0"),
    uGlowIntensity: 0.9,
  },
  "cyber-forest": {
    id: "cyber-forest",
    name: "赛博森林",
    uBaseColor1: color("#0a1810", "#0a1810"),
    uBaseColor2: color("#1a4838", "#1a4838"),
    uFogColor: color("#040810", "#040810"),
    uCoolCore: color("#10a060", "#10a060"),
    uCoolEdge: color("#60f0a0", "#60f0a0"),
    uWarmCore: color("#208050", "#208050"),
    uWarmEdge: color("#90ffc0", "#90ffc0"),
    uRippleColor: color("#40e090", "#40e090"),
    uGlowIntensity: 0.75,
  },
};

const THEME_ORDER = [
  "minimal-monochrome",
  "ink-wash",
  "nocturnal",
  "neon-tokyo",
  "cyber-forest",
];

/** @param {string} [themeId] */
export function resolveTheme(themeId) {
  const id = String(themeId ?? "minimal-monochrome").trim();
  const theme = THEMES[id];
  if (theme) return cloneTheme(theme);
  return cloneTheme(THEMES["minimal-monochrome"]);
}

/** @returns {string[]} */
export function listThemeIds() {
  return THEME_ORDER.filter((id) => THEMES[id]);
}

/** @returns {{ id: string, name: string }[]} */
export function listThemeMeta() {
  return THEME_ORDER.filter((id) => THEMES[id]).map((id) => ({
    id,
    name: THEMES[id].name,
  }));
}

/** @param {string} themeId */
export function isValidThemeId(themeId) {
  return Boolean(THEMES[String(themeId ?? "").trim()]);
}

/** @param {SonicThemeColors} theme */
function cloneTheme(theme) {
  return {
    id: theme.id,
    name: theme.name,
    uBaseColor1: theme.uBaseColor1.clone(),
    uBaseColor2: theme.uBaseColor2.clone(),
    uFogColor: theme.uFogColor.clone(),
    uCoolCore: theme.uCoolCore.clone(),
    uCoolEdge: theme.uCoolEdge.clone(),
    uWarmCore: theme.uWarmCore.clone(),
    uWarmEdge: theme.uWarmEdge.clone(),
    uRippleColor: theme.uRippleColor.clone(),
    uGlowIntensity: theme.uGlowIntensity,
  };
}

/**
 * @param {SonicThemeColors} current
 * @param {SonicThemeColors} target
 * @param {number} dt
 */
export function lerpThemeColors(current, target, dt) {
  const t = 1 - Math.exp(-3 * Math.max(0, dt));
  current.uBaseColor1.lerp(target.uBaseColor1, t);
  current.uBaseColor2.lerp(target.uBaseColor2, t);
  current.uFogColor.lerp(target.uFogColor, t);
  current.uCoolCore.lerp(target.uCoolCore, t);
  current.uCoolEdge.lerp(target.uCoolEdge, t);
  current.uWarmCore.lerp(target.uWarmCore, t);
  current.uWarmEdge.lerp(target.uWarmEdge, t);
  current.uRippleColor.lerp(target.uRippleColor, t);
  current.uGlowIntensity += (target.uGlowIntensity - current.uGlowIntensity) * t;
}

/** @param {SonicThemeColors} theme @param {Record<string, { value: unknown }>} uniforms */
export function applyThemeToUniforms(theme, uniforms) {
  uniforms.uBaseColor1.value.copy(theme.uBaseColor1);
  uniforms.uBaseColor2.value.copy(theme.uBaseColor2);
  uniforms.uFogColor.value.copy(theme.uFogColor);
  uniforms.uCoolCore.value.copy(theme.uCoolCore);
  uniforms.uCoolEdge.value.copy(theme.uCoolEdge);
  uniforms.uWarmCore.value.copy(theme.uWarmCore);
  uniforms.uWarmEdge.value.copy(theme.uWarmEdge);
  uniforms.uRippleColor.value.copy(theme.uRippleColor);
  uniforms.uGlowIntensity.value = theme.uGlowIntensity;
}
