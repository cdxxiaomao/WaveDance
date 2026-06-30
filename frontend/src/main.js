import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { syncEspDisplayConfigFromStorage } from "./espDisplaySettings.js";
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
import { createObliqueBarRenderer } from "./renderers/obliqueBarRenderer.js";
import { createDepthLayersRenderer } from "./renderers/depthLayersRenderer.js";
import { createIsometricSkylineRenderer } from "./renderers/isometricSkylineRenderer.js";
import { createRing3dRenderer } from "./renderers/ring3dRenderer.js";
import { createTerrain3dRenderer } from "./renderers/terrain3dRenderer.js";
import { createHelix3dRenderer } from "./renderers/helix3dRenderer.js";
import { createThreeBridge } from "./renderers/three/threeBridge.js";
import { normalizeCoverArtState } from "./renderers/three/coverTextureLoader.js";
import "./renderers/three/registerModes.js";
import {
  clampInt,
  DEFAULT_CONFIG,
  DISPLAY_MODES,
  isThreeDisplayMode,
  normalizeDisplayMode,
  normalizeDepthLayersRenderStyle,
  normalizeHelix3dExtrudeMode,
  normalizeKaleidoscopeSegments,
  parseBoolean,
  readWindowStorageString,
  readBarPeakHoldMode,
  readGradientBarPeakHoldMode,
  normalizeBarPeakHoldMode,
  PEAK_HOLD_MODES,
} from "./visualizationSchema.js";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const canvas = document.querySelector("#waveCanvas");
const threeCanvas = document.querySelector("#waveCanvasThree");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const resizeHandles = Array.from(document.querySelectorAll("[data-resize-dir]"));

/** @param {WebGLRenderingContext} webgl */
function createVanillaRenderers(webgl) {
  return {
    [DISPLAY_MODES.line]: createLineRenderer(webgl),
    [DISPLAY_MODES.bar]: createBarRenderer(webgl),
    [DISPLAY_MODES.area]: createAreaRenderer(webgl),
    [DISPLAY_MODES.gradientBar]: createGradientBarRenderer(webgl),
    [DISPLAY_MODES.glowLine]: createGlowLineRenderer(webgl),
    [DISPLAY_MODES.glowCircle]: createGlowCircleRenderer(webgl),
    [DISPLAY_MODES.radial]: createRadialRenderer(webgl),
    [DISPLAY_MODES.waterfall]: createWaterfallRenderer(webgl),
    [DISPLAY_MODES.dotRing]: createDotRingRenderer(webgl),
    [DISPLAY_MODES.oscilloscope]: createOscilloscopeRenderer(webgl),
    [DISPLAY_MODES.obliqueBar]: createObliqueBarRenderer(webgl),
    [DISPLAY_MODES.depthLayers]: createDepthLayersRenderer(webgl),
    [DISPLAY_MODES.isometricSkyline]: createIsometricSkylineRenderer(webgl),
    [DISPLAY_MODES.ring3d]: createRing3dRenderer(webgl),
    [DISPLAY_MODES.terrain3d]: createTerrain3dRenderer(webgl),
    [DISPLAY_MODES.helix3d]: createHelix3dRenderer(webgl),
  };
}

function acquireVanillaGl() {
  const webgl = canvas.getContext("webgl");
  if (!webgl) {
    throw new Error("当前环境不支持 WebGL");
  }
  return webgl;
}

let gl = acquireVanillaGl();
let RENDERERS = createVanillaRenderers(gl);
const threeBridge = createThreeBridge();
/** @type {"vanilla" | "three"} */
let renderBackend = "vanilla";
/** Three 初始化失败的模式 id，避免每帧反复 lose/restore 上下文 */
let threeInitBlockedMode = null;

const waveShapeConfig = { ...DEFAULT_CONFIG.line.shape };
const barShapeConfig = { ...DEFAULT_CONFIG.bar.shape };
const areaShapeConfig = { ...DEFAULT_CONFIG.area.shape };
const gradientBarShapeConfig = { ...DEFAULT_CONFIG.gradientBar.shape };
const glowLineShapeConfig = { ...DEFAULT_CONFIG.glowLine.shape };
const glowCircleShapeConfig = { ...DEFAULT_CONFIG.glowCircle.shape };
const radialShapeConfig = { ...DEFAULT_CONFIG.radial.shape };
const waterfallShapeConfig = { ...DEFAULT_CONFIG.waterfall.shape };
const dotRingShapeConfig = { ...DEFAULT_CONFIG.dotRing.shape };
const obliqueBarShapeConfig = { ...DEFAULT_CONFIG.obliqueBar.shape };
const depthLayersShapeConfig = { ...DEFAULT_CONFIG.depthLayers.shape };
const isometricSkylineShapeConfig = { ...DEFAULT_CONFIG.isometricSkyline.shape };
const ring3dShapeConfig = { ...DEFAULT_CONFIG.ring3d.shape };
const terrain3dShapeConfig = { ...DEFAULT_CONFIG.terrain3d.shape };
const helix3dShapeConfig = { ...DEFAULT_CONFIG.helix3d.shape };
const threePlasmaShapeConfig = { ...DEFAULT_CONFIG.threePlasmaField.shape };
const threeGalaxyShapeConfig = { ...DEFAULT_CONFIG.threeParticleGalaxy.shape };
const threeTunnelShapeConfig = { ...DEFAULT_CONFIG.threeBloomTunnel.shape };
const threeSphereShapeConfig = { ...DEFAULT_CONFIG.threeEnergySphere.shape };
const threeKaleidoscopeShapeConfig = { ...DEFAULT_CONFIG.threeKaleidoscope.shape };
const threeGlitchShapeConfig = { ...DEFAULT_CONFIG.threeGlitchSpectrum.shape };
const threePhosphorShapeConfig = { ...DEFAULT_CONFIG.threePhosphorTrail.shape };
const threeScanGridShapeConfig = { ...DEFAULT_CONFIG.threeScanGrid.shape };
const threeSoundFieldShapeConfig = { ...DEFAULT_CONFIG.threeSoundField.shape };
const threeSoundField2ShapeConfig = { ...DEFAULT_CONFIG.threeSoundField2.shape };
const threeLiquidBlobShapeConfig = { ...DEFAULT_CONFIG.threeLiquidBlob.shape };
const threeAuroraShapeConfig = { ...DEFAULT_CONFIG.threeAuroraRibbon.shape };
const threeBreathingRingsShapeConfig = { ...DEFAULT_CONFIG.threeBreathingRings.shape };
const threeNoiseLandscapeShapeConfig = { ...DEFAULT_CONFIG.threeNoiseLandscape.shape };
const threeLavaLampShapeConfig = { ...DEFAULT_CONFIG.threeLavaLamp.shape };
const threeOilMarbleShapeConfig = { ...DEFAULT_CONFIG.threeOilMarble.shape };
const threePearlChainShapeConfig = { ...DEFAULT_CONFIG.threePearlChain.shape };
const threeCrystalGemShapeConfig = { ...DEFAULT_CONFIG.threeCrystalGem.shape };
const threeGlassOrbsShapeConfig = { ...DEFAULT_CONFIG.threeGlassOrbs.shape };
const threeHoloPrismShapeConfig = { ...DEFAULT_CONFIG.threeHoloPrism.shape };
const threeNebulaVolumeShapeConfig = { ...DEFAULT_CONFIG.threeNebulaVolume.shape };
const threeKnotOrganicShapeConfig = { ...DEFAULT_CONFIG.threeKnotOrganic.shape };
const threeCoverShapeConfig = { ...DEFAULT_CONFIG.threeCoverParticle.shape };

let latestPoints = [];
let latestTimeSamples = [];
let latestPeak = 0;
let latestRms = 0;
/** @type {import('./renderers/three/coverTextureLoader.js').CoverArtState} */
let coverArtState = {
  active: false,
  title: "",
  artist: "",
  artworkPath: "",
  artworkRevision: 0,
  artworkDataUrl: "",
};
let coverArtSnapshotTimers = [];
let coverArtPollTimer = 0;
let displayMode = DEFAULT_CONFIG.displayMode;

function getCoverArtResolution() {
  return threeCoverResolution;
}

function pushCoverArtToLoader(state = coverArtState) {
  threeBridge.getCoverTextureLoader().update(state, getCoverArtResolution());
}

/** @param {unknown} state */
function applyCoverArtState(state) {
  coverArtState = normalizeCoverArtState(state);
  pushCoverArtToLoader(coverArtState);
}

async function refreshCoverArtFromSnapshot() {
  try {
    const snap = await invoke("get_now_playing_snapshot");
    applyCoverArtState(snap);
  } catch (err) {
    console.warn("refreshCoverArtFromSnapshot failed:", err);
  }
}

function clearCoverArtSnapshotTimers() {
  for (const timer of coverArtSnapshotTimers) {
    window.clearTimeout(timer);
  }
  coverArtSnapshotTimers = [];
}

function scheduleCoverArtSnapshotRefresh() {
  clearCoverArtSnapshotTimers();
  for (const delayMs of [120, 450, 1200]) {
    coverArtSnapshotTimers.push(
      window.setTimeout(() => {
        void refreshCoverArtFromSnapshot();
      }, delayMs),
    );
  }
}

function stopCoverArtPolling() {
  if (!coverArtPollTimer) return;
  window.clearInterval(coverArtPollTimer);
  coverArtPollTimer = 0;
}

function syncCoverArtPollingForMode(mode) {
  stopCoverArtPolling();
  if (mode !== DISPLAY_MODES.threeCoverParticle) return;
  coverArtPollTimer = window.setInterval(() => {
    void refreshCoverArtFromSnapshot();
  }, 2500);
  void refreshCoverArtFromSnapshot();
}

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

function applyObliqueBarShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  obliqueBarShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  obliqueBarShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  obliqueBarShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  obliqueBarShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyDepthLayersShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  depthLayersShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  depthLayersShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  depthLayersShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  depthLayersShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyIsometricSkylineShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  isometricSkylineShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  isometricSkylineShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  isometricSkylineShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  isometricSkylineShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyRing3dShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  ring3dShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  ring3dShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  ring3dShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  ring3dShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyTerrain3dShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  terrain3dShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  terrain3dShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  terrain3dShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  terrain3dShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyHelix3dShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  helix3dShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  helix3dShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  helix3dShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  helix3dShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreePlasmaShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threePlasmaShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threePlasmaShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threePlasmaShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threePlasmaShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeGalaxyShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeGalaxyShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeGalaxyShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeGalaxyShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeGalaxyShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeTunnelShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeTunnelShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeTunnelShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeTunnelShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeTunnelShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeSphereShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeSphereShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeSphereShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeSphereShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeSphereShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeKaleidoscopeShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeKaleidoscopeShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeKaleidoscopeShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeKaleidoscopeShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeKaleidoscopeShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeGlitchShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeGlitchShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeGlitchShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeGlitchShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeGlitchShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreePhosphorShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threePhosphorShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threePhosphorShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threePhosphorShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threePhosphorShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeScanGridShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeScanGridShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeScanGridShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeScanGridShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeScanGridShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeSoundFieldShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeSoundFieldShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeSoundFieldShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeSoundFieldShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeSoundFieldShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeSoundField2ShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeSoundField2ShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeSoundField2ShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeSoundField2ShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeSoundField2ShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeLiquidBlobShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeLiquidBlobShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeLiquidBlobShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeLiquidBlobShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeLiquidBlobShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeAuroraShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeAuroraShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeAuroraShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeAuroraShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeAuroraShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeBreathingRingsShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeBreathingRingsShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeBreathingRingsShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeBreathingRingsShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeBreathingRingsShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeNoiseLandscapeShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeNoiseLandscapeShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeNoiseLandscapeShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeNoiseLandscapeShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeNoiseLandscapeShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeLavaLampShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeLavaLampShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeLavaLampShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeLavaLampShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeLavaLampShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeOilMarbleShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeOilMarbleShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeOilMarbleShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeOilMarbleShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeOilMarbleShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreePearlChainShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threePearlChainShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threePearlChainShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threePearlChainShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threePearlChainShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeCrystalGemShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeCrystalGemShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeCrystalGemShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeCrystalGemShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeCrystalGemShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeGlassOrbsShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeGlassOrbsShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeGlassOrbsShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeGlassOrbsShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeGlassOrbsShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeHoloPrismShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeHoloPrismShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeHoloPrismShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeHoloPrismShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeHoloPrismShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeNebulaVolumeShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeNebulaVolumeShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeNebulaVolumeShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeNebulaVolumeShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeNebulaVolumeShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeKnotOrganicShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeKnotOrganicShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeKnotOrganicShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeKnotOrganicShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeKnotOrganicShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyThreeCoverShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  threeCoverShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  threeCoverShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  threeCoverShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  threeCoverShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
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
    const obliqueBarRaw = readWindowStorageString(window.localStorage, windowLabel, "obliqueBarShape");
    if (obliqueBarRaw) applyObliqueBarShapeConfig(JSON.parse(obliqueBarRaw));
    const depthLayersRaw = readWindowStorageString(window.localStorage, windowLabel, "depthLayersShape");
    if (depthLayersRaw) applyDepthLayersShapeConfig(JSON.parse(depthLayersRaw));
    const isometricSkylineRaw = readWindowStorageString(window.localStorage, windowLabel, "isometricSkylineShape");
    if (isometricSkylineRaw) applyIsometricSkylineShapeConfig(JSON.parse(isometricSkylineRaw));
    const ring3dRaw = readWindowStorageString(window.localStorage, windowLabel, "ring3dShape");
    if (ring3dRaw) applyRing3dShapeConfig(JSON.parse(ring3dRaw));
    const terrain3dRaw = readWindowStorageString(window.localStorage, windowLabel, "terrain3dShape");
    if (terrain3dRaw) applyTerrain3dShapeConfig(JSON.parse(terrain3dRaw));
    const helix3dRaw = readWindowStorageString(window.localStorage, windowLabel, "helix3dShape");
    if (helix3dRaw) applyHelix3dShapeConfig(JSON.parse(helix3dRaw));
    const threePlasmaRaw = readWindowStorageString(window.localStorage, windowLabel, "threePlasmaShape");
    if (threePlasmaRaw) applyThreePlasmaShapeConfig(JSON.parse(threePlasmaRaw));
    const threeGalaxyRaw = readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyShape");
    if (threeGalaxyRaw) applyThreeGalaxyShapeConfig(JSON.parse(threeGalaxyRaw));
    const threeTunnelRaw = readWindowStorageString(window.localStorage, windowLabel, "threeTunnelShape");
    if (threeTunnelRaw) applyThreeTunnelShapeConfig(JSON.parse(threeTunnelRaw));
    const threeSphereRaw = readWindowStorageString(window.localStorage, windowLabel, "threeSphereShape");
    if (threeSphereRaw) applyThreeSphereShapeConfig(JSON.parse(threeSphereRaw));
    const threeKaleidoscopeRaw = readWindowStorageString(window.localStorage, windowLabel, "threeKaleidoscopeShape");
    if (threeKaleidoscopeRaw) applyThreeKaleidoscopeShapeConfig(JSON.parse(threeKaleidoscopeRaw));
    const threeGlitchRaw = readWindowStorageString(window.localStorage, windowLabel, "threeGlitchShape");
    if (threeGlitchRaw) applyThreeGlitchShapeConfig(JSON.parse(threeGlitchRaw));
    const threePhosphorRaw = readWindowStorageString(window.localStorage, windowLabel, "threePhosphorShape");
    if (threePhosphorRaw) applyThreePhosphorShapeConfig(JSON.parse(threePhosphorRaw));
    const threeScanGridRaw = readWindowStorageString(window.localStorage, windowLabel, "threeScanGridShape");
    if (threeScanGridRaw) applyThreeScanGridShapeConfig(JSON.parse(threeScanGridRaw));
    const threeSoundFieldRaw = readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldShape");
    if (threeSoundFieldRaw) applyThreeSoundFieldShapeConfig(JSON.parse(threeSoundFieldRaw));
    const threeSoundField2Raw = readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2Shape");
    if (threeSoundField2Raw) applyThreeSoundField2ShapeConfig(JSON.parse(threeSoundField2Raw));
    const threeLiquidBlobRaw = readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobShape");
    if (threeLiquidBlobRaw) applyThreeLiquidBlobShapeConfig(JSON.parse(threeLiquidBlobRaw));
    const threeAuroraRaw = readWindowStorageString(window.localStorage, windowLabel, "threeAuroraShape");
    if (threeAuroraRaw) applyThreeAuroraShapeConfig(JSON.parse(threeAuroraRaw));
    const threeBreathingRingsRaw = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeBreathingShape",
    );
    if (threeBreathingRingsRaw) applyThreeBreathingRingsShapeConfig(JSON.parse(threeBreathingRingsRaw));
    const threeNoiseLandscapeRaw = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeNoiseShape",
    );
    if (threeNoiseLandscapeRaw) applyThreeNoiseLandscapeShapeConfig(JSON.parse(threeNoiseLandscapeRaw));
    const threeLavaLampRaw = readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampShape");
    if (threeLavaLampRaw) applyThreeLavaLampShapeConfig(JSON.parse(threeLavaLampRaw));
    const threeOilMarbleRaw = readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleShape");
    if (threeOilMarbleRaw) applyThreeOilMarbleShapeConfig(JSON.parse(threeOilMarbleRaw));
    const threePearlChainRaw = readWindowStorageString(window.localStorage, windowLabel, "threePearlChainShape");
    if (threePearlChainRaw) applyThreePearlChainShapeConfig(JSON.parse(threePearlChainRaw));
    const threeCrystalGemRaw = readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemShape");
    if (threeCrystalGemRaw) applyThreeCrystalGemShapeConfig(JSON.parse(threeCrystalGemRaw));
    const threeGlassOrbsRaw = readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsShape");
    if (threeGlassOrbsRaw) applyThreeGlassOrbsShapeConfig(JSON.parse(threeGlassOrbsRaw));
    const threeHoloPrismRaw = readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismShape");
    if (threeHoloPrismRaw) applyThreeHoloPrismShapeConfig(JSON.parse(threeHoloPrismRaw));
    const threeNebulaVolumeRaw = readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeShape");
    if (threeNebulaVolumeRaw) applyThreeNebulaVolumeShapeConfig(JSON.parse(threeNebulaVolumeRaw));
    const threeKnotOrganicRaw = readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicShape");
    if (threeKnotOrganicRaw) applyThreeKnotOrganicShapeConfig(JSON.parse(threeKnotOrganicRaw));
    const threeCoverRaw = readWindowStorageString(window.localStorage, windowLabel, "threeCoverShape");
    if (threeCoverRaw) applyThreeCoverShapeConfig(JSON.parse(threeCoverRaw));
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
const obliqueBarColorNearRgb = { r: 0, g: 0, b: 0 };
const obliqueBarColorFarRgb = { r: 0, g: 0, b: 0 };
const depthLayersColorRgb = { r: 0, g: 0, b: 0 };
const depthLayersColorFarRgb = { r: 0, g: 0, b: 0 };
const isometricSkylineFaceTopRgb = { r: 0, g: 0, b: 0 };
const isometricSkylineFaceLeftRgb = { r: 0, g: 0, b: 0 };
const isometricSkylineFaceRightRgb = { r: 0, g: 0, b: 0 };
const ring3dBarRgb = { r: 0, g: 0, b: 0 };
const terrain3dColorLowRgb = { r: 0, g: 0, b: 0 };
const terrain3dColorHighRgb = { r: 0, g: 0, b: 0 };
const terrain3dWireframeRgb = { r: 0, g: 0, b: 0 };
const helix3dDotRgb = { r: 0, g: 0, b: 0 };

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
applyObliqueBarColorNearHex(DEFAULT_CONFIG.obliqueBar.barColor);
applyObliqueBarColorFarHex(DEFAULT_CONFIG.obliqueBar.barColorFar);
applyDepthLayersColorHex(DEFAULT_CONFIG.depthLayers.color);
applyDepthLayersColorFarHex(DEFAULT_CONFIG.depthLayers.colorFar);
applyIsometricSkylineFaceTopHex(DEFAULT_CONFIG.isometricSkyline.faceTopColor);
applyIsometricSkylineFaceLeftHex(DEFAULT_CONFIG.isometricSkyline.faceLeftColor);
applyIsometricSkylineFaceRightHex(DEFAULT_CONFIG.isometricSkyline.faceRightColor);
applyRing3dBarColorHex(DEFAULT_CONFIG.ring3d.barColor);
applyTerrain3dColorLowHex(DEFAULT_CONFIG.terrain3d.colorLow);
applyTerrain3dColorHighHex(DEFAULT_CONFIG.terrain3d.colorHigh);
applyTerrain3dWireframeColorHex(DEFAULT_CONFIG.terrain3d.wireframeColor);
applyHelix3dDotColorHex(DEFAULT_CONFIG.helix3d.dotColor);

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
let obliqueBarWidthPercent = DEFAULT_CONFIG.obliqueBar.widthPercent;
let obliqueBarGapPercent = DEFAULT_CONFIG.obliqueBar.gapPercent;
let obliqueBarHeadroomPercent = DEFAULT_CONFIG.obliqueBar.headroomPercent;
let obliqueBarTiltDeg = DEFAULT_CONFIG.obliqueBar.tiltDeg;
let obliqueBarShowGroundLine = DEFAULT_CONFIG.obliqueBar.showGroundLine;
let obliqueBarMirrorEnabled = DEFAULT_CONFIG.obliqueBar.mirrorEnabled;
let obliqueBarDisplayBarCount = DEFAULT_CONFIG.obliqueBar.displayBarCount;
let depthLayersLayerCount = DEFAULT_CONFIG.depthLayers.layerCount;
let depthLayersLayerSpacingPx = DEFAULT_CONFIG.depthLayers.layerSpacingPx;
let depthLayersFarScalePercent = DEFAULT_CONFIG.depthLayers.farScalePercent;
let depthLayersFarAlphaPercent = DEFAULT_CONFIG.depthLayers.farAlphaPercent;
let depthLayersBassFrontEnabled = DEFAULT_CONFIG.depthLayers.bassFrontEnabled;
let depthLayersLineWidthPx = DEFAULT_CONFIG.depthLayers.lineWidthPx;
let depthLayersRenderStyle = DEFAULT_CONFIG.depthLayers.renderStyle;
let isometricSkylineBuildingWidthPx = DEFAULT_CONFIG.isometricSkyline.buildingWidthPx;
let isometricSkylineBuildingGapPx = DEFAULT_CONFIG.isometricSkyline.buildingGapPx;
let isometricSkylineBaselinePercent = DEFAULT_CONFIG.isometricSkyline.skylineBaselinePercent;
let isometricSkylineDisplayBuildingCount = DEFAULT_CONFIG.isometricSkyline.displayBuildingCount;
let isometricSkylineShowGroundPlane = DEFAULT_CONFIG.isometricSkyline.showGroundPlane;
let ring3dInnerRadius = DEFAULT_CONFIG.ring3d.innerRadius;
let ring3dOuterRadius = DEFAULT_CONFIG.ring3d.outerRadius;
let ring3dBarHeightScale = DEFAULT_CONFIG.ring3d.barHeightScale;
let ring3dBarThicknessDeg = DEFAULT_CONFIG.ring3d.barThicknessDeg;
let ring3dDisplayBarCount = DEFAULT_CONFIG.ring3d.displayBarCount;
let ring3dWireframeEnabled = DEFAULT_CONFIG.ring3d.wireframeEnabled;
let ring3dFillEnabled = DEFAULT_CONFIG.ring3d.fillEnabled;
let ring3dAutoRotateEnabled = DEFAULT_CONFIG.ring3d.autoRotateEnabled;
let ring3dAutoRotateSpeedDeg = DEFAULT_CONFIG.ring3d.autoRotateSpeedDeg;
let ring3dCameraDistance = DEFAULT_CONFIG.ring3d.cameraDistance;
let ring3dCameraFovDeg = DEFAULT_CONFIG.ring3d.cameraFovDeg;
let ring3dBreatheWithPeak = DEFAULT_CONFIG.ring3d.breatheWithPeak;
let terrain3dGridCols = DEFAULT_CONFIG.terrain3d.gridCols;
let terrain3dGridRows = DEFAULT_CONFIG.terrain3d.gridRows;
let terrain3dScrollEveryNFrames = DEFAULT_CONFIG.terrain3d.scrollEveryNFrames;
let terrain3dWireframeEnabled = DEFAULT_CONFIG.terrain3d.wireframeEnabled;
let terrain3dFillEnabled = DEFAULT_CONFIG.terrain3d.fillEnabled;
let terrain3dTerrainHeightScale = DEFAULT_CONFIG.terrain3d.terrainHeightScale;
let terrain3dCameraPitchDeg = DEFAULT_CONFIG.terrain3d.cameraPitchDeg;
let terrain3dCameraDistance = DEFAULT_CONFIG.terrain3d.cameraDistance;
let terrain3dAutoScrollEnabled = DEFAULT_CONFIG.terrain3d.autoScrollEnabled;
let helix3dHelixRadius = DEFAULT_CONFIG.helix3d.helixRadius;
let helix3dHelixPitch = DEFAULT_CONFIG.helix3d.helixPitch;
let helix3dHelixTurns = DEFAULT_CONFIG.helix3d.helixTurns;
let helix3dDisplayPointCount = DEFAULT_CONFIG.helix3d.displayPointCount;
let helix3dExtrudeMode = DEFAULT_CONFIG.helix3d.extrudeMode;
let helix3dPointSizePx = DEFAULT_CONFIG.helix3d.pointSizePx;
let helix3dWireframeEnabled = DEFAULT_CONFIG.helix3d.wireframeEnabled;
let helix3dAutoRotateEnabled = DEFAULT_CONFIG.helix3d.autoRotateEnabled;
let helix3dAutoRotateSpeedDeg = DEFAULT_CONFIG.helix3d.autoRotateSpeedDeg;
let helix3dCameraDistance = DEFAULT_CONFIG.helix3d.cameraDistance;
let helix3dCameraFovDeg = DEFAULT_CONFIG.helix3d.cameraFovDeg;

