import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  clampInt,
  DEFAULT_CONFIG,
  DISPLAY_MODES,
  PANEL_STYLES,
  STORAGE_KEYS,
  normalizeSpectrumWindowLabel,
  normalizeBarOrientation,
  normalizeBarPeakHoldMode,
  normalizeDisplayMode,
  readBarPeakHoldMode,
  readGradientBarPeakHoldMode,
  parseBoolean,
  normalizeDepthLayersRenderStyle,
  readWindowStorageString,
  writeWindowStorageString,
} from "./visualizationSchema.js";

const statusEl = document.querySelector("#status");
const startBtn = document.querySelector("#startBtn");
const stopBtn = document.querySelector("#stopBtn");
const pinToggle = document.querySelector("#pinToggle");
const bucketRange = document.querySelector("#bucketRange");
const bucketValue = document.querySelector("#bucketValue");
const bucketMode = document.querySelector("#bucketMode");
const tiltRange = document.querySelector("#tiltRange");
const tiltValue = document.querySelector("#tiltValue");
const freqMinRange = document.querySelector("#freqMinRange");
const freqMinValue = document.querySelector("#freqMinValue");
const freqMaxRange = document.querySelector("#freqMaxRange");
const freqMaxValue = document.querySelector("#freqMaxValue");
const freqReversedToggle = document.querySelector("#freqReversedToggle");
const displayModeSelect = document.querySelector("#displayMode");
const panelStyleModeSelect = document.querySelector("#panelStyleMode");

/** 展示模式 → 设置面板 id，后续新模式在此追加 */
const MODE_PANEL_IDS = {
  [DISPLAY_MODES.line]: "lineConfigPanel",
  [DISPLAY_MODES.bar]: "barConfigPanel",
  [DISPLAY_MODES.area]: "areaConfigPanel",
  [DISPLAY_MODES.gradientBar]: "gradientBarConfigPanel",
  [DISPLAY_MODES.glowLine]: "glowLineConfigPanel",
  [DISPLAY_MODES.glowCircle]: "glowCircleConfigPanel",
  [DISPLAY_MODES.radial]: "radialConfigPanel",
  [DISPLAY_MODES.waterfall]: "waterfallConfigPanel",
  [DISPLAY_MODES.dotRing]: "dotRingConfigPanel",
  [DISPLAY_MODES.oscilloscope]: "oscilloscopeConfigPanel",
  [DISPLAY_MODES.obliqueBar]: "obliqueBarConfigPanel",
  [DISPLAY_MODES.depthLayers]: "depthLayersConfigPanel",
  [DISPLAY_MODES.isometricSkyline]: "isometricSkylineConfigPanel",
  [DISPLAY_MODES.ring3d]: "ring3dConfigPanel",
  [DISPLAY_MODES.terrain3d]: "terrain3dConfigPanel",
};
const waveformColor = document.querySelector("#waveformColor");
const waveformWidthRange = document.querySelector("#waveformWidthRange");
const waveformWidthValue = document.querySelector("#waveformWidthValue");
const waveformGainRange = document.querySelector("#waveformGainRange");
const waveformGainValue = document.querySelector("#waveformGainValue");
const waveformSmoothRange = document.querySelector("#waveformSmoothRange");
const waveformSmoothValue = document.querySelector("#waveformSmoothValue");
const waveformSoftClipRange = document.querySelector("#waveformSoftClipRange");
const waveformSoftClipValue = document.querySelector("#waveformSoftClipValue");
const waveformFallEaseRange = document.querySelector("#waveformFallEaseRange");
const waveformFallEaseValue = document.querySelector("#waveformFallEaseValue");
const barColor = document.querySelector("#barColor");
const barWidthRange = document.querySelector("#barWidthRange");
const barWidthValue = document.querySelector("#barWidthValue");
const barGapRange = document.querySelector("#barGapRange");
const barGapValue = document.querySelector("#barGapValue");
const barHeadroomRange = document.querySelector("#barHeadroomRange");
const barHeadroomValue = document.querySelector("#barHeadroomValue");
const barOrientationSelect = document.querySelector("#barOrientation");
const barMirrorToggle = document.querySelector("#barMirrorToggle");
const barPeakHoldModeSelect = document.querySelector("#barPeakHoldMode");
const barPeakColor = document.querySelector("#barPeakColor");
const barPeakFallSpeedRange = document.querySelector("#barPeakFallSpeedRange");
const barPeakFallSpeedValue = document.querySelector("#barPeakFallSpeedValue");
const barPeakThicknessRange = document.querySelector("#barPeakThicknessRange");
const barPeakThicknessValue = document.querySelector("#barPeakThicknessValue");
const barGainRange = document.querySelector("#barGainRange");
const barGainValue = document.querySelector("#barGainValue");
const barSmoothRange = document.querySelector("#barSmoothRange");
const barSmoothValue = document.querySelector("#barSmoothValue");
const barSoftClipRange = document.querySelector("#barSoftClipRange");
const barSoftClipValue = document.querySelector("#barSoftClipValue");
const barFallEaseRange = document.querySelector("#barFallEaseRange");
const barFallEaseValue = document.querySelector("#barFallEaseValue");
const areaFillColor = document.querySelector("#areaFillColor");
const areaLineColor = document.querySelector("#areaLineColor");
const areaFillAlphaRange = document.querySelector("#areaFillAlphaRange");
const areaFillAlphaValue = document.querySelector("#areaFillAlphaValue");
const areaLineWidthRange = document.querySelector("#areaLineWidthRange");
const areaLineWidthValue = document.querySelector("#areaLineWidthValue");
const areaMirrorToggle = document.querySelector("#areaMirrorToggle");
const areaGradientToggle = document.querySelector("#areaGradientToggle");
const areaGainRange = document.querySelector("#areaGainRange");
const areaGainValue = document.querySelector("#areaGainValue");
const areaSmoothRange = document.querySelector("#areaSmoothRange");
const areaSmoothValue = document.querySelector("#areaSmoothValue");
const areaSoftClipRange = document.querySelector("#areaSoftClipRange");
const areaSoftClipValue = document.querySelector("#areaSoftClipValue");
const areaFallEaseRange = document.querySelector("#areaFallEaseRange");
const areaFallEaseValue = document.querySelector("#areaFallEaseValue");
const gradientBarColorLow = document.querySelector("#gradientBarColorLow");
const gradientBarColorHigh = document.querySelector("#gradientBarColorHigh");
const gradientBarWidthRange = document.querySelector("#gradientBarWidthRange");
const gradientBarWidthValue = document.querySelector("#gradientBarWidthValue");
const gradientBarGapRange = document.querySelector("#gradientBarGapRange");
const gradientBarGapValue = document.querySelector("#gradientBarGapValue");
const gradientBarHeadroomRange = document.querySelector("#gradientBarHeadroomRange");
const gradientBarHeadroomValue = document.querySelector("#gradientBarHeadroomValue");
const gradientBarOrientationSelect = document.querySelector("#gradientBarOrientation");
const gradientBarMirrorToggle = document.querySelector("#gradientBarMirrorToggle");
const gradientBarPeakHoldModeSelect = document.querySelector("#gradientBarPeakHoldMode");
const gradientBarPeakColor = document.querySelector("#gradientBarPeakColor");
const gradientBarPeakFallSpeedRange = document.querySelector("#gradientBarPeakFallSpeedRange");
const gradientBarPeakFallSpeedValue = document.querySelector("#gradientBarPeakFallSpeedValue");
const gradientBarPeakThicknessRange = document.querySelector("#gradientBarPeakThicknessRange");
const gradientBarPeakThicknessValue = document.querySelector("#gradientBarPeakThicknessValue");
const gradientBarGainRange = document.querySelector("#gradientBarGainRange");
const gradientBarGainValue = document.querySelector("#gradientBarGainValue");
const gradientBarSmoothRange = document.querySelector("#gradientBarSmoothRange");
const gradientBarSmoothValue = document.querySelector("#gradientBarSmoothValue");
const gradientBarSoftClipRange = document.querySelector("#gradientBarSoftClipRange");
const gradientBarSoftClipValue = document.querySelector("#gradientBarSoftClipValue");
const gradientBarFallEaseRange = document.querySelector("#gradientBarFallEaseRange");
const gradientBarFallEaseValue = document.querySelector("#gradientBarFallEaseValue");
const glowLineCoreColor = document.querySelector("#glowLineCoreColor");
const glowLineGlowColor = document.querySelector("#glowLineGlowColor");
const glowLineWidthRange = document.querySelector("#glowLineWidthRange");
const glowLineWidthValue = document.querySelector("#glowLineWidthValue");
const glowLineGlowRadiusRange = document.querySelector("#glowLineGlowRadiusRange");
const glowLineGlowRadiusValue = document.querySelector("#glowLineGlowRadiusValue");
const glowLineGlowIntensityRange = document.querySelector("#glowLineGlowIntensityRange");
const glowLineGlowIntensityValue = document.querySelector("#glowLineGlowIntensityValue");
const glowLineGainRange = document.querySelector("#glowLineGainRange");
const glowLineGainValue = document.querySelector("#glowLineGainValue");
const glowLineSmoothRange = document.querySelector("#glowLineSmoothRange");
const glowLineSmoothValue = document.querySelector("#glowLineSmoothValue");
const glowLineSoftClipRange = document.querySelector("#glowLineSoftClipRange");
const glowLineSoftClipValue = document.querySelector("#glowLineSoftClipValue");
const glowLineFallEaseRange = document.querySelector("#glowLineFallEaseRange");
const glowLineFallEaseValue = document.querySelector("#glowLineFallEaseValue");
const glowCircleCoreColor = document.querySelector("#glowCircleCoreColor");
const glowCircleGlowColor = document.querySelector("#glowCircleGlowColor");
const glowCircleWidthRange = document.querySelector("#glowCircleWidthRange");
const glowCircleWidthValue = document.querySelector("#glowCircleWidthValue");
const glowCircleGlowRadiusRange = document.querySelector("#glowCircleGlowRadiusRange");
const glowCircleGlowRadiusValue = document.querySelector("#glowCircleGlowRadiusValue");
const glowCircleGlowIntensityRange = document.querySelector("#glowCircleGlowIntensityRange");
const glowCircleGlowIntensityValue = document.querySelector("#glowCircleGlowIntensityValue");
const glowCircleRingRadiusRange = document.querySelector("#glowCircleRingRadiusRange");
const glowCircleRingRadiusValue = document.querySelector("#glowCircleRingRadiusValue");
const glowCircleRotationRange = document.querySelector("#glowCircleRotationRange");
const glowCircleRotationValue = document.querySelector("#glowCircleRotationValue");
const glowCircleClockwiseToggle = document.querySelector("#glowCircleClockwiseToggle");
const glowCircleGainRange = document.querySelector("#glowCircleGainRange");
const glowCircleGainValue = document.querySelector("#glowCircleGainValue");
const glowCircleSmoothRange = document.querySelector("#glowCircleSmoothRange");
const glowCircleSmoothValue = document.querySelector("#glowCircleSmoothValue");
const glowCircleSoftClipRange = document.querySelector("#glowCircleSoftClipRange");
const glowCircleSoftClipValue = document.querySelector("#glowCircleSoftClipValue");
const glowCircleFallEaseRange = document.querySelector("#glowCircleFallEaseRange");
const glowCircleFallEaseValue = document.querySelector("#glowCircleFallEaseValue");
const radialBarColor = document.querySelector("#radialBarColor");
const radialInnerRadiusRange = document.querySelector("#radialInnerRadiusRange");
const radialInnerRadiusValue = document.querySelector("#radialInnerRadiusValue");
const radialOuterRadiusRange = document.querySelector("#radialOuterRadiusRange");
const radialOuterRadiusValue = document.querySelector("#radialOuterRadiusValue");
const radialBarThicknessRange = document.querySelector("#radialBarThicknessRange");
const radialBarThicknessValue = document.querySelector("#radialBarThicknessValue");
const radialRotationRange = document.querySelector("#radialRotationRange");
const radialRotationValue = document.querySelector("#radialRotationValue");
const radialMirrorToggle = document.querySelector("#radialMirrorToggle");
const radialClockwiseToggle = document.querySelector("#radialClockwiseToggle");
const radialGainRange = document.querySelector("#radialGainRange");
const radialGainValue = document.querySelector("#radialGainValue");
const radialSmoothRange = document.querySelector("#radialSmoothRange");
const radialSmoothValue = document.querySelector("#radialSmoothValue");
const radialSoftClipRange = document.querySelector("#radialSoftClipRange");
const radialSoftClipValue = document.querySelector("#radialSoftClipValue");
const radialFallEaseRange = document.querySelector("#radialFallEaseRange");
const radialFallEaseValue = document.querySelector("#radialFallEaseValue");
const waterfallColorLow = document.querySelector("#waterfallColorLow");
const waterfallColorHigh = document.querySelector("#waterfallColorHigh");
const waterfallHistoryRowsRange = document.querySelector("#waterfallHistoryRowsRange");
const waterfallHistoryRowsValue = document.querySelector("#waterfallHistoryRowsValue");
const waterfallScrollRange = document.querySelector("#waterfallScrollRange");
const waterfallScrollValue = document.querySelector("#waterfallScrollValue");
const waterfallRowGapRange = document.querySelector("#waterfallRowGapRange");
const waterfallRowGapValue = document.querySelector("#waterfallRowGapValue");
const waterfallGainRange = document.querySelector("#waterfallGainRange");
const waterfallGainValue = document.querySelector("#waterfallGainValue");
const waterfallSmoothRange = document.querySelector("#waterfallSmoothRange");
const waterfallSmoothValue = document.querySelector("#waterfallSmoothValue");
const waterfallSoftClipRange = document.querySelector("#waterfallSoftClipRange");
const waterfallSoftClipValue = document.querySelector("#waterfallSoftClipValue");
const waterfallFallEaseRange = document.querySelector("#waterfallFallEaseRange");
const waterfallFallEaseValue = document.querySelector("#waterfallFallEaseValue");
const dotRingDotColor = document.querySelector("#dotRingDotColor");
const dotRingRadiusRange = document.querySelector("#dotRingRadiusRange");
const dotRingRadiusValue = document.querySelector("#dotRingRadiusValue");
const dotRingCountRange = document.querySelector("#dotRingCountRange");
const dotRingCountValue = document.querySelector("#dotRingCountValue");
const dotRingSizeRange = document.querySelector("#dotRingSizeRange");
const dotRingSizeValue = document.querySelector("#dotRingSizeValue");
const dotRingPulseToggle = document.querySelector("#dotRingPulseToggle");
const dotRingGainRange = document.querySelector("#dotRingGainRange");
const dotRingGainValue = document.querySelector("#dotRingGainValue");
const dotRingSmoothRange = document.querySelector("#dotRingSmoothRange");
const dotRingSmoothValue = document.querySelector("#dotRingSmoothValue");
const dotRingSoftClipRange = document.querySelector("#dotRingSoftClipRange");
const dotRingSoftClipValue = document.querySelector("#dotRingSoftClipValue");
const dotRingFallEaseRange = document.querySelector("#dotRingFallEaseRange");
const dotRingFallEaseValue = document.querySelector("#dotRingFallEaseValue");
const oscilloscopeColor = document.querySelector("#oscilloscopeColor");
const oscilloscopeWidthRange = document.querySelector("#oscilloscopeWidthRange");
const oscilloscopeWidthValue = document.querySelector("#oscilloscopeWidthValue");
const oscilloscopePhosphorToggle = document.querySelector("#oscilloscopePhosphorToggle");
const oscilloscopePhosphorDecayRange = document.querySelector("#oscilloscopePhosphorDecayRange");
const oscilloscopePhosphorDecayValue = document.querySelector("#oscilloscopePhosphorDecayValue");
const obliqueBarColor = document.querySelector("#obliqueBarColor");
const obliqueBarColorFar = document.querySelector("#obliqueBarColorFar");
const obliqueBarWidthRange = document.querySelector("#obliqueBarWidthRange");
const obliqueBarWidthValue = document.querySelector("#obliqueBarWidthValue");
const obliqueBarGapRange = document.querySelector("#obliqueBarGapRange");
const obliqueBarGapValue = document.querySelector("#obliqueBarGapValue");
const obliqueBarHeadroomRange = document.querySelector("#obliqueBarHeadroomRange");
const obliqueBarHeadroomValue = document.querySelector("#obliqueBarHeadroomValue");
const obliqueBarTiltRange = document.querySelector("#obliqueBarTiltRange");
const obliqueBarTiltValue = document.querySelector("#obliqueBarTiltValue");
const obliqueBarDisplayCountRange = document.querySelector("#obliqueBarDisplayCountRange");
const obliqueBarDisplayCountValue = document.querySelector("#obliqueBarDisplayCountValue");
const obliqueBarGroundLineToggle = document.querySelector("#obliqueBarGroundLineToggle");
const obliqueBarMirrorToggle = document.querySelector("#obliqueBarMirrorToggle");
const obliqueBarGainRange = document.querySelector("#obliqueBarGainRange");
const obliqueBarGainValue = document.querySelector("#obliqueBarGainValue");
const obliqueBarSmoothRange = document.querySelector("#obliqueBarSmoothRange");
const obliqueBarSmoothValue = document.querySelector("#obliqueBarSmoothValue");
const obliqueBarSoftClipRange = document.querySelector("#obliqueBarSoftClipRange");
const obliqueBarSoftClipValue = document.querySelector("#obliqueBarSoftClipValue");
const obliqueBarFallEaseRange = document.querySelector("#obliqueBarFallEaseRange");
const obliqueBarFallEaseValue = document.querySelector("#obliqueBarFallEaseValue");
const depthLayersCountRange = document.querySelector("#depthLayersCountRange");
const depthLayersCountValue = document.querySelector("#depthLayersCountValue");
const depthLayersSpacingRange = document.querySelector("#depthLayersSpacingRange");
const depthLayersSpacingValue = document.querySelector("#depthLayersSpacingValue");
const depthLayersFarScaleRange = document.querySelector("#depthLayersFarScaleRange");
const depthLayersFarScaleValue = document.querySelector("#depthLayersFarScaleValue");
const depthLayersFarAlphaRange = document.querySelector("#depthLayersFarAlphaRange");
const depthLayersFarAlphaValue = document.querySelector("#depthLayersFarAlphaValue");
const depthLayersBassFrontToggle = document.querySelector("#depthLayersBassFrontToggle");
const depthLayersColor = document.querySelector("#depthLayersColor");
const depthLayersColorFar = document.querySelector("#depthLayersColorFar");
const depthLayersRenderStyleSelect = document.querySelector("#depthLayersRenderStyleSelect");
const depthLayersLineWidthRange = document.querySelector("#depthLayersLineWidthRange");
const depthLayersLineWidthValue = document.querySelector("#depthLayersLineWidthValue");
const depthLayersGainRange = document.querySelector("#depthLayersGainRange");
const depthLayersGainValue = document.querySelector("#depthLayersGainValue");
const depthLayersSmoothRange = document.querySelector("#depthLayersSmoothRange");
const depthLayersSmoothValue = document.querySelector("#depthLayersSmoothValue");
const depthLayersSoftClipRange = document.querySelector("#depthLayersSoftClipRange");
const depthLayersSoftClipValue = document.querySelector("#depthLayersSoftClipValue");
const depthLayersFallEaseRange = document.querySelector("#depthLayersFallEaseRange");
const depthLayersFallEaseValue = document.querySelector("#depthLayersFallEaseValue");
const isometricSkylineFaceTopColor = document.querySelector("#isometricSkylineFaceTopColor");
const isometricSkylineFaceLeftColor = document.querySelector("#isometricSkylineFaceLeftColor");
const isometricSkylineFaceRightColor = document.querySelector("#isometricSkylineFaceRightColor");
const isometricSkylineBuildingWidthRange = document.querySelector("#isometricSkylineBuildingWidthRange");
const isometricSkylineBuildingWidthValue = document.querySelector("#isometricSkylineBuildingWidthValue");
const isometricSkylineBuildingGapRange = document.querySelector("#isometricSkylineBuildingGapRange");
const isometricSkylineBuildingGapValue = document.querySelector("#isometricSkylineBuildingGapValue");
const isometricSkylineBuildingCountRange = document.querySelector("#isometricSkylineBuildingCountRange");
const isometricSkylineBuildingCountValue = document.querySelector("#isometricSkylineBuildingCountValue");
const isometricSkylineBaselineRange = document.querySelector("#isometricSkylineBaselineRange");
const isometricSkylineBaselineValue = document.querySelector("#isometricSkylineBaselineValue");
const isometricSkylineGroundPlaneToggle = document.querySelector("#isometricSkylineGroundPlaneToggle");
const isometricSkylineGainRange = document.querySelector("#isometricSkylineGainRange");
const isometricSkylineGainValue = document.querySelector("#isometricSkylineGainValue");
const isometricSkylineSmoothRange = document.querySelector("#isometricSkylineSmoothRange");
const isometricSkylineSmoothValue = document.querySelector("#isometricSkylineSmoothValue");
const isometricSkylineSoftClipRange = document.querySelector("#isometricSkylineSoftClipRange");
const isometricSkylineSoftClipValue = document.querySelector("#isometricSkylineSoftClipValue");
const isometricSkylineFallEaseRange = document.querySelector("#isometricSkylineFallEaseRange");
const isometricSkylineFallEaseValue = document.querySelector("#isometricSkylineFallEaseValue");

