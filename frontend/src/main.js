import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createLineRenderer } from "./renderers/lineRenderer.js";
import { createBarRenderer } from "./renderers/barRenderer.js";
import { createAreaRenderer } from "./renderers/areaRenderer.js";
import { createGradientBarRenderer } from "./renderers/gradientBarRenderer.js";
import {
  clampInt,
  DEFAULT_CONFIG,
  DISPLAY_MODES,
  normalizeDisplayMode,
  parseBoolean,
  readWindowStorageString,
  readBarPeakHoldMode,
  readGradientBarPeakHoldMode,
  normalizeBarPeakHoldMode,
  PEAK_HOLD_MODES,
} from "./visualizationSchema.js";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const canvas = document.querySelector("#waveCanvas");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const resizeHandles = Array.from(document.querySelectorAll("[data-resize-dir]"));

const gl = canvas.getContext("webgl");
if (!gl) {
  throw new Error("当前环境不支持 WebGL");
}

const lineRenderer = createLineRenderer(gl);
const barRenderer = createBarRenderer(gl);
const areaRenderer = createAreaRenderer(gl);
const gradientBarRenderer = createGradientBarRenderer(gl);

const RENDERERS = {
  [DISPLAY_MODES.line]: lineRenderer,
  [DISPLAY_MODES.bar]: barRenderer,
  [DISPLAY_MODES.area]: areaRenderer,
  [DISPLAY_MODES.gradientBar]: gradientBarRenderer,
};

const waveShapeConfig = { ...DEFAULT_CONFIG.line.shape };
const barShapeConfig = { ...DEFAULT_CONFIG.bar.shape };
const areaShapeConfig = { ...DEFAULT_CONFIG.area.shape };
const gradientBarShapeConfig = { ...DEFAULT_CONFIG.gradientBar.shape };

let latestPoints = [];
let displayMode = DEFAULT_CONFIG.displayMode;

function applyWaveShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  waveShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  waveShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  waveShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  waveShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyBarShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  barShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  barShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  barShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  barShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyAreaShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  areaShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  areaShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  areaShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  areaShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyGradientBarShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  gradientBarShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  gradientBarShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  gradientBarShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  gradientBarShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function loadShapeConfigsFromStorage(windowLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, windowLabel, "lineShape");
    if (raw) applyWaveShapeConfig(JSON.parse(raw));
    const barRaw = readWindowStorageString(window.localStorage, windowLabel, "barShape");
    if (barRaw) applyBarShapeConfig(JSON.parse(barRaw));
    const areaRaw = readWindowStorageString(window.localStorage, windowLabel, "areaShape");
    if (areaRaw) applyAreaShapeConfig(JSON.parse(areaRaw));
    const gradientBarRaw = readWindowStorageString(window.localStorage, windowLabel, "gradientBarShape");
    if (gradientBarRaw) applyGradientBarShapeConfig(JSON.parse(gradientBarRaw));
  } catch {
    // ignore storage failures and keep defaults
  }
}