let threePlasmaColorLowHex = DEFAULT_CONFIG.threePlasmaField.colorLow;
let threePlasmaColorHighHex = DEFAULT_CONFIG.threePlasmaField.colorHigh;
let threePlasmaSpeed = DEFAULT_CONFIG.threePlasmaField.speed;
let threePlasmaNoiseScale = DEFAULT_CONFIG.threePlasmaField.noiseScale;
let threePlasmaReactiveness = DEFAULT_CONFIG.threePlasmaField.reactiveness;
let threePlasmaBloomEnabled = DEFAULT_CONFIG.threePlasmaField.bloomEnabled;
let threePlasmaBloomStrength = DEFAULT_CONFIG.threePlasmaField.bloomStrength;
let threeGalaxyColorHex = DEFAULT_CONFIG.threeParticleGalaxy.particleColor;
let threeGalaxyParticleCount = DEFAULT_CONFIG.threeParticleGalaxy.particleCount;
let threeGalaxyRadius = DEFAULT_CONFIG.threeParticleGalaxy.galaxyRadius;
let threeGalaxySpiralArms = DEFAULT_CONFIG.threeParticleGalaxy.spiralArms;
let threeGalaxyBassPullStrength = DEFAULT_CONFIG.threeParticleGalaxy.bassPullStrength;
let threeGalaxyTrebleSpreadStrength = DEFAULT_CONFIG.threeParticleGalaxy.trebleSpreadStrength;
let threeGalaxyBloomEnabled = DEFAULT_CONFIG.threeParticleGalaxy.bloomEnabled;
let threeGalaxyBloomStrength = DEFAULT_CONFIG.threeParticleGalaxy.bloomStrength;
let threeGalaxyAutoRotateSpeedDeg = DEFAULT_CONFIG.threeParticleGalaxy.autoRotateSpeedDeg;
let threeTunnelWallColorLowHex = DEFAULT_CONFIG.threeBloomTunnel.wallColorLow;
let threeTunnelWallColorHighHex = DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh;
let threeTunnelCoreColorHex = DEFAULT_CONFIG.threeBloomTunnel.coreColor;
let threeTunnelSpeed = DEFAULT_CONFIG.threeBloomTunnel.tunnelSpeed;
let threeTunnelWallSegments = DEFAULT_CONFIG.threeBloomTunnel.wallSegments;
let threeTunnelCorePulseStrength = DEFAULT_CONFIG.threeBloomTunnel.corePulseStrength;
let threeTunnelBloomEnabled = DEFAULT_CONFIG.threeBloomTunnel.bloomEnabled;
let threeTunnelBloomStrength = DEFAULT_CONFIG.threeBloomTunnel.bloomStrength;
let threeTunnelFovDeg = DEFAULT_CONFIG.threeBloomTunnel.fovDeg;
let threeSphereCoreColorHex = DEFAULT_CONFIG.threeEnergySphere.coreColor;
let threeSphereHaloColorHex = DEFAULT_CONFIG.threeEnergySphere.haloColor;
let threeSphereDeformStrength = DEFAULT_CONFIG.threeEnergySphere.deformStrength;
let threeSphereNoiseSpeed = DEFAULT_CONFIG.threeEnergySphere.noiseSpeed;
let threeSphereHaloParticleCount = DEFAULT_CONFIG.threeEnergySphere.haloParticleCount;
let threeSphereWireframeOverlay = DEFAULT_CONFIG.threeEnergySphere.wireframeOverlay;
let threeSphereBloomEnabled = DEFAULT_CONFIG.threeEnergySphere.bloomEnabled;
let threeSphereBloomStrength = DEFAULT_CONFIG.threeEnergySphere.bloomStrength;
let threeSphereAutoRotateSpeedDeg = DEFAULT_CONFIG.threeEnergySphere.autoRotateSpeedDeg;
let threeKaleidoscopeSegments = DEFAULT_CONFIG.threeKaleidoscope.segments;
let threeKaleidoscopeColorLowHex = DEFAULT_CONFIG.threeKaleidoscope.colorLow;
let threeKaleidoscopeColorHighHex = DEFAULT_CONFIG.threeKaleidoscope.colorHigh;
let threeKaleidoscopeRotationSpeedDeg = DEFAULT_CONFIG.threeKaleidoscope.rotationSpeedDeg;
let threeKaleidoscopeReactiveness = DEFAULT_CONFIG.threeKaleidoscope.reactiveness;
let threeKaleidoscopeBloomEnabled = DEFAULT_CONFIG.threeKaleidoscope.bloomEnabled;
let threeKaleidoscopeBloomStrength = DEFAULT_CONFIG.threeKaleidoscope.bloomStrength;
let threeGlitchBaseColorHex = DEFAULT_CONFIG.threeGlitchSpectrum.baseColor;
let threeGlitchIntensity = DEFAULT_CONFIG.threeGlitchSpectrum.glitchIntensity;
let threeGlitchRgbSplitPx = DEFAULT_CONFIG.threeGlitchSpectrum.rgbSplitPx;
let threeGlitchScanlineOpacity = DEFAULT_CONFIG.threeGlitchSpectrum.scanlineOpacity;
let threeGlitchTriggerThreshold = DEFAULT_CONFIG.threeGlitchSpectrum.triggerThreshold;
let threeGlitchCooldownMs = DEFAULT_CONFIG.threeGlitchSpectrum.cooldownMs;
let threePhosphorLineColorHex = DEFAULT_CONFIG.threePhosphorTrail.lineColor;
let threePhosphorGlowColorHex = DEFAULT_CONFIG.threePhosphorTrail.glowColor;
let threePhosphorLineWidthPx = DEFAULT_CONFIG.threePhosphorTrail.lineWidthPx;
let threePhosphorDecayPercent = DEFAULT_CONFIG.threePhosphorTrail.decayPercent;
let threePhosphorBloomEnabled = DEFAULT_CONFIG.threePhosphorTrail.bloomEnabled;
let threePhosphorBloomStrength = DEFAULT_CONFIG.threePhosphorTrail.bloomStrength;
let threePhosphorMirrorEnabled = DEFAULT_CONFIG.threePhosphorTrail.mirrorEnabled;
let threeScanGridColorHex = DEFAULT_CONFIG.threeScanGrid.gridColor;
let threeScanGridHighlightColorHex = DEFAULT_CONFIG.threeScanGrid.highlightColor;
let threeScanGridScanBeamColorHex = DEFAULT_CONFIG.threeScanGrid.scanBeamColor;
let threeScanGridRows = DEFAULT_CONFIG.threeScanGrid.gridRows;
let threeScanGridCols = DEFAULT_CONFIG.threeScanGrid.gridCols;
let threeScanGridScanSpeed = DEFAULT_CONFIG.threeScanGrid.scanSpeed;
let threeScanGridHighlightStrength = DEFAULT_CONFIG.threeScanGrid.highlightStrength;
let threeScanGridBloomEnabled = DEFAULT_CONFIG.threeScanGrid.bloomEnabled;
let threeScanGridBloomStrength = DEFAULT_CONFIG.threeScanGrid.bloomStrength;
let threeScanGridCameraPitchDeg = DEFAULT_CONFIG.threeScanGrid.cameraPitchDeg;
let threeSoundFieldGridPreset = DEFAULT_CONFIG.threeSoundField.gridPreset;
let threeSoundFieldThemeId = DEFAULT_CONFIG.threeSoundField.themeId;
let threeSoundFieldResponseStrength = DEFAULT_CONFIG.threeSoundField.responseStrength;
let threeSoundFieldResponseRange = DEFAULT_CONFIG.threeSoundField.responseRange;
let threeSoundFieldBassRippleEnabled = DEFAULT_CONFIG.threeSoundField.bassRippleEnabled;
let threeSoundFieldBassRippleStrength = DEFAULT_CONFIG.threeSoundField.bassRippleStrength;
let threeSoundFieldBassRippleSensitivity = DEFAULT_CONFIG.threeSoundField.bassRippleSensitivity;
let threeSoundFieldMeteorEnabled = DEFAULT_CONFIG.threeSoundField.meteorEnabled;
let threeSoundFieldMeteorStrength = DEFAULT_CONFIG.threeSoundField.meteorStrength;
let threeSoundFieldMeteorSensitivity = DEFAULT_CONFIG.threeSoundField.meteorSensitivity;
let threeSoundFieldIdleWaveEnabled = DEFAULT_CONFIG.threeSoundField.idleWaveEnabled;
let threeSoundFieldIdleWaveAmplitude = DEFAULT_CONFIG.threeSoundField.idleWaveAmplitude;
let threeSoundFieldIdleWaveSpeed = DEFAULT_CONFIG.threeSoundField.idleWaveSpeed;
let threeSoundFieldBloomEnabled = DEFAULT_CONFIG.threeSoundField.bloomEnabled;
let threeSoundFieldBloomStrength = DEFAULT_CONFIG.threeSoundField.bloomStrength;
let threeSoundFieldCameraPitchDeg = DEFAULT_CONFIG.threeSoundField.cameraPitchDeg;
let threeSoundFieldCameraDistance = DEFAULT_CONFIG.threeSoundField.cameraDistance;
let threeSoundFieldAutoRotateEnabled = DEFAULT_CONFIG.threeSoundField.autoRotateEnabled;
let threeSoundFieldAutoRotateSpeedDeg = DEFAULT_CONFIG.threeSoundField.autoRotateSpeedDeg;
let threeSoundField2GridPreset = DEFAULT_CONFIG.threeSoundField2.gridPreset;
let threeSoundField2ThemeId = DEFAULT_CONFIG.threeSoundField2.themeId;
let threeSoundField2BloomEnabled = DEFAULT_CONFIG.threeSoundField2.bloomEnabled;
let threeSoundField2BloomStrength = DEFAULT_CONFIG.threeSoundField2.bloomStrength;
let threeSoundField2CameraPitchDeg = DEFAULT_CONFIG.threeSoundField2.cameraPitchDeg;
let threeSoundField2CameraDistance = DEFAULT_CONFIG.threeSoundField2.cameraDistance;
let threeSoundField2AutoRotateEnabled = DEFAULT_CONFIG.threeSoundField2.autoRotateEnabled;
let threeSoundField2AutoRotateSpeedDeg = DEFAULT_CONFIG.threeSoundField2.autoRotateSpeedDeg;
let threeSoundField2PulseEnabled = DEFAULT_CONFIG.threeSoundField2.pulseEnabled;
let threeSoundField2PulseSensitivity = DEFAULT_CONFIG.threeSoundField2.pulseSensitivity;
let threeSoundField2SnareEnabled = DEFAULT_CONFIG.threeSoundField2.snareEnabled;
let threeSoundField2SnareSensitivity = DEFAULT_CONFIG.threeSoundField2.snareSensitivity;
let threeSoundField2MeteorEnabled = DEFAULT_CONFIG.threeSoundField2.meteorEnabled;
let threeSoundField2MeteorSensitivity = DEFAULT_CONFIG.threeSoundField2.meteorSensitivity;
let threeSoundField2GroundEqBands = [...DEFAULT_CONFIG.threeSoundField2.groundEqBands];
let threeSoundField2GroundEqEnabledBands = [...DEFAULT_CONFIG.threeSoundField2.groundEqEnabledBands];
let threeSoundField2GroundEqMotionSpeed = DEFAULT_CONFIG.threeSoundField2.groundEqMotionSpeed;
let threeSoundField2GroundEqAmplitude = DEFAULT_CONFIG.threeSoundField2.groundEqAmplitude;
let threeSoundField2FloatingBlocksEnabled = DEFAULT_CONFIG.threeSoundField2.floatingBlocksEnabled;
let threeSoundField2FloatingBlockIntensity = DEFAULT_CONFIG.threeSoundField2.floatingBlockIntensity;
let threeSoundField2FloatingBlockSpeed = DEFAULT_CONFIG.threeSoundField2.floatingBlockSpeed;
let threeSoundField2FloatingBlockCount = DEFAULT_CONFIG.threeSoundField2.floatingBlockCount;
let threeSoundField2CoverEnabled = DEFAULT_CONFIG.threeSoundField2.coverEnabled;
let threeSoundField2CoverSize = DEFAULT_CONFIG.threeSoundField2.coverSize;
let threeSoundField2CoverHeight = DEFAULT_CONFIG.threeSoundField2.coverHeight;
let threeSoundField2CoverOpacity = DEFAULT_CONFIG.threeSoundField2.coverOpacity;

const THREE_SOUND_FIELD2_THEME_IDS = new Set([
  "minimal-monochrome",
  "ink-wash",
  "nocturnal",
  "neon-tokyo",
  "cyber-forest",
]);
let threeLiquidBlobColorHex = DEFAULT_CONFIG.threeLiquidBlob.blobColor;
let threeLiquidBlobColorSecondaryHex = DEFAULT_CONFIG.threeLiquidBlob.blobColorSecondary;
let threeLiquidBlobCount = DEFAULT_CONFIG.threeLiquidBlob.blobCount;
let threeLiquidBlobMergeStrength = DEFAULT_CONFIG.threeLiquidBlob.mergeStrength;
let threeLiquidBlobWobbleSpeed = DEFAULT_CONFIG.threeLiquidBlob.wobbleSpeed;
let threeLiquidBlobBassDrive = DEFAULT_CONFIG.threeLiquidBlob.bassDrive;
let threeLiquidBlobPulseOnPeak = DEFAULT_CONFIG.threeLiquidBlob.pulseOnPeak;
let threeLiquidBlobBloomEnabled = DEFAULT_CONFIG.threeLiquidBlob.bloomEnabled;
let threeLiquidBlobBloomStrength = DEFAULT_CONFIG.threeLiquidBlob.bloomStrength;
let threeAuroraColorLowHex = DEFAULT_CONFIG.threeAuroraRibbon.colorLow;
let threeAuroraColorHighHex = DEFAULT_CONFIG.threeAuroraRibbon.colorHigh;
let threeAuroraRibbonCount = DEFAULT_CONFIG.threeAuroraRibbon.ribbonCount;
let threeAuroraRibbonWidth = DEFAULT_CONFIG.threeAuroraRibbon.ribbonWidth;
let threeAuroraWaveAmplitude = DEFAULT_CONFIG.threeAuroraRibbon.waveAmplitude;
let threeAuroraWaveSpeed = DEFAULT_CONFIG.threeAuroraRibbon.waveSpeed;
let threeAuroraBassBandIndex = DEFAULT_CONFIG.threeAuroraRibbon.bassBandIndex;
let threeAuroraBloomEnabled = DEFAULT_CONFIG.threeAuroraRibbon.bloomEnabled;
let threeAuroraBloomStrength = DEFAULT_CONFIG.threeAuroraRibbon.bloomStrength;
let threeAuroraAutoRotateSpeedDeg = DEFAULT_CONFIG.threeAuroraRibbon.autoRotateSpeedDeg;
let threeBreathingRingColorHex = DEFAULT_CONFIG.threeBreathingRings.ringColor;
let threeBreathingRingCount = DEFAULT_CONFIG.threeBreathingRings.ringCount;
let threeBreathingBaseRadius = DEFAULT_CONFIG.threeBreathingRings.baseRadius;
let threeBreathingRadiusStep = DEFAULT_CONFIG.threeBreathingRings.radiusStep;
let threeBreathingPulseStrength = DEFAULT_CONFIG.threeBreathingRings.pulseStrength;
let threeBreathingTubeRadius = DEFAULT_CONFIG.threeBreathingRings.tubeRadius;
let threeBreathingBloomEnabled = DEFAULT_CONFIG.threeBreathingRings.bloomEnabled;
let threeBreathingBloomStrength = DEFAULT_CONFIG.threeBreathingRings.bloomStrength;
let threeBreathingAutoRotateSpeedDeg = DEFAULT_CONFIG.threeBreathingRings.autoRotateSpeedDeg;
let threeNoiseColorLowHex = DEFAULT_CONFIG.threeNoiseLandscape.colorLow;
let threeNoiseColorHighHex = DEFAULT_CONFIG.threeNoiseLandscape.colorHigh;
let threeNoiseGridSize = DEFAULT_CONFIG.threeNoiseLandscape.gridSize;
let threeNoiseHeightScale = DEFAULT_CONFIG.threeNoiseLandscape.heightScale;
let threeNoiseNoiseScale = DEFAULT_CONFIG.threeNoiseLandscape.noiseScale;
let threeNoiseScrollSpeed = DEFAULT_CONFIG.threeNoiseLandscape.scrollSpeed;
let threeNoiseWireframeOverlay = DEFAULT_CONFIG.threeNoiseLandscape.wireframeOverlay;
let threeNoiseBloomEnabled = DEFAULT_CONFIG.threeNoiseLandscape.bloomEnabled;
let threeNoiseBloomStrength = DEFAULT_CONFIG.threeNoiseLandscape.bloomStrength;
let threeNoiseCameraPitchDeg = DEFAULT_CONFIG.threeNoiseLandscape.cameraPitchDeg;
let threeLavaLampColorWarmHex = DEFAULT_CONFIG.threeLavaLamp.colorWarm;
let threeLavaLampColorCoolHex = DEFAULT_CONFIG.threeLavaLamp.colorCool;
let threeLavaLampBlobCount = DEFAULT_CONFIG.threeLavaLamp.blobCount;
let threeLavaLampMergeStrength = DEFAULT_CONFIG.threeLavaLamp.mergeStrength;
let threeLavaLampBuoyancySpeed = DEFAULT_CONFIG.threeLavaLamp.buoyancySpeed;
let threeLavaLampBassDrive = DEFAULT_CONFIG.threeLavaLamp.bassDrive;
let threeLavaLampBloomEnabled = DEFAULT_CONFIG.threeLavaLamp.bloomEnabled;
let threeLavaLampBloomStrength = DEFAULT_CONFIG.threeLavaLamp.bloomStrength;
let threeOilMarbleColor1Hex = DEFAULT_CONFIG.threeOilMarble.color1;
let threeOilMarbleColor2Hex = DEFAULT_CONFIG.threeOilMarble.color2;
let threeOilMarbleColor3Hex = DEFAULT_CONFIG.threeOilMarble.color3;
let threeOilMarbleColor4Hex = DEFAULT_CONFIG.threeOilMarble.color4;
let threeOilMarbleColor4Enabled = DEFAULT_CONFIG.threeOilMarble.color4Enabled;
let threeOilMarbleFlowSpeed = DEFAULT_CONFIG.threeOilMarble.flowSpeed;
let threeOilMarbleNoiseScale = DEFAULT_CONFIG.threeOilMarble.noiseScale;
let threeOilMarbleWarpStrength = DEFAULT_CONFIG.threeOilMarble.warpStrength;
let threeOilMarbleReactiveness = DEFAULT_CONFIG.threeOilMarble.reactiveness;
let threeOilMarbleBloomEnabled = DEFAULT_CONFIG.threeOilMarble.bloomEnabled;
let threeOilMarbleBloomStrength = DEFAULT_CONFIG.threeOilMarble.bloomStrength;
let threePearlChainColor1Hex = DEFAULT_CONFIG.threePearlChain.color1;
let threePearlChainColor2Hex = DEFAULT_CONFIG.threePearlChain.color2;
let threePearlChainColor3Hex = DEFAULT_CONFIG.threePearlChain.color3;
let threePearlChainPearlCount = DEFAULT_CONFIG.threePearlChain.pearlCount;
let threePearlChainChainRadius = DEFAULT_CONFIG.threePearlChain.chainRadius;
let threePearlChainPearlSize = DEFAULT_CONFIG.threePearlChain.pearlSize;
let threePearlChainSwaySpeed = DEFAULT_CONFIG.threePearlChain.swaySpeed;
let threePearlChainMergeStrength = DEFAULT_CONFIG.threePearlChain.mergeStrength;
let threePearlChainBloomEnabled = DEFAULT_CONFIG.threePearlChain.bloomEnabled;
let threePearlChainBloomStrength = DEFAULT_CONFIG.threePearlChain.bloomStrength;
let threeCrystalGemColorCoreHex = DEFAULT_CONFIG.threeCrystalGem.colorCore;
let threeCrystalGemColorEdgeHex = DEFAULT_CONFIG.threeCrystalGem.colorEdge;
let threeCrystalGemColorHighlightHex = DEFAULT_CONFIG.threeCrystalGem.colorHighlight;
let threeCrystalGemGemCount = DEFAULT_CONFIG.threeCrystalGem.gemCount;
let threeCrystalGemFacetSharpness = DEFAULT_CONFIG.threeCrystalGem.facetSharpness;
let threeCrystalGemRotationSpeedDeg = DEFAULT_CONFIG.threeCrystalGem.rotationSpeedDeg;
let threeCrystalGemChromaticEnabled = DEFAULT_CONFIG.threeCrystalGem.chromaticEnabled;
let threeCrystalGemChromaticOffset = DEFAULT_CONFIG.threeCrystalGem.chromaticOffset;
let threeCrystalGemBloomEnabled = DEFAULT_CONFIG.threeCrystalGem.bloomEnabled;
let threeCrystalGemBloomStrength = DEFAULT_CONFIG.threeCrystalGem.bloomStrength;
let threeGlassOrbsColor1Hex = DEFAULT_CONFIG.threeGlassOrbs.color1;
let threeGlassOrbsColor2Hex = DEFAULT_CONFIG.threeGlassOrbs.color2;
let threeGlassOrbsColor3Hex = DEFAULT_CONFIG.threeGlassOrbs.color3;
let threeGlassOrbsColor4Hex = DEFAULT_CONFIG.threeGlassOrbs.color4;
let threeGlassOrbsColor5Hex = DEFAULT_CONFIG.threeGlassOrbs.color5;
let threeGlassOrbsOrbCount = DEFAULT_CONFIG.threeGlassOrbs.orbCount;
let threeGlassOrbsStackSpacing = DEFAULT_CONFIG.threeGlassOrbs.stackSpacing;
let threeGlassOrbsTransmission = DEFAULT_CONFIG.threeGlassOrbs.transmission;
let threeGlassOrbsRefractionStrength = DEFAULT_CONFIG.threeGlassOrbs.refractionStrength;
let threeGlassOrbsBreatheWithPeak = DEFAULT_CONFIG.threeGlassOrbs.breatheWithPeak;
let threeGlassOrbsChromaticEnabled = DEFAULT_CONFIG.threeGlassOrbs.chromaticEnabled;
let threeGlassOrbsChromaticOffset = DEFAULT_CONFIG.threeGlassOrbs.chromaticOffset;
let threeGlassOrbsBloomEnabled = DEFAULT_CONFIG.threeGlassOrbs.bloomEnabled;
let threeGlassOrbsBloomStrength = DEFAULT_CONFIG.threeGlassOrbs.bloomStrength;
let threeHoloPrismTintLowHex = DEFAULT_CONFIG.threeHoloPrism.tintLow;
let threeHoloPrismTintHighHex = DEFAULT_CONFIG.threeHoloPrism.tintHigh;
let threeHoloPrismSides = DEFAULT_CONFIG.threeHoloPrism.prismSides;
let threeHoloPrismRotationSpeedDeg = DEFAULT_CONFIG.threeHoloPrism.rotationSpeedDeg;
let threeHoloPrismSpectralStrength = DEFAULT_CONFIG.threeHoloPrism.spectralStrength;
let threeHoloPrismPulseOnPeak = DEFAULT_CONFIG.threeHoloPrism.pulseOnPeak;
let threeHoloPrismChromaticOffset = DEFAULT_CONFIG.threeHoloPrism.chromaticOffset;
let threeHoloPrismBloomEnabled = DEFAULT_CONFIG.threeHoloPrism.bloomEnabled;
let threeHoloPrismBloomStrength = DEFAULT_CONFIG.threeHoloPrism.bloomStrength;
let threeNebulaVolumeColorCoreHex = DEFAULT_CONFIG.threeNebulaVolume.colorCore;
let threeNebulaVolumeColorMidHex = DEFAULT_CONFIG.threeNebulaVolume.colorMid;
let threeNebulaVolumeColorEdgeHex = DEFAULT_CONFIG.threeNebulaVolume.colorEdge;
let threeNebulaVolumeDensityScale = DEFAULT_CONFIG.threeNebulaVolume.densityScale;
let threeNebulaVolumeNoiseScale = DEFAULT_CONFIG.threeNebulaVolume.noiseScale;
let threeNebulaVolumeSwirlSpeed = DEFAULT_CONFIG.threeNebulaVolume.swirlSpeed;
let threeNebulaVolumeMarchSteps = DEFAULT_CONFIG.threeNebulaVolume.marchSteps;
let threeNebulaVolumeBloomEnabled = DEFAULT_CONFIG.threeNebulaVolume.bloomEnabled;
let threeNebulaVolumeBloomStrength = DEFAULT_CONFIG.threeNebulaVolume.bloomStrength;
let threeKnotOrganicColor1Hex = DEFAULT_CONFIG.threeKnotOrganic.color1;
let threeKnotOrganicColor2Hex = DEFAULT_CONFIG.threeKnotOrganic.color2;
let threeKnotOrganicColor3Hex = DEFAULT_CONFIG.threeKnotOrganic.color3;
let threeKnotOrganicKnotP = DEFAULT_CONFIG.threeKnotOrganic.knotP;
let threeKnotOrganicKnotQ = DEFAULT_CONFIG.threeKnotOrganic.knotQ;
let threeKnotOrganicTubeRadius = DEFAULT_CONFIG.threeKnotOrganic.tubeRadius;
let threeKnotOrganicSurfaceNoise = DEFAULT_CONFIG.threeKnotOrganic.surfaceNoise;
let threeKnotOrganicRotationSpeedDeg = DEFAULT_CONFIG.threeKnotOrganic.rotationSpeedDeg;
let threeKnotOrganicBloomEnabled = DEFAULT_CONFIG.threeKnotOrganic.bloomEnabled;
let threeKnotOrganicBloomStrength = DEFAULT_CONFIG.threeKnotOrganic.bloomStrength;

