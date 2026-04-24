export const STORAGE_KEYS = {
  lineShape: "wavedance.waveShapeConfig",
  barShape: "wavedance.barShapeConfig",
  displayMode: "wavedance.displayMode",
  panelStyleMode: "wavedance.panelStyleMode",
  lineColor: "wavedance.lineColor",
  lineWidth: "wavedance.lineWidthPx",
  barColor: "wavedance.barColor",
  barWidth: "wavedance.barWidthPercent",
  barGap: "wavedance.barGapPercent",
  barHeadroom: "wavedance.barHeadroomPercent",
  barMirror: "wavedance.barMirrorEnabled",
  barPeakHold: "wavedance.barPeakHoldEnabled",
  barPeakFallSpeed: "wavedance.barPeakFallSpeed",
  barPeakThickness: "wavedance.barPeakThickness",
};

export const DISPLAY_MODES = {
  line: "line",
  bar: "bar",
};

export const PANEL_STYLES = {
  pro: "pro",
  minimal: "minimal",
};

export const DEFAULT_CONFIG = {
  displayMode: DISPLAY_MODES.line,
  panelStyleMode: PANEL_STYLES.pro,
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
    mirrorEnabled: false,
    peakHoldEnabled: true,
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