function hexToRgb(hex) {
  const safeHex = typeof hex === "string" ? hex.replace("#", "") : "";
  if (safeHex.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

const DEFAULT_WAVEFORM_HEX = DEFAULT_CONFIG.line.color;

const waveformLineRgb = { r: 0, g: 0, b: 0 };
const barFillRgb = { r: 0, g: 0, b: 0 };
const barPeakRgb = { r: 1, g: 1, b: 1 };
const areaFillRgb = { r: 0, g: 0, b: 0 };
const areaLineRgb = { r: 0, g: 0, b: 0 };
const gradientBarColorLowRgb = { r: 0, g: 0, b: 0 };
const gradientBarColorHighRgb = { r: 0, g: 0, b: 0 };
const gradientBarPeakRgb = { r: 1, g: 1, b: 1 };

function applyWaveformColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_WAVEFORM_HEX;
  const { r, g, b } = hexToRgb(safe);
  waveformLineRgb.r = r / 255;
  waveformLineRgb.g = g / 255;
  waveformLineRgb.b = b / 255;
}

applyWaveformColorHex(DEFAULT_WAVEFORM_HEX);
applyBarColorHex(DEFAULT_CONFIG.bar.color);
applyBarPeakColorHex(DEFAULT_CONFIG.bar.peakColor);
applyAreaFillColorHex(DEFAULT_CONFIG.area.fillColor);
applyAreaLineColorHex(DEFAULT_CONFIG.area.lineColor);
applyGradientBarColorLowHex(DEFAULT_CONFIG.gradientBar.colorLow);
applyGradientBarColorHighHex(DEFAULT_CONFIG.gradientBar.colorHigh);
applyGradientBarPeakColorHex(DEFAULT_CONFIG.gradientBar.peakColor);

const WAVEFORM_WIDTH_MIN = 1;
const WAVEFORM_WIDTH_MAX = 12;
let waveformLineWidthPx = 2;
let barWidthPercent = DEFAULT_CONFIG.bar.widthPercent;
let barGapPercent = DEFAULT_CONFIG.bar.gapPercent;
let barHeadroomPercent = DEFAULT_CONFIG.bar.headroomPercent;
let barOrientation = DEFAULT_CONFIG.bar.orientation;
let barMirrorEnabled = DEFAULT_CONFIG.bar.mirrorEnabled;
let barPeakHoldMode = DEFAULT_CONFIG.bar.peakHoldMode;
let barPeakFallSpeed = DEFAULT_CONFIG.bar.peakFallSpeed;
let barPeakThickness = DEFAULT_CONFIG.bar.peakThickness;
let areaFillAlphaPercent = DEFAULT_CONFIG.area.fillAlphaPercent;
let areaLineWidthPx = DEFAULT_CONFIG.area.lineWidthPx;
let areaMirrorEnabled = DEFAULT_CONFIG.area.mirrorEnabled;
let areaGradientEnabled = DEFAULT_CONFIG.area.gradientEnabled;
let gradientBarWidthPercent = DEFAULT_CONFIG.gradientBar.widthPercent;
let gradientBarGapPercent = DEFAULT_CONFIG.gradientBar.gapPercent;
let gradientBarHeadroomPercent = DEFAULT_CONFIG.gradientBar.headroomPercent;
let gradientBarOrientation = DEFAULT_CONFIG.gradientBar.orientation;
let gradientBarMirrorEnabled = DEFAULT_CONFIG.gradientBar.mirrorEnabled;
let gradientBarPeakHoldMode = DEFAULT_CONFIG.gradientBar.peakHoldMode;
let gradientBarPeakFallSpeed = DEFAULT_CONFIG.gradientBar.peakFallSpeed;
let gradientBarPeakThickness = DEFAULT_CONFIG.gradientBar.peakThickness;
let freqReversed = DEFAULT_CONFIG.freqReversed;

function applyBarColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.bar.color;
  const { r, g, b } = hexToRgb(safe);
  barFillRgb.r = r / 255;
  barFillRgb.g = g / 255;
  barFillRgb.b = b / 255;
}

function applyBarPeakColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.bar.peakColor;
  const { r, g, b } = hexToRgb(safe);
  barPeakRgb.r = r / 255;
  barPeakRgb.g = g / 255;
  barPeakRgb.b = b / 255;
}

function applyAreaFillColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.area.fillColor;
  const { r, g, b } = hexToRgb(safe);
  areaFillRgb.r = r / 255;
  areaFillRgb.g = g / 255;
  areaFillRgb.b = b / 255;
}

function applyAreaLineColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.area.lineColor;
  const { r, g, b } = hexToRgb(safe);
  areaLineRgb.r = r / 255;
  areaLineRgb.g = g / 255;
  areaLineRgb.b = b / 255;
}

function applyAreaFillAlphaPercent(n) {
  areaFillAlphaPercent = clampInt(n, 0, 100);
}

function applyAreaLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  areaLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyAreaMirrorEnabled(value) {
  areaMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.area.mirrorEnabled);
}

