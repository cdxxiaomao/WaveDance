export const STORAGE_KEYS = {
  lineShape: "wavedance.waveShapeConfig",
  barShape: "wavedance.barShapeConfig",
  displayMode: "wavedance.displayMode",
  panelStyleMode: "wavedance.panelStyleMode",
  freqReversed: "wavedance.freqReversed",
  lineColor: "wavedance.lineColor",
  lineWidth: "wavedance.lineWidthPx",
  barColor: "wavedance.barColor",
  barWidth: "wavedance.barWidthPercent",
  barGap: "wavedance.barGapPercent",
  barHeadroom: "wavedance.barHeadroomPercent",
  barOrientation: "wavedance.barOrientation",
  barMirror: "wavedance.barMirrorEnabled",
  barPeakHold: "wavedance.barPeakHoldEnabled",
  barPeakHoldMode: "wavedance.barPeakHoldMode",
  barPeakColor: "wavedance.barPeakColor",
  barPeakFallSpeed: "wavedance.barPeakFallSpeed",
  barPeakThickness: "wavedance.barPeakThickness",
  mainBgColor: "wavedance.mainBgColor",
  mainBgAlpha: "wavedance.mainBgAlpha",
  overlayBlur: "wavedance.overlayBlurEnabled",
};

export const DISPLAY_MODES = {
  line: "line",
  bar: "bar",
};

export const PANEL_STYLES = {
  pro: "pro",
  minimal: "minimal",
};

export const BAR_ORIENTATIONS = {
  horizontal: "horizontal",
  vertical: "vertical",
};

export const PEAK_HOLD_MODES = {
  off: "off",
  single: "single",
  both: "both",
};

export const DEFAULT_CONFIG = {
  displayMode: DISPLAY_MODES.line,
  panelStyleMode: PANEL_STYLES.pro,
  freqReversed: false,
  line: {
    color: "#c4a574",
    lineWidthPx: 2,
    shape: {
      gainPercent: 50,
      smoothPercent: 28,
      softClipPercent: 22,
      fallEasePercent: 68,
    },
  },
  bar: {
    color: "#8f7cff",
    widthPercent: 76,
    gapPercent: 18,
    headroomPercent: 6,
    orientation: BAR_ORIENTATIONS.horizontal,
    mirrorEnabled: false,
    peakHoldMode: PEAK_HOLD_MODES.single,
    peakColor: "#ffffff",
    peakFallSpeed: 35,
    peakThickness: 2,
    shape: {
      gainPercent: 62,
      smoothPercent: 18,
      softClipPercent: 12,
      fallEasePercent: 52,
    },
  },
};

export function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function normalizeBarOrientation(value, fallback = BAR_ORIENTATIONS.horizontal) {
  const s = String(value ?? "").trim();
  if (s === BAR_ORIENTATIONS.vertical) return BAR_ORIENTATIONS.vertical;
  if (s === BAR_ORIENTATIONS.horizontal) return BAR_ORIENTATIONS.horizontal;
  return fallback;
}

export function normalizeBarPeakHoldMode(value, fallback = PEAK_HOLD_MODES.single) {
  const s = String(value ?? "").trim();
  if (s === PEAK_HOLD_MODES.off) return PEAK_HOLD_MODES.off;
  if (s === PEAK_HOLD_MODES.both) return PEAK_HOLD_MODES.both;
  if (s === PEAK_HOLD_MODES.single) return PEAK_HOLD_MODES.single;
  return fallback;
}

/**
 * 读取峰值保持线模式；兼容旧版 boolean 存储 `barPeakHold`。
 * @param {Storage} ls
 * @param {string} windowLabel
 */
export function readBarPeakHoldMode(ls, windowLabel) {
  const modeRaw = readWindowStorageString(ls, windowLabel, "barPeakHoldMode");
  if (modeRaw === PEAK_HOLD_MODES.off || modeRaw === PEAK_HOLD_MODES.single || modeRaw === PEAK_HOLD_MODES.both) {
    return modeRaw;
  }
  const legacyRaw = readWindowStorageString(ls, windowLabel, "barPeakHold");
  if (legacyRaw != null && legacyRaw !== "") {
    return parseBoolean(legacyRaw, true) ? PEAK_HOLD_MODES.single : PEAK_HOLD_MODES.off;
  }
  return DEFAULT_CONFIG.bar.peakHoldMode;
}

/** 仅允许主窗与频谱副窗作为「每窗配置」的存储分区。 */
export function normalizeSpectrumWindowLabel(label) {
  const s = String(label ?? "").trim();
  if (s === "main" || s.startsWith("spectrum-")) {
    return s;
  }
  return "main";
}

/**
 * 各频谱窗口独立的外观/形态 localStorage 键（与 {@link STORAGE_KEYS} 字段一一对应）。
 * 旧版未带窗口 id 的键仍会通过 {@link readWindowStorageString} 回退读取。
 */
export function windowStorageKeys(windowLabel) {
  const id = normalizeSpectrumWindowLabel(windowLabel);
  const pre = `wavedance.win.${id}`;
  return {
    lineShape: `${pre}.waveShapeConfig`,
    barShape: `${pre}.barShapeConfig`,
    displayMode: `${pre}.displayMode`,
    panelStyleMode: `${pre}.panelStyleMode`,
    freqReversed: `${pre}.freqReversed`,
    lineColor: `${pre}.lineColor`,
    lineWidth: `${pre}.lineWidthPx`,
    barColor: `${pre}.barColor`,
    barWidth: `${pre}.barWidthPercent`,
    barGap: `${pre}.barGapPercent`,
    barHeadroom: `${pre}.barHeadroomPercent`,
    barOrientation: `${pre}.barOrientation`,
    barMirror: `${pre}.barMirrorEnabled`,
    barPeakHold: `${pre}.barPeakHoldEnabled`,
    barPeakHoldMode: `${pre}.barPeakHoldMode`,
    barPeakColor: `${pre}.barPeakColor`,
    barPeakFallSpeed: `${pre}.barPeakFallSpeed`,
    barPeakThickness: `${pre}.barPeakThickness`,
    mainBgColor: `${pre}.mainBgColor`,
    mainBgAlpha: `${pre}.mainBgAlpha`,
    overlayBlur: `${pre}.overlayBlurEnabled`,
  };
}

/**
 * 读取某窗专属配置；若无则回退旧全局 {@link STORAGE_KEYS}（升级迁移）。
 * @param {Storage} ls
 * @param {string} windowLabel
 * @param {keyof typeof STORAGE_KEYS} prop
 */
export function readWindowStorageString(ls, windowLabel, prop) {
  const wk = windowStorageKeys(windowLabel);
  const primary = ls.getItem(wk[prop]);
  if (primary != null && primary !== "") {
    return primary;
  }
  return ls.getItem(STORAGE_KEYS[prop]);
}

/**
 * @param {Storage} ls
 * @param {string} windowLabel
 * @param {keyof typeof STORAGE_KEYS} prop
 * @param {string} value
 */
export function writeWindowStorageString(ls, windowLabel, prop, value) {
  const wk = windowStorageKeys(windowLabel);
  ls.setItem(wk[prop], value);
}