let threeCoverPreset = DEFAULT_CONFIG.threeCoverParticle.preset;
let threeCoverResolution = DEFAULT_CONFIG.threeCoverParticle.coverResolution;
let threeCoverIntensity = DEFAULT_CONFIG.threeCoverParticle.intensity;
let threeCoverDepth = DEFAULT_CONFIG.threeCoverParticle.depth;
let threeCoverPointScale = DEFAULT_CONFIG.threeCoverParticle.pointScale;
let threeCoverSpeed = DEFAULT_CONFIG.threeCoverParticle.speed;
let threeCoverTwist = DEFAULT_CONFIG.threeCoverParticle.twist;
let threeCoverScatter = DEFAULT_CONFIG.threeCoverParticle.scatter;
let threeCoverColorBoost = DEFAULT_CONFIG.threeCoverParticle.colorBoost;
let threeCoverBloomEnabled = DEFAULT_CONFIG.threeCoverParticle.bloomEnabled;
let threeCoverBloomStrength = DEFAULT_CONFIG.threeCoverParticle.bloomStrength;
let threeCoverBloomSize = DEFAULT_CONFIG.threeCoverParticle.bloomSize;
let threeCoverCameraDistance = DEFAULT_CONFIG.threeCoverParticle.cameraDistance;
let threeCoverCameraFovDeg = DEFAULT_CONFIG.threeCoverParticle.cameraFovDeg;
let threeCoverAutoRotateEnabled = DEFAULT_CONFIG.threeCoverParticle.autoRotateEnabled;
let threeCoverAutoRotateSpeedDeg = DEFAULT_CONFIG.threeCoverParticle.autoRotateSpeedDeg;
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

function applyObliqueBarColorNearHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.obliqueBar.barColor;
  const { r, g, b } = hexToRgb(safe);
  obliqueBarColorNearRgb.r = r / 255;
  obliqueBarColorNearRgb.g = g / 255;
  obliqueBarColorNearRgb.b = b / 255;
}

function applyObliqueBarColorFarHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.obliqueBar.barColorFar;
  const { r, g, b } = hexToRgb(safe);
  obliqueBarColorFarRgb.r = r / 255;
  obliqueBarColorFarRgb.g = g / 255;
  obliqueBarColorFarRgb.b = b / 255;
}

function applyObliqueBarWidthPercent(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  obliqueBarWidthPercent = Math.max(20, Math.min(100, v));
}

function applyObliqueBarGapPercent(n) {
  obliqueBarGapPercent = clampInt(n, 0, 70);
}

function applyObliqueBarHeadroomPercent(n) {
  obliqueBarHeadroomPercent = clampInt(n, 0, 40);
}

function applyObliqueBarTiltDeg(n) {
  obliqueBarTiltDeg = clampInt(n, 30, 70);
}

function applyObliqueBarShowGroundLine(value) {
  obliqueBarShowGroundLine = parseBoolean(value, DEFAULT_CONFIG.obliqueBar.showGroundLine);
}

function applyObliqueBarMirrorEnabled(value) {
  obliqueBarMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.obliqueBar.mirrorEnabled);
}

function applyObliqueBarDisplayBarCount(n) {
  obliqueBarDisplayBarCount = clampInt(n, 0, 128);
}

function applyDepthLayersColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.depthLayers.color;
  const { r, g, b } = hexToRgb(safe);
  depthLayersColorRgb.r = r / 255;
  depthLayersColorRgb.g = g / 255;
  depthLayersColorRgb.b = b / 255;
}

function applyDepthLayersColorFarHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.depthLayers.colorFar;
  const { r, g, b } = hexToRgb(safe);
  depthLayersColorFarRgb.r = r / 255;
  depthLayersColorFarRgb.g = g / 255;
  depthLayersColorFarRgb.b = b / 255;
}

function applyDepthLayersLayerCount(n) {
  depthLayersLayerCount = clampInt(n, 2, 6);
}

function applyDepthLayersLayerSpacingPx(n) {
  depthLayersLayerSpacingPx = clampInt(n, 0, 24);
}

function applyDepthLayersFarScalePercent(n) {
  depthLayersFarScalePercent = clampInt(n, 50, 90);
}

function applyDepthLayersFarAlphaPercent(n) {
  depthLayersFarAlphaPercent = clampInt(n, 0, 100);
}

function applyDepthLayersBassFrontEnabled(value) {
  depthLayersBassFrontEnabled = parseBoolean(value, DEFAULT_CONFIG.depthLayers.bassFrontEnabled);
}

function applyDepthLayersLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  depthLayersLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyDepthLayersRenderStyle(value) {
  depthLayersRenderStyle = normalizeDepthLayersRenderStyle(value, DEFAULT_CONFIG.depthLayers.renderStyle);
}

function applyIsometricSkylineFaceTopHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.isometricSkyline.faceTopColor;
  const { r, g, b } = hexToRgb(safe);
  isometricSkylineFaceTopRgb.r = r / 255;
  isometricSkylineFaceTopRgb.g = g / 255;
  isometricSkylineFaceTopRgb.b = b / 255;
}

function applyIsometricSkylineFaceLeftHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.isometricSkyline.faceLeftColor;
  const { r, g, b } = hexToRgb(safe);
  isometricSkylineFaceLeftRgb.r = r / 255;
  isometricSkylineFaceLeftRgb.g = g / 255;
  isometricSkylineFaceLeftRgb.b = b / 255;
}

function applyIsometricSkylineFaceRightHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.isometricSkyline.faceRightColor;
  const { r, g, b } = hexToRgb(safe);
  isometricSkylineFaceRightRgb.r = r / 255;
  isometricSkylineFaceRightRgb.g = g / 255;
  isometricSkylineFaceRightRgb.b = b / 255;
}

function applyIsometricSkylineBuildingWidthPx(n) {
  isometricSkylineBuildingWidthPx = clampInt(n, 4, 100);
}

function applyIsometricSkylineBuildingGapPx(n) {
  isometricSkylineBuildingGapPx = clampInt(n, 0, 12);
}

function applyIsometricSkylineBaselinePercent(n) {
  isometricSkylineBaselinePercent = clampInt(n, 5, 40);
}

function applyIsometricSkylineDisplayBuildingCount(n) {
  isometricSkylineDisplayBuildingCount = clampInt(n, 16, 96);
}

function applyIsometricSkylineShowGroundPlane(value) {
  isometricSkylineShowGroundPlane = parseBoolean(value, DEFAULT_CONFIG.isometricSkyline.showGroundPlane);
}

function applyRing3dBarColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.ring3d.barColor;
  const { r, g, b } = hexToRgb(safe);
  ring3dBarRgb.r = r / 255;
  ring3dBarRgb.g = g / 255;
  ring3dBarRgb.b = b / 255;
}

function applyRing3dInnerRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  ring3dInnerRadius = Math.min(0.8, Math.max(0.1, n));
}

function applyRing3dOuterRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  ring3dOuterRadius = Math.min(1.0, Math.max(0.15, n));
}

function applyRing3dBarHeightScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  ring3dBarHeightScale = Math.min(1.5, Math.max(0.1, n));
}

function applyRing3dBarThicknessDeg(value) {
  ring3dBarThicknessDeg = clampInt(value, 1, 12);
}

function applyRing3dDisplayBarCount(value) {
  ring3dDisplayBarCount = clampInt(value, 8, 128);
}

function applyRing3dWireframeEnabled(value) {
  ring3dWireframeEnabled = parseBoolean(value, DEFAULT_CONFIG.ring3d.wireframeEnabled);
}

function applyRing3dFillEnabled(value) {
  ring3dFillEnabled = parseBoolean(value, DEFAULT_CONFIG.ring3d.fillEnabled);
}

function applyRing3dAutoRotateEnabled(value) {
  ring3dAutoRotateEnabled = parseBoolean(value, DEFAULT_CONFIG.ring3d.autoRotateEnabled);
}

function applyRing3dAutoRotateSpeedDeg(value) {
  ring3dAutoRotateSpeedDeg = clampInt(value, 0, 20);
}

function applyRing3dCameraDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  ring3dCameraDistance = Math.min(4.5, Math.max(1.2, n));
}

function applyRing3dCameraFovDeg(value) {
  ring3dCameraFovDeg = clampInt(value, 30, 75);
}

function applyRing3dBreatheWithPeak(value) {
  ring3dBreatheWithPeak = parseBoolean(value, DEFAULT_CONFIG.ring3d.breatheWithPeak);
}

function applyTerrain3dColorLowHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.terrain3d.colorLow;
  const { r, g, b } = hexToRgb(safe);
  terrain3dColorLowRgb.r = r / 255;
  terrain3dColorLowRgb.g = g / 255;
  terrain3dColorLowRgb.b = b / 255;
}

function applyTerrain3dColorHighHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.terrain3d.colorHigh;
  const { r, g, b } = hexToRgb(safe);
  terrain3dColorHighRgb.r = r / 255;
  terrain3dColorHighRgb.g = g / 255;
  terrain3dColorHighRgb.b = b / 255;
}

function applyTerrain3dWireframeColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.terrain3d.wireframeColor;
  const { r, g, b } = hexToRgb(safe);
  terrain3dWireframeRgb.r = r / 255;
  terrain3dWireframeRgb.g = g / 255;
  terrain3dWireframeRgb.b = b / 255;
}

function applyTerrain3dGridCols(value) {
  terrain3dGridCols = clampInt(value, 16, 96);
}

function applyTerrain3dGridRows(value) {
  terrain3dGridRows = clampInt(value, 16, 96);
}

function applyTerrain3dScrollEveryNFrames(value) {
  terrain3dScrollEveryNFrames = clampInt(value, 1, 8);
}

function applyTerrain3dWireframeEnabled(value) {
  terrain3dWireframeEnabled = parseBoolean(value, DEFAULT_CONFIG.terrain3d.wireframeEnabled);
}

function applyTerrain3dFillEnabled(value) {
  terrain3dFillEnabled = parseBoolean(value, DEFAULT_CONFIG.terrain3d.fillEnabled);
}

function applyTerrain3dTerrainHeightScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  terrain3dTerrainHeightScale = Math.min(1.2, Math.max(0.05, n));
}

function applyTerrain3dCameraPitchDeg(value) {
  terrain3dCameraPitchDeg = clampInt(value, 30, 75);
}

function applyTerrain3dCameraDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  terrain3dCameraDistance = Math.min(4.5, Math.max(1.2, n));
}

function applyTerrain3dAutoScrollEnabled(value) {
  terrain3dAutoScrollEnabled = parseBoolean(value, DEFAULT_CONFIG.terrain3d.autoScrollEnabled);
}

function applyHelix3dDotColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.helix3d.dotColor;
  const { r, g, b } = hexToRgb(safe);
  helix3dDotRgb.r = r / 255;
  helix3dDotRgb.g = g / 255;
  helix3dDotRgb.b = b / 255;
}

function applyHelix3dHelixRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  helix3dHelixRadius = Math.min(1.0, Math.max(0.15, n));
}

function applyHelix3dHelixPitch(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  helix3dHelixPitch = Math.min(0.8, Math.max(0.1, n));
}

function applyHelix3dHelixTurns(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  helix3dHelixTurns = Math.min(4, Math.max(1, n));
}

function applyHelix3dDisplayPointCount(value) {
  helix3dDisplayPointCount = clampInt(value, 8, 64);
}

function applyHelix3dExtrudeMode(value) {
  helix3dExtrudeMode = normalizeHelix3dExtrudeMode(value, DEFAULT_CONFIG.helix3d.extrudeMode);
}

function applyHelix3dPointSizePx(value) {
  helix3dPointSizePx = clampInt(value, 2, 24);
}

function applyHelix3dWireframeEnabled(value) {
  helix3dWireframeEnabled = parseBoolean(value, DEFAULT_CONFIG.helix3d.wireframeEnabled);
}

function applyHelix3dAutoRotateEnabled(value) {
  helix3dAutoRotateEnabled = parseBoolean(value, DEFAULT_CONFIG.helix3d.autoRotateEnabled);
}

function applyHelix3dAutoRotateSpeedDeg(value) {
  helix3dAutoRotateSpeedDeg = clampInt(value, 0, 20);
}

function applyHelix3dCameraDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  helix3dCameraDistance = Math.min(4.5, Math.max(1.2, n));
}

function applyHelix3dCameraFovDeg(value) {
  helix3dCameraFovDeg = clampInt(value, 30, 75);
}

function applyThreePlasmaColorLowHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePlasmaField.colorLow;
  threePlasmaColorLowHex = safe;
}

function applyThreePlasmaColorHighHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePlasmaField.colorHigh;
  threePlasmaColorHighHex = safe;
}

function applyThreePlasmaSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threePlasmaSpeed = Math.min(3, Math.max(0.2, n));
}

function applyThreePlasmaNoiseScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threePlasmaNoiseScale = Math.min(6, Math.max(0.5, n));
}

function applyThreePlasmaReactiveness(value) {
  threePlasmaReactiveness = clampInt(value, 0, 100);
}

function applyThreePlasmaBloomEnabled(value) {
  threePlasmaBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threePlasmaField.bloomEnabled);
}

function applyThreePlasmaBloomStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threePlasmaBloomStrength = Math.min(2, Math.max(0, n));
}

function applyThreeGalaxyColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeParticleGalaxy.particleColor;
  threeGalaxyColorHex = safe;
}

function applyThreeGalaxyParticleCount(value) {
  threeGalaxyParticleCount = clampInt(value, 2000, 20000);
}

function applyThreeGalaxyRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeGalaxyRadius = Math.min(2.5, Math.max(0.5, n));
}

function applyThreeGalaxySpiralArms(value) {
  threeGalaxySpiralArms = clampInt(value, 1, 4);
}

function applyThreeGalaxyBassPullStrength(value) {
  threeGalaxyBassPullStrength = clampInt(value, 0, 100);
}

function applyThreeGalaxyTrebleSpreadStrength(value) {
  threeGalaxyTrebleSpreadStrength = clampInt(value, 0, 100);
}

function applyThreeGalaxyBloomEnabled(value) {
  threeGalaxyBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeParticleGalaxy.bloomEnabled);
}

function applyThreeGalaxyBloomStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeGalaxyBloomStrength = Math.min(2, Math.max(0, n));
}

function applyThreeGalaxyAutoRotateSpeedDeg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeGalaxyAutoRotateSpeedDeg = Math.min(20, Math.max(0, n));
}

function applyThreeTunnelWallColorLowHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeBloomTunnel.wallColorLow;
  threeTunnelWallColorLowHex = safe;
}

function applyThreeTunnelWallColorHighHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh;
  threeTunnelWallColorHighHex = safe;
}

function applyThreeTunnelCoreColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeBloomTunnel.coreColor;
  threeTunnelCoreColorHex = safe;
}

function applyThreeTunnelSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeTunnelSpeed = Math.min(3, Math.max(0.2, n));
}

function applyThreeTunnelWallSegments(value) {
  threeTunnelWallSegments = clampInt(value, 16, 64);
}

function applyThreeTunnelCorePulseStrength(value) {
  threeTunnelCorePulseStrength = clampInt(value, 0, 100);
}

function applyThreeTunnelBloomEnabled(value) {
  threeTunnelBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeBloomTunnel.bloomEnabled);
}

function applyThreeTunnelBloomStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeTunnelBloomStrength = Math.min(2, Math.max(0, n));
}

function applyThreeTunnelFovDeg(value) {
  threeTunnelFovDeg = clampInt(value, 45, 85);
}

function applyThreeSphereCoreColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeEnergySphere.coreColor;
  threeSphereCoreColorHex = safe;
}

function applyThreeSphereHaloColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeEnergySphere.haloColor;
  threeSphereHaloColorHex = safe;
}

function applyThreeSphereDeformStrength(value) {
  threeSphereDeformStrength = clampInt(value, 0, 100);
}

function applyThreeSphereNoiseSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeSphereNoiseSpeed = Math.min(3, Math.max(0.2, n));
}

function applyThreeSphereHaloParticleCount(value) {
  threeSphereHaloParticleCount = clampInt(value, 200, 3000);
}

function applyThreeSphereWireframeOverlay(value) {
  threeSphereWireframeOverlay = parseBoolean(value, DEFAULT_CONFIG.threeEnergySphere.wireframeOverlay);
}

function applyThreeSphereBloomEnabled(value) {
  threeSphereBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeEnergySphere.bloomEnabled);
}

function applyThreeSphereBloomStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeSphereBloomStrength = Math.min(2, Math.max(0, n));
}

function applyThreeSphereAutoRotateSpeedDeg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeSphereAutoRotateSpeedDeg = Math.min(20, Math.max(0, n));
}

function applyThreeKaleidoscopeSegments(value) {
  threeKaleidoscopeSegments = normalizeKaleidoscopeSegments(
    value,
    DEFAULT_CONFIG.threeKaleidoscope.segments,
  );
}

function applyThreeKaleidoscopeColorLowHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeKaleidoscope.colorLow;
  threeKaleidoscopeColorLowHex = safe;
}

function applyThreeKaleidoscopeColorHighHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeKaleidoscope.colorHigh;
  threeKaleidoscopeColorHighHex = safe;
}

function applyThreeKaleidoscopeRotationSpeedDeg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeKaleidoscopeRotationSpeedDeg = Math.min(30, Math.max(0, n));
}

function applyThreeKaleidoscopeReactiveness(value) {
  threeKaleidoscopeReactiveness = clampInt(value, 0, 100);
}

function applyThreeKaleidoscopeBloomEnabled(value) {
  threeKaleidoscopeBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeKaleidoscope.bloomEnabled);
}

function applyThreeKaleidoscopeBloomStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threeKaleidoscopeBloomStrength = Math.min(2, Math.max(0, n));
}

function applyThreeGlitchBaseColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeGlitchSpectrum.baseColor;
  threeGlitchBaseColorHex = safe;
}

function applyThreeGlitchIntensity(value) {
  threeGlitchIntensity = clampInt(value, 0, 100);
}

function applyThreeGlitchRgbSplitPx(value) {
  threeGlitchRgbSplitPx = clampInt(value, 0, 12);
}

function applyThreeGlitchScanlineOpacity(value) {
  threeGlitchScanlineOpacity = clampInt(value, 0, 100);
}

function applyThreeGlitchTriggerThreshold(value) {
  threeGlitchTriggerThreshold = clampInt(value, 0, 100);
}

function applyThreeGlitchCooldownMs(value) {
  threeGlitchCooldownMs = clampInt(value, 30, 2000);
}

function applyThreePhosphorLineColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePhosphorTrail.lineColor;
  threePhosphorLineColorHex = safe;
}

function applyThreePhosphorGlowColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePhosphorTrail.glowColor;
  threePhosphorGlowColorHex = safe;
}

function applyThreePhosphorLineWidthPx(value) {
  threePhosphorLineWidthPx = clampInt(value, 1, 12);
}

function applyThreePhosphorDecayPercent(value) {
  threePhosphorDecayPercent = clampInt(value, 10, 90);
}

function applyThreePhosphorBloomEnabled(value) {
  threePhosphorBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threePhosphorTrail.bloomEnabled);
}

function applyThreePhosphorBloomStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  threePhosphorBloomStrength = Math.min(2, Math.max(0, n));
}

function applyThreePhosphorMirrorEnabled(value) {
  threePhosphorMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.threePhosphorTrail.mirrorEnabled);
}

function applyThreeScanGridColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeScanGrid.gridColor;
  threeScanGridColorHex = safe;
}

function applyThreeScanGridHighlightColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeScanGrid.highlightColor;
  threeScanGridHighlightColorHex = safe;
}

function applyThreeScanGridScanBeamColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeScanGrid.scanBeamColor;
  threeScanGridScanBeamColorHex = safe;
}

function applyThreeScanGridRows(value) {
  threeScanGridRows = clampInt(value, 12, 48);
}

function applyThreeScanGridCols(value) {
  threeScanGridCols = clampInt(value, 16, 64);
}

function applyThreeScanGridScanSpeed(value) {
  const n = Number(value);
  threeScanGridScanSpeed = Number.isFinite(n) ? Math.min(3, Math.max(0.2, n)) : DEFAULT_CONFIG.threeScanGrid.scanSpeed;
}

function applyThreeScanGridHighlightStrength(value) {
  threeScanGridHighlightStrength = clampInt(value, 0, 100);
}

function applyThreeScanGridBloomEnabled(value) {
  threeScanGridBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeScanGrid.bloomEnabled);
}

function applyThreeScanGridBloomStrength(value) {
  const n = Number(value);
  threeScanGridBloomStrength = Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : DEFAULT_CONFIG.threeScanGrid.bloomStrength;
}

function applyThreeScanGridCameraPitchDeg(value) {
  threeScanGridCameraPitchDeg = clampInt(value, 25, 75);
}

function applyThreeSoundFieldGridPreset(value) {
  const preset = String(value ?? "").trim();
  threeSoundFieldGridPreset =
    preset === "eco" || preset === "high" || preset === "normal"
      ? preset
      : DEFAULT_CONFIG.threeSoundField.gridPreset;
}

function applyThreeSoundFieldThemeId(value) {
  const theme = String(value ?? "").trim();
  threeSoundFieldThemeId =
    theme === "ocean" || theme === "ember" || theme === "indigo"
      ? theme
      : DEFAULT_CONFIG.threeSoundField.themeId;
}

function applyThreeSoundFieldResponseStrength(value) {
  threeSoundFieldResponseStrength = clampInt(value, 0, 100);
}

function applyThreeSoundFieldResponseRange(value) {
  threeSoundFieldResponseRange = clampInt(value, 0, 100);
}

function applyThreeSoundFieldBassRippleEnabled(value) {
  threeSoundFieldBassRippleEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField.bassRippleEnabled);
}

function applyThreeSoundFieldBassRippleStrength(value) {
  threeSoundFieldBassRippleStrength = clampInt(value, 0, 100);
}

function applyThreeSoundFieldBassRippleSensitivity(value) {
  threeSoundFieldBassRippleSensitivity = clampInt(value, 0, 100);
}

function applyThreeSoundFieldMeteorEnabled(value) {
  threeSoundFieldMeteorEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField.meteorEnabled);
}

function applyThreeSoundFieldMeteorStrength(value) {
  threeSoundFieldMeteorStrength = clampInt(value, 0, 100);
}

function applyThreeSoundFieldMeteorSensitivity(value) {
  threeSoundFieldMeteorSensitivity = clampInt(value, 0, 100);
}

function applyThreeSoundFieldIdleWaveEnabled(value) {
  threeSoundFieldIdleWaveEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField.idleWaveEnabled);
}

function applyThreeSoundFieldIdleWaveAmplitude(value) {
  threeSoundFieldIdleWaveAmplitude = clampInt(value, 0, 100);
}

function applyThreeSoundFieldIdleWaveSpeed(value) {
  threeSoundFieldIdleWaveSpeed = clampInt(value, 0, 100);
}

function applyThreeSoundFieldBloomEnabled(value) {
  threeSoundFieldBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField.bloomEnabled);
}

function applyThreeSoundFieldBloomStrength(value) {
  const n = Number(value);
  threeSoundFieldBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField.bloomStrength;
}

function applyThreeSoundFieldCameraPitchDeg(value) {
  threeSoundFieldCameraPitchDeg = clampInt(value, 25, 75);
}

function applyThreeSoundFieldCameraDistance(value) {
  const n = Number(value);
  threeSoundFieldCameraDistance = Number.isFinite(n)
    ? Math.min(22, Math.max(8, n))
    : DEFAULT_CONFIG.threeSoundField.cameraDistance;
}

function applyThreeSoundFieldAutoRotateEnabled(value) {
  threeSoundFieldAutoRotateEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField.autoRotateEnabled);
}

function applyThreeSoundFieldAutoRotateSpeedDeg(value) {
  const n = Number(value);
  threeSoundFieldAutoRotateSpeedDeg = Number.isFinite(n)
    ? Math.min(12, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField.autoRotateSpeedDeg;
}

function applyThreeSoundField2GridPreset(value) {
  const preset = String(value ?? "").trim();
  threeSoundField2GridPreset =
    preset === "eco" || preset === "high" || preset === "normal"
      ? preset
      : DEFAULT_CONFIG.threeSoundField2.gridPreset;
}

function applyThreeSoundField2ThemeId(value) {
  const theme = String(value ?? "").trim();
  threeSoundField2ThemeId = THREE_SOUND_FIELD2_THEME_IDS.has(theme)
    ? theme
    : DEFAULT_CONFIG.threeSoundField2.themeId;
}

function applyThreeSoundField2BloomEnabled(value) {
  threeSoundField2BloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField2.bloomEnabled);
}

function applyThreeSoundField2BloomStrength(value) {
  const n = Number(value);
  threeSoundField2BloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField2.bloomStrength;
}

function applyThreeSoundField2CameraPitchDeg(value) {
  threeSoundField2CameraPitchDeg = clampInt(value, 25, 75);
}

function applyThreeSoundField2CameraDistance(value) {
  const n = Number(value);
  threeSoundField2CameraDistance = Number.isFinite(n)
    ? Math.min(22, Math.max(8, n))
    : DEFAULT_CONFIG.threeSoundField2.cameraDistance;
}

function applyThreeSoundField2AutoRotateEnabled(value) {
  threeSoundField2AutoRotateEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField2.autoRotateEnabled);
}

function applyThreeSoundField2AutoRotateSpeedDeg(value) {
  const n = Number(value);
  threeSoundField2AutoRotateSpeedDeg = Number.isFinite(n)
    ? Math.min(12, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField2.autoRotateSpeedDeg;
}

function applyThreeSoundField2PulseEnabled(value) {
  threeSoundField2PulseEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField2.pulseEnabled);
}

function applyThreeSoundField2PulseSensitivity(value) {
  const n = Number(value);
  threeSoundField2PulseSensitivity = Number.isFinite(n)
    ? Math.min(1, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField2.pulseSensitivity;
}

function applyThreeSoundField2SnareEnabled(value) {
  threeSoundField2SnareEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField2.snareEnabled);
}