function applyAreaGradientEnabled(value) {
  areaGradientEnabled = parseBoolean(value, DEFAULT_CONFIG.area.gradientEnabled);
}

function applyGradientBarColorLowHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.gradientBar.colorLow;
  const { r, g, b } = hexToRgb(safe);
  gradientBarColorLowRgb.r = r / 255;
  gradientBarColorLowRgb.g = g / 255;
  gradientBarColorLowRgb.b = b / 255;
}

function applyGradientBarColorHighHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.gradientBar.colorHigh;
  const { r, g, b } = hexToRgb(safe);
  gradientBarColorHighRgb.r = r / 255;
  gradientBarColorHighRgb.g = g / 255;
  gradientBarColorHighRgb.b = b / 255;
}

function applyGradientBarPeakColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.gradientBar.peakColor;
  const { r, g, b } = hexToRgb(safe);
  gradientBarPeakRgb.r = r / 255;
  gradientBarPeakRgb.g = g / 255;
  gradientBarPeakRgb.b = b / 255;
}

function applyGradientBarWidthPercent(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  gradientBarWidthPercent = Math.max(20, Math.min(100, v));
}

function applyGradientBarGapPercent(n) {
  gradientBarGapPercent = clampInt(n, 0, 70);
}

function applyGradientBarHeadroomPercent(n) {
  gradientBarHeadroomPercent = clampInt(n, 0, 40);
}

function applyGradientBarOrientation(value) {
  gradientBarOrientation = value === "vertical" ? "vertical" : "horizontal";
}

function applyGradientBarMirrorEnabled(value) {
  gradientBarMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.gradientBar.mirrorEnabled);
}

function applyGradientBarPeakHoldMode(value) {
  if (typeof value === "boolean") {
    gradientBarPeakHoldMode = value ? PEAK_HOLD_MODES.single : PEAK_HOLD_MODES.off;
    return;
  }
  gradientBarPeakHoldMode = normalizeBarPeakHoldMode(value, DEFAULT_CONFIG.gradientBar.peakHoldMode);
}

function applyGradientBarPeakFallSpeed(value) {
  gradientBarPeakFallSpeed = clampInt(value, 5, 120);
}

function applyGradientBarPeakThickness(value) {
  gradientBarPeakThickness = clampInt(value, 1, 8);
}

function applyWaveformLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  waveformLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyBarWidthPercent(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  barWidthPercent = Math.max(20, Math.min(100, v));
}

function applyBarGapPercent(n) {
  barGapPercent = clampInt(n, 0, 70);
}

function applyBarHeadroomPercent(n) {
  barHeadroomPercent = clampInt(n, 0, 40);
}

function applyBarOrientation(value) {
  barOrientation = value === "vertical" ? "vertical" : "horizontal";
}

function applyBarMirrorEnabled(value) {
  barMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.bar.mirrorEnabled);
}

function applyBarPeakHoldMode(value) {
  if (typeof value === "boolean") {
    barPeakHoldMode = value ? PEAK_HOLD_MODES.single : PEAK_HOLD_MODES.off;
    return;
  }
  barPeakHoldMode = normalizeBarPeakHoldMode(value, DEFAULT_CONFIG.bar.peakHoldMode);
}

function applyBarPeakFallSpeed(value) {
  barPeakFallSpeed = clampInt(value, 5, 120);
}

function applyBarPeakThickness(value) {
  barPeakThickness = clampInt(value, 1, 8);
}

function applyFreqReversed(value) {
  freqReversed = parseBoolean(value, DEFAULT_CONFIG.freqReversed);
}

