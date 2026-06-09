import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createLineRenderer } from "./renderers/lineRenderer.js";
import { createBarRenderer } from "./renderers/barRenderer.js";
import { createAreaRenderer } from "./renderers/areaRenderer.js";
import { createGradientBarRenderer } from "./renderers/gradientBarRenderer.js";
import { createGlowLineRenderer } from "./renderers/glowLineRenderer.js";
import { createGlowCircleRenderer } from "./renderers/glowCircleRenderer.js";
import { createRadialRenderer } from "./renderers/radialRenderer.js";
import { createWaterfallRenderer } from "./renderers/waterfallRenderer.js";
import { createDotRingRenderer } from "./renderers/dotRingRenderer.js";
import { createOscilloscopeRenderer } from "./renderers/oscilloscopeRenderer.js";
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
const glowLineRenderer = createGlowLineRenderer(gl);
const glowCircleRenderer = createGlowCircleRenderer(gl);
const radialRenderer = createRadialRenderer(gl);
const waterfallRenderer = createWaterfallRenderer(gl);
const dotRingRenderer = createDotRingRenderer(gl);
const oscilloscopeRenderer = createOscilloscopeRenderer(gl);

const RENDERERS = {
  [DISPLAY_MODES.line]: lineRenderer,
  [DISPLAY_MODES.bar]: barRenderer,
  [DISPLAY_MODES.area]: areaRenderer,
  [DISPLAY_MODES.gradientBar]: gradientBarRenderer,
  [DISPLAY_MODES.glowLine]: glowLineRenderer,
  [DISPLAY_MODES.glowCircle]: glowCircleRenderer,
  [DISPLAY_MODES.radial]: radialRenderer,
  [DISPLAY_MODES.waterfall]: waterfallRenderer,
  [DISPLAY_MODES.dotRing]: dotRingRenderer,
  [DISPLAY_MODES.oscilloscope]: oscilloscopeRenderer,
};

const waveShapeConfig = { ...DEFAULT_CONFIG.line.shape };
const barShapeConfig = { ...DEFAULT_CONFIG.bar.shape };
const areaShapeConfig = { ...DEFAULT_CONFIG.area.shape };
const gradientBarShapeConfig = { ...DEFAULT_CONFIG.gradientBar.shape };
const glowLineShapeConfig = { ...DEFAULT_CONFIG.glowLine.shape };
const glowCircleShapeConfig = { ...DEFAULT_CONFIG.glowCircle.shape };
const radialShapeConfig = { ...DEFAULT_CONFIG.radial.shape };
const waterfallShapeConfig = { ...DEFAULT_CONFIG.waterfall.shape };
const dotRingShapeConfig = { ...DEFAULT_CONFIG.dotRing.shape };

let latestPoints = [];
let latestTimeSamples = [];
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

function applyGlowLineShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  glowLineShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  glowLineShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  glowLineShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  glowLineShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyGlowCircleShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  glowCircleShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  glowCircleShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  glowCircleShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  glowCircleShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyRadialShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  radialShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  radialShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  radialShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  radialShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyWaterfallShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  waterfallShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  waterfallShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  waterfallShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  waterfallShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyDotRingShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  dotRingShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  dotRingShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  dotRingShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  dotRingShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
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
    const glowLineRaw = readWindowStorageString(window.localStorage, windowLabel, "glowLineShape");
    if (glowLineRaw) applyGlowLineShapeConfig(JSON.parse(glowLineRaw));
    const glowCircleRaw = readWindowStorageString(window.localStorage, windowLabel, "glowCircleShape");
    if (glowCircleRaw) applyGlowCircleShapeConfig(JSON.parse(glowCircleRaw));
    const radialRaw = readWindowStorageString(window.localStorage, windowLabel, "radialShape");
    if (radialRaw) applyRadialShapeConfig(JSON.parse(radialRaw));
    const waterfallRaw = readWindowStorageString(window.localStorage, windowLabel, "waterfallShape");
    if (waterfallRaw) applyWaterfallShapeConfig(JSON.parse(waterfallRaw));
    const dotRingRaw = readWindowStorageString(window.localStorage, windowLabel, "dotRingShape");
    if (dotRingRaw) applyDotRingShapeConfig(JSON.parse(dotRingRaw));
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
const glowLineCoreRgb = { r: 0, g: 0, b: 0 };
const glowLineGlowRgb = { r: 0, g: 0, b: 0 };
const glowCircleCoreRgb = { r: 0, g: 0, b: 0 };
const glowCircleGlowRgb = { r: 0, g: 0, b: 0 };
const radialBarRgb = { r: 0, g: 0, b: 0 };
const waterfallColorLowRgb = { r: 0, g: 0, b: 0 };
const waterfallColorHighRgb = { r: 0, g: 0, b: 0 };
const dotRingDotRgb = { r: 0, g: 0, b: 0 };
const oscilloscopeLineRgb = { r: 0, g: 0, b: 0 };

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
applyGlowLineCoreColorHex(DEFAULT_CONFIG.glowLine.coreColor);
applyGlowLineGlowColorHex(DEFAULT_CONFIG.glowLine.glowColor);
applyGlowCircleCoreColorHex(DEFAULT_CONFIG.glowCircle.coreColor);
applyGlowCircleGlowColorHex(DEFAULT_CONFIG.glowCircle.glowColor);
applyRadialBarColorHex(DEFAULT_CONFIG.radial.barColor);
applyWaterfallColorLowHex(DEFAULT_CONFIG.waterfall.colorLow);
applyWaterfallColorHighHex(DEFAULT_CONFIG.waterfall.colorHigh);
applyDotRingDotColorHex(DEFAULT_CONFIG.dotRing.dotColor);
applyOscilloscopeColorHex(DEFAULT_CONFIG.oscilloscope.lineColor);

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
let glowLineWidthPx = DEFAULT_CONFIG.glowLine.lineWidthPx;
let glowLineGlowRadiusPx = DEFAULT_CONFIG.glowLine.glowRadiusPx;
let glowLineGlowIntensityPercent = DEFAULT_CONFIG.glowLine.glowIntensityPercent;
let glowLineGlowPasses = DEFAULT_CONFIG.glowLine.glowPasses;
let glowCircleWidthPx = DEFAULT_CONFIG.glowCircle.lineWidthPx;
let glowCircleGlowRadiusPx = DEFAULT_CONFIG.glowCircle.glowRadiusPx;
let glowCircleGlowIntensityPercent = DEFAULT_CONFIG.glowCircle.glowIntensityPercent;
let glowCircleGlowPasses = DEFAULT_CONFIG.glowCircle.glowPasses;
let glowCircleRingRadiusPercent = DEFAULT_CONFIG.glowCircle.ringRadiusPercent;
let glowCircleRotationOffsetDeg = DEFAULT_CONFIG.glowCircle.rotationOffsetDeg;
let glowCircleClockwise = DEFAULT_CONFIG.glowCircle.clockwise;
let radialInnerRadiusPercent = DEFAULT_CONFIG.radial.innerRadiusPercent;
let radialOuterRadiusPercent = DEFAULT_CONFIG.radial.outerRadiusPercent;
let radialBarThicknessPercent = DEFAULT_CONFIG.radial.barThicknessPercent;
let radialMirrorEnabled = DEFAULT_CONFIG.radial.mirrorEnabled;
let radialRotationOffsetDeg = DEFAULT_CONFIG.radial.rotationOffsetDeg;
let radialClockwise = DEFAULT_CONFIG.radial.clockwise;
let waterfallHistoryRows = DEFAULT_CONFIG.waterfall.historyRows;
let waterfallScrollEveryNFrames = DEFAULT_CONFIG.waterfall.scrollEveryNFrames;
let waterfallRowGapPercent = DEFAULT_CONFIG.waterfall.rowGapPercent;
let dotRingRadiusPercent = DEFAULT_CONFIG.dotRing.ringRadiusPercent;
let dotRingDotCount = DEFAULT_CONFIG.dotRing.dotCount;
let dotRingDotSizePx = DEFAULT_CONFIG.dotRing.dotSizePx;
let dotRingPulseEnabled = DEFAULT_CONFIG.dotRing.pulseEnabled;
let oscilloscopeLineWidthPx = DEFAULT_CONFIG.oscilloscope.lineWidthPx;
let oscilloscopePhosphorEnabled = DEFAULT_CONFIG.oscilloscope.phosphorEnabled;
let oscilloscopePhosphorDecayPercent = DEFAULT_CONFIG.oscilloscope.phosphorDecayPercent;
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

function applyGlowLineCoreColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.glowLine.coreColor;
  const { r, g, b } = hexToRgb(safe);
  glowLineCoreRgb.r = r / 255;
  glowLineCoreRgb.g = g / 255;
  glowLineCoreRgb.b = b / 255;
}

function applyGlowLineGlowColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.glowLine.glowColor;
  const { r, g, b } = hexToRgb(safe);
  glowLineGlowRgb.r = r / 255;
  glowLineGlowRgb.g = g / 255;
  glowLineGlowRgb.b = b / 255;
}

function applyGlowLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  glowLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyGlowLineGlowRadiusPx(n) {
  glowLineGlowRadiusPx = clampInt(n, 2, 24);
}

function applyGlowLineGlowIntensityPercent(n) {
  glowLineGlowIntensityPercent = clampInt(n, 0, 100);
}

function applyGlowCircleCoreColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.glowCircle.coreColor;
  const { r, g, b } = hexToRgb(safe);
  glowCircleCoreRgb.r = r / 255;
  glowCircleCoreRgb.g = g / 255;
  glowCircleCoreRgb.b = b / 255;
}

function applyGlowCircleGlowColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.glowCircle.glowColor;
  const { r, g, b } = hexToRgb(safe);
  glowCircleGlowRgb.r = r / 255;
  glowCircleGlowRgb.g = g / 255;
  glowCircleGlowRgb.b = b / 255;
}

function applyGlowCircleWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  glowCircleWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyGlowCircleGlowRadiusPx(n) {
  glowCircleGlowRadiusPx = clampInt(n, 2, 24);
}

function applyGlowCircleGlowIntensityPercent(n) {
  glowCircleGlowIntensityPercent = clampInt(n, 0, 100);
}

function applyGlowCircleRingRadiusPercent(n) {
  glowCircleRingRadiusPercent = clampInt(n, 10, 85);
}

function applyGlowCircleRotationOffsetDeg(n) {
  glowCircleRotationOffsetDeg = clampInt(n, -180, 180);
}

function applyGlowCircleClockwise(value) {
  glowCircleClockwise = parseBoolean(value, DEFAULT_CONFIG.glowCircle.clockwise);
}

function applyRadialBarColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.radial.barColor;
  const { r, g, b } = hexToRgb(safe);
  radialBarRgb.r = r / 255;
  radialBarRgb.g = g / 255;
  radialBarRgb.b = b / 255;
}

function applyRadialInnerRadiusPercent(n) {
  radialInnerRadiusPercent = clampInt(n, 0, 80);
}

function applyRadialOuterRadiusPercent(n) {
  radialOuterRadiusPercent = clampInt(n, 5, 95);
}

function applyRadialBarThicknessPercent(n) {
  radialBarThicknessPercent = clampInt(n, 10, 100);
}

function applyRadialMirrorEnabled(value) {
  radialMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.radial.mirrorEnabled);
}

function applyRadialRotationOffsetDeg(n) {
  radialRotationOffsetDeg = clampInt(n, -180, 180);
}