const ring3dColor = document.querySelector("#ring3dColor");
const ring3dInnerRadiusRange = document.querySelector("#ring3dInnerRadiusRange");
const ring3dInnerRadiusValue = document.querySelector("#ring3dInnerRadiusValue");
const ring3dOuterRadiusRange = document.querySelector("#ring3dOuterRadiusRange");
const ring3dOuterRadiusValue = document.querySelector("#ring3dOuterRadiusValue");
const ring3dBarHeightScaleRange = document.querySelector("#ring3dBarHeightScaleRange");
const ring3dBarHeightScaleValue = document.querySelector("#ring3dBarHeightScaleValue");
const ring3dBarThicknessRange = document.querySelector("#ring3dBarThicknessRange");
const ring3dBarThicknessValue = document.querySelector("#ring3dBarThicknessValue");
const ring3dDisplayCountRange = document.querySelector("#ring3dDisplayCountRange");
const ring3dDisplayCountValue = document.querySelector("#ring3dDisplayCountValue");
const ring3dWireframeToggle = document.querySelector("#ring3dWireframeToggle");
const ring3dFillToggle = document.querySelector("#ring3dFillToggle");
const ring3dAutoRotateToggle = document.querySelector("#ring3dAutoRotateToggle");
const ring3dAutoRotateSpeedRange = document.querySelector("#ring3dAutoRotateSpeedRange");
const ring3dAutoRotateSpeedValue = document.querySelector("#ring3dAutoRotateSpeedValue");
const ring3dCameraDistanceRange = document.querySelector("#ring3dCameraDistanceRange");
const ring3dCameraDistanceValue = document.querySelector("#ring3dCameraDistanceValue");
const ring3dCameraFovRange = document.querySelector("#ring3dCameraFovRange");
const ring3dCameraFovValue = document.querySelector("#ring3dCameraFovValue");
const ring3dBreathePeakToggle = document.querySelector("#ring3dBreathePeakToggle");
const ring3dGainRange = document.querySelector("#ring3dGainRange");
const ring3dGainValue = document.querySelector("#ring3dGainValue");
const ring3dSmoothRange = document.querySelector("#ring3dSmoothRange");
const ring3dSmoothValue = document.querySelector("#ring3dSmoothValue");
const ring3dSoftClipRange = document.querySelector("#ring3dSoftClipRange");
const ring3dSoftClipValue = document.querySelector("#ring3dSoftClipValue");
const ring3dFallEaseRange = document.querySelector("#ring3dFallEaseRange");
const ring3dFallEaseValue = document.querySelector("#ring3dFallEaseValue");
const terrain3dColorLow = document.querySelector("#terrain3dColorLow");
const terrain3dColorHigh = document.querySelector("#terrain3dColorHigh");
const terrain3dWireframeColor = document.querySelector("#terrain3dWireframeColor");
const terrain3dGridColsRange = document.querySelector("#terrain3dGridColsRange");
const terrain3dGridColsValue = document.querySelector("#terrain3dGridColsValue");
const terrain3dGridRowsRange = document.querySelector("#terrain3dGridRowsRange");
const terrain3dGridRowsValue = document.querySelector("#terrain3dGridRowsValue");
const terrain3dScrollRange = document.querySelector("#terrain3dScrollRange");
const terrain3dScrollValue = document.querySelector("#terrain3dScrollValue");
const terrain3dWireframeToggle = document.querySelector("#terrain3dWireframeToggle");
const terrain3dFillToggle = document.querySelector("#terrain3dFillToggle");
const terrain3dHeightScaleRange = document.querySelector("#terrain3dHeightScaleRange");
const terrain3dHeightScaleValue = document.querySelector("#terrain3dHeightScaleValue");
const terrain3dCameraPitchRange = document.querySelector("#terrain3dCameraPitchRange");
const terrain3dCameraPitchValue = document.querySelector("#terrain3dCameraPitchValue");
const terrain3dCameraDistanceRange = document.querySelector("#terrain3dCameraDistanceRange");
const terrain3dCameraDistanceValue = document.querySelector("#terrain3dCameraDistanceValue");
const terrain3dAutoScrollToggle = document.querySelector("#terrain3dAutoScrollToggle");
const terrain3dGainRange = document.querySelector("#terrain3dGainRange");
const terrain3dGainValue = document.querySelector("#terrain3dGainValue");
const terrain3dSmoothRange = document.querySelector("#terrain3dSmoothRange");
const terrain3dSmoothValue = document.querySelector("#terrain3dSmoothValue");
const terrain3dSoftClipRange = document.querySelector("#terrain3dSoftClipRange");
const terrain3dSoftClipValue = document.querySelector("#terrain3dSoftClipValue");
const terrain3dFallEaseRange = document.querySelector("#terrain3dFallEaseRange");
const terrain3dFallEaseValue = document.querySelector("#terrain3dFallEaseValue");
const bodyBgColor = document.querySelector("#bodyBgColor");
const bodyBgAlpha = document.querySelector("#bodyBgAlpha");
const bodyBgAlphaValue = document.querySelector("#bodyBgAlphaValue");
const blurToggle = document.querySelector("#blurToggle");
const blackholeHint = document.querySelector("#blackholeHint");
const blackholeInstallBtn = document.querySelector("#blackholeInstallBtn");
const blackholeRefreshBtn = document.querySelector("#blackholeRefreshBtn");
const captureSourceModeSelect = document.querySelector("#captureSourceMode");
const openMidiSetupBtn = document.querySelector("#openMidiSetupBtn");
const openSoundSettingsBtn = document.querySelector("#openSoundSettingsBtn");
const closeSettingsBtn = document.querySelector("#closeSettingsBtn");
const NO_FRAME_TIMEOUT_MS = 4000;
const ACTIVE_PEAK_THRESHOLD = 0.003;
const ACTIVE_RMS_THRESHOLD = 0.0015;
const ACTIVE_POINTS_THRESHOLD = 0.01;
let blackholeInstalled = false;
let captureTransportRunning = false;
let lastWaveformFrameAt = 0;
let captureSourceMode = "blackhole";
let displayMode = DEFAULT_CONFIG.displayMode;
let panelStyleMode = DEFAULT_CONFIG.panelStyleMode;

function setupStatusFlashOnChange() {
  if (!statusEl) {
    return;
  }
  const triggerFlash = () => {
    statusEl.classList.remove("settings-status--flash");
    // 强制重排，确保重复文案变更时动画也可再次触发。
    void statusEl.offsetWidth;
    statusEl.classList.add("settings-status--flash");
  };
  const observer = new MutationObserver(() => {
    triggerFlash();
  });
  observer.observe(statusEl, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function readWaveShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "lineShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncWaveShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(waveformGainRange?.value, 10, 150),
    smoothPercent: clampInt(waveformSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(waveformSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(waveformFallEaseRange?.value, 0, 100),
  };
  waveformGainValue.textContent = String(config.gainPercent);
  waveformSmoothValue.textContent = String(config.smoothPercent);
  waveformSoftClipValue.textContent = String(config.softClipPercent);
  waveformFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "lineShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步波形形态参数失败：${String(err)}`;
  }
}

function readBarShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "barShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncBarShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(barGainRange?.value, 10, 150),
    smoothPercent: clampInt(barSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(barSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(barFallEaseRange?.value, 0, 100),
  };
  barGainValue.textContent = String(config.gainPercent);
  barSmoothValue.textContent = String(config.smoothPercent);
  barSoftClipValue.textContent = String(config.softClipPercent);
  barFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "barShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-bar-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步柱状图参数失败：${String(err)}`;
  }
}

function readAreaShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "areaShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncAreaShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(areaGainRange?.value, 10, 150),
    smoothPercent: clampInt(areaSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(areaSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(areaFallEaseRange?.value, 0, 100),
  };
  areaGainValue.textContent = String(config.gainPercent);
  areaSmoothValue.textContent = String(config.smoothPercent);
  areaSoftClipValue.textContent = String(config.softClipPercent);
  areaFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "areaShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-area-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步填充波形参数失败：${String(err)}`;
  }
}

function readGradientBarShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncGradientBarShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(gradientBarGainRange?.value, 10, 150),
    smoothPercent: clampInt(gradientBarSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(gradientBarSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(gradientBarFallEaseRange?.value, 0, 100),
  };
  gradientBarGainValue.textContent = String(config.gainPercent);
  gradientBarSmoothValue.textContent = String(config.smoothPercent);
  gradientBarSoftClipValue.textContent = String(config.softClipPercent);
  gradientBarFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-gradient-bar-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步渐变频谱柱参数失败：${String(err)}`;
  }
}

function applyGradientBarFormFromStorage(v) {
  const sg = readGradientBarShapeConfig(v) ?? { ...DEFAULT_CONFIG.gradientBar.shape };
  if (gradientBarGainRange) gradientBarGainRange.value = String(sg.gainPercent);
  if (gradientBarSmoothRange) gradientBarSmoothRange.value = String(sg.smoothPercent);
  if (gradientBarSoftClipRange) gradientBarSoftClipRange.value = String(sg.softClipPercent);
  if (gradientBarFallEaseRange) gradientBarFallEaseRange.value = String(sg.fallEasePercent);
  if (gradientBarGainValue) gradientBarGainValue.textContent = String(sg.gainPercent);
  if (gradientBarSmoothValue) gradientBarSmoothValue.textContent = String(sg.smoothPercent);
  if (gradientBarSoftClipValue) gradientBarSoftClipValue.textContent = String(sg.softClipPercent);
  if (gradientBarFallEaseValue) gradientBarFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColorLow = readWindowStorageString(window.localStorage, v, "gradientBarColorLow");
  if (gradientBarColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    gradientBarColorLow.value = savedColorLow.toLowerCase();
  } else if (gradientBarColorLow) {
    gradientBarColorLow.value = DEFAULT_CONFIG.gradientBar.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "gradientBarColorHigh");
  if (gradientBarColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    gradientBarColorHigh.value = savedColorHigh.toLowerCase();
  } else if (gradientBarColorHigh) {
    gradientBarColorHigh.value = DEFAULT_CONFIG.gradientBar.colorHigh;
  }

  const savedWidth = readWindowStorageString(window.localStorage, v, "gradientBarWidth");
  if (gradientBarWidthRange) {
    const widthPercent =
      savedWidth != null && savedWidth !== ""
        ? clampInt(savedWidth, 20, 100)
        : DEFAULT_CONFIG.gradientBar.widthPercent;
    gradientBarWidthRange.value = String(widthPercent);
    if (gradientBarWidthValue) gradientBarWidthValue.textContent = String(widthPercent);
  }

  const savedGap = readWindowStorageString(window.localStorage, v, "gradientBarGap");
  if (gradientBarGapRange) {
    const gapPercent =
      savedGap != null && savedGap !== ""
        ? clampInt(savedGap, 0, 70)
        : DEFAULT_CONFIG.gradientBar.gapPercent;
    gradientBarGapRange.value = String(gapPercent);
    if (gradientBarGapValue) gradientBarGapValue.textContent = String(gapPercent);
  }

  const savedHeadroom = readWindowStorageString(window.localStorage, v, "gradientBarHeadroom");
  if (gradientBarHeadroomRange) {
    const headroomPercent =
      savedHeadroom != null && savedHeadroom !== ""
        ? clampInt(savedHeadroom, 0, 40)
        : DEFAULT_CONFIG.gradientBar.headroomPercent;
    gradientBarHeadroomRange.value = String(headroomPercent);
    if (gradientBarHeadroomValue) gradientBarHeadroomValue.textContent = String(headroomPercent);
  }

  if (gradientBarOrientationSelect) {
    gradientBarOrientationSelect.value = normalizeBarOrientation(
      readWindowStorageString(window.localStorage, v, "gradientBarOrientation"),
      DEFAULT_CONFIG.gradientBar.orientation,
    );
  }
  if (gradientBarMirrorToggle) {
    gradientBarMirrorToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "gradientBarMirror"),
      DEFAULT_CONFIG.gradientBar.mirrorEnabled,
    );
  }
  if (gradientBarPeakHoldModeSelect) {
    gradientBarPeakHoldModeSelect.value = readGradientBarPeakHoldMode(window.localStorage, v);
  }
  if (gradientBarPeakColor) {
    const savedPeakColor = readWindowStorageString(window.localStorage, v, "gradientBarPeakColor");
    if (savedPeakColor && /^#[0-9A-Fa-f]{6}$/.test(savedPeakColor)) {
      gradientBarPeakColor.value = savedPeakColor.toLowerCase();
    } else {
      gradientBarPeakColor.value = DEFAULT_CONFIG.gradientBar.peakColor;
    }
  }
  const savedPeakFall = readWindowStorageString(window.localStorage, v, "gradientBarPeakFallSpeed");
  if (savedPeakFall && gradientBarPeakFallSpeedRange) {
    const speed = clampInt(savedPeakFall, 5, 120);
    gradientBarPeakFallSpeedRange.value = String(speed);
    if (gradientBarPeakFallSpeedValue) gradientBarPeakFallSpeedValue.textContent = String(speed);
  }
  const savedPeakTh = readWindowStorageString(window.localStorage, v, "gradientBarPeakThickness");
  if (savedPeakTh && gradientBarPeakThicknessRange) {
    const thickness = clampInt(savedPeakTh, 1, 8);
    gradientBarPeakThicknessRange.value = String(thickness);
    if (gradientBarPeakThicknessValue) gradientBarPeakThicknessValue.textContent = String(thickness);
  }
}

function readGlowLineShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "glowLineShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncGlowLineShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(glowLineGainRange?.value, 10, 150),
    smoothPercent: clampInt(glowLineSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(glowLineSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(glowLineFallEaseRange?.value, 0, 100),
  };
  if (glowLineGainValue) glowLineGainValue.textContent = String(config.gainPercent);
  if (glowLineSmoothValue) glowLineSmoothValue.textContent = String(config.smoothPercent);
  if (glowLineSoftClipValue) glowLineSoftClipValue.textContent = String(config.softClipPercent);
  if (glowLineFallEaseValue) glowLineFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "glowLineShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-glow-line-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步霓虹发光线参数失败：${String(err)}`;
  }
}

function applyGlowLineFormFromStorage(v) {
  const sg = readGlowLineShapeConfig(v) ?? { ...DEFAULT_CONFIG.glowLine.shape };
  if (glowLineGainRange) glowLineGainRange.value = String(sg.gainPercent);
  if (glowLineSmoothRange) glowLineSmoothRange.value = String(sg.smoothPercent);
  if (glowLineSoftClipRange) glowLineSoftClipRange.value = String(sg.softClipPercent);
  if (glowLineFallEaseRange) glowLineFallEaseRange.value = String(sg.fallEasePercent);
  if (glowLineGainValue) glowLineGainValue.textContent = String(sg.gainPercent);
  if (glowLineSmoothValue) glowLineSmoothValue.textContent = String(sg.smoothPercent);
  if (glowLineSoftClipValue) glowLineSoftClipValue.textContent = String(sg.softClipPercent);
  if (glowLineFallEaseValue) glowLineFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedCoreColor = readWindowStorageString(window.localStorage, v, "glowLineCoreColor");
  if (glowLineCoreColor && savedCoreColor && /^#[0-9A-Fa-f]{6}$/.test(savedCoreColor)) {
    glowLineCoreColor.value = savedCoreColor.toLowerCase();
  } else if (glowLineCoreColor) {
    glowLineCoreColor.value = DEFAULT_CONFIG.glowLine.coreColor;
  }

  const savedGlowColor = readWindowStorageString(window.localStorage, v, "glowLineGlowColor");
  if (glowLineGlowColor && savedGlowColor && /^#[0-9A-Fa-f]{6}$/.test(savedGlowColor)) {
    glowLineGlowColor.value = savedGlowColor.toLowerCase();
  } else if (glowLineGlowColor) {
    glowLineGlowColor.value = DEFAULT_CONFIG.glowLine.glowColor;
  }

  const savedLineWidth = readWindowStorageString(window.localStorage, v, "glowLineWidth");
  if (glowLineWidthRange) {
    const lineWidth =
      savedLineWidth != null && savedLineWidth !== ""
        ? clampInt(savedLineWidth, 1, 12)
        : DEFAULT_CONFIG.glowLine.lineWidthPx;
    glowLineWidthRange.value = String(lineWidth);
    if (glowLineWidthValue) glowLineWidthValue.textContent = String(lineWidth);
  }

  const savedGlowRadius = readWindowStorageString(window.localStorage, v, "glowLineGlowRadius");
  if (glowLineGlowRadiusRange) {
    const glowRadius =
      savedGlowRadius != null && savedGlowRadius !== ""
        ? clampInt(savedGlowRadius, 2, 24)
        : DEFAULT_CONFIG.glowLine.glowRadiusPx;
    glowLineGlowRadiusRange.value = String(glowRadius);
    if (glowLineGlowRadiusValue) glowLineGlowRadiusValue.textContent = String(glowRadius);
  }

  const savedGlowIntensity = readWindowStorageString(window.localStorage, v, "glowLineGlowIntensity");
  if (glowLineGlowIntensityRange) {
    const glowIntensity =
      savedGlowIntensity != null && savedGlowIntensity !== ""
        ? clampInt(savedGlowIntensity, 0, 100)
        : DEFAULT_CONFIG.glowLine.glowIntensityPercent;
    glowLineGlowIntensityRange.value = String(glowIntensity);
    if (glowLineGlowIntensityValue) glowLineGlowIntensityValue.textContent = String(glowIntensity);
  }
}

function readGlowCircleShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncGlowCircleShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(glowCircleGainRange?.value, 10, 150),
    smoothPercent: clampInt(glowCircleSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(glowCircleSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(glowCircleFallEaseRange?.value, 0, 100),
  };
  if (glowCircleGainValue) glowCircleGainValue.textContent = String(config.gainPercent);
  if (glowCircleSmoothValue) glowCircleSmoothValue.textContent = String(config.smoothPercent);
  if (glowCircleSoftClipValue) glowCircleSoftClipValue.textContent = String(config.softClipPercent);
  if (glowCircleFallEaseValue) glowCircleFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-glow-circle-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步霓虹圆形参数失败：${String(err)}`;
  }
}

function applyGlowCircleFormFromStorage(v) {
  const sg = readGlowCircleShapeConfig(v) ?? { ...DEFAULT_CONFIG.glowCircle.shape };
  if (glowCircleGainRange) glowCircleGainRange.value = String(sg.gainPercent);
  if (glowCircleSmoothRange) glowCircleSmoothRange.value = String(sg.smoothPercent);
  if (glowCircleSoftClipRange) glowCircleSoftClipRange.value = String(sg.softClipPercent);
  if (glowCircleFallEaseRange) glowCircleFallEaseRange.value = String(sg.fallEasePercent);
  if (glowCircleGainValue) glowCircleGainValue.textContent = String(sg.gainPercent);
  if (glowCircleSmoothValue) glowCircleSmoothValue.textContent = String(sg.smoothPercent);
  if (glowCircleSoftClipValue) glowCircleSoftClipValue.textContent = String(sg.softClipPercent);
  if (glowCircleFallEaseValue) glowCircleFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedCoreColor = readWindowStorageString(window.localStorage, v, "glowCircleCoreColor");
  if (glowCircleCoreColor && savedCoreColor && /^#[0-9A-Fa-f]{6}$/.test(savedCoreColor)) {
    glowCircleCoreColor.value = savedCoreColor.toLowerCase();
  } else if (glowCircleCoreColor) {
    glowCircleCoreColor.value = DEFAULT_CONFIG.glowCircle.coreColor;
  }

  const savedGlowColor = readWindowStorageString(window.localStorage, v, "glowCircleGlowColor");
  if (glowCircleGlowColor && savedGlowColor && /^#[0-9A-Fa-f]{6}$/.test(savedGlowColor)) {
    glowCircleGlowColor.value = savedGlowColor.toLowerCase();
  } else if (glowCircleGlowColor) {
    glowCircleGlowColor.value = DEFAULT_CONFIG.glowCircle.glowColor;
  }

  const savedLineWidth = readWindowStorageString(window.localStorage, v, "glowCircleWidth");
  if (glowCircleWidthRange) {
    const lineWidth =
      savedLineWidth != null && savedLineWidth !== ""
        ? clampInt(savedLineWidth, 1, 12)
        : DEFAULT_CONFIG.glowCircle.lineWidthPx;
    glowCircleWidthRange.value = String(lineWidth);
    if (glowCircleWidthValue) glowCircleWidthValue.textContent = String(lineWidth);
  }

  const savedGlowRadius = readWindowStorageString(window.localStorage, v, "glowCircleGlowRadius");
  if (glowCircleGlowRadiusRange) {
    const glowRadius =
      savedGlowRadius != null && savedGlowRadius !== ""
        ? clampInt(savedGlowRadius, 2, 24)
        : DEFAULT_CONFIG.glowCircle.glowRadiusPx;
    glowCircleGlowRadiusRange.value = String(glowRadius);
    if (glowCircleGlowRadiusValue) glowCircleGlowRadiusValue.textContent = String(glowRadius);
  }

  const savedGlowIntensity = readWindowStorageString(window.localStorage, v, "glowCircleGlowIntensity");
  if (glowCircleGlowIntensityRange) {
    const glowIntensity =
      savedGlowIntensity != null && savedGlowIntensity !== ""
        ? clampInt(savedGlowIntensity, 0, 100)
        : DEFAULT_CONFIG.glowCircle.glowIntensityPercent;
    glowCircleGlowIntensityRange.value = String(glowIntensity);
    if (glowCircleGlowIntensityValue) glowCircleGlowIntensityValue.textContent = String(glowIntensity);
  }

  const savedRingRadius = readWindowStorageString(window.localStorage, v, "glowCircleRingRadius");
  if (glowCircleRingRadiusRange) {
    const ringRadius =
      savedRingRadius != null && savedRingRadius !== ""
        ? clampInt(savedRingRadius, 10, 85)
        : DEFAULT_CONFIG.glowCircle.ringRadiusPercent;
    glowCircleRingRadiusRange.value = String(ringRadius);
    if (glowCircleRingRadiusValue) glowCircleRingRadiusValue.textContent = String(ringRadius);
  }

  const savedRotation = readWindowStorageString(window.localStorage, v, "glowCircleRotation");
  if (glowCircleRotationRange) {
    const rotation =
      savedRotation != null && savedRotation !== ""
        ? clampInt(savedRotation, -180, 180)
        : DEFAULT_CONFIG.glowCircle.rotationOffsetDeg;
    glowCircleRotationRange.value = String(rotation);
    if (glowCircleRotationValue) glowCircleRotationValue.textContent = String(rotation);
  }

  if (glowCircleClockwiseToggle) {
    glowCircleClockwiseToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "glowCircleClockwise"),
      DEFAULT_CONFIG.glowCircle.clockwise,
    );
  }
}

function readRadialShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "radialShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncRadialShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(radialGainRange?.value, 10, 150),
    smoothPercent: clampInt(radialSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(radialSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(radialFallEaseRange?.value, 0, 100),
  };
  if (radialGainValue) radialGainValue.textContent = String(config.gainPercent);
  if (radialSmoothValue) radialSmoothValue.textContent = String(config.smoothPercent);
  if (radialSoftClipValue) radialSoftClipValue.textContent = String(config.softClipPercent);
  if (radialFallEaseValue) radialFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "radialShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-radial-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步圆形频谱参数失败：${String(err)}`;
  }
}