function applyThreeSoundField2SnareSensitivity(value) {
  const n = Number(value);
  threeSoundField2SnareSensitivity = Number.isFinite(n)
    ? Math.min(1, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField2.snareSensitivity;
}

function applyThreeSoundField2MeteorEnabled(value) {
  threeSoundField2MeteorEnabled = parseBoolean(value, DEFAULT_CONFIG.threeSoundField2.meteorEnabled);
}

function applyThreeSoundField2MeteorSensitivity(value) {
  const n = Number(value);
  threeSoundField2MeteorSensitivity = Number.isFinite(n)
    ? Math.min(1, Math.max(0, n))
    : DEFAULT_CONFIG.threeSoundField2.meteorSensitivity;
}

function applyThreeSoundField2GroundEqConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  if (Array.isArray(payload.groundEqBands) && payload.groundEqBands.length === 8) {
    threeSoundField2GroundEqBands = payload.groundEqBands.map((v) => clampInt(v, 0, 100));
  }
  if (Array.isArray(payload.groundEqEnabledBands) && payload.groundEqEnabledBands.length === 8) {
    threeSoundField2GroundEqEnabledBands = payload.groundEqEnabledBands.map((v) => Boolean(v));
  }
  if (payload.groundEqMotionSpeed != null) {
    threeSoundField2GroundEqMotionSpeed = clampInt(payload.groundEqMotionSpeed, 0, 100);
  }
  if (payload.groundEqAmplitude != null) {
    threeSoundField2GroundEqAmplitude = clampInt(payload.groundEqAmplitude, 0, 100);
  }
}

function applyThreeSoundField2FloatingBlocksConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.floatingBlocksEnabled != null) {
    threeSoundField2FloatingBlocksEnabled = parseBoolean(
      payload.floatingBlocksEnabled,
      DEFAULT_CONFIG.threeSoundField2.floatingBlocksEnabled,
    );
  }
  if (payload.floatingBlockIntensity != null) {
    threeSoundField2FloatingBlockIntensity = clampInt(payload.floatingBlockIntensity, 0, 100);
  }
  if (payload.floatingBlockSpeed != null) {
    threeSoundField2FloatingBlockSpeed = clampInt(payload.floatingBlockSpeed, 10, 150);
  }
  if (payload.floatingBlockCount != null) {
    threeSoundField2FloatingBlockCount = clampInt(payload.floatingBlockCount, 0, 120);
  }
}

function applyThreeSoundField2CoverConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.coverEnabled != null) {
    threeSoundField2CoverEnabled = parseBoolean(
      payload.coverEnabled,
      DEFAULT_CONFIG.threeSoundField2.coverEnabled,
    );
  }
  if (payload.coverSize != null) {
    const n = Number(payload.coverSize);
    threeSoundField2CoverSize = Number.isFinite(n)
      ? Math.min(4.5, Math.max(1.2, n))
      : DEFAULT_CONFIG.threeSoundField2.coverSize;
  }
  if (payload.coverHeight != null) {
    const n = Number(payload.coverHeight);
    threeSoundField2CoverHeight = Number.isFinite(n)
      ? Math.min(7, Math.max(2.5, n))
      : DEFAULT_CONFIG.threeSoundField2.coverHeight;
  }
  if (payload.coverOpacity != null) {
    const n = Number(payload.coverOpacity);
    threeSoundField2CoverOpacity = Number.isFinite(n)
      ? Math.min(1, Math.max(0.2, n))
      : DEFAULT_CONFIG.threeSoundField2.coverOpacity;
  }
}

function applyThreeLiquidBlobColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeLiquidBlob.blobColor;
  threeLiquidBlobColorHex = safe;
}

function applyThreeLiquidBlobColorSecondaryHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_CONFIG.threeLiquidBlob.blobColorSecondary;
  threeLiquidBlobColorSecondaryHex = safe;
}

function applyThreeLiquidBlobCount(value) {
  threeLiquidBlobCount = clampInt(value, 2, 5);
}

function applyThreeLiquidBlobMergeStrength(value) {
  threeLiquidBlobMergeStrength = clampInt(value, 0, 100);
}

function applyThreeLiquidBlobWobbleSpeed(value) {
  const n = Number(value);
  threeLiquidBlobWobbleSpeed = Number.isFinite(n)
    ? Math.min(3, Math.max(0.2, n))
    : DEFAULT_CONFIG.threeLiquidBlob.wobbleSpeed;
}

function applyThreeLiquidBlobBassDrive(value) {
  threeLiquidBlobBassDrive = clampInt(value, 0, 100);
}

function applyThreeLiquidBlobPulseOnPeak(value) {
  threeLiquidBlobPulseOnPeak = parseBoolean(value, DEFAULT_CONFIG.threeLiquidBlob.pulseOnPeak);
}

function applyThreeLiquidBlobBloomEnabled(value) {
  threeLiquidBlobBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeLiquidBlob.bloomEnabled);
}

function applyThreeLiquidBlobBloomStrength(value) {
  const n = Number(value);
  threeLiquidBlobBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeLiquidBlob.bloomStrength;
}

function applyThreeLavaLampColorWarmHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeLavaLamp.colorWarm;
  threeLavaLampColorWarmHex = safe;
}

function applyThreeLavaLampColorCoolHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeLavaLamp.colorCool;
  threeLavaLampColorCoolHex = safe;
}

function applyThreeLavaLampBlobCount(value) {
  threeLavaLampBlobCount = clampInt(value, 2, 4);
}

function applyThreeLavaLampMergeStrength(value) {
  threeLavaLampMergeStrength = clampInt(value, 0, 100);
}

function applyThreeLavaLampBuoyancySpeed(value) {
  const n = Number(value);
  threeLavaLampBuoyancySpeed = Number.isFinite(n)
    ? Math.min(2, Math.max(0.2, n))
    : DEFAULT_CONFIG.threeLavaLamp.buoyancySpeed;
}

function applyThreeLavaLampBassDrive(value) {
  threeLavaLampBassDrive = clampInt(value, 0, 100);
}

function applyThreeLavaLampBloomEnabled(value) {
  threeLavaLampBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeLavaLamp.bloomEnabled);
}

function applyThreeLavaLampBloomStrength(value) {
  const n = Number(value);
  threeLavaLampBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeLavaLamp.bloomStrength;
}

function applyThreeOilMarbleColor1Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeOilMarble.color1;
  threeOilMarbleColor1Hex = safe;
}

function applyThreeOilMarbleColor2Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeOilMarble.color2;
  threeOilMarbleColor2Hex = safe;
}

function applyThreeOilMarbleColor3Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeOilMarble.color3;
  threeOilMarbleColor3Hex = safe;
}

function applyThreeOilMarbleColor4Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeOilMarble.color4;
  threeOilMarbleColor4Hex = safe;
}

function applyThreeOilMarbleColor4Enabled(value) {
  threeOilMarbleColor4Enabled = parseBoolean(value, DEFAULT_CONFIG.threeOilMarble.color4Enabled);
}

function applyThreeOilMarbleFlowSpeed(value) {
  const n = Number(value);
  threeOilMarbleFlowSpeed = Number.isFinite(n)
    ? Math.min(2.5, Math.max(0.2, n))
    : DEFAULT_CONFIG.threeOilMarble.flowSpeed;
}

function applyThreeOilMarbleNoiseScale(value) {
  const n = Number(value);
  threeOilMarbleNoiseScale = Number.isFinite(n)
    ? Math.min(4.5, Math.max(0.8, n))
    : DEFAULT_CONFIG.threeOilMarble.noiseScale;
}

function applyThreeOilMarbleWarpStrength(value) {
  threeOilMarbleWarpStrength = clampInt(value, 0, 100);
}

function applyThreeOilMarbleReactiveness(value) {
  threeOilMarbleReactiveness = clampInt(value, 0, 100);
}

function applyThreeOilMarbleBloomEnabled(value) {
  threeOilMarbleBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeOilMarble.bloomEnabled);
}

function applyThreeOilMarbleBloomStrength(value) {
  const n = Number(value);
  threeOilMarbleBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeOilMarble.bloomStrength;
}

function applyThreePearlChainColor1Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePearlChain.color1;
  threePearlChainColor1Hex = safe;
}

function applyThreePearlChainColor2Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePearlChain.color2;
  threePearlChainColor2Hex = safe;
}

function applyThreePearlChainColor3Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threePearlChain.color3;
  threePearlChainColor3Hex = safe;
}

function applyThreePearlChainPearlCount(value) {
  threePearlChainPearlCount = clampInt(value, 5, 10);
}

function applyThreePearlChainChainRadius(value) {
  const n = Number(value);
  threePearlChainChainRadius = Number.isFinite(n)
    ? Math.min(1.2, Math.max(0.4, n))
    : DEFAULT_CONFIG.threePearlChain.chainRadius;
}

function applyThreePearlChainPearlSize(value) {
  const n = Number(value);
  threePearlChainPearlSize = Number.isFinite(n)
    ? Math.min(0.35, Math.max(0.12, n))
    : DEFAULT_CONFIG.threePearlChain.pearlSize;
}

function applyThreePearlChainSwaySpeed(value) {
  const n = Number(value);
  threePearlChainSwaySpeed = Number.isFinite(n)
    ? Math.min(2, Math.max(0.2, n))
    : DEFAULT_CONFIG.threePearlChain.swaySpeed;
}

function applyThreePearlChainMergeStrength(value) {
  threePearlChainMergeStrength = clampInt(value, 0, 100);
}

function applyThreePearlChainBloomEnabled(value) {
  threePearlChainBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threePearlChain.bloomEnabled);
}

function applyThreePearlChainBloomStrength(value) {
  const n = Number(value);
  threePearlChainBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threePearlChain.bloomStrength;
}

function applyThreeCrystalGemColorCoreHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeCrystalGem.colorCore;
  threeCrystalGemColorCoreHex = safe;
}

function applyThreeCrystalGemColorEdgeHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeCrystalGem.colorEdge;
  threeCrystalGemColorEdgeHex = safe;
}

function applyThreeCrystalGemColorHighlightHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeCrystalGem.colorHighlight;
  threeCrystalGemColorHighlightHex = safe;
}

function applyThreeCrystalGemGemCount(value) {
  threeCrystalGemGemCount = clampInt(value, 1, 3);
}

function applyThreeCrystalGemFacetSharpness(value) {
  threeCrystalGemFacetSharpness = clampInt(value, 0, 100);
}

function applyThreeCrystalGemRotationSpeedDeg(value) {
  threeCrystalGemRotationSpeedDeg = clampInt(value, 0, 30);
}

function applyThreeCrystalGemChromaticEnabled(value) {
  threeCrystalGemChromaticEnabled = parseBoolean(value, DEFAULT_CONFIG.threeCrystalGem.chromaticEnabled);
}

function applyThreeCrystalGemChromaticOffset(value) {
  const n = Number(value);
  threeCrystalGemChromaticOffset = Number.isFinite(n)
    ? Math.min(0.01, Math.max(0, n))
    : DEFAULT_CONFIG.threeCrystalGem.chromaticOffset;
}

function applyThreeCrystalGemBloomEnabled(value) {
  threeCrystalGemBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeCrystalGem.bloomEnabled);
}

function applyThreeCrystalGemBloomStrength(value) {
  const n = Number(value);
  threeCrystalGemBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeCrystalGem.bloomStrength;
}

function applyThreeGlassOrbsColor1Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeGlassOrbs.color1;
  threeGlassOrbsColor1Hex = safe;
}

function applyThreeGlassOrbsColor2Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeGlassOrbs.color2;
  threeGlassOrbsColor2Hex = safe;
}

function applyThreeGlassOrbsColor3Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeGlassOrbs.color3;
  threeGlassOrbsColor3Hex = safe;
}

function applyThreeGlassOrbsColor4Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeGlassOrbs.color4;
  threeGlassOrbsColor4Hex = safe;
}

function applyThreeGlassOrbsColor5Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeGlassOrbs.color5;
  threeGlassOrbsColor5Hex = safe;
}

function applyThreeGlassOrbsOrbCount(value) {
  threeGlassOrbsOrbCount = clampInt(value, 2, 5);
}

function applyThreeGlassOrbsStackSpacing(value) {
  const n = Number(value);
  threeGlassOrbsStackSpacing = Number.isFinite(n)
    ? Math.min(0.6, Math.max(0.2, n))
    : DEFAULT_CONFIG.threeGlassOrbs.stackSpacing;
}

function applyThreeGlassOrbsTransmission(value) {
  threeGlassOrbsTransmission = clampInt(value, 0, 100);
}

function applyThreeGlassOrbsRefractionStrength(value) {
  threeGlassOrbsRefractionStrength = clampInt(value, 0, 100);
}

function applyThreeGlassOrbsBreatheWithPeak(value) {
  threeGlassOrbsBreatheWithPeak = parseBoolean(value, DEFAULT_CONFIG.threeGlassOrbs.breatheWithPeak);
}

function applyThreeGlassOrbsChromaticEnabled(value) {
  threeGlassOrbsChromaticEnabled = parseBoolean(value, DEFAULT_CONFIG.threeGlassOrbs.chromaticEnabled);
}

function applyThreeGlassOrbsChromaticOffset(value) {
  const n = Number(value);
  threeGlassOrbsChromaticOffset = Number.isFinite(n)
    ? Math.min(0.01, Math.max(0, n))
    : DEFAULT_CONFIG.threeGlassOrbs.chromaticOffset;
}

function applyThreeGlassOrbsBloomEnabled(value) {
  threeGlassOrbsBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeGlassOrbs.bloomEnabled);
}

function applyThreeGlassOrbsBloomStrength(value) {
  const n = Number(value);
  threeGlassOrbsBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeGlassOrbs.bloomStrength;
}

function applyThreeHoloPrismTintLowHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeHoloPrism.tintLow;
  threeHoloPrismTintLowHex = safe;
}

function applyThreeHoloPrismTintHighHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeHoloPrism.tintHigh;
  threeHoloPrismTintHighHex = safe;
}

function applyThreeHoloPrismSides(value) {
  threeHoloPrismSides = clampInt(value, 4, 8);
}

function applyThreeHoloPrismRotationSpeedDeg(value) {
  threeHoloPrismRotationSpeedDeg = clampInt(value, 0, 30);
}

function applyThreeHoloPrismSpectralStrength(value) {
  threeHoloPrismSpectralStrength = clampInt(value, 0, 100);
}

function applyThreeHoloPrismPulseOnPeak(value) {
  threeHoloPrismPulseOnPeak = parseBoolean(value, DEFAULT_CONFIG.threeHoloPrism.pulseOnPeak);
}

function applyThreeHoloPrismChromaticOffset(value) {
  const n = Number(value);
  threeHoloPrismChromaticOffset = Number.isFinite(n)
    ? Math.min(0.01, Math.max(0, n))
    : DEFAULT_CONFIG.threeHoloPrism.chromaticOffset;
}

function applyThreeHoloPrismBloomEnabled(value) {
  threeHoloPrismBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeHoloPrism.bloomEnabled);
}

function applyThreeHoloPrismBloomStrength(value) {
  const n = Number(value);
  threeHoloPrismBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeHoloPrism.bloomStrength;
}

function applyThreeNebulaVolumeColorCoreHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeNebulaVolume.colorCore;
  threeNebulaVolumeColorCoreHex = safe;
}

function applyThreeNebulaVolumeColorMidHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeNebulaVolume.colorMid;
  threeNebulaVolumeColorMidHex = safe;
}

function applyThreeNebulaVolumeColorEdgeHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeNebulaVolume.colorEdge;
  threeNebulaVolumeColorEdgeHex = safe;
}

function applyThreeNebulaVolumeDensityScale(value) {
  const n = Number(value);
  threeNebulaVolumeDensityScale = Number.isFinite(n)
    ? Math.min(2.5, Math.max(0.4, n))
    : DEFAULT_CONFIG.threeNebulaVolume.densityScale;
}

function applyThreeNebulaVolumeNoiseScale(value) {
  const n = Number(value);
  threeNebulaVolumeNoiseScale = Number.isFinite(n)
    ? Math.min(4.0, Math.max(0.6, n))
    : DEFAULT_CONFIG.threeNebulaVolume.noiseScale;
}

function applyThreeNebulaVolumeSwirlSpeed(value) {
  const n = Number(value);
  threeNebulaVolumeSwirlSpeed = Number.isFinite(n)
    ? Math.min(2.0, Math.max(0.1, n))
    : DEFAULT_CONFIG.threeNebulaVolume.swirlSpeed;
}

function applyThreeNebulaVolumeMarchSteps(value) {
  threeNebulaVolumeMarchSteps = clampInt(value, 32, 48);
}

function applyThreeNebulaVolumeBloomEnabled(value) {
  threeNebulaVolumeBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeNebulaVolume.bloomEnabled);
}

function applyThreeNebulaVolumeBloomStrength(value) {
  const n = Number(value);
  threeNebulaVolumeBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeNebulaVolume.bloomStrength;
}

function applyThreeKnotOrganicColor1Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeKnotOrganic.color1;
  threeKnotOrganicColor1Hex = safe;
}

function applyThreeKnotOrganicColor2Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeKnotOrganic.color2;
  threeKnotOrganicColor2Hex = safe;
}

function applyThreeKnotOrganicColor3Hex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeKnotOrganic.color3;
  threeKnotOrganicColor3Hex = safe;
}

function applyThreeKnotOrganicKnotP(value) {
  threeKnotOrganicKnotP = clampInt(value, 2, 4);
}

function applyThreeKnotOrganicKnotQ(value) {
  threeKnotOrganicKnotQ = clampInt(value, 3, 7);
}

function applyThreeKnotOrganicTubeRadius(value) {
  const n = Number(value);
  threeKnotOrganicTubeRadius = Number.isFinite(n)
    ? Math.min(0.28, Math.max(0.06, n))
    : DEFAULT_CONFIG.threeKnotOrganic.tubeRadius;
}

function applyThreeKnotOrganicSurfaceNoise(value) {
  threeKnotOrganicSurfaceNoise = clampInt(value, 0, 100);
}

function applyThreeKnotOrganicRotationSpeedDeg(value) {
  threeKnotOrganicRotationSpeedDeg = clampInt(value, 0, 30);
}

function applyThreeKnotOrganicBloomEnabled(value) {
  threeKnotOrganicBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeKnotOrganic.bloomEnabled);
}

function applyThreeKnotOrganicBloomStrength(value) {
  const n = Number(value);
  threeKnotOrganicBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeKnotOrganic.bloomStrength;
}

function applyThreeCoverPreset(value) {
  const n = Math.round(Number(value));
  threeCoverPreset = n === 4 ? 4 : 0;
}

function applyThreeCoverResolution(value) {
  const n = Number(value);
  threeCoverResolution = Number.isFinite(n)
    ? Math.min(1.55, Math.max(0.75, n))
    : DEFAULT_CONFIG.threeCoverParticle.coverResolution;
}

function applyThreeCoverIntensity(value) {
  threeCoverIntensity = clampInt(value, 0, 100);
}

function applyThreeCoverDepth(value) {
  threeCoverDepth = clampInt(value, 0, 100);
}

function applyThreeCoverPointScale(value) {
  threeCoverPointScale = clampInt(value, 0, 100);
}

function applyThreeCoverSpeed(value) {
  threeCoverSpeed = clampInt(value, 0, 100);
}

function applyThreeCoverTwist(value) {
  threeCoverTwist = clampInt(value, 0, 100);
}

function applyThreeCoverScatter(value) {
  threeCoverScatter = clampInt(value, 0, 100);
}

function applyThreeCoverColorBoost(value) {
  threeCoverColorBoost = clampInt(value, 0, 100);
}

function applyThreeCoverBloomEnabled(value) {
  threeCoverBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeCoverParticle.bloomEnabled);
}

function applyThreeCoverBloomStrength(value) {
  const n = Number(value);
  threeCoverBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeCoverParticle.bloomStrength;
}

function applyThreeCoverBloomSize(value) {
  const n = Number(value);
  threeCoverBloomSize = Number.isFinite(n)
    ? Math.min(4.5, Math.max(1, n))
    : DEFAULT_CONFIG.threeCoverParticle.bloomSize;
}

function applyThreeCoverCameraDistance(value) {
  const n = Number(value);
  threeCoverCameraDistance = Number.isFinite(n)
    ? Math.min(14, Math.max(3, n))
    : DEFAULT_CONFIG.threeCoverParticle.cameraDistance;
}

function applyThreeCoverCameraFovDeg(value) {
  threeCoverCameraFovDeg = clampInt(value, 30, 75);
}

function applyThreeCoverAutoRotateEnabled(value) {
  threeCoverAutoRotateEnabled = parseBoolean(value, DEFAULT_CONFIG.threeCoverParticle.autoRotateEnabled);
}

function applyThreeCoverAutoRotateSpeedDeg(value) {
  threeCoverAutoRotateSpeedDeg = clampInt(value, 0, 12);
}

function applyThreeAuroraColorLowHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeAuroraRibbon.colorLow;
  threeAuroraColorLowHex = safe;
}

function applyThreeAuroraColorHighHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeAuroraRibbon.colorHigh;
  threeAuroraColorHighHex = safe;
}

function applyThreeAuroraRibbonCount(value) {
  threeAuroraRibbonCount = clampInt(value, 2, 6);
}

function applyThreeAuroraRibbonWidth(value) {
  const n = Number(value);
  threeAuroraRibbonWidth = Number.isFinite(n)
    ? Math.min(0.2, Math.max(0.02, n))
    : DEFAULT_CONFIG.threeAuroraRibbon.ribbonWidth;
}

function applyThreeAuroraWaveAmplitude(value) {
  const n = Number(value);
  threeAuroraWaveAmplitude = Number.isFinite(n)
    ? Math.min(0.8, Math.max(0.1, n))
    : DEFAULT_CONFIG.threeAuroraRibbon.waveAmplitude;
}

function applyThreeAuroraWaveSpeed(value) {
  const n = Number(value);
  threeAuroraWaveSpeed = Number.isFinite(n)
    ? Math.min(3, Math.max(0.2, n))
    : DEFAULT_CONFIG.threeAuroraRibbon.waveSpeed;
}

function applyThreeAuroraBassBandIndex(value) {
  threeAuroraBassBandIndex = clampInt(value, 0, 7);
}

function applyThreeAuroraBloomEnabled(value) {
  threeAuroraBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeAuroraRibbon.bloomEnabled);
}

function applyThreeAuroraBloomStrength(value) {
  const n = Number(value);
  threeAuroraBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeAuroraRibbon.bloomStrength;
}

function applyThreeAuroraAutoRotateSpeedDeg(value) {
  const n = Number(value);
  threeAuroraAutoRotateSpeedDeg = Number.isFinite(n)
    ? Math.min(15, Math.max(0, n))
    : DEFAULT_CONFIG.threeAuroraRibbon.autoRotateSpeedDeg;
}

function applyThreeBreathingRingColorHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeBreathingRings.ringColor;
  threeBreathingRingColorHex = safe;
}

function applyThreeBreathingRingCount(value) {
  threeBreathingRingCount = clampInt(value, 2, 8);
}

function applyThreeBreathingBaseRadius(value) {
  const n = Number(value);
  threeBreathingBaseRadius = Number.isFinite(n)
    ? Math.min(0.8, Math.max(0.2, n))
    : DEFAULT_CONFIG.threeBreathingRings.baseRadius;
}

function applyThreeBreathingRadiusStep(value) {
  const n = Number(value);
  threeBreathingRadiusStep = Number.isFinite(n)
    ? Math.min(0.3, Math.max(0.05, n))
    : DEFAULT_CONFIG.threeBreathingRings.radiusStep;
}

function applyThreeBreathingPulseStrength(value) {
  threeBreathingPulseStrength = clampInt(value, 0, 100);
}

function applyThreeBreathingTubeRadius(value) {
  const n = Number(value);
  threeBreathingTubeRadius = Number.isFinite(n)
    ? Math.min(0.06, Math.max(0.01, n))
    : DEFAULT_CONFIG.threeBreathingRings.tubeRadius;
}

function applyThreeBreathingBloomEnabled(value) {
  threeBreathingBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeBreathingRings.bloomEnabled);
}

function applyThreeBreathingBloomStrength(value) {
  const n = Number(value);
  threeBreathingBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeBreathingRings.bloomStrength;
}

function applyThreeBreathingAutoRotateSpeedDeg(value) {
  const n = Number(value);
  threeBreathingAutoRotateSpeedDeg = Number.isFinite(n)
    ? Math.min(15, Math.max(0, n))
    : DEFAULT_CONFIG.threeBreathingRings.autoRotateSpeedDeg;
}

function applyThreeNoiseColorLowHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeNoiseLandscape.colorLow;
  threeNoiseColorLowHex = safe;
}

function applyThreeNoiseColorHighHex(raw) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.threeNoiseLandscape.colorHigh;
  threeNoiseColorHighHex = safe;
}

function applyThreeNoiseGridSize(value) {
  threeNoiseGridSize = clampInt(value, 32, 96);
}

function applyThreeNoiseHeightScale(value) {
  const n = Number(value);
  threeNoiseHeightScale = Number.isFinite(n)
    ? Math.min(1.2, Math.max(0.1, n))
    : DEFAULT_CONFIG.threeNoiseLandscape.heightScale;
}

function applyThreeNoiseNoiseScale(value) {
  const n = Number(value);
  threeNoiseNoiseScale = Number.isFinite(n)
    ? Math.min(4, Math.max(0.5, n))
    : DEFAULT_CONFIG.threeNoiseLandscape.noiseScale;
}

function applyThreeNoiseScrollSpeed(value) {
  const n = Number(value);
  threeNoiseScrollSpeed = Number.isFinite(n)
    ? Math.min(2.5, Math.max(0.1, n))
    : DEFAULT_CONFIG.threeNoiseLandscape.scrollSpeed;
}

function applyThreeNoiseWireframeOverlay(value) {
  threeNoiseWireframeOverlay = parseBoolean(value, DEFAULT_CONFIG.threeNoiseLandscape.wireframeOverlay);
}

function applyThreeNoiseBloomEnabled(value) {
  threeNoiseBloomEnabled = parseBoolean(value, DEFAULT_CONFIG.threeNoiseLandscape.bloomEnabled);
}

function applyThreeNoiseBloomStrength(value) {
  const n = Number(value);
  threeNoiseBloomStrength = Number.isFinite(n)
    ? Math.min(2, Math.max(0, n))
    : DEFAULT_CONFIG.threeNoiseLandscape.bloomStrength;
}

