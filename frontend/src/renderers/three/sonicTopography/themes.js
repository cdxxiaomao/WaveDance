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

/** 与 sonic-topography themes.ts 一致（线性 RGB 0~1） */
function rgb(r, g, b) {
  return new THREE.Color(r, g, b);
}

/** @param {THREE.Color} c @param {THREE.Color} target @param {number} t */
function lerpColor(c, target, t) {
  return c.clone().lerp(target, t);
}

/** @type {Record<string, SonicThemeColors>} */
const THEMES = {
  "ink-wash": {
    id: "ink-wash",
    name: "水墨",
    uBaseColor1: rgb(1.0, 1.0, 1.0),
    uBaseColor2: lerpColor(rgb(1.0, 1.0, 1.0), rgb(1.0, 1.0, 1.0), 0.12),
    uFogColor: rgb(1.0, 1.0, 1.0),
    uCoolCore: rgb(0.0, 0.0, 0.0),
    uCoolEdge: lerpColor(rgb(0.0, 0.0, 0.0), rgb(1.0, 1.0, 1.0), 0.35),
    uWarmCore: rgb(0.0, 0.0, 0.0),
    uWarmEdge: lerpColor(rgb(0.0, 0.0, 0.0), rgb(1.0, 1.0, 1.0), 0.35),
    uRippleColor: rgb(0.66, 0.74, 0.76),
    uGlowIntensity: 1.1,
  },
  nocturnal: {
    id: "nocturnal",
    name: "夜行",
    uBaseColor1: rgb(0.01, 0.02, 0.04),
    uBaseColor2: rgb(0.03, 0.05, 0.09),
    uFogColor: rgb(0.01, 0.02, 0.04),
    uCoolCore: rgb(0.0, 0.3, 1.0),
    uCoolEdge: rgb(0.6, 0.2, 1.0),
    uWarmCore: rgb(1.0, 0.2, 0.1),
    uWarmEdge: rgb(1.0, 0.6, 0.0),
    uRippleColor: rgb(0.2, 0.9, 1.0),
    uGlowIntensity: 1.0,
  },
  "neon-tokyo": {
    id: "neon-tokyo",
    name: "霓虹东京",
    uBaseColor1: rgb(0.01, 0.005, 0.02),
    uBaseColor2: rgb(0.04, 0.01, 0.06),
    uFogColor: rgb(0.01, 0.005, 0.02),
    uCoolCore: rgb(1.0, 0.1, 0.6),
    uCoolEdge: rgb(0.6, 0.1, 1.0),
    uWarmCore: rgb(0.1, 1.0, 0.8),
    uWarmEdge: rgb(0.1, 0.4, 1.0),
    uRippleColor: rgb(1.0, 1.0, 1.0),
    uGlowIntensity: 1.5,
  },
  "cyber-forest": {
    id: "cyber-forest",
    name: "赛博森林",
    uBaseColor1: rgb(0.01, 0.02, 0.01),
    uBaseColor2: rgb(0.02, 0.05, 0.02),
    uFogColor: rgb(0.01, 0.02, 0.01),
    uCoolCore: rgb(0.1, 1.0, 0.5),
    uCoolEdge: rgb(0.05, 0.5, 0.3),
    uWarmCore: rgb(0.8, 1.0, 0.1),
    uWarmEdge: rgb(0.9, 0.5, 0.1),
    uRippleColor: rgb(0.6, 1.0, 0.3),
    uGlowIntensity: 1.3,
  },
  "minimal-monochrome": {
    id: "minimal-monochrome",
    name: "极简单色",
    uBaseColor1: rgb(0.02, 0.02, 0.02),
    uBaseColor2: rgb(0.06, 0.06, 0.06),
    uFogColor: rgb(0.02, 0.02, 0.02),
    uCoolCore: rgb(0.9, 0.9, 0.9),
    uCoolEdge: rgb(0.4, 0.4, 0.4),
    uWarmCore: rgb(1.0, 1.0, 1.0),
    uWarmEdge: rgb(0.7, 0.7, 0.7),
    uRippleColor: rgb(1.0, 1.0, 1.0),
    uGlowIntensity: 0.8,
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
  const u = uniforms.uBaseColor1?.value;
  if (u && typeof u.copy === "function") u.copy(theme.uBaseColor1);
  const u2 = uniforms.uBaseColor2?.value;
  if (u2 && typeof u2.copy === "function") u2.copy(theme.uBaseColor2);
  const fog = uniforms.uFogColor?.value;
  if (fog && typeof fog.copy === "function") fog.copy(theme.uFogColor);
  const coolCore = uniforms.uCoolCore?.value;
  if (coolCore && typeof coolCore.copy === "function") coolCore.copy(theme.uCoolCore);
  const coolEdge = uniforms.uCoolEdge?.value;
  if (coolEdge && typeof coolEdge.copy === "function") coolEdge.copy(theme.uCoolEdge);
  const warmCore = uniforms.uWarmCore?.value;
  if (warmCore && typeof warmCore.copy === "function") warmCore.copy(theme.uWarmCore);
  const warmEdge = uniforms.uWarmEdge?.value;
  if (warmEdge && typeof warmEdge.copy === "function") warmEdge.copy(theme.uWarmEdge);
  const ripple = uniforms.uRippleColor?.value;
  if (ripple && typeof ripple.copy === "function") ripple.copy(theme.uRippleColor);
  if (uniforms.uGlowIntensity) uniforms.uGlowIntensity.value = theme.uGlowIntensity;
}