function applyMainBackgroundStyle(payload) {
  const { color = "#000000", alpha = 0.35 } = payload ?? {};
  const { r, g, b } = hexToRgb(color);
  const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.35;
  document.body.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(3)})`;
}

function loadMainBackgroundStyleFromStorage(windowLabel) {
  try {
    const savedColor = readWindowStorageString(window.localStorage, windowLabel, "mainBgColor");
    const savedAlphaRaw = readWindowStorageString(window.localStorage, windowLabel, "mainBgAlpha");
    const color = /^#[0-9A-Fa-f]{6}$/.test(savedColor ?? "") ? savedColor.toLowerCase() : "#000000";
    const alphaPercent = clampInt(savedAlphaRaw, 0, 100);
    applyMainBackgroundStyle({ color, alpha: alphaPercent / 100 });
  } catch {
    applyMainBackgroundStyle({ color: "#000000", alpha: 0.35 });
  }
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function getShapeConfigForMode(mode) {
  if (mode === DISPLAY_MODES.bar) return barShapeConfig;
  if (mode === DISPLAY_MODES.area) return areaShapeConfig;
  if (mode === DISPLAY_MODES.gradientBar) return gradientBarShapeConfig;
  return waveShapeConfig;
}

function getStyleConfigForMode(mode) {
  if (mode === DISPLAY_MODES.bar) {
    return {
      color: barFillRgb,
      widthPercent: barWidthPercent,
      gapPercent: barGapPercent,
      headroomPercent: barHeadroomPercent,
      orientation: barOrientation,
      mirrorEnabled: barMirrorEnabled,
      peakHoldMode: barPeakHoldMode,
      peakColor: barPeakRgb,
      peakFallSpeed: barPeakFallSpeed,
      peakThickness: barPeakThickness,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.area) {
    return {
      fillColor: areaFillRgb,
      fillAlpha: areaFillAlphaPercent / 100,
      lineColor: areaLineRgb,
      lineWidthPx: areaLineWidthPx,
      mirrorEnabled: areaMirrorEnabled,
      gradientEnabled: areaGradientEnabled,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.gradientBar) {
    return {
      colorLow: gradientBarColorLowRgb,
      colorHigh: gradientBarColorHighRgb,
      widthPercent: gradientBarWidthPercent,
      gapPercent: gradientBarGapPercent,
      headroomPercent: gradientBarHeadroomPercent,
      orientation: gradientBarOrientation,
      mirrorEnabled: gradientBarMirrorEnabled,
      peakHoldMode: gradientBarPeakHoldMode,
      peakColor: gradientBarPeakRgb,
      peakFallSpeed: gradientBarPeakFallSpeed,
      peakThickness: gradientBarPeakThickness,
      freqReversed,
    };
  }
  return {
    color: waveformLineRgb,
    lineWidthPx: waveformLineWidthPx,
    freqReversed,
  };
}

function renderWaveform() {
  resizeCanvas();
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const renderer = RENDERERS[displayMode] ?? lineRenderer;
  renderer.render(latestPoints, getShapeConfigForMode(displayMode), getStyleConfigForMode(displayMode));

  requestAnimationFrame(renderWaveform);
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  const isSpectrumClone = windowLabel.startsWith("spectrum-");
  let isSpectrumTraditional = false;
  let isSpectrumOverlay = false;
  if (isSpectrumClone) {
    document.body.classList.add("spectrum-clone");
    try {
      const overlayMode = await invoke("get_spectrum_window_overlay_mode", {
        label: windowLabel,
      });
      if (!overlayMode) {
        isSpectrumTraditional = true;
        document.body.classList.add("spectrum-traditional");
      } else {
        isSpectrumOverlay = true;
        document.body.classList.add("spectrum-overlay-dedicated", "overlay-edge-hint-window");
      }
    } catch (err) {
      console.error("get_spectrum_window_overlay_mode failed:", err);
    }
  } else if (windowLabel === "main") {
    document.body.classList.add("overlay-edge-hint-window");
  }

  const enableWindowDrag = !isSpectrumTraditional;
  const enableWindowResize = !isSpectrumTraditional && !isSpectrumOverlay && windowLabel === "main";

  const triggerNativeDrag = async (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest("[data-no-drag], button, input, select, textarea, a")) return;
    try {
      await invoke("start_window_dragging");
    } catch {
      // ignore drag call failures when system rejects dragging state
    }
  };

  if (enableWindowDrag) {
    document.body.addEventListener("mousedown", triggerNativeDrag);
  }

  const triggerNativeResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const direction = event.currentTarget.dataset.resizeDir;
    if (!direction) return;
    document.body.classList.add("is-resizing-window");
    let lastX = event.screenX;
    let lastY = event.screenY;

    const onMouseMove = async (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.screenX - lastX;
      const deltaY = moveEvent.screenY - lastY;
      if (deltaX === 0 && deltaY === 0) return;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      try {
        await invoke("resize_window_by_delta", { direction, deltaX, deltaY });
      } catch {
        // ignore resize call failures when system rejects resizing state
      }
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("mouseleave", stopResize);
      document.body.classList.remove("is-resizing-window");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseleave", stopResize);
  };
  if (enableWindowResize) {
    resizeHandles.forEach((handle) => {
      handle.addEventListener("mousedown", triggerNativeResize);
    });
  }

  if (windowLabel === "main" || isSpectrumOverlay) {
    initWindowEdgeHint();
  }

  await listen("waveform-frame", (event) => {
    const payload = event.payload;
    if (Array.isArray(payload.points)) {
      latestPoints = payload.points;
    }
  });

  await listen("waveform-error", (event) => {
    console.error("waveform-error:", event.payload);
  });

  await listen("waveform-status", (event) => {
    console.info("waveform-status:", event.payload);
  });

  const thisWebviewTarget = { kind: "WebviewWindow", label: windowLabel };

  await listen(
    "main-bg-style",
    (event) => {
      applyMainBackgroundStyle(event.payload);
    },
    { target: thisWebviewTarget },
  );

  await listen(
    "waveform-line-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyWaveformColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyBarColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyBarPeakColorHex(color);
    },
    { target: thisWebviewTarget },
  );

  await listen(
    "waveform-line-width",
    (event) => {
      applyWaveformLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-width",
    (event) => {
      applyBarWidthPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-gap",
    (event) => {
      applyBarGapPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-headroom",
    (event) => {
      applyBarHeadroomPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-orientation",
    (event) => {
      applyBarOrientation(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-mirror",
    (event) => {
      applyBarMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-hold",
    (event) => {
      applyBarPeakHoldMode(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-fall-speed",
    (event) => {
      applyBarPeakFallSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-thickness",
    (event) => {
      applyBarPeakThickness(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-freq-reversed",
    (event) => {
      applyFreqReversed(event.payload);
    },
    { target: thisWebviewTarget },
  );

  await listen(
    "waveform-shape-config",
    (event) => {
      applyWaveShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-shape-config",
    (event) => {
      applyBarShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyAreaFillColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-line-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyAreaLineColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-fill-alpha",
    (event) => {
      applyAreaFillAlphaPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-line-width",
    (event) => {
      applyAreaLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-mirror",
    (event) => {
      applyAreaMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-gradient",
    (event) => {
      applyAreaGradientEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-area-shape-config",
    (event) => {
      applyAreaShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-color-low",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGradientBarColorLowHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-color-high",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGradientBarColorHighHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-width",
    (event) => {
      applyGradientBarWidthPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-gap",
    (event) => {
      applyGradientBarGapPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-headroom",
    (event) => {
      applyGradientBarHeadroomPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-orientation",
    (event) => {
      applyGradientBarOrientation(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-mirror",
    (event) => {
      applyGradientBarMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-peak-hold",
    (event) => {
      applyGradientBarPeakHoldMode(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-peak-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGradientBarPeakColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-peak-fall-speed",
    (event) => {
      applyGradientBarPeakFallSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-peak-thickness",
    (event) => {
      applyGradientBarPeakThickness(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-gradient-bar-shape-config",
    (event) => {
      applyGradientBarShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "visualization-display-mode",
    (event) => {
      displayMode = normalizeDisplayMode(event.payload);
    },
    { target: thisWebviewTarget },
  );

  const applyMousePassthroughLockUi = (locked) => {
    const on = Boolean(locked);
    document.body.classList.toggle("mouse-passthrough-locked", on);
    if (!mousePassthroughLockBtn) return;
    mousePassthroughLockBtn.setAttribute("aria-pressed", on ? "true" : "false");
    mousePassthroughLockBtn.classList.toggle("is-locked", on);
    const isMain = windowLabel === "main";
    mousePassthroughLockBtn.title = on
      ? isMain
        ? "已穿透：点击关闭穿透，或按 ⌘⇧⌥L"
        : "已穿透（本窗）：点击关闭，主窗仍可用 ⌘⇧⌥L 切换主窗穿透"
      : isMain
        ? "开启后主窗口鼠标穿透到下层；也可用 ⌘⇧⌥L"
        : "开启后本窗口鼠标穿透到下层";
    const lockImg = mousePassthroughLockBtn.querySelector("img[data-lock-icon]");
    if (lockImg) {
      lockImg.src = on ? "/icons/passthrough-active.svg" : "/icons/passthrough-idle.svg";
    }
  };

  await listen("mouse-passthrough-changed", (event) => {
    const p = event.payload;
    const lbl =
      p && typeof p === "object" && p.label != null ? String(p.label) : "main";
    const locked =
      p && typeof p === "object" && typeof p.locked === "boolean"
        ? p.locked
        : Boolean(p);
    if (lbl !== windowLabel) return;
    applyMousePassthroughLockUi(locked);
  });

  try {
    const savedLineHex = readWindowStorageString(window.localStorage, windowLabel, "lineColor");
    if (typeof savedLineHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(savedLineHex)) {
      applyWaveformColorHex(savedLineHex);
    } else {
      const rust = await invoke("get_waveform_color");
      applyWaveformColorHex(typeof rust === "string" ? rust : DEFAULT_WAVEFORM_HEX);
    }
  } catch {
    applyWaveformColorHex(DEFAULT_WAVEFORM_HEX);
  }

  try {
    const savedMode = readWindowStorageString(window.localStorage, windowLabel, "displayMode");
    displayMode = normalizeDisplayMode(savedMode);
    const savedBarColor = readWindowStorageString(window.localStorage, windowLabel, "barColor");
    if (savedBarColor) {
      applyBarColorHex(savedBarColor);
    }
    const savedBarWidth = readWindowStorageString(window.localStorage, windowLabel, "barWidth");
    if (savedBarWidth) {
      applyBarWidthPercent(savedBarWidth);
    }
    const savedBarGap = readWindowStorageString(window.localStorage, windowLabel, "barGap");
    if (savedBarGap) {
      applyBarGapPercent(savedBarGap);
    }
    const savedBarHeadroom = readWindowStorageString(window.localStorage, windowLabel, "barHeadroom");
    if (savedBarHeadroom) {
      applyBarHeadroomPercent(savedBarHeadroom);
    }
    applyBarOrientation(readWindowStorageString(window.localStorage, windowLabel, "barOrientation"));
    applyBarMirrorEnabled(readWindowStorageString(window.localStorage, windowLabel, "barMirror"));
    applyBarPeakHoldMode(readBarPeakHoldMode(window.localStorage, windowLabel));
    applyBarPeakColorHex(readWindowStorageString(window.localStorage, windowLabel, "barPeakColor"));
    applyBarPeakFallSpeed(readWindowStorageString(window.localStorage, windowLabel, "barPeakFallSpeed"));
    applyBarPeakThickness(readWindowStorageString(window.localStorage, windowLabel, "barPeakThickness"));
    applyAreaFillColorHex(readWindowStorageString(window.localStorage, windowLabel, "areaColor"));
    applyAreaLineColorHex(readWindowStorageString(window.localStorage, windowLabel, "areaLineColor"));
    const savedAreaFillAlpha = readWindowStorageString(window.localStorage, windowLabel, "areaFillAlpha");
    if (savedAreaFillAlpha != null && savedAreaFillAlpha !== "") {
      applyAreaFillAlphaPercent(savedAreaFillAlpha);
    }
    const savedAreaLineWidth = readWindowStorageString(window.localStorage, windowLabel, "areaLineWidth");
    if (savedAreaLineWidth != null && savedAreaLineWidth !== "") {
      applyAreaLineWidthPx(savedAreaLineWidth);
    }
    applyAreaMirrorEnabled(readWindowStorageString(window.localStorage, windowLabel, "areaMirror"));
    applyAreaGradientEnabled(readWindowStorageString(window.localStorage, windowLabel, "areaGradient"));
    applyGradientBarColorLowHex(readWindowStorageString(window.localStorage, windowLabel, "gradientBarColorLow"));
    applyGradientBarColorHighHex(readWindowStorageString(window.localStorage, windowLabel, "gradientBarColorHigh"));
    const savedGradientBarWidth = readWindowStorageString(window.localStorage, windowLabel, "gradientBarWidth");
    if (savedGradientBarWidth) {
      applyGradientBarWidthPercent(savedGradientBarWidth);
    }
    const savedGradientBarGap = readWindowStorageString(window.localStorage, windowLabel, "gradientBarGap");
    if (savedGradientBarGap) {
      applyGradientBarGapPercent(savedGradientBarGap);
    }
    const savedGradientBarHeadroom = readWindowStorageString(window.localStorage, windowLabel, "gradientBarHeadroom");
    if (savedGradientBarHeadroom) {
      applyGradientBarHeadroomPercent(savedGradientBarHeadroom);
    }
    applyGradientBarOrientation(readWindowStorageString(window.localStorage, windowLabel, "gradientBarOrientation"));
    applyGradientBarMirrorEnabled(readWindowStorageString(window.localStorage, windowLabel, "gradientBarMirror"));
    applyGradientBarPeakHoldMode(readGradientBarPeakHoldMode(window.localStorage, windowLabel));
    applyGradientBarPeakColorHex(readWindowStorageString(window.localStorage, windowLabel, "gradientBarPeakColor"));
    applyGradientBarPeakFallSpeed(readWindowStorageString(window.localStorage, windowLabel, "gradientBarPeakFallSpeed"));
    applyGradientBarPeakThickness(readWindowStorageString(window.localStorage, windowLabel, "gradientBarPeakThickness"));
    applyFreqReversed(readWindowStorageString(window.localStorage, windowLabel, "freqReversed"));
  } catch {
    // ignore storage failures
  }

  try {
    const savedW = readWindowStorageString(window.localStorage, windowLabel, "lineWidth");
    if (savedW) {
      applyWaveformLineWidthPx(savedW);
    } else {
      const w = await invoke("get_waveform_line_width");
      applyWaveformLineWidthPx(w);
    }
  } catch {
    applyWaveformLineWidthPx(2);
  }

  loadShapeConfigsFromStorage(windowLabel);

  try {
    const locked = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
    applyMousePassthroughLockUi(locked);
  } catch {
    applyMousePassthroughLockUi(false);
  }

  if (mousePassthroughLockBtn) {
    mousePassthroughLockBtn.addEventListener("click", async () => {
      try {
        const cur = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
        const next = !cur;
        await invoke("set_mouse_passthrough_locked", { label: windowLabel, locked: next });
        applyMousePassthroughLockUi(next);
      } catch (err) {
        console.error("mouse passthrough toggle failed:", err);
      }
    });
  }

  openSettingsBtn.addEventListener("click", async () => {
    try {
      await invoke("open_settings_window", { visualTargetLabel: windowLabel });
    } catch (err) {
      console.error("open_settings_window failed:", err);
    }
  });

  if (windowLabel === "main" || windowLabel.startsWith("spectrum-")) {
    try {
      await invoke("start_waveform_stream");
    } catch (err) {
      console.error("start_waveform_stream failed:", err);
    }
  }
  loadMainBackgroundStyleFromStorage(windowLabel);

  try {
    const blurEnabled = parseBoolean(
      readWindowStorageString(window.localStorage, windowLabel, "overlayBlur"),
      false,
    );
    await invoke("set_overlay_blur_enabled", { label: windowLabel, enabled: blurEnabled });
  } catch (err) {
    console.error("restore overlay blur failed:", err);
  }

  renderWaveform();
}

init().catch((error) => {
  console.error("main init failed:", error);
});