function applyThreeNoiseCameraPitchDeg(value) {
  threeNoiseCameraPitchDeg = clampInt(value, 25, 75);
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

function clearVanillaCanvas() {
  if (!gl || gl.isContextLost()) return;
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function setVanillaCanvasVisible(visible) {
  canvas.classList.toggle("is-hidden", !visible);
  if (!visible) {
    clearVanillaCanvas();
  }
}

function setThreeCanvasVisible(visible) {
  if (!threeCanvas) return;
  threeCanvas.hidden = !visible;
  threeCanvas.classList.toggle("is-visible", visible);
  if (!visible && threeBridge.isActive()) {
    threeBridge.clear();
  }
}

function activateThreeOverlay() {
  setVanillaCanvasVisible(false);
  setThreeCanvasVisible(true);
}

function deactivateThreeOverlay() {
  setThreeCanvasVisible(false);
  setVanillaCanvasVisible(true);
  if (renderBackend === "three") {
    renderBackend = "vanilla";
  }
}

function isThreeMode(mode) {
  return isThreeDisplayMode(mode);
}

function syncRenderBackend(mode) {
  const wantThree = isThreeMode(mode);

  if (!wantThree) {
    threeInitBlockedMode = null;
    deactivateThreeOverlay();
    return;
  }

  if (threeInitBlockedMode === mode) {
    return;
  }

  if (renderBackend !== "three") {
    if (!threeCanvas) {
      console.error("[WaveDance] 缺少 #waveCanvasThree，无法启用 Three 模式");
      threeInitBlockedMode = mode;
      return;
    }
    try {
      activateThreeOverlay();
      if (!threeBridge.isActive()) {
        threeBridge.init(threeCanvas);
      }
      threeBridge.setMode(mode);
      if (!threeBridge.hasActiveRenderer()) {
        throw new Error(`Three renderer 未就绪：${mode}`);
      }
      renderBackend = "three";
      threeInitBlockedMode = null;
    } catch (err) {
      console.error("[WaveDance] Three 初始化失败，回退 vanilla", err);
      threeBridge.dispose();
      deactivateThreeOverlay();
      threeInitBlockedMode = mode;
    }
    return;
  }

  if (threeBridge.getActiveMode() !== mode) {
    threeBridge.setMode(mode);
    if (!threeBridge.hasActiveRenderer()) {
      console.error(`[WaveDance] Three 模式切换失败：${mode}`);
    }
  }
  activateThreeOverlay();
}

function resizeCanvas() {
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);

  if (renderBackend === "three" && threeCanvas) {
    threeBridge.resize(
      Math.max(1, threeCanvas.clientWidth || cssWidth),
      Math.max(1, threeCanvas.clientHeight || cssHeight),
    );
  }

  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(cssWidth * dpr);
  const height = Math.floor(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (gl && !gl.isContextLost()) {
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}

function renderVanillaFrame() {
  if (!gl || gl.isContextLost()) return;
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const renderer = RENDERERS[displayMode] ?? RENDERERS[DISPLAY_MODES.line];
  const renderData =
    displayMode === DISPLAY_MODES.oscilloscope ? latestTimeSamples : latestPoints;
  const frameMeta = { peak: latestPeak, rms: latestRms };
  renderer.render(renderData, getShapeConfigForMode(displayMode), getStyleConfigForMode(displayMode), frameMeta);
}

function renderThreeFrame() {
  if (renderBackend !== "three") return;
  try {
    const renderData =
      displayMode === DISPLAY_MODES.oscilloscope ? latestTimeSamples : latestPoints;
    const frameMeta = {
      peak: latestPeak,
      rms: latestRms,
      cover: coverArtState,
    };
    threeBridge.render(
      renderData,
      getShapeConfigForMode(displayMode),
      getStyleConfigForMode(displayMode),
      frameMeta,
    );
  } catch (err) {
    console.error("[WaveDance] Three 渲染失败", err);
  }
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
  if (mode === DISPLAY_MODES.obliqueBar) return obliqueBarShapeConfig;
  if (mode === DISPLAY_MODES.depthLayers) return depthLayersShapeConfig;
  if (mode === DISPLAY_MODES.isometricSkyline) return isometricSkylineShapeConfig;
  if (mode === DISPLAY_MODES.ring3d) return ring3dShapeConfig;
  if (mode === DISPLAY_MODES.terrain3d) return terrain3dShapeConfig;
  if (mode === DISPLAY_MODES.helix3d) return helix3dShapeConfig;
  if (mode === DISPLAY_MODES.threePlasmaField) return threePlasmaShapeConfig;
  if (mode === DISPLAY_MODES.threeParticleGalaxy) return threeGalaxyShapeConfig;
  if (mode === DISPLAY_MODES.threeBloomTunnel) return threeTunnelShapeConfig;
  if (mode === DISPLAY_MODES.threeEnergySphere) return threeSphereShapeConfig;
  if (mode === DISPLAY_MODES.threeKaleidoscope) return threeKaleidoscopeShapeConfig;
  if (mode === DISPLAY_MODES.threeGlitchSpectrum) return threeGlitchShapeConfig;
  if (mode === DISPLAY_MODES.threePhosphorTrail) return threePhosphorShapeConfig;
  if (mode === DISPLAY_MODES.threeScanGrid) return threeScanGridShapeConfig;
  if (mode === DISPLAY_MODES.threeSoundField) return threeSoundFieldShapeConfig;
  if (mode === DISPLAY_MODES.threeSoundField2) return threeSoundField2ShapeConfig;
  if (mode === DISPLAY_MODES.threeLiquidBlob) return threeLiquidBlobShapeConfig;
  if (mode === DISPLAY_MODES.threeAuroraRibbon) return threeAuroraShapeConfig;
  if (mode === DISPLAY_MODES.threeBreathingRings) return threeBreathingRingsShapeConfig;
  if (mode === DISPLAY_MODES.threeNoiseLandscape) return threeNoiseLandscapeShapeConfig;
  if (mode === DISPLAY_MODES.threeLavaLamp) return threeLavaLampShapeConfig;
  if (mode === DISPLAY_MODES.threeOilMarble) return threeOilMarbleShapeConfig;
  if (mode === DISPLAY_MODES.threePearlChain) return threePearlChainShapeConfig;
  if (mode === DISPLAY_MODES.threeCrystalGem) return threeCrystalGemShapeConfig;
  if (mode === DISPLAY_MODES.threeGlassOrbs) return threeGlassOrbsShapeConfig;
  if (mode === DISPLAY_MODES.threeHoloPrism) return threeHoloPrismShapeConfig;
  if (mode === DISPLAY_MODES.threeNebulaVolume) return threeNebulaVolumeShapeConfig;
  if (mode === DISPLAY_MODES.threeKnotOrganic) return threeKnotOrganicShapeConfig;
  if (mode === DISPLAY_MODES.threeCoverParticle) return threeCoverShapeConfig;
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
  if (mode === DISPLAY_MODES.obliqueBar) {
    return {
      colorNear: obliqueBarColorNearRgb,
      colorFar: obliqueBarColorFarRgb,
      widthPercent: obliqueBarWidthPercent,
      gapPercent: obliqueBarGapPercent,
      headroomPercent: obliqueBarHeadroomPercent,
      tiltDeg: obliqueBarTiltDeg,
      showGroundLine: obliqueBarShowGroundLine,
      mirrorEnabled: obliqueBarMirrorEnabled,
      displayBarCount: obliqueBarDisplayBarCount,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.depthLayers) {
    return {
      layerCount: depthLayersLayerCount,
      color: depthLayersColorRgb,
      colorFar: depthLayersColorFarRgb,
      layerSpacingPx: depthLayersLayerSpacingPx,
      farScalePercent: depthLayersFarScalePercent,
      farAlphaPercent: depthLayersFarAlphaPercent,
      bassFrontEnabled: depthLayersBassFrontEnabled,
      lineWidthPx: depthLayersLineWidthPx,
      renderStyle: depthLayersRenderStyle,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.isometricSkyline) {
    return {
      faceTopColor: isometricSkylineFaceTopRgb,
      faceLeftColor: isometricSkylineFaceLeftRgb,
      faceRightColor: isometricSkylineFaceRightRgb,
      buildingWidthPx: isometricSkylineBuildingWidthPx,
      buildingGapPx: isometricSkylineBuildingGapPx,
      skylineBaselinePercent: isometricSkylineBaselinePercent,
      displayBuildingCount: isometricSkylineDisplayBuildingCount,
      showGroundPlane: isometricSkylineShowGroundPlane,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.ring3d) {
    return {
      barColor: ring3dBarRgb,
      innerRadius: ring3dInnerRadius,
      outerRadius: ring3dOuterRadius,
      barHeightScale: ring3dBarHeightScale,
      barThicknessDeg: ring3dBarThicknessDeg,
      displayBarCount: ring3dDisplayBarCount,
      wireframeEnabled: ring3dWireframeEnabled,
      fillEnabled: ring3dFillEnabled,
      autoRotateEnabled: ring3dAutoRotateEnabled,
      autoRotateSpeedDeg: ring3dAutoRotateSpeedDeg,
      cameraDistance: ring3dCameraDistance,
      cameraFovDeg: ring3dCameraFovDeg,
      breatheWithPeak: ring3dBreatheWithPeak,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.terrain3d) {
    return {
      colorLow: terrain3dColorLowRgb,
      colorHigh: terrain3dColorHighRgb,
      wireframeColor: terrain3dWireframeRgb,
      gridCols: terrain3dGridCols,
      gridRows: terrain3dGridRows,
      scrollEveryNFrames: terrain3dScrollEveryNFrames,
      wireframeEnabled: terrain3dWireframeEnabled,
      fillEnabled: terrain3dFillEnabled,
      terrainHeightScale: terrain3dTerrainHeightScale,
      cameraPitchDeg: terrain3dCameraPitchDeg,
      cameraDistance: terrain3dCameraDistance,
      autoScrollEnabled: terrain3dAutoScrollEnabled,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.helix3d) {
    return {
      dotColor: helix3dDotRgb,
      helixRadius: helix3dHelixRadius,
      helixPitch: helix3dHelixPitch,
      helixTurns: helix3dHelixTurns,
      displayPointCount: helix3dDisplayPointCount,
      extrudeMode: helix3dExtrudeMode,
      extrudeScale: 0.28,
      heightScale: 0.35,
      pointSizePx: helix3dPointSizePx,
      wireframeEnabled: helix3dWireframeEnabled,
      autoRotateEnabled: helix3dAutoRotateEnabled,
      autoRotateSpeedDeg: helix3dAutoRotateSpeedDeg,
      cameraDistance: helix3dCameraDistance,
      cameraFovDeg: helix3dCameraFovDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threePlasmaField) {
    return {
      colorLow: threePlasmaColorLowHex,
      colorHigh: threePlasmaColorHighHex,
      speed: threePlasmaSpeed,
      noiseScale: threePlasmaNoiseScale,
      reactiveness: threePlasmaReactiveness,
      bloomEnabled: threePlasmaBloomEnabled,
      bloomStrength: threePlasmaBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeParticleGalaxy) {
    return {
      particleColor: threeGalaxyColorHex,
      particleCount: threeGalaxyParticleCount,
      galaxyRadius: threeGalaxyRadius,
      spiralArms: threeGalaxySpiralArms,
      bassPullStrength: threeGalaxyBassPullStrength,
      trebleSpreadStrength: threeGalaxyTrebleSpreadStrength,
      bloomEnabled: threeGalaxyBloomEnabled,
      bloomStrength: threeGalaxyBloomStrength,
      autoRotateSpeedDeg: threeGalaxyAutoRotateSpeedDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeBloomTunnel) {
    return {
      wallColorLow: threeTunnelWallColorLowHex,
      wallColorHigh: threeTunnelWallColorHighHex,
      coreColor: threeTunnelCoreColorHex,
      tunnelSpeed: threeTunnelSpeed,
      wallSegments: threeTunnelWallSegments,
      corePulseStrength: threeTunnelCorePulseStrength,
      bloomEnabled: threeTunnelBloomEnabled,
      bloomStrength: threeTunnelBloomStrength,
      fovDeg: threeTunnelFovDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeEnergySphere) {
    return {
      coreColor: threeSphereCoreColorHex,
      haloColor: threeSphereHaloColorHex,
      deformStrength: threeSphereDeformStrength,
      noiseSpeed: threeSphereNoiseSpeed,
      haloParticleCount: threeSphereHaloParticleCount,
      wireframeOverlay: threeSphereWireframeOverlay,
      bloomEnabled: threeSphereBloomEnabled,
      bloomStrength: threeSphereBloomStrength,
      autoRotateSpeedDeg: threeSphereAutoRotateSpeedDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeKaleidoscope) {
    return {
      segments: threeKaleidoscopeSegments,
      colorLow: threeKaleidoscopeColorLowHex,
      colorHigh: threeKaleidoscopeColorHighHex,
      rotationSpeedDeg: threeKaleidoscopeRotationSpeedDeg,
      reactiveness: threeKaleidoscopeReactiveness,
      bloomEnabled: threeKaleidoscopeBloomEnabled,
      bloomStrength: threeKaleidoscopeBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeGlitchSpectrum) {
    return {
      baseColor: threeGlitchBaseColorHex,
      glitchIntensity: threeGlitchIntensity,
      rgbSplitPx: threeGlitchRgbSplitPx,
      scanlineOpacity: threeGlitchScanlineOpacity,
      triggerThreshold: threeGlitchTriggerThreshold,
      cooldownMs: threeGlitchCooldownMs,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threePhosphorTrail) {
    return {
      lineColor: threePhosphorLineColorHex,
      glowColor: threePhosphorGlowColorHex,
      lineWidthPx: threePhosphorLineWidthPx,
      decayPercent: threePhosphorDecayPercent,
      bloomEnabled: threePhosphorBloomEnabled,
      bloomStrength: threePhosphorBloomStrength,
      mirrorEnabled: threePhosphorMirrorEnabled,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeScanGrid) {
    return {
      gridColor: threeScanGridColorHex,
      highlightColor: threeScanGridHighlightColorHex,
      scanBeamColor: threeScanGridScanBeamColorHex,
      gridRows: threeScanGridRows,
      gridCols: threeScanGridCols,
      scanSpeed: threeScanGridScanSpeed,
      highlightStrength: threeScanGridHighlightStrength,
      bloomEnabled: threeScanGridBloomEnabled,
      bloomStrength: threeScanGridBloomStrength,
      cameraPitchDeg: threeScanGridCameraPitchDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeSoundField) {
    return {
      gridPreset: threeSoundFieldGridPreset,
      themeId: threeSoundFieldThemeId,
      responseStrength: threeSoundFieldResponseStrength,
      responseRange: threeSoundFieldResponseRange,
      bassRippleEnabled: threeSoundFieldBassRippleEnabled,
      bassRippleStrength: threeSoundFieldBassRippleStrength,
      bassRippleSensitivity: threeSoundFieldBassRippleSensitivity,
      meteorEnabled: threeSoundFieldMeteorEnabled,
      meteorStrength: threeSoundFieldMeteorStrength,
      meteorSensitivity: threeSoundFieldMeteorSensitivity,
      idleWaveEnabled: threeSoundFieldIdleWaveEnabled,
      idleWaveAmplitude: threeSoundFieldIdleWaveAmplitude,
      idleWaveSpeed: threeSoundFieldIdleWaveSpeed,
      bloomEnabled: threeSoundFieldBloomEnabled,
      bloomStrength: threeSoundFieldBloomStrength,
      cameraPitchDeg: threeSoundFieldCameraPitchDeg,
      cameraDistance: threeSoundFieldCameraDistance,
      autoRotateEnabled: threeSoundFieldAutoRotateEnabled,
      autoRotateSpeedDeg: threeSoundFieldAutoRotateSpeedDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeSoundField2) {
    return {
      gridPreset: threeSoundField2GridPreset,
      themeId: threeSoundField2ThemeId,
      groundEqBands: threeSoundField2GroundEqBands,
      groundEqEnabledBands: threeSoundField2GroundEqEnabledBands,
      groundEqMotionSpeed: threeSoundField2GroundEqMotionSpeed,
      groundEqAmplitude: threeSoundField2GroundEqAmplitude,
      floatingBlocksEnabled: threeSoundField2FloatingBlocksEnabled,
      floatingBlockIntensity: threeSoundField2FloatingBlockIntensity,
      floatingBlockSpeed: threeSoundField2FloatingBlockSpeed,
      floatingBlockMinSize: DEFAULT_CONFIG.threeSoundField2.floatingBlockMinSize,
      floatingBlockMaxSize: DEFAULT_CONFIG.threeSoundField2.floatingBlockMaxSize,
      floatingBlockCount: threeSoundField2FloatingBlockCount,
      coverEnabled: threeSoundField2CoverEnabled,
      coverSize: threeSoundField2CoverSize,
      coverHeight: threeSoundField2CoverHeight,
      coverOpacity: threeSoundField2CoverOpacity,
      bloomEnabled: threeSoundField2BloomEnabled,
      bloomStrength: threeSoundField2BloomStrength,
      cameraPitchDeg: threeSoundField2CameraPitchDeg,
      cameraDistance: threeSoundField2CameraDistance,
      autoRotateEnabled: threeSoundField2AutoRotateEnabled,
      autoRotateSpeedDeg: threeSoundField2AutoRotateSpeedDeg,
      pulseEnabled: threeSoundField2PulseEnabled,
      pulseSensitivity: threeSoundField2PulseSensitivity,
      pulseCooldown: DEFAULT_CONFIG.threeSoundField2.pulseCooldown,
      snareEnabled: threeSoundField2SnareEnabled,
      snareSensitivity: threeSoundField2SnareSensitivity,
      snareCooldown: DEFAULT_CONFIG.threeSoundField2.snareCooldown,
      meteorEnabled: threeSoundField2MeteorEnabled,
      meteorSensitivity: threeSoundField2MeteorSensitivity,
      meteorCooldown: DEFAULT_CONFIG.threeSoundField2.meteorCooldown,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeLiquidBlob) {
    return {
      blobColor: threeLiquidBlobColorHex,
      blobColorSecondary: threeLiquidBlobColorSecondaryHex,
      blobCount: threeLiquidBlobCount,
      mergeStrength: threeLiquidBlobMergeStrength,
      wobbleSpeed: threeLiquidBlobWobbleSpeed,
      bassDrive: threeLiquidBlobBassDrive,
      pulseOnPeak: threeLiquidBlobPulseOnPeak,
      bloomEnabled: threeLiquidBlobBloomEnabled,
      bloomStrength: threeLiquidBlobBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeAuroraRibbon) {
    return {
      colorLow: threeAuroraColorLowHex,
      colorHigh: threeAuroraColorHighHex,
      ribbonCount: threeAuroraRibbonCount,
      ribbonWidth: threeAuroraRibbonWidth,
      waveAmplitude: threeAuroraWaveAmplitude,
      waveSpeed: threeAuroraWaveSpeed,
      bassBandIndex: threeAuroraBassBandIndex,
      bloomEnabled: threeAuroraBloomEnabled,
      bloomStrength: threeAuroraBloomStrength,
      autoRotateSpeedDeg: threeAuroraAutoRotateSpeedDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeBreathingRings) {
    return {
      ringColor: threeBreathingRingColorHex,
      ringCount: threeBreathingRingCount,
      baseRadius: threeBreathingBaseRadius,
      radiusStep: threeBreathingRadiusStep,
      pulseStrength: threeBreathingPulseStrength,
      tubeRadius: threeBreathingTubeRadius,
      bloomEnabled: threeBreathingBloomEnabled,
      bloomStrength: threeBreathingBloomStrength,
      autoRotateSpeedDeg: threeBreathingAutoRotateSpeedDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeNoiseLandscape) {
    return {
      colorLow: threeNoiseColorLowHex,
      colorHigh: threeNoiseColorHighHex,
      gridSize: threeNoiseGridSize,
      heightScale: threeNoiseHeightScale,
      noiseScale: threeNoiseNoiseScale,
      scrollSpeed: threeNoiseScrollSpeed,
      wireframeOverlay: threeNoiseWireframeOverlay,
      bloomEnabled: threeNoiseBloomEnabled,
      bloomStrength: threeNoiseBloomStrength,
      cameraPitchDeg: threeNoiseCameraPitchDeg,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeLavaLamp) {
    return {
      colorWarm: threeLavaLampColorWarmHex,
      colorCool: threeLavaLampColorCoolHex,
      blobCount: threeLavaLampBlobCount,
      mergeStrength: threeLavaLampMergeStrength,
      buoyancySpeed: threeLavaLampBuoyancySpeed,
      lampAspect: DEFAULT_CONFIG.threeLavaLamp.lampAspect,
      bassDrive: threeLavaLampBassDrive,
      bloomEnabled: threeLavaLampBloomEnabled,
      bloomStrength: threeLavaLampBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeOilMarble) {
    return {
      color1: threeOilMarbleColor1Hex,
      color2: threeOilMarbleColor2Hex,
      color3: threeOilMarbleColor3Hex,
      color4: threeOilMarbleColor4Hex,
      color4Enabled: threeOilMarbleColor4Enabled,
      flowSpeed: threeOilMarbleFlowSpeed,
      noiseScale: threeOilMarbleNoiseScale,
      warpStrength: threeOilMarbleWarpStrength,
      reactiveness: threeOilMarbleReactiveness,
      bloomEnabled: threeOilMarbleBloomEnabled,
      bloomStrength: threeOilMarbleBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threePearlChain) {
    return {
      color1: threePearlChainColor1Hex,
      color2: threePearlChainColor2Hex,
      color3: threePearlChainColor3Hex,
      pearlCount: threePearlChainPearlCount,
      chainRadius: threePearlChainChainRadius,
      pearlSize: threePearlChainPearlSize,
      swaySpeed: threePearlChainSwaySpeed,
      mergeStrength: threePearlChainMergeStrength,
      bloomEnabled: threePearlChainBloomEnabled,
      bloomStrength: threePearlChainBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeCrystalGem) {
    return {
      colorCore: threeCrystalGemColorCoreHex,
      colorEdge: threeCrystalGemColorEdgeHex,
      colorHighlight: threeCrystalGemColorHighlightHex,
      gemCount: threeCrystalGemGemCount,
      facetSharpness: threeCrystalGemFacetSharpness,
      rotationSpeedDeg: threeCrystalGemRotationSpeedDeg,
      chromaticEnabled: threeCrystalGemChromaticEnabled,
      chromaticOffset: threeCrystalGemChromaticOffset,
      bloomEnabled: threeCrystalGemBloomEnabled,
      bloomStrength: threeCrystalGemBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeGlassOrbs) {
    return {
      color1: threeGlassOrbsColor1Hex,
      color2: threeGlassOrbsColor2Hex,
      color3: threeGlassOrbsColor3Hex,
      color4: threeGlassOrbsColor4Hex,
      color5: threeGlassOrbsColor5Hex,
      orbCount: threeGlassOrbsOrbCount,
      stackSpacing: threeGlassOrbsStackSpacing,
      transmission: threeGlassOrbsTransmission,
      refractionStrength: threeGlassOrbsRefractionStrength,
      breatheWithPeak: threeGlassOrbsBreatheWithPeak,
      chromaticEnabled: threeGlassOrbsChromaticEnabled,
      chromaticOffset: threeGlassOrbsChromaticOffset,
      bloomEnabled: threeGlassOrbsBloomEnabled,
      bloomStrength: threeGlassOrbsBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeHoloPrism) {
    return {
      tintLow: threeHoloPrismTintLowHex,
      tintHigh: threeHoloPrismTintHighHex,
      prismSides: threeHoloPrismSides,
      rotationSpeedDeg: threeHoloPrismRotationSpeedDeg,
      spectralStrength: threeHoloPrismSpectralStrength,
      pulseOnPeak: threeHoloPrismPulseOnPeak,
      chromaticOffset: threeHoloPrismChromaticOffset,
      bloomEnabled: threeHoloPrismBloomEnabled,
      bloomStrength: threeHoloPrismBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeNebulaVolume) {
    return {
      colorCore: threeNebulaVolumeColorCoreHex,
      colorMid: threeNebulaVolumeColorMidHex,
      colorEdge: threeNebulaVolumeColorEdgeHex,
      densityScale: threeNebulaVolumeDensityScale,
      noiseScale: threeNebulaVolumeNoiseScale,
      swirlSpeed: threeNebulaVolumeSwirlSpeed,
      marchSteps: threeNebulaVolumeMarchSteps,
      bloomEnabled: threeNebulaVolumeBloomEnabled,
      bloomStrength: threeNebulaVolumeBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeKnotOrganic) {
    return {
      color1: threeKnotOrganicColor1Hex,
      color2: threeKnotOrganicColor2Hex,
      color3: threeKnotOrganicColor3Hex,
      knotP: threeKnotOrganicKnotP,
      knotQ: threeKnotOrganicKnotQ,
      tubeRadius: threeKnotOrganicTubeRadius,
      surfaceNoise: threeKnotOrganicSurfaceNoise,
      rotationSpeedDeg: threeKnotOrganicRotationSpeedDeg,
      bloomEnabled: threeKnotOrganicBloomEnabled,
      bloomStrength: threeKnotOrganicBloomStrength,
      freqReversed,
    };
  }
  if (mode === DISPLAY_MODES.threeCoverParticle) {
    return {
      preset: threeCoverPreset,
      coverResolution: threeCoverResolution,
      intensity: threeCoverIntensity,
      depth: threeCoverDepth,
      pointScale: threeCoverPointScale,
      speed: threeCoverSpeed,
      twist: threeCoverTwist,
      scatter: threeCoverScatter,
      colorBoost: threeCoverColorBoost,
      bloomEnabled: threeCoverBloomEnabled,
      bloomStrength: threeCoverBloomStrength,
      bloomSize: threeCoverBloomSize,
      cameraDistance: threeCoverCameraDistance,
      cameraFovDeg: threeCoverCameraFovDeg,
      autoRotateEnabled: threeCoverAutoRotateEnabled,
      autoRotateSpeedDeg: threeCoverAutoRotateSpeedDeg,
      pointerInteractionEnabled: DEFAULT_CONFIG.threeCoverParticle.pointerInteractionEnabled,
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
  syncRenderBackend(displayMode);
  resizeCanvas();
  if (isThreeMode(displayMode) && renderBackend === "three") {
    renderThreeFrame();
  } else {
    renderVanillaFrame();
  }

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
    if (typeof payload.peak === "number" && Number.isFinite(payload.peak)) {
      latestPeak = payload.peak;
    }
    if (typeof payload.rms === "number" && Number.isFinite(payload.rms)) {
      latestRms = payload.rms;
    }
  });

  await listen("now-playing-update", (event) => {
    applyCoverArtState(event.payload);
    scheduleCoverArtSnapshotRefresh();
  });

  await refreshCoverArtFromSnapshot();

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
    "waveform-oblique-bar-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyObliqueBarColorNearHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-color-far",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyObliqueBarColorFarHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-width",
    (event) => {
      applyObliqueBarWidthPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-gap",
    (event) => {
      applyObliqueBarGapPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-headroom",
    (event) => {
      applyObliqueBarHeadroomPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-tilt",
    (event) => {
      applyObliqueBarTiltDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-ground-line",
    (event) => {
      applyObliqueBarShowGroundLine(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-mirror",
    (event) => {
      applyObliqueBarMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-display-count",
    (event) => {
      applyObliqueBarDisplayBarCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-oblique-bar-shape-config",
    (event) => {
      applyObliqueBarShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-count",
    (event) => {
      applyDepthLayersLayerCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-spacing",
    (event) => {
      applyDepthLayersLayerSpacingPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-far-scale",
    (event) => {
      applyDepthLayersFarScalePercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-far-alpha",
    (event) => {
      applyDepthLayersFarAlphaPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-bass-front",
    (event) => {
      applyDepthLayersBassFrontEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyDepthLayersColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-color-far",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyDepthLayersColorFarHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-line-width",
    (event) => {
      applyDepthLayersLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-render-style",
    (event) => {
      applyDepthLayersRenderStyle(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-depth-layers-shape-config",
    (event) => {
      applyDepthLayersShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-face-top-color",
    (event) => {
      const raw = event.payload;
      if (typeof raw === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) {
        applyIsometricSkylineFaceTopHex(raw);
      }
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-face-left-color",
    (event) => {
      const raw = event.payload;
      if (typeof raw === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) {
        applyIsometricSkylineFaceLeftHex(raw);
      }
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-face-right-color",
    (event) => {
      const raw = event.payload;
      if (typeof raw === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) {
        applyIsometricSkylineFaceRightHex(raw);
      }
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-building-width",
    (event) => {
      applyIsometricSkylineBuildingWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-building-gap",
    (event) => {
      applyIsometricSkylineBuildingGapPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-baseline",
    (event) => {
      applyIsometricSkylineBaselinePercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-building-count",
    (event) => {
      applyIsometricSkylineDisplayBuildingCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-ground-plane",
    (event) => {
      applyIsometricSkylineShowGroundPlane(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-isometric-skyline-shape-config",
    (event) => {
      applyIsometricSkylineShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyRing3dBarColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-inner-radius",
    (event) => {
      applyRing3dInnerRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-outer-radius",
    (event) => {
      applyRing3dOuterRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-bar-height-scale",
    (event) => {
      applyRing3dBarHeightScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-bar-thickness",
    (event) => {
      applyRing3dBarThicknessDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-display-count",
    (event) => {
      applyRing3dDisplayBarCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-wireframe",
    (event) => {
      applyRing3dWireframeEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-fill",
    (event) => {
      applyRing3dFillEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-auto-rotate",
    (event) => {
      applyRing3dAutoRotateEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-auto-rotate-speed",
    (event) => {
      applyRing3dAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-camera-distance",
    (event) => {
      applyRing3dCameraDistance(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-camera-fov",
    (event) => {
      applyRing3dCameraFovDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-breathe-peak",
    (event) => {
      applyRing3dBreatheWithPeak(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-ring3d-shape-config",
    (event) => {
      applyRing3dShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-color-low",
    (event) => {
      const raw = event.payload;
      applyTerrain3dColorLowHex(typeof raw === "string" ? raw : "");
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-color-high",
    (event) => {
      const raw = event.payload;
      applyTerrain3dColorHighHex(typeof raw === "string" ? raw : "");
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-wireframe-color",
    (event) => {
      const raw = event.payload;
      applyTerrain3dWireframeColorHex(typeof raw === "string" ? raw : "");
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-grid-cols",
    (event) => {
      applyTerrain3dGridCols(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-grid-rows",
    (event) => {
      applyTerrain3dGridRows(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-scroll-every-n-frames",
    (event) => {
      applyTerrain3dScrollEveryNFrames(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-wireframe",
    (event) => {
      applyTerrain3dWireframeEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-fill",
    (event) => {
      applyTerrain3dFillEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-height-scale",
    (event) => {
      applyTerrain3dTerrainHeightScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-camera-pitch",
    (event) => {
      applyTerrain3dCameraPitchDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-camera-distance",
    (event) => {
      applyTerrain3dCameraDistance(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-auto-scroll",
    (event) => {
      applyTerrain3dAutoScrollEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-terrain3d-shape-config",
    (event) => {
      applyTerrain3dShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyHelix3dDotColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-radius",
    (event) => {
      applyHelix3dHelixRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-pitch",
    (event) => {
      applyHelix3dHelixPitch(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-turns",
    (event) => {
      applyHelix3dHelixTurns(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-display-count",
    (event) => {
      applyHelix3dDisplayPointCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-extrude-mode",
    (event) => {
      applyHelix3dExtrudeMode(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-point-size",
    (event) => {
      applyHelix3dPointSizePx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-wireframe",
    (event) => {
      applyHelix3dWireframeEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-auto-rotate",
    (event) => {
      applyHelix3dAutoRotateEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-auto-rotate-speed",
    (event) => {
      applyHelix3dAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-camera-distance",
    (event) => {
      applyHelix3dCameraDistance(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-camera-fov",
    (event) => {
      applyHelix3dCameraFovDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-helix3d-shape-config",
    (event) => {
      applyHelix3dShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-color-low",
    (event) => {
      applyThreePlasmaColorLowHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-color-high",
    (event) => {
      applyThreePlasmaColorHighHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-speed",
    (event) => {
      applyThreePlasmaSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-noise-scale",
    (event) => {
      applyThreePlasmaNoiseScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-reactiveness",
    (event) => {
      applyThreePlasmaReactiveness(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-bloom",
    (event) => {
      applyThreePlasmaBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-bloom-strength",
    (event) => {
      applyThreePlasmaBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-plasma-shape-config",
    (event) => {
      applyThreePlasmaShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-color",
    (event) => {
      applyThreeGalaxyColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-count",
    (event) => {
      applyThreeGalaxyParticleCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-radius",
    (event) => {
      applyThreeGalaxyRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-arms",
    (event) => {
      applyThreeGalaxySpiralArms(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-bass-pull",
    (event) => {
      applyThreeGalaxyBassPullStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-treble-spread",
    (event) => {
      applyThreeGalaxyTrebleSpreadStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-bloom",
    (event) => {
      applyThreeGalaxyBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-bloom-strength",
    (event) => {
      applyThreeGalaxyBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-auto-rotate-speed",
    (event) => {
      applyThreeGalaxyAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-galaxy-shape-config",
    (event) => {
      applyThreeGalaxyShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-wall-color-low",
    (event) => {
      applyThreeTunnelWallColorLowHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-wall-color-high",
    (event) => {
      applyThreeTunnelWallColorHighHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-core-color",
    (event) => {
      applyThreeTunnelCoreColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-speed",
    (event) => {
      applyThreeTunnelSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-wall-segments",
    (event) => {
      applyThreeTunnelWallSegments(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-core-pulse-strength",
    (event) => {
      applyThreeTunnelCorePulseStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-bloom",
    (event) => {
      applyThreeTunnelBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-bloom-strength",
    (event) => {
      applyThreeTunnelBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-fov",
    (event) => {
      applyThreeTunnelFovDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-tunnel-shape-config",
    (event) => {
      applyThreeTunnelShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-core-color",
    (event) => {
      applyThreeSphereCoreColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-halo-color",
    (event) => {
      applyThreeSphereHaloColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-deform-strength",
    (event) => {
      applyThreeSphereDeformStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-noise-speed",
    (event) => {
      applyThreeSphereNoiseSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-halo-count",
    (event) => {
      applyThreeSphereHaloParticleCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-wireframe",
    (event) => {
      applyThreeSphereWireframeOverlay(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-bloom",
    (event) => {
      applyThreeSphereBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-bloom-strength",
    (event) => {
      applyThreeSphereBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-auto-rotate-speed",
    (event) => {
      applyThreeSphereAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sphere-shape-config",
    (event) => {
      applyThreeSphereShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-segments",
    (event) => {
      applyThreeKaleidoscopeSegments(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-color-low",
    (event) => {
      applyThreeKaleidoscopeColorLowHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-color-high",
    (event) => {
      applyThreeKaleidoscopeColorHighHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-rotation-speed",
    (event) => {
      applyThreeKaleidoscopeRotationSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-reactiveness",
    (event) => {
      applyThreeKaleidoscopeReactiveness(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-bloom",
    (event) => {
      applyThreeKaleidoscopeBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-bloom-strength",
    (event) => {
      applyThreeKaleidoscopeBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-kaleidoscope-shape-config",
    (event) => {
      applyThreeKaleidoscopeShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-base-color",
    (event) => {
      applyThreeGlitchBaseColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-intensity",
    (event) => {
      applyThreeGlitchIntensity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-rgb-split",
    (event) => {
      applyThreeGlitchRgbSplitPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-scanline-opacity",
    (event) => {
      applyThreeGlitchScanlineOpacity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-trigger-threshold",
    (event) => {
      applyThreeGlitchTriggerThreshold(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-cooldown-ms",
    (event) => {
      applyThreeGlitchCooldownMs(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glitch-shape-config",
    (event) => {
      applyThreeGlitchShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-line-color",
    (event) => {
      applyThreePhosphorLineColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-glow-color",
    (event) => {
      applyThreePhosphorGlowColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-line-width",
    (event) => {
      applyThreePhosphorLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-decay",
    (event) => {
      applyThreePhosphorDecayPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-bloom-enabled",
    (event) => {
      applyThreePhosphorBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-bloom-strength",
    (event) => {
      applyThreePhosphorBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-mirror-enabled",
    (event) => {
      applyThreePhosphorMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-phosphor-shape-config",
    (event) => {
      applyThreePhosphorShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-color",
    (event) => {
      applyThreeScanGridColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-highlight-color",
    (event) => {
      applyThreeScanGridHighlightColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-scan-beam-color",
    (event) => {
      applyThreeScanGridScanBeamColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-rows",
    (event) => {
      applyThreeScanGridRows(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-cols",
    (event) => {
      applyThreeScanGridCols(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-scan-speed",
    (event) => {
      applyThreeScanGridScanSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-highlight-strength",
    (event) => {
      applyThreeScanGridHighlightStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-bloom-enabled",
    (event) => {
      applyThreeScanGridBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-bloom-strength",
    (event) => {
      applyThreeScanGridBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-camera-pitch",
    (event) => {
      applyThreeScanGridCameraPitchDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-scan-grid-shape-config",
    (event) => {
      applyThreeScanGridShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-grid-preset",
    (event) => {
      applyThreeSoundFieldGridPreset(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-theme",
    (event) => {
      applyThreeSoundFieldThemeId(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-response-strength",
    (event) => {
      applyThreeSoundFieldResponseStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-response-range",
    (event) => {
      applyThreeSoundFieldResponseRange(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-bass-ripple-enabled",
    (event) => {
      applyThreeSoundFieldBassRippleEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-bass-ripple-strength",
    (event) => {
      applyThreeSoundFieldBassRippleStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-bass-ripple-sensitivity",
    (event) => {
      applyThreeSoundFieldBassRippleSensitivity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-meteor-enabled",
    (event) => {
      applyThreeSoundFieldMeteorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-meteor-strength",
    (event) => {
      applyThreeSoundFieldMeteorStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-meteor-sensitivity",
    (event) => {
      applyThreeSoundFieldMeteorSensitivity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-idle-wave-enabled",
    (event) => {
      applyThreeSoundFieldIdleWaveEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-idle-wave-amplitude",
    (event) => {
      applyThreeSoundFieldIdleWaveAmplitude(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-idle-wave-speed",
    (event) => {
      applyThreeSoundFieldIdleWaveSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-bloom-enabled",
    (event) => {
      applyThreeSoundFieldBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-bloom-strength",
    (event) => {
      applyThreeSoundFieldBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-camera-pitch",
    (event) => {
      applyThreeSoundFieldCameraPitchDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-camera-distance",
    (event) => {
      applyThreeSoundFieldCameraDistance(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-auto-rotate-enabled",
    (event) => {
      applyThreeSoundFieldAutoRotateEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-auto-rotate-speed",
    (event) => {
      applyThreeSoundFieldAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field-shape-config",
    (event) => {
      applyThreeSoundFieldShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-grid-preset",
    (event) => {
      applyThreeSoundField2GridPreset(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-theme",
    (event) => {
      applyThreeSoundField2ThemeId(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-bloom-enabled",
    (event) => {
      applyThreeSoundField2BloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-bloom-strength",
    (event) => {
      applyThreeSoundField2BloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-camera-pitch",
    (event) => {
      applyThreeSoundField2CameraPitchDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-camera-distance",
    (event) => {
      applyThreeSoundField2CameraDistance(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-auto-rotate-enabled",
    (event) => {
      applyThreeSoundField2AutoRotateEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-auto-rotate-speed",
    (event) => {
      applyThreeSoundField2AutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-shape-config",
    (event) => {
      applyThreeSoundField2ShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-pulse-enabled",
    (event) => {
      applyThreeSoundField2PulseEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-pulse-sensitivity",
    (event) => {
      applyThreeSoundField2PulseSensitivity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-snare-enabled",
    (event) => {
      applyThreeSoundField2SnareEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-snare-sensitivity",
    (event) => {
      applyThreeSoundField2SnareSensitivity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-meteor-enabled",
    (event) => {
      applyThreeSoundField2MeteorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-meteor-sensitivity",
    (event) => {
      applyThreeSoundField2MeteorSensitivity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-ground-eq-config",
    (event) => {
      applyThreeSoundField2GroundEqConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-floating-blocks-config",
    (event) => {
      applyThreeSoundField2FloatingBlocksConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-sound-field2-cover-config",
    (event) => {
      applyThreeSoundField2CoverConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-color",
    (event) => {
      applyThreeLiquidBlobColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-color-secondary",
    (event) => {
      applyThreeLiquidBlobColorSecondaryHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-count",
    (event) => {
      applyThreeLiquidBlobCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-merge-strength",
    (event) => {
      applyThreeLiquidBlobMergeStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-wobble-speed",
    (event) => {
      applyThreeLiquidBlobWobbleSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-bass-drive",
    (event) => {
      applyThreeLiquidBlobBassDrive(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-pulse-on-peak",
    (event) => {
      applyThreeLiquidBlobPulseOnPeak(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-bloom-enabled",
    (event) => {
      applyThreeLiquidBlobBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-bloom-strength",
    (event) => {
      applyThreeLiquidBlobBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-liquid-blob-shape-config",
    (event) => {
      applyThreeLiquidBlobShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-color-low",
    (event) => {
      applyThreeAuroraColorLowHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-color-high",
    (event) => {
      applyThreeAuroraColorHighHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-ribbon-count",
    (event) => {
      applyThreeAuroraRibbonCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-ribbon-width",
    (event) => {
      applyThreeAuroraRibbonWidth(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-wave-amplitude",
    (event) => {
      applyThreeAuroraWaveAmplitude(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-wave-speed",
    (event) => {
      applyThreeAuroraWaveSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-bass-band-index",
    (event) => {
      applyThreeAuroraBassBandIndex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-bloom-enabled",
    (event) => {
      applyThreeAuroraBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-bloom-strength",
    (event) => {
      applyThreeAuroraBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-auto-rotate-speed",
    (event) => {
      applyThreeAuroraAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-aurora-shape-config",
    (event) => {
      applyThreeAuroraShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-ring-color",
    (event) => {
      applyThreeBreathingRingColorHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-ring-count",
    (event) => {
      applyThreeBreathingRingCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-base-radius",
    (event) => {
      applyThreeBreathingBaseRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-radius-step",
    (event) => {
      applyThreeBreathingRadiusStep(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-pulse-strength",
    (event) => {
      applyThreeBreathingPulseStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-tube-radius",
    (event) => {
      applyThreeBreathingTubeRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-bloom-enabled",
    (event) => {
      applyThreeBreathingBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-bloom-strength",
    (event) => {
      applyThreeBreathingBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-auto-rotate-speed",
    (event) => {
      applyThreeBreathingAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-breathing-shape-config",
    (event) => {
      applyThreeBreathingRingsShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-color-low",
    (event) => {
      applyThreeNoiseColorLowHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-color-high",
    (event) => {
      applyThreeNoiseColorHighHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-grid-size",
    (event) => {
      applyThreeNoiseGridSize(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-height-scale",
    (event) => {
      applyThreeNoiseHeightScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-noise-scale",
    (event) => {
      applyThreeNoiseNoiseScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-scroll-speed",
    (event) => {
      applyThreeNoiseScrollSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-wireframe",
    (event) => {
      applyThreeNoiseWireframeOverlay(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-bloom-enabled",
    (event) => {
      applyThreeNoiseBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-bloom-strength",
    (event) => {
      applyThreeNoiseBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-camera-pitch",
    (event) => {
      applyThreeNoiseCameraPitchDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-noise-shape-config",
    (event) => {
      applyThreeNoiseLandscapeShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-color-warm",
    (event) => {
      applyThreeLavaLampColorWarmHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-color-cool",
    (event) => {
      applyThreeLavaLampColorCoolHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-blob-count",
    (event) => {
      applyThreeLavaLampBlobCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-merge-strength",
    (event) => {
      applyThreeLavaLampMergeStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-buoyancy-speed",
    (event) => {
      applyThreeLavaLampBuoyancySpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-bass-drive",
    (event) => {
      applyThreeLavaLampBassDrive(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-bloom-enabled",
    (event) => {
      applyThreeLavaLampBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-bloom-strength",
    (event) => {
      applyThreeLavaLampBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-lava-lamp-shape-config",
    (event) => {
      applyThreeLavaLampShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-color1",
    (event) => {
      applyThreeOilMarbleColor1Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-color2",
    (event) => {
      applyThreeOilMarbleColor2Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-color3",
    (event) => {
      applyThreeOilMarbleColor3Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-color4",
    (event) => {
      applyThreeOilMarbleColor4Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-color4-enabled",
    (event) => {
      applyThreeOilMarbleColor4Enabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-flow-speed",
    (event) => {
      applyThreeOilMarbleFlowSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-noise-scale",
    (event) => {
      applyThreeOilMarbleNoiseScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-warp-strength",
    (event) => {
      applyThreeOilMarbleWarpStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-reactiveness",
    (event) => {
      applyThreeOilMarbleReactiveness(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-bloom-enabled",
    (event) => {
      applyThreeOilMarbleBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-bloom-strength",
    (event) => {
      applyThreeOilMarbleBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-oil-marble-shape-config",
    (event) => {
      applyThreeOilMarbleShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-color1",
    (event) => {
      applyThreePearlChainColor1Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-color2",
    (event) => {
      applyThreePearlChainColor2Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-color3",
    (event) => {
      applyThreePearlChainColor3Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-pearl-count",
    (event) => {
      applyThreePearlChainPearlCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-chain-radius",
    (event) => {
      applyThreePearlChainChainRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-pearl-size",
    (event) => {
      applyThreePearlChainPearlSize(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-sway-speed",
    (event) => {
      applyThreePearlChainSwaySpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-merge-strength",
    (event) => {
      applyThreePearlChainMergeStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-bloom-enabled",
    (event) => {
      applyThreePearlChainBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-bloom-strength",
    (event) => {
      applyThreePearlChainBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-pearl-chain-shape-config",
    (event) => {
      applyThreePearlChainShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-color-core",
    (event) => {
      applyThreeCrystalGemColorCoreHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-color-edge",
    (event) => {
      applyThreeCrystalGemColorEdgeHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-color-highlight",
    (event) => {
      applyThreeCrystalGemColorHighlightHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-gem-count",
    (event) => {
      applyThreeCrystalGemGemCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-facet-sharpness",
    (event) => {
      applyThreeCrystalGemFacetSharpness(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-rotation-speed",
    (event) => {
      applyThreeCrystalGemRotationSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-chromatic-enabled",
    (event) => {
      applyThreeCrystalGemChromaticEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-chromatic-offset",
    (event) => {
      applyThreeCrystalGemChromaticOffset(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-bloom-enabled",
    (event) => {
      applyThreeCrystalGemBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-bloom-strength",
    (event) => {
      applyThreeCrystalGemBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-crystal-gem-shape-config",
    (event) => {
      applyThreeCrystalGemShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-color1",
    (event) => {
      applyThreeGlassOrbsColor1Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-color2",
    (event) => {
      applyThreeGlassOrbsColor2Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-color3",
    (event) => {
      applyThreeGlassOrbsColor3Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-color4",
    (event) => {
      applyThreeGlassOrbsColor4Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-color5",
    (event) => {
      applyThreeGlassOrbsColor5Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-orb-count",
    (event) => {
      applyThreeGlassOrbsOrbCount(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-stack-spacing",
    (event) => {
      applyThreeGlassOrbsStackSpacing(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-transmission",
    (event) => {
      applyThreeGlassOrbsTransmission(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-refraction-strength",
    (event) => {
      applyThreeGlassOrbsRefractionStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-breathe-with-peak",
    (event) => {
      applyThreeGlassOrbsBreatheWithPeak(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-chromatic-enabled",
    (event) => {
      applyThreeGlassOrbsChromaticEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-chromatic-offset",
    (event) => {
      applyThreeGlassOrbsChromaticOffset(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-bloom-enabled",
    (event) => {
      applyThreeGlassOrbsBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-bloom-strength",
    (event) => {
      applyThreeGlassOrbsBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-glass-orbs-shape-config",
    (event) => {
      applyThreeGlassOrbsShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-tint-low",
    (event) => {
      applyThreeHoloPrismTintLowHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-tint-high",
    (event) => {
      applyThreeHoloPrismTintHighHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-sides",
    (event) => {
      applyThreeHoloPrismSides(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-rotation-speed",
    (event) => {
      applyThreeHoloPrismRotationSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-spectral-strength",
    (event) => {
      applyThreeHoloPrismSpectralStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-pulse-on-peak",
    (event) => {
      applyThreeHoloPrismPulseOnPeak(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-chromatic-offset",
    (event) => {
      applyThreeHoloPrismChromaticOffset(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-bloom-enabled",
    (event) => {
      applyThreeHoloPrismBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-bloom-strength",
    (event) => {
      applyThreeHoloPrismBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-holo-prism-shape-config",
    (event) => {
      applyThreeHoloPrismShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-color-core",
    (event) => {
      applyThreeNebulaVolumeColorCoreHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-color-mid",
    (event) => {
      applyThreeNebulaVolumeColorMidHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-color-edge",
    (event) => {
      applyThreeNebulaVolumeColorEdgeHex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-density-scale",
    (event) => {
      applyThreeNebulaVolumeDensityScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-noise-scale",
    (event) => {
      applyThreeNebulaVolumeNoiseScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-swirl-speed",
    (event) => {
      applyThreeNebulaVolumeSwirlSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-march-steps",
    (event) => {
      applyThreeNebulaVolumeMarchSteps(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-bloom-enabled",
    (event) => {
      applyThreeNebulaVolumeBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-bloom-strength",
    (event) => {
      applyThreeNebulaVolumeBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-nebula-volume-shape-config",
    (event) => {
      applyThreeNebulaVolumeShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-color1",
    (event) => {
      applyThreeKnotOrganicColor1Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-color2",
    (event) => {
      applyThreeKnotOrganicColor2Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-color3",
    (event) => {
      applyThreeKnotOrganicColor3Hex(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-knot-p",
    (event) => {
      applyThreeKnotOrganicKnotP(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-knot-q",
    (event) => {
      applyThreeKnotOrganicKnotQ(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-tube-radius",
    (event) => {
      applyThreeKnotOrganicTubeRadius(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-surface-noise",
    (event) => {
      applyThreeKnotOrganicSurfaceNoise(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-rotation-speed",
    (event) => {
      applyThreeKnotOrganicRotationSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-bloom-enabled",
    (event) => {
      applyThreeKnotOrganicBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-bloom-strength",
    (event) => {
      applyThreeKnotOrganicBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-knot-organic-shape-config",
    (event) => {
      applyThreeKnotOrganicShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-preset",
    (event) => {
      applyThreeCoverPreset(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-resolution",
    (event) => {
      applyThreeCoverResolution(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-intensity",
    (event) => {
      applyThreeCoverIntensity(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-depth",
    (event) => {
      applyThreeCoverDepth(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-point-scale",
    (event) => {
      applyThreeCoverPointScale(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-speed",
    (event) => {
      applyThreeCoverSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-twist",
    (event) => {
      applyThreeCoverTwist(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-scatter",
    (event) => {
      applyThreeCoverScatter(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-color-boost",
    (event) => {
      applyThreeCoverColorBoost(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-bloom-enabled",
    (event) => {
      applyThreeCoverBloomEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-bloom-strength",
    (event) => {
      applyThreeCoverBloomStrength(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-bloom-size",
    (event) => {
      applyThreeCoverBloomSize(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-camera-distance",
    (event) => {
      applyThreeCoverCameraDistance(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-camera-fov",
    (event) => {
      applyThreeCoverCameraFovDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-auto-rotate-enabled",
    (event) => {
      applyThreeCoverAutoRotateEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-auto-rotate-speed",
    (event) => {
      applyThreeCoverAutoRotateSpeedDeg(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-three-cover-shape-config",
    (event) => {
      applyThreeCoverShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "visualization-display-mode",
    (event) => {
      displayMode = normalizeDisplayMode(event.payload);
      threeInitBlockedMode = null;
      syncRenderBackend(displayMode);
      syncCoverArtPollingForMode(displayMode);
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
    applyObliqueBarColorNearHex(readWindowStorageString(window.localStorage, windowLabel, "obliqueBarColor"));
    applyObliqueBarColorFarHex(readWindowStorageString(window.localStorage, windowLabel, "obliqueBarColorFar"));
    const savedObliqueBarWidth = readWindowStorageString(window.localStorage, windowLabel, "obliqueBarWidth");
    if (savedObliqueBarWidth) {
      applyObliqueBarWidthPercent(savedObliqueBarWidth);
    }
    const savedObliqueBarGap = readWindowStorageString(window.localStorage, windowLabel, "obliqueBarGap");
    if (savedObliqueBarGap) {
      applyObliqueBarGapPercent(savedObliqueBarGap);
    }
    const savedObliqueBarHeadroom = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "obliqueBarHeadroom",
    );
    if (savedObliqueBarHeadroom) {
      applyObliqueBarHeadroomPercent(savedObliqueBarHeadroom);
    }
    const savedObliqueBarTilt = readWindowStorageString(window.localStorage, windowLabel, "obliqueBarTilt");
    if (savedObliqueBarTilt != null && savedObliqueBarTilt !== "") {
      applyObliqueBarTiltDeg(savedObliqueBarTilt);
    }
    applyObliqueBarShowGroundLine(
      readWindowStorageString(window.localStorage, windowLabel, "obliqueBarGroundLine"),
    );
    applyObliqueBarMirrorEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "obliqueBarMirror"),
    );
    const savedObliqueBarDisplayCount = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "obliqueBarDisplayCount",
    );
    if (savedObliqueBarDisplayCount != null && savedObliqueBarDisplayCount !== "") {
      applyObliqueBarDisplayBarCount(savedObliqueBarDisplayCount);
    }
    applyDepthLayersColorHex(readWindowStorageString(window.localStorage, windowLabel, "depthLayersColor"));
    applyDepthLayersColorFarHex(readWindowStorageString(window.localStorage, windowLabel, "depthLayersColorFar"));
    const savedDepthLayersCount = readWindowStorageString(window.localStorage, windowLabel, "depthLayersCount");
    if (savedDepthLayersCount != null && savedDepthLayersCount !== "") {
      applyDepthLayersLayerCount(savedDepthLayersCount);
    }
    const savedDepthLayersSpacing = readWindowStorageString(window.localStorage, windowLabel, "depthLayersSpacing");
    if (savedDepthLayersSpacing != null && savedDepthLayersSpacing !== "") {
      applyDepthLayersLayerSpacingPx(savedDepthLayersSpacing);
    }
    const savedDepthLayersFarScale = readWindowStorageString(window.localStorage, windowLabel, "depthLayersFarScale");
    if (savedDepthLayersFarScale != null && savedDepthLayersFarScale !== "") {
      applyDepthLayersFarScalePercent(savedDepthLayersFarScale);
    }
    const savedDepthLayersFarAlpha = readWindowStorageString(window.localStorage, windowLabel, "depthLayersFarAlpha");
    if (savedDepthLayersFarAlpha != null && savedDepthLayersFarAlpha !== "") {
      applyDepthLayersFarAlphaPercent(savedDepthLayersFarAlpha);
    }
    applyDepthLayersBassFrontEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "depthLayersBassFront"),
    );
    const savedDepthLayersLineWidth = readWindowStorageString(window.localStorage, windowLabel, "depthLayersLineWidth");
    if (savedDepthLayersLineWidth != null && savedDepthLayersLineWidth !== "") {
      applyDepthLayersLineWidthPx(savedDepthLayersLineWidth);
    }
    applyDepthLayersRenderStyle(
      readWindowStorageString(window.localStorage, windowLabel, "depthLayersRenderStyle"),
    );
    applyIsometricSkylineFaceTopHex(
      readWindowStorageString(window.localStorage, windowLabel, "isometricSkylineFaceTop"),
    );
    applyIsometricSkylineFaceLeftHex(
      readWindowStorageString(window.localStorage, windowLabel, "isometricSkylineFaceLeft"),
    );
    applyIsometricSkylineFaceRightHex(
      readWindowStorageString(window.localStorage, windowLabel, "isometricSkylineFaceRight"),
    );
    const savedIsoBuildingWidth = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "isometricSkylineBuildingWidth",
    );
    if (savedIsoBuildingWidth != null && savedIsoBuildingWidth !== "") {
      applyIsometricSkylineBuildingWidthPx(savedIsoBuildingWidth);
    }
    const savedIsoBuildingGap = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "isometricSkylineBuildingGap",
    );
    if (savedIsoBuildingGap != null && savedIsoBuildingGap !== "") {
      applyIsometricSkylineBuildingGapPx(savedIsoBuildingGap);
    }
    const savedIsoBaseline = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "isometricSkylineBaseline",
    );
    if (savedIsoBaseline != null && savedIsoBaseline !== "") {
      applyIsometricSkylineBaselinePercent(savedIsoBaseline);
    }
    const savedIsoBuildingCount = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "isometricSkylineBuildingCount",
    );
    if (savedIsoBuildingCount != null && savedIsoBuildingCount !== "") {
      applyIsometricSkylineDisplayBuildingCount(savedIsoBuildingCount);
    }
    applyIsometricSkylineShowGroundPlane(
      readWindowStorageString(window.localStorage, windowLabel, "isometricSkylineGroundPlane"),
    );
    applyRing3dBarColorHex(readWindowStorageString(window.localStorage, windowLabel, "ring3dColor"));
    const savedRing3dInner = readWindowStorageString(window.localStorage, windowLabel, "ring3dInnerRadius");
    if (savedRing3dInner != null && savedRing3dInner !== "") {
      applyRing3dInnerRadius(savedRing3dInner);
    }
    const savedRing3dOuter = readWindowStorageString(window.localStorage, windowLabel, "ring3dOuterRadius");
    if (savedRing3dOuter != null && savedRing3dOuter !== "") {
      applyRing3dOuterRadius(savedRing3dOuter);
    }
    const savedRing3dHeight = readWindowStorageString(window.localStorage, windowLabel, "ring3dBarHeightScale");
    if (savedRing3dHeight != null && savedRing3dHeight !== "") {
      applyRing3dBarHeightScale(savedRing3dHeight);
    }
    const savedRing3dThickness = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "ring3dBarThicknessDeg",
    );
    if (savedRing3dThickness != null && savedRing3dThickness !== "") {
      applyRing3dBarThicknessDeg(savedRing3dThickness);
    }
    const savedRing3dCount = readWindowStorageString(window.localStorage, windowLabel, "ring3dDisplayCount");
    if (savedRing3dCount != null && savedRing3dCount !== "") {
      applyRing3dDisplayBarCount(savedRing3dCount);
    }
    applyRing3dWireframeEnabled(readWindowStorageString(window.localStorage, windowLabel, "ring3dWireframe"));
    applyRing3dFillEnabled(readWindowStorageString(window.localStorage, windowLabel, "ring3dFill"));
    applyRing3dAutoRotateEnabled(readWindowStorageString(window.localStorage, windowLabel, "ring3dAutoRotate"));
    const savedRing3dRotateSpeed = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "ring3dAutoRotateSpeed",
    );
    if (savedRing3dRotateSpeed != null && savedRing3dRotateSpeed !== "") {
      applyRing3dAutoRotateSpeedDeg(savedRing3dRotateSpeed);
    }
    const savedRing3dCameraDistance = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "ring3dCameraDistance",
    );
    if (savedRing3dCameraDistance != null && savedRing3dCameraDistance !== "") {
      applyRing3dCameraDistance(savedRing3dCameraDistance);
    }
    const savedRing3dCameraFov = readWindowStorageString(window.localStorage, windowLabel, "ring3dCameraFov");
    if (savedRing3dCameraFov != null && savedRing3dCameraFov !== "") {
      applyRing3dCameraFovDeg(savedRing3dCameraFov);
    }
    applyRing3dBreatheWithPeak(readWindowStorageString(window.localStorage, windowLabel, "ring3dBreathePeak"));
    applyTerrain3dColorLowHex(readWindowStorageString(window.localStorage, windowLabel, "terrain3dColorLow"));
    applyTerrain3dColorHighHex(readWindowStorageString(window.localStorage, windowLabel, "terrain3dColorHigh"));
    applyTerrain3dWireframeColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "terrain3dWireframeColor"),
    );
    const savedTerrain3dCols = readWindowStorageString(window.localStorage, windowLabel, "terrain3dGridCols");
    if (savedTerrain3dCols != null && savedTerrain3dCols !== "") {
      applyTerrain3dGridCols(savedTerrain3dCols);
    }
    const savedTerrain3dRows = readWindowStorageString(window.localStorage, windowLabel, "terrain3dGridRows");
    if (savedTerrain3dRows != null && savedTerrain3dRows !== "") {
      applyTerrain3dGridRows(savedTerrain3dRows);
    }
    const savedTerrain3dScroll = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "terrain3dScrollEveryNFrames",
    );
    if (savedTerrain3dScroll != null && savedTerrain3dScroll !== "") {
      applyTerrain3dScrollEveryNFrames(savedTerrain3dScroll);
    }
    applyTerrain3dWireframeEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "terrain3dWireframe"),
    );
    applyTerrain3dFillEnabled(readWindowStorageString(window.localStorage, windowLabel, "terrain3dFill"));
    const savedTerrain3dHeight = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "terrain3dHeightScale",
    );
    if (savedTerrain3dHeight != null && savedTerrain3dHeight !== "") {
      applyTerrain3dTerrainHeightScale(savedTerrain3dHeight);
    }
    const savedTerrain3dPitch = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "terrain3dCameraPitch",
    );
    if (savedTerrain3dPitch != null && savedTerrain3dPitch !== "") {
      applyTerrain3dCameraPitchDeg(savedTerrain3dPitch);
    }
    const savedTerrain3dCameraDistance = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "terrain3dCameraDistance",
    );
    if (savedTerrain3dCameraDistance != null && savedTerrain3dCameraDistance !== "") {
      applyTerrain3dCameraDistance(savedTerrain3dCameraDistance);
    }
    applyTerrain3dAutoScrollEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "terrain3dAutoScroll"),
    );
    applyHelix3dDotColorHex(readWindowStorageString(window.localStorage, windowLabel, "helix3dColor"));
    const savedHelix3dRadius = readWindowStorageString(window.localStorage, windowLabel, "helix3dRadius");
    if (savedHelix3dRadius != null && savedHelix3dRadius !== "") {
      applyHelix3dHelixRadius(savedHelix3dRadius);
    }
    const savedHelix3dPitch = readWindowStorageString(window.localStorage, windowLabel, "helix3dPitch");
    if (savedHelix3dPitch != null && savedHelix3dPitch !== "") {
      applyHelix3dHelixPitch(savedHelix3dPitch);
    }
    const savedHelix3dTurns = readWindowStorageString(window.localStorage, windowLabel, "helix3dTurns");
    if (savedHelix3dTurns != null && savedHelix3dTurns !== "") {
      applyHelix3dHelixTurns(savedHelix3dTurns);
    }
    const savedHelix3dCount = readWindowStorageString(window.localStorage, windowLabel, "helix3dDisplayCount");
    if (savedHelix3dCount != null && savedHelix3dCount !== "") {
      applyHelix3dDisplayPointCount(savedHelix3dCount);
    }
    applyHelix3dExtrudeMode(readWindowStorageString(window.localStorage, windowLabel, "helix3dExtrudeMode"));
    const savedHelix3dPointSize = readWindowStorageString(window.localStorage, windowLabel, "helix3dPointSize");
    if (savedHelix3dPointSize != null && savedHelix3dPointSize !== "") {
      applyHelix3dPointSizePx(savedHelix3dPointSize);
    }
    applyHelix3dWireframeEnabled(readWindowStorageString(window.localStorage, windowLabel, "helix3dWireframe"));
    applyHelix3dAutoRotateEnabled(readWindowStorageString(window.localStorage, windowLabel, "helix3dAutoRotate"));
    const savedHelix3dRotateSpeed = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "helix3dAutoRotateSpeed",
    );
    if (savedHelix3dRotateSpeed != null && savedHelix3dRotateSpeed !== "") {
      applyHelix3dAutoRotateSpeedDeg(savedHelix3dRotateSpeed);
    }
    const savedHelix3dCameraDistance = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "helix3dCameraDistance",
    );
    if (savedHelix3dCameraDistance != null && savedHelix3dCameraDistance !== "") {
      applyHelix3dCameraDistance(savedHelix3dCameraDistance);
    }
    const savedHelix3dCameraFov = readWindowStorageString(window.localStorage, windowLabel, "helix3dCameraFov");
    if (savedHelix3dCameraFov != null && savedHelix3dCameraFov !== "") {
      applyHelix3dCameraFovDeg(savedHelix3dCameraFov);
    }
    applyThreePlasmaColorLowHex(
      readWindowStorageString(window.localStorage, windowLabel, "threePlasmaColorLow") ??
        DEFAULT_CONFIG.threePlasmaField.colorLow,
    );
    applyThreePlasmaColorHighHex(
      readWindowStorageString(window.localStorage, windowLabel, "threePlasmaColorHigh") ??
        DEFAULT_CONFIG.threePlasmaField.colorHigh,
    );
    const savedPlasmaSpeed = readWindowStorageString(window.localStorage, windowLabel, "threePlasmaSpeed");
    if (savedPlasmaSpeed != null && savedPlasmaSpeed !== "") {
      applyThreePlasmaSpeed(savedPlasmaSpeed);
    }
    const savedPlasmaNoise = readWindowStorageString(window.localStorage, windowLabel, "threePlasmaNoiseScale");
    if (savedPlasmaNoise != null && savedPlasmaNoise !== "") {
      applyThreePlasmaNoiseScale(savedPlasmaNoise);
    }
    const savedPlasmaReact = readWindowStorageString(window.localStorage, windowLabel, "threePlasmaReactiveness");
    if (savedPlasmaReact != null && savedPlasmaReact !== "") {
      applyThreePlasmaReactiveness(savedPlasmaReact);
    }
    applyThreePlasmaBloomEnabled(readWindowStorageString(window.localStorage, windowLabel, "threePlasmaBloom"));
    const savedPlasmaBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threePlasmaBloomStrength",
    );
    if (savedPlasmaBloomStrength != null && savedPlasmaBloomStrength !== "") {
      applyThreePlasmaBloomStrength(savedPlasmaBloomStrength);
    }
    applyThreeGalaxyColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyColor") ??
        DEFAULT_CONFIG.threeParticleGalaxy.particleColor,
    );
    const savedGalaxyCount = readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyCount");
    if (savedGalaxyCount != null && savedGalaxyCount !== "") {
      applyThreeGalaxyParticleCount(savedGalaxyCount);
    }
    const savedGalaxyRadius = readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyRadius");
    if (savedGalaxyRadius != null && savedGalaxyRadius !== "") {
      applyThreeGalaxyRadius(savedGalaxyRadius);
    }
    const savedGalaxyArms = readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyArms");
    if (savedGalaxyArms != null && savedGalaxyArms !== "") {
      applyThreeGalaxySpiralArms(savedGalaxyArms);
    }
    const savedGalaxyBassPull = readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyBassPull");
    if (savedGalaxyBassPull != null && savedGalaxyBassPull !== "") {
      applyThreeGalaxyBassPullStrength(savedGalaxyBassPull);
    }
    const savedGalaxyTrebleSpread = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeGalaxyTrebleSpread",
    );
    if (savedGalaxyTrebleSpread != null && savedGalaxyTrebleSpread !== "") {
      applyThreeGalaxyTrebleSpreadStrength(savedGalaxyTrebleSpread);
    }
    applyThreeGalaxyBloomEnabled(readWindowStorageString(window.localStorage, windowLabel, "threeGalaxyBloom"));
    const savedGalaxyBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeGalaxyBloomStrength",
    );
    if (savedGalaxyBloomStrength != null && savedGalaxyBloomStrength !== "") {
      applyThreeGalaxyBloomStrength(savedGalaxyBloomStrength);
    }
    const savedGalaxyAutoRotate = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeGalaxyAutoRotateSpeed",
    );
    if (savedGalaxyAutoRotate != null && savedGalaxyAutoRotate !== "") {
      applyThreeGalaxyAutoRotateSpeedDeg(savedGalaxyAutoRotate);
    }
    applyThreeTunnelWallColorLowHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeTunnelWallColorLow") ??
        DEFAULT_CONFIG.threeBloomTunnel.wallColorLow,
    );
    applyThreeTunnelWallColorHighHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeTunnelWallColorHigh") ??
        DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh,
    );
    applyThreeTunnelCoreColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeTunnelCoreColor") ??
        DEFAULT_CONFIG.threeBloomTunnel.coreColor,
    );
    const savedTunnelSpeed = readWindowStorageString(window.localStorage, windowLabel, "threeTunnelSpeed");
    if (savedTunnelSpeed != null && savedTunnelSpeed !== "") {
      applyThreeTunnelSpeed(savedTunnelSpeed);
    }
    const savedTunnelSegments = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeTunnelWallSegments",
    );
    if (savedTunnelSegments != null && savedTunnelSegments !== "") {
      applyThreeTunnelWallSegments(savedTunnelSegments);
    }
    const savedTunnelCorePulse = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeTunnelCorePulseStrength",
    );
    if (savedTunnelCorePulse != null && savedTunnelCorePulse !== "") {
      applyThreeTunnelCorePulseStrength(savedTunnelCorePulse);
    }
    applyThreeTunnelBloomEnabled(readWindowStorageString(window.localStorage, windowLabel, "threeTunnelBloom"));
    const savedTunnelBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeTunnelBloomStrength",
    );
    if (savedTunnelBloomStrength != null && savedTunnelBloomStrength !== "") {
      applyThreeTunnelBloomStrength(savedTunnelBloomStrength);
    }
    const savedTunnelFov = readWindowStorageString(window.localStorage, windowLabel, "threeTunnelFov");
    if (savedTunnelFov != null && savedTunnelFov !== "") {
      applyThreeTunnelFovDeg(savedTunnelFov);
    }
    applyThreeSphereCoreColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeSphereCoreColor") ??
        DEFAULT_CONFIG.threeEnergySphere.coreColor,
    );
    applyThreeSphereHaloColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeSphereHaloColor") ??
        DEFAULT_CONFIG.threeEnergySphere.haloColor,
    );
    const savedSphereDeform = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSphereDeformStrength",
    );
    if (savedSphereDeform != null && savedSphereDeform !== "") {
      applyThreeSphereDeformStrength(savedSphereDeform);
    }
    const savedSphereNoiseSpeed = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSphereNoiseSpeed",
    );
    if (savedSphereNoiseSpeed != null && savedSphereNoiseSpeed !== "") {
      applyThreeSphereNoiseSpeed(savedSphereNoiseSpeed);
    }
    const savedSphereHaloCount = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSphereHaloCount",
    );
    if (savedSphereHaloCount != null && savedSphereHaloCount !== "") {
      applyThreeSphereHaloParticleCount(savedSphereHaloCount);
    }
    applyThreeSphereWireframeOverlay(
      readWindowStorageString(window.localStorage, windowLabel, "threeSphereWireframe"),
    );
    applyThreeSphereBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSphereBloom"),
    );
    const savedSphereBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSphereBloomStrength",
    );
    if (savedSphereBloomStrength != null && savedSphereBloomStrength !== "") {
      applyThreeSphereBloomStrength(savedSphereBloomStrength);
    }
    const savedSphereAutoRotate = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSphereAutoRotateSpeed",
    );
    if (savedSphereAutoRotate != null && savedSphereAutoRotate !== "") {
      applyThreeSphereAutoRotateSpeedDeg(savedSphereAutoRotate);
    }
    applyThreeKaleidoscopeSegments(
      readWindowStorageString(window.localStorage, windowLabel, "threeKaleidoscopeSegments") ??
        DEFAULT_CONFIG.threeKaleidoscope.segments,
    );
    applyThreeKaleidoscopeColorLowHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeKaleidoscopeColorLow") ??
        DEFAULT_CONFIG.threeKaleidoscope.colorLow,
    );
    applyThreeKaleidoscopeColorHighHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeKaleidoscopeColorHigh") ??
        DEFAULT_CONFIG.threeKaleidoscope.colorHigh,
    );
    const savedKaleidoscopeRotation = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeKaleidoscopeRotationSpeed",
    );
    if (savedKaleidoscopeRotation != null && savedKaleidoscopeRotation !== "") {
      applyThreeKaleidoscopeRotationSpeedDeg(savedKaleidoscopeRotation);
    }
    const savedKaleidoscopeReact = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeKaleidoscopeReactiveness",
    );
    if (savedKaleidoscopeReact != null && savedKaleidoscopeReact !== "") {
      applyThreeKaleidoscopeReactiveness(savedKaleidoscopeReact);
    }
    applyThreeKaleidoscopeBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeKaleidoscopeBloom"),
    );
    const savedKaleidoscopeBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeKaleidoscopeBloomStrength",
    );
    if (savedKaleidoscopeBloomStrength != null && savedKaleidoscopeBloomStrength !== "") {
      applyThreeKaleidoscopeBloomStrength(savedKaleidoscopeBloomStrength);
    }
    applyThreeGlitchBaseColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlitchBaseColor") ??
        DEFAULT_CONFIG.threeGlitchSpectrum.baseColor,
    );
    applyThreeGlitchIntensity(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlitchIntensity") ??
        DEFAULT_CONFIG.threeGlitchSpectrum.glitchIntensity,
    );
    applyThreeGlitchRgbSplitPx(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlitchRgbSplit") ??
        DEFAULT_CONFIG.threeGlitchSpectrum.rgbSplitPx,
    );
    applyThreeGlitchScanlineOpacity(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlitchScanlineOpacity") ??
        DEFAULT_CONFIG.threeGlitchSpectrum.scanlineOpacity,
    );
    applyThreeGlitchTriggerThreshold(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlitchTriggerThreshold") ??
        DEFAULT_CONFIG.threeGlitchSpectrum.triggerThreshold,
    );
    applyThreeGlitchCooldownMs(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlitchCooldownMs") ??
        DEFAULT_CONFIG.threeGlitchSpectrum.cooldownMs,
    );
    applyThreePhosphorLineColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threePhosphorLineColor") ??
        DEFAULT_CONFIG.threePhosphorTrail.lineColor,
    );
    applyThreePhosphorGlowColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threePhosphorGlowColor") ??
        DEFAULT_CONFIG.threePhosphorTrail.glowColor,
    );
    applyThreePhosphorLineWidthPx(
      readWindowStorageString(window.localStorage, windowLabel, "threePhosphorLineWidth") ??
        DEFAULT_CONFIG.threePhosphorTrail.lineWidthPx,
    );
    applyThreePhosphorDecayPercent(
      readWindowStorageString(window.localStorage, windowLabel, "threePhosphorDecay") ??
        DEFAULT_CONFIG.threePhosphorTrail.decayPercent,
    );
    applyThreePhosphorBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threePhosphorBloom"),
    );
    const savedPhosphorBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threePhosphorBloomStrength",
    );
    if (savedPhosphorBloomStrength != null && savedPhosphorBloomStrength !== "") {
      applyThreePhosphorBloomStrength(savedPhosphorBloomStrength);
    }
    applyThreePhosphorMirrorEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threePhosphorMirror"),
    );
    applyThreeScanGridColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridColor") ??
        DEFAULT_CONFIG.threeScanGrid.gridColor,
    );
    applyThreeScanGridHighlightColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridHighlightColor") ??
        DEFAULT_CONFIG.threeScanGrid.highlightColor,
    );
    applyThreeScanGridScanBeamColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridScanBeamColor") ??
        DEFAULT_CONFIG.threeScanGrid.scanBeamColor,
    );
    applyThreeScanGridRows(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridRows") ??
        DEFAULT_CONFIG.threeScanGrid.gridRows,
    );
    applyThreeScanGridCols(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridCols") ??
        DEFAULT_CONFIG.threeScanGrid.gridCols,
    );
    applyThreeScanGridScanSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridScanSpeed") ??
        DEFAULT_CONFIG.threeScanGrid.scanSpeed,
    );
    applyThreeScanGridHighlightStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridHighlightStrength") ??
        DEFAULT_CONFIG.threeScanGrid.highlightStrength,
    );
    applyThreeScanGridBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridBloom"),
    );
    const savedScanGridBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeScanGridBloomStrength",
    );
    if (savedScanGridBloomStrength != null && savedScanGridBloomStrength !== "") {
      applyThreeScanGridBloomStrength(savedScanGridBloomStrength);
    }
    applyThreeScanGridCameraPitchDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeScanGridCameraPitch") ??
        DEFAULT_CONFIG.threeScanGrid.cameraPitchDeg,
    );
    applyThreeSoundFieldGridPreset(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldGridPreset") ??
        DEFAULT_CONFIG.threeSoundField.gridPreset,
    );
    applyThreeSoundFieldThemeId(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldTheme") ??
        DEFAULT_CONFIG.threeSoundField.themeId,
    );
    applyThreeSoundFieldResponseStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldResponseStrength") ??
        DEFAULT_CONFIG.threeSoundField.responseStrength,
    );
    applyThreeSoundFieldResponseRange(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldResponseRange") ??
        DEFAULT_CONFIG.threeSoundField.responseRange,
    );
    applyThreeSoundFieldBassRippleEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldBassRipple"),
    );
    applyThreeSoundFieldBassRippleStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldBassRippleStrength") ??
        DEFAULT_CONFIG.threeSoundField.bassRippleStrength,
    );
    applyThreeSoundFieldBassRippleSensitivity(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldBassRippleSensitivity") ??
        DEFAULT_CONFIG.threeSoundField.bassRippleSensitivity,
    );
    applyThreeSoundFieldMeteorEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldMeteor"),
    );
    applyThreeSoundFieldMeteorStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldMeteorStrength") ??
        DEFAULT_CONFIG.threeSoundField.meteorStrength,
    );
    applyThreeSoundFieldMeteorSensitivity(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldMeteorSensitivity") ??
        DEFAULT_CONFIG.threeSoundField.meteorSensitivity,
    );
    applyThreeSoundFieldIdleWaveEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldIdleWave"),
    );
    applyThreeSoundFieldIdleWaveAmplitude(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldIdleWaveAmplitude") ??
        DEFAULT_CONFIG.threeSoundField.idleWaveAmplitude,
    );
    applyThreeSoundFieldIdleWaveSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldIdleWaveSpeed") ??
        DEFAULT_CONFIG.threeSoundField.idleWaveSpeed,
    );
    applyThreeSoundFieldBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldBloom"),
    );
    const savedSoundFieldBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSoundFieldBloomStrength",
    );
    if (savedSoundFieldBloomStrength != null && savedSoundFieldBloomStrength !== "") {
      applyThreeSoundFieldBloomStrength(savedSoundFieldBloomStrength);
    }
    applyThreeSoundFieldCameraPitchDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldCameraPitch") ??
        DEFAULT_CONFIG.threeSoundField.cameraPitchDeg,
    );
    applyThreeSoundFieldCameraDistance(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldCameraDistance") ??
        DEFAULT_CONFIG.threeSoundField.cameraDistance,
    );
    applyThreeSoundFieldAutoRotateEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldAutoRotate"),
    );
    applyThreeSoundFieldAutoRotateSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundFieldAutoRotateSpeed") ??
        DEFAULT_CONFIG.threeSoundField.autoRotateSpeedDeg,
    );
    applyThreeSoundField2GridPreset(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2GridPreset") ??
        DEFAULT_CONFIG.threeSoundField2.gridPreset,
    );
    applyThreeSoundField2ThemeId(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2Theme") ??
        DEFAULT_CONFIG.threeSoundField2.themeId,
    );
    applyThreeSoundField2BloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2Bloom"),
    );
    const savedSoundField2BloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeSoundField2BloomStrength",
    );
    if (savedSoundField2BloomStrength != null && savedSoundField2BloomStrength !== "") {
      applyThreeSoundField2BloomStrength(savedSoundField2BloomStrength);
    }
    applyThreeSoundField2CameraPitchDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2CameraPitch") ??
        DEFAULT_CONFIG.threeSoundField2.cameraPitchDeg,
    );
    applyThreeSoundField2CameraDistance(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2CameraDistance") ??
        DEFAULT_CONFIG.threeSoundField2.cameraDistance,
    );
    applyThreeSoundField2AutoRotateEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2AutoRotate"),
    );
    applyThreeSoundField2AutoRotateSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2AutoRotateSpeed") ??
        DEFAULT_CONFIG.threeSoundField2.autoRotateSpeedDeg,
    );
    applyThreeSoundField2PulseEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2PulseEnabled"),
    );
    applyThreeSoundField2PulseSensitivity(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2PulseSensitivity") ??
        DEFAULT_CONFIG.threeSoundField2.pulseSensitivity,
    );
    applyThreeSoundField2SnareEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2SnareEnabled"),
    );
    applyThreeSoundField2SnareSensitivity(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2SnareSensitivity") ??
        DEFAULT_CONFIG.threeSoundField2.snareSensitivity,
    );
    applyThreeSoundField2MeteorEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2MeteorEnabled"),
    );
    applyThreeSoundField2MeteorSensitivity(
      readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2MeteorSensitivity") ??
        DEFAULT_CONFIG.threeSoundField2.meteorSensitivity,
    );
    try {
      const eqBandsRaw = readWindowStorageString(
        window.localStorage,
        windowLabel,
        "threeSoundField2GroundEqBands",
      );
      const eqEnabledRaw = readWindowStorageString(
        window.localStorage,
        windowLabel,
        "threeSoundField2GroundEqEnabledBands",
      );
      applyThreeSoundField2GroundEqConfig({
        groundEqBands: eqBandsRaw ? JSON.parse(eqBandsRaw) : undefined,
        groundEqEnabledBands: eqEnabledRaw ? JSON.parse(eqEnabledRaw) : undefined,
        groundEqMotionSpeed:
          readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2GroundEqMotionSpeed") ??
          DEFAULT_CONFIG.threeSoundField2.groundEqMotionSpeed,
        groundEqAmplitude:
          readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2GroundEqAmplitude") ??
          DEFAULT_CONFIG.threeSoundField2.groundEqAmplitude,
      });
    } catch {
      // ignore invalid EQ storage
    }
    applyThreeSoundField2FloatingBlocksConfig({
      floatingBlocksEnabled: readWindowStorageString(
        window.localStorage,
        windowLabel,
        "threeSoundField2FloatingBlocks",
      ),
      floatingBlockIntensity:
        readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2FloatingBlockIntensity") ??
        DEFAULT_CONFIG.threeSoundField2.floatingBlockIntensity,
      floatingBlockSpeed:
        readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2FloatingBlockSpeed") ??
        DEFAULT_CONFIG.threeSoundField2.floatingBlockSpeed,
      floatingBlockCount:
        readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2FloatingBlockCount") ??
        DEFAULT_CONFIG.threeSoundField2.floatingBlockCount,
    });
    applyThreeSoundField2CoverConfig({
      coverEnabled: readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2Cover"),
      coverSize:
        readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2CoverSize") ??
        DEFAULT_CONFIG.threeSoundField2.coverSize,
      coverHeight:
        readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2CoverHeight") ??
        DEFAULT_CONFIG.threeSoundField2.coverHeight,
      coverOpacity:
        readWindowStorageString(window.localStorage, windowLabel, "threeSoundField2CoverOpacity") ??
        DEFAULT_CONFIG.threeSoundField2.coverOpacity,
    });
    applyThreeLiquidBlobColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobColor") ??
        DEFAULT_CONFIG.threeLiquidBlob.blobColor,
    );
    applyThreeLiquidBlobColorSecondaryHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobColorSecondary") ??
        DEFAULT_CONFIG.threeLiquidBlob.blobColorSecondary,
    );
    applyThreeLiquidBlobCount(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobCount") ??
        DEFAULT_CONFIG.threeLiquidBlob.blobCount,
    );
    applyThreeLiquidBlobMergeStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobMergeStrength") ??
        DEFAULT_CONFIG.threeLiquidBlob.mergeStrength,
    );
    applyThreeLiquidBlobWobbleSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobWobbleSpeed") ??
        DEFAULT_CONFIG.threeLiquidBlob.wobbleSpeed,
    );
    applyThreeLiquidBlobBassDrive(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobBassDrive") ??
        DEFAULT_CONFIG.threeLiquidBlob.bassDrive,
    );
    applyThreeLiquidBlobPulseOnPeak(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobPulseOnPeak"),
    );
    applyThreeLiquidBlobBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeLiquidBlobBloom"),
    );
    const savedLiquidBlobBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeLiquidBlobBloomStrength",
    );
    if (savedLiquidBlobBloomStrength != null && savedLiquidBlobBloomStrength !== "") {
      applyThreeLiquidBlobBloomStrength(savedLiquidBlobBloomStrength);
    }
    applyThreeAuroraColorLowHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraColorLow") ??
        DEFAULT_CONFIG.threeAuroraRibbon.colorLow,
    );
    applyThreeAuroraColorHighHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraColorHigh") ??
        DEFAULT_CONFIG.threeAuroraRibbon.colorHigh,
    );
    applyThreeAuroraRibbonCount(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraRibbonCount") ??
        DEFAULT_CONFIG.threeAuroraRibbon.ribbonCount,
    );
    applyThreeAuroraRibbonWidth(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraRibbonWidth") ??
        DEFAULT_CONFIG.threeAuroraRibbon.ribbonWidth,
    );
    applyThreeAuroraWaveAmplitude(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraWaveAmplitude") ??
        DEFAULT_CONFIG.threeAuroraRibbon.waveAmplitude,
    );
    applyThreeAuroraWaveSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraWaveSpeed") ??
        DEFAULT_CONFIG.threeAuroraRibbon.waveSpeed,
    );
    applyThreeAuroraBassBandIndex(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraBassBandIndex") ??
        DEFAULT_CONFIG.threeAuroraRibbon.bassBandIndex,
    );
    applyThreeAuroraBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraBloom"),
    );
    const savedAuroraBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeAuroraBloomStrength",
    );
    if (savedAuroraBloomStrength != null && savedAuroraBloomStrength !== "") {
      applyThreeAuroraBloomStrength(savedAuroraBloomStrength);
    }
    applyThreeAuroraAutoRotateSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeAuroraAutoRotateSpeed") ??
        DEFAULT_CONFIG.threeAuroraRibbon.autoRotateSpeedDeg,
    );
    applyThreeBreathingRingColorHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingRingColor") ??
        DEFAULT_CONFIG.threeBreathingRings.ringColor,
    );
    applyThreeBreathingRingCount(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingRingCount") ??
        DEFAULT_CONFIG.threeBreathingRings.ringCount,
    );
    applyThreeBreathingBaseRadius(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingBaseRadius") ??
        DEFAULT_CONFIG.threeBreathingRings.baseRadius,
    );
    applyThreeBreathingRadiusStep(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingRadiusStep") ??
        DEFAULT_CONFIG.threeBreathingRings.radiusStep,
    );
    applyThreeBreathingPulseStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingPulseStrength") ??
        DEFAULT_CONFIG.threeBreathingRings.pulseStrength,
    );
    applyThreeBreathingTubeRadius(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingTubeRadius") ??
        DEFAULT_CONFIG.threeBreathingRings.tubeRadius,
    );
    const savedBreathingBloom = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeBreathingBloom",
    );
    if (savedBreathingBloom != null && savedBreathingBloom !== "") {
      applyThreeBreathingBloomEnabled(savedBreathingBloom);
    }
    const savedBreathingBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeBreathingBloomStrength",
    );
    if (savedBreathingBloomStrength != null && savedBreathingBloomStrength !== "") {
      applyThreeBreathingBloomStrength(savedBreathingBloomStrength);
    }
    applyThreeBreathingAutoRotateSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeBreathingAutoRotateSpeed") ??
        DEFAULT_CONFIG.threeBreathingRings.autoRotateSpeedDeg,
    );
    applyThreeNoiseColorLowHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseColorLow") ??
        DEFAULT_CONFIG.threeNoiseLandscape.colorLow,
    );
    applyThreeNoiseColorHighHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseColorHigh") ??
        DEFAULT_CONFIG.threeNoiseLandscape.colorHigh,
    );
    applyThreeNoiseGridSize(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseGridSize") ??
        DEFAULT_CONFIG.threeNoiseLandscape.gridSize,
    );
    applyThreeNoiseHeightScale(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseHeightScale") ??
        DEFAULT_CONFIG.threeNoiseLandscape.heightScale,
    );
    applyThreeNoiseNoiseScale(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseNoiseScale") ??
        DEFAULT_CONFIG.threeNoiseLandscape.noiseScale,
    );
    applyThreeNoiseScrollSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseScrollSpeed") ??
        DEFAULT_CONFIG.threeNoiseLandscape.scrollSpeed,
    );
    applyThreeNoiseWireframeOverlay(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseWireframe"),
    );
    applyThreeNoiseBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseBloom"),
    );
    const savedNoiseBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeNoiseBloomStrength",
    );
    if (savedNoiseBloomStrength != null && savedNoiseBloomStrength !== "") {
      applyThreeNoiseBloomStrength(savedNoiseBloomStrength);
    }
    applyThreeNoiseCameraPitchDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeNoiseCameraPitch") ??
        DEFAULT_CONFIG.threeNoiseLandscape.cameraPitchDeg,
    );
    applyThreeLavaLampColorWarmHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampColorWarm") ??
        DEFAULT_CONFIG.threeLavaLamp.colorWarm,
    );
    applyThreeLavaLampColorCoolHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampColorCool") ??
        DEFAULT_CONFIG.threeLavaLamp.colorCool,
    );
    applyThreeLavaLampBlobCount(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampBlobCount") ??
        DEFAULT_CONFIG.threeLavaLamp.blobCount,
    );
    applyThreeLavaLampMergeStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampMergeStrength") ??
        DEFAULT_CONFIG.threeLavaLamp.mergeStrength,
    );
    applyThreeLavaLampBuoyancySpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampBuoyancySpeed") ??
        DEFAULT_CONFIG.threeLavaLamp.buoyancySpeed,
    );
    applyThreeLavaLampBassDrive(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampBassDrive") ??
        DEFAULT_CONFIG.threeLavaLamp.bassDrive,
    );
    applyThreeLavaLampBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeLavaLampBloom"),
    );
    const savedLavaLampBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeLavaLampBloomStrength",
    );
    if (savedLavaLampBloomStrength != null && savedLavaLampBloomStrength !== "") {
      applyThreeLavaLampBloomStrength(savedLavaLampBloomStrength);
    }
    applyThreeOilMarbleColor1Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleColor1") ??
        DEFAULT_CONFIG.threeOilMarble.color1,
    );
    applyThreeOilMarbleColor2Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleColor2") ??
        DEFAULT_CONFIG.threeOilMarble.color2,
    );
    applyThreeOilMarbleColor3Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleColor3") ??
        DEFAULT_CONFIG.threeOilMarble.color3,
    );
    applyThreeOilMarbleColor4Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleColor4") ??
        DEFAULT_CONFIG.threeOilMarble.color4,
    );
    applyThreeOilMarbleColor4Enabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleColor4Enabled"),
    );
    applyThreeOilMarbleFlowSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleFlowSpeed") ??
        DEFAULT_CONFIG.threeOilMarble.flowSpeed,
    );
    applyThreeOilMarbleNoiseScale(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleNoiseScale") ??
        DEFAULT_CONFIG.threeOilMarble.noiseScale,
    );
    applyThreeOilMarbleWarpStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleWarpStrength") ??
        DEFAULT_CONFIG.threeOilMarble.warpStrength,
    );
    applyThreeOilMarbleReactiveness(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleReactiveness") ??
        DEFAULT_CONFIG.threeOilMarble.reactiveness,
    );
    applyThreeOilMarbleBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeOilMarbleBloom"),
    );
    const savedOilMarbleBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeOilMarbleBloomStrength",
    );
    if (savedOilMarbleBloomStrength != null && savedOilMarbleBloomStrength !== "") {
      applyThreeOilMarbleBloomStrength(savedOilMarbleBloomStrength);
    }
    applyThreePearlChainColor1Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainColor1") ??
        DEFAULT_CONFIG.threePearlChain.color1,
    );
    applyThreePearlChainColor2Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainColor2") ??
        DEFAULT_CONFIG.threePearlChain.color2,
    );
    applyThreePearlChainColor3Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainColor3") ??
        DEFAULT_CONFIG.threePearlChain.color3,
    );
    applyThreePearlChainPearlCount(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainPearlCount") ??
        DEFAULT_CONFIG.threePearlChain.pearlCount,
    );
    applyThreePearlChainChainRadius(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainChainRadius") ??
        DEFAULT_CONFIG.threePearlChain.chainRadius,
    );
    applyThreePearlChainPearlSize(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainPearlSize") ??
        DEFAULT_CONFIG.threePearlChain.pearlSize,
    );
    applyThreePearlChainSwaySpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainSwaySpeed") ??
        DEFAULT_CONFIG.threePearlChain.swaySpeed,
    );
    applyThreePearlChainMergeStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainMergeStrength") ??
        DEFAULT_CONFIG.threePearlChain.mergeStrength,
    );
    applyThreePearlChainBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threePearlChainBloom"),
    );
    const savedPearlChainBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threePearlChainBloomStrength",
    );
    if (savedPearlChainBloomStrength != null && savedPearlChainBloomStrength !== "") {
      applyThreePearlChainBloomStrength(savedPearlChainBloomStrength);
    }
    applyThreeCrystalGemColorCoreHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemColorCore") ??
        DEFAULT_CONFIG.threeCrystalGem.colorCore,
    );
    applyThreeCrystalGemColorEdgeHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemColorEdge") ??
        DEFAULT_CONFIG.threeCrystalGem.colorEdge,
    );
    applyThreeCrystalGemColorHighlightHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemColorHighlight") ??
        DEFAULT_CONFIG.threeCrystalGem.colorHighlight,
    );
    applyThreeCrystalGemGemCount(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemGemCount") ??
        DEFAULT_CONFIG.threeCrystalGem.gemCount,
    );
    applyThreeCrystalGemFacetSharpness(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemFacetSharpness") ??
        DEFAULT_CONFIG.threeCrystalGem.facetSharpness,
    );
    applyThreeCrystalGemRotationSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemRotationSpeedDeg") ??
        DEFAULT_CONFIG.threeCrystalGem.rotationSpeedDeg,
    );
    applyThreeCrystalGemChromaticEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemChromatic"),
    );
    const savedCrystalGemChromaticOffset = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeCrystalGemChromaticOffset",
    );
    if (savedCrystalGemChromaticOffset != null && savedCrystalGemChromaticOffset !== "") {
      applyThreeCrystalGemChromaticOffset(savedCrystalGemChromaticOffset);
    }
    applyThreeCrystalGemBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeCrystalGemBloom"),
    );
    const savedCrystalGemBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeCrystalGemBloomStrength",
    );
    if (savedCrystalGemBloomStrength != null && savedCrystalGemBloomStrength !== "") {
      applyThreeCrystalGemBloomStrength(savedCrystalGemBloomStrength);
    }
    applyThreeGlassOrbsColor1Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsColor1") ??
        DEFAULT_CONFIG.threeGlassOrbs.color1,
    );
    applyThreeGlassOrbsColor2Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsColor2") ??
        DEFAULT_CONFIG.threeGlassOrbs.color2,
    );
    applyThreeGlassOrbsColor3Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsColor3") ??
        DEFAULT_CONFIG.threeGlassOrbs.color3,
    );
    applyThreeGlassOrbsColor4Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsColor4") ??
        DEFAULT_CONFIG.threeGlassOrbs.color4,
    );
    applyThreeGlassOrbsColor5Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsColor5") ??
        DEFAULT_CONFIG.threeGlassOrbs.color5,
    );
    applyThreeGlassOrbsOrbCount(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsOrbCount") ??
        DEFAULT_CONFIG.threeGlassOrbs.orbCount,
    );
    const savedGlassOrbsSpacing = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeGlassOrbsStackSpacing",
    );
    if (savedGlassOrbsSpacing != null && savedGlassOrbsSpacing !== "") {
      applyThreeGlassOrbsStackSpacing(savedGlassOrbsSpacing);
    }
    applyThreeGlassOrbsTransmission(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsTransmission") ??
        DEFAULT_CONFIG.threeGlassOrbs.transmission,
    );
    applyThreeGlassOrbsRefractionStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsRefractionStrength") ??
        DEFAULT_CONFIG.threeGlassOrbs.refractionStrength,
    );
    applyThreeGlassOrbsBreatheWithPeak(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsBreatheWithPeak"),
    );
    applyThreeGlassOrbsChromaticEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsChromatic"),
    );
    const savedGlassOrbsChromaticOffset = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeGlassOrbsChromaticOffset",
    );
    if (savedGlassOrbsChromaticOffset != null && savedGlassOrbsChromaticOffset !== "") {
      applyThreeGlassOrbsChromaticOffset(savedGlassOrbsChromaticOffset);
    }
    applyThreeGlassOrbsBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeGlassOrbsBloom"),
    );
    const savedGlassOrbsBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeGlassOrbsBloomStrength",
    );
    if (savedGlassOrbsBloomStrength != null && savedGlassOrbsBloomStrength !== "") {
      applyThreeGlassOrbsBloomStrength(savedGlassOrbsBloomStrength);
    }
    applyThreeHoloPrismTintLowHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismTintLow") ??
        DEFAULT_CONFIG.threeHoloPrism.tintLow,
    );
    applyThreeHoloPrismTintHighHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismTintHigh") ??
        DEFAULT_CONFIG.threeHoloPrism.tintHigh,
    );
    applyThreeHoloPrismSides(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismSides") ??
        DEFAULT_CONFIG.threeHoloPrism.prismSides,
    );
    applyThreeHoloPrismRotationSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismRotationSpeedDeg") ??
        DEFAULT_CONFIG.threeHoloPrism.rotationSpeedDeg,
    );
    applyThreeHoloPrismSpectralStrength(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismSpectralStrength") ??
        DEFAULT_CONFIG.threeHoloPrism.spectralStrength,
    );
    applyThreeHoloPrismPulseOnPeak(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismPulseOnPeak"),
    );
    const savedHoloPrismChromaticOffset = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeHoloPrismChromaticOffset",
    );
    if (savedHoloPrismChromaticOffset != null && savedHoloPrismChromaticOffset !== "") {
      applyThreeHoloPrismChromaticOffset(savedHoloPrismChromaticOffset);
    }
    applyThreeHoloPrismBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeHoloPrismBloom"),
    );
    const savedHoloPrismBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeHoloPrismBloomStrength",
    );
    if (savedHoloPrismBloomStrength != null && savedHoloPrismBloomStrength !== "") {
      applyThreeHoloPrismBloomStrength(savedHoloPrismBloomStrength);
    }
    applyThreeNebulaVolumeColorCoreHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeColorCore") ??
        DEFAULT_CONFIG.threeNebulaVolume.colorCore,
    );
    applyThreeNebulaVolumeColorMidHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeColorMid") ??
        DEFAULT_CONFIG.threeNebulaVolume.colorMid,
    );
    applyThreeNebulaVolumeColorEdgeHex(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeColorEdge") ??
        DEFAULT_CONFIG.threeNebulaVolume.colorEdge,
    );
    applyThreeNebulaVolumeDensityScale(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeDensityScale") ??
        DEFAULT_CONFIG.threeNebulaVolume.densityScale,
    );
    applyThreeNebulaVolumeNoiseScale(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeNoiseScale") ??
        DEFAULT_CONFIG.threeNebulaVolume.noiseScale,
    );
    applyThreeNebulaVolumeSwirlSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeSwirlSpeed") ??
        DEFAULT_CONFIG.threeNebulaVolume.swirlSpeed,
    );
    applyThreeNebulaVolumeMarchSteps(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeMarchSteps") ??
        DEFAULT_CONFIG.threeNebulaVolume.marchSteps,
    );
    applyThreeNebulaVolumeBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeNebulaVolumeBloom"),
    );
    const savedNebulaBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeNebulaVolumeBloomStrength",
    );
    if (savedNebulaBloomStrength != null && savedNebulaBloomStrength !== "") {
      applyThreeNebulaVolumeBloomStrength(savedNebulaBloomStrength);
    }
    applyThreeKnotOrganicColor1Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicColor1") ??
        DEFAULT_CONFIG.threeKnotOrganic.color1,
    );
    applyThreeKnotOrganicColor2Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicColor2") ??
        DEFAULT_CONFIG.threeKnotOrganic.color2,
    );
    applyThreeKnotOrganicColor3Hex(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicColor3") ??
        DEFAULT_CONFIG.threeKnotOrganic.color3,
    );
    applyThreeKnotOrganicKnotP(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicKnotP") ??
        DEFAULT_CONFIG.threeKnotOrganic.knotP,
    );
    applyThreeKnotOrganicKnotQ(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicKnotQ") ??
        DEFAULT_CONFIG.threeKnotOrganic.knotQ,
    );
    applyThreeKnotOrganicTubeRadius(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicTubeRadius") ??
        DEFAULT_CONFIG.threeKnotOrganic.tubeRadius,
    );
    applyThreeKnotOrganicSurfaceNoise(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicSurfaceNoise") ??
        DEFAULT_CONFIG.threeKnotOrganic.surfaceNoise,
    );
    applyThreeKnotOrganicRotationSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicRotationSpeedDeg") ??
        DEFAULT_CONFIG.threeKnotOrganic.rotationSpeedDeg,
    );
    applyThreeKnotOrganicBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeKnotOrganicBloom"),
    );
    const savedKnotBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeKnotOrganicBloomStrength",
    );
    if (savedKnotBloomStrength != null && savedKnotBloomStrength !== "") {
      applyThreeKnotOrganicBloomStrength(savedKnotBloomStrength);
    }
    applyThreeCoverPreset(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverPreset") ??
        DEFAULT_CONFIG.threeCoverParticle.preset,
    );
    applyThreeCoverResolution(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverResolution") ??
        DEFAULT_CONFIG.threeCoverParticle.coverResolution,
    );
    applyThreeCoverIntensity(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverIntensity") ??
        DEFAULT_CONFIG.threeCoverParticle.intensity,
    );
    applyThreeCoverDepth(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverDepth") ??
        DEFAULT_CONFIG.threeCoverParticle.depth,
    );
    applyThreeCoverPointScale(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverPointScale") ??
        DEFAULT_CONFIG.threeCoverParticle.pointScale,
    );
    applyThreeCoverSpeed(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverSpeed") ??
        DEFAULT_CONFIG.threeCoverParticle.speed,
    );
    applyThreeCoverTwist(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverTwist") ??
        DEFAULT_CONFIG.threeCoverParticle.twist,
    );
    applyThreeCoverScatter(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverScatter") ??
        DEFAULT_CONFIG.threeCoverParticle.scatter,
    );
    applyThreeCoverColorBoost(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverColorBoost") ??
        DEFAULT_CONFIG.threeCoverParticle.colorBoost,
    );
    applyThreeCoverBloomEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverBloom"),
    );
    const savedCoverBloomStrength = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeCoverBloomStrength",
    );
    if (savedCoverBloomStrength != null && savedCoverBloomStrength !== "") {
      applyThreeCoverBloomStrength(savedCoverBloomStrength);
    }
    const savedCoverBloomSize = readWindowStorageString(
      window.localStorage,
      windowLabel,
      "threeCoverBloomSize",
    );
    if (savedCoverBloomSize != null && savedCoverBloomSize !== "") {
      applyThreeCoverBloomSize(savedCoverBloomSize);
    }
    applyThreeCoverCameraDistance(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverCameraDistance") ??
        DEFAULT_CONFIG.threeCoverParticle.cameraDistance,
    );
    applyThreeCoverCameraFovDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverCameraFov") ??
        DEFAULT_CONFIG.threeCoverParticle.cameraFovDeg,
    );
    applyThreeCoverAutoRotateEnabled(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverAutoRotate"),
    );
    applyThreeCoverAutoRotateSpeedDeg(
      readWindowStorageString(window.localStorage, windowLabel, "threeCoverAutoRotateSpeed") ??
        DEFAULT_CONFIG.threeCoverParticle.autoRotateSpeedDeg,
    );
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

  if (windowLabel === "main") {
    await syncEspDisplayConfigFromStorage();
  }

  syncCoverArtPollingForMode(displayMode);
  void refreshCoverArtFromSnapshot();

  renderWaveform();
}

init().catch((error) => {
  console.error("main init failed:", error);
});