function applyRadialClockwise(value) {
  radialClockwise = parseBoolean(value, DEFAULT_CONFIG.radial.clockwise);
}

function applyWaterfallColorLowHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.waterfall.colorLow;
  const { r, g, b } = hexToRgb(safe);
  waterfallColorLowRgb.r = r / 255;
  waterfallColorLowRgb.g = g / 255;
  waterfallColorLowRgb.b = b / 255;
}

function applyWaterfallColorHighHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.waterfall.colorHigh;
  const { r, g, b } = hexToRgb(safe);
  waterfallColorHighRgb.r = r / 255;
  waterfallColorHighRgb.g = g / 255;
  waterfallColorHighRgb.b = b / 255;
}

function applyWaterfallHistoryRows(n) {
  waterfallHistoryRows = clampInt(n, 16, 128);
}

function applyWaterfallScrollEveryNFrames(n) {
  waterfallScrollEveryNFrames = clampInt(n, 1, 8);
}

function applyWaterfallRowGapPercent(n) {
  waterfallRowGapPercent = clampInt(n, 0, 50);
}

function applyDotRingDotColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.dotRing.dotColor;
  const { r, g, b } = hexToRgb(safe);
  dotRingDotRgb.r = r / 255;
  dotRingDotRgb.g = g / 255;
  dotRingDotRgb.b = b / 255;
}

function applyDotRingRadiusPercent(n) {
  dotRingRadiusPercent = clampInt(n, 10, 95);
}

function applyDotRingDotCount(n) {
  dotRingDotCount = clampInt(n, 4, 128);
}

function applyDotRingDotSizePx(n) {
  dotRingDotSizePx = clampInt(n, 2, 24);
}

function applyDotRingPulseEnabled(value) {
  dotRingPulseEnabled = parseBoolean(value, DEFAULT_CONFIG.dotRing.pulseEnabled);
}

function applyOscilloscopeColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.oscilloscope.lineColor;
  const { r, g, b } = hexToRgb(safe);
  oscilloscopeLineRgb.r = r / 255;
  oscilloscopeLineRgb.g = g / 255;
  oscilloscopeLineRgb.b = b / 255;
}

function applyOscilloscopeLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  oscilloscopeLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyOscilloscopePhosphorEnabled(value) {
  oscilloscopePhosphorEnabled = parseBoolean(value, DEFAULT_CONFIG.oscilloscope.phosphorEnabled);
}