function applyRadialFormFromStorage(v) {
  const sg = readRadialShapeConfig(v) ?? { ...DEFAULT_CONFIG.radial.shape };
  if (radialGainRange) radialGainRange.value = String(sg.gainPercent);
  if (radialSmoothRange) radialSmoothRange.value = String(sg.smoothPercent);
  if (radialSoftClipRange) radialSoftClipRange.value = String(sg.softClipPercent);
  if (radialFallEaseRange) radialFallEaseRange.value = String(sg.fallEasePercent);
  if (radialGainValue) radialGainValue.textContent = String(sg.gainPercent);
  if (radialSmoothValue) radialSmoothValue.textContent = String(sg.smoothPercent);
  if (radialSoftClipValue) radialSoftClipValue.textContent = String(sg.softClipPercent);
  if (radialFallEaseValue) radialFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "radialColor");
  if (radialBarColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    radialBarColor.value = savedColor.toLowerCase();
  } else if (radialBarColor) {
    radialBarColor.value = DEFAULT_CONFIG.radial.barColor;
  }

  const savedInner = readWindowStorageString(window.localStorage, v, "radialInnerRadius");
  if (radialInnerRadiusRange) {
    const innerPercent =
      savedInner != null && savedInner !== ""
        ? clampInt(savedInner, 0, 80)
        : DEFAULT_CONFIG.radial.innerRadiusPercent;
    radialInnerRadiusRange.value = String(innerPercent);
    if (radialInnerRadiusValue) radialInnerRadiusValue.textContent = String(innerPercent);
  }

  const savedOuter = readWindowStorageString(window.localStorage, v, "radialOuterRadius");
  if (radialOuterRadiusRange) {
    const outerPercent =
      savedOuter != null && savedOuter !== ""
        ? clampInt(savedOuter, 5, 95)
        : DEFAULT_CONFIG.radial.outerRadiusPercent;
    radialOuterRadiusRange.value = String(outerPercent);
    if (radialOuterRadiusValue) radialOuterRadiusValue.textContent = String(outerPercent);
  }

  const savedThickness = readWindowStorageString(window.localStorage, v, "radialBarThickness");
  if (radialBarThicknessRange) {
    const thicknessPercent =
      savedThickness != null && savedThickness !== ""
        ? clampInt(savedThickness, 10, 100)
        : DEFAULT_CONFIG.radial.barThicknessPercent;
    radialBarThicknessRange.value = String(thicknessPercent);
    if (radialBarThicknessValue) radialBarThicknessValue.textContent = String(thicknessPercent);
  }

  const savedRotation = readWindowStorageString(window.localStorage, v, "radialRotation");
  if (radialRotationRange) {
    const rotationDeg =
      savedRotation != null && savedRotation !== ""
        ? clampInt(savedRotation, -180, 180)
        : DEFAULT_CONFIG.radial.rotationOffsetDeg;
    radialRotationRange.value = String(rotationDeg);
    if (radialRotationValue) radialRotationValue.textContent = String(rotationDeg);
  }

  if (radialMirrorToggle) {
    radialMirrorToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "radialMirror"),
      DEFAULT_CONFIG.radial.mirrorEnabled,
    );
  }
  if (radialClockwiseToggle) {
    radialClockwiseToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "radialClockwise"),
      DEFAULT_CONFIG.radial.clockwise,
    );
  }
}

function readWaterfallShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "waterfallShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncWaterfallShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(waterfallGainRange?.value, 10, 150),
    smoothPercent: clampInt(waterfallSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(waterfallSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(waterfallFallEaseRange?.value, 0, 100),
  };
  if (waterfallGainValue) waterfallGainValue.textContent = String(config.gainPercent);
  if (waterfallSmoothValue) waterfallSmoothValue.textContent = String(config.smoothPercent);
  if (waterfallSoftClipValue) waterfallSoftClipValue.textContent = String(config.softClipPercent);
  if (waterfallFallEaseValue) waterfallFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "waterfallShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-waterfall-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步瀑布频谱参数失败：${String(err)}`;
  }
}

function applyWaterfallFormFromStorage(v) {
  const sg = readWaterfallShapeConfig(v) ?? { ...DEFAULT_CONFIG.waterfall.shape };
  if (waterfallGainRange) waterfallGainRange.value = String(sg.gainPercent);
  if (waterfallSmoothRange) waterfallSmoothRange.value = String(sg.smoothPercent);
  if (waterfallSoftClipRange) waterfallSoftClipRange.value = String(sg.softClipPercent);
  if (waterfallFallEaseRange) waterfallFallEaseRange.value = String(sg.fallEasePercent);
  if (waterfallGainValue) waterfallGainValue.textContent = String(sg.gainPercent);
  if (waterfallSmoothValue) waterfallSmoothValue.textContent = String(sg.smoothPercent);
  if (waterfallSoftClipValue) waterfallSoftClipValue.textContent = String(sg.softClipPercent);
  if (waterfallFallEaseValue) waterfallFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColorLow = readWindowStorageString(window.localStorage, v, "waterfallColorLow");
  if (waterfallColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    waterfallColorLow.value = savedColorLow.toLowerCase();
  } else if (waterfallColorLow) {
    waterfallColorLow.value = DEFAULT_CONFIG.waterfall.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "waterfallColorHigh");
  if (waterfallColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    waterfallColorHigh.value = savedColorHigh.toLowerCase();
  } else if (waterfallColorHigh) {
    waterfallColorHigh.value = DEFAULT_CONFIG.waterfall.colorHigh;
  }

  const savedHistoryRows = readWindowStorageString(window.localStorage, v, "waterfallHistoryRows");
  if (waterfallHistoryRowsRange) {
    const historyRows =
      savedHistoryRows != null && savedHistoryRows !== ""
        ? clampInt(savedHistoryRows, 16, 128)
        : DEFAULT_CONFIG.waterfall.historyRows;
    waterfallHistoryRowsRange.value = String(historyRows);
    if (waterfallHistoryRowsValue) waterfallHistoryRowsValue.textContent = String(historyRows);
  }

  const savedScroll = readWindowStorageString(window.localStorage, v, "waterfallScrollEveryNFrames");
  if (waterfallScrollRange) {
    const scrollEveryNFrames =
      savedScroll != null && savedScroll !== ""
        ? clampInt(savedScroll, 1, 8)
        : DEFAULT_CONFIG.waterfall.scrollEveryNFrames;
    waterfallScrollRange.value = String(scrollEveryNFrames);
    if (waterfallScrollValue) waterfallScrollValue.textContent = String(scrollEveryNFrames);
  }

  const savedRowGap = readWindowStorageString(window.localStorage, v, "waterfallRowGap");
  if (waterfallRowGapRange) {
    const rowGapPercent =
      savedRowGap != null && savedRowGap !== ""
        ? clampInt(savedRowGap, 0, 50)
        : DEFAULT_CONFIG.waterfall.rowGapPercent;
    waterfallRowGapRange.value = String(rowGapPercent);
    if (waterfallRowGapValue) waterfallRowGapValue.textContent = String(rowGapPercent);
  }
}

function readDotRingShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "dotRingShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncDotRingShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(dotRingGainRange?.value, 10, 150),
    smoothPercent: clampInt(dotRingSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(dotRingSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(dotRingFallEaseRange?.value, 0, 100),
  };
  if (dotRingGainValue) dotRingGainValue.textContent = String(config.gainPercent);
  if (dotRingSmoothValue) dotRingSmoothValue.textContent = String(config.smoothPercent);
  if (dotRingSoftClipValue) dotRingSoftClipValue.textContent = String(config.softClipPercent);
  if (dotRingFallEaseValue) dotRingFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "dotRingShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-dot-ring-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步环形圆点参数失败：${String(err)}`;
  }
}

function applyDotRingFormFromStorage(v) {
  const sg = readDotRingShapeConfig(v) ?? { ...DEFAULT_CONFIG.dotRing.shape };
  if (dotRingGainRange) dotRingGainRange.value = String(sg.gainPercent);
  if (dotRingSmoothRange) dotRingSmoothRange.value = String(sg.smoothPercent);
  if (dotRingSoftClipRange) dotRingSoftClipRange.value = String(sg.softClipPercent);
  if (dotRingFallEaseRange) dotRingFallEaseRange.value = String(sg.fallEasePercent);
  if (dotRingGainValue) dotRingGainValue.textContent = String(sg.gainPercent);
  if (dotRingSmoothValue) dotRingSmoothValue.textContent = String(sg.smoothPercent);
  if (dotRingSoftClipValue) dotRingSoftClipValue.textContent = String(sg.softClipPercent);
  if (dotRingFallEaseValue) dotRingFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "dotRingColor");
  if (dotRingDotColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    dotRingDotColor.value = savedColor.toLowerCase();
  } else if (dotRingDotColor) {
    dotRingDotColor.value = DEFAULT_CONFIG.dotRing.dotColor;
  }

  const savedRadius = readWindowStorageString(window.localStorage, v, "dotRingRadius");
  if (dotRingRadiusRange) {
    const radiusPercent =
      savedRadius != null && savedRadius !== ""
        ? clampInt(savedRadius, 10, 95)
        : DEFAULT_CONFIG.dotRing.ringRadiusPercent;
    dotRingRadiusRange.value = String(radiusPercent);
    if (dotRingRadiusValue) dotRingRadiusValue.textContent = String(radiusPercent);
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "dotRingCount");
  if (dotRingCountRange) {
    const dotCount =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 4, 128)
        : DEFAULT_CONFIG.dotRing.dotCount;
    dotRingCountRange.value = String(dotCount);
    if (dotRingCountValue) dotRingCountValue.textContent = String(dotCount);
  }

  const savedSize = readWindowStorageString(window.localStorage, v, "dotRingSize");
  if (dotRingSizeRange) {
    const dotSizePx =
      savedSize != null && savedSize !== ""
        ? clampInt(savedSize, 2, 24)
        : DEFAULT_CONFIG.dotRing.dotSizePx;
    dotRingSizeRange.value = String(dotSizePx);
    if (dotRingSizeValue) dotRingSizeValue.textContent = String(dotSizePx);
  }

  if (dotRingPulseToggle) {
    dotRingPulseToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "dotRingPulse"),
      DEFAULT_CONFIG.dotRing.pulseEnabled,
    );
  }
}

function readObliqueBarShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "obliqueBarShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncObliqueBarShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(obliqueBarGainRange?.value, 10, 150),
    smoothPercent: clampInt(obliqueBarSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(obliqueBarSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(obliqueBarFallEaseRange?.value, 0, 100),
  };
  if (obliqueBarGainValue) obliqueBarGainValue.textContent = String(config.gainPercent);
  if (obliqueBarSmoothValue) obliqueBarSmoothValue.textContent = String(config.smoothPercent);
  if (obliqueBarSoftClipValue) obliqueBarSoftClipValue.textContent = String(config.softClipPercent);
  if (obliqueBarFallEaseValue) obliqueBarFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "obliqueBarShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-oblique-bar-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步斜透视参数失败：${String(err)}`;
  }
}

function readDepthLayersShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "depthLayersShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncDepthLayersShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(depthLayersGainRange?.value, 10, 150),
    smoothPercent: clampInt(depthLayersSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(depthLayersSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(depthLayersFallEaseRange?.value, 0, 100),
  };
  if (depthLayersGainValue) depthLayersGainValue.textContent = String(config.gainPercent);
  if (depthLayersSmoothValue) depthLayersSmoothValue.textContent = String(config.smoothPercent);
  if (depthLayersSoftClipValue) depthLayersSoftClipValue.textContent = String(config.softClipPercent);
  if (depthLayersFallEaseValue) depthLayersFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "depthLayersShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-depth-layers-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步景深参数失败：${String(err)}`;
  }
}

function readIsometricSkylineShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "isometricSkylineShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncIsometricSkylineShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(isometricSkylineGainRange?.value, 10, 150),
    smoothPercent: clampInt(isometricSkylineSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(isometricSkylineSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(isometricSkylineFallEaseRange?.value, 0, 100),
  };
  if (isometricSkylineGainValue) isometricSkylineGainValue.textContent = String(config.gainPercent);
  if (isometricSkylineSmoothValue) isometricSkylineSmoothValue.textContent = String(config.smoothPercent);
  if (isometricSkylineSoftClipValue) isometricSkylineSoftClipValue.textContent = String(config.softClipPercent);
  if (isometricSkylineFallEaseValue) isometricSkylineFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "isometricSkylineShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-isometric-skyline-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步天际线参数失败：${String(err)}`;
  }
}

function applyIsometricSkylineFormFromStorage(v) {
  const sg = readIsometricSkylineShapeConfig(v) ?? { ...DEFAULT_CONFIG.isometricSkyline.shape };
  if (isometricSkylineGainRange) isometricSkylineGainRange.value = String(sg.gainPercent);
  if (isometricSkylineSmoothRange) isometricSkylineSmoothRange.value = String(sg.smoothPercent);
  if (isometricSkylineSoftClipRange) isometricSkylineSoftClipRange.value = String(sg.softClipPercent);
  if (isometricSkylineFallEaseRange) isometricSkylineFallEaseRange.value = String(sg.fallEasePercent);
  if (isometricSkylineGainValue) isometricSkylineGainValue.textContent = String(sg.gainPercent);
  if (isometricSkylineSmoothValue) isometricSkylineSmoothValue.textContent = String(sg.smoothPercent);
  if (isometricSkylineSoftClipValue) isometricSkylineSoftClipValue.textContent = String(sg.softClipPercent);
  if (isometricSkylineFallEaseValue) isometricSkylineFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedFaceTop = readWindowStorageString(window.localStorage, v, "isometricSkylineFaceTop");
  if (isometricSkylineFaceTopColor && savedFaceTop && /^#[0-9A-Fa-f]{6}$/.test(savedFaceTop)) {
    isometricSkylineFaceTopColor.value = savedFaceTop.toLowerCase();
  } else if (isometricSkylineFaceTopColor) {
    isometricSkylineFaceTopColor.value = DEFAULT_CONFIG.isometricSkyline.faceTopColor;
  }

  const savedFaceLeft = readWindowStorageString(window.localStorage, v, "isometricSkylineFaceLeft");
  if (isometricSkylineFaceLeftColor && savedFaceLeft && /^#[0-9A-Fa-f]{6}$/.test(savedFaceLeft)) {
    isometricSkylineFaceLeftColor.value = savedFaceLeft.toLowerCase();
  } else if (isometricSkylineFaceLeftColor) {
    isometricSkylineFaceLeftColor.value = DEFAULT_CONFIG.isometricSkyline.faceLeftColor;
  }

  const savedFaceRight = readWindowStorageString(window.localStorage, v, "isometricSkylineFaceRight");
  if (isometricSkylineFaceRightColor && savedFaceRight && /^#[0-9A-Fa-f]{6}$/.test(savedFaceRight)) {
    isometricSkylineFaceRightColor.value = savedFaceRight.toLowerCase();
  } else if (isometricSkylineFaceRightColor) {
    isometricSkylineFaceRightColor.value = DEFAULT_CONFIG.isometricSkyline.faceRightColor;
  }

  const savedWidth = readWindowStorageString(window.localStorage, v, "isometricSkylineBuildingWidth");
  if (isometricSkylineBuildingWidthRange) {
    const buildingWidthPx =
      savedWidth != null && savedWidth !== ""
        ? clampInt(savedWidth, 4, 100)
        : DEFAULT_CONFIG.isometricSkyline.buildingWidthPx;
    isometricSkylineBuildingWidthRange.value = String(buildingWidthPx);
    if (isometricSkylineBuildingWidthValue) isometricSkylineBuildingWidthValue.textContent = String(buildingWidthPx);
  }

  const savedGap = readWindowStorageString(window.localStorage, v, "isometricSkylineBuildingGap");
  if (isometricSkylineBuildingGapRange) {
    const buildingGapPx =
      savedGap != null && savedGap !== ""
        ? clampInt(savedGap, 0, 12)
        : DEFAULT_CONFIG.isometricSkyline.buildingGapPx;
    isometricSkylineBuildingGapRange.value = String(buildingGapPx);
    if (isometricSkylineBuildingGapValue) isometricSkylineBuildingGapValue.textContent = String(buildingGapPx);
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "isometricSkylineBuildingCount");
  if (isometricSkylineBuildingCountRange) {
    const displayBuildingCount =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 16, 96)
        : DEFAULT_CONFIG.isometricSkyline.displayBuildingCount;
    isometricSkylineBuildingCountRange.value = String(displayBuildingCount);
    if (isometricSkylineBuildingCountValue) isometricSkylineBuildingCountValue.textContent = String(displayBuildingCount);
  }

  const savedBaseline = readWindowStorageString(window.localStorage, v, "isometricSkylineBaseline");
  if (isometricSkylineBaselineRange) {
    const skylineBaselinePercent =
      savedBaseline != null && savedBaseline !== ""
        ? clampInt(savedBaseline, 5, 40)
        : DEFAULT_CONFIG.isometricSkyline.skylineBaselinePercent;
    isometricSkylineBaselineRange.value = String(skylineBaselinePercent);
    if (isometricSkylineBaselineValue) isometricSkylineBaselineValue.textContent = String(skylineBaselinePercent);
  }

  if (isometricSkylineGroundPlaneToggle) {
    isometricSkylineGroundPlaneToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "isometricSkylineGroundPlane"),
      DEFAULT_CONFIG.isometricSkyline.showGroundPlane,
    );
  }
}

function formatRing3dRadiusDisplay(value) {
  return (Math.round(Number(value) * 100) / 100).toFixed(2);
}

function readRing3dShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "ring3dShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncRing3dShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(ring3dGainRange?.value, 10, 150),
    smoothPercent: clampInt(ring3dSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(ring3dSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(ring3dFallEaseRange?.value, 0, 100),
  };
  if (ring3dGainValue) ring3dGainValue.textContent = String(config.gainPercent);
  if (ring3dSmoothValue) ring3dSmoothValue.textContent = String(config.smoothPercent);
  if (ring3dSoftClipValue) ring3dSoftClipValue.textContent = String(config.softClipPercent);
  if (ring3dFallEaseValue) ring3dFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dShape", JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("waveform-ring3d-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步 3D 圆环参数失败：${String(err)}`;
  }
}

function applyRing3dFormFromStorage(v) {
  const sg = readRing3dShapeConfig(v) ?? { ...DEFAULT_CONFIG.ring3d.shape };
  if (ring3dGainRange) ring3dGainRange.value = String(sg.gainPercent);
  if (ring3dSmoothRange) ring3dSmoothRange.value = String(sg.smoothPercent);
  if (ring3dSoftClipRange) ring3dSoftClipRange.value = String(sg.softClipPercent);
  if (ring3dFallEaseRange) ring3dFallEaseRange.value = String(sg.fallEasePercent);
  if (ring3dGainValue) ring3dGainValue.textContent = String(sg.gainPercent);
  if (ring3dSmoothValue) ring3dSmoothValue.textContent = String(sg.smoothPercent);
  if (ring3dSoftClipValue) ring3dSoftClipValue.textContent = String(sg.softClipPercent);
  if (ring3dFallEaseValue) ring3dFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "ring3dColor");
  if (ring3dColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    ring3dColor.value = savedColor.toLowerCase();
  } else if (ring3dColor) {
    ring3dColor.value = DEFAULT_CONFIG.ring3d.barColor;
  }

  const savedInner = readWindowStorageString(window.localStorage, v, "ring3dInnerRadius");
  if (ring3dInnerRadiusRange) {
    const innerRadius =
      savedInner != null && savedInner !== ""
        ? Math.min(0.8, Math.max(0.1, Number(savedInner)))
        : DEFAULT_CONFIG.ring3d.innerRadius;
    ring3dInnerRadiusRange.value = String(Math.round(innerRadius * 100));
    if (ring3dInnerRadiusValue) ring3dInnerRadiusValue.textContent = formatRing3dRadiusDisplay(innerRadius);
  }

  const savedOuter = readWindowStorageString(window.localStorage, v, "ring3dOuterRadius");
  if (ring3dOuterRadiusRange) {
    const outerRadius =
      savedOuter != null && savedOuter !== ""
        ? Math.min(1.0, Math.max(0.15, Number(savedOuter)))
        : DEFAULT_CONFIG.ring3d.outerRadius;
    ring3dOuterRadiusRange.value = String(Math.round(outerRadius * 100));
    if (ring3dOuterRadiusValue) ring3dOuterRadiusValue.textContent = formatRing3dRadiusDisplay(outerRadius);
  }

  const savedHeightScale = readWindowStorageString(window.localStorage, v, "ring3dBarHeightScale");
  if (ring3dBarHeightScaleRange) {
    const barHeightScale =
      savedHeightScale != null && savedHeightScale !== ""
        ? Math.min(1.5, Math.max(0.1, Number(savedHeightScale)))
        : DEFAULT_CONFIG.ring3d.barHeightScale;
    ring3dBarHeightScaleRange.value = String(Math.round(barHeightScale * 100));
    if (ring3dBarHeightScaleValue) ring3dBarHeightScaleValue.textContent = formatRing3dRadiusDisplay(barHeightScale);
  }

  const savedThickness = readWindowStorageString(window.localStorage, v, "ring3dBarThicknessDeg");
  if (ring3dBarThicknessRange) {
    const barThicknessDeg =
      savedThickness != null && savedThickness !== ""
        ? clampInt(savedThickness, 1, 12)
        : DEFAULT_CONFIG.ring3d.barThicknessDeg;
    ring3dBarThicknessRange.value = String(barThicknessDeg);
    if (ring3dBarThicknessValue) ring3dBarThicknessValue.textContent = String(barThicknessDeg);
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "ring3dDisplayCount");
  if (ring3dDisplayCountRange) {
    const displayBarCount =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 8, 128)
        : DEFAULT_CONFIG.ring3d.displayBarCount;
    ring3dDisplayCountRange.value = String(displayBarCount);
    if (ring3dDisplayCountValue) ring3dDisplayCountValue.textContent = String(displayBarCount);
  }

  if (ring3dWireframeToggle) {
    ring3dWireframeToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "ring3dWireframe"),
      DEFAULT_CONFIG.ring3d.wireframeEnabled,
    );
  }
  if (ring3dFillToggle) {
    ring3dFillToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "ring3dFill"),
      DEFAULT_CONFIG.ring3d.fillEnabled,
    );
  }
  if (ring3dAutoRotateToggle) {
    ring3dAutoRotateToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "ring3dAutoRotate"),
      DEFAULT_CONFIG.ring3d.autoRotateEnabled,
    );
  }

  const savedRotateSpeed = readWindowStorageString(window.localStorage, v, "ring3dAutoRotateSpeed");
  if (ring3dAutoRotateSpeedRange) {
    const autoRotateSpeedDeg =
      savedRotateSpeed != null && savedRotateSpeed !== ""
        ? clampInt(savedRotateSpeed, 0, 20)
        : DEFAULT_CONFIG.ring3d.autoRotateSpeedDeg;
    ring3dAutoRotateSpeedRange.value = String(autoRotateSpeedDeg);
    if (ring3dAutoRotateSpeedValue) ring3dAutoRotateSpeedValue.textContent = String(autoRotateSpeedDeg);
  }

  const savedCameraDistance = readWindowStorageString(window.localStorage, v, "ring3dCameraDistance");
  if (ring3dCameraDistanceRange) {
    const cameraDistance =
      savedCameraDistance != null && savedCameraDistance !== ""
        ? Math.min(4.5, Math.max(1.2, Number(savedCameraDistance)))
        : DEFAULT_CONFIG.ring3d.cameraDistance;
    ring3dCameraDistanceRange.value = String(Math.round(cameraDistance * 10));
    if (ring3dCameraDistanceValue) ring3dCameraDistanceValue.textContent = formatRing3dRadiusDisplay(cameraDistance);
  }

  const savedCameraFov = readWindowStorageString(window.localStorage, v, "ring3dCameraFov");
  if (ring3dCameraFovRange) {
    const cameraFovDeg =
      savedCameraFov != null && savedCameraFov !== ""
        ? clampInt(savedCameraFov, 30, 75)
        : DEFAULT_CONFIG.ring3d.cameraFovDeg;
    ring3dCameraFovRange.value = String(cameraFovDeg);
    if (ring3dCameraFovValue) ring3dCameraFovValue.textContent = String(cameraFovDeg);
  }

  if (ring3dBreathePeakToggle) {
    ring3dBreathePeakToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "ring3dBreathePeak"),
      DEFAULT_CONFIG.ring3d.breatheWithPeak,
    );
  }
}

function readTerrain3dShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      gainPercent: clampInt(parsed?.gainPercent, 10, 150),
      smoothPercent: clampInt(parsed?.smoothPercent, 0, 400),
      softClipPercent: clampInt(parsed?.softClipPercent, 0, 100),
      fallEasePercent: clampInt(parsed?.fallEasePercent, 0, 100),
    };
  } catch {
    return null;
  }
}

async function syncTerrain3dShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(terrain3dGainRange?.value, 10, 150),
    smoothPercent: clampInt(terrain3dSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(terrain3dSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(terrain3dFallEaseRange?.value, 0, 100),
  };
  if (terrain3dGainValue) terrain3dGainValue.textContent = String(config.gainPercent);
  if (terrain3dSmoothValue) terrain3dSmoothValue.textContent = String(config.smoothPercent);
  if (terrain3dSoftClipValue) terrain3dSoftClipValue.textContent = String(config.softClipPercent);
  if (terrain3dFallEaseValue) terrain3dFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-terrain3d-shape-config", config);
  } catch {
    // ignore emit failures
  }
}

function applyTerrain3dFormFromStorage(v) {
  const sg = readTerrain3dShapeConfig(v) ?? { ...DEFAULT_CONFIG.terrain3d.shape };
  if (terrain3dGainRange) terrain3dGainRange.value = String(sg.gainPercent);
  if (terrain3dSmoothRange) terrain3dSmoothRange.value = String(sg.smoothPercent);
  if (terrain3dSoftClipRange) terrain3dSoftClipRange.value = String(sg.softClipPercent);
  if (terrain3dFallEaseRange) terrain3dFallEaseRange.value = String(sg.fallEasePercent);
  if (terrain3dGainValue) terrain3dGainValue.textContent = String(sg.gainPercent);
  if (terrain3dSmoothValue) terrain3dSmoothValue.textContent = String(sg.smoothPercent);
  if (terrain3dSoftClipValue) terrain3dSoftClipValue.textContent = String(sg.softClipPercent);
  if (terrain3dFallEaseValue) terrain3dFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColorLow = readWindowStorageString(window.localStorage, v, "terrain3dColorLow");
  if (terrain3dColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    terrain3dColorLow.value = savedColorLow.toLowerCase();
  } else if (terrain3dColorLow) {
    terrain3dColorLow.value = DEFAULT_CONFIG.terrain3d.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "terrain3dColorHigh");
  if (terrain3dColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    terrain3dColorHigh.value = savedColorHigh.toLowerCase();
  } else if (terrain3dColorHigh) {
    terrain3dColorHigh.value = DEFAULT_CONFIG.terrain3d.colorHigh;
  }

  const savedWireframeColor = readWindowStorageString(window.localStorage, v, "terrain3dWireframeColor");
  if (terrain3dWireframeColor && savedWireframeColor && /^#[0-9A-Fa-f]{6}$/.test(savedWireframeColor)) {
    terrain3dWireframeColor.value = savedWireframeColor.toLowerCase();
  } else if (terrain3dWireframeColor) {
    terrain3dWireframeColor.value = DEFAULT_CONFIG.terrain3d.wireframeColor;
  }

  const savedCols = readWindowStorageString(window.localStorage, v, "terrain3dGridCols");
  if (terrain3dGridColsRange) {
    const gridCols =
      savedCols != null && savedCols !== ""
        ? clampInt(savedCols, 16, 96)
        : DEFAULT_CONFIG.terrain3d.gridCols;
    terrain3dGridColsRange.value = String(gridCols);
    if (terrain3dGridColsValue) terrain3dGridColsValue.textContent = String(gridCols);
  }

  const savedRows = readWindowStorageString(window.localStorage, v, "terrain3dGridRows");
  if (terrain3dGridRowsRange) {
    const gridRows =
      savedRows != null && savedRows !== ""
        ? clampInt(savedRows, 16, 96)
        : DEFAULT_CONFIG.terrain3d.gridRows;
    terrain3dGridRowsRange.value = String(gridRows);
    if (terrain3dGridRowsValue) terrain3dGridRowsValue.textContent = String(gridRows);
  }

  const savedScroll = readWindowStorageString(window.localStorage, v, "terrain3dScrollEveryNFrames");
  if (terrain3dScrollRange) {
    const scrollEveryNFrames =
      savedScroll != null && savedScroll !== ""
        ? clampInt(savedScroll, 1, 8)
        : DEFAULT_CONFIG.terrain3d.scrollEveryNFrames;
    terrain3dScrollRange.value = String(scrollEveryNFrames);
    if (terrain3dScrollValue) terrain3dScrollValue.textContent = String(scrollEveryNFrames);
  }

  if (terrain3dWireframeToggle) {
    terrain3dWireframeToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "terrain3dWireframe"),
      DEFAULT_CONFIG.terrain3d.wireframeEnabled,
    );
  }
  if (terrain3dFillToggle) {
    terrain3dFillToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "terrain3dFill"),
      DEFAULT_CONFIG.terrain3d.fillEnabled,
    );
  }

  const savedHeightScale = readWindowStorageString(window.localStorage, v, "terrain3dHeightScale");
  if (terrain3dHeightScaleRange) {
    const heightScale =
      savedHeightScale != null && savedHeightScale !== ""
        ? Math.min(1.2, Math.max(0.05, Number(savedHeightScale)))
        : DEFAULT_CONFIG.terrain3d.terrainHeightScale;
    terrain3dHeightScaleRange.value = String(Math.round(heightScale * 100));
    if (terrain3dHeightScaleValue) terrain3dHeightScaleValue.textContent = formatRing3dRadiusDisplay(heightScale);
  }

  const savedPitch = readWindowStorageString(window.localStorage, v, "terrain3dCameraPitch");
  if (terrain3dCameraPitchRange) {
    const cameraPitchDeg =
      savedPitch != null && savedPitch !== ""
        ? clampInt(savedPitch, 30, 75)
        : DEFAULT_CONFIG.terrain3d.cameraPitchDeg;
    terrain3dCameraPitchRange.value = String(cameraPitchDeg);
    if (terrain3dCameraPitchValue) terrain3dCameraPitchValue.textContent = String(cameraPitchDeg);
  }

  const savedCameraDistance = readWindowStorageString(window.localStorage, v, "terrain3dCameraDistance");
  if (terrain3dCameraDistanceRange) {
    const cameraDistance =
      savedCameraDistance != null && savedCameraDistance !== ""
        ? Math.min(4.5, Math.max(1.2, Number(savedCameraDistance)))
        : DEFAULT_CONFIG.terrain3d.cameraDistance;
    terrain3dCameraDistanceRange.value = String(Math.round(cameraDistance * 10));
    if (terrain3dCameraDistanceValue) {
      terrain3dCameraDistanceValue.textContent = formatRing3dRadiusDisplay(cameraDistance);
    }
  }

  if (terrain3dAutoScrollToggle) {
    terrain3dAutoScrollToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "terrain3dAutoScroll"),
      DEFAULT_CONFIG.terrain3d.autoScrollEnabled,
    );
  }
}

function applyDepthLayersFormFromStorage(v) {
  const sg = readDepthLayersShapeConfig(v) ?? { ...DEFAULT_CONFIG.depthLayers.shape };
  if (depthLayersGainRange) depthLayersGainRange.value = String(sg.gainPercent);
  if (depthLayersSmoothRange) depthLayersSmoothRange.value = String(sg.smoothPercent);
  if (depthLayersSoftClipRange) depthLayersSoftClipRange.value = String(sg.softClipPercent);
  if (depthLayersFallEaseRange) depthLayersFallEaseRange.value = String(sg.fallEasePercent);
  if (depthLayersGainValue) depthLayersGainValue.textContent = String(sg.gainPercent);
  if (depthLayersSmoothValue) depthLayersSmoothValue.textContent = String(sg.smoothPercent);
  if (depthLayersSoftClipValue) depthLayersSoftClipValue.textContent = String(sg.softClipPercent);
  if (depthLayersFallEaseValue) depthLayersFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "depthLayersColor");
  if (depthLayersColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    depthLayersColor.value = savedColor.toLowerCase();
  } else if (depthLayersColor) {
    depthLayersColor.value = DEFAULT_CONFIG.depthLayers.color;
  }

  const savedColorFar = readWindowStorageString(window.localStorage, v, "depthLayersColorFar");
  if (depthLayersColorFar && savedColorFar && /^#[0-9A-Fa-f]{6}$/.test(savedColorFar)) {
    depthLayersColorFar.value = savedColorFar.toLowerCase();
  } else if (depthLayersColorFar) {
    depthLayersColorFar.value = DEFAULT_CONFIG.depthLayers.colorFar;
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "depthLayersCount");
  if (depthLayersCountRange) {
    const layerCount =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2, 6)
        : DEFAULT_CONFIG.depthLayers.layerCount;
    depthLayersCountRange.value = String(layerCount);
    if (depthLayersCountValue) depthLayersCountValue.textContent = String(layerCount);
  }

  const savedSpacing = readWindowStorageString(window.localStorage, v, "depthLayersSpacing");
  if (depthLayersSpacingRange) {
    const layerSpacingPx =
      savedSpacing != null && savedSpacing !== ""
        ? clampInt(savedSpacing, 0, 24)
        : DEFAULT_CONFIG.depthLayers.layerSpacingPx;
    depthLayersSpacingRange.value = String(layerSpacingPx);
    if (depthLayersSpacingValue) depthLayersSpacingValue.textContent = String(layerSpacingPx);
  }

  const savedFarScale = readWindowStorageString(window.localStorage, v, "depthLayersFarScale");
  if (depthLayersFarScaleRange) {
    const farScalePercent =
      savedFarScale != null && savedFarScale !== ""
        ? clampInt(savedFarScale, 50, 90)
        : DEFAULT_CONFIG.depthLayers.farScalePercent;
    depthLayersFarScaleRange.value = String(farScalePercent);
    if (depthLayersFarScaleValue) depthLayersFarScaleValue.textContent = String(farScalePercent);
  }

  const savedFarAlpha = readWindowStorageString(window.localStorage, v, "depthLayersFarAlpha");
  if (depthLayersFarAlphaRange) {
    const farAlphaPercent =
      savedFarAlpha != null && savedFarAlpha !== ""
        ? clampInt(savedFarAlpha, 0, 100)
        : DEFAULT_CONFIG.depthLayers.farAlphaPercent;
    depthLayersFarAlphaRange.value = String(farAlphaPercent);
    if (depthLayersFarAlphaValue) depthLayersFarAlphaValue.textContent = String(farAlphaPercent);
  }

  if (depthLayersBassFrontToggle) {
    depthLayersBassFrontToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "depthLayersBassFront"),
      DEFAULT_CONFIG.depthLayers.bassFrontEnabled,
    );
  }

  const savedLineWidth = readWindowStorageString(window.localStorage, v, "depthLayersLineWidth");
  if (depthLayersLineWidthRange) {
    const lineWidthPx =
      savedLineWidth != null && savedLineWidth !== ""
        ? clampInt(savedLineWidth, 1, 12)
        : DEFAULT_CONFIG.depthLayers.lineWidthPx;
    depthLayersLineWidthRange.value = String(lineWidthPx);
    if (depthLayersLineWidthValue) depthLayersLineWidthValue.textContent = String(lineWidthPx);
  }

  const savedRenderStyle = readWindowStorageString(window.localStorage, v, "depthLayersRenderStyle");
  if (depthLayersRenderStyleSelect) {
    depthLayersRenderStyleSelect.value = normalizeDepthLayersRenderStyle(
      savedRenderStyle,
      DEFAULT_CONFIG.depthLayers.renderStyle,
    );
  }
}

function applyObliqueBarFormFromStorage(v) {
  const sg = readObliqueBarShapeConfig(v) ?? { ...DEFAULT_CONFIG.obliqueBar.shape };
  if (obliqueBarGainRange) obliqueBarGainRange.value = String(sg.gainPercent);
  if (obliqueBarSmoothRange) obliqueBarSmoothRange.value = String(sg.smoothPercent);
  if (obliqueBarSoftClipRange) obliqueBarSoftClipRange.value = String(sg.softClipPercent);
  if (obliqueBarFallEaseRange) obliqueBarFallEaseRange.value = String(sg.fallEasePercent);
  if (obliqueBarGainValue) obliqueBarGainValue.textContent = String(sg.gainPercent);
  if (obliqueBarSmoothValue) obliqueBarSmoothValue.textContent = String(sg.smoothPercent);
  if (obliqueBarSoftClipValue) obliqueBarSoftClipValue.textContent = String(sg.softClipPercent);
  if (obliqueBarFallEaseValue) obliqueBarFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "obliqueBarColor");
  if (obliqueBarColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    obliqueBarColor.value = savedColor.toLowerCase();
  } else if (obliqueBarColor) {
    obliqueBarColor.value = DEFAULT_CONFIG.obliqueBar.barColor;
  }

  const savedColorFar = readWindowStorageString(window.localStorage, v, "obliqueBarColorFar");
  if (obliqueBarColorFar && savedColorFar && /^#[0-9A-Fa-f]{6}$/.test(savedColorFar)) {
    obliqueBarColorFar.value = savedColorFar.toLowerCase();
  } else if (obliqueBarColorFar) {
    obliqueBarColorFar.value = DEFAULT_CONFIG.obliqueBar.barColorFar;
  }

  const savedWidth = readWindowStorageString(window.localStorage, v, "obliqueBarWidth");
  if (obliqueBarWidthRange) {
    const widthPercent =
      savedWidth != null && savedWidth !== ""
        ? clampInt(savedWidth, 20, 100)
        : DEFAULT_CONFIG.obliqueBar.widthPercent;
    obliqueBarWidthRange.value = String(widthPercent);
    if (obliqueBarWidthValue) obliqueBarWidthValue.textContent = String(widthPercent);
  }

  const savedGap = readWindowStorageString(window.localStorage, v, "obliqueBarGap");
  if (obliqueBarGapRange) {
    const gapPercent =
      savedGap != null && savedGap !== ""
        ? clampInt(savedGap, 0, 70)
        : DEFAULT_CONFIG.obliqueBar.gapPercent;
    obliqueBarGapRange.value = String(gapPercent);
    if (obliqueBarGapValue) obliqueBarGapValue.textContent = String(gapPercent);
  }

  const savedHeadroom = readWindowStorageString(window.localStorage, v, "obliqueBarHeadroom");
  if (obliqueBarHeadroomRange) {
    const headroomPercent =
      savedHeadroom != null && savedHeadroom !== ""
        ? clampInt(savedHeadroom, 0, 40)
        : DEFAULT_CONFIG.obliqueBar.headroomPercent;
    obliqueBarHeadroomRange.value = String(headroomPercent);
    if (obliqueBarHeadroomValue) obliqueBarHeadroomValue.textContent = String(headroomPercent);
  }

  const savedTilt = readWindowStorageString(window.localStorage, v, "obliqueBarTilt");
  if (obliqueBarTiltRange) {
    const tiltDeg =
      savedTilt != null && savedTilt !== ""
        ? clampInt(savedTilt, 30, 70)
        : DEFAULT_CONFIG.obliqueBar.tiltDeg;
    obliqueBarTiltRange.value = String(tiltDeg);
    if (obliqueBarTiltValue) obliqueBarTiltValue.textContent = String(tiltDeg);
  }

  const savedDisplayCount = readWindowStorageString(window.localStorage, v, "obliqueBarDisplayCount");
  if (obliqueBarDisplayCountRange) {
    const displayBarCount =
      savedDisplayCount != null && savedDisplayCount !== ""
        ? clampInt(savedDisplayCount, 0, 128)
        : DEFAULT_CONFIG.obliqueBar.displayBarCount;
    obliqueBarDisplayCountRange.value = String(displayBarCount);
    if (obliqueBarDisplayCountValue) {
      obliqueBarDisplayCountValue.textContent = String(displayBarCount);
    }
  }

  if (obliqueBarGroundLineToggle) {
    obliqueBarGroundLineToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "obliqueBarGroundLine"),
      DEFAULT_CONFIG.obliqueBar.showGroundLine,
    );
  }

  if (obliqueBarMirrorToggle) {
    obliqueBarMirrorToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "obliqueBarMirror"),
      DEFAULT_CONFIG.obliqueBar.mirrorEnabled,
    );
  }
}

function applyOscilloscopeFormFromStorage(v) {
  const savedColor = readWindowStorageString(window.localStorage, v, "oscilloscopeColor");
  if (oscilloscopeColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    oscilloscopeColor.value = savedColor.toLowerCase();
  } else if (oscilloscopeColor) {
    oscilloscopeColor.value = DEFAULT_CONFIG.oscilloscope.lineColor;
  }

  const savedWidth = readWindowStorageString(window.localStorage, v, "oscilloscopeLineWidth");
  if (oscilloscopeWidthRange) {
    const lineWidthPx =
      savedWidth != null && savedWidth !== ""
        ? clampInt(savedWidth, 1, 12)
        : DEFAULT_CONFIG.oscilloscope.lineWidthPx;
    oscilloscopeWidthRange.value = String(lineWidthPx);
    if (oscilloscopeWidthValue) oscilloscopeWidthValue.textContent = String(lineWidthPx);
  }

  if (oscilloscopePhosphorToggle) {
    oscilloscopePhosphorToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "oscilloscopePhosphor"),
      DEFAULT_CONFIG.oscilloscope.phosphorEnabled,
    );
  }

  const savedDecay = readWindowStorageString(window.localStorage, v, "oscilloscopePhosphorDecay");
  if (oscilloscopePhosphorDecayRange) {
    const decayPercent =
      savedDecay != null && savedDecay !== ""
        ? clampInt(savedDecay, 10, 95)
        : DEFAULT_CONFIG.oscilloscope.phosphorDecayPercent;
    oscilloscopePhosphorDecayRange.value = String(decayPercent);
    if (oscilloscopePhosphorDecayValue) {
      oscilloscopePhosphorDecayValue.textContent = String(decayPercent);
    }
  }
}

function applyAreaFormFromStorage(v) {
  const sa = readAreaShapeConfig(v) ?? { ...DEFAULT_CONFIG.area.shape };
  if (areaGainRange) areaGainRange.value = String(sa.gainPercent);
  if (areaSmoothRange) areaSmoothRange.value = String(sa.smoothPercent);
  if (areaSoftClipRange) areaSoftClipRange.value = String(sa.softClipPercent);
  if (areaFallEaseRange) areaFallEaseRange.value = String(sa.fallEasePercent);
  if (areaGainValue) areaGainValue.textContent = String(sa.gainPercent);
  if (areaSmoothValue) areaSmoothValue.textContent = String(sa.smoothPercent);
  if (areaSoftClipValue) areaSoftClipValue.textContent = String(sa.softClipPercent);
  if (areaFallEaseValue) areaFallEaseValue.textContent = String(sa.fallEasePercent);

  const savedFillColor = readWindowStorageString(window.localStorage, v, "areaColor");
  if (areaFillColor && savedFillColor && /^#[0-9A-Fa-f]{6}$/.test(savedFillColor)) {
    areaFillColor.value = savedFillColor.toLowerCase();
  } else if (areaFillColor) {
    areaFillColor.value = DEFAULT_CONFIG.area.fillColor;
  }

  const savedLineColor = readWindowStorageString(window.localStorage, v, "areaLineColor");
  if (areaLineColor && savedLineColor && /^#[0-9A-Fa-f]{6}$/.test(savedLineColor)) {
    areaLineColor.value = savedLineColor.toLowerCase();
  } else if (areaLineColor) {
    areaLineColor.value = DEFAULT_CONFIG.area.lineColor;
  }

  const savedFillAlpha = readWindowStorageString(window.localStorage, v, "areaFillAlpha");
  if (areaFillAlphaRange) {
    const alphaPercent =
      savedFillAlpha != null && savedFillAlpha !== ""
        ? clampInt(savedFillAlpha, 0, 100)
        : DEFAULT_CONFIG.area.fillAlphaPercent;
    areaFillAlphaRange.value = String(alphaPercent);
    if (areaFillAlphaValue) areaFillAlphaValue.textContent = String(alphaPercent);
  }

  const savedLineWidth = readWindowStorageString(window.localStorage, v, "areaLineWidth");
  if (areaLineWidthRange) {
    const lineWidth =
      savedLineWidth != null && savedLineWidth !== ""
        ? clampInt(savedLineWidth, 1, 12)
        : DEFAULT_CONFIG.area.lineWidthPx;
    areaLineWidthRange.value = String(lineWidth);
    if (areaLineWidthValue) areaLineWidthValue.textContent = String(lineWidth);
  }

  if (areaMirrorToggle) {
    areaMirrorToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "areaMirror"),
      DEFAULT_CONFIG.area.mirrorEnabled,
    );
  }
  if (areaGradientToggle) {
    areaGradientToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "areaGradient"),
      DEFAULT_CONFIG.area.gradientEnabled,
    );
  }
}

function applyDisplayModePanels(mode) {
  const normalizedMode = normalizeDisplayMode(mode);
  displayMode = normalizedMode;
  if (displayModeSelect) {
    displayModeSelect.value = displayMode;
  }
  for (const [modeKey, panelId] of Object.entries(MODE_PANEL_IDS)) {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.hidden = modeKey !== normalizedMode;
    }
  }
}

function applyPanelStyleMode(mode) {
  panelStyleMode = mode === PANEL_STYLES.minimal ? PANEL_STYLES.minimal : PANEL_STYLES.pro;
  if (panelStyleModeSelect) {
    panelStyleModeSelect.value = panelStyleMode;
  }
  document.body.setAttribute("data-panel-style", panelStyleMode);
}

async function refreshBlackholeStatus() {
  if (!blackholeHint || !blackholeInstallBtn) {
    return;
  }
  try {
    const s = await invoke("get_loopback_device_status");
    blackholeHint.textContent = typeof s.hint === "string" ? s.hint : "";
    const installed = Boolean(s.blackhole_installed);
    blackholeInstalled = installed;
    blackholeInstallBtn.hidden = installed;
    blackholeInstallBtn.disabled = installed;
    refreshMidiSetupVisibility();
  } catch (err) {
    blackholeHint.textContent = `无法读取设备状态：${String(err)}`;
  }
}

function setCaptureTransportRunning(running) {
  captureTransportRunning = Boolean(running);
  if (captureTransportRunning) {
    // 刚启动采集给一个缓冲期，避免按钮立即出现。
    lastWaveformFrameAt = Date.now();
  }
  startBtn.hidden = Boolean(running);
  stopBtn.hidden = !running;
  startBtn.classList.toggle("settings-btn--primary", !running);
  refreshMidiSetupVisibility();
}

function refreshMidiSetupVisibility() {
  if (!openMidiSetupBtn) {
    return;
  }
  const noEffectiveDataForLongTime =
    captureTransportRunning && Date.now() - lastWaveformFrameAt >= NO_FRAME_TIMEOUT_MS;
  const shouldShow =
    captureSourceMode === "blackhole" && blackholeInstalled && noEffectiveDataForLongTime;
  openMidiSetupBtn.hidden = !shouldShow;
  openMidiSetupBtn.disabled = !shouldShow;
  if (openSoundSettingsBtn) {
    openSoundSettingsBtn.hidden = !shouldShow;
    openSoundSettingsBtn.disabled = !shouldShow;
  }
}

function hasEffectiveWaveformData(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const peak = Number(payload.peak ?? 0);
  const rms = Number(payload.rms ?? 0);
  if (Number.isFinite(peak) && peak >= ACTIVE_PEAK_THRESHOLD) {
    return true;
  }
  if (Number.isFinite(rms) && rms >= ACTIVE_RMS_THRESHOLD) {
    return true;
  }
  const points = Array.isArray(payload.points) ? payload.points : [];
  if (!points.length) {
    return false;
  }
  let maxPoint = 0;
  for (const v of points) {
    const n = Math.abs(Number(v));
    if (Number.isFinite(n) && n > maxPoint) {
      maxPoint = n;
      if (maxPoint >= ACTIVE_POINTS_THRESHOLD) {
        return true;
      }
    }
  }
  return false;
}

function readMainBackgroundConfig(visualTargetLabel) {
  try {
    const savedColor = readWindowStorageString(window.localStorage, visualTargetLabel, "mainBgColor");
    const savedAlpha = readWindowStorageString(window.localStorage, visualTargetLabel, "mainBgAlpha");
    const color = /^#[0-9A-Fa-f]{6}$/.test(savedColor ?? "") ? savedColor.toLowerCase() : "#000000";
    const alphaPercent = clampInt(savedAlpha, 0, 100);
    return { color, alphaPercent };
  } catch {
    return { color: "#000000", alphaPercent: 35 };
  }
}

function readBlurEnabled(visualTargetLabel) {
  return parseBoolean(
    readWindowStorageString(window.localStorage, visualTargetLabel, "overlayBlur"),
    false,
  );
}

async function syncWindowBlur(visualTargetLabel, enabled) {
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "overlayBlur",
      String(enabled),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await invoke("set_overlay_blur_enabled", { label: visualTargetLabel, enabled });
  } catch (err) {
    statusEl.textContent = `更新毛玻璃开关失败：${String(err)}`;
    throw err;
  }
}

async function syncMainBackgroundStyle(visualTargetLabel, emitVisual) {
  const color = bodyBgColor.value;
  const alphaPercent = clampInt(bodyBgAlpha.value, 0, 100);
  const alpha = alphaPercent / 100;
  bodyBgAlpha.value = String(alphaPercent);
  bodyBgAlphaValue.textContent = String(alphaPercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "mainBgColor", color);
    writeWindowStorageString(window.localStorage, visualTargetLabel, "mainBgAlpha", String(alphaPercent));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emitVisual("main-bg-style", { color, alpha });
  } catch (err) {
    statusEl.textContent = `同步主窗口背景失败：${String(err)}`;
  }
}

async function syncFrequencyRange(minHz, maxHz) {
  try {
    await invoke("update_frequency_range", { minHz, maxHz });
  } catch (err) {
    statusEl.textContent = `更新频率区间失败：${String(err)}`;
  }
}

async function init() {
  setupStatusFlashOnChange();

  let visualTargetLabel = "main";
  try {
    visualTargetLabel = await invoke("get_visual_settings_target");
  } catch {
    visualTargetLabel = "main";
  }
  visualTargetLabel = normalizeSpectrumWindowLabel(visualTargetLabel);

  const emitVisual = async (event, payload) => emitTo(visualTargetLabel, event, payload);

  const targetBanner = document.querySelector("#visualTargetBanner");
  const updateVisualTargetBanner = () => {
    if (!targetBanner) return;
    const name = visualTargetLabel === "main" ? "主频谱窗口" : visualTargetLabel;
    targetBanner.textContent = `当前调整：${name}`;
    targetBanner.hidden = false;
  };
  updateVisualTargetBanner();

  async function reloadVisualTargetForm() {
    const v = visualTargetLabel;
    const bg = readMainBackgroundConfig(v);
    bodyBgColor.value = bg.color;
    bodyBgAlpha.value = String(bg.alphaPercent);
    bodyBgAlphaValue.textContent = String(bg.alphaPercent);
    blurToggle.checked = readBlurEnabled(v);

    const savedMode = readWindowStorageString(window.localStorage, v, "displayMode");
    applyDisplayModePanels(normalizeDisplayMode(savedMode));

    const sw = readWaveShapeConfig(v) ?? { ...DEFAULT_CONFIG.line.shape };
    waveformGainRange.value = String(sw.gainPercent);
    waveformSmoothRange.value = String(sw.smoothPercent);
    waveformSoftClipRange.value = String(sw.softClipPercent);
    waveformFallEaseRange.value = String(sw.fallEasePercent);
    waveformGainValue.textContent = String(sw.gainPercent);
    waveformSmoothValue.textContent = String(sw.smoothPercent);
    waveformSoftClipValue.textContent = String(sw.softClipPercent);
    waveformFallEaseValue.textContent = String(sw.fallEasePercent);

    const sb = readBarShapeConfig(v) ?? { ...DEFAULT_CONFIG.bar.shape };
    barGainRange.value = String(sb.gainPercent);
    barSmoothRange.value = String(sb.smoothPercent);
    barSoftClipRange.value = String(sb.softClipPercent);
    barFallEaseRange.value = String(sb.fallEasePercent);
    barGainValue.textContent = String(sb.gainPercent);
    barSmoothValue.textContent = String(sb.smoothPercent);
    barSoftClipValue.textContent = String(sb.softClipPercent);
    barFallEaseValue.textContent = String(sb.fallEasePercent);

    applyAreaFormFromStorage(v);
    applyGradientBarFormFromStorage(v);
    applyGlowLineFormFromStorage(v);
    applyGlowCircleFormFromStorage(v);
    applyRadialFormFromStorage(v);
    applyWaterfallFormFromStorage(v);
    applyDotRingFormFromStorage(v);
    applyOscilloscopeFormFromStorage(v);
    applyObliqueBarFormFromStorage(v);
    applyDepthLayersFormFromStorage(v);
    applyIsometricSkylineFormFromStorage(v);
    applyRing3dFormFromStorage(v);
    applyTerrain3dFormFromStorage(v);

    let lineHex = readWindowStorageString(window.localStorage, v, "lineColor");
    if (typeof lineHex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(lineHex)) {
      try {
        lineHex = await invoke("get_waveform_color");
      } catch {
        lineHex = DEFAULT_CONFIG.line.color;
      }
    }
    waveformColor.value = String(lineHex).toLowerCase();

    const lwRaw = readWindowStorageString(window.localStorage, v, "lineWidth");
    let wpx = Number(lwRaw);
    if (!Number.isFinite(wpx)) {
      try {
        wpx = await invoke("get_waveform_line_width");
      } catch {
        wpx = DEFAULT_CONFIG.line.lineWidthPx;
      }
    }
    const wClamped = clampInt(wpx, 1, 12);
    waveformWidthRange.value = String(wClamped);
    waveformWidthValue.textContent = String(wClamped);

    const savedBarColor = readWindowStorageString(window.localStorage, v, "barColor");
    if (savedBarColor && /^#[0-9A-Fa-f]{6}$/.test(savedBarColor) && barColor) {
      barColor.value = savedBarColor.toLowerCase();
    }
    const savedBarWidth = readWindowStorageString(window.localStorage, v, "barWidth");
    if (savedBarWidth && barWidthRange) {
      const widthPercent = clampInt(savedBarWidth, 20, 100);
      barWidthRange.value = String(widthPercent);
      barWidthValue.textContent = String(widthPercent);
    }
    const savedBarGap = readWindowStorageString(window.localStorage, v, "barGap");
    if (savedBarGap && barGapRange) {
      const gapPercent = clampInt(savedBarGap, 0, 70);
      barGapRange.value = String(gapPercent);
      barGapValue.textContent = String(gapPercent);
    }
    const savedBarHeadroom = readWindowStorageString(window.localStorage, v, "barHeadroom");
    if (savedBarHeadroom && barHeadroomRange) {
      const headroomPercent = clampInt(savedBarHeadroom, 0, 40);
      barHeadroomRange.value = String(headroomPercent);
      barHeadroomValue.textContent = String(headroomPercent);
    }
    if (barOrientationSelect) {
      barOrientationSelect.value = normalizeBarOrientation(
        readWindowStorageString(window.localStorage, v, "barOrientation"),
        DEFAULT_CONFIG.bar.orientation,
      );
    }
    if (barMirrorToggle) {
      barMirrorToggle.checked = parseBoolean(
        readWindowStorageString(window.localStorage, v, "barMirror"),
        DEFAULT_CONFIG.bar.mirrorEnabled,
      );
    }
    if (barPeakHoldModeSelect) {
      barPeakHoldModeSelect.value = readBarPeakHoldMode(window.localStorage, v);
    }
    if (barPeakColor) {
      const savedPeakColor = readWindowStorageString(window.localStorage, v, "barPeakColor");
      if (savedPeakColor && /^#[0-9A-Fa-f]{6}$/.test(savedPeakColor)) {
        barPeakColor.value = savedPeakColor.toLowerCase();
      } else {
        barPeakColor.value = DEFAULT_CONFIG.bar.peakColor;
      }
    }
    if (freqReversedToggle) {
      freqReversedToggle.checked = parseBoolean(
        readWindowStorageString(window.localStorage, v, "freqReversed"),
        DEFAULT_CONFIG.freqReversed,
      );
    }
    const savedPeakFall = readWindowStorageString(window.localStorage, v, "barPeakFallSpeed");
    if (savedPeakFall && barPeakFallSpeedRange) {
      const speed = clampInt(savedPeakFall, 5, 120);
      barPeakFallSpeedRange.value = String(speed);
      barPeakFallSpeedValue.textContent = String(speed);
    }
    const savedPeakTh = readWindowStorageString(window.localStorage, v, "barPeakThickness");
    if (savedPeakTh && barPeakThicknessRange) {
      const thickness = clampInt(savedPeakTh, 1, 8);
      barPeakThicknessRange.value = String(thickness);
      barPeakThicknessValue.textContent = String(thickness);
    }
  }

  await listen(
    "visual-settings-target",
    async (event) => {
      visualTargetLabel = normalizeSpectrumWindowLabel(String(event.payload ?? "main"));
      updateVisualTargetBanner();
      await reloadVisualTargetForm();
    },
    { target: { kind: "WebviewWindow", label: "settings" } },
  );

  const savedMainBackground = readMainBackgroundConfig(visualTargetLabel);
  bodyBgColor.value = savedMainBackground.color;
  bodyBgAlpha.value = String(savedMainBackground.alphaPercent);
  bodyBgAlphaValue.textContent = String(savedMainBackground.alphaPercent);
  blurToggle.checked = readBlurEnabled(visualTargetLabel);
  await listen("waveform-status", (event) => {
    const text = String(event.payload ?? "");
    statusEl.textContent = text;
    if (text.includes("已启动")) {
      setCaptureTransportRunning(true);
    } else if (text.includes("已停止")) {
      setCaptureTransportRunning(false);
    }
  });

  await listen("waveform-error", (event) => {
    const msg = String(event.payload ?? "");
    statusEl.textContent = `错误：${msg}`;
    if (msg.includes("启动系统音频采集失败")) {
      setCaptureTransportRunning(false);
    }
  });
  await listen("waveform-frame", (event) => {
    if (hasEffectiveWaveformData(event.payload)) {
      lastWaveformFrameAt = Date.now();
    }
    refreshMidiSetupVisibility();
  });

  captureSourceModeSelect?.addEventListener("change", async (event) => {
    const mode = String(event.target.value || "blackhole");
    try {
      await invoke("set_capture_source_mode", { mode });
      captureSourceMode = mode;
      refreshMidiSetupVisibility();
      statusEl.textContent = mode === "microphone" ? "采集模式已切换为麦克风" : "采集模式已切换为 BlackHole";
      if (captureTransportRunning) {
        await invoke("stop_waveform_stream");
        await invoke("start_waveform_stream");
        statusEl.textContent += "，已自动重启采集生效。";
      }
    } catch (err) {
      if (captureSourceModeSelect) {
        captureSourceModeSelect.value = captureSourceMode;
      }
      statusEl.textContent = `切换采集模式失败：${String(err)}`;
    }
  });

  startBtn.addEventListener("click", async () => {
    try {
      await invoke("start_waveform_stream");
      const running = await invoke("get_waveform_stream_running");
      setCaptureTransportRunning(running);
    } catch (err) {
      statusEl.textContent = `启动采集失败：${String(err)}`;
      setCaptureTransportRunning(false);
    }
  });

  stopBtn.addEventListener("click", async () => {
    try {
      await invoke("stop_waveform_stream");
      setCaptureTransportRunning(false);
    } catch (err) {
      statusEl.textContent = `停止采集失败：${String(err)}`;
    }
  });

  pinToggle.addEventListener("change", async (event) => {
    const pinned = event.target.checked;
    try {
      await invoke("set_overlay_pinned", { pinned });
      statusEl.textContent = pinned ? "置顶模式已开启" : "置顶模式已关闭";
    } catch (err) {
      statusEl.textContent = `更新置顶状态失败：${String(err)}`;
    }
  });

  bucketRange.addEventListener("input", async (event) => {
    const count = Number(event.target.value);
    bucketValue.textContent = String(count);
    try {
      await invoke("update_bucket_count", { bucketCount: count });
    } catch (err) {
      statusEl.textContent = `更新分桶失败：${String(err)}`;
    }
  });

  bucketMode.addEventListener("change", async (event) => {
    const mode = event.target.value;
    try {
      await invoke("update_bucket_mode", { mode });
    } catch (err) {
      statusEl.textContent = `更新分桶模式失败：${String(err)}`;
    }
  });

  waveformColor.addEventListener("input", async () => {
    const color = waveformColor.value;
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "lineColor", color);
      try {
        await invoke("set_waveform_color", { color });
      } catch {
        // 保留 Rust 侧默认值同步（无广播）；外观以 emitTo 为准
      }
      await emitVisual("waveform-line-color", color);
    } catch (err) {
      statusEl.textContent = `更新波形颜色失败：${String(err)}`;
    }
  });

  waveformWidthRange.addEventListener("input", async (event) => {
    const widthPx = Number(event.target.value);
    waveformWidthValue.textContent = String(widthPx);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "lineWidth", String(widthPx));
      try {
        await invoke("set_waveform_line_width", { widthPx });
      } catch {
        // 同上
      }
      await emitVisual("waveform-line-width", widthPx);
    } catch (err) {
      statusEl.textContent = `更新波形粗细失败：${String(err)}`;
    }
  });

  waveformGainRange.addEventListener("input", () => {
    void syncWaveShapeConfig(visualTargetLabel, emitVisual);
  });
  waveformSmoothRange.addEventListener("input", () => {
    void syncWaveShapeConfig(visualTargetLabel, emitVisual);
  });
  waveformSoftClipRange.addEventListener("input", () => {
    void syncWaveShapeConfig(visualTargetLabel, emitVisual);
  });
  waveformFallEaseRange.addEventListener("input", () => {
    void syncWaveShapeConfig(visualTargetLabel, emitVisual);
  });
  barColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barColor", barColor.value);
      await emitVisual("waveform-bar-color", barColor.value);
    } catch (err) {
      statusEl.textContent = `更新柱状图颜色失败：${String(err)}`;
    }
  });
  barWidthRange?.addEventListener("input", async (event) => {
    const widthPercent = clampInt(event.target.value, 20, 100);
    barWidthValue.textContent = String(widthPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barWidth", String(widthPercent));
      await emitVisual("waveform-bar-width", widthPercent);
    } catch (err) {
      statusEl.textContent = `更新柱体宽度失败：${String(err)}`;
    }
  });
  barGapRange?.addEventListener("input", async (event) => {
    const gapPercent = clampInt(event.target.value, 0, 70);
    barGapValue.textContent = String(gapPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barGap", String(gapPercent));
      await emitVisual("waveform-bar-gap", gapPercent);
    } catch (err) {
      statusEl.textContent = `更新柱间距失败：${String(err)}`;
    }
  });
  barHeadroomRange?.addEventListener("input", async (event) => {
    const headroomPercent = clampInt(event.target.value, 0, 40);
    barHeadroomValue.textContent = String(headroomPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barHeadroom", String(headroomPercent));
      await emitVisual("waveform-bar-headroom", headroomPercent);
    } catch (err) {
      statusEl.textContent = `更新顶部留白失败：${String(err)}`;
    }
  });
  barOrientationSelect?.addEventListener("change", async (event) => {
    const orientation = normalizeBarOrientation(event.target.value, DEFAULT_CONFIG.bar.orientation);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barOrientation", orientation);
      await emitVisual("waveform-bar-orientation", orientation);
    } catch (err) {
      statusEl.textContent = `更新排列方向失败：${String(err)}`;
    }
  });
  barMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barMirror", String(enabled));
      await emitVisual("waveform-bar-mirror", enabled);
    } catch (err) {
      statusEl.textContent = `更新镜像模式失败：${String(err)}`;
    }
  });
  barPeakHoldModeSelect?.addEventListener("change", async (event) => {
    const mode = normalizeBarPeakHoldMode(event.target.value, DEFAULT_CONFIG.bar.peakHoldMode);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barPeakHoldMode", mode);
      await emitVisual("waveform-bar-peak-hold", mode);
    } catch (err) {
      statusEl.textContent = `更新峰值保持线失败：${String(err)}`;
    }
  });
  barPeakColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barPeakColor", barPeakColor.value);
      await emitVisual("waveform-bar-peak-color", barPeakColor.value);
    } catch (err) {
      statusEl.textContent = `更新峰值线颜色失败：${String(err)}`;
    }
  });
  barPeakFallSpeedRange?.addEventListener("input", async (event) => {
    const speed = clampInt(event.target.value, 5, 120);
    barPeakFallSpeedValue.textContent = String(speed);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barPeakFallSpeed", String(speed));
      await emitVisual("waveform-bar-peak-fall-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新峰值线回落速度失败：${String(err)}`;
    }
  });
  barPeakThicknessRange?.addEventListener("input", async (event) => {
    const thickness = clampInt(event.target.value, 1, 8);
    barPeakThicknessValue.textContent = String(thickness);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "barPeakThickness", String(thickness));
      await emitVisual("waveform-bar-peak-thickness", thickness);
    } catch (err) {
      statusEl.textContent = `更新峰值线粗细失败：${String(err)}`;
    }
  });
  barGainRange?.addEventListener("input", () => {
    void syncBarShapeConfig(visualTargetLabel, emitVisual);
  });
  barSmoothRange?.addEventListener("input", () => {
    void syncBarShapeConfig(visualTargetLabel, emitVisual);
  });
  barSoftClipRange?.addEventListener("input", () => {
    void syncBarShapeConfig(visualTargetLabel, emitVisual);
  });
  barFallEaseRange?.addEventListener("input", () => {
    void syncBarShapeConfig(visualTargetLabel, emitVisual);
  });
  areaFillColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "areaColor", areaFillColor.value);
      await emitVisual("waveform-area-color", areaFillColor.value);
    } catch (err) {
      statusEl.textContent = `更新填充颜色失败：${String(err)}`;
    }
  });
  areaLineColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "areaLineColor", areaLineColor.value);
      await emitVisual("waveform-area-line-color", areaLineColor.value);
    } catch (err) {
      statusEl.textContent = `更新线条颜色失败：${String(err)}`;
    }
  });
  areaFillAlphaRange?.addEventListener("input", async (event) => {
    const alphaPercent = clampInt(event.target.value, 0, 100);
    areaFillAlphaValue.textContent = String(alphaPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "areaFillAlpha", String(alphaPercent));
      await emitVisual("waveform-area-fill-alpha", alphaPercent);
    } catch (err) {
      statusEl.textContent = `更新填充透明度失败：${String(err)}`;
    }
  });
  areaLineWidthRange?.addEventListener("input", async (event) => {
    const lineWidth = clampInt(event.target.value, 1, 12);
    areaLineWidthValue.textContent = String(lineWidth);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "areaLineWidth", String(lineWidth));
      await emitVisual("waveform-area-line-width", lineWidth);
    } catch (err) {
      statusEl.textContent = `更新线条粗细失败：${String(err)}`;
    }
  });
  areaMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "areaMirror", String(enabled));
      await emitVisual("waveform-area-mirror", enabled);
    } catch (err) {
      statusEl.textContent = `更新镜像模式失败：${String(err)}`;
    }
  });
  areaGradientToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "areaGradient", String(enabled));
      await emitVisual("waveform-area-gradient", enabled);
    } catch (err) {
      statusEl.textContent = `更新渐变开关失败：${String(err)}`;
    }
  });
  areaGainRange?.addEventListener("input", () => {
    void syncAreaShapeConfig(visualTargetLabel, emitVisual);
  });
  areaSmoothRange?.addEventListener("input", () => {
    void syncAreaShapeConfig(visualTargetLabel, emitVisual);
  });
  areaSoftClipRange?.addEventListener("input", () => {
    void syncAreaShapeConfig(visualTargetLabel, emitVisual);
  });
  areaFallEaseRange?.addEventListener("input", () => {
    void syncAreaShapeConfig(visualTargetLabel, emitVisual);
  });
  gradientBarColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarColorLow", gradientBarColorLow.value);
      await emitVisual("waveform-gradient-bar-color-low", gradientBarColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低频颜色失败：${String(err)}`;
    }
  });
  gradientBarColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarColorHigh", gradientBarColorHigh.value);
      await emitVisual("waveform-gradient-bar-color-high", gradientBarColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高频颜色失败：${String(err)}`;
    }
  });
  gradientBarWidthRange?.addEventListener("input", async (event) => {
    const widthPercent = clampInt(event.target.value, 20, 100);
    gradientBarWidthValue.textContent = String(widthPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarWidth", String(widthPercent));
      await emitVisual("waveform-gradient-bar-width", widthPercent);
    } catch (err) {
      statusEl.textContent = `更新柱体宽度失败：${String(err)}`;
    }
  });
  gradientBarGapRange?.addEventListener("input", async (event) => {
    const gapPercent = clampInt(event.target.value, 0, 70);
    gradientBarGapValue.textContent = String(gapPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarGap", String(gapPercent));
      await emitVisual("waveform-gradient-bar-gap", gapPercent);
    } catch (err) {
      statusEl.textContent = `更新柱间距失败：${String(err)}`;
    }
  });
  gradientBarHeadroomRange?.addEventListener("input", async (event) => {
    const headroomPercent = clampInt(event.target.value, 0, 40);
    gradientBarHeadroomValue.textContent = String(headroomPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarHeadroom", String(headroomPercent));
      await emitVisual("waveform-gradient-bar-headroom", headroomPercent);
    } catch (err) {
      statusEl.textContent = `更新顶部留白失败：${String(err)}`;
    }
  });
  gradientBarOrientationSelect?.addEventListener("change", async (event) => {
    const orientation = normalizeBarOrientation(event.target.value, DEFAULT_CONFIG.gradientBar.orientation);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarOrientation", orientation);
      await emitVisual("waveform-gradient-bar-orientation", orientation);
    } catch (err) {
      statusEl.textContent = `更新排列方向失败：${String(err)}`;
    }
  });
  gradientBarMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarMirror", String(enabled));
      await emitVisual("waveform-gradient-bar-mirror", enabled);
    } catch (err) {
      statusEl.textContent = `更新镜像模式失败：${String(err)}`;
    }
  });
  gradientBarPeakHoldModeSelect?.addEventListener("change", async (event) => {
    const mode = normalizeBarPeakHoldMode(event.target.value, DEFAULT_CONFIG.gradientBar.peakHoldMode);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarPeakHoldMode", mode);
      await emitVisual("waveform-gradient-bar-peak-hold", mode);
    } catch (err) {
      statusEl.textContent = `更新峰值保持线失败：${String(err)}`;
    }
  });
  gradientBarPeakColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarPeakColor", gradientBarPeakColor.value);
      await emitVisual("waveform-gradient-bar-peak-color", gradientBarPeakColor.value);
    } catch (err) {
      statusEl.textContent = `更新峰值线颜色失败：${String(err)}`;
    }
  });
  gradientBarPeakFallSpeedRange?.addEventListener("input", async (event) => {
    const speed = clampInt(event.target.value, 5, 120);
    gradientBarPeakFallSpeedValue.textContent = String(speed);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarPeakFallSpeed", String(speed));
      await emitVisual("waveform-gradient-bar-peak-fall-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新峰值线回落速度失败：${String(err)}`;
    }
  });
  gradientBarPeakThicknessRange?.addEventListener("input", async (event) => {
    const thickness = clampInt(event.target.value, 1, 8);
    gradientBarPeakThicknessValue.textContent = String(thickness);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "gradientBarPeakThickness", String(thickness));
      await emitVisual("waveform-gradient-bar-peak-thickness", thickness);
    } catch (err) {
      statusEl.textContent = `更新峰值线粗细失败：${String(err)}`;
    }
  });
  gradientBarGainRange?.addEventListener("input", () => {
    void syncGradientBarShapeConfig(visualTargetLabel, emitVisual);
  });
  gradientBarSmoothRange?.addEventListener("input", () => {
    void syncGradientBarShapeConfig(visualTargetLabel, emitVisual);
  });
  gradientBarSoftClipRange?.addEventListener("input", () => {
    void syncGradientBarShapeConfig(visualTargetLabel, emitVisual);
  });
  gradientBarFallEaseRange?.addEventListener("input", () => {
    void syncGradientBarShapeConfig(visualTargetLabel, emitVisual);
  });
  glowLineCoreColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowLineCoreColor", glowLineCoreColor.value);
      await emitVisual("waveform-glow-line-core-color", glowLineCoreColor.value);
    } catch (err) {
      statusEl.textContent = `更新核心线颜色失败：${String(err)}`;
    }
  });
  glowLineGlowColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowLineGlowColor", glowLineGlowColor.value);
      await emitVisual("waveform-glow-line-glow-color", glowLineGlowColor.value);
    } catch (err) {
      statusEl.textContent = `更新光晕颜色失败：${String(err)}`;
    }
  });
  glowLineWidthRange?.addEventListener("input", async (event) => {
    const lineWidth = clampInt(event.target.value, 1, 12);
    if (glowLineWidthValue) glowLineWidthValue.textContent = String(lineWidth);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowLineWidth", String(lineWidth));
      await emitVisual("waveform-glow-line-width", lineWidth);
    } catch (err) {
      statusEl.textContent = `更新线条粗细失败：${String(err)}`;
    }
  });
  glowLineGlowRadiusRange?.addEventListener("input", async (event) => {
    const glowRadius = clampInt(event.target.value, 2, 24);
    if (glowLineGlowRadiusValue) glowLineGlowRadiusValue.textContent = String(glowRadius);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowLineGlowRadius", String(glowRadius));
      await emitVisual("waveform-glow-line-glow-radius", glowRadius);
    } catch (err) {
      statusEl.textContent = `更新光晕半径失败：${String(err)}`;
    }
  });
  glowLineGlowIntensityRange?.addEventListener("input", async (event) => {
    const glowIntensity = clampInt(event.target.value, 0, 100);
    if (glowLineGlowIntensityValue) glowLineGlowIntensityValue.textContent = String(glowIntensity);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowLineGlowIntensity", String(glowIntensity));
      await emitVisual("waveform-glow-line-glow-intensity", glowIntensity);
    } catch (err) {
      statusEl.textContent = `更新光晕强度失败：${String(err)}`;
    }
  });
  glowLineGainRange?.addEventListener("input", () => {
    void syncGlowLineShapeConfig(visualTargetLabel, emitVisual);
  });
  glowLineSmoothRange?.addEventListener("input", () => {
    void syncGlowLineShapeConfig(visualTargetLabel, emitVisual);
  });
  glowLineSoftClipRange?.addEventListener("input", () => {
    void syncGlowLineShapeConfig(visualTargetLabel, emitVisual);
  });
  glowLineFallEaseRange?.addEventListener("input", () => {
    void syncGlowLineShapeConfig(visualTargetLabel, emitVisual);
  });
  glowCircleCoreColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleCoreColor", glowCircleCoreColor.value);
      await emitVisual("waveform-glow-circle-core-color", glowCircleCoreColor.value);
    } catch (err) {
      statusEl.textContent = `更新核心线颜色失败：${String(err)}`;
    }
  });
  glowCircleGlowColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleGlowColor", glowCircleGlowColor.value);
      await emitVisual("waveform-glow-circle-glow-color", glowCircleGlowColor.value);
    } catch (err) {
      statusEl.textContent = `更新光晕颜色失败：${String(err)}`;
    }
  });
  glowCircleWidthRange?.addEventListener("input", async (event) => {
    const lineWidth = clampInt(event.target.value, 1, 12);
    if (glowCircleWidthValue) glowCircleWidthValue.textContent = String(lineWidth);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleWidth", String(lineWidth));
      await emitVisual("waveform-glow-circle-width", lineWidth);
    } catch (err) {
      statusEl.textContent = `更新线条粗细失败：${String(err)}`;
    }
  });
  glowCircleGlowRadiusRange?.addEventListener("input", async (event) => {
    const glowRadius = clampInt(event.target.value, 2, 24);
    if (glowCircleGlowRadiusValue) glowCircleGlowRadiusValue.textContent = String(glowRadius);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleGlowRadius", String(glowRadius));
      await emitVisual("waveform-glow-circle-glow-radius", glowRadius);
    } catch (err) {
      statusEl.textContent = `更新光晕半径失败：${String(err)}`;
    }
  });
  glowCircleGlowIntensityRange?.addEventListener("input", async (event) => {
    const glowIntensity = clampInt(event.target.value, 0, 100);
    if (glowCircleGlowIntensityValue) glowCircleGlowIntensityValue.textContent = String(glowIntensity);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleGlowIntensity", String(glowIntensity));
      await emitVisual("waveform-glow-circle-glow-intensity", glowIntensity);
    } catch (err) {
      statusEl.textContent = `更新光晕强度失败：${String(err)}`;
    }
  });
  glowCircleRingRadiusRange?.addEventListener("input", async (event) => {
    const ringRadius = clampInt(event.target.value, 10, 85);
    if (glowCircleRingRadiusValue) glowCircleRingRadiusValue.textContent = String(ringRadius);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleRingRadius", String(ringRadius));
      await emitVisual("waveform-glow-circle-ring-radius", ringRadius);
    } catch (err) {
      statusEl.textContent = `更新圆环半径失败：${String(err)}`;
    }
  });
  glowCircleRotationRange?.addEventListener("input", async (event) => {
    const rotation = clampInt(event.target.value, -180, 180);
    if (glowCircleRotationValue) glowCircleRotationValue.textContent = String(rotation);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleRotation", String(rotation));
      await emitVisual("waveform-glow-circle-rotation", rotation);
    } catch (err) {
      statusEl.textContent = `更新起始旋转失败：${String(err)}`;
    }
  });
  glowCircleClockwiseToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "glowCircleClockwise", String(enabled));
      await emitVisual("waveform-glow-circle-clockwise", enabled);
    } catch (err) {
      statusEl.textContent = `更新排列方向失败：${String(err)}`;
    }
  });
  glowCircleGainRange?.addEventListener("input", () => {
    void syncGlowCircleShapeConfig(visualTargetLabel, emitVisual);
  });
  glowCircleSmoothRange?.addEventListener("input", () => {
    void syncGlowCircleShapeConfig(visualTargetLabel, emitVisual);
  });
  glowCircleSoftClipRange?.addEventListener("input", () => {
    void syncGlowCircleShapeConfig(visualTargetLabel, emitVisual);
  });
  glowCircleFallEaseRange?.addEventListener("input", () => {
    void syncGlowCircleShapeConfig(visualTargetLabel, emitVisual);
  });
  radialBarColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialColor", radialBarColor.value);
      await emitVisual("waveform-radial-color", radialBarColor.value);
    } catch (err) {
      statusEl.textContent = `更新柱体颜色失败：${String(err)}`;
    }
  });
  radialInnerRadiusRange?.addEventListener("input", async (event) => {
    const innerPercent = clampInt(event.target.value, 0, 80);
    if (radialInnerRadiusValue) radialInnerRadiusValue.textContent = String(innerPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialInnerRadius", String(innerPercent));
      await emitVisual("waveform-radial-inner-radius", innerPercent);
    } catch (err) {
      statusEl.textContent = `更新内径失败：${String(err)}`;
    }
  });
  radialOuterRadiusRange?.addEventListener("input", async (event) => {
    const outerPercent = clampInt(event.target.value, 5, 95);
    if (radialOuterRadiusValue) radialOuterRadiusValue.textContent = String(outerPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialOuterRadius", String(outerPercent));
      await emitVisual("waveform-radial-outer-radius", outerPercent);
    } catch (err) {
      statusEl.textContent = `更新外径失败：${String(err)}`;
    }
  });
  radialBarThicknessRange?.addEventListener("input", async (event) => {
    const thicknessPercent = clampInt(event.target.value, 10, 100);
    if (radialBarThicknessValue) radialBarThicknessValue.textContent = String(thicknessPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialBarThickness", String(thicknessPercent));
      await emitVisual("waveform-radial-bar-thickness", thicknessPercent);
    } catch (err) {
      statusEl.textContent = `更新角向柱宽失败：${String(err)}`;
    }
  });
  radialRotationRange?.addEventListener("input", async (event) => {
    const rotationDeg = clampInt(event.target.value, -180, 180);
    if (radialRotationValue) radialRotationValue.textContent = String(rotationDeg);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialRotation", String(rotationDeg));
      await emitVisual("waveform-radial-rotation", rotationDeg);
    } catch (err) {
      statusEl.textContent = `更新起始旋转失败：${String(err)}`;
    }
  });
  radialMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialMirror", String(enabled));
      await emitVisual("waveform-radial-mirror", enabled);
    } catch (err) {
      statusEl.textContent = `更新镜像对称失败：${String(err)}`;
    }
  });
  radialClockwiseToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "radialClockwise", String(enabled));
      await emitVisual("waveform-radial-clockwise", enabled);
    } catch (err) {
      statusEl.textContent = `更新顺时针排列失败：${String(err)}`;
    }
  });
  radialGainRange?.addEventListener("input", () => {
    void syncRadialShapeConfig(visualTargetLabel, emitVisual);
  });
  radialSmoothRange?.addEventListener("input", () => {
    void syncRadialShapeConfig(visualTargetLabel, emitVisual);
  });
  radialSoftClipRange?.addEventListener("input", () => {
    void syncRadialShapeConfig(visualTargetLabel, emitVisual);
  });
  radialFallEaseRange?.addEventListener("input", () => {
    void syncRadialShapeConfig(visualTargetLabel, emitVisual);
  });
  waterfallColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "waterfallColorLow", waterfallColorLow.value);
      await emitVisual("waveform-waterfall-color-low", waterfallColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低能量色失败：${String(err)}`;
    }
  });
  waterfallColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "waterfallColorHigh", waterfallColorHigh.value);
      await emitVisual("waveform-waterfall-color-high", waterfallColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高能量色失败：${String(err)}`;
    }
  });
  waterfallHistoryRowsRange?.addEventListener("input", async (event) => {
    const historyRows = clampInt(event.target.value, 16, 128);
    if (waterfallHistoryRowsValue) waterfallHistoryRowsValue.textContent = String(historyRows);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "waterfallHistoryRows", String(historyRows));
      await emitVisual("waveform-waterfall-history-rows", historyRows);
    } catch (err) {
      statusEl.textContent = `更新历史深度失败：${String(err)}`;
    }
  });
  waterfallScrollRange?.addEventListener("input", async (event) => {
    const scrollEveryNFrames = clampInt(event.target.value, 1, 8);
    if (waterfallScrollValue) waterfallScrollValue.textContent = String(scrollEveryNFrames);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "waterfallScrollEveryNFrames",
        String(scrollEveryNFrames),
      );
      await emitVisual("waveform-waterfall-scroll-every-n-frames", scrollEveryNFrames);
    } catch (err) {
      statusEl.textContent = `更新滚动速度失败：${String(err)}`;
    }
  });
  waterfallRowGapRange?.addEventListener("input", async (event) => {
    const rowGapPercent = clampInt(event.target.value, 0, 50);
    if (waterfallRowGapValue) waterfallRowGapValue.textContent = String(rowGapPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "waterfallRowGap", String(rowGapPercent));
      await emitVisual("waveform-waterfall-row-gap", rowGapPercent);
    } catch (err) {
      statusEl.textContent = `更新行间距失败：${String(err)}`;
    }
  });
  waterfallGainRange?.addEventListener("input", () => {
    void syncWaterfallShapeConfig(visualTargetLabel, emitVisual);
  });
  waterfallSmoothRange?.addEventListener("input", () => {
    void syncWaterfallShapeConfig(visualTargetLabel, emitVisual);
  });
  waterfallSoftClipRange?.addEventListener("input", () => {
    void syncWaterfallShapeConfig(visualTargetLabel, emitVisual);
  });
  waterfallFallEaseRange?.addEventListener("input", () => {
    void syncWaterfallShapeConfig(visualTargetLabel, emitVisual);
  });
  dotRingDotColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "dotRingColor", dotRingDotColor.value);
      await emitVisual("waveform-dot-ring-color", dotRingDotColor.value);
    } catch (err) {
      statusEl.textContent = `更新圆点颜色失败：${String(err)}`;
    }
  });
  dotRingRadiusRange?.addEventListener("input", async (event) => {
    const radiusPercent = clampInt(event.target.value, 10, 95);
    if (dotRingRadiusValue) dotRingRadiusValue.textContent = String(radiusPercent);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "dotRingRadius", String(radiusPercent));
      await emitVisual("waveform-dot-ring-radius", radiusPercent);
    } catch (err) {
      statusEl.textContent = `更新圆环半径失败：${String(err)}`;
    }
  });
  dotRingCountRange?.addEventListener("input", async (event) => {
    const dotCount = clampInt(event.target.value, 4, 128);
    if (dotRingCountValue) dotRingCountValue.textContent = String(dotCount);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "dotRingCount", String(dotCount));
      await emitVisual("waveform-dot-ring-count", dotCount);
    } catch (err) {
      statusEl.textContent = `更新圆点数量失败：${String(err)}`;
    }
  });
  dotRingSizeRange?.addEventListener("input", async (event) => {
    const dotSizePx = clampInt(event.target.value, 2, 24);
    if (dotRingSizeValue) dotRingSizeValue.textContent = String(dotSizePx);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "dotRingSize", String(dotSizePx));
      await emitVisual("waveform-dot-ring-size", dotSizePx);
    } catch (err) {
      statusEl.textContent = `更新圆点大小失败：${String(err)}`;
    }
  });
  dotRingPulseToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "dotRingPulse", String(enabled));
      await emitVisual("waveform-dot-ring-pulse", enabled);
    } catch (err) {
      statusEl.textContent = `更新强拍脉冲失败：${String(err)}`;
    }
  });
  dotRingGainRange?.addEventListener("input", () => {
    void syncDotRingShapeConfig(visualTargetLabel, emitVisual);
  });
  dotRingSmoothRange?.addEventListener("input", () => {
    void syncDotRingShapeConfig(visualTargetLabel, emitVisual);
  });
  dotRingSoftClipRange?.addEventListener("input", () => {
    void syncDotRingShapeConfig(visualTargetLabel, emitVisual);
  });
  dotRingFallEaseRange?.addEventListener("input", () => {
    void syncDotRingShapeConfig(visualTargetLabel, emitVisual);
  });
  oscilloscopeColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "oscilloscopeColor",
        oscilloscopeColor.value,
      );
      await emitVisual("waveform-oscilloscope-color", oscilloscopeColor.value);
    } catch (err) {
      statusEl.textContent = `更新示波器颜色失败：${String(err)}`;
    }
  });
  oscilloscopeWidthRange?.addEventListener("input", async (event) => {
    const lineWidthPx = clampInt(event.target.value, 1, 12);
    if (oscilloscopeWidthValue) oscilloscopeWidthValue.textContent = String(lineWidthPx);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "oscilloscopeLineWidth",
        String(lineWidthPx),
      );
      await emitVisual("waveform-oscilloscope-line-width", lineWidthPx);
    } catch (err) {
      statusEl.textContent = `更新示波器线宽失败：${String(err)}`;
    }
  });
  oscilloscopePhosphorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "oscilloscopePhosphor",
        String(enabled),
      );
      await emitVisual("waveform-oscilloscope-phosphor", enabled);
    } catch (err) {
      statusEl.textContent = `更新磷光拖尾失败：${String(err)}`;
    }
  });
  oscilloscopePhosphorDecayRange?.addEventListener("input", async (event) => {
    const decayPercent = clampInt(event.target.value, 10, 95);
    if (oscilloscopePhosphorDecayValue) {
      oscilloscopePhosphorDecayValue.textContent = String(decayPercent);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "oscilloscopePhosphorDecay",
        String(decayPercent),
      );
      await emitVisual("waveform-oscilloscope-phosphor-decay", decayPercent);
    } catch (err) {
      statusEl.textContent = `更新拖尾衰减失败：${String(err)}`;
    }
  });
  obliqueBarColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarColor",
        obliqueBarColor.value,
      );
      await emitVisual("waveform-oblique-bar-color", obliqueBarColor.value);
    } catch (err) {
      statusEl.textContent = `更新近处柱色失败：${String(err)}`;
    }
  });
  obliqueBarColorFar?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarColorFar",
        obliqueBarColorFar.value,
      );
      await emitVisual("waveform-oblique-bar-color-far", obliqueBarColorFar.value);
    } catch (err) {
      statusEl.textContent = `更新远处柱色失败：${String(err)}`;
    }
  });
  obliqueBarWidthRange?.addEventListener("input", async (event) => {
    const widthPercent = clampInt(event.target.value, 20, 100);
    if (obliqueBarWidthValue) obliqueBarWidthValue.textContent = String(widthPercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarWidth",
        String(widthPercent),
      );
      await emitVisual("waveform-oblique-bar-width", widthPercent);
    } catch (err) {
      statusEl.textContent = `更新柱宽失败：${String(err)}`;
    }
  });
  obliqueBarGapRange?.addEventListener("input", async (event) => {
    const gapPercent = clampInt(event.target.value, 0, 70);
    if (obliqueBarGapValue) obliqueBarGapValue.textContent = String(gapPercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarGap",
        String(gapPercent),
      );
      await emitVisual("waveform-oblique-bar-gap", gapPercent);
    } catch (err) {
      statusEl.textContent = `更新柱间距失败：${String(err)}`;
    }
  });
  obliqueBarHeadroomRange?.addEventListener("input", async (event) => {
    const headroomPercent = clampInt(event.target.value, 0, 40);
    if (obliqueBarHeadroomValue) obliqueBarHeadroomValue.textContent = String(headroomPercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarHeadroom",
        String(headroomPercent),
      );
      await emitVisual("waveform-oblique-bar-headroom", headroomPercent);
    } catch (err) {
      statusEl.textContent = `更新顶部留白失败：${String(err)}`;
    }
  });
  obliqueBarTiltRange?.addEventListener("input", async (event) => {
    const tiltDeg = clampInt(event.target.value, 30, 70);
    if (obliqueBarTiltValue) obliqueBarTiltValue.textContent = String(tiltDeg);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarTilt",
        String(tiltDeg),
      );
      await emitVisual("waveform-oblique-bar-tilt", tiltDeg);
    } catch (err) {
      statusEl.textContent = `更新透视倾角失败：${String(err)}`;
    }
  });
  obliqueBarDisplayCountRange?.addEventListener("input", async (event) => {
    const displayBarCount = clampInt(event.target.value, 0, 128);
    if (obliqueBarDisplayCountValue) {
      obliqueBarDisplayCountValue.textContent = String(displayBarCount);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarDisplayCount",
        String(displayBarCount),
      );
      await emitVisual("waveform-oblique-bar-display-count", displayBarCount);
    } catch (err) {
      statusEl.textContent = `更新显示条数失败：${String(err)}`;
    }
  });
  obliqueBarGroundLineToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarGroundLine",
        String(enabled),
      );
      await emitVisual("waveform-oblique-bar-ground-line", enabled);
    } catch (err) {
      statusEl.textContent = `更新地面线失败：${String(err)}`;
    }
  });
  obliqueBarMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "obliqueBarMirror",
        String(enabled),
      );
      await emitVisual("waveform-oblique-bar-mirror", enabled);
    } catch (err) {
      statusEl.textContent = `更新镜像柱体失败：${String(err)}`;
    }
  });
  obliqueBarGainRange?.addEventListener("input", () => {
    void syncObliqueBarShapeConfig(visualTargetLabel, emitVisual);
  });
  obliqueBarSmoothRange?.addEventListener("input", () => {
    void syncObliqueBarShapeConfig(visualTargetLabel, emitVisual);
  });
  obliqueBarSoftClipRange?.addEventListener("input", () => {
    void syncObliqueBarShapeConfig(visualTargetLabel, emitVisual);
  });
  obliqueBarFallEaseRange?.addEventListener("input", () => {
    void syncObliqueBarShapeConfig(visualTargetLabel, emitVisual);
  });
  depthLayersCountRange?.addEventListener("input", async (event) => {
    const layerCount = clampInt(event.target.value, 2, 6);
    if (depthLayersCountValue) depthLayersCountValue.textContent = String(layerCount);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersCount",
        String(layerCount),
      );
      await emitVisual("waveform-depth-layers-count", layerCount);
    } catch (err) {
      statusEl.textContent = `更新层数失败：${String(err)}`;
    }
  });
  depthLayersSpacingRange?.addEventListener("input", async (event) => {
    const layerSpacingPx = clampInt(event.target.value, 0, 24);
    if (depthLayersSpacingValue) depthLayersSpacingValue.textContent = String(layerSpacingPx);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersSpacing",
        String(layerSpacingPx),
      );
      await emitVisual("waveform-depth-layers-spacing", layerSpacingPx);
    } catch (err) {
      statusEl.textContent = `更新层间距失败：${String(err)}`;
    }
  });
  depthLayersFarScaleRange?.addEventListener("input", async (event) => {
    const farScalePercent = clampInt(event.target.value, 50, 90);
    if (depthLayersFarScaleValue) depthLayersFarScaleValue.textContent = String(farScalePercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersFarScale",
        String(farScalePercent),
      );
      await emitVisual("waveform-depth-layers-far-scale", farScalePercent);
    } catch (err) {
      statusEl.textContent = `更新远层缩放失败：${String(err)}`;
    }
  });
  depthLayersFarAlphaRange?.addEventListener("input", async (event) => {
    const farAlphaPercent = clampInt(event.target.value, 0, 100);
    if (depthLayersFarAlphaValue) depthLayersFarAlphaValue.textContent = String(farAlphaPercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersFarAlpha",
        String(farAlphaPercent),
      );
      await emitVisual("waveform-depth-layers-far-alpha", farAlphaPercent);
    } catch (err) {
      statusEl.textContent = `更新远层透明度失败：${String(err)}`;
    }
  });
  depthLayersBassFrontToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersBassFront",
        String(enabled),
      );
      await emitVisual("waveform-depth-layers-bass-front", enabled);
    } catch (err) {
      statusEl.textContent = `更新低频靠前失败：${String(err)}`;
    }
  });
  depthLayersColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersColor",
        depthLayersColor.value,
      );
      await emitVisual("waveform-depth-layers-color", depthLayersColor.value);
    } catch (err) {
      statusEl.textContent = `更新近层颜色失败：${String(err)}`;
    }
  });
  depthLayersColorFar?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersColorFar",
        depthLayersColorFar.value,
      );
      await emitVisual("waveform-depth-layers-color-far", depthLayersColorFar.value);
    } catch (err) {
      statusEl.textContent = `更新远层颜色失败：${String(err)}`;
    }
  });
  depthLayersRenderStyleSelect?.addEventListener("change", async (event) => {
    const renderStyle = normalizeDepthLayersRenderStyle(
      event.target.value,
      DEFAULT_CONFIG.depthLayers.renderStyle,
    );
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersRenderStyle",
        renderStyle,
      );
      await emitVisual("waveform-depth-layers-render-style", renderStyle);
    } catch (err) {
      statusEl.textContent = `更新绘制样式失败：${String(err)}`;
    }
  });
  depthLayersLineWidthRange?.addEventListener("input", async (event) => {
    const lineWidthPx = clampInt(event.target.value, 1, 12);
    if (depthLayersLineWidthValue) depthLayersLineWidthValue.textContent = String(lineWidthPx);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "depthLayersLineWidth",
        String(lineWidthPx),
      );
      await emitVisual("waveform-depth-layers-line-width", lineWidthPx);
    } catch (err) {
      statusEl.textContent = `更新线条粗细失败：${String(err)}`;
    }
  });
  depthLayersGainRange?.addEventListener("input", () => {
    void syncDepthLayersShapeConfig(visualTargetLabel, emitVisual);
  });
  depthLayersSmoothRange?.addEventListener("input", () => {
    void syncDepthLayersShapeConfig(visualTargetLabel, emitVisual);
  });
  depthLayersSoftClipRange?.addEventListener("input", () => {
    void syncDepthLayersShapeConfig(visualTargetLabel, emitVisual);
  });
  depthLayersFallEaseRange?.addEventListener("input", () => {
    void syncDepthLayersShapeConfig(visualTargetLabel, emitVisual);
  });
  isometricSkylineFaceTopColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineFaceTop",
        isometricSkylineFaceTopColor.value,
      );
      await emitVisual("waveform-isometric-skyline-face-top-color", isometricSkylineFaceTopColor.value);
    } catch (err) {
      statusEl.textContent = `更新顶面颜色失败：${String(err)}`;
    }
  });
  isometricSkylineFaceLeftColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineFaceLeft",
        isometricSkylineFaceLeftColor.value,
      );
      await emitVisual("waveform-isometric-skyline-face-left-color", isometricSkylineFaceLeftColor.value);
    } catch (err) {
      statusEl.textContent = `更新左侧面颜色失败：${String(err)}`;
    }
  });
  isometricSkylineFaceRightColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineFaceRight",
        isometricSkylineFaceRightColor.value,
      );
      await emitVisual("waveform-isometric-skyline-face-right-color", isometricSkylineFaceRightColor.value);
    } catch (err) {
      statusEl.textContent = `更新右侧面颜色失败：${String(err)}`;
    }
  });
  isometricSkylineBuildingWidthRange?.addEventListener("input", async (event) => {
    const buildingWidthPx = clampInt(event.target.value, 4, 100);
    if (isometricSkylineBuildingWidthValue) isometricSkylineBuildingWidthValue.textContent = String(buildingWidthPx);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineBuildingWidth",
        String(buildingWidthPx),
      );
      await emitVisual("waveform-isometric-skyline-building-width", buildingWidthPx);
    } catch (err) {
      statusEl.textContent = `更新建筑宽度失败：${String(err)}`;
    }
  });
  isometricSkylineBuildingGapRange?.addEventListener("input", async (event) => {
    const buildingGapPx = clampInt(event.target.value, 0, 12);
    if (isometricSkylineBuildingGapValue) isometricSkylineBuildingGapValue.textContent = String(buildingGapPx);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineBuildingGap",
        String(buildingGapPx),
      );
      await emitVisual("waveform-isometric-skyline-building-gap", buildingGapPx);
    } catch (err) {
      statusEl.textContent = `更新建筑间距失败：${String(err)}`;
    }
  });
  isometricSkylineBuildingCountRange?.addEventListener("input", async (event) => {
    const displayBuildingCount = clampInt(event.target.value, 16, 96);
    if (isometricSkylineBuildingCountValue) isometricSkylineBuildingCountValue.textContent = String(displayBuildingCount);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineBuildingCount",
        String(displayBuildingCount),
      );
      await emitVisual("waveform-isometric-skyline-building-count", displayBuildingCount);
    } catch (err) {
      statusEl.textContent = `更新建筑数量失败：${String(err)}`;
    }
  });
  isometricSkylineBaselineRange?.addEventListener("input", async (event) => {
    const skylineBaselinePercent = clampInt(event.target.value, 5, 40);
    if (isometricSkylineBaselineValue) isometricSkylineBaselineValue.textContent = String(skylineBaselinePercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineBaseline",
        String(skylineBaselinePercent),
      );
      await emitVisual("waveform-isometric-skyline-baseline", skylineBaselinePercent);
    } catch (err) {
      statusEl.textContent = `更新地平线位置失败：${String(err)}`;
    }
  });
  isometricSkylineGroundPlaneToggle?.addEventListener("change", async () => {
    const enabled = Boolean(isometricSkylineGroundPlaneToggle.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "isometricSkylineGroundPlane",
        String(enabled),
      );
      await emitVisual("waveform-isometric-skyline-ground-plane", enabled);
    } catch (err) {
      statusEl.textContent = `更新地面显示失败：${String(err)}`;
    }
  });
  isometricSkylineGainRange?.addEventListener("input", () => {
    void syncIsometricSkylineShapeConfig(visualTargetLabel, emitVisual);
  });
  isometricSkylineSmoothRange?.addEventListener("input", () => {
    void syncIsometricSkylineShapeConfig(visualTargetLabel, emitVisual);
  });
  isometricSkylineSoftClipRange?.addEventListener("input", () => {
    void syncIsometricSkylineShapeConfig(visualTargetLabel, emitVisual);
  });
  isometricSkylineFallEaseRange?.addEventListener("input", () => {
    void syncIsometricSkylineShapeConfig(visualTargetLabel, emitVisual);
  });

  ring3dColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dColor", ring3dColor.value);
      await emitVisual("waveform-ring3d-color", ring3dColor.value);
    } catch (err) {
      statusEl.textContent = `更新柱体颜色失败：${String(err)}`;
    }
  });
  ring3dInnerRadiusRange?.addEventListener("input", async (event) => {
    const innerRadius = clampInt(event.target.value, 10, 80) / 100;
    if (ring3dInnerRadiusValue) ring3dInnerRadiusValue.textContent = formatRing3dRadiusDisplay(innerRadius);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dInnerRadius", String(innerRadius));
      await emitVisual("waveform-ring3d-inner-radius", innerRadius);
    } catch (err) {
      statusEl.textContent = `更新内径失败：${String(err)}`;
    }
  });
  ring3dOuterRadiusRange?.addEventListener("input", async (event) => {
    const outerRadius = clampInt(event.target.value, 50, 100) / 100;
    if (ring3dOuterRadiusValue) ring3dOuterRadiusValue.textContent = formatRing3dRadiusDisplay(outerRadius);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dOuterRadius", String(outerRadius));
      await emitVisual("waveform-ring3d-outer-radius", outerRadius);
    } catch (err) {
      statusEl.textContent = `更新外径失败：${String(err)}`;
    }
  });
  ring3dBarHeightScaleRange?.addEventListener("input", async (event) => {
    const barHeightScale = clampInt(event.target.value, 10, 150) / 100;
    if (ring3dBarHeightScaleValue) ring3dBarHeightScaleValue.textContent = formatRing3dRadiusDisplay(barHeightScale);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dBarHeightScale", String(barHeightScale));
      await emitVisual("waveform-ring3d-bar-height-scale", barHeightScale);
    } catch (err) {
      statusEl.textContent = `更新柱高缩放失败：${String(err)}`;
    }
  });
  ring3dBarThicknessRange?.addEventListener("input", async (event) => {
    const barThicknessDeg = clampInt(event.target.value, 1, 12);
    if (ring3dBarThicknessValue) ring3dBarThicknessValue.textContent = String(barThicknessDeg);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dBarThicknessDeg", String(barThicknessDeg));
      await emitVisual("waveform-ring3d-bar-thickness", barThicknessDeg);
    } catch (err) {
      statusEl.textContent = `更新柱角宽度失败：${String(err)}`;
    }
  });
  ring3dDisplayCountRange?.addEventListener("input", async (event) => {
    const displayBarCount = clampInt(event.target.value, 8, 128);
    if (ring3dDisplayCountValue) ring3dDisplayCountValue.textContent = String(displayBarCount);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dDisplayCount", String(displayBarCount));
      await emitVisual("waveform-ring3d-display-count", displayBarCount);
    } catch (err) {
      statusEl.textContent = `更新显示柱数失败：${String(err)}`;
    }
  });
  ring3dWireframeToggle?.addEventListener("change", async () => {
    const enabled = Boolean(ring3dWireframeToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dWireframe", String(enabled));
      await emitVisual("waveform-ring3d-wireframe", enabled);
    } catch (err) {
      statusEl.textContent = `更新线框模式失败：${String(err)}`;
    }
  });
  ring3dFillToggle?.addEventListener("change", async () => {
    const enabled = Boolean(ring3dFillToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dFill", String(enabled));
      await emitVisual("waveform-ring3d-fill", enabled);
    } catch (err) {
      statusEl.textContent = `更新实心填充失败：${String(err)}`;
    }
  });
  ring3dAutoRotateToggle?.addEventListener("change", async () => {
    const enabled = Boolean(ring3dAutoRotateToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dAutoRotate", String(enabled));
      await emitVisual("waveform-ring3d-auto-rotate", enabled);
    } catch (err) {
      statusEl.textContent = `更新自动旋转失败：${String(err)}`;
    }
  });
  ring3dAutoRotateSpeedRange?.addEventListener("input", async (event) => {
    const autoRotateSpeedDeg = clampInt(event.target.value, 0, 20);
    if (ring3dAutoRotateSpeedValue) ring3dAutoRotateSpeedValue.textContent = String(autoRotateSpeedDeg);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "ring3dAutoRotateSpeed",
        String(autoRotateSpeedDeg),
      );
      await emitVisual("waveform-ring3d-auto-rotate-speed", autoRotateSpeedDeg);
    } catch (err) {
      statusEl.textContent = `更新旋转速度失败：${String(err)}`;
    }
  });
  ring3dCameraDistanceRange?.addEventListener("input", async (event) => {
    const cameraDistance = clampInt(event.target.value, 12, 45) / 10;
    if (ring3dCameraDistanceValue) ring3dCameraDistanceValue.textContent = formatRing3dRadiusDisplay(cameraDistance);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dCameraDistance", String(cameraDistance));
      await emitVisual("waveform-ring3d-camera-distance", cameraDistance);
    } catch (err) {
      statusEl.textContent = `更新相机距离失败：${String(err)}`;
    }
  });
  ring3dCameraFovRange?.addEventListener("input", async (event) => {
    const cameraFovDeg = clampInt(event.target.value, 30, 75);
    if (ring3dCameraFovValue) ring3dCameraFovValue.textContent = String(cameraFovDeg);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dCameraFov", String(cameraFovDeg));
      await emitVisual("waveform-ring3d-camera-fov", cameraFovDeg);
    } catch (err) {
      statusEl.textContent = `更新视野角度失败：${String(err)}`;
    }
  });
  ring3dBreathePeakToggle?.addEventListener("change", async () => {
    const enabled = Boolean(ring3dBreathePeakToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "ring3dBreathePeak", String(enabled));
      await emitVisual("waveform-ring3d-breathe-peak", enabled);
    } catch (err) {
      statusEl.textContent = `更新峰值呼吸失败：${String(err)}`;
    }
  });
  ring3dGainRange?.addEventListener("input", () => {
    void syncRing3dShapeConfig(visualTargetLabel, emitVisual);
  });
  ring3dSmoothRange?.addEventListener("input", () => {
    void syncRing3dShapeConfig(visualTargetLabel, emitVisual);
  });
  ring3dSoftClipRange?.addEventListener("input", () => {
    void syncRing3dShapeConfig(visualTargetLabel, emitVisual);
  });
  ring3dFallEaseRange?.addEventListener("input", () => {
    void syncRing3dShapeConfig(visualTargetLabel, emitVisual);
  });

  terrain3dColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dColorLow", terrain3dColorLow.value);
      await emitVisual("waveform-terrain3d-color-low", terrain3dColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低能量色失败：${String(err)}`;
    }
  });
  terrain3dColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dColorHigh", terrain3dColorHigh.value);
      await emitVisual("waveform-terrain3d-color-high", terrain3dColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高能量色失败：${String(err)}`;
    }
  });
  terrain3dWireframeColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "terrain3dWireframeColor",
        terrain3dWireframeColor.value,
      );
      await emitVisual("waveform-terrain3d-wireframe-color", terrain3dWireframeColor.value);
    } catch (err) {
      statusEl.textContent = `更新线框颜色失败：${String(err)}`;
    }
  });
  terrain3dGridColsRange?.addEventListener("input", async (event) => {
    const gridCols = clampInt(event.target.value, 16, 96);
    if (terrain3dGridColsValue) terrain3dGridColsValue.textContent = String(gridCols);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dGridCols", String(gridCols));
      await emitVisual("waveform-terrain3d-grid-cols", gridCols);
    } catch (err) {
      statusEl.textContent = `更新频率格点失败：${String(err)}`;
    }
  });
  terrain3dGridRowsRange?.addEventListener("input", async (event) => {
    const gridRows = clampInt(event.target.value, 16, 96);
    if (terrain3dGridRowsValue) terrain3dGridRowsValue.textContent = String(gridRows);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dGridRows", String(gridRows));
      await emitVisual("waveform-terrain3d-grid-rows", gridRows);
    } catch (err) {
      statusEl.textContent = `更新历史深度失败：${String(err)}`;
    }
  });
  terrain3dScrollRange?.addEventListener("input", async (event) => {
    const scrollEveryNFrames = clampInt(event.target.value, 1, 8);
    if (terrain3dScrollValue) terrain3dScrollValue.textContent = String(scrollEveryNFrames);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "terrain3dScrollEveryNFrames",
        String(scrollEveryNFrames),
      );
      await emitVisual("waveform-terrain3d-scroll-every-n-frames", scrollEveryNFrames);
    } catch (err) {
      statusEl.textContent = `更新滚动速度失败：${String(err)}`;
    }
  });
  terrain3dWireframeToggle?.addEventListener("change", async () => {
    const enabled = Boolean(terrain3dWireframeToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dWireframe", String(enabled));
      await emitVisual("waveform-terrain3d-wireframe", enabled);
    } catch (err) {
      statusEl.textContent = `更新线框模式失败：${String(err)}`;
    }
  });
  terrain3dFillToggle?.addEventListener("change", async () => {
    const enabled = Boolean(terrain3dFillToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dFill", String(enabled));
      await emitVisual("waveform-terrain3d-fill", enabled);
    } catch (err) {
      statusEl.textContent = `更新填充地形失败：${String(err)}`;
    }
  });
  terrain3dHeightScaleRange?.addEventListener("input", async (event) => {
    const heightScale = clampInt(event.target.value, 5, 120) / 100;
    if (terrain3dHeightScaleValue) terrain3dHeightScaleValue.textContent = formatRing3dRadiusDisplay(heightScale);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dHeightScale", String(heightScale));
      await emitVisual("waveform-terrain3d-height-scale", heightScale);
    } catch (err) {
      statusEl.textContent = `更新地形高度失败：${String(err)}`;
    }
  });
  terrain3dCameraPitchRange?.addEventListener("input", async (event) => {
    const cameraPitchDeg = clampInt(event.target.value, 30, 75);
    if (terrain3dCameraPitchValue) terrain3dCameraPitchValue.textContent = String(cameraPitchDeg);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dCameraPitch", String(cameraPitchDeg));
      await emitVisual("waveform-terrain3d-camera-pitch", cameraPitchDeg);
    } catch (err) {
      statusEl.textContent = `更新相机俯角失败：${String(err)}`;
    }
  });
  terrain3dCameraDistanceRange?.addEventListener("input", async (event) => {
    const cameraDistance = clampInt(event.target.value, 12, 45) / 10;
    if (terrain3dCameraDistanceValue) terrain3dCameraDistanceValue.textContent = formatRing3dRadiusDisplay(cameraDistance);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dCameraDistance", String(cameraDistance));
      await emitVisual("waveform-terrain3d-camera-distance", cameraDistance);
    } catch (err) {
      statusEl.textContent = `更新相机距离失败：${String(err)}`;
    }
  });
  terrain3dAutoScrollToggle?.addEventListener("change", async () => {
    const enabled = Boolean(terrain3dAutoScrollToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "terrain3dAutoScroll", String(enabled));
      await emitVisual("waveform-terrain3d-auto-scroll", enabled);
    } catch (err) {
      statusEl.textContent = `更新自动滚动失败：${String(err)}`;
    }
  });
  terrain3dGainRange?.addEventListener("input", () => {
    void syncTerrain3dShapeConfig(visualTargetLabel, emitVisual);
  });
  terrain3dSmoothRange?.addEventListener("input", () => {
    void syncTerrain3dShapeConfig(visualTargetLabel, emitVisual);
  });
  terrain3dSoftClipRange?.addEventListener("input", () => {
    void syncTerrain3dShapeConfig(visualTargetLabel, emitVisual);
  });
  terrain3dFallEaseRange?.addEventListener("input", () => {
    void syncTerrain3dShapeConfig(visualTargetLabel, emitVisual);
  });

  displayModeSelect?.addEventListener("change", async (event) => {
    const mode = String(event.target.value || "line");
    applyDisplayModePanels(mode);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "displayMode", displayMode);
      await emitVisual("visualization-display-mode", displayMode);
    } catch (err) {
      statusEl.textContent = `切换展示模式失败：${String(err)}`;
    }
  });
  panelStyleModeSelect?.addEventListener("change", (event) => {
    applyPanelStyleMode(String(event.target.value || "pro"));
    try {
      window.localStorage.setItem(STORAGE_KEYS.panelStyleMode, panelStyleMode);
    } catch {
      // ignore storage failures
    }
  });

  bodyBgColor.addEventListener("input", () => {
    void syncMainBackgroundStyle(visualTargetLabel, emitVisual);
  });
  bodyBgAlpha.addEventListener("input", () => {
    void syncMainBackgroundStyle(visualTargetLabel, emitVisual);
  });

  blurToggle.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      await syncWindowBlur(visualTargetLabel, enabled);
      statusEl.textContent = enabled ? "毛玻璃已开启" : "毛玻璃已关闭";
    } catch {
      // syncWindowBlur 已写入 status
    }
  });

  blackholeInstallBtn?.addEventListener("click", async () => {
    statusEl.textContent = "正在打开 BlackHole 安装程序（或官方下载页）…";
    try {
      await invoke("open_blackhole_installer");
      statusEl.textContent =
        "若已打开安装程序，请按提示完成；完成后可在「系统设置 → 声音」中选择 BlackHole 作为输出。";
    } catch (err) {
      statusEl.textContent = `打开安装失败：${String(err)}`;
    }
  });

  blackholeRefreshBtn?.addEventListener("click", () => {
    void refreshBlackholeStatus();
  });
  openMidiSetupBtn?.addEventListener("click", async () => {
    try {
      await invoke("open_audio_midi_setup");
      statusEl.textContent = "已打开「音频 MIDI 设置」，请在多输出设备，勾选 BlackHole 2ch。";
    } catch (err) {
      statusEl.textContent = `打开「音频 MIDI 设置」失败：${String(err)}`;
    }
  });
  openSoundSettingsBtn?.addEventListener("click", async () => {
    try {
      await invoke("open_sound_settings");
      statusEl.textContent = "已打开「声音设置」，请在输出中，选择多设备输出。";
    } catch (err) {
      statusEl.textContent = `打开「声音设置」失败：${String(err)}`;
    }
  });

  tiltRange.addEventListener("input", async (event) => {
    const percent = Number(event.target.value);
    tiltValue.textContent = String(percent);
    try {
      await invoke("update_high_tilt_percent", { percent });
    } catch (err) {
      statusEl.textContent = `更新高频补偿失败：${String(err)}`;
    }
  });

  freqMinRange.addEventListener("input", async (event) => {
    let minHz = Number(event.target.value);
    const maxHz = Number(freqMaxRange.value);
    if (minHz >= maxHz - 20) {
      minHz = maxHz - 20;
      freqMinRange.value = String(minHz);
    }
    freqMinValue.textContent = String(minHz);
    await syncFrequencyRange(minHz, maxHz);
  });

  freqMaxRange.addEventListener("input", async (event) => {
    let maxHz = Number(event.target.value);
    const minHz = Number(freqMinRange.value);
    if (maxHz <= minHz + 20) {
      maxHz = minHz + 20;
      freqMaxRange.value = String(maxHz);
    }
    freqMaxValue.textContent = String(maxHz);
    await syncFrequencyRange(minHz, maxHz);
  });
  freqReversedToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "freqReversed", String(enabled));
      await emitVisual("waveform-freq-reversed", enabled);
    } catch (err) {
      statusEl.textContent = `更新频率方向失败：${String(err)}`;
    }
  });

  try {
    const [
      currentBucket,
      currentMode,
      currentTilt,
      frequencyRange,
      overlayPinned,
      streamRunning,
      sourceMode,
    ] = await Promise.all([
      invoke("get_bucket_count"),
      invoke("get_bucket_mode"),
      invoke("get_high_tilt_percent"),
      invoke("get_frequency_range"),
      invoke("get_overlay_pinned"),
      invoke("get_waveform_stream_running"),
      invoke("get_capture_source_mode"),
    ]);
    bucketRange.value = String(currentBucket);
    bucketValue.textContent = String(currentBucket);
    bucketMode.value = currentMode;
    tiltRange.value = String(currentTilt);
    tiltValue.textContent = String(currentTilt);
    const [minHz, maxHz] = frequencyRange;
    freqMinRange.value = String(minHz);
    freqMaxRange.value = String(maxHz);
    freqMinValue.textContent = String(minHz);
    freqMaxValue.textContent = String(maxHz);
    pinToggle.checked = Boolean(overlayPinned);
    blurToggle.checked = readBlurEnabled(visualTargetLabel);
    setCaptureTransportRunning(Boolean(streamRunning));
    if (sourceMode === "microphone" || sourceMode === "blackhole") {
      captureSourceMode = sourceMode;
    }
    if (captureSourceModeSelect) {
      captureSourceModeSelect.value = captureSourceMode;
    }
    refreshMidiSetupVisibility();

    let lineHex = readWindowStorageString(window.localStorage, visualTargetLabel, "lineColor");
    if (typeof lineHex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(lineHex)) {
      try {
        lineHex = await invoke("get_waveform_color");
      } catch {
        lineHex = DEFAULT_CONFIG.line.color;
      }
    }
    waveformColor.value = String(lineHex).toLowerCase();

    const lwRaw = readWindowStorageString(window.localStorage, visualTargetLabel, "lineWidth");
    let w = Number(lwRaw);
    if (!Number.isFinite(w)) {
      try {
        w = await invoke("get_waveform_line_width");
      } catch {
        w = DEFAULT_CONFIG.line.lineWidthPx;
      }
    }
    const wClamped = clampInt(w, 1, 12);
    waveformWidthRange.value = String(wClamped);
    waveformWidthValue.textContent = String(wClamped);
  } catch {
    bucketValue.textContent = bucketRange.value;
    tiltValue.textContent = tiltRange.value;
    freqMinValue.textContent = freqMinRange.value;
    freqMaxValue.textContent = freqMaxRange.value;
    pinToggle.checked = true;
    blurToggle.checked = false;
    try {
      setCaptureTransportRunning(await invoke("get_waveform_stream_running"));
    } catch {
      setCaptureTransportRunning(false);
    }
  }

  const savedWaveShape = readWaveShapeConfig(visualTargetLabel) ?? {
    ...DEFAULT_CONFIG.line.shape,
  };
  waveformGainRange.value = String(savedWaveShape.gainPercent);
  waveformSmoothRange.value = String(savedWaveShape.smoothPercent);
  waveformSoftClipRange.value = String(savedWaveShape.softClipPercent);
  waveformFallEaseRange.value = String(savedWaveShape.fallEasePercent);
  waveformGainValue.textContent = String(savedWaveShape.gainPercent);
  waveformSmoothValue.textContent = String(savedWaveShape.smoothPercent);
  waveformSoftClipValue.textContent = String(savedWaveShape.softClipPercent);
  waveformFallEaseValue.textContent = String(savedWaveShape.fallEasePercent);
  await syncWaveShapeConfig(visualTargetLabel, emitVisual);
  const savedBarShape = readBarShapeConfig(visualTargetLabel) ?? {
    ...DEFAULT_CONFIG.bar.shape,
  };
  barGainRange.value = String(savedBarShape.gainPercent);
  barSmoothRange.value = String(savedBarShape.smoothPercent);
  barSoftClipRange.value = String(savedBarShape.softClipPercent);
  barFallEaseRange.value = String(savedBarShape.fallEasePercent);
  barGainValue.textContent = String(savedBarShape.gainPercent);
  barSmoothValue.textContent = String(savedBarShape.smoothPercent);
  barSoftClipValue.textContent = String(savedBarShape.softClipPercent);
  barFallEaseValue.textContent = String(savedBarShape.fallEasePercent);
  await syncBarShapeConfig(visualTargetLabel, emitVisual);
  applyAreaFormFromStorage(visualTargetLabel);
  await syncAreaShapeConfig(visualTargetLabel, emitVisual);
  applyGradientBarFormFromStorage(visualTargetLabel);
  await syncGradientBarShapeConfig(visualTargetLabel, emitVisual);
  applyGlowLineFormFromStorage(visualTargetLabel);
  await syncGlowLineShapeConfig(visualTargetLabel, emitVisual);
  applyGlowCircleFormFromStorage(visualTargetLabel);
  await syncGlowCircleShapeConfig(visualTargetLabel, emitVisual);
  applyRadialFormFromStorage(visualTargetLabel);
  await syncRadialShapeConfig(visualTargetLabel, emitVisual);
  applyWaterfallFormFromStorage(visualTargetLabel);
  await syncWaterfallShapeConfig(visualTargetLabel, emitVisual);
  applyDotRingFormFromStorage(visualTargetLabel);
  await syncDotRingShapeConfig(visualTargetLabel, emitVisual);
  applyObliqueBarFormFromStorage(visualTargetLabel);
  await syncObliqueBarShapeConfig(visualTargetLabel, emitVisual);
  applyDepthLayersFormFromStorage(visualTargetLabel);
  await syncDepthLayersShapeConfig(visualTargetLabel, emitVisual);
  applyIsometricSkylineFormFromStorage(visualTargetLabel);
  await syncIsometricSkylineShapeConfig(visualTargetLabel, emitVisual);
  try {
    const savedMode = readWindowStorageString(window.localStorage, visualTargetLabel, "displayMode");
    applyDisplayModePanels(normalizeDisplayMode(savedMode));
    const savedPanelStyle = window.localStorage.getItem(STORAGE_KEYS.panelStyleMode);
    applyPanelStyleMode(savedPanelStyle === PANEL_STYLES.minimal ? PANEL_STYLES.minimal : PANEL_STYLES.pro);
    const savedBarColor = readWindowStorageString(window.localStorage, visualTargetLabel, "barColor");
    if (savedBarColor && /^#[0-9A-Fa-f]{6}$/.test(savedBarColor)) {
      barColor.value = savedBarColor.toLowerCase();
    }
    const savedBarWidthPercent = readWindowStorageString(window.localStorage, visualTargetLabel, "barWidth");
    if (savedBarWidthPercent) {
      const widthPercent = clampInt(savedBarWidthPercent, 20, 100);
      barWidthRange.value = String(widthPercent);
      barWidthValue.textContent = String(widthPercent);
    }
    const savedBarGap = readWindowStorageString(window.localStorage, visualTargetLabel, "barGap");
    if (savedBarGap) {
      const gapPercent = clampInt(savedBarGap, 0, 70);
      barGapRange.value = String(gapPercent);
      barGapValue.textContent = String(gapPercent);
    }
    const savedBarHeadroom = readWindowStorageString(window.localStorage, visualTargetLabel, "barHeadroom");
    if (savedBarHeadroom) {
      const headroomPercent = clampInt(savedBarHeadroom, 0, 40);
      barHeadroomRange.value = String(headroomPercent);
      barHeadroomValue.textContent = String(headroomPercent);
    }
    if (barOrientationSelect) {
      barOrientationSelect.value = normalizeBarOrientation(
        readWindowStorageString(window.localStorage, visualTargetLabel, "barOrientation"),
        DEFAULT_CONFIG.bar.orientation,
      );
    }
    const savedBarMirror = readWindowStorageString(window.localStorage, visualTargetLabel, "barMirror");
    barMirrorToggle.checked = parseBoolean(savedBarMirror, DEFAULT_CONFIG.bar.mirrorEnabled);
    if (barPeakHoldModeSelect) {
      barPeakHoldModeSelect.value = readBarPeakHoldMode(window.localStorage, visualTargetLabel);
    }
    if (barPeakColor) {
      const savedPeakColor = readWindowStorageString(window.localStorage, visualTargetLabel, "barPeakColor");
      barPeakColor.value = savedPeakColor && /^#[0-9A-Fa-f]{6}$/.test(savedPeakColor)
        ? savedPeakColor.toLowerCase()
        : DEFAULT_CONFIG.bar.peakColor;
    }
    if (freqReversedToggle) {
      freqReversedToggle.checked = parseBoolean(
        readWindowStorageString(window.localStorage, visualTargetLabel, "freqReversed"),
        DEFAULT_CONFIG.freqReversed,
      );
    }
    const savedPeakFallSpeed = readWindowStorageString(window.localStorage, visualTargetLabel, "barPeakFallSpeed");
    if (savedPeakFallSpeed) {
      const speed = clampInt(savedPeakFallSpeed, 5, 120);
      barPeakFallSpeedRange.value = String(speed);
      barPeakFallSpeedValue.textContent = String(speed);
    }
    const savedPeakThickness = readWindowStorageString(window.localStorage, visualTargetLabel, "barPeakThickness");
    if (savedPeakThickness) {
      const thickness = clampInt(savedPeakThickness, 1, 8);
      barPeakThicknessRange.value = String(thickness);
      barPeakThicknessValue.textContent = String(thickness);
    }
  } catch {
    applyDisplayModePanels(DISPLAY_MODES.line);
    applyPanelStyleMode(PANEL_STYLES.pro);
  }
  await emitVisual("visualization-display-mode", displayMode);
  await emitVisual("waveform-bar-color", barColor.value);
  await emitVisual("waveform-bar-width", clampInt(barWidthRange.value, 20, 100));
  await emitVisual("waveform-bar-gap", clampInt(barGapRange.value, 0, 70));
  await emitVisual("waveform-bar-headroom", clampInt(barHeadroomRange.value, 0, 40));
  await emitVisual(
    "waveform-bar-orientation",
    normalizeBarOrientation(barOrientationSelect?.value, DEFAULT_CONFIG.bar.orientation),
  );
  await emitVisual("waveform-bar-mirror", Boolean(barMirrorToggle.checked));
  await emitVisual(
    "waveform-bar-peak-hold",
    normalizeBarPeakHoldMode(barPeakHoldModeSelect?.value, DEFAULT_CONFIG.bar.peakHoldMode),
  );
  await emitVisual("waveform-bar-peak-color", barPeakColor?.value ?? DEFAULT_CONFIG.bar.peakColor);
  await emitVisual("waveform-bar-peak-fall-speed", clampInt(barPeakFallSpeedRange.value, 5, 120));
  await emitVisual("waveform-bar-peak-thickness", clampInt(barPeakThicknessRange.value, 1, 8));
  await emitVisual("waveform-freq-reversed", Boolean(freqReversedToggle?.checked));
  await emitVisual("waveform-line-color", waveformColor.value);
  await emitVisual("waveform-line-width", clampInt(waveformWidthRange.value, 1, 12));
  if (areaFillColor) {
    await emitVisual("waveform-area-color", areaFillColor.value);
  }
  if (areaLineColor) {
    await emitVisual("waveform-area-line-color", areaLineColor.value);
  }
  if (areaFillAlphaRange) {
    await emitVisual("waveform-area-fill-alpha", clampInt(areaFillAlphaRange.value, 0, 100));
  }
  if (areaLineWidthRange) {
    await emitVisual("waveform-area-line-width", clampInt(areaLineWidthRange.value, 1, 12));
  }
  if (areaMirrorToggle) {
    await emitVisual("waveform-area-mirror", Boolean(areaMirrorToggle.checked));
  }
  if (areaGradientToggle) {
    await emitVisual("waveform-area-gradient", Boolean(areaGradientToggle.checked));
  }
  if (gradientBarColorLow) {
    await emitVisual("waveform-gradient-bar-color-low", gradientBarColorLow.value);
  }
  if (gradientBarColorHigh) {
    await emitVisual("waveform-gradient-bar-color-high", gradientBarColorHigh.value);
  }
  if (gradientBarWidthRange) {
    await emitVisual("waveform-gradient-bar-width", clampInt(gradientBarWidthRange.value, 20, 100));
  }
  if (gradientBarGapRange) {
    await emitVisual("waveform-gradient-bar-gap", clampInt(gradientBarGapRange.value, 0, 70));
  }
  if (gradientBarHeadroomRange) {
    await emitVisual("waveform-gradient-bar-headroom", clampInt(gradientBarHeadroomRange.value, 0, 40));
  }
  if (gradientBarOrientationSelect) {
    await emitVisual(
      "waveform-gradient-bar-orientation",
      normalizeBarOrientation(gradientBarOrientationSelect.value, DEFAULT_CONFIG.gradientBar.orientation),
    );
  }
  if (gradientBarMirrorToggle) {
    await emitVisual("waveform-gradient-bar-mirror", Boolean(gradientBarMirrorToggle.checked));
  }
  if (gradientBarPeakHoldModeSelect) {
    await emitVisual(
      "waveform-gradient-bar-peak-hold",
      normalizeBarPeakHoldMode(gradientBarPeakHoldModeSelect.value, DEFAULT_CONFIG.gradientBar.peakHoldMode),
    );
  }
  if (gradientBarPeakColor) {
    await emitVisual("waveform-gradient-bar-peak-color", gradientBarPeakColor.value);
  }
  if (gradientBarPeakFallSpeedRange) {
    await emitVisual("waveform-gradient-bar-peak-fall-speed", clampInt(gradientBarPeakFallSpeedRange.value, 5, 120));
  }
  if (gradientBarPeakThicknessRange) {
    await emitVisual("waveform-gradient-bar-peak-thickness", clampInt(gradientBarPeakThicknessRange.value, 1, 8));
  }
  if (glowLineCoreColor) {
    await emitVisual("waveform-glow-line-core-color", glowLineCoreColor.value);
  }
  if (glowLineGlowColor) {
    await emitVisual("waveform-glow-line-glow-color", glowLineGlowColor.value);
  }
  if (glowLineWidthRange) {
    await emitVisual("waveform-glow-line-width", clampInt(glowLineWidthRange.value, 1, 12));
  }
  if (glowLineGlowRadiusRange) {
    await emitVisual("waveform-glow-line-glow-radius", clampInt(glowLineGlowRadiusRange.value, 2, 24));
  }
  if (glowLineGlowIntensityRange) {
    await emitVisual("waveform-glow-line-glow-intensity", clampInt(glowLineGlowIntensityRange.value, 0, 100));
  }
  if (glowCircleCoreColor) {
    await emitVisual("waveform-glow-circle-core-color", glowCircleCoreColor.value);
  }
  if (glowCircleGlowColor) {
    await emitVisual("waveform-glow-circle-glow-color", glowCircleGlowColor.value);
  }
  if (glowCircleWidthRange) {
    await emitVisual("waveform-glow-circle-width", clampInt(glowCircleWidthRange.value, 1, 12));
  }
  if (glowCircleGlowRadiusRange) {
    await emitVisual("waveform-glow-circle-glow-radius", clampInt(glowCircleGlowRadiusRange.value, 2, 24));
  }
  if (glowCircleGlowIntensityRange) {
    await emitVisual("waveform-glow-circle-glow-intensity", clampInt(glowCircleGlowIntensityRange.value, 0, 100));
  }
  if (glowCircleRingRadiusRange) {
    await emitVisual("waveform-glow-circle-ring-radius", clampInt(glowCircleRingRadiusRange.value, 10, 85));
  }
  if (glowCircleRotationRange) {
    await emitVisual("waveform-glow-circle-rotation", clampInt(glowCircleRotationRange.value, -180, 180));
  }
  if (glowCircleClockwiseToggle) {
    await emitVisual("waveform-glow-circle-clockwise", Boolean(glowCircleClockwiseToggle.checked));
  }
  if (radialBarColor) {
    await emitVisual("waveform-radial-color", radialBarColor.value);
  }
  if (radialInnerRadiusRange) {
    await emitVisual("waveform-radial-inner-radius", clampInt(radialInnerRadiusRange.value, 0, 80));
  }
  if (radialOuterRadiusRange) {
    await emitVisual("waveform-radial-outer-radius", clampInt(radialOuterRadiusRange.value, 5, 95));
  }
  if (radialBarThicknessRange) {
    await emitVisual("waveform-radial-bar-thickness", clampInt(radialBarThicknessRange.value, 10, 100));
  }
  if (radialRotationRange) {
    await emitVisual("waveform-radial-rotation", clampInt(radialRotationRange.value, -180, 180));
  }
  if (radialMirrorToggle) {
    await emitVisual("waveform-radial-mirror", Boolean(radialMirrorToggle.checked));
  }
  if (radialClockwiseToggle) {
    await emitVisual("waveform-radial-clockwise", Boolean(radialClockwiseToggle.checked));
  }
  if (waterfallColorLow) {
    await emitVisual("waveform-waterfall-color-low", waterfallColorLow.value);
  }
  if (waterfallColorHigh) {
    await emitVisual("waveform-waterfall-color-high", waterfallColorHigh.value);
  }
  if (waterfallHistoryRowsRange) {
    await emitVisual("waveform-waterfall-history-rows", clampInt(waterfallHistoryRowsRange.value, 16, 128));
  }
  if (waterfallScrollRange) {
    await emitVisual(
      "waveform-waterfall-scroll-every-n-frames",
      clampInt(waterfallScrollRange.value, 1, 8),
    );
  }
  if (waterfallRowGapRange) {
    await emitVisual("waveform-waterfall-row-gap", clampInt(waterfallRowGapRange.value, 0, 50));
  }
  if (dotRingDotColor) {
    await emitVisual("waveform-dot-ring-color", dotRingDotColor.value);
  }
  if (dotRingRadiusRange) {
    await emitVisual("waveform-dot-ring-radius", clampInt(dotRingRadiusRange.value, 10, 95));
  }
  if (dotRingCountRange) {
    await emitVisual("waveform-dot-ring-count", clampInt(dotRingCountRange.value, 4, 128));
  }
  if (dotRingSizeRange) {
    await emitVisual("waveform-dot-ring-size", clampInt(dotRingSizeRange.value, 2, 24));
  }
  if (dotRingPulseToggle) {
    await emitVisual("waveform-dot-ring-pulse", Boolean(dotRingPulseToggle.checked));
  }
  if (oscilloscopeColor) {
    await emitVisual("waveform-oscilloscope-color", oscilloscopeColor.value);
  }
  if (oscilloscopeWidthRange) {
    await emitVisual("waveform-oscilloscope-line-width", clampInt(oscilloscopeWidthRange.value, 1, 12));
  }
  if (oscilloscopePhosphorToggle) {
    await emitVisual("waveform-oscilloscope-phosphor", Boolean(oscilloscopePhosphorToggle.checked));
  }
  if (oscilloscopePhosphorDecayRange) {
    await emitVisual(
      "waveform-oscilloscope-phosphor-decay",
      clampInt(oscilloscopePhosphorDecayRange.value, 10, 95),
    );
  }
  if (obliqueBarColor) {
    await emitVisual("waveform-oblique-bar-color", obliqueBarColor.value);
  }
  if (obliqueBarColorFar) {
    await emitVisual("waveform-oblique-bar-color-far", obliqueBarColorFar.value);
  }
  if (obliqueBarWidthRange) {
    await emitVisual("waveform-oblique-bar-width", clampInt(obliqueBarWidthRange.value, 20, 100));
  }
  if (obliqueBarGapRange) {
    await emitVisual("waveform-oblique-bar-gap", clampInt(obliqueBarGapRange.value, 0, 70));
  }
  if (obliqueBarHeadroomRange) {
    await emitVisual("waveform-oblique-bar-headroom", clampInt(obliqueBarHeadroomRange.value, 0, 40));
  }
  if (obliqueBarTiltRange) {
    await emitVisual("waveform-oblique-bar-tilt", clampInt(obliqueBarTiltRange.value, 30, 70));
  }
  if (obliqueBarDisplayCountRange) {
    await emitVisual(
      "waveform-oblique-bar-display-count",
      clampInt(obliqueBarDisplayCountRange.value, 0, 128),
    );
  }
  if (obliqueBarGroundLineToggle) {
    await emitVisual("waveform-oblique-bar-ground-line", Boolean(obliqueBarGroundLineToggle.checked));
  }
  if (obliqueBarMirrorToggle) {
    await emitVisual("waveform-oblique-bar-mirror", Boolean(obliqueBarMirrorToggle.checked));
  }
  if (depthLayersCountRange) {
    await emitVisual("waveform-depth-layers-count", clampInt(depthLayersCountRange.value, 2, 6));
  }
  if (depthLayersSpacingRange) {
    await emitVisual("waveform-depth-layers-spacing", clampInt(depthLayersSpacingRange.value, 0, 24));
  }
  if (depthLayersFarScaleRange) {
    await emitVisual("waveform-depth-layers-far-scale", clampInt(depthLayersFarScaleRange.value, 50, 90));
  }
  if (depthLayersFarAlphaRange) {
    await emitVisual("waveform-depth-layers-far-alpha", clampInt(depthLayersFarAlphaRange.value, 0, 100));
  }
  if (depthLayersBassFrontToggle) {
    await emitVisual("waveform-depth-layers-bass-front", Boolean(depthLayersBassFrontToggle.checked));
  }
  if (depthLayersColor) {
    await emitVisual("waveform-depth-layers-color", depthLayersColor.value);
  }
  if (depthLayersColorFar) {
    await emitVisual("waveform-depth-layers-color-far", depthLayersColorFar.value);
  }
  if (depthLayersRenderStyleSelect) {
    await emitVisual(
      "waveform-depth-layers-render-style",
      normalizeDepthLayersRenderStyle(depthLayersRenderStyleSelect.value, DEFAULT_CONFIG.depthLayers.renderStyle),
    );
  }
  if (depthLayersLineWidthRange) {
    await emitVisual("waveform-depth-layers-line-width", clampInt(depthLayersLineWidthRange.value, 1, 12));
  }
  if (isometricSkylineFaceTopColor) {
    await emitVisual("waveform-isometric-skyline-face-top-color", isometricSkylineFaceTopColor.value);
  }
  if (isometricSkylineFaceLeftColor) {
    await emitVisual("waveform-isometric-skyline-face-left-color", isometricSkylineFaceLeftColor.value);
  }
  if (isometricSkylineFaceRightColor) {
    await emitVisual("waveform-isometric-skyline-face-right-color", isometricSkylineFaceRightColor.value);
  }
  if (isometricSkylineBuildingWidthRange) {
    await emitVisual(
      "waveform-isometric-skyline-building-width",
      clampInt(isometricSkylineBuildingWidthRange.value, 4, 100),
    );
  }
  if (isometricSkylineBuildingGapRange) {
    await emitVisual(
      "waveform-isometric-skyline-building-gap",
      clampInt(isometricSkylineBuildingGapRange.value, 0, 12),
    );
  }
  if (isometricSkylineBuildingCountRange) {
    await emitVisual(
      "waveform-isometric-skyline-building-count",
      clampInt(isometricSkylineBuildingCountRange.value, 16, 96),
    );
  }
  if (isometricSkylineBaselineRange) {
    await emitVisual(
      "waveform-isometric-skyline-baseline",
      clampInt(isometricSkylineBaselineRange.value, 5, 40),
    );
  }
  if (isometricSkylineGroundPlaneToggle) {
    await emitVisual("waveform-isometric-skyline-ground-plane", Boolean(isometricSkylineGroundPlaneToggle.checked));
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", async () => {
      try {
        await invoke("close_settings_window");
      } catch (err) {
        statusEl.textContent = `关闭图形窗与设置失败：${String(err)}`;
      }
    });
  }

  await syncMainBackgroundStyle(visualTargetLabel, emitVisual);
  await refreshBlackholeStatus();
  window.setInterval(refreshMidiSetupVisibility, 1000);
}

init().catch((error) => {
  statusEl.textContent = `初始化失败：${String(error)}`;
});