function applyOscilloscopePhosphorDecayPercent(n) {
  oscilloscopePhosphorDecayPercent = clampInt(n, 10, 95);
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
  if (mode === DISPLAY_MODES.glowLine) return glowLineShapeConfig;
  if (mode === DISPLAY_MODES.glowCircle) return glowCircleShapeConfig;
  if (mode === DISPLAY_MODES.radial) return radialShapeConfig;
  if (mode === DISPLAY_MODES.waterfall) return waterfallShapeConfig;
  if (mode === DISPLAY_MODES.dotRing) return dotRingShapeConfig;
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
  if (mode === DISPLAY_MODES.glowLine) {
    return {
      coreColor: glowLineCoreRgb,
      glowColor: glowLineGlowRgb,
      lineWidthPx: glowLineWidthPx,
      glowRadiusPx: glowLineGlowRadiusPx,
      glowIntensity: glowLineGlowIntensityPercent / 100,
      glowPasses: glowLineGlowPasses,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.glowCircle) {
    return {
      coreColor: glowCircleCoreRgb,
      glowColor: glowCircleGlowRgb,
      lineWidthPx: glowCircleWidthPx,
      glowRadiusPx: glowCircleGlowRadiusPx,
      glowIntensity: glowCircleGlowIntensityPercent / 100,
      glowPasses: glowCircleGlowPasses,
      ringRadiusPercent: glowCircleRingRadiusPercent,
      rotationOffsetDeg: glowCircleRotationOffsetDeg,
      clockwise: glowCircleClockwise,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.radial) {
    return {
      barColor: radialBarRgb,
      innerRadiusPercent: radialInnerRadiusPercent,
      outerRadiusPercent: radialOuterRadiusPercent,
      barThicknessPercent: radialBarThicknessPercent,
      mirrorEnabled: radialMirrorEnabled,
      rotationOffsetDeg: radialRotationOffsetDeg,
      clockwise: radialClockwise,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.waterfall) {
    return {
      colorLow: waterfallColorLowRgb,
      colorHigh: waterfallColorHighRgb,
      historyRows: waterfallHistoryRows,
      scrollEveryNFrames: waterfallScrollEveryNFrames,
      rowGapPercent: waterfallRowGapPercent,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.dotRing) {
    return {
      dotColor: dotRingDotRgb,
      ringRadiusPercent: dotRingRadiusPercent,
      dotCount: dotRingDotCount,
      dotSizePx: dotRingDotSizePx,
      pulseEnabled: dotRingPulseEnabled,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.oscilloscope) {
    return {
      color: oscilloscopeLineRgb,
      lineWidthPx: oscilloscopeLineWidthPx,
      phosphorEnabled: oscilloscopePhosphorEnabled,
      phosphorDecay: oscilloscopePhosphorDecayPercent / 100,
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
  const renderData =
    displayMode === DISPLAY_MODES.oscilloscope ? latestTimeSamples : latestPoints;
  renderer.render(renderData, getShapeConfigForMode(displayMode), getStyleConfigForMode(displayMode));

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
    if (Array.isArray(payload.time_samples)) {
      latestTimeSamples = payload.time_samples;
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
    "waveform-glow-line-core-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGlowLineCoreColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-line-glow-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGlowLineGlowColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-line-width",
    (event) => {
      applyGlowLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-line-glow-radius",
    (event) => {
      applyGlowLineGlowRadiusPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-line-glow-intensity",
    (event) => {
      applyGlowLineGlowIntensityPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-line-shape-config",
    (event) => {
      applyGlowLineShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-core-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGlowCircleCoreColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-glow-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyGlowCircleGlowColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-width",
    (event) => {
      applyGlowCircleWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-glow-radius",
    (event) => {
      applyGlowCircleGlowRadiusPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-glow-intensity",
    (event) => {
      applyGlowCircleGlowIntensityPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-ring-radius",
    (event) => {
      applyGlowCircleRingRadiusPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-rotation",
    (event) => {
      applyGlowCircleRotationOffsetDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-clockwise",
    (event) => {
      applyGlowCircleClockwise(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-glow-circle-shape-config",
    (event) => {
      applyGlowCircleShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyRadialBarColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-inner-radius",
    (event) => {
      applyRadialInnerRadiusPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-outer-radius",
    (event) => {
      applyRadialOuterRadiusPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-bar-thickness",
    (event) => {
      applyRadialBarThicknessPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-mirror",
    (event) => {
      applyRadialMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-rotation",
    (event) => {
      applyRadialRotationOffsetDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-clockwise",
    (event) => {
      applyRadialClockwise(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-radial-shape-config",
    (event) => {
      applyRadialShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-waterfall-color-low",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyWaterfallColorLowHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-waterfall-color-high",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyWaterfallColorHighHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-waterfall-history-rows",
    (event) => {
      applyWaterfallHistoryRows(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-waterfall-scroll-every-n-frames",
    (event) => {
      applyWaterfallScrollEveryNFrames(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-waterfall-row-gap",
    (event) => {
      applyWaterfallRowGapPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-waterfall-shape-config",
    (event) => {
      applyWaterfallShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-dot-ring-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyDotRingDotColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-dot-ring-radius",
    (event) => {
      applyDotRingRadiusPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-dot-ring-count",
    (event) => {
      applyDotRingDotCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-dot-ring-size",
    (event) => {
      applyDotRingDotSizePx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-dot-ring-pulse",
    (event) => {
      applyDotRingPulseEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-dot-ring-shape-config",
    (event) => {
      applyDotRingShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oscilloscope-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyOscilloscopeColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oscilloscope-line-width",
    (event) => {
      applyOscilloscopeLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oscilloscope-phosphor",
    (event) => {
      applyOscilloscopePhosphorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oscilloscope-phosphor-decay",
    (event) => {
      applyOscilloscopePhosphorDecayPercent(event.payload);
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
    applyGlowLineCoreColorHex(readWindowStorageString(window.localStorage, windowLabel, "glowLineCoreColor"));
    applyGlowLineGlowColorHex(readWindowStorageString(window.localStorage, windowLabel, "glowLineGlowColor"));
    const savedGlowLineWidth = readWindowStorageString(window.localStorage, windowLabel, "glowLineWidth");
    if (savedGlowLineWidth != null && savedGlowLineWidth !== "") {
      applyGlowLineWidthPx(savedGlowLineWidth);
    }
    const savedGlowLineRadius = readWindowStorageString(window.localStorage, windowLabel, "glowLineGlowRadius");
    if (savedGlowLineRadius != null && savedGlowLineRadius !== "") {
      applyGlowLineGlowRadiusPx(savedGlowLineRadius);
    }
    const savedGlowLineIntensity = readWindowStorageString(window.localStorage, windowLabel, "glowLineGlowIntensity");
    if (savedGlowLineIntensity != null && savedGlowLineIntensity !== "") {
      applyGlowLineGlowIntensityPercent(savedGlowLineIntensity);
    }
    applyGlowCircleCoreColorHex(readWindowStorageString(window.localStorage, windowLabel, "glowCircleCoreColor"));
    applyGlowCircleGlowColorHex(readWindowStorageString(window.localStorage, windowLabel, "glowCircleGlowColor"));
    const savedGlowCircleWidth = readWindowStorageString(window.localStorage, windowLabel, "glowCircleWidth");
    if (savedGlowCircleWidth != null && savedGlowCircleWidth !== "") {
      applyGlowCircleWidthPx(savedGlowCircleWidth);
    }
    const savedGlowCircleRadius = readWindowStorageString(window.localStorage, windowLabel, "glowCircleGlowRadius");
    if (savedGlowCircleRadius != null && savedGlowCircleRadius !== "") {
      applyGlowCircleGlowRadiusPx(savedGlowCircleRadius);
    }
    const savedGlowCircleIntensity = readWindowStorageString(window.localStorage, windowLabel, "glowCircleGlowIntensity");
    if (savedGlowCircleIntensity != null && savedGlowCircleIntensity !== "") {
      applyGlowCircleGlowIntensityPercent(savedGlowCircleIntensity);
    }
    const savedGlowCircleRingRadius = readWindowStorageString(window.localStorage, windowLabel, "glowCircleRingRadius");
    if (savedGlowCircleRingRadius != null && savedGlowCircleRingRadius !== "") {
      applyGlowCircleRingRadiusPercent(savedGlowCircleRingRadius);
    }
    const savedGlowCircleRotation = readWindowStorageString(window.localStorage, windowLabel, "glowCircleRotation");
    if (savedGlowCircleRotation != null && savedGlowCircleRotation !== "") {
      applyGlowCircleRotationOffsetDeg(savedGlowCircleRotation);
    }
    applyGlowCircleClockwise(readWindowStorageString(window.localStorage, windowLabel, "glowCircleClockwise"));
    applyRadialBarColorHex(readWindowStorageString(window.localStorage, windowLabel, "radialColor"));
    const savedRadialInner = readWindowStorageString(window.localStorage, windowLabel, "radialInnerRadius");
    if (savedRadialInner != null && savedRadialInner !== "") {
      applyRadialInnerRadiusPercent(savedRadialInner);
    }
    const savedRadialOuter = readWindowStorageString(window.localStorage, windowLabel, "radialOuterRadius");
    if (savedRadialOuter != null && savedRadialOuter !== "") {
      applyRadialOuterRadiusPercent(savedRadialOuter);
    }
    const savedRadialThickness = readWindowStorageString(window.localStorage, windowLabel, "radialBarThickness");
    if (savedRadialThickness != null && savedRadialThickness !== "") {
      applyRadialBarThicknessPercent(savedRadialThickness);
    }
    applyRadialMirrorEnabled(readWindowStorageString(window.localStorage, windowLabel, "radialMirror"));
    const savedRadialRotation = readWindowStorageString(window.localStorage, windowLabel, "radialRotation");
    if (savedRadialRotation != null && savedRadialRotation !== "") {
      applyRadialRotationOffsetDeg(savedRadialRotation);
    }
    applyRadialClockwise(readWindowStorageString(window.localStorage, windowLabel, "radialClockwise"));
    applyWaterfallColorLowHex(readWindowStorageString(window.localStorage, windowLabel, "waterfallColorLow"));
    applyWaterfallColorHighHex(readWindowStorageString(window.localStorage, windowLabel, "waterfallColorHigh"));
    const savedWaterfallHistoryRows = readWindowStorageString(window.localStorage, windowLabel, "waterfallHistoryRows");
    if (savedWaterfallHistoryRows != null && savedWaterfallHistoryRows !== "") {
      applyWaterfallHistoryRows(savedWaterfallHistoryRows);
    }
    const savedWaterfallScroll = readWindowStorageString(window.localStorage, windowLabel, "waterfallScrollEveryNFrames");
    if (savedWaterfallScroll != null && savedWaterfallScroll !== "") {
      applyWaterfallScrollEveryNFrames(savedWaterfallScroll);
    }
    const savedWaterfallRowGap = readWindowStorageString(window.localStorage, windowLabel, "waterfallRowGap");
    if (savedWaterfallRowGap != null && savedWaterfallRowGap !== "") {
      applyWaterfallRowGapPercent(savedWaterfallRowGap);
    }
    applyDotRingDotColorHex(readWindowStorageString(window.localStorage, windowLabel, "dotRingColor"));
    const savedDotRingRadius = readWindowStorageString(window.localStorage, windowLabel, "dotRingRadius");
    if (savedDotRingRadius != null && savedDotRingRadius !== "") {
      applyDotRingRadiusPercent(savedDotRingRadius);
    }
    const savedDotRingCount = readWindowStorageString(window.localStorage, windowLabel, "dotRingCount");
    if (savedDotRingCount != null && savedDotRingCount !== "") {
      applyDotRingDotCount(savedDotRingCount);
    }
    const savedDotRingSize = readWindowStorageString(window.localStorage, windowLabel, "dotRingSize");
    if (savedDotRingSize != null && savedDotRingSize !== "") {
      applyDotRingDotSizePx(savedDotRingSize);
    }
    applyDotRingPulseEnabled(readWindowStorageString(window.localStorage, windowLabel, "dotRingPulse"));
    applyOscilloscopeColorHex(readWindowStorageString(window.localStorage, windowLabel, "oscilloscopeColor"));
    const savedOscilloscopeWidth = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "oscilloscopeLineWidth",
    );
    if (savedOscilloscopeWidth != null && savedOscilloscopeWidth !== "") {
      applyOscilloscopeLineWidthPx(savedOscilloscopeWidth);
    }
    applyOscilloscopePhosphorEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "oscilloscopePhosphor"),
    );
    const savedOscilloscopeDecay = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "oscilloscopePhosphorDecay",
    );
    if (savedOscilloscopeDecay != null && savedOscilloscopeDecay !== "") {
      applyOscilloscopePhosphorDecayPercent(savedOscilloscopeDecay);
    }
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
