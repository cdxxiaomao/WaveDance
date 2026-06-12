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
  normalizeHelix3dExtrudeMode,
  normalizeKaleidoscopeSegments,
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
  [DISPLAY_MODES.helix3d]: "helix3dConfigPanel",
  [DISPLAY_MODES.threePlasmaField]: "threePlasmaFieldConfigPanel",
  [DISPLAY_MODES.threeParticleGalaxy]: "threeParticleGalaxyConfigPanel",
  [DISPLAY_MODES.threeBloomTunnel]: "threeBloomTunnelConfigPanel",
  [DISPLAY_MODES.threeEnergySphere]: "threeEnergySphereConfigPanel",
  [DISPLAY_MODES.threeKaleidoscope]: "threeKaleidoscopeConfigPanel",
  [DISPLAY_MODES.threeGlitchSpectrum]: "threeGlitchSpectrumConfigPanel",
  [DISPLAY_MODES.threePhosphorTrail]: "threePhosphorTrailConfigPanel",
  [DISPLAY_MODES.threeScanGrid]: "threeScanGridConfigPanel",
  [DISPLAY_MODES.threeLiquidBlob]: "threeLiquidBlobConfigPanel",
  [DISPLAY_MODES.threeAuroraRibbon]: "threeAuroraRibbonConfigPanel",
  [DISPLAY_MODES.threeBreathingRings]: "threeBreathingRingsConfigPanel",
  [DISPLAY_MODES.threeNoiseLandscape]: "threeNoiseLandscapeConfigPanel",
  [DISPLAY_MODES.threeLavaLamp]: "threeLavaLampConfigPanel",
  [DISPLAY_MODES.threeOilMarble]: "threeOilMarbleConfigPanel",
  [DISPLAY_MODES.threePearlChain]: "threePearlChainConfigPanel",
  [DISPLAY_MODES.threeCrystalGem]: "threeCrystalGemConfigPanel",
  [DISPLAY_MODES.threeGlassOrbs]: "threeGlassOrbsConfigPanel",
  [DISPLAY_MODES.threeHoloPrism]: "threeHoloPrismConfigPanel",
  [DISPLAY_MODES.threeNebulaVolume]: "threeNebulaVolumeConfigPanel",
  [DISPLAY_MODES.threeKnotOrganic]: "threeKnotOrganicConfigPanel",
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
const helix3dColor = document.querySelector("#helix3dColor");
const helix3dRadiusRange = document.querySelector("#helix3dRadiusRange");
const helix3dRadiusValue = document.querySelector("#helix3dRadiusValue");
const helix3dPitchRange = document.querySelector("#helix3dPitchRange");
const helix3dPitchValue = document.querySelector("#helix3dPitchValue");
const helix3dTurnsRange = document.querySelector("#helix3dTurnsRange");
const helix3dTurnsValue = document.querySelector("#helix3dTurnsValue");
const helix3dDisplayCountRange = document.querySelector("#helix3dDisplayCountRange");
const helix3dDisplayCountValue = document.querySelector("#helix3dDisplayCountValue");
const helix3dExtrudeModeSelect = document.querySelector("#helix3dExtrudeModeSelect");
const helix3dPointSizeRange = document.querySelector("#helix3dPointSizeRange");
const helix3dPointSizeValue = document.querySelector("#helix3dPointSizeValue");
const helix3dWireframeToggle = document.querySelector("#helix3dWireframeToggle");
const helix3dAutoRotateToggle = document.querySelector("#helix3dAutoRotateToggle");
const helix3dAutoRotateSpeedRange = document.querySelector("#helix3dAutoRotateSpeedRange");
const helix3dAutoRotateSpeedValue = document.querySelector("#helix3dAutoRotateSpeedValue");
const helix3dCameraDistanceRange = document.querySelector("#helix3dCameraDistanceRange");
const helix3dCameraDistanceValue = document.querySelector("#helix3dCameraDistanceValue");
const helix3dGainRange = document.querySelector("#helix3dGainRange");
const helix3dGainValue = document.querySelector("#helix3dGainValue");
const helix3dSmoothRange = document.querySelector("#helix3dSmoothRange");
const helix3dSmoothValue = document.querySelector("#helix3dSmoothValue");
const helix3dSoftClipRange = document.querySelector("#helix3dSoftClipRange");
const helix3dSoftClipValue = document.querySelector("#helix3dSoftClipValue");
const helix3dFallEaseRange = document.querySelector("#helix3dFallEaseRange");
const helix3dFallEaseValue = document.querySelector("#helix3dFallEaseValue");

const threePlasmaColorLow = document.querySelector("#threePlasmaColorLow");
const threePlasmaColorHigh = document.querySelector("#threePlasmaColorHigh");
const threePlasmaSpeedRange = document.querySelector("#threePlasmaSpeedRange");
const threePlasmaSpeedValue = document.querySelector("#threePlasmaSpeedValue");
const threePlasmaNoiseScaleRange = document.querySelector("#threePlasmaNoiseScaleRange");
const threePlasmaNoiseScaleValue = document.querySelector("#threePlasmaNoiseScaleValue");
const threePlasmaReactivenessRange = document.querySelector("#threePlasmaReactivenessRange");
const threePlasmaReactivenessValue = document.querySelector("#threePlasmaReactivenessValue");
const threePlasmaBloomToggle = document.querySelector("#threePlasmaBloomToggle");
const threePlasmaBloomStrengthRange = document.querySelector("#threePlasmaBloomStrengthRange");
const threePlasmaBloomStrengthValue = document.querySelector("#threePlasmaBloomStrengthValue");
const threePlasmaGainRange = document.querySelector("#threePlasmaGainRange");
const threePlasmaGainValue = document.querySelector("#threePlasmaGainValue");
const threePlasmaSmoothRange = document.querySelector("#threePlasmaSmoothRange");
const threePlasmaSmoothValue = document.querySelector("#threePlasmaSmoothValue");
const threePlasmaSoftClipRange = document.querySelector("#threePlasmaSoftClipRange");
const threePlasmaSoftClipValue = document.querySelector("#threePlasmaSoftClipValue");
const threePlasmaFallEaseRange = document.querySelector("#threePlasmaFallEaseRange");
const threePlasmaFallEaseValue = document.querySelector("#threePlasmaFallEaseValue");
const threeGalaxyColor = document.querySelector("#threeGalaxyColor");
const threeGalaxyCountRange = document.querySelector("#threeGalaxyCountRange");
const threeGalaxyCountValue = document.querySelector("#threeGalaxyCountValue");
const threeGalaxyRadiusRange = document.querySelector("#threeGalaxyRadiusRange");
const threeGalaxyRadiusValue = document.querySelector("#threeGalaxyRadiusValue");
const threeGalaxyArmsSelect = document.querySelector("#threeGalaxyArmsSelect");
const threeGalaxyBassPullRange = document.querySelector("#threeGalaxyBassPullRange");
const threeGalaxyBassPullValue = document.querySelector("#threeGalaxyBassPullValue");
const threeGalaxyTrebleSpreadRange = document.querySelector("#threeGalaxyTrebleSpreadRange");
const threeGalaxyTrebleSpreadValue = document.querySelector("#threeGalaxyTrebleSpreadValue");
const threeGalaxyAutoRotateSpeedRange = document.querySelector("#threeGalaxyAutoRotateSpeedRange");
const threeGalaxyAutoRotateSpeedValue = document.querySelector("#threeGalaxyAutoRotateSpeedValue");
const threeGalaxyBloomToggle = document.querySelector("#threeGalaxyBloomToggle");
const threeGalaxyBloomStrengthRange = document.querySelector("#threeGalaxyBloomStrengthRange");
const threeGalaxyBloomStrengthValue = document.querySelector("#threeGalaxyBloomStrengthValue");
const threeGalaxyGainRange = document.querySelector("#threeGalaxyGainRange");
const threeGalaxyGainValue = document.querySelector("#threeGalaxyGainValue");
const threeGalaxySmoothRange = document.querySelector("#threeGalaxySmoothRange");
const threeGalaxySmoothValue = document.querySelector("#threeGalaxySmoothValue");
const threeGalaxySoftClipRange = document.querySelector("#threeGalaxySoftClipRange");
const threeGalaxySoftClipValue = document.querySelector("#threeGalaxySoftClipValue");
const threeGalaxyFallEaseRange = document.querySelector("#threeGalaxyFallEaseRange");
const threeGalaxyFallEaseValue = document.querySelector("#threeGalaxyFallEaseValue");
const threeTunnelWallColorLow = document.querySelector("#threeTunnelWallColorLow");
const threeTunnelWallColorHigh = document.querySelector("#threeTunnelWallColorHigh");
const threeTunnelCoreColor = document.querySelector("#threeTunnelCoreColor");
const threeTunnelSpeedRange = document.querySelector("#threeTunnelSpeedRange");
const threeTunnelSpeedValue = document.querySelector("#threeTunnelSpeedValue");
const threeTunnelWallSegmentsRange = document.querySelector("#threeTunnelWallSegmentsRange");
const threeTunnelWallSegmentsValue = document.querySelector("#threeTunnelWallSegmentsValue");
const threeTunnelCorePulseRange = document.querySelector("#threeTunnelCorePulseRange");
const threeTunnelCorePulseValue = document.querySelector("#threeTunnelCorePulseValue");
const threeTunnelFovRange = document.querySelector("#threeTunnelFovRange");
const threeTunnelFovValue = document.querySelector("#threeTunnelFovValue");
const threeTunnelBloomToggle = document.querySelector("#threeTunnelBloomToggle");
const threeTunnelBloomStrengthRange = document.querySelector("#threeTunnelBloomStrengthRange");
const threeTunnelBloomStrengthValue = document.querySelector("#threeTunnelBloomStrengthValue");
const threeTunnelGainRange = document.querySelector("#threeTunnelGainRange");
const threeTunnelGainValue = document.querySelector("#threeTunnelGainValue");
const threeTunnelSmoothRange = document.querySelector("#threeTunnelSmoothRange");
const threeTunnelSmoothValue = document.querySelector("#threeTunnelSmoothValue");
const threeTunnelSoftClipRange = document.querySelector("#threeTunnelSoftClipRange");
const threeTunnelSoftClipValue = document.querySelector("#threeTunnelSoftClipValue");
const threeTunnelFallEaseRange = document.querySelector("#threeTunnelFallEaseRange");
const threeTunnelFallEaseValue = document.querySelector("#threeTunnelFallEaseValue");
const threeSphereCoreColor = document.querySelector("#threeSphereCoreColor");
const threeSphereHaloColor = document.querySelector("#threeSphereHaloColor");
const threeSphereDeformRange = document.querySelector("#threeSphereDeformRange");
const threeSphereDeformValue = document.querySelector("#threeSphereDeformValue");
const threeSphereNoiseSpeedRange = document.querySelector("#threeSphereNoiseSpeedRange");
const threeSphereNoiseSpeedValue = document.querySelector("#threeSphereNoiseSpeedValue");
const threeSphereHaloCountRange = document.querySelector("#threeSphereHaloCountRange");
const threeSphereHaloCountValue = document.querySelector("#threeSphereHaloCountValue");
const threeSphereAutoRotateSpeedRange = document.querySelector("#threeSphereAutoRotateSpeedRange");
const threeSphereAutoRotateSpeedValue = document.querySelector("#threeSphereAutoRotateSpeedValue");
const threeSphereWireframeToggle = document.querySelector("#threeSphereWireframeToggle");
const threeSphereBloomToggle = document.querySelector("#threeSphereBloomToggle");
const threeSphereBloomStrengthRange = document.querySelector("#threeSphereBloomStrengthRange");
const threeSphereBloomStrengthValue = document.querySelector("#threeSphereBloomStrengthValue");
const threeSphereGainRange = document.querySelector("#threeSphereGainRange");
const threeSphereGainValue = document.querySelector("#threeSphereGainValue");
const threeSphereSmoothRange = document.querySelector("#threeSphereSmoothRange");
const threeSphereSmoothValue = document.querySelector("#threeSphereSmoothValue");
const threeSphereSoftClipRange = document.querySelector("#threeSphereSoftClipRange");
const threeSphereSoftClipValue = document.querySelector("#threeSphereSoftClipValue");
const threeSphereFallEaseRange = document.querySelector("#threeSphereFallEaseRange");
const threeSphereFallEaseValue = document.querySelector("#threeSphereFallEaseValue");
const threeKaleidoscopeSegmentsSelect = document.querySelector("#threeKaleidoscopeSegmentsSelect");
const threeKaleidoscopeColorLow = document.querySelector("#threeKaleidoscopeColorLow");
const threeKaleidoscopeColorHigh = document.querySelector("#threeKaleidoscopeColorHigh");
const threeKaleidoscopeRotationSpeedRange = document.querySelector("#threeKaleidoscopeRotationSpeedRange");
const threeKaleidoscopeRotationSpeedValue = document.querySelector("#threeKaleidoscopeRotationSpeedValue");
const threeKaleidoscopeReactivenessRange = document.querySelector("#threeKaleidoscopeReactivenessRange");
const threeKaleidoscopeReactivenessValue = document.querySelector("#threeKaleidoscopeReactivenessValue");
const threeKaleidoscopeBloomToggle = document.querySelector("#threeKaleidoscopeBloomToggle");
const threeKaleidoscopeBloomStrengthRange = document.querySelector("#threeKaleidoscopeBloomStrengthRange");
const threeKaleidoscopeBloomStrengthValue = document.querySelector("#threeKaleidoscopeBloomStrengthValue");
const threeKaleidoscopeGainRange = document.querySelector("#threeKaleidoscopeGainRange");
const threeKaleidoscopeGainValue = document.querySelector("#threeKaleidoscopeGainValue");
const threeKaleidoscopeSmoothRange = document.querySelector("#threeKaleidoscopeSmoothRange");
const threeKaleidoscopeSmoothValue = document.querySelector("#threeKaleidoscopeSmoothValue");
const threeKaleidoscopeSoftClipRange = document.querySelector("#threeKaleidoscopeSoftClipRange");
const threeKaleidoscopeSoftClipValue = document.querySelector("#threeKaleidoscopeSoftClipValue");
const threeKaleidoscopeFallEaseRange = document.querySelector("#threeKaleidoscopeFallEaseRange");
const threeKaleidoscopeFallEaseValue = document.querySelector("#threeKaleidoscopeFallEaseValue");
const threeGlitchBaseColor = document.querySelector("#threeGlitchBaseColor");
const threeGlitchIntensityRange = document.querySelector("#threeGlitchIntensityRange");
const threeGlitchIntensityValue = document.querySelector("#threeGlitchIntensityValue");
const threeGlitchRgbSplitRange = document.querySelector("#threeGlitchRgbSplitRange");
const threeGlitchRgbSplitValue = document.querySelector("#threeGlitchRgbSplitValue");
const threeGlitchScanlineOpacityRange = document.querySelector("#threeGlitchScanlineOpacityRange");
const threeGlitchScanlineOpacityValue = document.querySelector("#threeGlitchScanlineOpacityValue");
const threeGlitchTriggerThresholdRange = document.querySelector("#threeGlitchTriggerThresholdRange");
const threeGlitchTriggerThresholdValue = document.querySelector("#threeGlitchTriggerThresholdValue");
const threeGlitchCooldownRange = document.querySelector("#threeGlitchCooldownRange");
const threeGlitchCooldownValue = document.querySelector("#threeGlitchCooldownValue");
const threeGlitchGainRange = document.querySelector("#threeGlitchGainRange");
const threeGlitchGainValue = document.querySelector("#threeGlitchGainValue");
const threeGlitchSmoothRange = document.querySelector("#threeGlitchSmoothRange");
const threeGlitchSmoothValue = document.querySelector("#threeGlitchSmoothValue");
const threeGlitchSoftClipRange = document.querySelector("#threeGlitchSoftClipRange");
const threeGlitchSoftClipValue = document.querySelector("#threeGlitchSoftClipValue");
const threeGlitchFallEaseRange = document.querySelector("#threeGlitchFallEaseRange");
const threeGlitchFallEaseValue = document.querySelector("#threeGlitchFallEaseValue");
const threePhosphorLineColor = document.querySelector("#threePhosphorLineColor");
const threePhosphorGlowColor = document.querySelector("#threePhosphorGlowColor");
const threePhosphorLineWidthRange = document.querySelector("#threePhosphorLineWidthRange");
const threePhosphorLineWidthValue = document.querySelector("#threePhosphorLineWidthValue");
const threePhosphorDecayRange = document.querySelector("#threePhosphorDecayRange");
const threePhosphorDecayValue = document.querySelector("#threePhosphorDecayValue");
const threePhosphorBloomToggle = document.querySelector("#threePhosphorBloomToggle");
const threePhosphorBloomStrengthRange = document.querySelector("#threePhosphorBloomStrengthRange");
const threePhosphorBloomStrengthValue = document.querySelector("#threePhosphorBloomStrengthValue");
const threePhosphorMirrorToggle = document.querySelector("#threePhosphorMirrorToggle");
const threePhosphorGainRange = document.querySelector("#threePhosphorGainRange");
const threePhosphorGainValue = document.querySelector("#threePhosphorGainValue");
const threePhosphorSmoothRange = document.querySelector("#threePhosphorSmoothRange");
const threePhosphorSmoothValue = document.querySelector("#threePhosphorSmoothValue");
const threePhosphorSoftClipRange = document.querySelector("#threePhosphorSoftClipRange");
const threePhosphorSoftClipValue = document.querySelector("#threePhosphorSoftClipValue");
const threePhosphorFallEaseRange = document.querySelector("#threePhosphorFallEaseRange");
const threePhosphorFallEaseValue = document.querySelector("#threePhosphorFallEaseValue");
const threeScanGridColor = document.querySelector("#threeScanGridColor");
const threeScanGridHighlightColor = document.querySelector("#threeScanGridHighlightColor");
const threeScanGridScanBeamColor = document.querySelector("#threeScanGridScanBeamColor");
const threeScanGridRowsRange = document.querySelector("#threeScanGridRowsRange");
const threeScanGridRowsValue = document.querySelector("#threeScanGridRowsValue");
const threeScanGridColsRange = document.querySelector("#threeScanGridColsRange");
const threeScanGridColsValue = document.querySelector("#threeScanGridColsValue");
const threeScanGridScanSpeedRange = document.querySelector("#threeScanGridScanSpeedRange");
const threeScanGridScanSpeedValue = document.querySelector("#threeScanGridScanSpeedValue");
const threeScanGridHighlightStrengthRange = document.querySelector("#threeScanGridHighlightStrengthRange");
const threeScanGridHighlightStrengthValue = document.querySelector("#threeScanGridHighlightStrengthValue");
const threeScanGridCameraPitchRange = document.querySelector("#threeScanGridCameraPitchRange");
const threeScanGridCameraPitchValue = document.querySelector("#threeScanGridCameraPitchValue");
const threeScanGridBloomToggle = document.querySelector("#threeScanGridBloomToggle");
const threeScanGridBloomStrengthRange = document.querySelector("#threeScanGridBloomStrengthRange");
const threeScanGridBloomStrengthValue = document.querySelector("#threeScanGridBloomStrengthValue");
const threeScanGridGainRange = document.querySelector("#threeScanGridGainRange");
const threeScanGridGainValue = document.querySelector("#threeScanGridGainValue");
const threeScanGridSmoothRange = document.querySelector("#threeScanGridSmoothRange");
const threeScanGridSmoothValue = document.querySelector("#threeScanGridSmoothValue");
const threeScanGridSoftClipRange = document.querySelector("#threeScanGridSoftClipRange");
const threeScanGridSoftClipValue = document.querySelector("#threeScanGridSoftClipValue");
const threeScanGridFallEaseRange = document.querySelector("#threeScanGridFallEaseRange");
const threeScanGridFallEaseValue = document.querySelector("#threeScanGridFallEaseValue");
const threeLiquidBlobColor = document.querySelector("#threeLiquidBlobColor");
const threeLiquidBlobColorSecondary = document.querySelector("#threeLiquidBlobColorSecondary");
const threeLiquidBlobCountRange = document.querySelector("#threeLiquidBlobCountRange");
const threeLiquidBlobCountValue = document.querySelector("#threeLiquidBlobCountValue");
const threeLiquidBlobMergeStrengthRange = document.querySelector("#threeLiquidBlobMergeStrengthRange");
const threeLiquidBlobMergeStrengthValue = document.querySelector("#threeLiquidBlobMergeStrengthValue");
const threeLiquidBlobWobbleSpeedRange = document.querySelector("#threeLiquidBlobWobbleSpeedRange");
const threeLiquidBlobWobbleSpeedValue = document.querySelector("#threeLiquidBlobWobbleSpeedValue");
const threeLiquidBlobBassDriveRange = document.querySelector("#threeLiquidBlobBassDriveRange");
const threeLiquidBlobBassDriveValue = document.querySelector("#threeLiquidBlobBassDriveValue");
const threeLiquidBlobPulseOnPeakToggle = document.querySelector("#threeLiquidBlobPulseOnPeakToggle");
const threeLiquidBlobBloomToggle = document.querySelector("#threeLiquidBlobBloomToggle");
const threeLiquidBlobBloomStrengthRange = document.querySelector("#threeLiquidBlobBloomStrengthRange");
const threeLiquidBlobBloomStrengthValue = document.querySelector("#threeLiquidBlobBloomStrengthValue");
const threeLiquidBlobGainRange = document.querySelector("#threeLiquidBlobGainRange");
const threeLiquidBlobGainValue = document.querySelector("#threeLiquidBlobGainValue");
const threeLiquidBlobSmoothRange = document.querySelector("#threeLiquidBlobSmoothRange");
const threeLiquidBlobSmoothValue = document.querySelector("#threeLiquidBlobSmoothValue");
const threeLiquidBlobSoftClipRange = document.querySelector("#threeLiquidBlobSoftClipRange");
const threeLiquidBlobSoftClipValue = document.querySelector("#threeLiquidBlobSoftClipValue");
const threeLiquidBlobFallEaseRange = document.querySelector("#threeLiquidBlobFallEaseRange");
const threeLiquidBlobFallEaseValue = document.querySelector("#threeLiquidBlobFallEaseValue");
const threeAuroraColorLow = document.querySelector("#threeAuroraColorLow");
const threeAuroraColorHigh = document.querySelector("#threeAuroraColorHigh");
const threeAuroraRibbonCountRange = document.querySelector("#threeAuroraRibbonCountRange");
const threeAuroraRibbonCountValue = document.querySelector("#threeAuroraRibbonCountValue");
const threeAuroraRibbonWidthRange = document.querySelector("#threeAuroraRibbonWidthRange");
const threeAuroraRibbonWidthValue = document.querySelector("#threeAuroraRibbonWidthValue");
const threeAuroraWaveAmplitudeRange = document.querySelector("#threeAuroraWaveAmplitudeRange");
const threeAuroraWaveAmplitudeValue = document.querySelector("#threeAuroraWaveAmplitudeValue");
const threeAuroraWaveSpeedRange = document.querySelector("#threeAuroraWaveSpeedRange");
const threeAuroraWaveSpeedValue = document.querySelector("#threeAuroraWaveSpeedValue");
const threeAuroraBassBandIndexRange = document.querySelector("#threeAuroraBassBandIndexRange");
const threeAuroraBassBandIndexValue = document.querySelector("#threeAuroraBassBandIndexValue");
const threeAuroraAutoRotateSpeedRange = document.querySelector("#threeAuroraAutoRotateSpeedRange");
const threeAuroraAutoRotateSpeedValue = document.querySelector("#threeAuroraAutoRotateSpeedValue");
const threeAuroraBloomToggle = document.querySelector("#threeAuroraBloomToggle");
const threeAuroraBloomStrengthRange = document.querySelector("#threeAuroraBloomStrengthRange");
const threeAuroraBloomStrengthValue = document.querySelector("#threeAuroraBloomStrengthValue");
const threeAuroraGainRange = document.querySelector("#threeAuroraGainRange");
const threeAuroraGainValue = document.querySelector("#threeAuroraGainValue");
const threeAuroraSmoothRange = document.querySelector("#threeAuroraSmoothRange");
const threeAuroraSmoothValue = document.querySelector("#threeAuroraSmoothValue");
const threeAuroraSoftClipRange = document.querySelector("#threeAuroraSoftClipRange");
const threeAuroraSoftClipValue = document.querySelector("#threeAuroraSoftClipValue");
const threeAuroraFallEaseRange = document.querySelector("#threeAuroraFallEaseRange");
const threeAuroraFallEaseValue = document.querySelector("#threeAuroraFallEaseValue");
const threeBreathingRingColor = document.querySelector("#threeBreathingRingColor");
const threeBreathingRingCountRange = document.querySelector("#threeBreathingRingCountRange");
const threeBreathingRingCountValue = document.querySelector("#threeBreathingRingCountValue");
const threeBreathingBaseRadiusRange = document.querySelector("#threeBreathingBaseRadiusRange");
const threeBreathingBaseRadiusValue = document.querySelector("#threeBreathingBaseRadiusValue");
const threeBreathingRadiusStepRange = document.querySelector("#threeBreathingRadiusStepRange");
const threeBreathingRadiusStepValue = document.querySelector("#threeBreathingRadiusStepValue");
const threeBreathingPulseStrengthRange = document.querySelector("#threeBreathingPulseStrengthRange");
const threeBreathingPulseStrengthValue = document.querySelector("#threeBreathingPulseStrengthValue");
const threeBreathingTubeRadiusRange = document.querySelector("#threeBreathingTubeRadiusRange");
const threeBreathingTubeRadiusValue = document.querySelector("#threeBreathingTubeRadiusValue");
const threeBreathingAutoRotateSpeedRange = document.querySelector("#threeBreathingAutoRotateSpeedRange");
const threeBreathingAutoRotateSpeedValue = document.querySelector("#threeBreathingAutoRotateSpeedValue");
const threeBreathingBloomToggle = document.querySelector("#threeBreathingBloomToggle");
const threeBreathingBloomStrengthRange = document.querySelector("#threeBreathingBloomStrengthRange");
const threeBreathingBloomStrengthValue = document.querySelector("#threeBreathingBloomStrengthValue");
const threeBreathingGainRange = document.querySelector("#threeBreathingGainRange");
const threeBreathingGainValue = document.querySelector("#threeBreathingGainValue");
const threeBreathingSmoothRange = document.querySelector("#threeBreathingSmoothRange");
const threeBreathingSmoothValue = document.querySelector("#threeBreathingSmoothValue");
const threeBreathingSoftClipRange = document.querySelector("#threeBreathingSoftClipRange");
const threeBreathingSoftClipValue = document.querySelector("#threeBreathingSoftClipValue");
const threeBreathingFallEaseRange = document.querySelector("#threeBreathingFallEaseRange");
const threeBreathingFallEaseValue = document.querySelector("#threeBreathingFallEaseValue");
const threeNoiseColorLow = document.querySelector("#threeNoiseColorLow");
const threeNoiseColorHigh = document.querySelector("#threeNoiseColorHigh");
const threeNoiseGridSizeRange = document.querySelector("#threeNoiseGridSizeRange");
const threeNoiseGridSizeValue = document.querySelector("#threeNoiseGridSizeValue");
const threeNoiseHeightScaleRange = document.querySelector("#threeNoiseHeightScaleRange");
const threeNoiseHeightScaleValue = document.querySelector("#threeNoiseHeightScaleValue");
const threeNoiseNoiseScaleRange = document.querySelector("#threeNoiseNoiseScaleRange");
const threeNoiseNoiseScaleValue = document.querySelector("#threeNoiseNoiseScaleValue");
const threeNoiseScrollSpeedRange = document.querySelector("#threeNoiseScrollSpeedRange");
const threeNoiseScrollSpeedValue = document.querySelector("#threeNoiseScrollSpeedValue");
const threeNoiseCameraPitchRange = document.querySelector("#threeNoiseCameraPitchRange");
const threeNoiseCameraPitchValue = document.querySelector("#threeNoiseCameraPitchValue");
const threeNoiseWireframeToggle = document.querySelector("#threeNoiseWireframeToggle");
const threeNoiseBloomToggle = document.querySelector("#threeNoiseBloomToggle");
const threeNoiseBloomStrengthRange = document.querySelector("#threeNoiseBloomStrengthRange");
const threeNoiseBloomStrengthValue = document.querySelector("#threeNoiseBloomStrengthValue");
const threeNoiseGainRange = document.querySelector("#threeNoiseGainRange");
const threeNoiseGainValue = document.querySelector("#threeNoiseGainValue");
const threeNoiseSmoothRange = document.querySelector("#threeNoiseSmoothRange");
const threeNoiseSmoothValue = document.querySelector("#threeNoiseSmoothValue");
const threeNoiseSoftClipRange = document.querySelector("#threeNoiseSoftClipRange");
const threeNoiseSoftClipValue = document.querySelector("#threeNoiseSoftClipValue");
const threeNoiseFallEaseRange = document.querySelector("#threeNoiseFallEaseRange");
const threeNoiseFallEaseValue = document.querySelector("#threeNoiseFallEaseValue");
const threeLavaLampColorWarm = document.querySelector("#threeLavaLampColorWarm");
const threeLavaLampColorCool = document.querySelector("#threeLavaLampColorCool");
const threeLavaLampBlobCountRange = document.querySelector("#threeLavaLampBlobCountRange");
const threeLavaLampBlobCountValue = document.querySelector("#threeLavaLampBlobCountValue");
const threeLavaLampMergeStrengthRange = document.querySelector("#threeLavaLampMergeStrengthRange");
const threeLavaLampMergeStrengthValue = document.querySelector("#threeLavaLampMergeStrengthValue");
const threeLavaLampBuoyancySpeedRange = document.querySelector("#threeLavaLampBuoyancySpeedRange");
const threeLavaLampBuoyancySpeedValue = document.querySelector("#threeLavaLampBuoyancySpeedValue");
const threeLavaLampBassDriveRange = document.querySelector("#threeLavaLampBassDriveRange");
const threeLavaLampBassDriveValue = document.querySelector("#threeLavaLampBassDriveValue");
const threeLavaLampBloomToggle = document.querySelector("#threeLavaLampBloomToggle");
const threeLavaLampBloomStrengthRange = document.querySelector("#threeLavaLampBloomStrengthRange");
const threeLavaLampBloomStrengthValue = document.querySelector("#threeLavaLampBloomStrengthValue");
const threeLavaLampGainRange = document.querySelector("#threeLavaLampGainRange");
const threeLavaLampGainValue = document.querySelector("#threeLavaLampGainValue");
const threeLavaLampSmoothRange = document.querySelector("#threeLavaLampSmoothRange");
const threeLavaLampSmoothValue = document.querySelector("#threeLavaLampSmoothValue");
const threeLavaLampSoftClipRange = document.querySelector("#threeLavaLampSoftClipRange");
const threeLavaLampSoftClipValue = document.querySelector("#threeLavaLampSoftClipValue");
const threeLavaLampFallEaseRange = document.querySelector("#threeLavaLampFallEaseRange");
const threeLavaLampFallEaseValue = document.querySelector("#threeLavaLampFallEaseValue");
const threeOilMarbleColor1 = document.querySelector("#threeOilMarbleColor1");
const threeOilMarbleColor2 = document.querySelector("#threeOilMarbleColor2");
const threeOilMarbleColor3 = document.querySelector("#threeOilMarbleColor3");
const threeOilMarbleColor4 = document.querySelector("#threeOilMarbleColor4");
const threeOilMarbleColor4Toggle = document.querySelector("#threeOilMarbleColor4Toggle");
const threeOilMarbleFlowSpeedRange = document.querySelector("#threeOilMarbleFlowSpeedRange");
const threeOilMarbleFlowSpeedValue = document.querySelector("#threeOilMarbleFlowSpeedValue");
const threeOilMarbleNoiseScaleRange = document.querySelector("#threeOilMarbleNoiseScaleRange");
const threeOilMarbleNoiseScaleValue = document.querySelector("#threeOilMarbleNoiseScaleValue");
const threeOilMarbleWarpStrengthRange = document.querySelector("#threeOilMarbleWarpStrengthRange");
const threeOilMarbleWarpStrengthValue = document.querySelector("#threeOilMarbleWarpStrengthValue");
const threeOilMarbleReactivenessRange = document.querySelector("#threeOilMarbleReactivenessRange");
const threeOilMarbleReactivenessValue = document.querySelector("#threeOilMarbleReactivenessValue");
const threeOilMarbleBloomToggle = document.querySelector("#threeOilMarbleBloomToggle");
const threeOilMarbleBloomStrengthRange = document.querySelector("#threeOilMarbleBloomStrengthRange");
const threeOilMarbleBloomStrengthValue = document.querySelector("#threeOilMarbleBloomStrengthValue");
const threeOilMarbleGainRange = document.querySelector("#threeOilMarbleGainRange");
const threeOilMarbleGainValue = document.querySelector("#threeOilMarbleGainValue");
const threeOilMarbleSmoothRange = document.querySelector("#threeOilMarbleSmoothRange");
const threeOilMarbleSmoothValue = document.querySelector("#threeOilMarbleSmoothValue");
const threeOilMarbleSoftClipRange = document.querySelector("#threeOilMarbleSoftClipRange");
const threeOilMarbleSoftClipValue = document.querySelector("#threeOilMarbleSoftClipValue");
const threeOilMarbleFallEaseRange = document.querySelector("#threeOilMarbleFallEaseRange");
const threeOilMarbleFallEaseValue = document.querySelector("#threeOilMarbleFallEaseValue");
const threePearlChainColor1 = document.querySelector("#threePearlChainColor1");
const threePearlChainColor2 = document.querySelector("#threePearlChainColor2");
const threePearlChainColor3 = document.querySelector("#threePearlChainColor3");
const threePearlChainPearlCountRange = document.querySelector("#threePearlChainPearlCountRange");
const threePearlChainPearlCountValue = document.querySelector("#threePearlChainPearlCountValue");
const threePearlChainChainRadiusRange = document.querySelector("#threePearlChainChainRadiusRange");
const threePearlChainChainRadiusValue = document.querySelector("#threePearlChainChainRadiusValue");
const threePearlChainPearlSizeRange = document.querySelector("#threePearlChainPearlSizeRange");
const threePearlChainPearlSizeValue = document.querySelector("#threePearlChainPearlSizeValue");
const threePearlChainSwaySpeedRange = document.querySelector("#threePearlChainSwaySpeedRange");
const threePearlChainSwaySpeedValue = document.querySelector("#threePearlChainSwaySpeedValue");
const threePearlChainMergeStrengthRange = document.querySelector("#threePearlChainMergeStrengthRange");
const threePearlChainMergeStrengthValue = document.querySelector("#threePearlChainMergeStrengthValue");
const threePearlChainBloomToggle = document.querySelector("#threePearlChainBloomToggle");
const threePearlChainBloomStrengthRange = document.querySelector("#threePearlChainBloomStrengthRange");
const threePearlChainBloomStrengthValue = document.querySelector("#threePearlChainBloomStrengthValue");
const threePearlChainGainRange = document.querySelector("#threePearlChainGainRange");
const threePearlChainGainValue = document.querySelector("#threePearlChainGainValue");
const threePearlChainSmoothRange = document.querySelector("#threePearlChainSmoothRange");
const threePearlChainSmoothValue = document.querySelector("#threePearlChainSmoothValue");
const threePearlChainSoftClipRange = document.querySelector("#threePearlChainSoftClipRange");
const threePearlChainSoftClipValue = document.querySelector("#threePearlChainSoftClipValue");
const threePearlChainFallEaseRange = document.querySelector("#threePearlChainFallEaseRange");
const threePearlChainFallEaseValue = document.querySelector("#threePearlChainFallEaseValue");
const threeCrystalGemColorCore = document.querySelector("#threeCrystalGemColorCore");
const threeCrystalGemColorEdge = document.querySelector("#threeCrystalGemColorEdge");
const threeCrystalGemColorHighlight = document.querySelector("#threeCrystalGemColorHighlight");
const threeCrystalGemGemCountRange = document.querySelector("#threeCrystalGemGemCountRange");
const threeCrystalGemGemCountValue = document.querySelector("#threeCrystalGemGemCountValue");
const threeCrystalGemFacetSharpnessRange = document.querySelector("#threeCrystalGemFacetSharpnessRange");
const threeCrystalGemFacetSharpnessValue = document.querySelector("#threeCrystalGemFacetSharpnessValue");
const threeCrystalGemRotationSpeedRange = document.querySelector("#threeCrystalGemRotationSpeedRange");
const threeCrystalGemRotationSpeedValue = document.querySelector("#threeCrystalGemRotationSpeedValue");
const threeCrystalGemChromaticToggle = document.querySelector("#threeCrystalGemChromaticToggle");
const threeCrystalGemChromaticOffsetRange = document.querySelector("#threeCrystalGemChromaticOffsetRange");
const threeCrystalGemChromaticOffsetValue = document.querySelector("#threeCrystalGemChromaticOffsetValue");
const threeCrystalGemBloomToggle = document.querySelector("#threeCrystalGemBloomToggle");
const threeCrystalGemBloomStrengthRange = document.querySelector("#threeCrystalGemBloomStrengthRange");
const threeCrystalGemBloomStrengthValue = document.querySelector("#threeCrystalGemBloomStrengthValue");
const threeCrystalGemGainRange = document.querySelector("#threeCrystalGemGainRange");
const threeCrystalGemGainValue = document.querySelector("#threeCrystalGemGainValue");
const threeCrystalGemSmoothRange = document.querySelector("#threeCrystalGemSmoothRange");
const threeCrystalGemSmoothValue = document.querySelector("#threeCrystalGemSmoothValue");
const threeCrystalGemSoftClipRange = document.querySelector("#threeCrystalGemSoftClipRange");
const threeCrystalGemSoftClipValue = document.querySelector("#threeCrystalGemSoftClipValue");
const threeCrystalGemFallEaseRange = document.querySelector("#threeCrystalGemFallEaseRange");
const threeCrystalGemFallEaseValue = document.querySelector("#threeCrystalGemFallEaseValue");
const threeGlassOrbsColor1 = document.querySelector("#threeGlassOrbsColor1");
const threeGlassOrbsColor2 = document.querySelector("#threeGlassOrbsColor2");
const threeGlassOrbsColor3 = document.querySelector("#threeGlassOrbsColor3");
const threeGlassOrbsColor4 = document.querySelector("#threeGlassOrbsColor4");
const threeGlassOrbsColor5 = document.querySelector("#threeGlassOrbsColor5");
const threeGlassOrbsColor4Field = document.querySelector("#threeGlassOrbsColor4Field");
const threeGlassOrbsColor5Field = document.querySelector("#threeGlassOrbsColor5Field");
const threeGlassOrbsOrbCountRange = document.querySelector("#threeGlassOrbsOrbCountRange");
const threeGlassOrbsOrbCountValue = document.querySelector("#threeGlassOrbsOrbCountValue");
const threeGlassOrbsStackSpacingRange = document.querySelector("#threeGlassOrbsStackSpacingRange");
const threeGlassOrbsStackSpacingValue = document.querySelector("#threeGlassOrbsStackSpacingValue");
const threeGlassOrbsTransmissionRange = document.querySelector("#threeGlassOrbsTransmissionRange");
const threeGlassOrbsTransmissionValue = document.querySelector("#threeGlassOrbsTransmissionValue");
const threeGlassOrbsRefractionStrengthRange = document.querySelector("#threeGlassOrbsRefractionStrengthRange");
const threeGlassOrbsRefractionStrengthValue = document.querySelector("#threeGlassOrbsRefractionStrengthValue");
const threeGlassOrbsBreatheWithPeakToggle = document.querySelector("#threeGlassOrbsBreatheWithPeakToggle");
const threeGlassOrbsChromaticToggle = document.querySelector("#threeGlassOrbsChromaticToggle");
const threeGlassOrbsChromaticOffsetRange = document.querySelector("#threeGlassOrbsChromaticOffsetRange");
const threeGlassOrbsChromaticOffsetValue = document.querySelector("#threeGlassOrbsChromaticOffsetValue");
const threeGlassOrbsBloomToggle = document.querySelector("#threeGlassOrbsBloomToggle");
const threeGlassOrbsBloomStrengthRange = document.querySelector("#threeGlassOrbsBloomStrengthRange");
const threeGlassOrbsBloomStrengthValue = document.querySelector("#threeGlassOrbsBloomStrengthValue");
const threeGlassOrbsGainRange = document.querySelector("#threeGlassOrbsGainRange");
const threeGlassOrbsGainValue = document.querySelector("#threeGlassOrbsGainValue");
const threeGlassOrbsSmoothRange = document.querySelector("#threeGlassOrbsSmoothRange");
const threeGlassOrbsSmoothValue = document.querySelector("#threeGlassOrbsSmoothValue");
const threeGlassOrbsSoftClipRange = document.querySelector("#threeGlassOrbsSoftClipRange");
const threeGlassOrbsSoftClipValue = document.querySelector("#threeGlassOrbsSoftClipValue");
const threeGlassOrbsFallEaseRange = document.querySelector("#threeGlassOrbsFallEaseRange");
const threeGlassOrbsFallEaseValue = document.querySelector("#threeGlassOrbsFallEaseValue");
const threeHoloPrismTintLow = document.querySelector("#threeHoloPrismTintLow");
const threeHoloPrismTintHigh = document.querySelector("#threeHoloPrismTintHigh");
const threeHoloPrismSidesRange = document.querySelector("#threeHoloPrismSidesRange");
const threeHoloPrismSidesValue = document.querySelector("#threeHoloPrismSidesValue");
const threeHoloPrismRotationSpeedRange = document.querySelector("#threeHoloPrismRotationSpeedRange");
const threeHoloPrismRotationSpeedValue = document.querySelector("#threeHoloPrismRotationSpeedValue");
const threeHoloPrismSpectralStrengthRange = document.querySelector("#threeHoloPrismSpectralStrengthRange");
const threeHoloPrismSpectralStrengthValue = document.querySelector("#threeHoloPrismSpectralStrengthValue");
const threeHoloPrismPulseOnPeakToggle = document.querySelector("#threeHoloPrismPulseOnPeakToggle");
const threeHoloPrismChromaticOffsetRange = document.querySelector("#threeHoloPrismChromaticOffsetRange");
const threeHoloPrismChromaticOffsetValue = document.querySelector("#threeHoloPrismChromaticOffsetValue");
const threeHoloPrismBloomToggle = document.querySelector("#threeHoloPrismBloomToggle");
const threeHoloPrismBloomStrengthRange = document.querySelector("#threeHoloPrismBloomStrengthRange");
const threeHoloPrismBloomStrengthValue = document.querySelector("#threeHoloPrismBloomStrengthValue");
const threeHoloPrismGainRange = document.querySelector("#threeHoloPrismGainRange");
const threeHoloPrismGainValue = document.querySelector("#threeHoloPrismGainValue");
const threeHoloPrismSmoothRange = document.querySelector("#threeHoloPrismSmoothRange");
const threeHoloPrismSmoothValue = document.querySelector("#threeHoloPrismSmoothValue");
const threeHoloPrismSoftClipRange = document.querySelector("#threeHoloPrismSoftClipRange");
const threeHoloPrismSoftClipValue = document.querySelector("#threeHoloPrismSoftClipValue");
const threeHoloPrismFallEaseRange = document.querySelector("#threeHoloPrismFallEaseRange");
const threeHoloPrismFallEaseValue = document.querySelector("#threeHoloPrismFallEaseValue");
const threeNebulaVolumeColorCore = document.querySelector("#threeNebulaVolumeColorCore");
const threeNebulaVolumeColorMid = document.querySelector("#threeNebulaVolumeColorMid");
const threeNebulaVolumeColorEdge = document.querySelector("#threeNebulaVolumeColorEdge");
const threeNebulaVolumeDensityScaleRange = document.querySelector("#threeNebulaVolumeDensityScaleRange");
const threeNebulaVolumeDensityScaleValue = document.querySelector("#threeNebulaVolumeDensityScaleValue");
const threeNebulaVolumeNoiseScaleRange = document.querySelector("#threeNebulaVolumeNoiseScaleRange");
const threeNebulaVolumeNoiseScaleValue = document.querySelector("#threeNebulaVolumeNoiseScaleValue");
const threeNebulaVolumeSwirlSpeedRange = document.querySelector("#threeNebulaVolumeSwirlSpeedRange");
const threeNebulaVolumeSwirlSpeedValue = document.querySelector("#threeNebulaVolumeSwirlSpeedValue");
const threeNebulaVolumeMarchStepsRange = document.querySelector("#threeNebulaVolumeMarchStepsRange");
const threeNebulaVolumeMarchStepsValue = document.querySelector("#threeNebulaVolumeMarchStepsValue");
const threeNebulaVolumeBloomToggle = document.querySelector("#threeNebulaVolumeBloomToggle");
const threeNebulaVolumeBloomStrengthRange = document.querySelector("#threeNebulaVolumeBloomStrengthRange");
const threeNebulaVolumeBloomStrengthValue = document.querySelector("#threeNebulaVolumeBloomStrengthValue");
const threeNebulaVolumeGainRange = document.querySelector("#threeNebulaVolumeGainRange");
const threeNebulaVolumeGainValue = document.querySelector("#threeNebulaVolumeGainValue");
const threeNebulaVolumeSmoothRange = document.querySelector("#threeNebulaVolumeSmoothRange");
const threeNebulaVolumeSmoothValue = document.querySelector("#threeNebulaVolumeSmoothValue");
const threeNebulaVolumeSoftClipRange = document.querySelector("#threeNebulaVolumeSoftClipRange");
const threeNebulaVolumeSoftClipValue = document.querySelector("#threeNebulaVolumeSoftClipValue");
const threeNebulaVolumeFallEaseRange = document.querySelector("#threeNebulaVolumeFallEaseRange");
const threeNebulaVolumeFallEaseValue = document.querySelector("#threeNebulaVolumeFallEaseValue");
const threeKnotOrganicColor1 = document.querySelector("#threeKnotOrganicColor1");
const threeKnotOrganicColor2 = document.querySelector("#threeKnotOrganicColor2");
const threeKnotOrganicColor3 = document.querySelector("#threeKnotOrganicColor3");
const threeKnotOrganicKnotPRange = document.querySelector("#threeKnotOrganicKnotPRange");
const threeKnotOrganicKnotPValue = document.querySelector("#threeKnotOrganicKnotPValue");
const threeKnotOrganicKnotQRange = document.querySelector("#threeKnotOrganicKnotQRange");
const threeKnotOrganicKnotQValue = document.querySelector("#threeKnotOrganicKnotQValue");
const threeKnotOrganicTubeRadiusRange = document.querySelector("#threeKnotOrganicTubeRadiusRange");
const threeKnotOrganicTubeRadiusValue = document.querySelector("#threeKnotOrganicTubeRadiusValue");
const threeKnotOrganicSurfaceNoiseRange = document.querySelector("#threeKnotOrganicSurfaceNoiseRange");
const threeKnotOrganicSurfaceNoiseValue = document.querySelector("#threeKnotOrganicSurfaceNoiseValue");
const threeKnotOrganicRotationSpeedRange = document.querySelector("#threeKnotOrganicRotationSpeedRange");
const threeKnotOrganicRotationSpeedValue = document.querySelector("#threeKnotOrganicRotationSpeedValue");
const threeKnotOrganicBloomToggle = document.querySelector("#threeKnotOrganicBloomToggle");
const threeKnotOrganicBloomStrengthRange = document.querySelector("#threeKnotOrganicBloomStrengthRange");
const threeKnotOrganicBloomStrengthValue = document.querySelector("#threeKnotOrganicBloomStrengthValue");
const threeKnotOrganicGainRange = document.querySelector("#threeKnotOrganicGainRange");
const threeKnotOrganicGainValue = document.querySelector("#threeKnotOrganicGainValue");
const threeKnotOrganicSmoothRange = document.querySelector("#threeKnotOrganicSmoothRange");
const threeKnotOrganicSmoothValue = document.querySelector("#threeKnotOrganicSmoothValue");
const threeKnotOrganicSoftClipRange = document.querySelector("#threeKnotOrganicSoftClipRange");
const threeKnotOrganicSoftClipValue = document.querySelector("#threeKnotOrganicSoftClipValue");
const threeKnotOrganicFallEaseRange = document.querySelector("#threeKnotOrganicFallEaseRange");
const threeKnotOrganicFallEaseValue = document.querySelector("#threeKnotOrganicFallEaseValue");
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

function readHelix3dShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "helix3dShape");
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

async function syncHelix3dShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(helix3dGainRange?.value, 10, 150),
    smoothPercent: clampInt(helix3dSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(helix3dSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(helix3dFallEaseRange?.value, 0, 100),
  };
  if (helix3dGainValue) helix3dGainValue.textContent = String(config.gainPercent);
  if (helix3dSmoothValue) helix3dSmoothValue.textContent = String(config.smoothPercent);
  if (helix3dSoftClipValue) helix3dSoftClipValue.textContent = String(config.softClipPercent);
  if (helix3dFallEaseValue) helix3dFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-helix3d-shape-config", config);
  } catch {
    // ignore emit failures
  }
}

function readThreePlasmaShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaShape");
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

async function syncThreePlasmaShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threePlasmaGainRange?.value, 10, 150),
    smoothPercent: clampInt(threePlasmaSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threePlasmaSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threePlasmaFallEaseRange?.value, 0, 100),
  };
  if (threePlasmaGainValue) threePlasmaGainValue.textContent = String(config.gainPercent);
  if (threePlasmaSmoothValue) threePlasmaSmoothValue.textContent = String(config.smoothPercent);
  if (threePlasmaSoftClipValue) threePlasmaSoftClipValue.textContent = String(config.softClipPercent);
  if (threePlasmaFallEaseValue) threePlasmaFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-plasma-shape-config", config);
  } catch {
    // ignore emit failures
  }
}

function applyThreePlasmaFormFromStorage(v) {
  const sg = readThreePlasmaShapeConfig(v) ?? { ...DEFAULT_CONFIG.threePlasmaField.shape };
  if (threePlasmaGainRange) threePlasmaGainRange.value = String(sg.gainPercent);
  if (threePlasmaSmoothRange) threePlasmaSmoothRange.value = String(sg.smoothPercent);
  if (threePlasmaSoftClipRange) threePlasmaSoftClipRange.value = String(sg.softClipPercent);
  if (threePlasmaFallEaseRange) threePlasmaFallEaseRange.value = String(sg.fallEasePercent);
  if (threePlasmaGainValue) threePlasmaGainValue.textContent = String(sg.gainPercent);
  if (threePlasmaSmoothValue) threePlasmaSmoothValue.textContent = String(sg.smoothPercent);
  if (threePlasmaSoftClipValue) threePlasmaSoftClipValue.textContent = String(sg.softClipPercent);
  if (threePlasmaFallEaseValue) threePlasmaFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColorLow = readWindowStorageString(window.localStorage, v, "threePlasmaColorLow");
  if (threePlasmaColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    threePlasmaColorLow.value = savedColorLow.toLowerCase();
  } else if (threePlasmaColorLow) {
    threePlasmaColorLow.value = DEFAULT_CONFIG.threePlasmaField.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "threePlasmaColorHigh");
  if (threePlasmaColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    threePlasmaColorHigh.value = savedColorHigh.toLowerCase();
  } else if (threePlasmaColorHigh) {
    threePlasmaColorHigh.value = DEFAULT_CONFIG.threePlasmaField.colorHigh;
  }

  const savedSpeed = readWindowStorageString(window.localStorage, v, "threePlasmaSpeed");
  if (threePlasmaSpeedRange) {
    const speed =
      savedSpeed != null && savedSpeed !== ""
        ? Math.min(3, Math.max(0.2, Number(savedSpeed)))
        : DEFAULT_CONFIG.threePlasmaField.speed;
    threePlasmaSpeedRange.value = String(Math.round(speed * 10));
    if (threePlasmaSpeedValue) threePlasmaSpeedValue.textContent = speed.toFixed(1);
  }

  const savedNoiseScale = readWindowStorageString(window.localStorage, v, "threePlasmaNoiseScale");
  if (threePlasmaNoiseScaleRange) {
    const noiseScale =
      savedNoiseScale != null && savedNoiseScale !== ""
        ? Math.min(6, Math.max(0.5, Number(savedNoiseScale)))
        : DEFAULT_CONFIG.threePlasmaField.noiseScale;
    threePlasmaNoiseScaleRange.value = String(Math.round(noiseScale * 10));
    if (threePlasmaNoiseScaleValue) threePlasmaNoiseScaleValue.textContent = noiseScale.toFixed(1);
  }

  const savedReactiveness = readWindowStorageString(window.localStorage, v, "threePlasmaReactiveness");
  if (threePlasmaReactivenessRange) {
    const reactiveness =
      savedReactiveness != null && savedReactiveness !== ""
        ? clampInt(savedReactiveness, 0, 100)
        : DEFAULT_CONFIG.threePlasmaField.reactiveness;
    threePlasmaReactivenessRange.value = String(reactiveness);
    if (threePlasmaReactivenessValue) threePlasmaReactivenessValue.textContent = String(reactiveness);
  }

  if (threePlasmaBloomToggle) {
    threePlasmaBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threePlasmaBloom"),
      DEFAULT_CONFIG.threePlasmaField.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threePlasmaBloomStrength");
  if (threePlasmaBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threePlasmaField.bloomStrength;
    threePlasmaBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threePlasmaBloomStrengthValue) threePlasmaBloomStrengthValue.textContent = bloomStrength.toFixed(1);
  }
}

function readThreeGalaxyShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyShape");
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

async function syncThreeGalaxyShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeGalaxyGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeGalaxySmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeGalaxySoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeGalaxyFallEaseRange?.value, 0, 100),
  };
  if (threeGalaxyGainValue) threeGalaxyGainValue.textContent = String(config.gainPercent);
  if (threeGalaxySmoothValue) threeGalaxySmoothValue.textContent = String(config.smoothPercent);
  if (threeGalaxySoftClipValue) threeGalaxySoftClipValue.textContent = String(config.softClipPercent);
  if (threeGalaxyFallEaseValue) threeGalaxyFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-galaxy-shape-config", config);
  } catch {
    // ignore emit failures
  }
}

function applyThreeGalaxyFormFromStorage(v) {
  const sg = readThreeGalaxyShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeParticleGalaxy.shape };
  if (threeGalaxyGainRange) threeGalaxyGainRange.value = String(sg.gainPercent);
  if (threeGalaxySmoothRange) threeGalaxySmoothRange.value = String(sg.smoothPercent);
  if (threeGalaxySoftClipRange) threeGalaxySoftClipRange.value = String(sg.softClipPercent);
  if (threeGalaxyFallEaseRange) threeGalaxyFallEaseRange.value = String(sg.fallEasePercent);
  if (threeGalaxyGainValue) threeGalaxyGainValue.textContent = String(sg.gainPercent);
  if (threeGalaxySmoothValue) threeGalaxySmoothValue.textContent = String(sg.smoothPercent);
  if (threeGalaxySoftClipValue) threeGalaxySoftClipValue.textContent = String(sg.softClipPercent);
  if (threeGalaxyFallEaseValue) threeGalaxyFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "threeGalaxyColor");
  if (threeGalaxyColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    threeGalaxyColor.value = savedColor.toLowerCase();
  } else if (threeGalaxyColor) {
    threeGalaxyColor.value = DEFAULT_CONFIG.threeParticleGalaxy.particleColor;
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeGalaxyCount");
  if (threeGalaxyCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2000, 20000)
        : DEFAULT_CONFIG.threeParticleGalaxy.particleCount;
    threeGalaxyCountRange.value = String(count);
    if (threeGalaxyCountValue) threeGalaxyCountValue.textContent = String(count);
  }

  const savedRadius = readWindowStorageString(window.localStorage, v, "threeGalaxyRadius");
  if (threeGalaxyRadiusRange) {
    const radius =
      savedRadius != null && savedRadius !== ""
        ? Math.min(2.5, Math.max(0.5, Number(savedRadius)))
        : DEFAULT_CONFIG.threeParticleGalaxy.galaxyRadius;
    threeGalaxyRadiusRange.value = String(Math.round(radius * 10));
    if (threeGalaxyRadiusValue) threeGalaxyRadiusValue.textContent = radius.toFixed(1);
  }

  const savedArms = readWindowStorageString(window.localStorage, v, "threeGalaxyArms");
  if (threeGalaxyArmsSelect) {
    threeGalaxyArmsSelect.value = String(
      savedArms != null && savedArms !== ""
        ? clampInt(savedArms, 1, 4)
        : DEFAULT_CONFIG.threeParticleGalaxy.spiralArms,
    );
  }

  const savedBassPull = readWindowStorageString(window.localStorage, v, "threeGalaxyBassPull");
  if (threeGalaxyBassPullRange) {
    const bassPull =
      savedBassPull != null && savedBassPull !== ""
        ? clampInt(savedBassPull, 0, 100)
        : DEFAULT_CONFIG.threeParticleGalaxy.bassPullStrength;
    threeGalaxyBassPullRange.value = String(bassPull);
    if (threeGalaxyBassPullValue) threeGalaxyBassPullValue.textContent = String(bassPull);
  }

  const savedTrebleSpread = readWindowStorageString(window.localStorage, v, "threeGalaxyTrebleSpread");
  if (threeGalaxyTrebleSpreadRange) {
    const trebleSpread =
      savedTrebleSpread != null && savedTrebleSpread !== ""
        ? clampInt(savedTrebleSpread, 0, 100)
        : DEFAULT_CONFIG.threeParticleGalaxy.trebleSpreadStrength;
    threeGalaxyTrebleSpreadRange.value = String(trebleSpread);
    if (threeGalaxyTrebleSpreadValue) threeGalaxyTrebleSpreadValue.textContent = String(trebleSpread);
  }

  const savedAutoRotate = readWindowStorageString(window.localStorage, v, "threeGalaxyAutoRotateSpeed");
  if (threeGalaxyAutoRotateSpeedRange) {
    const autoRotate =
      savedAutoRotate != null && savedAutoRotate !== ""
        ? Math.min(20, Math.max(0, Number(savedAutoRotate)))
        : DEFAULT_CONFIG.threeParticleGalaxy.autoRotateSpeedDeg;
    threeGalaxyAutoRotateSpeedRange.value = String(autoRotate);
    if (threeGalaxyAutoRotateSpeedValue) threeGalaxyAutoRotateSpeedValue.textContent = String(autoRotate);
  }

  if (threeGalaxyBloomToggle) {
    threeGalaxyBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeGalaxyBloom"),
      DEFAULT_CONFIG.threeParticleGalaxy.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeGalaxyBloomStrength");
  if (threeGalaxyBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeParticleGalaxy.bloomStrength;
    threeGalaxyBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeGalaxyBloomStrengthValue) threeGalaxyBloomStrengthValue.textContent = bloomStrength.toFixed(1);
  }
}

function readThreeTunnelShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeTunnelShape");
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

async function syncThreeTunnelShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeTunnelGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeTunnelSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeTunnelSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeTunnelFallEaseRange?.value, 0, 100),
  };
  if (threeTunnelGainValue) threeTunnelGainValue.textContent = String(config.gainPercent);
  if (threeTunnelSmoothValue) threeTunnelSmoothValue.textContent = String(config.smoothPercent);
  if (threeTunnelSoftClipValue) threeTunnelSoftClipValue.textContent = String(config.softClipPercent);
  if (threeTunnelFallEaseValue) threeTunnelFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threeTunnelShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-tunnel-shape-config", config);
  } catch {
    // ignore emit failures
  }
}

function applyThreeTunnelFormFromStorage(v) {
  const sg = readThreeTunnelShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeBloomTunnel.shape };
  if (threeTunnelGainRange) threeTunnelGainRange.value = String(sg.gainPercent);
  if (threeTunnelSmoothRange) threeTunnelSmoothRange.value = String(sg.smoothPercent);
  if (threeTunnelSoftClipRange) threeTunnelSoftClipRange.value = String(sg.softClipPercent);
  if (threeTunnelFallEaseRange) threeTunnelFallEaseRange.value = String(sg.fallEasePercent);
  if (threeTunnelGainValue) threeTunnelGainValue.textContent = String(sg.gainPercent);
  if (threeTunnelSmoothValue) threeTunnelSmoothValue.textContent = String(sg.smoothPercent);
  if (threeTunnelSoftClipValue) threeTunnelSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeTunnelFallEaseValue) threeTunnelFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedWallLow = readWindowStorageString(window.localStorage, v, "threeTunnelWallColorLow");
  if (threeTunnelWallColorLow && savedWallLow && /^#[0-9A-Fa-f]{6}$/.test(savedWallLow)) {
    threeTunnelWallColorLow.value = savedWallLow.toLowerCase();
  } else if (threeTunnelWallColorLow) {
    threeTunnelWallColorLow.value = DEFAULT_CONFIG.threeBloomTunnel.wallColorLow;
  }

  const savedWallHigh = readWindowStorageString(window.localStorage, v, "threeTunnelWallColorHigh");
  if (threeTunnelWallColorHigh && savedWallHigh && /^#[0-9A-Fa-f]{6}$/.test(savedWallHigh)) {
    threeTunnelWallColorHigh.value = savedWallHigh.toLowerCase();
  } else if (threeTunnelWallColorHigh) {
    threeTunnelWallColorHigh.value = DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh;
  }

  const savedCoreColor = readWindowStorageString(window.localStorage, v, "threeTunnelCoreColor");
  if (threeTunnelCoreColor && savedCoreColor && /^#[0-9A-Fa-f]{6}$/.test(savedCoreColor)) {
    threeTunnelCoreColor.value = savedCoreColor.toLowerCase();
  } else if (threeTunnelCoreColor) {
    threeTunnelCoreColor.value = DEFAULT_CONFIG.threeBloomTunnel.coreColor;
  }

  const savedSpeed = readWindowStorageString(window.localStorage, v, "threeTunnelSpeed");
  if (threeTunnelSpeedRange) {
    const speed =
      savedSpeed != null && savedSpeed !== ""
        ? Math.min(3, Math.max(0.2, Number(savedSpeed)))
        : DEFAULT_CONFIG.threeBloomTunnel.tunnelSpeed;
    threeTunnelSpeedRange.value = String(Math.round(speed * 10));
    if (threeTunnelSpeedValue) threeTunnelSpeedValue.textContent = speed.toFixed(1);
  }

  const savedSegments = readWindowStorageString(window.localStorage, v, "threeTunnelWallSegments");
  if (threeTunnelWallSegmentsRange) {
    const segments =
      savedSegments != null && savedSegments !== ""
        ? clampInt(savedSegments, 16, 64)
        : DEFAULT_CONFIG.threeBloomTunnel.wallSegments;
    threeTunnelWallSegmentsRange.value = String(segments);
    if (threeTunnelWallSegmentsValue) threeTunnelWallSegmentsValue.textContent = String(segments);
  }

  const savedCorePulse = readWindowStorageString(window.localStorage, v, "threeTunnelCorePulseStrength");
  if (threeTunnelCorePulseRange) {
    const corePulse =
      savedCorePulse != null && savedCorePulse !== ""
        ? clampInt(savedCorePulse, 0, 100)
        : DEFAULT_CONFIG.threeBloomTunnel.corePulseStrength;
    threeTunnelCorePulseRange.value = String(corePulse);
    if (threeTunnelCorePulseValue) threeTunnelCorePulseValue.textContent = String(corePulse);
  }

  const savedFov = readWindowStorageString(window.localStorage, v, "threeTunnelFov");
  if (threeTunnelFovRange) {
    const fov =
      savedFov != null && savedFov !== ""
        ? clampInt(savedFov, 45, 85)
        : DEFAULT_CONFIG.threeBloomTunnel.fovDeg;
    threeTunnelFovRange.value = String(fov);
    if (threeTunnelFovValue) threeTunnelFovValue.textContent = String(fov);
  }

  if (threeTunnelBloomToggle) {
    threeTunnelBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeTunnelBloom"),
      DEFAULT_CONFIG.threeBloomTunnel.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeTunnelBloomStrength");
  if (threeTunnelBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeBloomTunnel.bloomStrength;
    threeTunnelBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeTunnelBloomStrengthValue) threeTunnelBloomStrengthValue.textContent = bloomStrength.toFixed(1);
  }
}

function readThreeSphereShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeSphereShape");
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

async function syncThreeSphereShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeSphereGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeSphereSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeSphereSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeSphereFallEaseRange?.value, 0, 100),
  };
  if (threeSphereGainValue) threeSphereGainValue.textContent = String(config.gainPercent);
  if (threeSphereSmoothValue) threeSphereSmoothValue.textContent = String(config.smoothPercent);
  if (threeSphereSoftClipValue) threeSphereSoftClipValue.textContent = String(config.softClipPercent);
  if (threeSphereFallEaseValue) threeSphereFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threeSphereShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-sphere-shape-config", config);
  } catch {
    // ignore emit failures
  }
}

function applyThreeSphereFormFromStorage(v) {
  const sg = readThreeSphereShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeEnergySphere.shape };
  if (threeSphereGainRange) threeSphereGainRange.value = String(sg.gainPercent);
  if (threeSphereSmoothRange) threeSphereSmoothRange.value = String(sg.smoothPercent);
  if (threeSphereSoftClipRange) threeSphereSoftClipRange.value = String(sg.softClipPercent);
  if (threeSphereFallEaseRange) threeSphereFallEaseRange.value = String(sg.fallEasePercent);
  if (threeSphereGainValue) threeSphereGainValue.textContent = String(sg.gainPercent);
  if (threeSphereSmoothValue) threeSphereSmoothValue.textContent = String(sg.smoothPercent);
  if (threeSphereSoftClipValue) threeSphereSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeSphereFallEaseValue) threeSphereFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedCoreColor = readWindowStorageString(window.localStorage, v, "threeSphereCoreColor");
  if (threeSphereCoreColor && savedCoreColor && /^#[0-9A-Fa-f]{6}$/.test(savedCoreColor)) {
    threeSphereCoreColor.value = savedCoreColor.toLowerCase();
  } else if (threeSphereCoreColor) {
    threeSphereCoreColor.value = DEFAULT_CONFIG.threeEnergySphere.coreColor;
  }

  const savedHaloColor = readWindowStorageString(window.localStorage, v, "threeSphereHaloColor");
  if (threeSphereHaloColor && savedHaloColor && /^#[0-9A-Fa-f]{6}$/.test(savedHaloColor)) {
    threeSphereHaloColor.value = savedHaloColor.toLowerCase();
  } else if (threeSphereHaloColor) {
    threeSphereHaloColor.value = DEFAULT_CONFIG.threeEnergySphere.haloColor;
  }

  const savedDeform = readWindowStorageString(window.localStorage, v, "threeSphereDeformStrength");
  if (threeSphereDeformRange) {
    const deform =
      savedDeform != null && savedDeform !== ""
        ? clampInt(savedDeform, 0, 100)
        : DEFAULT_CONFIG.threeEnergySphere.deformStrength;
    threeSphereDeformRange.value = String(deform);
    if (threeSphereDeformValue) threeSphereDeformValue.textContent = String(deform);
  }

  const savedNoiseSpeed = readWindowStorageString(window.localStorage, v, "threeSphereNoiseSpeed");
  if (threeSphereNoiseSpeedRange) {
    const noiseSpeed =
      savedNoiseSpeed != null && savedNoiseSpeed !== ""
        ? Math.min(3, Math.max(0.2, Number(savedNoiseSpeed)))
        : DEFAULT_CONFIG.threeEnergySphere.noiseSpeed;
    threeSphereNoiseSpeedRange.value = String(Math.round(noiseSpeed * 10));
    if (threeSphereNoiseSpeedValue) threeSphereNoiseSpeedValue.textContent = noiseSpeed.toFixed(1);
  }

  const savedHaloCount = readWindowStorageString(window.localStorage, v, "threeSphereHaloCount");
  if (threeSphereHaloCountRange) {
    const haloCount =
      savedHaloCount != null && savedHaloCount !== ""
        ? clampInt(savedHaloCount, 200, 3000)
        : DEFAULT_CONFIG.threeEnergySphere.haloParticleCount;
    threeSphereHaloCountRange.value = String(haloCount);
    if (threeSphereHaloCountValue) threeSphereHaloCountValue.textContent = String(haloCount);
  }

  const savedAutoRotate = readWindowStorageString(window.localStorage, v, "threeSphereAutoRotateSpeed");
  if (threeSphereAutoRotateSpeedRange) {
    const autoRotate =
      savedAutoRotate != null && savedAutoRotate !== ""
        ? Math.min(20, Math.max(0, Number(savedAutoRotate)))
        : DEFAULT_CONFIG.threeEnergySphere.autoRotateSpeedDeg;
    threeSphereAutoRotateSpeedRange.value = String(Math.round(autoRotate));
    if (threeSphereAutoRotateSpeedValue) threeSphereAutoRotateSpeedValue.textContent = String(Math.round(autoRotate));
  }

  if (threeSphereWireframeToggle) {
    threeSphereWireframeToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeSphereWireframe"),
      DEFAULT_CONFIG.threeEnergySphere.wireframeOverlay,
    );
  }

  if (threeSphereBloomToggle) {
    threeSphereBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeSphereBloom"),
      DEFAULT_CONFIG.threeEnergySphere.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeSphereBloomStrength");
  if (threeSphereBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeEnergySphere.bloomStrength;
    threeSphereBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeSphereBloomStrengthValue) threeSphereBloomStrengthValue.textContent = bloomStrength.toFixed(1);
  }
}

function readThreeKaleidoscopeShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeKaleidoscopeShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeKaleidoscopeShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeKaleidoscopeGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeKaleidoscopeSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeKaleidoscopeSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeKaleidoscopeFallEaseRange?.value, 0, 100),
  };
  if (threeKaleidoscopeGainValue) threeKaleidoscopeGainValue.textContent = String(config.gainPercent);
  if (threeKaleidoscopeSmoothValue) threeKaleidoscopeSmoothValue.textContent = String(config.smoothPercent);
  if (threeKaleidoscopeSoftClipValue) threeKaleidoscopeSoftClipValue.textContent = String(config.softClipPercent);
  if (threeKaleidoscopeFallEaseValue) threeKaleidoscopeFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threeKaleidoscopeShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-kaleidoscope-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新万花筒形状配置失败：${String(err)}`;
  }
}

function applyThreeKaleidoscopeFormFromStorage(v) {
  const sg = readThreeKaleidoscopeShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeKaleidoscope.shape };
  if (threeKaleidoscopeGainRange) threeKaleidoscopeGainRange.value = String(sg.gainPercent);
  if (threeKaleidoscopeSmoothRange) threeKaleidoscopeSmoothRange.value = String(sg.smoothPercent);
  if (threeKaleidoscopeSoftClipRange) threeKaleidoscopeSoftClipRange.value = String(sg.softClipPercent);
  if (threeKaleidoscopeFallEaseRange) threeKaleidoscopeFallEaseRange.value = String(sg.fallEasePercent);
  if (threeKaleidoscopeGainValue) threeKaleidoscopeGainValue.textContent = String(sg.gainPercent);
  if (threeKaleidoscopeSmoothValue) threeKaleidoscopeSmoothValue.textContent = String(sg.smoothPercent);
  if (threeKaleidoscopeSoftClipValue) threeKaleidoscopeSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeKaleidoscopeFallEaseValue) threeKaleidoscopeFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedSegments = readWindowStorageString(window.localStorage, v, "threeKaleidoscopeSegments");
  if (threeKaleidoscopeSegmentsSelect) {
    const segments = normalizeKaleidoscopeSegments(
      savedSegments ?? DEFAULT_CONFIG.threeKaleidoscope.segments,
      DEFAULT_CONFIG.threeKaleidoscope.segments,
    );
    threeKaleidoscopeSegmentsSelect.value = String(segments);
  }

  const savedColorLow = readWindowStorageString(window.localStorage, v, "threeKaleidoscopeColorLow");
  if (threeKaleidoscopeColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    threeKaleidoscopeColorLow.value = savedColorLow.toLowerCase();
  } else if (threeKaleidoscopeColorLow) {
    threeKaleidoscopeColorLow.value = DEFAULT_CONFIG.threeKaleidoscope.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "threeKaleidoscopeColorHigh");
  if (threeKaleidoscopeColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    threeKaleidoscopeColorHigh.value = savedColorHigh.toLowerCase();
  } else if (threeKaleidoscopeColorHigh) {
    threeKaleidoscopeColorHigh.value = DEFAULT_CONFIG.threeKaleidoscope.colorHigh;
  }

  const savedRotation = readWindowStorageString(window.localStorage, v, "threeKaleidoscopeRotationSpeed");
  if (threeKaleidoscopeRotationSpeedRange) {
    const rotationSpeed =
      savedRotation != null && savedRotation !== ""
        ? Math.min(30, Math.max(0, Number(savedRotation)))
        : DEFAULT_CONFIG.threeKaleidoscope.rotationSpeedDeg;
    threeKaleidoscopeRotationSpeedRange.value = String(Math.round(rotationSpeed));
    if (threeKaleidoscopeRotationSpeedValue) {
      threeKaleidoscopeRotationSpeedValue.textContent = String(Math.round(rotationSpeed));
    }
  }

  const savedReactiveness = readWindowStorageString(window.localStorage, v, "threeKaleidoscopeReactiveness");
  if (threeKaleidoscopeReactivenessRange) {
    const reactiveness =
      savedReactiveness != null && savedReactiveness !== ""
        ? clampInt(savedReactiveness, 0, 100)
        : DEFAULT_CONFIG.threeKaleidoscope.reactiveness;
    threeKaleidoscopeReactivenessRange.value = String(reactiveness);
    if (threeKaleidoscopeReactivenessValue) {
      threeKaleidoscopeReactivenessValue.textContent = String(reactiveness);
    }
  }

  if (threeKaleidoscopeBloomToggle) {
    threeKaleidoscopeBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeKaleidoscopeBloom"),
      DEFAULT_CONFIG.threeKaleidoscope.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeKaleidoscopeBloomStrength");
  if (threeKaleidoscopeBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeKaleidoscope.bloomStrength;
    threeKaleidoscopeBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeKaleidoscopeBloomStrengthValue) {
      threeKaleidoscopeBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeGlitchShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeGlitchShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeGlitchShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeGlitchGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeGlitchSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeGlitchSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeGlitchFallEaseRange?.value, 0, 100),
  };
  if (threeGlitchGainValue) threeGlitchGainValue.textContent = String(config.gainPercent);
  if (threeGlitchSmoothValue) threeGlitchSmoothValue.textContent = String(config.smoothPercent);
  if (threeGlitchSoftClipValue) threeGlitchSoftClipValue.textContent = String(config.softClipPercent);
  if (threeGlitchFallEaseValue) threeGlitchFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGlitchShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-glitch-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新故障频谱形状配置失败：${String(err)}`;
  }
}

function applyThreeGlitchFormFromStorage(v) {
  const sg = readThreeGlitchShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeGlitchSpectrum.shape };
  if (threeGlitchGainRange) threeGlitchGainRange.value = String(sg.gainPercent);
  if (threeGlitchSmoothRange) threeGlitchSmoothRange.value = String(sg.smoothPercent);
  if (threeGlitchSoftClipRange) threeGlitchSoftClipRange.value = String(sg.softClipPercent);
  if (threeGlitchFallEaseRange) threeGlitchFallEaseRange.value = String(sg.fallEasePercent);
  if (threeGlitchGainValue) threeGlitchGainValue.textContent = String(sg.gainPercent);
  if (threeGlitchSmoothValue) threeGlitchSmoothValue.textContent = String(sg.smoothPercent);
  if (threeGlitchSoftClipValue) threeGlitchSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeGlitchFallEaseValue) threeGlitchFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedBaseColor = readWindowStorageString(window.localStorage, v, "threeGlitchBaseColor");
  if (threeGlitchBaseColor && savedBaseColor && /^#[0-9A-Fa-f]{6}$/.test(savedBaseColor)) {
    threeGlitchBaseColor.value = savedBaseColor.toLowerCase();
  } else if (threeGlitchBaseColor) {
    threeGlitchBaseColor.value = DEFAULT_CONFIG.threeGlitchSpectrum.baseColor;
  }

  const savedIntensity = readWindowStorageString(window.localStorage, v, "threeGlitchIntensity");
  if (threeGlitchIntensityRange) {
    const intensity =
      savedIntensity != null && savedIntensity !== ""
        ? clampInt(savedIntensity, 0, 100)
        : DEFAULT_CONFIG.threeGlitchSpectrum.glitchIntensity;
    threeGlitchIntensityRange.value = String(intensity);
    if (threeGlitchIntensityValue) threeGlitchIntensityValue.textContent = String(intensity);
  }

  const savedRgbSplit = readWindowStorageString(window.localStorage, v, "threeGlitchRgbSplit");
  if (threeGlitchRgbSplitRange) {
    const rgbSplit =
      savedRgbSplit != null && savedRgbSplit !== ""
        ? clampInt(savedRgbSplit, 0, 12)
        : DEFAULT_CONFIG.threeGlitchSpectrum.rgbSplitPx;
    threeGlitchRgbSplitRange.value = String(rgbSplit);
    if (threeGlitchRgbSplitValue) threeGlitchRgbSplitValue.textContent = String(rgbSplit);
  }

  const savedScanline = readWindowStorageString(window.localStorage, v, "threeGlitchScanlineOpacity");
  if (threeGlitchScanlineOpacityRange) {
    const scanlineOpacity =
      savedScanline != null && savedScanline !== ""
        ? clampInt(savedScanline, 0, 100)
        : DEFAULT_CONFIG.threeGlitchSpectrum.scanlineOpacity;
    threeGlitchScanlineOpacityRange.value = String(scanlineOpacity);
    if (threeGlitchScanlineOpacityValue) {
      threeGlitchScanlineOpacityValue.textContent = String(scanlineOpacity);
    }
  }

  const savedThreshold = readWindowStorageString(window.localStorage, v, "threeGlitchTriggerThreshold");
  if (threeGlitchTriggerThresholdRange) {
    const triggerThreshold =
      savedThreshold != null && savedThreshold !== ""
        ? clampInt(savedThreshold, 0, 100)
        : DEFAULT_CONFIG.threeGlitchSpectrum.triggerThreshold;
    threeGlitchTriggerThresholdRange.value = String(triggerThreshold);
    if (threeGlitchTriggerThresholdValue) {
      threeGlitchTriggerThresholdValue.textContent = String(triggerThreshold);
    }
  }

  const savedCooldown = readWindowStorageString(window.localStorage, v, "threeGlitchCooldownMs");
  if (threeGlitchCooldownRange) {
    const cooldownMs =
      savedCooldown != null && savedCooldown !== ""
        ? clampInt(savedCooldown, 30, 2000)
        : DEFAULT_CONFIG.threeGlitchSpectrum.cooldownMs;
    threeGlitchCooldownRange.value = String(cooldownMs);
    if (threeGlitchCooldownValue) threeGlitchCooldownValue.textContent = String(cooldownMs);
  }
}

function readThreePhosphorShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threePhosphorShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreePhosphorShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threePhosphorGainRange?.value, 10, 150),
    smoothPercent: clampInt(threePhosphorSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threePhosphorSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threePhosphorFallEaseRange?.value, 0, 100),
  };
  if (threePhosphorGainValue) threePhosphorGainValue.textContent = String(config.gainPercent);
  if (threePhosphorSmoothValue) threePhosphorSmoothValue.textContent = String(config.smoothPercent);
  if (threePhosphorSoftClipValue) threePhosphorSoftClipValue.textContent = String(config.softClipPercent);
  if (threePhosphorFallEaseValue) threePhosphorFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threePhosphorShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-phosphor-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新磷光余辉形状配置失败：${String(err)}`;
  }
}

function applyThreePhosphorFormFromStorage(v) {
  const sg = readThreePhosphorShapeConfig(v) ?? { ...DEFAULT_CONFIG.threePhosphorTrail.shape };
  if (threePhosphorGainRange) threePhosphorGainRange.value = String(sg.gainPercent);
  if (threePhosphorSmoothRange) threePhosphorSmoothRange.value = String(sg.smoothPercent);
  if (threePhosphorSoftClipRange) threePhosphorSoftClipRange.value = String(sg.softClipPercent);
  if (threePhosphorFallEaseRange) threePhosphorFallEaseRange.value = String(sg.fallEasePercent);
  if (threePhosphorGainValue) threePhosphorGainValue.textContent = String(sg.gainPercent);
  if (threePhosphorSmoothValue) threePhosphorSmoothValue.textContent = String(sg.smoothPercent);
  if (threePhosphorSoftClipValue) threePhosphorSoftClipValue.textContent = String(sg.softClipPercent);
  if (threePhosphorFallEaseValue) threePhosphorFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedLineColor = readWindowStorageString(window.localStorage, v, "threePhosphorLineColor");
  if (threePhosphorLineColor && savedLineColor && /^#[0-9A-Fa-f]{6}$/.test(savedLineColor)) {
    threePhosphorLineColor.value = savedLineColor.toLowerCase();
  } else if (threePhosphorLineColor) {
    threePhosphorLineColor.value = DEFAULT_CONFIG.threePhosphorTrail.lineColor;
  }

  const savedGlowColor = readWindowStorageString(window.localStorage, v, "threePhosphorGlowColor");
  if (threePhosphorGlowColor && savedGlowColor && /^#[0-9A-Fa-f]{6}$/.test(savedGlowColor)) {
    threePhosphorGlowColor.value = savedGlowColor.toLowerCase();
  } else if (threePhosphorGlowColor) {
    threePhosphorGlowColor.value = DEFAULT_CONFIG.threePhosphorTrail.glowColor;
  }

  const savedLineWidth = readWindowStorageString(window.localStorage, v, "threePhosphorLineWidth");
  if (threePhosphorLineWidthRange) {
    const lineWidthPx =
      savedLineWidth != null && savedLineWidth !== ""
        ? clampInt(savedLineWidth, 1, 12)
        : DEFAULT_CONFIG.threePhosphorTrail.lineWidthPx;
    threePhosphorLineWidthRange.value = String(lineWidthPx);
    if (threePhosphorLineWidthValue) threePhosphorLineWidthValue.textContent = String(lineWidthPx);
  }

  const savedDecay = readWindowStorageString(window.localStorage, v, "threePhosphorDecay");
  if (threePhosphorDecayRange) {
    const decayPercent =
      savedDecay != null && savedDecay !== ""
        ? clampInt(savedDecay, 10, 90)
        : DEFAULT_CONFIG.threePhosphorTrail.decayPercent;
    threePhosphorDecayRange.value = String(decayPercent);
    if (threePhosphorDecayValue) threePhosphorDecayValue.textContent = String(decayPercent);
  }

  if (threePhosphorBloomToggle) {
    threePhosphorBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threePhosphorBloom"),
      DEFAULT_CONFIG.threePhosphorTrail.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threePhosphorBloomStrength");
  if (threePhosphorBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threePhosphorTrail.bloomStrength;
    threePhosphorBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threePhosphorBloomStrengthValue) {
      threePhosphorBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }

  if (threePhosphorMirrorToggle) {
    threePhosphorMirrorToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threePhosphorMirror"),
      DEFAULT_CONFIG.threePhosphorTrail.mirrorEnabled,
    );
  }
}

function readThreeScanGridShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeScanGridShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeScanGridGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeScanGridSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeScanGridSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeScanGridFallEaseRange?.value, 0, 100),
  };
  if (threeScanGridGainValue) threeScanGridGainValue.textContent = String(config.gainPercent);
  if (threeScanGridSmoothValue) threeScanGridSmoothValue.textContent = String(config.smoothPercent);
  if (threeScanGridSoftClipValue) threeScanGridSoftClipValue.textContent = String(config.softClipPercent);
  if (threeScanGridFallEaseValue) threeScanGridFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridShape", JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-scan-grid-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新扫描网格形状配置失败：${String(err)}`;
  }
}

function applyThreeScanGridFormFromStorage(v) {
  const sg = readThreeScanGridShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeScanGrid.shape };
  if (threeScanGridGainRange) threeScanGridGainRange.value = String(sg.gainPercent);
  if (threeScanGridSmoothRange) threeScanGridSmoothRange.value = String(sg.smoothPercent);
  if (threeScanGridSoftClipRange) threeScanGridSoftClipRange.value = String(sg.softClipPercent);
  if (threeScanGridFallEaseRange) threeScanGridFallEaseRange.value = String(sg.fallEasePercent);
  if (threeScanGridGainValue) threeScanGridGainValue.textContent = String(sg.gainPercent);
  if (threeScanGridSmoothValue) threeScanGridSmoothValue.textContent = String(sg.smoothPercent);
  if (threeScanGridSoftClipValue) threeScanGridSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeScanGridFallEaseValue) threeScanGridFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedGridColor = readWindowStorageString(window.localStorage, v, "threeScanGridColor");
  if (threeScanGridColor && savedGridColor && /^#[0-9A-Fa-f]{6}$/.test(savedGridColor)) {
    threeScanGridColor.value = savedGridColor.toLowerCase();
  } else if (threeScanGridColor) {
    threeScanGridColor.value = DEFAULT_CONFIG.threeScanGrid.gridColor;
  }

  const savedHighlightColor = readWindowStorageString(window.localStorage, v, "threeScanGridHighlightColor");
  if (threeScanGridHighlightColor && savedHighlightColor && /^#[0-9A-Fa-f]{6}$/.test(savedHighlightColor)) {
    threeScanGridHighlightColor.value = savedHighlightColor.toLowerCase();
  } else if (threeScanGridHighlightColor) {
    threeScanGridHighlightColor.value = DEFAULT_CONFIG.threeScanGrid.highlightColor;
  }

  const savedBeamColor = readWindowStorageString(window.localStorage, v, "threeScanGridScanBeamColor");
  if (threeScanGridScanBeamColor && savedBeamColor && /^#[0-9A-Fa-f]{6}$/.test(savedBeamColor)) {
    threeScanGridScanBeamColor.value = savedBeamColor.toLowerCase();
  } else if (threeScanGridScanBeamColor) {
    threeScanGridScanBeamColor.value = DEFAULT_CONFIG.threeScanGrid.scanBeamColor;
  }

  const savedRows = readWindowStorageString(window.localStorage, v, "threeScanGridRows");
  if (threeScanGridRowsRange) {
    const rows =
      savedRows != null && savedRows !== ""
        ? clampInt(savedRows, 12, 48)
        : DEFAULT_CONFIG.threeScanGrid.gridRows;
    threeScanGridRowsRange.value = String(rows);
    if (threeScanGridRowsValue) threeScanGridRowsValue.textContent = String(rows);
  }

  const savedCols = readWindowStorageString(window.localStorage, v, "threeScanGridCols");
  if (threeScanGridColsRange) {
    const cols =
      savedCols != null && savedCols !== ""
        ? clampInt(savedCols, 16, 64)
        : DEFAULT_CONFIG.threeScanGrid.gridCols;
    threeScanGridColsRange.value = String(cols);
    if (threeScanGridColsValue) threeScanGridColsValue.textContent = String(cols);
  }

  const savedSpeed = readWindowStorageString(window.localStorage, v, "threeScanGridScanSpeed");
  if (threeScanGridScanSpeedRange) {
    const speed =
      savedSpeed != null && savedSpeed !== ""
        ? Math.min(3, Math.max(0.2, Number(savedSpeed)))
        : DEFAULT_CONFIG.threeScanGrid.scanSpeed;
    threeScanGridScanSpeedRange.value = String(Math.round(speed * 10));
    if (threeScanGridScanSpeedValue) threeScanGridScanSpeedValue.textContent = speed.toFixed(1);
  }

  const savedHighlightStrength = readWindowStorageString(window.localStorage, v, "threeScanGridHighlightStrength");
  if (threeScanGridHighlightStrengthRange) {
    const strength =
      savedHighlightStrength != null && savedHighlightStrength !== ""
        ? clampInt(savedHighlightStrength, 0, 100)
        : DEFAULT_CONFIG.threeScanGrid.highlightStrength;
    threeScanGridHighlightStrengthRange.value = String(strength);
    if (threeScanGridHighlightStrengthValue) {
      threeScanGridHighlightStrengthValue.textContent = String(strength);
    }
  }

  const savedPitch = readWindowStorageString(window.localStorage, v, "threeScanGridCameraPitch");
  if (threeScanGridCameraPitchRange) {
    const pitch =
      savedPitch != null && savedPitch !== ""
        ? clampInt(savedPitch, 25, 75)
        : DEFAULT_CONFIG.threeScanGrid.cameraPitchDeg;
    threeScanGridCameraPitchRange.value = String(pitch);
    if (threeScanGridCameraPitchValue) threeScanGridCameraPitchValue.textContent = String(pitch);
  }

  if (threeScanGridBloomToggle) {
    threeScanGridBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeScanGridBloom"),
      DEFAULT_CONFIG.threeScanGrid.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeScanGridBloomStrength");
  if (threeScanGridBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeScanGrid.bloomStrength;
    threeScanGridBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeScanGridBloomStrengthValue) {
      threeScanGridBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeLiquidBlobShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeLiquidBlobShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeLiquidBlobShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeLiquidBlobGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeLiquidBlobSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeLiquidBlobSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeLiquidBlobFallEaseRange?.value, 0, 100),
  };
  if (threeLiquidBlobGainValue) threeLiquidBlobGainValue.textContent = String(config.gainPercent);
  if (threeLiquidBlobSmoothValue) threeLiquidBlobSmoothValue.textContent = String(config.smoothPercent);
  if (threeLiquidBlobSoftClipValue) threeLiquidBlobSoftClipValue.textContent = String(config.softClipPercent);
  if (threeLiquidBlobFallEaseValue) threeLiquidBlobFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeLiquidBlobShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-liquid-blob-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新液态球体形状配置失败：${String(err)}`;
  }
}

function applyThreeLiquidBlobFormFromStorage(v) {
  const sg = readThreeLiquidBlobShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeLiquidBlob.shape };
  if (threeLiquidBlobGainRange) threeLiquidBlobGainRange.value = String(sg.gainPercent);
  if (threeLiquidBlobSmoothRange) threeLiquidBlobSmoothRange.value = String(sg.smoothPercent);
  if (threeLiquidBlobSoftClipRange) threeLiquidBlobSoftClipRange.value = String(sg.softClipPercent);
  if (threeLiquidBlobFallEaseRange) threeLiquidBlobFallEaseRange.value = String(sg.fallEasePercent);
  if (threeLiquidBlobGainValue) threeLiquidBlobGainValue.textContent = String(sg.gainPercent);
  if (threeLiquidBlobSmoothValue) threeLiquidBlobSmoothValue.textContent = String(sg.smoothPercent);
  if (threeLiquidBlobSoftClipValue) threeLiquidBlobSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeLiquidBlobFallEaseValue) threeLiquidBlobFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "threeLiquidBlobColor");
  if (threeLiquidBlobColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    threeLiquidBlobColor.value = savedColor.toLowerCase();
  } else if (threeLiquidBlobColor) {
    threeLiquidBlobColor.value = DEFAULT_CONFIG.threeLiquidBlob.blobColor;
  }

  const savedSecondary = readWindowStorageString(window.localStorage, v, "threeLiquidBlobColorSecondary");
  if (threeLiquidBlobColorSecondary && savedSecondary && /^#[0-9A-Fa-f]{6}$/.test(savedSecondary)) {
    threeLiquidBlobColorSecondary.value = savedSecondary.toLowerCase();
  } else if (threeLiquidBlobColorSecondary) {
    threeLiquidBlobColorSecondary.value = DEFAULT_CONFIG.threeLiquidBlob.blobColorSecondary;
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeLiquidBlobCount");
  if (threeLiquidBlobCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2, 5)
        : DEFAULT_CONFIG.threeLiquidBlob.blobCount;
    threeLiquidBlobCountRange.value = String(count);
    if (threeLiquidBlobCountValue) threeLiquidBlobCountValue.textContent = String(count);
  }

  const savedMerge = readWindowStorageString(window.localStorage, v, "threeLiquidBlobMergeStrength");
  if (threeLiquidBlobMergeStrengthRange) {
    const merge =
      savedMerge != null && savedMerge !== ""
        ? clampInt(savedMerge, 0, 100)
        : DEFAULT_CONFIG.threeLiquidBlob.mergeStrength;
    threeLiquidBlobMergeStrengthRange.value = String(merge);
    if (threeLiquidBlobMergeStrengthValue) {
      threeLiquidBlobMergeStrengthValue.textContent = String(merge);
    }
  }

  const savedWobble = readWindowStorageString(window.localStorage, v, "threeLiquidBlobWobbleSpeed");
  if (threeLiquidBlobWobbleSpeedRange) {
    const wobble =
      savedWobble != null && savedWobble !== ""
        ? Math.min(3, Math.max(0.2, Number(savedWobble)))
        : DEFAULT_CONFIG.threeLiquidBlob.wobbleSpeed;
    threeLiquidBlobWobbleSpeedRange.value = String(Math.round(wobble * 10));
    if (threeLiquidBlobWobbleSpeedValue) threeLiquidBlobWobbleSpeedValue.textContent = wobble.toFixed(1);
  }

  const savedBassDrive = readWindowStorageString(window.localStorage, v, "threeLiquidBlobBassDrive");
  if (threeLiquidBlobBassDriveRange) {
    const bassDrive =
      savedBassDrive != null && savedBassDrive !== ""
        ? clampInt(savedBassDrive, 0, 100)
        : DEFAULT_CONFIG.threeLiquidBlob.bassDrive;
    threeLiquidBlobBassDriveRange.value = String(bassDrive);
    if (threeLiquidBlobBassDriveValue) threeLiquidBlobBassDriveValue.textContent = String(bassDrive);
  }

  if (threeLiquidBlobPulseOnPeakToggle) {
    threeLiquidBlobPulseOnPeakToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeLiquidBlobPulseOnPeak"),
      DEFAULT_CONFIG.threeLiquidBlob.pulseOnPeak,
    );
  }

  if (threeLiquidBlobBloomToggle) {
    threeLiquidBlobBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeLiquidBlobBloom"),
      DEFAULT_CONFIG.threeLiquidBlob.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeLiquidBlobBloomStrength");
  if (threeLiquidBlobBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeLiquidBlob.bloomStrength;
    threeLiquidBlobBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeLiquidBlobBloomStrengthValue) {
      threeLiquidBlobBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeLavaLampShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeLavaLampShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeLavaLampShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeLavaLampGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeLavaLampSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeLavaLampSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeLavaLampFallEaseRange?.value, 0, 100),
  };
  if (threeLavaLampGainValue) threeLavaLampGainValue.textContent = String(config.gainPercent);
  if (threeLavaLampSmoothValue) threeLavaLampSmoothValue.textContent = String(config.smoothPercent);
  if (threeLavaLampSoftClipValue) threeLavaLampSoftClipValue.textContent = String(config.softClipPercent);
  if (threeLavaLampFallEaseValue) threeLavaLampFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeLavaLampShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-lava-lamp-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新熔岩灯形状配置失败：${String(err)}`;
  }
}

function applyThreeLavaLampFormFromStorage(v) {
  const sg = readThreeLavaLampShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeLavaLamp.shape };
  if (threeLavaLampGainRange) threeLavaLampGainRange.value = String(sg.gainPercent);
  if (threeLavaLampSmoothRange) threeLavaLampSmoothRange.value = String(sg.smoothPercent);
  if (threeLavaLampSoftClipRange) threeLavaLampSoftClipRange.value = String(sg.softClipPercent);
  if (threeLavaLampFallEaseRange) threeLavaLampFallEaseRange.value = String(sg.fallEasePercent);
  if (threeLavaLampGainValue) threeLavaLampGainValue.textContent = String(sg.gainPercent);
  if (threeLavaLampSmoothValue) threeLavaLampSmoothValue.textContent = String(sg.smoothPercent);
  if (threeLavaLampSoftClipValue) threeLavaLampSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeLavaLampFallEaseValue) threeLavaLampFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedWarm = readWindowStorageString(window.localStorage, v, "threeLavaLampColorWarm");
  if (threeLavaLampColorWarm && savedWarm && /^#[0-9A-Fa-f]{6}$/.test(savedWarm)) {
    threeLavaLampColorWarm.value = savedWarm.toLowerCase();
  } else if (threeLavaLampColorWarm) {
    threeLavaLampColorWarm.value = DEFAULT_CONFIG.threeLavaLamp.colorWarm;
  }

  const savedCool = readWindowStorageString(window.localStorage, v, "threeLavaLampColorCool");
  if (threeLavaLampColorCool && savedCool && /^#[0-9A-Fa-f]{6}$/.test(savedCool)) {
    threeLavaLampColorCool.value = savedCool.toLowerCase();
  } else if (threeLavaLampColorCool) {
    threeLavaLampColorCool.value = DEFAULT_CONFIG.threeLavaLamp.colorCool;
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeLavaLampBlobCount");
  if (threeLavaLampBlobCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2, 4)
        : DEFAULT_CONFIG.threeLavaLamp.blobCount;
    threeLavaLampBlobCountRange.value = String(count);
    if (threeLavaLampBlobCountValue) threeLavaLampBlobCountValue.textContent = String(count);
  }

  const savedMerge = readWindowStorageString(window.localStorage, v, "threeLavaLampMergeStrength");
  if (threeLavaLampMergeStrengthRange) {
    const merge =
      savedMerge != null && savedMerge !== ""
        ? clampInt(savedMerge, 0, 100)
        : DEFAULT_CONFIG.threeLavaLamp.mergeStrength;
    threeLavaLampMergeStrengthRange.value = String(merge);
    if (threeLavaLampMergeStrengthValue) {
      threeLavaLampMergeStrengthValue.textContent = String(merge);
    }
  }

  const savedBuoyancy = readWindowStorageString(window.localStorage, v, "threeLavaLampBuoyancySpeed");
  if (threeLavaLampBuoyancySpeedRange) {
    const buoyancy =
      savedBuoyancy != null && savedBuoyancy !== ""
        ? Math.min(2, Math.max(0.2, Number(savedBuoyancy)))
        : DEFAULT_CONFIG.threeLavaLamp.buoyancySpeed;
    threeLavaLampBuoyancySpeedRange.value = String(Math.round(buoyancy * 10));
    if (threeLavaLampBuoyancySpeedValue) {
      threeLavaLampBuoyancySpeedValue.textContent = buoyancy.toFixed(2);
    }
  }

  const savedBassDrive = readWindowStorageString(window.localStorage, v, "threeLavaLampBassDrive");
  if (threeLavaLampBassDriveRange) {
    const bassDrive =
      savedBassDrive != null && savedBassDrive !== ""
        ? clampInt(savedBassDrive, 0, 100)
        : DEFAULT_CONFIG.threeLavaLamp.bassDrive;
    threeLavaLampBassDriveRange.value = String(bassDrive);
    if (threeLavaLampBassDriveValue) threeLavaLampBassDriveValue.textContent = String(bassDrive);
  }

  if (threeLavaLampBloomToggle) {
    threeLavaLampBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeLavaLampBloom"),
      DEFAULT_CONFIG.threeLavaLamp.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeLavaLampBloomStrength");
  if (threeLavaLampBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeLavaLamp.bloomStrength;
    threeLavaLampBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeLavaLampBloomStrengthValue) {
      threeLavaLampBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeOilMarbleShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeOilMarbleShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeOilMarbleShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeOilMarbleGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeOilMarbleSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeOilMarbleSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeOilMarbleFallEaseRange?.value, 0, 100),
  };
  if (threeOilMarbleGainValue) threeOilMarbleGainValue.textContent = String(config.gainPercent);
  if (threeOilMarbleSmoothValue) threeOilMarbleSmoothValue.textContent = String(config.smoothPercent);
  if (threeOilMarbleSoftClipValue) threeOilMarbleSoftClipValue.textContent = String(config.softClipPercent);
  if (threeOilMarbleFallEaseValue) threeOilMarbleFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeOilMarbleShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-oil-marble-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新油彩大理石形状配置失败：${String(err)}`;
  }
}

function applyThreeOilMarbleFormFromStorage(v) {
  const sg = readThreeOilMarbleShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeOilMarble.shape };
  if (threeOilMarbleGainRange) threeOilMarbleGainRange.value = String(sg.gainPercent);
  if (threeOilMarbleSmoothRange) threeOilMarbleSmoothRange.value = String(sg.smoothPercent);
  if (threeOilMarbleSoftClipRange) threeOilMarbleSoftClipRange.value = String(sg.softClipPercent);
  if (threeOilMarbleFallEaseRange) threeOilMarbleFallEaseRange.value = String(sg.fallEasePercent);
  if (threeOilMarbleGainValue) threeOilMarbleGainValue.textContent = String(sg.gainPercent);
  if (threeOilMarbleSmoothValue) threeOilMarbleSmoothValue.textContent = String(sg.smoothPercent);
  if (threeOilMarbleSoftClipValue) threeOilMarbleSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeOilMarbleFallEaseValue) threeOilMarbleFallEaseValue.textContent = String(sg.fallEasePercent);

  const colorKeys = [
    ["threeOilMarbleColor1", threeOilMarbleColor1, "color1"],
    ["threeOilMarbleColor2", threeOilMarbleColor2, "color2"],
    ["threeOilMarbleColor3", threeOilMarbleColor3, "color3"],
    ["threeOilMarbleColor4", threeOilMarbleColor4, "color4"],
  ];
  for (const [storageKey, el, defaultKey] of colorKeys) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threeOilMarble[defaultKey];
    }
  }

  if (threeOilMarbleColor4Toggle) {
    threeOilMarbleColor4Toggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeOilMarbleColor4Enabled"),
      DEFAULT_CONFIG.threeOilMarble.color4Enabled,
    );
  }

  const savedFlow = readWindowStorageString(window.localStorage, v, "threeOilMarbleFlowSpeed");
  if (threeOilMarbleFlowSpeedRange) {
    const flow =
      savedFlow != null && savedFlow !== ""
        ? Math.min(2.5, Math.max(0.2, Number(savedFlow)))
        : DEFAULT_CONFIG.threeOilMarble.flowSpeed;
    threeOilMarbleFlowSpeedRange.value = String(Math.round(flow * 10));
    if (threeOilMarbleFlowSpeedValue) threeOilMarbleFlowSpeedValue.textContent = flow.toFixed(1);
  }

  const savedNoise = readWindowStorageString(window.localStorage, v, "threeOilMarbleNoiseScale");
  if (threeOilMarbleNoiseScaleRange) {
    const noise =
      savedNoise != null && savedNoise !== ""
        ? Math.min(4.5, Math.max(0.8, Number(savedNoise)))
        : DEFAULT_CONFIG.threeOilMarble.noiseScale;
    threeOilMarbleNoiseScaleRange.value = String(Math.round(noise * 10));
    if (threeOilMarbleNoiseScaleValue) threeOilMarbleNoiseScaleValue.textContent = noise.toFixed(1);
  }

  const savedWarp = readWindowStorageString(window.localStorage, v, "threeOilMarbleWarpStrength");
  if (threeOilMarbleWarpStrengthRange) {
    const warp =
      savedWarp != null && savedWarp !== ""
        ? clampInt(savedWarp, 0, 100)
        : DEFAULT_CONFIG.threeOilMarble.warpStrength;
    threeOilMarbleWarpStrengthRange.value = String(warp);
    if (threeOilMarbleWarpStrengthValue) threeOilMarbleWarpStrengthValue.textContent = String(warp);
  }

  const savedReact = readWindowStorageString(window.localStorage, v, "threeOilMarbleReactiveness");
  if (threeOilMarbleReactivenessRange) {
    const react =
      savedReact != null && savedReact !== ""
        ? clampInt(savedReact, 0, 100)
        : DEFAULT_CONFIG.threeOilMarble.reactiveness;
    threeOilMarbleReactivenessRange.value = String(react);
    if (threeOilMarbleReactivenessValue) threeOilMarbleReactivenessValue.textContent = String(react);
  }

  if (threeOilMarbleBloomToggle) {
    threeOilMarbleBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeOilMarbleBloom"),
      DEFAULT_CONFIG.threeOilMarble.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeOilMarbleBloomStrength");
  if (threeOilMarbleBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeOilMarble.bloomStrength;
    threeOilMarbleBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeOilMarbleBloomStrengthValue) {
      threeOilMarbleBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreePearlChainShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threePearlChainShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreePearlChainShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threePearlChainGainRange?.value, 10, 150),
    smoothPercent: clampInt(threePearlChainSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threePearlChainSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threePearlChainFallEaseRange?.value, 0, 100),
  };
  if (threePearlChainGainValue) threePearlChainGainValue.textContent = String(config.gainPercent);
  if (threePearlChainSmoothValue) threePearlChainSmoothValue.textContent = String(config.smoothPercent);
  if (threePearlChainSoftClipValue) threePearlChainSoftClipValue.textContent = String(config.softClipPercent);
  if (threePearlChainFallEaseValue) threePearlChainFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threePearlChainShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-pearl-chain-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新珍珠链形状配置失败：${String(err)}`;
  }
}

function applyThreePearlChainFormFromStorage(v) {
  const sg = readThreePearlChainShapeConfig(v) ?? { ...DEFAULT_CONFIG.threePearlChain.shape };
  if (threePearlChainGainRange) threePearlChainGainRange.value = String(sg.gainPercent);
  if (threePearlChainSmoothRange) threePearlChainSmoothRange.value = String(sg.smoothPercent);
  if (threePearlChainSoftClipRange) threePearlChainSoftClipRange.value = String(sg.softClipPercent);
  if (threePearlChainFallEaseRange) threePearlChainFallEaseRange.value = String(sg.fallEasePercent);
  if (threePearlChainGainValue) threePearlChainGainValue.textContent = String(sg.gainPercent);
  if (threePearlChainSmoothValue) threePearlChainSmoothValue.textContent = String(sg.smoothPercent);
  if (threePearlChainSoftClipValue) threePearlChainSoftClipValue.textContent = String(sg.softClipPercent);
  if (threePearlChainFallEaseValue) threePearlChainFallEaseValue.textContent = String(sg.fallEasePercent);

  const colorKeys = [
    ["threePearlChainColor1", threePearlChainColor1, "color1"],
    ["threePearlChainColor2", threePearlChainColor2, "color2"],
    ["threePearlChainColor3", threePearlChainColor3, "color3"],
  ];
  for (const [storageKey, el, defaultKey] of colorKeys) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threePearlChain[defaultKey];
    }
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threePearlChainPearlCount");
  if (threePearlChainPearlCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 5, 10)
        : DEFAULT_CONFIG.threePearlChain.pearlCount;
    threePearlChainPearlCountRange.value = String(count);
    if (threePearlChainPearlCountValue) threePearlChainPearlCountValue.textContent = String(count);
  }

  const savedRadius = readWindowStorageString(window.localStorage, v, "threePearlChainChainRadius");
  if (threePearlChainChainRadiusRange) {
    const radius =
      savedRadius != null && savedRadius !== ""
        ? Math.min(1.2, Math.max(0.4, Number(savedRadius)))
        : DEFAULT_CONFIG.threePearlChain.chainRadius;
    threePearlChainChainRadiusRange.value = String(Math.round(radius * 100));
    if (threePearlChainChainRadiusValue) threePearlChainChainRadiusValue.textContent = radius.toFixed(2);
  }

  const savedSize = readWindowStorageString(window.localStorage, v, "threePearlChainPearlSize");
  if (threePearlChainPearlSizeRange) {
    const size =
      savedSize != null && savedSize !== ""
        ? Math.min(0.35, Math.max(0.12, Number(savedSize)))
        : DEFAULT_CONFIG.threePearlChain.pearlSize;
    threePearlChainPearlSizeRange.value = String(Math.round(size * 100));
    if (threePearlChainPearlSizeValue) threePearlChainPearlSizeValue.textContent = size.toFixed(2);
  }

  const savedSway = readWindowStorageString(window.localStorage, v, "threePearlChainSwaySpeed");
  if (threePearlChainSwaySpeedRange) {
    const sway =
      savedSway != null && savedSway !== ""
        ? Math.min(2, Math.max(0.2, Number(savedSway)))
        : DEFAULT_CONFIG.threePearlChain.swaySpeed;
    threePearlChainSwaySpeedRange.value = String(Math.round(sway * 10));
    if (threePearlChainSwaySpeedValue) threePearlChainSwaySpeedValue.textContent = sway.toFixed(1);
  }

  const savedMerge = readWindowStorageString(window.localStorage, v, "threePearlChainMergeStrength");
  if (threePearlChainMergeStrengthRange) {
    const merge =
      savedMerge != null && savedMerge !== ""
        ? clampInt(savedMerge, 0, 100)
        : DEFAULT_CONFIG.threePearlChain.mergeStrength;
    threePearlChainMergeStrengthRange.value = String(merge);
    if (threePearlChainMergeStrengthValue) threePearlChainMergeStrengthValue.textContent = String(merge);
  }

  if (threePearlChainBloomToggle) {
    threePearlChainBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threePearlChainBloom"),
      DEFAULT_CONFIG.threePearlChain.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threePearlChainBloomStrength");
  if (threePearlChainBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threePearlChain.bloomStrength;
    threePearlChainBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threePearlChainBloomStrengthValue) {
      threePearlChainBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeCrystalGemShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeCrystalGemShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeCrystalGemShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeCrystalGemGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeCrystalGemSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeCrystalGemSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeCrystalGemFallEaseRange?.value, 0, 100),
  };
  if (threeCrystalGemGainValue) threeCrystalGemGainValue.textContent = String(config.gainPercent);
  if (threeCrystalGemSmoothValue) threeCrystalGemSmoothValue.textContent = String(config.smoothPercent);
  if (threeCrystalGemSoftClipValue) threeCrystalGemSoftClipValue.textContent = String(config.softClipPercent);
  if (threeCrystalGemFallEaseValue) threeCrystalGemFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeCrystalGemShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-crystal-gem-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新宝石晶体形状配置失败：${String(err)}`;
  }
}

function applyThreeCrystalGemFormFromStorage(v) {
  const sg = readThreeCrystalGemShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeCrystalGem.shape };
  if (threeCrystalGemGainRange) threeCrystalGemGainRange.value = String(sg.gainPercent);
  if (threeCrystalGemSmoothRange) threeCrystalGemSmoothRange.value = String(sg.smoothPercent);
  if (threeCrystalGemSoftClipRange) threeCrystalGemSoftClipRange.value = String(sg.softClipPercent);
  if (threeCrystalGemFallEaseRange) threeCrystalGemFallEaseRange.value = String(sg.fallEasePercent);
  if (threeCrystalGemGainValue) threeCrystalGemGainValue.textContent = String(sg.gainPercent);
  if (threeCrystalGemSmoothValue) threeCrystalGemSmoothValue.textContent = String(sg.smoothPercent);
  if (threeCrystalGemSoftClipValue) threeCrystalGemSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeCrystalGemFallEaseValue) threeCrystalGemFallEaseValue.textContent = String(sg.fallEasePercent);

  const colorKeys = [
    ["threeCrystalGemColorCore", threeCrystalGemColorCore, "colorCore"],
    ["threeCrystalGemColorEdge", threeCrystalGemColorEdge, "colorEdge"],
    ["threeCrystalGemColorHighlight", threeCrystalGemColorHighlight, "colorHighlight"],
  ];
  for (const [storageKey, el, defaultKey] of colorKeys) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threeCrystalGem[defaultKey];
    }
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeCrystalGemGemCount");
  if (threeCrystalGemGemCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 1, 3)
        : DEFAULT_CONFIG.threeCrystalGem.gemCount;
    threeCrystalGemGemCountRange.value = String(count);
    if (threeCrystalGemGemCountValue) threeCrystalGemGemCountValue.textContent = String(count);
  }

  const savedFacet = readWindowStorageString(window.localStorage, v, "threeCrystalGemFacetSharpness");
  if (threeCrystalGemFacetSharpnessRange) {
    const facet =
      savedFacet != null && savedFacet !== ""
        ? clampInt(savedFacet, 0, 100)
        : DEFAULT_CONFIG.threeCrystalGem.facetSharpness;
    threeCrystalGemFacetSharpnessRange.value = String(facet);
    if (threeCrystalGemFacetSharpnessValue) threeCrystalGemFacetSharpnessValue.textContent = String(facet);
  }

  const savedRot = readWindowStorageString(window.localStorage, v, "threeCrystalGemRotationSpeedDeg");
  if (threeCrystalGemRotationSpeedRange) {
    const rot =
      savedRot != null && savedRot !== ""
        ? clampInt(savedRot, 0, 30)
        : DEFAULT_CONFIG.threeCrystalGem.rotationSpeedDeg;
    threeCrystalGemRotationSpeedRange.value = String(rot);
    if (threeCrystalGemRotationSpeedValue) threeCrystalGemRotationSpeedValue.textContent = String(rot);
  }

  if (threeCrystalGemChromaticToggle) {
    threeCrystalGemChromaticToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeCrystalGemChromatic"),
      DEFAULT_CONFIG.threeCrystalGem.chromaticEnabled,
    );
  }

  const savedChromaticOffset = readWindowStorageString(window.localStorage, v, "threeCrystalGemChromaticOffset");
  if (threeCrystalGemChromaticOffsetRange) {
    const offset =
      savedChromaticOffset != null && savedChromaticOffset !== ""
        ? Math.min(0.01, Math.max(0, Number(savedChromaticOffset)))
        : DEFAULT_CONFIG.threeCrystalGem.chromaticOffset;
    threeCrystalGemChromaticOffsetRange.value = String(Math.round(offset * 1000));
    if (threeCrystalGemChromaticOffsetValue) {
      threeCrystalGemChromaticOffsetValue.textContent = offset.toFixed(3);
    }
  }

  if (threeCrystalGemBloomToggle) {
    threeCrystalGemBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeCrystalGemBloom"),
      DEFAULT_CONFIG.threeCrystalGem.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeCrystalGemBloomStrength");
  if (threeCrystalGemBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeCrystalGem.bloomStrength;
    threeCrystalGemBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeCrystalGemBloomStrengthValue) {
      threeCrystalGemBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function syncThreeGlassOrbsColorFieldVisibility(count) {
  if (threeGlassOrbsColor4Field) {
    threeGlassOrbsColor4Field.hidden = count < 4;
  }
  if (threeGlassOrbsColor5Field) {
    threeGlassOrbsColor5Field.hidden = count < 5;
  }
}

function readThreeGlassOrbsShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeGlassOrbsShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeGlassOrbsShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeGlassOrbsGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeGlassOrbsSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeGlassOrbsSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeGlassOrbsFallEaseRange?.value, 0, 100),
  };
  if (threeGlassOrbsGainValue) threeGlassOrbsGainValue.textContent = String(config.gainPercent);
  if (threeGlassOrbsSmoothValue) threeGlassOrbsSmoothValue.textContent = String(config.smoothPercent);
  if (threeGlassOrbsSoftClipValue) threeGlassOrbsSoftClipValue.textContent = String(config.softClipPercent);
  if (threeGlassOrbsFallEaseValue) threeGlassOrbsFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeGlassOrbsShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-glass-orbs-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新玻璃球栈形状配置失败：${String(err)}`;
  }
}

function applyThreeGlassOrbsFormFromStorage(v) {
  const sg = readThreeGlassOrbsShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeGlassOrbs.shape };
  if (threeGlassOrbsGainRange) threeGlassOrbsGainRange.value = String(sg.gainPercent);
  if (threeGlassOrbsSmoothRange) threeGlassOrbsSmoothRange.value = String(sg.smoothPercent);
  if (threeGlassOrbsSoftClipRange) threeGlassOrbsSoftClipRange.value = String(sg.softClipPercent);
  if (threeGlassOrbsFallEaseRange) threeGlassOrbsFallEaseRange.value = String(sg.fallEasePercent);
  if (threeGlassOrbsGainValue) threeGlassOrbsGainValue.textContent = String(sg.gainPercent);
  if (threeGlassOrbsSmoothValue) threeGlassOrbsSmoothValue.textContent = String(sg.smoothPercent);
  if (threeGlassOrbsSoftClipValue) threeGlassOrbsSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeGlassOrbsFallEaseValue) threeGlassOrbsFallEaseValue.textContent = String(sg.fallEasePercent);

  for (const [storageKey, el, defaultKey] of [
    ["threeGlassOrbsColor1", threeGlassOrbsColor1, "color1"],
    ["threeGlassOrbsColor2", threeGlassOrbsColor2, "color2"],
    ["threeGlassOrbsColor3", threeGlassOrbsColor3, "color3"],
    ["threeGlassOrbsColor4", threeGlassOrbsColor4, "color4"],
    ["threeGlassOrbsColor5", threeGlassOrbsColor5, "color5"],
  ]) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threeGlassOrbs[defaultKey];
    }
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeGlassOrbsOrbCount");
  if (threeGlassOrbsOrbCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2, 5)
        : DEFAULT_CONFIG.threeGlassOrbs.orbCount;
    threeGlassOrbsOrbCountRange.value = String(count);
    if (threeGlassOrbsOrbCountValue) threeGlassOrbsOrbCountValue.textContent = String(count);
    syncThreeGlassOrbsColorFieldVisibility(count);
  }

  const savedSpacing = readWindowStorageString(window.localStorage, v, "threeGlassOrbsStackSpacing");
  if (threeGlassOrbsStackSpacingRange) {
    const spacing =
      savedSpacing != null && savedSpacing !== ""
        ? Math.min(0.6, Math.max(0.2, Number(savedSpacing)))
        : DEFAULT_CONFIG.threeGlassOrbs.stackSpacing;
    threeGlassOrbsStackSpacingRange.value = String(Math.round(spacing * 100));
    if (threeGlassOrbsStackSpacingValue) threeGlassOrbsStackSpacingValue.textContent = spacing.toFixed(2);
  }

  const savedTransmission = readWindowStorageString(window.localStorage, v, "threeGlassOrbsTransmission");
  if (threeGlassOrbsTransmissionRange) {
    const transmission =
      savedTransmission != null && savedTransmission !== ""
        ? clampInt(savedTransmission, 0, 100)
        : DEFAULT_CONFIG.threeGlassOrbs.transmission;
    threeGlassOrbsTransmissionRange.value = String(transmission);
    if (threeGlassOrbsTransmissionValue) threeGlassOrbsTransmissionValue.textContent = String(transmission);
  }

  const savedRefraction = readWindowStorageString(window.localStorage, v, "threeGlassOrbsRefractionStrength");
  if (threeGlassOrbsRefractionStrengthRange) {
    const refraction =
      savedRefraction != null && savedRefraction !== ""
        ? clampInt(savedRefraction, 0, 100)
        : DEFAULT_CONFIG.threeGlassOrbs.refractionStrength;
    threeGlassOrbsRefractionStrengthRange.value = String(refraction);
    if (threeGlassOrbsRefractionStrengthValue) {
      threeGlassOrbsRefractionStrengthValue.textContent = String(refraction);
    }
  }

  if (threeGlassOrbsBreatheWithPeakToggle) {
    threeGlassOrbsBreatheWithPeakToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeGlassOrbsBreatheWithPeak"),
      DEFAULT_CONFIG.threeGlassOrbs.breatheWithPeak,
    );
  }

  if (threeGlassOrbsChromaticToggle) {
    threeGlassOrbsChromaticToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeGlassOrbsChromatic"),
      DEFAULT_CONFIG.threeGlassOrbs.chromaticEnabled,
    );
  }

  const savedChromaticOffset = readWindowStorageString(window.localStorage, v, "threeGlassOrbsChromaticOffset");
  if (threeGlassOrbsChromaticOffsetRange) {
    const offset =
      savedChromaticOffset != null && savedChromaticOffset !== ""
        ? Math.min(0.01, Math.max(0, Number(savedChromaticOffset)))
        : DEFAULT_CONFIG.threeGlassOrbs.chromaticOffset;
    threeGlassOrbsChromaticOffsetRange.value = String(Math.round(offset * 1000));
    if (threeGlassOrbsChromaticOffsetValue) {
      threeGlassOrbsChromaticOffsetValue.textContent = offset.toFixed(3);
    }
  }

  if (threeGlassOrbsBloomToggle) {
    threeGlassOrbsBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeGlassOrbsBloom"),
      DEFAULT_CONFIG.threeGlassOrbs.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeGlassOrbsBloomStrength");
  if (threeGlassOrbsBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeGlassOrbs.bloomStrength;
    threeGlassOrbsBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeGlassOrbsBloomStrengthValue) {
      threeGlassOrbsBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeHoloPrismShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeHoloPrismShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeHoloPrismShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeHoloPrismGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeHoloPrismSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeHoloPrismSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeHoloPrismFallEaseRange?.value, 0, 100),
  };
  if (threeHoloPrismGainValue) threeHoloPrismGainValue.textContent = String(config.gainPercent);
  if (threeHoloPrismSmoothValue) threeHoloPrismSmoothValue.textContent = String(config.smoothPercent);
  if (threeHoloPrismSoftClipValue) threeHoloPrismSoftClipValue.textContent = String(config.softClipPercent);
  if (threeHoloPrismFallEaseValue) threeHoloPrismFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeHoloPrismShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-holo-prism-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新全息棱镜形状配置失败：${String(err)}`;
  }
}

function applyThreeHoloPrismFormFromStorage(v) {
  const sg = readThreeHoloPrismShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeHoloPrism.shape };
  if (threeHoloPrismGainRange) threeHoloPrismGainRange.value = String(sg.gainPercent);
  if (threeHoloPrismSmoothRange) threeHoloPrismSmoothRange.value = String(sg.smoothPercent);
  if (threeHoloPrismSoftClipRange) threeHoloPrismSoftClipRange.value = String(sg.softClipPercent);
  if (threeHoloPrismFallEaseRange) threeHoloPrismFallEaseRange.value = String(sg.fallEasePercent);
  if (threeHoloPrismGainValue) threeHoloPrismGainValue.textContent = String(sg.gainPercent);
  if (threeHoloPrismSmoothValue) threeHoloPrismSmoothValue.textContent = String(sg.smoothPercent);
  if (threeHoloPrismSoftClipValue) threeHoloPrismSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeHoloPrismFallEaseValue) threeHoloPrismFallEaseValue.textContent = String(sg.fallEasePercent);

  for (const [storageKey, el, defaultKey] of [
    ["threeHoloPrismTintLow", threeHoloPrismTintLow, "tintLow"],
    ["threeHoloPrismTintHigh", threeHoloPrismTintHigh, "tintHigh"],
  ]) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threeHoloPrism[defaultKey];
    }
  }

  const savedSides = readWindowStorageString(window.localStorage, v, "threeHoloPrismSides");
  if (threeHoloPrismSidesRange) {
    const sides =
      savedSides != null && savedSides !== ""
        ? clampInt(savedSides, 4, 8)
        : DEFAULT_CONFIG.threeHoloPrism.prismSides;
    threeHoloPrismSidesRange.value = String(sides);
    if (threeHoloPrismSidesValue) threeHoloPrismSidesValue.textContent = String(sides);
  }

  const savedRot = readWindowStorageString(window.localStorage, v, "threeHoloPrismRotationSpeedDeg");
  if (threeHoloPrismRotationSpeedRange) {
    const rot =
      savedRot != null && savedRot !== ""
        ? clampInt(savedRot, 0, 30)
        : DEFAULT_CONFIG.threeHoloPrism.rotationSpeedDeg;
    threeHoloPrismRotationSpeedRange.value = String(rot);
    if (threeHoloPrismRotationSpeedValue) threeHoloPrismRotationSpeedValue.textContent = String(rot);
  }

  const savedSpectral = readWindowStorageString(window.localStorage, v, "threeHoloPrismSpectralStrength");
  if (threeHoloPrismSpectralStrengthRange) {
    const spectral =
      savedSpectral != null && savedSpectral !== ""
        ? clampInt(savedSpectral, 0, 100)
        : DEFAULT_CONFIG.threeHoloPrism.spectralStrength;
    threeHoloPrismSpectralStrengthRange.value = String(spectral);
    if (threeHoloPrismSpectralStrengthValue) {
      threeHoloPrismSpectralStrengthValue.textContent = String(spectral);
    }
  }

  if (threeHoloPrismPulseOnPeakToggle) {
    threeHoloPrismPulseOnPeakToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeHoloPrismPulseOnPeak"),
      DEFAULT_CONFIG.threeHoloPrism.pulseOnPeak,
    );
  }

  const savedChromaticOffset = readWindowStorageString(window.localStorage, v, "threeHoloPrismChromaticOffset");
  if (threeHoloPrismChromaticOffsetRange) {
    const offset =
      savedChromaticOffset != null && savedChromaticOffset !== ""
        ? Math.min(0.01, Math.max(0, Number(savedChromaticOffset)))
        : DEFAULT_CONFIG.threeHoloPrism.chromaticOffset;
    threeHoloPrismChromaticOffsetRange.value = String(Math.round(offset * 1000));
    if (threeHoloPrismChromaticOffsetValue) {
      threeHoloPrismChromaticOffsetValue.textContent = offset.toFixed(3);
    }
  }

  if (threeHoloPrismBloomToggle) {
    threeHoloPrismBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeHoloPrismBloom"),
      DEFAULT_CONFIG.threeHoloPrism.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeHoloPrismBloomStrength");
  if (threeHoloPrismBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeHoloPrism.bloomStrength;
    threeHoloPrismBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeHoloPrismBloomStrengthValue) {
      threeHoloPrismBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeNebulaVolumeShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeNebulaVolumeShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeNebulaVolumeShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeNebulaVolumeGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeNebulaVolumeSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeNebulaVolumeSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeNebulaVolumeFallEaseRange?.value, 0, 100),
  };
  if (threeNebulaVolumeGainValue) threeNebulaVolumeGainValue.textContent = String(config.gainPercent);
  if (threeNebulaVolumeSmoothValue) threeNebulaVolumeSmoothValue.textContent = String(config.smoothPercent);
  if (threeNebulaVolumeSoftClipValue) threeNebulaVolumeSoftClipValue.textContent = String(config.softClipPercent);
  if (threeNebulaVolumeFallEaseValue) threeNebulaVolumeFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeNebulaVolumeShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-nebula-volume-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新星云团形状配置失败：${String(err)}`;
  }
}

function applyThreeNebulaVolumeFormFromStorage(v) {
  const sg = readThreeNebulaVolumeShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeNebulaVolume.shape };
  if (threeNebulaVolumeGainRange) threeNebulaVolumeGainRange.value = String(sg.gainPercent);
  if (threeNebulaVolumeSmoothRange) threeNebulaVolumeSmoothRange.value = String(sg.smoothPercent);
  if (threeNebulaVolumeSoftClipRange) threeNebulaVolumeSoftClipRange.value = String(sg.softClipPercent);
  if (threeNebulaVolumeFallEaseRange) threeNebulaVolumeFallEaseRange.value = String(sg.fallEasePercent);
  if (threeNebulaVolumeGainValue) threeNebulaVolumeGainValue.textContent = String(sg.gainPercent);
  if (threeNebulaVolumeSmoothValue) threeNebulaVolumeSmoothValue.textContent = String(sg.smoothPercent);
  if (threeNebulaVolumeSoftClipValue) threeNebulaVolumeSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeNebulaVolumeFallEaseValue) threeNebulaVolumeFallEaseValue.textContent = String(sg.fallEasePercent);

  const colorKeys = [
    ["threeNebulaVolumeColorCore", threeNebulaVolumeColorCore, "colorCore"],
    ["threeNebulaVolumeColorMid", threeNebulaVolumeColorMid, "colorMid"],
    ["threeNebulaVolumeColorEdge", threeNebulaVolumeColorEdge, "colorEdge"],
  ];
  for (const [storageKey, el, defaultKey] of colorKeys) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threeNebulaVolume[defaultKey];
    }
  }

  const savedDensity = readWindowStorageString(window.localStorage, v, "threeNebulaVolumeDensityScale");
  if (threeNebulaVolumeDensityScaleRange) {
    const density =
      savedDensity != null && savedDensity !== ""
        ? Math.min(2.5, Math.max(0.4, Number(savedDensity)))
        : DEFAULT_CONFIG.threeNebulaVolume.densityScale;
    threeNebulaVolumeDensityScaleRange.value = String(Math.round(density * 10));
    if (threeNebulaVolumeDensityScaleValue) {
      threeNebulaVolumeDensityScaleValue.textContent = density.toFixed(1);
    }
  }

  const savedNoise = readWindowStorageString(window.localStorage, v, "threeNebulaVolumeNoiseScale");
  if (threeNebulaVolumeNoiseScaleRange) {
    const noise =
      savedNoise != null && savedNoise !== ""
        ? Math.min(4.0, Math.max(0.6, Number(savedNoise)))
        : DEFAULT_CONFIG.threeNebulaVolume.noiseScale;
    threeNebulaVolumeNoiseScaleRange.value = String(Math.round(noise * 10));
    if (threeNebulaVolumeNoiseScaleValue) threeNebulaVolumeNoiseScaleValue.textContent = noise.toFixed(1);
  }

  const savedSwirl = readWindowStorageString(window.localStorage, v, "threeNebulaVolumeSwirlSpeed");
  if (threeNebulaVolumeSwirlSpeedRange) {
    const swirl =
      savedSwirl != null && savedSwirl !== ""
        ? Math.min(2.0, Math.max(0.1, Number(savedSwirl)))
        : DEFAULT_CONFIG.threeNebulaVolume.swirlSpeed;
    threeNebulaVolumeSwirlSpeedRange.value = String(Math.round(swirl * 10));
    if (threeNebulaVolumeSwirlSpeedValue) threeNebulaVolumeSwirlSpeedValue.textContent = swirl.toFixed(1);
  }

  const savedMarch = readWindowStorageString(window.localStorage, v, "threeNebulaVolumeMarchSteps");
  if (threeNebulaVolumeMarchStepsRange) {
    const steps =
      savedMarch != null && savedMarch !== ""
        ? clampInt(savedMarch, 32, 48)
        : DEFAULT_CONFIG.threeNebulaVolume.marchSteps;
    threeNebulaVolumeMarchStepsRange.value = String(steps);
    if (threeNebulaVolumeMarchStepsValue) threeNebulaVolumeMarchStepsValue.textContent = String(steps);
  }

  if (threeNebulaVolumeBloomToggle) {
    threeNebulaVolumeBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeNebulaVolumeBloom"),
      DEFAULT_CONFIG.threeNebulaVolume.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeNebulaVolumeBloomStrength");
  if (threeNebulaVolumeBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeNebulaVolume.bloomStrength;
    threeNebulaVolumeBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeNebulaVolumeBloomStrengthValue) {
      threeNebulaVolumeBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeKnotOrganicShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeKnotOrganicShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeKnotOrganicShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeKnotOrganicGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeKnotOrganicSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeKnotOrganicSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeKnotOrganicFallEaseRange?.value, 0, 100),
  };
  if (threeKnotOrganicGainValue) threeKnotOrganicGainValue.textContent = String(config.gainPercent);
  if (threeKnotOrganicSmoothValue) threeKnotOrganicSmoothValue.textContent = String(config.smoothPercent);
  if (threeKnotOrganicSoftClipValue) threeKnotOrganicSoftClipValue.textContent = String(config.softClipPercent);
  if (threeKnotOrganicFallEaseValue) threeKnotOrganicFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeKnotOrganicShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-knot-organic-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新扭结有机体形状配置失败：${String(err)}`;
  }
}

function applyThreeKnotOrganicFormFromStorage(v) {
  const sg = readThreeKnotOrganicShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeKnotOrganic.shape };
  if (threeKnotOrganicGainRange) threeKnotOrganicGainRange.value = String(sg.gainPercent);
  if (threeKnotOrganicSmoothRange) threeKnotOrganicSmoothRange.value = String(sg.smoothPercent);
  if (threeKnotOrganicSoftClipRange) threeKnotOrganicSoftClipRange.value = String(sg.softClipPercent);
  if (threeKnotOrganicFallEaseRange) threeKnotOrganicFallEaseRange.value = String(sg.fallEasePercent);
  if (threeKnotOrganicGainValue) threeKnotOrganicGainValue.textContent = String(sg.gainPercent);
  if (threeKnotOrganicSmoothValue) threeKnotOrganicSmoothValue.textContent = String(sg.smoothPercent);
  if (threeKnotOrganicSoftClipValue) threeKnotOrganicSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeKnotOrganicFallEaseValue) threeKnotOrganicFallEaseValue.textContent = String(sg.fallEasePercent);

  const colorKeys = [
    ["threeKnotOrganicColor1", threeKnotOrganicColor1, "color1"],
    ["threeKnotOrganicColor2", threeKnotOrganicColor2, "color2"],
    ["threeKnotOrganicColor3", threeKnotOrganicColor3, "color3"],
  ];
  for (const [storageKey, el, defaultKey] of colorKeys) {
    const saved = readWindowStorageString(window.localStorage, v, storageKey);
    if (el && saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      el.value = saved.toLowerCase();
    } else if (el) {
      el.value = DEFAULT_CONFIG.threeKnotOrganic[defaultKey];
    }
  }

  const savedP = readWindowStorageString(window.localStorage, v, "threeKnotOrganicKnotP");
  if (threeKnotOrganicKnotPRange) {
    const knotP =
      savedP != null && savedP !== "" ? clampInt(savedP, 2, 4) : DEFAULT_CONFIG.threeKnotOrganic.knotP;
    threeKnotOrganicKnotPRange.value = String(knotP);
    if (threeKnotOrganicKnotPValue) threeKnotOrganicKnotPValue.textContent = String(knotP);
  }

  const savedQ = readWindowStorageString(window.localStorage, v, "threeKnotOrganicKnotQ");
  if (threeKnotOrganicKnotQRange) {
    const knotQ =
      savedQ != null && savedQ !== "" ? clampInt(savedQ, 3, 7) : DEFAULT_CONFIG.threeKnotOrganic.knotQ;
    threeKnotOrganicKnotQRange.value = String(knotQ);
    if (threeKnotOrganicKnotQValue) threeKnotOrganicKnotQValue.textContent = String(knotQ);
  }

  const savedTube = readWindowStorageString(window.localStorage, v, "threeKnotOrganicTubeRadius");
  if (threeKnotOrganicTubeRadiusRange) {
    const tube =
      savedTube != null && savedTube !== ""
        ? Math.min(0.28, Math.max(0.06, Number(savedTube)))
        : DEFAULT_CONFIG.threeKnotOrganic.tubeRadius;
    threeKnotOrganicTubeRadiusRange.value = String(Math.round(tube * 100));
    if (threeKnotOrganicTubeRadiusValue) threeKnotOrganicTubeRadiusValue.textContent = tube.toFixed(2);
  }

  const savedNoise = readWindowStorageString(window.localStorage, v, "threeKnotOrganicSurfaceNoise");
  if (threeKnotOrganicSurfaceNoiseRange) {
    const noise =
      savedNoise != null && savedNoise !== ""
        ? clampInt(savedNoise, 0, 100)
        : DEFAULT_CONFIG.threeKnotOrganic.surfaceNoise;
    threeKnotOrganicSurfaceNoiseRange.value = String(noise);
    if (threeKnotOrganicSurfaceNoiseValue) threeKnotOrganicSurfaceNoiseValue.textContent = String(noise);
  }

  const savedRotate = readWindowStorageString(window.localStorage, v, "threeKnotOrganicRotationSpeedDeg");
  if (threeKnotOrganicRotationSpeedRange) {
    const rotate =
      savedRotate != null && savedRotate !== ""
        ? clampInt(savedRotate, 0, 30)
        : DEFAULT_CONFIG.threeKnotOrganic.rotationSpeedDeg;
    threeKnotOrganicRotationSpeedRange.value = String(rotate);
    if (threeKnotOrganicRotationSpeedValue) threeKnotOrganicRotationSpeedValue.textContent = String(rotate);
  }

  if (threeKnotOrganicBloomToggle) {
    threeKnotOrganicBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeKnotOrganicBloom"),
      DEFAULT_CONFIG.threeKnotOrganic.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeKnotOrganicBloomStrength");
  if (threeKnotOrganicBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeKnotOrganic.bloomStrength;
    threeKnotOrganicBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeKnotOrganicBloomStrengthValue) {
      threeKnotOrganicBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeAuroraShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeAuroraShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeAuroraShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeAuroraGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeAuroraSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeAuroraSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeAuroraFallEaseRange?.value, 0, 100),
  };
  if (threeAuroraGainValue) threeAuroraGainValue.textContent = String(config.gainPercent);
  if (threeAuroraSmoothValue) threeAuroraSmoothValue.textContent = String(config.smoothPercent);
  if (threeAuroraSoftClipValue) threeAuroraSoftClipValue.textContent = String(config.softClipPercent);
  if (threeAuroraFallEaseValue) threeAuroraFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeAuroraShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-aurora-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新极光飘带形状配置失败：${String(err)}`;
  }
}

function applyThreeAuroraFormFromStorage(v) {
  const sg = readThreeAuroraShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeAuroraRibbon.shape };
  if (threeAuroraGainRange) threeAuroraGainRange.value = String(sg.gainPercent);
  if (threeAuroraSmoothRange) threeAuroraSmoothRange.value = String(sg.smoothPercent);
  if (threeAuroraSoftClipRange) threeAuroraSoftClipRange.value = String(sg.softClipPercent);
  if (threeAuroraFallEaseRange) threeAuroraFallEaseRange.value = String(sg.fallEasePercent);
  if (threeAuroraGainValue) threeAuroraGainValue.textContent = String(sg.gainPercent);
  if (threeAuroraSmoothValue) threeAuroraSmoothValue.textContent = String(sg.smoothPercent);
  if (threeAuroraSoftClipValue) threeAuroraSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeAuroraFallEaseValue) threeAuroraFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColorLow = readWindowStorageString(window.localStorage, v, "threeAuroraColorLow");
  if (threeAuroraColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    threeAuroraColorLow.value = savedColorLow.toLowerCase();
  } else if (threeAuroraColorLow) {
    threeAuroraColorLow.value = DEFAULT_CONFIG.threeAuroraRibbon.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "threeAuroraColorHigh");
  if (threeAuroraColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    threeAuroraColorHigh.value = savedColorHigh.toLowerCase();
  } else if (threeAuroraColorHigh) {
    threeAuroraColorHigh.value = DEFAULT_CONFIG.threeAuroraRibbon.colorHigh;
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeAuroraRibbonCount");
  if (threeAuroraRibbonCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2, 6)
        : DEFAULT_CONFIG.threeAuroraRibbon.ribbonCount;
    threeAuroraRibbonCountRange.value = String(count);
    if (threeAuroraRibbonCountValue) threeAuroraRibbonCountValue.textContent = String(count);
  }

  const savedWidth = readWindowStorageString(window.localStorage, v, "threeAuroraRibbonWidth");
  if (threeAuroraRibbonWidthRange) {
    const width =
      savedWidth != null && savedWidth !== ""
        ? Math.min(0.2, Math.max(0.02, Number(savedWidth)))
        : DEFAULT_CONFIG.threeAuroraRibbon.ribbonWidth;
    threeAuroraRibbonWidthRange.value = String(Math.round(width * 100));
    if (threeAuroraRibbonWidthValue) threeAuroraRibbonWidthValue.textContent = width.toFixed(2);
  }

  const savedAmplitude = readWindowStorageString(window.localStorage, v, "threeAuroraWaveAmplitude");
  if (threeAuroraWaveAmplitudeRange) {
    const amplitude =
      savedAmplitude != null && savedAmplitude !== ""
        ? Math.min(0.8, Math.max(0.1, Number(savedAmplitude)))
        : DEFAULT_CONFIG.threeAuroraRibbon.waveAmplitude;
    threeAuroraWaveAmplitudeRange.value = String(Math.round(amplitude * 100));
    if (threeAuroraWaveAmplitudeValue) {
      threeAuroraWaveAmplitudeValue.textContent = amplitude.toFixed(2);
    }
  }

  const savedWaveSpeed = readWindowStorageString(window.localStorage, v, "threeAuroraWaveSpeed");
  if (threeAuroraWaveSpeedRange) {
    const waveSpeed =
      savedWaveSpeed != null && savedWaveSpeed !== ""
        ? Math.min(3, Math.max(0.2, Number(savedWaveSpeed)))
        : DEFAULT_CONFIG.threeAuroraRibbon.waveSpeed;
    threeAuroraWaveSpeedRange.value = String(Math.round(waveSpeed * 10));
    if (threeAuroraWaveSpeedValue) threeAuroraWaveSpeedValue.textContent = waveSpeed.toFixed(1);
  }

  const savedBassBand = readWindowStorageString(window.localStorage, v, "threeAuroraBassBandIndex");
  if (threeAuroraBassBandIndexRange) {
    const bassBand =
      savedBassBand != null && savedBassBand !== ""
        ? clampInt(savedBassBand, 0, 7)
        : DEFAULT_CONFIG.threeAuroraRibbon.bassBandIndex;
    threeAuroraBassBandIndexRange.value = String(bassBand);
    if (threeAuroraBassBandIndexValue) threeAuroraBassBandIndexValue.textContent = String(bassBand);
  }

  const savedRotate = readWindowStorageString(window.localStorage, v, "threeAuroraAutoRotateSpeed");
  if (threeAuroraAutoRotateSpeedRange) {
    const rotateSpeed =
      savedRotate != null && savedRotate !== ""
        ? Math.min(15, Math.max(0, Number(savedRotate)))
        : DEFAULT_CONFIG.threeAuroraRibbon.autoRotateSpeedDeg;
    threeAuroraAutoRotateSpeedRange.value = String(Math.round(rotateSpeed));
    if (threeAuroraAutoRotateSpeedValue) {
      threeAuroraAutoRotateSpeedValue.textContent = String(Math.round(rotateSpeed));
    }
  }

  if (threeAuroraBloomToggle) {
    threeAuroraBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeAuroraBloom"),
      DEFAULT_CONFIG.threeAuroraRibbon.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeAuroraBloomStrength");
  if (threeAuroraBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeAuroraRibbon.bloomStrength;
    threeAuroraBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeAuroraBloomStrengthValue) {
      threeAuroraBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeBreathingShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeBreathingShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeBreathingShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeBreathingGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeBreathingSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeBreathingSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeBreathingFallEaseRange?.value, 0, 100),
  };
  if (threeBreathingGainValue) threeBreathingGainValue.textContent = String(config.gainPercent);
  if (threeBreathingSmoothValue) threeBreathingSmoothValue.textContent = String(config.smoothPercent);
  if (threeBreathingSoftClipValue) threeBreathingSoftClipValue.textContent = String(config.softClipPercent);
  if (threeBreathingFallEaseValue) threeBreathingFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeBreathingShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-breathing-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新呼吸光环形状配置失败：${String(err)}`;
  }
}

function applyThreeBreathingFormFromStorage(v) {
  const sg = readThreeBreathingShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeBreathingRings.shape };
  if (threeBreathingGainRange) threeBreathingGainRange.value = String(sg.gainPercent);
  if (threeBreathingSmoothRange) threeBreathingSmoothRange.value = String(sg.smoothPercent);
  if (threeBreathingSoftClipRange) threeBreathingSoftClipRange.value = String(sg.softClipPercent);
  if (threeBreathingFallEaseRange) threeBreathingFallEaseRange.value = String(sg.fallEasePercent);
  if (threeBreathingGainValue) threeBreathingGainValue.textContent = String(sg.gainPercent);
  if (threeBreathingSmoothValue) threeBreathingSmoothValue.textContent = String(sg.smoothPercent);
  if (threeBreathingSoftClipValue) threeBreathingSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeBreathingFallEaseValue) threeBreathingFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "threeBreathingRingColor");
  if (threeBreathingRingColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    threeBreathingRingColor.value = savedColor.toLowerCase();
  } else if (threeBreathingRingColor) {
    threeBreathingRingColor.value = DEFAULT_CONFIG.threeBreathingRings.ringColor;
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "threeBreathingRingCount");
  if (threeBreathingRingCountRange) {
    const count =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 2, 8)
        : DEFAULT_CONFIG.threeBreathingRings.ringCount;
    threeBreathingRingCountRange.value = String(count);
    if (threeBreathingRingCountValue) threeBreathingRingCountValue.textContent = String(count);
  }

  const savedBaseRadius = readWindowStorageString(window.localStorage, v, "threeBreathingBaseRadius");
  if (threeBreathingBaseRadiusRange) {
    const baseRadius =
      savedBaseRadius != null && savedBaseRadius !== ""
        ? Math.min(0.8, Math.max(0.2, Number(savedBaseRadius)))
        : DEFAULT_CONFIG.threeBreathingRings.baseRadius;
    threeBreathingBaseRadiusRange.value = String(Math.round(baseRadius * 100));
    if (threeBreathingBaseRadiusValue) threeBreathingBaseRadiusValue.textContent = baseRadius.toFixed(2);
  }

  const savedRadiusStep = readWindowStorageString(window.localStorage, v, "threeBreathingRadiusStep");
  if (threeBreathingRadiusStepRange) {
    const radiusStep =
      savedRadiusStep != null && savedRadiusStep !== ""
        ? Math.min(0.3, Math.max(0.05, Number(savedRadiusStep)))
        : DEFAULT_CONFIG.threeBreathingRings.radiusStep;
    threeBreathingRadiusStepRange.value = String(Math.round(radiusStep * 100));
    if (threeBreathingRadiusStepValue) threeBreathingRadiusStepValue.textContent = radiusStep.toFixed(2);
  }

  const savedPulse = readWindowStorageString(window.localStorage, v, "threeBreathingPulseStrength");
  if (threeBreathingPulseStrengthRange) {
    const pulseStrength =
      savedPulse != null && savedPulse !== ""
        ? clampInt(savedPulse, 0, 100)
        : DEFAULT_CONFIG.threeBreathingRings.pulseStrength;
    threeBreathingPulseStrengthRange.value = String(pulseStrength);
    if (threeBreathingPulseStrengthValue) {
      threeBreathingPulseStrengthValue.textContent = String(pulseStrength);
    }
  }

  const savedTubeRadius = readWindowStorageString(window.localStorage, v, "threeBreathingTubeRadius");
  if (threeBreathingTubeRadiusRange) {
    const tubeRadius =
      savedTubeRadius != null && savedTubeRadius !== ""
        ? Math.min(0.06, Math.max(0.01, Number(savedTubeRadius)))
        : DEFAULT_CONFIG.threeBreathingRings.tubeRadius;
    threeBreathingTubeRadiusRange.value = String(Math.round(tubeRadius * 100));
    if (threeBreathingTubeRadiusValue) threeBreathingTubeRadiusValue.textContent = tubeRadius.toFixed(2);
  }

  const savedRotate = readWindowStorageString(window.localStorage, v, "threeBreathingAutoRotateSpeed");
  if (threeBreathingAutoRotateSpeedRange) {
    const rotateSpeed =
      savedRotate != null && savedRotate !== ""
        ? Math.min(15, Math.max(0, Number(savedRotate)))
        : DEFAULT_CONFIG.threeBreathingRings.autoRotateSpeedDeg;
    threeBreathingAutoRotateSpeedRange.value = String(Math.round(rotateSpeed));
    if (threeBreathingAutoRotateSpeedValue) {
      threeBreathingAutoRotateSpeedValue.textContent = String(Math.round(rotateSpeed));
    }
  }

  if (threeBreathingBloomToggle) {
    threeBreathingBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeBreathingBloom"),
      DEFAULT_CONFIG.threeBreathingRings.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(
    window.localStorage,
    v,
    "threeBreathingBloomStrength",
  );
  if (threeBreathingBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeBreathingRings.bloomStrength;
    threeBreathingBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeBreathingBloomStrengthValue) {
      threeBreathingBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function readThreeNoiseShapeConfig(visualTargetLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, visualTargetLabel, "threeNoiseShape");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncThreeNoiseShapeConfig(visualTargetLabel, emitVisual) {
  const config = {
    gainPercent: clampInt(threeNoiseGainRange?.value, 10, 150),
    smoothPercent: clampInt(threeNoiseSmoothRange?.value, 0, 400),
    softClipPercent: clampInt(threeNoiseSoftClipRange?.value, 0, 100),
    fallEasePercent: clampInt(threeNoiseFallEaseRange?.value, 0, 100),
  };
  if (threeNoiseGainValue) threeNoiseGainValue.textContent = String(config.gainPercent);
  if (threeNoiseSmoothValue) threeNoiseSmoothValue.textContent = String(config.smoothPercent);
  if (threeNoiseSoftClipValue) threeNoiseSoftClipValue.textContent = String(config.softClipPercent);
  if (threeNoiseFallEaseValue) threeNoiseFallEaseValue.textContent = String(config.fallEasePercent);
  try {
    writeWindowStorageString(
      window.localStorage,
      visualTargetLabel,
      "threeNoiseShape",
      JSON.stringify(config),
    );
  } catch {
    // ignore storage failures
  }
  try {
    await emitVisual("waveform-three-noise-shape-config", config);
  } catch (err) {
    statusEl.textContent = `更新噪声地貌形状配置失败：${String(err)}`;
  }
}

function applyThreeNoiseFormFromStorage(v) {
  const sg = readThreeNoiseShapeConfig(v) ?? { ...DEFAULT_CONFIG.threeNoiseLandscape.shape };
  if (threeNoiseGainRange) threeNoiseGainRange.value = String(sg.gainPercent);
  if (threeNoiseSmoothRange) threeNoiseSmoothRange.value = String(sg.smoothPercent);
  if (threeNoiseSoftClipRange) threeNoiseSoftClipRange.value = String(sg.softClipPercent);
  if (threeNoiseFallEaseRange) threeNoiseFallEaseRange.value = String(sg.fallEasePercent);
  if (threeNoiseGainValue) threeNoiseGainValue.textContent = String(sg.gainPercent);
  if (threeNoiseSmoothValue) threeNoiseSmoothValue.textContent = String(sg.smoothPercent);
  if (threeNoiseSoftClipValue) threeNoiseSoftClipValue.textContent = String(sg.softClipPercent);
  if (threeNoiseFallEaseValue) threeNoiseFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColorLow = readWindowStorageString(window.localStorage, v, "threeNoiseColorLow");
  if (threeNoiseColorLow && savedColorLow && /^#[0-9A-Fa-f]{6}$/.test(savedColorLow)) {
    threeNoiseColorLow.value = savedColorLow.toLowerCase();
  } else if (threeNoiseColorLow) {
    threeNoiseColorLow.value = DEFAULT_CONFIG.threeNoiseLandscape.colorLow;
  }

  const savedColorHigh = readWindowStorageString(window.localStorage, v, "threeNoiseColorHigh");
  if (threeNoiseColorHigh && savedColorHigh && /^#[0-9A-Fa-f]{6}$/.test(savedColorHigh)) {
    threeNoiseColorHigh.value = savedColorHigh.toLowerCase();
  } else if (threeNoiseColorHigh) {
    threeNoiseColorHigh.value = DEFAULT_CONFIG.threeNoiseLandscape.colorHigh;
  }

  const savedGridSize = readWindowStorageString(window.localStorage, v, "threeNoiseGridSize");
  if (threeNoiseGridSizeRange) {
    const gridSize =
      savedGridSize != null && savedGridSize !== ""
        ? clampInt(savedGridSize, 32, 96)
        : DEFAULT_CONFIG.threeNoiseLandscape.gridSize;
    threeNoiseGridSizeRange.value = String(gridSize);
    if (threeNoiseGridSizeValue) threeNoiseGridSizeValue.textContent = String(gridSize);
  }

  const savedHeightScale = readWindowStorageString(window.localStorage, v, "threeNoiseHeightScale");
  if (threeNoiseHeightScaleRange) {
    const heightScale =
      savedHeightScale != null && savedHeightScale !== ""
        ? Math.min(1.2, Math.max(0.1, Number(savedHeightScale)))
        : DEFAULT_CONFIG.threeNoiseLandscape.heightScale;
    threeNoiseHeightScaleRange.value = String(Math.round(heightScale * 100));
    if (threeNoiseHeightScaleValue) threeNoiseHeightScaleValue.textContent = heightScale.toFixed(2);
  }

  const savedNoiseScale = readWindowStorageString(window.localStorage, v, "threeNoiseNoiseScale");
  if (threeNoiseNoiseScaleRange) {
    const noiseScale =
      savedNoiseScale != null && savedNoiseScale !== ""
        ? Math.min(4, Math.max(0.5, Number(savedNoiseScale)))
        : DEFAULT_CONFIG.threeNoiseLandscape.noiseScale;
    threeNoiseNoiseScaleRange.value = String(Math.round(noiseScale * 10));
    if (threeNoiseNoiseScaleValue) threeNoiseNoiseScaleValue.textContent = noiseScale.toFixed(1);
  }

  const savedScrollSpeed = readWindowStorageString(window.localStorage, v, "threeNoiseScrollSpeed");
  if (threeNoiseScrollSpeedRange) {
    const scrollSpeed =
      savedScrollSpeed != null && savedScrollSpeed !== ""
        ? Math.min(2.5, Math.max(0.1, Number(savedScrollSpeed)))
        : DEFAULT_CONFIG.threeNoiseLandscape.scrollSpeed;
    threeNoiseScrollSpeedRange.value = String(Math.round(scrollSpeed * 10));
    if (threeNoiseScrollSpeedValue) threeNoiseScrollSpeedValue.textContent = scrollSpeed.toFixed(1);
  }

  const savedPitch = readWindowStorageString(window.localStorage, v, "threeNoiseCameraPitch");
  if (threeNoiseCameraPitchRange) {
    const cameraPitchDeg =
      savedPitch != null && savedPitch !== ""
        ? clampInt(savedPitch, 25, 75)
        : DEFAULT_CONFIG.threeNoiseLandscape.cameraPitchDeg;
    threeNoiseCameraPitchRange.value = String(cameraPitchDeg);
    if (threeNoiseCameraPitchValue) threeNoiseCameraPitchValue.textContent = String(cameraPitchDeg);
  }

  if (threeNoiseWireframeToggle) {
    threeNoiseWireframeToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeNoiseWireframe"),
      DEFAULT_CONFIG.threeNoiseLandscape.wireframeOverlay,
    );
  }

  if (threeNoiseBloomToggle) {
    threeNoiseBloomToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "threeNoiseBloom"),
      DEFAULT_CONFIG.threeNoiseLandscape.bloomEnabled,
    );
  }

  const savedBloomStrength = readWindowStorageString(window.localStorage, v, "threeNoiseBloomStrength");
  if (threeNoiseBloomStrengthRange) {
    const bloomStrength =
      savedBloomStrength != null && savedBloomStrength !== ""
        ? Math.min(2, Math.max(0, Number(savedBloomStrength)))
        : DEFAULT_CONFIG.threeNoiseLandscape.bloomStrength;
    threeNoiseBloomStrengthRange.value = String(Math.round(bloomStrength * 10));
    if (threeNoiseBloomStrengthValue) {
      threeNoiseBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
  }
}

function applyHelix3dFormFromStorage(v) {
  const sg = readHelix3dShapeConfig(v) ?? { ...DEFAULT_CONFIG.helix3d.shape };
  if (helix3dGainRange) helix3dGainRange.value = String(sg.gainPercent);
  if (helix3dSmoothRange) helix3dSmoothRange.value = String(sg.smoothPercent);
  if (helix3dSoftClipRange) helix3dSoftClipRange.value = String(sg.softClipPercent);
  if (helix3dFallEaseRange) helix3dFallEaseRange.value = String(sg.fallEasePercent);
  if (helix3dGainValue) helix3dGainValue.textContent = String(sg.gainPercent);
  if (helix3dSmoothValue) helix3dSmoothValue.textContent = String(sg.smoothPercent);
  if (helix3dSoftClipValue) helix3dSoftClipValue.textContent = String(sg.softClipPercent);
  if (helix3dFallEaseValue) helix3dFallEaseValue.textContent = String(sg.fallEasePercent);

  const savedColor = readWindowStorageString(window.localStorage, v, "helix3dColor");
  if (helix3dColor && savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
    helix3dColor.value = savedColor.toLowerCase();
  } else if (helix3dColor) {
    helix3dColor.value = DEFAULT_CONFIG.helix3d.dotColor;
  }

  const savedRadius = readWindowStorageString(window.localStorage, v, "helix3dRadius");
  if (helix3dRadiusRange) {
    const helixRadius =
      savedRadius != null && savedRadius !== ""
        ? Math.min(1.0, Math.max(0.15, Number(savedRadius)))
        : DEFAULT_CONFIG.helix3d.helixRadius;
    helix3dRadiusRange.value = String(Math.round(helixRadius * 100));
    if (helix3dRadiusValue) helix3dRadiusValue.textContent = formatRing3dRadiusDisplay(helixRadius);
  }

  const savedPitch = readWindowStorageString(window.localStorage, v, "helix3dPitch");
  if (helix3dPitchRange) {
    const helixPitch =
      savedPitch != null && savedPitch !== ""
        ? Math.min(0.8, Math.max(0.1, Number(savedPitch)))
        : DEFAULT_CONFIG.helix3d.helixPitch;
    helix3dPitchRange.value = String(Math.round(helixPitch * 100));
    if (helix3dPitchValue) helix3dPitchValue.textContent = formatRing3dRadiusDisplay(helixPitch);
  }

  const savedTurns = readWindowStorageString(window.localStorage, v, "helix3dTurns");
  if (helix3dTurnsRange) {
    const helixTurns =
      savedTurns != null && savedTurns !== ""
        ? Math.min(4, Math.max(1, Number(savedTurns)))
        : DEFAULT_CONFIG.helix3d.helixTurns;
    helix3dTurnsRange.value = String(Math.round(helixTurns * 10));
    if (helix3dTurnsValue) helix3dTurnsValue.textContent = formatRing3dRadiusDisplay(helixTurns);
  }

  const savedCount = readWindowStorageString(window.localStorage, v, "helix3dDisplayCount");
  if (helix3dDisplayCountRange) {
    const displayPointCount =
      savedCount != null && savedCount !== ""
        ? clampInt(savedCount, 8, 64)
        : DEFAULT_CONFIG.helix3d.displayPointCount;
    helix3dDisplayCountRange.value = String(displayPointCount);
    if (helix3dDisplayCountValue) helix3dDisplayCountValue.textContent = String(displayPointCount);
  }

  const savedExtrudeMode = readWindowStorageString(window.localStorage, v, "helix3dExtrudeMode");
  if (helix3dExtrudeModeSelect) {
    helix3dExtrudeModeSelect.value = normalizeHelix3dExtrudeMode(
      savedExtrudeMode,
      DEFAULT_CONFIG.helix3d.extrudeMode,
    );
  }

  const savedPointSize = readWindowStorageString(window.localStorage, v, "helix3dPointSize");
  if (helix3dPointSizeRange) {
    const pointSizePx =
      savedPointSize != null && savedPointSize !== ""
        ? clampInt(savedPointSize, 2, 24)
        : DEFAULT_CONFIG.helix3d.pointSizePx;
    helix3dPointSizeRange.value = String(pointSizePx);
    if (helix3dPointSizeValue) helix3dPointSizeValue.textContent = String(pointSizePx);
  }

  if (helix3dWireframeToggle) {
    helix3dWireframeToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "helix3dWireframe"),
      DEFAULT_CONFIG.helix3d.wireframeEnabled,
    );
  }

  if (helix3dAutoRotateToggle) {
    helix3dAutoRotateToggle.checked = parseBoolean(
      readWindowStorageString(window.localStorage, v, "helix3dAutoRotate"),
      DEFAULT_CONFIG.helix3d.autoRotateEnabled,
    );
  }

  const savedRotateSpeed = readWindowStorageString(window.localStorage, v, "helix3dAutoRotateSpeed");
  if (helix3dAutoRotateSpeedRange) {
    const autoRotateSpeedDeg =
      savedRotateSpeed != null && savedRotateSpeed !== ""
        ? clampInt(savedRotateSpeed, 0, 20)
        : DEFAULT_CONFIG.helix3d.autoRotateSpeedDeg;
    helix3dAutoRotateSpeedRange.value = String(autoRotateSpeedDeg);
    if (helix3dAutoRotateSpeedValue) helix3dAutoRotateSpeedValue.textContent = String(autoRotateSpeedDeg);
  }

  const savedCameraDistance = readWindowStorageString(window.localStorage, v, "helix3dCameraDistance");
  if (helix3dCameraDistanceRange) {
    const cameraDistance =
      savedCameraDistance != null && savedCameraDistance !== ""
        ? Math.min(4.5, Math.max(1.2, Number(savedCameraDistance)))
        : DEFAULT_CONFIG.helix3d.cameraDistance;
    helix3dCameraDistanceRange.value = String(Math.round(cameraDistance * 10));
    if (helix3dCameraDistanceValue) {
      helix3dCameraDistanceValue.textContent = formatRing3dRadiusDisplay(cameraDistance);
    }
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
    applyHelix3dFormFromStorage(v);
    applyThreePlasmaFormFromStorage(v);
    applyThreeGalaxyFormFromStorage(v);
    applyThreeTunnelFormFromStorage(v);
    applyThreeSphereFormFromStorage(v);
    applyThreeKaleidoscopeFormFromStorage(v);
    applyThreeGlitchFormFromStorage(v);
    applyThreePhosphorFormFromStorage(v);
    applyThreeScanGridFormFromStorage(v);
    applyThreeLiquidBlobFormFromStorage(v);
    applyThreeAuroraFormFromStorage(v);
    applyThreeBreathingFormFromStorage(v);
    applyThreeNoiseFormFromStorage(v);
    applyThreeLavaLampFormFromStorage(v);
    applyThreeOilMarbleFormFromStorage(v);
    applyThreePearlChainFormFromStorage(v);
    applyThreeCrystalGemFormFromStorage(v);
    applyThreeGlassOrbsFormFromStorage(v);
    applyThreeHoloPrismFormFromStorage(v);
    applyThreeNebulaVolumeFormFromStorage(v);
    applyThreeKnotOrganicFormFromStorage(v);

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

  helix3dColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dColor", helix3dColor.value);
      await emitVisual("waveform-helix3d-color", helix3dColor.value);
    } catch (err) {
      statusEl.textContent = `更新点颜色失败：${String(err)}`;
    }
  });
  helix3dRadiusRange?.addEventListener("input", async (event) => {
    const helixRadius = clampInt(event.target.value, 15, 100) / 100;
    if (helix3dRadiusValue) helix3dRadiusValue.textContent = formatRing3dRadiusDisplay(helixRadius);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dRadius", String(helixRadius));
      await emitVisual("waveform-helix3d-radius", helixRadius);
    } catch (err) {
      statusEl.textContent = `更新螺旋半径失败：${String(err)}`;
    }
  });
  helix3dPitchRange?.addEventListener("input", async (event) => {
    const helixPitch = clampInt(event.target.value, 10, 80) / 100;
    if (helix3dPitchValue) helix3dPitchValue.textContent = formatRing3dRadiusDisplay(helixPitch);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dPitch", String(helixPitch));
      await emitVisual("waveform-helix3d-pitch", helixPitch);
    } catch (err) {
      statusEl.textContent = `更新螺距失败：${String(err)}`;
    }
  });
  helix3dTurnsRange?.addEventListener("input", async (event) => {
    const helixTurns = clampInt(event.target.value, 10, 40) / 10;
    if (helix3dTurnsValue) helix3dTurnsValue.textContent = formatRing3dRadiusDisplay(helixTurns);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dTurns", String(helixTurns));
      await emitVisual("waveform-helix3d-turns", helixTurns);
    } catch (err) {
      statusEl.textContent = `更新可见圈数失败：${String(err)}`;
    }
  });
  helix3dDisplayCountRange?.addEventListener("input", async (event) => {
    const displayPointCount = clampInt(event.target.value, 8, 64);
    if (helix3dDisplayCountValue) helix3dDisplayCountValue.textContent = String(displayPointCount);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "helix3dDisplayCount",
        String(displayPointCount),
      );
      await emitVisual("waveform-helix3d-display-count", displayPointCount);
    } catch (err) {
      statusEl.textContent = `更新显示点数失败：${String(err)}`;
    }
  });
  helix3dExtrudeModeSelect?.addEventListener("change", async () => {
    const extrudeMode = normalizeHelix3dExtrudeMode(
      helix3dExtrudeModeSelect.value,
      DEFAULT_CONFIG.helix3d.extrudeMode,
    );
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dExtrudeMode", extrudeMode);
      await emitVisual("waveform-helix3d-extrude-mode", extrudeMode);
    } catch (err) {
      statusEl.textContent = `更新幅度映射失败：${String(err)}`;
    }
  });
  helix3dPointSizeRange?.addEventListener("input", async (event) => {
    const pointSizePx = clampInt(event.target.value, 2, 24);
    if (helix3dPointSizeValue) helix3dPointSizeValue.textContent = String(pointSizePx);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dPointSize", String(pointSizePx));
      await emitVisual("waveform-helix3d-point-size", pointSizePx);
    } catch (err) {
      statusEl.textContent = `更新点大小失败：${String(err)}`;
    }
  });
  helix3dWireframeToggle?.addEventListener("change", async () => {
    const enabled = Boolean(helix3dWireframeToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dWireframe", String(enabled));
      await emitVisual("waveform-helix3d-wireframe", enabled);
    } catch (err) {
      statusEl.textContent = `更新螺旋链连线失败：${String(err)}`;
    }
  });
  helix3dAutoRotateToggle?.addEventListener("change", async () => {
    const enabled = Boolean(helix3dAutoRotateToggle.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dAutoRotate", String(enabled));
      await emitVisual("waveform-helix3d-auto-rotate", enabled);
    } catch (err) {
      statusEl.textContent = `更新自动旋转失败：${String(err)}`;
    }
  });
  helix3dAutoRotateSpeedRange?.addEventListener("input", async (event) => {
    const autoRotateSpeedDeg = clampInt(event.target.value, 0, 20);
    if (helix3dAutoRotateSpeedValue) helix3dAutoRotateSpeedValue.textContent = String(autoRotateSpeedDeg);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "helix3dAutoRotateSpeed",
        String(autoRotateSpeedDeg),
      );
      await emitVisual("waveform-helix3d-auto-rotate-speed", autoRotateSpeedDeg);
    } catch (err) {
      statusEl.textContent = `更新旋转速度失败：${String(err)}`;
    }
  });
  helix3dCameraDistanceRange?.addEventListener("input", async (event) => {
    const cameraDistance = clampInt(event.target.value, 12, 45) / 10;
    if (helix3dCameraDistanceValue) helix3dCameraDistanceValue.textContent = formatRing3dRadiusDisplay(cameraDistance);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "helix3dCameraDistance", String(cameraDistance));
      await emitVisual("waveform-helix3d-camera-distance", cameraDistance);
    } catch (err) {
      statusEl.textContent = `更新相机距离失败：${String(err)}`;
    }
  });
  helix3dGainRange?.addEventListener("input", () => {
    void syncHelix3dShapeConfig(visualTargetLabel, emitVisual);
  });
  helix3dSmoothRange?.addEventListener("input", () => {
    void syncHelix3dShapeConfig(visualTargetLabel, emitVisual);
  });
  helix3dSoftClipRange?.addEventListener("input", () => {
    void syncHelix3dShapeConfig(visualTargetLabel, emitVisual);
  });
  helix3dFallEaseRange?.addEventListener("input", () => {
    void syncHelix3dShapeConfig(visualTargetLabel, emitVisual);
  });

  threePlasmaColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaColorLow", threePlasmaColorLow.value);
      await emitVisual("waveform-three-plasma-color-low", threePlasmaColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低能量色失败：${String(err)}`;
    }
  });
  threePlasmaColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaColorHigh", threePlasmaColorHigh.value);
      await emitVisual("waveform-three-plasma-color-high", threePlasmaColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高能量色失败：${String(err)}`;
    }
  });
  threePlasmaSpeedRange?.addEventListener("input", async (event) => {
    const speed = clampInt(event.target.value, 2, 30) / 10;
    if (threePlasmaSpeedValue) threePlasmaSpeedValue.textContent = speed.toFixed(1);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaSpeed", String(speed));
      await emitVisual("waveform-three-plasma-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新动画速度失败：${String(err)}`;
    }
  });
  threePlasmaNoiseScaleRange?.addEventListener("input", async (event) => {
    const noiseScale = clampInt(event.target.value, 5, 60) / 10;
    if (threePlasmaNoiseScaleValue) threePlasmaNoiseScaleValue.textContent = noiseScale.toFixed(1);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaNoiseScale", String(noiseScale));
      await emitVisual("waveform-three-plasma-noise-scale", noiseScale);
    } catch (err) {
      statusEl.textContent = `更新噪声频率失败：${String(err)}`;
    }
  });
  threePlasmaReactivenessRange?.addEventListener("input", async (event) => {
    const reactiveness = clampInt(event.target.value, 0, 100);
    if (threePlasmaReactivenessValue) threePlasmaReactivenessValue.textContent = String(reactiveness);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaReactiveness", String(reactiveness));
      await emitVisual("waveform-three-plasma-reactiveness", reactiveness);
    } catch (err) {
      statusEl.textContent = `更新频谱驱动失败：${String(err)}`;
    }
  });
  threePlasmaBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaBloom", String(enabled));
      await emitVisual("waveform-three-plasma-bloom", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threePlasmaBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = clampInt(event.target.value, 0, 20) / 10;
    if (threePlasmaBloomStrengthValue) threePlasmaBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threePlasmaBloomStrength", String(bloomStrength));
      await emitVisual("waveform-three-plasma-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threePlasmaGainRange?.addEventListener("input", () => {
    void syncThreePlasmaShapeConfig(visualTargetLabel, emitVisual);
  });
  threePlasmaSmoothRange?.addEventListener("input", () => {
    void syncThreePlasmaShapeConfig(visualTargetLabel, emitVisual);
  });
  threePlasmaSoftClipRange?.addEventListener("input", () => {
    void syncThreePlasmaShapeConfig(visualTargetLabel, emitVisual);
  });
  threePlasmaFallEaseRange?.addEventListener("input", () => {
    void syncThreePlasmaShapeConfig(visualTargetLabel, emitVisual);
  });

  threeGalaxyColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyColor", threeGalaxyColor.value);
      await emitVisual("waveform-three-galaxy-color", threeGalaxyColor.value);
    } catch (err) {
      statusEl.textContent = `更新粒子颜色失败：${String(err)}`;
    }
  });
  threeGalaxyCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 2000, 20000);
    if (threeGalaxyCountValue) threeGalaxyCountValue.textContent = String(count);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyCount", String(count));
      await emitVisual("waveform-three-galaxy-count", count);
    } catch (err) {
      statusEl.textContent = `更新粒子数量失败：${String(err)}`;
    }
  });
  threeGalaxyRadiusRange?.addEventListener("input", async (event) => {
    const radius = Math.min(2.5, Math.max(0.5, Number(event.target.value) / 10));
    if (threeGalaxyRadiusValue) threeGalaxyRadiusValue.textContent = radius.toFixed(1);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyRadius", String(radius));
      await emitVisual("waveform-three-galaxy-radius", radius);
    } catch (err) {
      statusEl.textContent = `更新银河半径失败：${String(err)}`;
    }
  });
  threeGalaxyArmsSelect?.addEventListener("change", async (event) => {
    const arms = clampInt(event.target.value, 1, 4);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyArms", String(arms));
      await emitVisual("waveform-three-galaxy-arms", arms);
    } catch (err) {
      statusEl.textContent = `更新旋臂数量失败：${String(err)}`;
    }
  });
  threeGalaxyBassPullRange?.addEventListener("input", async (event) => {
    const bassPull = clampInt(event.target.value, 0, 100);
    if (threeGalaxyBassPullValue) threeGalaxyBassPullValue.textContent = String(bassPull);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyBassPull", String(bassPull));
      await emitVisual("waveform-three-galaxy-bass-pull", bassPull);
    } catch (err) {
      statusEl.textContent = `更新低频收拢失败：${String(err)}`;
    }
  });
  threeGalaxyTrebleSpreadRange?.addEventListener("input", async (event) => {
    const trebleSpread = clampInt(event.target.value, 0, 100);
    if (threeGalaxyTrebleSpreadValue) threeGalaxyTrebleSpreadValue.textContent = String(trebleSpread);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGalaxyTrebleSpread",
        String(trebleSpread),
      );
      await emitVisual("waveform-three-galaxy-treble-spread", trebleSpread);
    } catch (err) {
      statusEl.textContent = `更新高频扩散失败：${String(err)}`;
    }
  });
  threeGalaxyAutoRotateSpeedRange?.addEventListener("input", async (event) => {
    const speed = Math.min(20, Math.max(0, Number(event.target.value)));
    if (threeGalaxyAutoRotateSpeedValue) threeGalaxyAutoRotateSpeedValue.textContent = String(speed);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGalaxyAutoRotateSpeed",
        String(speed),
      );
      await emitVisual("waveform-three-galaxy-auto-rotate-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新自转速度失败：${String(err)}`;
    }
  });
  threeGalaxyBloomToggle?.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeGalaxyBloom", String(enabled));
      await emitVisual("waveform-three-galaxy-bloom", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeGalaxyBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeGalaxyBloomStrengthValue) threeGalaxyBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGalaxyBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-galaxy-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeGalaxyGainRange?.addEventListener("input", () => {
    void syncThreeGalaxyShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGalaxySmoothRange?.addEventListener("input", () => {
    void syncThreeGalaxyShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGalaxySoftClipRange?.addEventListener("input", () => {
    void syncThreeGalaxyShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGalaxyFallEaseRange?.addEventListener("input", () => {
    void syncThreeGalaxyShapeConfig(visualTargetLabel, emitVisual);
  });

  threeTunnelWallColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeTunnelWallColorLow",
        threeTunnelWallColorLow.value,
      );
      await emitVisual("waveform-three-tunnel-wall-color-low", threeTunnelWallColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新墙低能量色失败：${String(err)}`;
    }
  });
  threeTunnelWallColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeTunnelWallColorHigh",
        threeTunnelWallColorHigh.value,
      );
      await emitVisual("waveform-three-tunnel-wall-color-high", threeTunnelWallColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新墙高能量色失败：${String(err)}`;
    }
  });
  threeTunnelCoreColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeTunnelCoreColor",
        threeTunnelCoreColor.value,
      );
      await emitVisual("waveform-three-tunnel-core-color", threeTunnelCoreColor.value);
    } catch (err) {
      statusEl.textContent = `更新核心颜色失败：${String(err)}`;
    }
  });
  threeTunnelSpeedRange?.addEventListener("input", async (event) => {
    const speed = Math.min(3, Math.max(0.2, Number(event.target.value) / 10));
    if (threeTunnelSpeedValue) threeTunnelSpeedValue.textContent = speed.toFixed(1);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeTunnelSpeed", String(speed));
      await emitVisual("waveform-three-tunnel-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新隧道速度失败：${String(err)}`;
    }
  });
  threeTunnelWallSegmentsRange?.addEventListener("input", async (event) => {
    const segments = clampInt(event.target.value, 16, 64);
    if (threeTunnelWallSegmentsValue) threeTunnelWallSegmentsValue.textContent = String(segments);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeTunnelWallSegments",
        String(segments),
      );
      await emitVisual("waveform-three-tunnel-wall-segments", segments);
    } catch (err) {
      statusEl.textContent = `更新墙频段数失败：${String(err)}`;
    }
  });
  threeTunnelCorePulseRange?.addEventListener("input", async (event) => {
    const corePulse = clampInt(event.target.value, 0, 100);
    if (threeTunnelCorePulseValue) threeTunnelCorePulseValue.textContent = String(corePulse);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeTunnelCorePulseStrength",
        String(corePulse),
      );
      await emitVisual("waveform-three-tunnel-core-pulse-strength", corePulse);
    } catch (err) {
      statusEl.textContent = `更新核心脉冲失败：${String(err)}`;
    }
  });
  threeTunnelFovRange?.addEventListener("input", async (event) => {
    const fov = clampInt(event.target.value, 45, 85);
    if (threeTunnelFovValue) threeTunnelFovValue.textContent = String(fov);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeTunnelFov", String(fov));
      await emitVisual("waveform-three-tunnel-fov", fov);
    } catch (err) {
      statusEl.textContent = `更新视野 FOV 失败：${String(err)}`;
    }
  });
  threeTunnelBloomToggle?.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeTunnelBloom", String(enabled));
      await emitVisual("waveform-three-tunnel-bloom", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeTunnelBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeTunnelBloomStrengthValue) threeTunnelBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeTunnelBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-tunnel-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeTunnelGainRange?.addEventListener("input", () => {
    void syncThreeTunnelShapeConfig(visualTargetLabel, emitVisual);
  });
  threeTunnelSmoothRange?.addEventListener("input", () => {
    void syncThreeTunnelShapeConfig(visualTargetLabel, emitVisual);
  });
  threeTunnelSoftClipRange?.addEventListener("input", () => {
    void syncThreeTunnelShapeConfig(visualTargetLabel, emitVisual);
  });
  threeTunnelFallEaseRange?.addEventListener("input", () => {
    void syncThreeTunnelShapeConfig(visualTargetLabel, emitVisual);
  });

  threeSphereCoreColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereCoreColor",
        threeSphereCoreColor.value,
      );
      await emitVisual("waveform-three-sphere-core-color", threeSphereCoreColor.value);
    } catch (err) {
      statusEl.textContent = `更新核心颜色失败：${String(err)}`;
    }
  });
  threeSphereHaloColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereHaloColor",
        threeSphereHaloColor.value,
      );
      await emitVisual("waveform-three-sphere-halo-color", threeSphereHaloColor.value);
    } catch (err) {
      statusEl.textContent = `更新光晕颜色失败：${String(err)}`;
    }
  });
  threeSphereDeformRange?.addEventListener("input", async (event) => {
    const deform = clampInt(event.target.value, 0, 100);
    if (threeSphereDeformValue) threeSphereDeformValue.textContent = String(deform);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereDeformStrength",
        String(deform),
      );
      await emitVisual("waveform-three-sphere-deform-strength", deform);
    } catch (err) {
      statusEl.textContent = `更新形变强度失败：${String(err)}`;
    }
  });
  threeSphereNoiseSpeedRange?.addEventListener("input", async (event) => {
    const noiseSpeed = Math.min(3, Math.max(0.2, Number(event.target.value) / 10));
    if (threeSphereNoiseSpeedValue) threeSphereNoiseSpeedValue.textContent = noiseSpeed.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereNoiseSpeed",
        String(noiseSpeed),
      );
      await emitVisual("waveform-three-sphere-noise-speed", noiseSpeed);
    } catch (err) {
      statusEl.textContent = `更新噪声速度失败：${String(err)}`;
    }
  });
  threeSphereHaloCountRange?.addEventListener("input", async (event) => {
    const haloCount = clampInt(event.target.value, 200, 3000);
    if (threeSphereHaloCountValue) threeSphereHaloCountValue.textContent = String(haloCount);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereHaloCount",
        String(haloCount),
      );
      await emitVisual("waveform-three-sphere-halo-count", haloCount);
    } catch (err) {
      statusEl.textContent = `更新光晕粒子数失败：${String(err)}`;
    }
  });
  threeSphereAutoRotateSpeedRange?.addEventListener("input", async (event) => {
    const speed = Math.min(20, Math.max(0, Number(event.target.value)));
    if (threeSphereAutoRotateSpeedValue) threeSphereAutoRotateSpeedValue.textContent = String(speed);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereAutoRotateSpeed",
        String(speed),
      );
      await emitVisual("waveform-three-sphere-auto-rotate-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新自转速度失败：${String(err)}`;
    }
  });
  threeSphereWireframeToggle?.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereWireframe",
        String(enabled),
      );
      await emitVisual("waveform-three-sphere-wireframe", enabled);
    } catch (err) {
      statusEl.textContent = `更新线框叠加失败：${String(err)}`;
    }
  });
  threeSphereBloomToggle?.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeSphereBloom", String(enabled));
      await emitVisual("waveform-three-sphere-bloom", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeSphereBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeSphereBloomStrengthValue) threeSphereBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeSphereBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-sphere-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeSphereGainRange?.addEventListener("input", () => {
    void syncThreeSphereShapeConfig(visualTargetLabel, emitVisual);
  });
  threeSphereSmoothRange?.addEventListener("input", () => {
    void syncThreeSphereShapeConfig(visualTargetLabel, emitVisual);
  });
  threeSphereSoftClipRange?.addEventListener("input", () => {
    void syncThreeSphereShapeConfig(visualTargetLabel, emitVisual);
  });
  threeSphereFallEaseRange?.addEventListener("input", () => {
    void syncThreeSphereShapeConfig(visualTargetLabel, emitVisual);
  });

  threeKaleidoscopeSegmentsSelect?.addEventListener("change", async (event) => {
    const segments = normalizeKaleidoscopeSegments(
      event.target.value,
      DEFAULT_CONFIG.threeKaleidoscope.segments,
    );
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeSegments",
        String(segments),
      );
      await emitVisual("waveform-three-kaleidoscope-segments", segments);
    } catch (err) {
      statusEl.textContent = `更新对称瓣数失败：${String(err)}`;
    }
  });
  threeKaleidoscopeColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeColorLow",
        threeKaleidoscopeColorLow.value,
      );
      await emitVisual("waveform-three-kaleidoscope-color-low", threeKaleidoscopeColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低能量色失败：${String(err)}`;
    }
  });
  threeKaleidoscopeColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeColorHigh",
        threeKaleidoscopeColorHigh.value,
      );
      await emitVisual("waveform-three-kaleidoscope-color-high", threeKaleidoscopeColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高能量色失败：${String(err)}`;
    }
  });
  threeKaleidoscopeRotationSpeedRange?.addEventListener("input", async (event) => {
    const speed = Math.min(30, Math.max(0, Number(event.target.value)));
    if (threeKaleidoscopeRotationSpeedValue) {
      threeKaleidoscopeRotationSpeedValue.textContent = String(Math.round(speed));
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeRotationSpeed",
        String(speed),
      );
      await emitVisual("waveform-three-kaleidoscope-rotation-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新旋转速度失败：${String(err)}`;
    }
  });
  threeKaleidoscopeReactivenessRange?.addEventListener("input", async (event) => {
    const reactiveness = clampInt(event.target.value, 0, 100);
    if (threeKaleidoscopeReactivenessValue) {
      threeKaleidoscopeReactivenessValue.textContent = String(reactiveness);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeReactiveness",
        String(reactiveness),
      );
      await emitVisual("waveform-three-kaleidoscope-reactiveness", reactiveness);
    } catch (err) {
      statusEl.textContent = `更新频谱驱动失败：${String(err)}`;
    }
  });
  threeKaleidoscopeBloomToggle?.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeBloom",
        String(enabled),
      );
      await emitVisual("waveform-three-kaleidoscope-bloom", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeKaleidoscopeBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeKaleidoscopeBloomStrengthValue) {
      threeKaleidoscopeBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKaleidoscopeBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-kaleidoscope-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeKaleidoscopeGainRange?.addEventListener("input", () => {
    void syncThreeKaleidoscopeShapeConfig(visualTargetLabel, emitVisual);
  });
  threeKaleidoscopeSmoothRange?.addEventListener("input", () => {
    void syncThreeKaleidoscopeShapeConfig(visualTargetLabel, emitVisual);
  });
  threeKaleidoscopeSoftClipRange?.addEventListener("input", () => {
    void syncThreeKaleidoscopeShapeConfig(visualTargetLabel, emitVisual);
  });
  threeKaleidoscopeFallEaseRange?.addEventListener("input", () => {
    void syncThreeKaleidoscopeShapeConfig(visualTargetLabel, emitVisual);
  });

  threeGlitchBaseColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlitchBaseColor",
        threeGlitchBaseColor.value,
      );
      await emitVisual("waveform-three-glitch-base-color", threeGlitchBaseColor.value);
    } catch (err) {
      statusEl.textContent = `更新基底颜色失败：${String(err)}`;
    }
  });
  threeGlitchIntensityRange?.addEventListener("input", async (event) => {
    const intensity = clampInt(event.target.value, 0, 100);
    if (threeGlitchIntensityValue) threeGlitchIntensityValue.textContent = String(intensity);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlitchIntensity",
        String(intensity),
      );
      await emitVisual("waveform-three-glitch-intensity", intensity);
    } catch (err) {
      statusEl.textContent = `更新故障强度失败：${String(err)}`;
    }
  });
  threeGlitchRgbSplitRange?.addEventListener("input", async (event) => {
    const rgbSplit = clampInt(event.target.value, 0, 12);
    if (threeGlitchRgbSplitValue) threeGlitchRgbSplitValue.textContent = String(rgbSplit);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlitchRgbSplit",
        String(rgbSplit),
      );
      await emitVisual("waveform-three-glitch-rgb-split", rgbSplit);
    } catch (err) {
      statusEl.textContent = `更新 RGB 分离失败：${String(err)}`;
    }
  });
  threeGlitchScanlineOpacityRange?.addEventListener("input", async (event) => {
    const scanlineOpacity = clampInt(event.target.value, 0, 100);
    if (threeGlitchScanlineOpacityValue) {
      threeGlitchScanlineOpacityValue.textContent = String(scanlineOpacity);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlitchScanlineOpacity",
        String(scanlineOpacity),
      );
      await emitVisual("waveform-three-glitch-scanline-opacity", scanlineOpacity);
    } catch (err) {
      statusEl.textContent = `更新扫描线透明度失败：${String(err)}`;
    }
  });
  threeGlitchTriggerThresholdRange?.addEventListener("input", async (event) => {
    const triggerThreshold = clampInt(event.target.value, 0, 100);
    if (threeGlitchTriggerThresholdValue) {
      threeGlitchTriggerThresholdValue.textContent = String(triggerThreshold);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlitchTriggerThreshold",
        String(triggerThreshold),
      );
      await emitVisual("waveform-three-glitch-trigger-threshold", triggerThreshold);
    } catch (err) {
      statusEl.textContent = `更新触发阈值失败：${String(err)}`;
    }
  });
  threeGlitchCooldownRange?.addEventListener("input", async (event) => {
    const cooldownMs = clampInt(event.target.value, 30, 2000);
    if (threeGlitchCooldownValue) threeGlitchCooldownValue.textContent = String(cooldownMs);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlitchCooldownMs",
        String(cooldownMs),
      );
      await emitVisual("waveform-three-glitch-cooldown-ms", cooldownMs);
    } catch (err) {
      statusEl.textContent = `更新冷却时间失败：${String(err)}`;
    }
  });
  threeGlitchGainRange?.addEventListener("input", () => {
    void syncThreeGlitchShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGlitchSmoothRange?.addEventListener("input", () => {
    void syncThreeGlitchShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGlitchSoftClipRange?.addEventListener("input", () => {
    void syncThreeGlitchShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGlitchFallEaseRange?.addEventListener("input", () => {
    void syncThreeGlitchShapeConfig(visualTargetLabel, emitVisual);
  });

  threePhosphorLineColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorLineColor",
        threePhosphorLineColor.value,
      );
      await emitVisual("waveform-three-phosphor-line-color", threePhosphorLineColor.value);
    } catch (err) {
      statusEl.textContent = `更新线条颜色失败：${String(err)}`;
    }
  });
  threePhosphorGlowColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorGlowColor",
        threePhosphorGlowColor.value,
      );
      await emitVisual("waveform-three-phosphor-glow-color", threePhosphorGlowColor.value);
    } catch (err) {
      statusEl.textContent = `更新辉光颜色失败：${String(err)}`;
    }
  });
  threePhosphorLineWidthRange?.addEventListener("input", async (event) => {
    const lineWidthPx = clampInt(event.target.value, 1, 12);
    if (threePhosphorLineWidthValue) threePhosphorLineWidthValue.textContent = String(lineWidthPx);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorLineWidth",
        String(lineWidthPx),
      );
      await emitVisual("waveform-three-phosphor-line-width", lineWidthPx);
    } catch (err) {
      statusEl.textContent = `更新线宽失败：${String(err)}`;
    }
  });
  threePhosphorDecayRange?.addEventListener("input", async (event) => {
    const decayPercent = clampInt(event.target.value, 10, 90);
    if (threePhosphorDecayValue) threePhosphorDecayValue.textContent = String(decayPercent);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorDecay",
        String(decayPercent),
      );
      await emitVisual("waveform-three-phosphor-decay", decayPercent);
    } catch (err) {
      statusEl.textContent = `更新余辉衰减失败：${String(err)}`;
    }
  });
  threePhosphorBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-phosphor-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threePhosphorBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threePhosphorBloomStrengthValue) {
      threePhosphorBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-phosphor-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threePhosphorMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePhosphorMirror",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-phosphor-mirror-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新镜像对称失败：${String(err)}`;
    }
  });
  threePhosphorGainRange?.addEventListener("input", () => {
    void syncThreePhosphorShapeConfig(visualTargetLabel, emitVisual);
  });
  threePhosphorSmoothRange?.addEventListener("input", () => {
    void syncThreePhosphorShapeConfig(visualTargetLabel, emitVisual);
  });
  threePhosphorSoftClipRange?.addEventListener("input", () => {
    void syncThreePhosphorShapeConfig(visualTargetLabel, emitVisual);
  });
  threePhosphorFallEaseRange?.addEventListener("input", () => {
    void syncThreePhosphorShapeConfig(visualTargetLabel, emitVisual);
  });

  threeScanGridColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeScanGridColor",
        threeScanGridColor.value,
      );
      await emitVisual("waveform-three-scan-grid-color", threeScanGridColor.value);
    } catch (err) {
      statusEl.textContent = `更新网格颜色失败：${String(err)}`;
    }
  });
  threeScanGridHighlightColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeScanGridHighlightColor",
        threeScanGridHighlightColor.value,
      );
      await emitVisual("waveform-three-scan-grid-highlight-color", threeScanGridHighlightColor.value);
    } catch (err) {
      statusEl.textContent = `更新高亮颜色失败：${String(err)}`;
    }
  });
  threeScanGridScanBeamColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeScanGridScanBeamColor",
        threeScanGridScanBeamColor.value,
      );
      await emitVisual("waveform-three-scan-grid-scan-beam-color", threeScanGridScanBeamColor.value);
    } catch (err) {
      statusEl.textContent = `更新扫描光束色失败：${String(err)}`;
    }
  });
  threeScanGridRowsRange?.addEventListener("input", async (event) => {
    const rows = clampInt(event.target.value, 12, 48);
    if (threeScanGridRowsValue) threeScanGridRowsValue.textContent = String(rows);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridRows", String(rows));
      await emitVisual("waveform-three-scan-grid-rows", rows);
    } catch (err) {
      statusEl.textContent = `更新网格行数失败：${String(err)}`;
    }
  });
  threeScanGridColsRange?.addEventListener("input", async (event) => {
    const cols = clampInt(event.target.value, 16, 64);
    if (threeScanGridColsValue) threeScanGridColsValue.textContent = String(cols);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridCols", String(cols));
      await emitVisual("waveform-three-scan-grid-cols", cols);
    } catch (err) {
      statusEl.textContent = `更新网格列数失败：${String(err)}`;
    }
  });
  threeScanGridScanSpeedRange?.addEventListener("input", async (event) => {
    const speed = Math.min(3, Math.max(0.2, Number(event.target.value) / 10));
    if (threeScanGridScanSpeedValue) threeScanGridScanSpeedValue.textContent = speed.toFixed(1);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridScanSpeed", String(speed));
      await emitVisual("waveform-three-scan-grid-scan-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新扫描速度失败：${String(err)}`;
    }
  });
  threeScanGridHighlightStrengthRange?.addEventListener("input", async (event) => {
    const strength = clampInt(event.target.value, 0, 100);
    if (threeScanGridHighlightStrengthValue) {
      threeScanGridHighlightStrengthValue.textContent = String(strength);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeScanGridHighlightStrength",
        String(strength),
      );
      await emitVisual("waveform-three-scan-grid-highlight-strength", strength);
    } catch (err) {
      statusEl.textContent = `更新高亮强度失败：${String(err)}`;
    }
  });
  threeScanGridCameraPitchRange?.addEventListener("input", async (event) => {
    const pitch = clampInt(event.target.value, 25, 75);
    if (threeScanGridCameraPitchValue) threeScanGridCameraPitchValue.textContent = String(pitch);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridCameraPitch", String(pitch));
      await emitVisual("waveform-three-scan-grid-camera-pitch", pitch);
    } catch (err) {
      statusEl.textContent = `更新相机俯角失败：${String(err)}`;
    }
  });
  threeScanGridBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeScanGridBloom", String(enabled));
      await emitVisual("waveform-three-scan-grid-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeScanGridBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeScanGridBloomStrengthValue) {
      threeScanGridBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeScanGridBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-scan-grid-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeScanGridGainRange?.addEventListener("input", () => {
    void syncThreeScanGridShapeConfig(visualTargetLabel, emitVisual);
  });
  threeScanGridSmoothRange?.addEventListener("input", () => {
    void syncThreeScanGridShapeConfig(visualTargetLabel, emitVisual);
  });
  threeScanGridSoftClipRange?.addEventListener("input", () => {
    void syncThreeScanGridShapeConfig(visualTargetLabel, emitVisual);
  });
  threeScanGridFallEaseRange?.addEventListener("input", () => {
    void syncThreeScanGridShapeConfig(visualTargetLabel, emitVisual);
  });

  threeLiquidBlobColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobColor",
        threeLiquidBlobColor.value,
      );
      await emitVisual("waveform-three-liquid-blob-color", threeLiquidBlobColor.value);
    } catch (err) {
      statusEl.textContent = `更新主色失败：${String(err)}`;
    }
  });
  threeLiquidBlobColorSecondary?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobColorSecondary",
        threeLiquidBlobColorSecondary.value,
      );
      await emitVisual("waveform-three-liquid-blob-color-secondary", threeLiquidBlobColorSecondary.value);
    } catch (err) {
      statusEl.textContent = `更新副色失败：${String(err)}`;
    }
  });
  threeLiquidBlobCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 2, 5);
    if (threeLiquidBlobCountValue) threeLiquidBlobCountValue.textContent = String(count);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeLiquidBlobCount", String(count));
      await emitVisual("waveform-three-liquid-blob-count", count);
    } catch (err) {
      statusEl.textContent = `更新球体数量失败：${String(err)}`;
    }
  });
  threeLiquidBlobMergeStrengthRange?.addEventListener("input", async (event) => {
    const merge = clampInt(event.target.value, 0, 100);
    if (threeLiquidBlobMergeStrengthValue) threeLiquidBlobMergeStrengthValue.textContent = String(merge);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobMergeStrength",
        String(merge),
      );
      await emitVisual("waveform-three-liquid-blob-merge-strength", merge);
    } catch (err) {
      statusEl.textContent = `更新融合强度失败：${String(err)}`;
    }
  });
  threeLiquidBlobWobbleSpeedRange?.addEventListener("input", async (event) => {
    const wobble = Math.min(3, Math.max(0.2, Number(event.target.value) / 10));
    if (threeLiquidBlobWobbleSpeedValue) threeLiquidBlobWobbleSpeedValue.textContent = wobble.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobWobbleSpeed",
        String(wobble),
      );
      await emitVisual("waveform-three-liquid-blob-wobble-speed", wobble);
    } catch (err) {
      statusEl.textContent = `更新摆动速度失败：${String(err)}`;
    }
  });
  threeLiquidBlobBassDriveRange?.addEventListener("input", async (event) => {
    const bassDrive = clampInt(event.target.value, 0, 100);
    if (threeLiquidBlobBassDriveValue) threeLiquidBlobBassDriveValue.textContent = String(bassDrive);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobBassDrive",
        String(bassDrive),
      );
      await emitVisual("waveform-three-liquid-blob-bass-drive", bassDrive);
    } catch (err) {
      statusEl.textContent = `更新低频驱动失败：${String(err)}`;
    }
  });
  threeLiquidBlobPulseOnPeakToggle?.addEventListener("change", async () => {
    const enabled = threeLiquidBlobPulseOnPeakToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobPulseOnPeak",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-liquid-blob-pulse-on-peak", enabled);
    } catch (err) {
      statusEl.textContent = `更新峰值体积脉冲失败：${String(err)}`;
    }
  });
  threeLiquidBlobBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeLiquidBlobBloom", String(enabled));
      await emitVisual("waveform-three-liquid-blob-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeLiquidBlobBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeLiquidBlobBloomStrengthValue) {
      threeLiquidBlobBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLiquidBlobBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-liquid-blob-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeLiquidBlobGainRange?.addEventListener("input", () => {
    void syncThreeLiquidBlobShapeConfig(visualTargetLabel, emitVisual);
  });
  threeLiquidBlobSmoothRange?.addEventListener("input", () => {
    void syncThreeLiquidBlobShapeConfig(visualTargetLabel, emitVisual);
  });
  threeLiquidBlobSoftClipRange?.addEventListener("input", () => {
    void syncThreeLiquidBlobShapeConfig(visualTargetLabel, emitVisual);
  });
  threeLiquidBlobFallEaseRange?.addEventListener("input", () => {
    void syncThreeLiquidBlobShapeConfig(visualTargetLabel, emitVisual);
  });

  threeLavaLampColorWarm?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLavaLampColorWarm",
        threeLavaLampColorWarm.value,
      );
      await emitVisual("waveform-three-lava-lamp-color-warm", threeLavaLampColorWarm.value);
    } catch (err) {
      statusEl.textContent = `更新暖色失败：${String(err)}`;
    }
  });
  threeLavaLampColorCool?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLavaLampColorCool",
        threeLavaLampColorCool.value,
      );
      await emitVisual("waveform-three-lava-lamp-color-cool", threeLavaLampColorCool.value);
    } catch (err) {
      statusEl.textContent = `更新冷色失败：${String(err)}`;
    }
  });
  threeLavaLampBlobCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 2, 4);
    if (threeLavaLampBlobCountValue) threeLavaLampBlobCountValue.textContent = String(count);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeLavaLampBlobCount", String(count));
      await emitVisual("waveform-three-lava-lamp-blob-count", count);
    } catch (err) {
      statusEl.textContent = `更新球体数量失败：${String(err)}`;
    }
  });
  threeLavaLampMergeStrengthRange?.addEventListener("input", async (event) => {
    const merge = clampInt(event.target.value, 0, 100);
    if (threeLavaLampMergeStrengthValue) threeLavaLampMergeStrengthValue.textContent = String(merge);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLavaLampMergeStrength",
        String(merge),
      );
      await emitVisual("waveform-three-lava-lamp-merge-strength", merge);
    } catch (err) {
      statusEl.textContent = `更新融合强度失败：${String(err)}`;
    }
  });
  threeLavaLampBuoyancySpeedRange?.addEventListener("input", async (event) => {
    const buoyancy = Math.min(2, Math.max(0.2, Number(event.target.value) / 10));
    if (threeLavaLampBuoyancySpeedValue) {
      threeLavaLampBuoyancySpeedValue.textContent = buoyancy.toFixed(2);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLavaLampBuoyancySpeed",
        String(buoyancy),
      );
      await emitVisual("waveform-three-lava-lamp-buoyancy-speed", buoyancy);
    } catch (err) {
      statusEl.textContent = `更新浮力速度失败：${String(err)}`;
    }
  });
  threeLavaLampBassDriveRange?.addEventListener("input", async (event) => {
    const bassDrive = clampInt(event.target.value, 0, 100);
    if (threeLavaLampBassDriveValue) threeLavaLampBassDriveValue.textContent = String(bassDrive);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLavaLampBassDrive",
        String(bassDrive),
      );
      await emitVisual("waveform-three-lava-lamp-bass-drive", bassDrive);
    } catch (err) {
      statusEl.textContent = `更新低频驱动失败：${String(err)}`;
    }
  });
  threeLavaLampBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeLavaLampBloom", String(enabled));
      await emitVisual("waveform-three-lava-lamp-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeLavaLampBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeLavaLampBloomStrengthValue) {
      threeLavaLampBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeLavaLampBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-lava-lamp-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeLavaLampGainRange?.addEventListener("input", () => {
    void syncThreeLavaLampShapeConfig(visualTargetLabel, emitVisual);
  });
  threeLavaLampSmoothRange?.addEventListener("input", () => {
    void syncThreeLavaLampShapeConfig(visualTargetLabel, emitVisual);
  });
  threeLavaLampSoftClipRange?.addEventListener("input", () => {
    void syncThreeLavaLampShapeConfig(visualTargetLabel, emitVisual);
  });
  threeLavaLampFallEaseRange?.addEventListener("input", () => {
    void syncThreeLavaLampShapeConfig(visualTargetLabel, emitVisual);
  });

  threeOilMarbleColor1?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleColor1",
        threeOilMarbleColor1.value,
      );
      await emitVisual("waveform-three-oil-marble-color1", threeOilMarbleColor1.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 1 失败：${String(err)}`;
    }
  });
  threeOilMarbleColor2?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleColor2",
        threeOilMarbleColor2.value,
      );
      await emitVisual("waveform-three-oil-marble-color2", threeOilMarbleColor2.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 2 失败：${String(err)}`;
    }
  });
  threeOilMarbleColor3?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleColor3",
        threeOilMarbleColor3.value,
      );
      await emitVisual("waveform-three-oil-marble-color3", threeOilMarbleColor3.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 3 失败：${String(err)}`;
    }
  });
  threeOilMarbleColor4?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleColor4",
        threeOilMarbleColor4.value,
      );
      await emitVisual("waveform-three-oil-marble-color4", threeOilMarbleColor4.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 4 失败：${String(err)}`;
    }
  });
  threeOilMarbleColor4Toggle?.addEventListener("change", async () => {
    const enabled = threeOilMarbleColor4Toggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleColor4Enabled",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-oil-marble-color4-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新第 4 色开关失败：${String(err)}`;
    }
  });
  threeOilMarbleFlowSpeedRange?.addEventListener("input", async (event) => {
    const flow = Math.min(2.5, Math.max(0.2, Number(event.target.value) / 10));
    if (threeOilMarbleFlowSpeedValue) threeOilMarbleFlowSpeedValue.textContent = flow.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleFlowSpeed",
        String(flow),
      );
      await emitVisual("waveform-three-oil-marble-flow-speed", flow);
    } catch (err) {
      statusEl.textContent = `更新流动速度失败：${String(err)}`;
    }
  });
  threeOilMarbleNoiseScaleRange?.addEventListener("input", async (event) => {
    const noise = Math.min(4.5, Math.max(0.8, Number(event.target.value) / 10));
    if (threeOilMarbleNoiseScaleValue) threeOilMarbleNoiseScaleValue.textContent = noise.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleNoiseScale",
        String(noise),
      );
      await emitVisual("waveform-three-oil-marble-noise-scale", noise);
    } catch (err) {
      statusEl.textContent = `更新噪声尺度失败：${String(err)}`;
    }
  });
  threeOilMarbleWarpStrengthRange?.addEventListener("input", async (event) => {
    const warp = clampInt(event.target.value, 0, 100);
    if (threeOilMarbleWarpStrengthValue) threeOilMarbleWarpStrengthValue.textContent = String(warp);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleWarpStrength",
        String(warp),
      );
      await emitVisual("waveform-three-oil-marble-warp-strength", warp);
    } catch (err) {
      statusEl.textContent = `更新域扭曲失败：${String(err)}`;
    }
  });
  threeOilMarbleReactivenessRange?.addEventListener("input", async (event) => {
    const react = clampInt(event.target.value, 0, 100);
    if (threeOilMarbleReactivenessValue) threeOilMarbleReactivenessValue.textContent = String(react);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleReactiveness",
        String(react),
      );
      await emitVisual("waveform-three-oil-marble-reactiveness", react);
    } catch (err) {
      statusEl.textContent = `更新音频响应失败：${String(err)}`;
    }
  });
  threeOilMarbleBloomToggle?.addEventListener("change", async () => {
    const enabled = threeOilMarbleBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-oil-marble-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeOilMarbleBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeOilMarbleBloomStrengthValue) {
      threeOilMarbleBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeOilMarbleBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-oil-marble-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeOilMarbleGainRange?.addEventListener("input", () => {
    void syncThreeOilMarbleShapeConfig(visualTargetLabel, emitVisual);
  });
  threeOilMarbleSmoothRange?.addEventListener("input", () => {
    void syncThreeOilMarbleShapeConfig(visualTargetLabel, emitVisual);
  });
  threeOilMarbleSoftClipRange?.addEventListener("input", () => {
    void syncThreeOilMarbleShapeConfig(visualTargetLabel, emitVisual);
  });
  threeOilMarbleFallEaseRange?.addEventListener("input", () => {
    void syncThreeOilMarbleShapeConfig(visualTargetLabel, emitVisual);
  });

  threePearlChainColor1?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainColor1",
        threePearlChainColor1.value,
      );
      await emitVisual("waveform-three-pearl-chain-color1", threePearlChainColor1.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 1 失败：${String(err)}`;
    }
  });
  threePearlChainColor2?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainColor2",
        threePearlChainColor2.value,
      );
      await emitVisual("waveform-three-pearl-chain-color2", threePearlChainColor2.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 2 失败：${String(err)}`;
    }
  });
  threePearlChainColor3?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainColor3",
        threePearlChainColor3.value,
      );
      await emitVisual("waveform-three-pearl-chain-color3", threePearlChainColor3.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 3 失败：${String(err)}`;
    }
  });
  threePearlChainPearlCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 5, 10);
    if (threePearlChainPearlCountValue) threePearlChainPearlCountValue.textContent = String(count);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainPearlCount",
        String(count),
      );
      await emitVisual("waveform-three-pearl-chain-pearl-count", count);
    } catch (err) {
      statusEl.textContent = `更新珍珠数量失败：${String(err)}`;
    }
  });
  threePearlChainChainRadiusRange?.addEventListener("input", async (event) => {
    const radius = Math.min(1.2, Math.max(0.4, Number(event.target.value) / 100));
    if (threePearlChainChainRadiusValue) threePearlChainChainRadiusValue.textContent = radius.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainChainRadius",
        String(radius),
      );
      await emitVisual("waveform-three-pearl-chain-chain-radius", radius);
    } catch (err) {
      statusEl.textContent = `更新链弯曲半径失败：${String(err)}`;
    }
  });
  threePearlChainPearlSizeRange?.addEventListener("input", async (event) => {
    const size = Math.min(0.35, Math.max(0.12, Number(event.target.value) / 100));
    if (threePearlChainPearlSizeValue) threePearlChainPearlSizeValue.textContent = size.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainPearlSize",
        String(size),
      );
      await emitVisual("waveform-three-pearl-chain-pearl-size", size);
    } catch (err) {
      statusEl.textContent = `更新珍珠大小失败：${String(err)}`;
    }
  });
  threePearlChainSwaySpeedRange?.addEventListener("input", async (event) => {
    const sway = Math.min(2, Math.max(0.2, Number(event.target.value) / 10));
    if (threePearlChainSwaySpeedValue) threePearlChainSwaySpeedValue.textContent = sway.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainSwaySpeed",
        String(sway),
      );
      await emitVisual("waveform-three-pearl-chain-sway-speed", sway);
    } catch (err) {
      statusEl.textContent = `更新摆动速度失败：${String(err)}`;
    }
  });
  threePearlChainMergeStrengthRange?.addEventListener("input", async (event) => {
    const merge = clampInt(event.target.value, 0, 100);
    if (threePearlChainMergeStrengthValue) threePearlChainMergeStrengthValue.textContent = String(merge);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainMergeStrength",
        String(merge),
      );
      await emitVisual("waveform-three-pearl-chain-merge-strength", merge);
    } catch (err) {
      statusEl.textContent = `更新珠间融合失败：${String(err)}`;
    }
  });
  threePearlChainBloomToggle?.addEventListener("change", async () => {
    const enabled = threePearlChainBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-pearl-chain-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threePearlChainBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threePearlChainBloomStrengthValue) {
      threePearlChainBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threePearlChainBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-pearl-chain-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threePearlChainGainRange?.addEventListener("input", () => {
    void syncThreePearlChainShapeConfig(visualTargetLabel, emitVisual);
  });
  threePearlChainSmoothRange?.addEventListener("input", () => {
    void syncThreePearlChainShapeConfig(visualTargetLabel, emitVisual);
  });
  threePearlChainSoftClipRange?.addEventListener("input", () => {
    void syncThreePearlChainShapeConfig(visualTargetLabel, emitVisual);
  });
  threePearlChainFallEaseRange?.addEventListener("input", () => {
    void syncThreePearlChainShapeConfig(visualTargetLabel, emitVisual);
  });

  threeCrystalGemColorCore?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemColorCore",
        threeCrystalGemColorCore.value,
      );
      await emitVisual("waveform-three-crystal-gem-color-core", threeCrystalGemColorCore.value);
    } catch (err) {
      statusEl.textContent = `更新核心色失败：${String(err)}`;
    }
  });
  threeCrystalGemColorEdge?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemColorEdge",
        threeCrystalGemColorEdge.value,
      );
      await emitVisual("waveform-three-crystal-gem-color-edge", threeCrystalGemColorEdge.value);
    } catch (err) {
      statusEl.textContent = `更新边缘色失败：${String(err)}`;
    }
  });
  threeCrystalGemColorHighlight?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemColorHighlight",
        threeCrystalGemColorHighlight.value,
      );
      await emitVisual("waveform-three-crystal-gem-color-highlight", threeCrystalGemColorHighlight.value);
    } catch (err) {
      statusEl.textContent = `更新高光色失败：${String(err)}`;
    }
  });
  threeCrystalGemGemCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 1, 3);
    if (threeCrystalGemGemCountValue) threeCrystalGemGemCountValue.textContent = String(count);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemGemCount",
        String(count),
      );
      await emitVisual("waveform-three-crystal-gem-gem-count", count);
    } catch (err) {
      statusEl.textContent = `更新宝石数量失败：${String(err)}`;
    }
  });
  threeCrystalGemFacetSharpnessRange?.addEventListener("input", async (event) => {
    const facet = clampInt(event.target.value, 0, 100);
    if (threeCrystalGemFacetSharpnessValue) threeCrystalGemFacetSharpnessValue.textContent = String(facet);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemFacetSharpness",
        String(facet),
      );
      await emitVisual("waveform-three-crystal-gem-facet-sharpness", facet);
    } catch (err) {
      statusEl.textContent = `更新棱面锐度失败：${String(err)}`;
    }
  });
  threeCrystalGemRotationSpeedRange?.addEventListener("input", async (event) => {
    const rot = clampInt(event.target.value, 0, 30);
    if (threeCrystalGemRotationSpeedValue) threeCrystalGemRotationSpeedValue.textContent = String(rot);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemRotationSpeedDeg",
        String(rot),
      );
      await emitVisual("waveform-three-crystal-gem-rotation-speed", rot);
    } catch (err) {
      statusEl.textContent = `更新自转速度失败：${String(err)}`;
    }
  });
  threeCrystalGemChromaticToggle?.addEventListener("change", async () => {
    const enabled = threeCrystalGemChromaticToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemChromatic",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-crystal-gem-chromatic-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新色散开关失败：${String(err)}`;
    }
  });
  threeCrystalGemChromaticOffsetRange?.addEventListener("input", async (event) => {
    const offset = Math.min(0.01, Math.max(0, Number(event.target.value) / 1000));
    if (threeCrystalGemChromaticOffsetValue) {
      threeCrystalGemChromaticOffsetValue.textContent = offset.toFixed(3);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemChromaticOffset",
        String(offset),
      );
      await emitVisual("waveform-three-crystal-gem-chromatic-offset", offset);
    } catch (err) {
      statusEl.textContent = `更新色散偏移失败：${String(err)}`;
    }
  });
  threeCrystalGemBloomToggle?.addEventListener("change", async () => {
    const enabled = threeCrystalGemBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-crystal-gem-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeCrystalGemBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeCrystalGemBloomStrengthValue) {
      threeCrystalGemBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeCrystalGemBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-crystal-gem-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeCrystalGemGainRange?.addEventListener("input", () => {
    void syncThreeCrystalGemShapeConfig(visualTargetLabel, emitVisual);
  });
  threeCrystalGemSmoothRange?.addEventListener("input", () => {
    void syncThreeCrystalGemShapeConfig(visualTargetLabel, emitVisual);
  });
  threeCrystalGemSoftClipRange?.addEventListener("input", () => {
    void syncThreeCrystalGemShapeConfig(visualTargetLabel, emitVisual);
  });
  threeCrystalGemFallEaseRange?.addEventListener("input", () => {
    void syncThreeCrystalGemShapeConfig(visualTargetLabel, emitVisual);
  });

  threeGlassOrbsColor1?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsColor1",
        threeGlassOrbsColor1.value,
      );
      await emitVisual("waveform-three-glass-orbs-color1", threeGlassOrbsColor1.value);
    } catch (err) {
      statusEl.textContent = `更新球色 1 失败：${String(err)}`;
    }
  });
  threeGlassOrbsColor2?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsColor2",
        threeGlassOrbsColor2.value,
      );
      await emitVisual("waveform-three-glass-orbs-color2", threeGlassOrbsColor2.value);
    } catch (err) {
      statusEl.textContent = `更新球色 2 失败：${String(err)}`;
    }
  });
  threeGlassOrbsColor3?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsColor3",
        threeGlassOrbsColor3.value,
      );
      await emitVisual("waveform-three-glass-orbs-color3", threeGlassOrbsColor3.value);
    } catch (err) {
      statusEl.textContent = `更新球色 3 失败：${String(err)}`;
    }
  });
  threeGlassOrbsColor4?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsColor4",
        threeGlassOrbsColor4.value,
      );
      await emitVisual("waveform-three-glass-orbs-color4", threeGlassOrbsColor4.value);
    } catch (err) {
      statusEl.textContent = `更新球色 4 失败：${String(err)}`;
    }
  });
  threeGlassOrbsColor5?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsColor5",
        threeGlassOrbsColor5.value,
      );
      await emitVisual("waveform-three-glass-orbs-color5", threeGlassOrbsColor5.value);
    } catch (err) {
      statusEl.textContent = `更新球色 5 失败：${String(err)}`;
    }
  });
  threeGlassOrbsOrbCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 2, 5);
    if (threeGlassOrbsOrbCountValue) threeGlassOrbsOrbCountValue.textContent = String(count);
    syncThreeGlassOrbsColorFieldVisibility(count);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsOrbCount",
        String(count),
      );
      await emitVisual("waveform-three-glass-orbs-orb-count", count);
    } catch (err) {
      statusEl.textContent = `更新球体数量失败：${String(err)}`;
    }
  });
  threeGlassOrbsStackSpacingRange?.addEventListener("input", async (event) => {
    const spacing = Math.min(0.6, Math.max(0.2, Number(event.target.value) / 100));
    if (threeGlassOrbsStackSpacingValue) threeGlassOrbsStackSpacingValue.textContent = spacing.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsStackSpacing",
        String(spacing),
      );
      await emitVisual("waveform-three-glass-orbs-stack-spacing", spacing);
    } catch (err) {
      statusEl.textContent = `更新叠放间距失败：${String(err)}`;
    }
  });
  threeGlassOrbsTransmissionRange?.addEventListener("input", async (event) => {
    const transmission = clampInt(event.target.value, 0, 100);
    if (threeGlassOrbsTransmissionValue) threeGlassOrbsTransmissionValue.textContent = String(transmission);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsTransmission",
        String(transmission),
      );
      await emitVisual("waveform-three-glass-orbs-transmission", transmission);
    } catch (err) {
      statusEl.textContent = `更新透明感失败：${String(err)}`;
    }
  });
  threeGlassOrbsRefractionStrengthRange?.addEventListener("input", async (event) => {
    const refraction = clampInt(event.target.value, 0, 100);
    if (threeGlassOrbsRefractionStrengthValue) {
      threeGlassOrbsRefractionStrengthValue.textContent = String(refraction);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsRefractionStrength",
        String(refraction),
      );
      await emitVisual("waveform-three-glass-orbs-refraction-strength", refraction);
    } catch (err) {
      statusEl.textContent = `更新折射强度失败：${String(err)}`;
    }
  });
  threeGlassOrbsBreatheWithPeakToggle?.addEventListener("change", async () => {
    const enabled = threeGlassOrbsBreatheWithPeakToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsBreatheWithPeak",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-glass-orbs-breathe-with-peak", enabled);
    } catch (err) {
      statusEl.textContent = `更新峰值呼吸失败：${String(err)}`;
    }
  });
  threeGlassOrbsChromaticToggle?.addEventListener("change", async () => {
    const enabled = threeGlassOrbsChromaticToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsChromatic",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-glass-orbs-chromatic-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新色散开关失败：${String(err)}`;
    }
  });
  threeGlassOrbsChromaticOffsetRange?.addEventListener("input", async (event) => {
    const offset = Math.min(0.01, Math.max(0, Number(event.target.value) / 1000));
    if (threeGlassOrbsChromaticOffsetValue) {
      threeGlassOrbsChromaticOffsetValue.textContent = offset.toFixed(3);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsChromaticOffset",
        String(offset),
      );
      await emitVisual("waveform-three-glass-orbs-chromatic-offset", offset);
    } catch (err) {
      statusEl.textContent = `更新色散偏移失败：${String(err)}`;
    }
  });
  threeGlassOrbsBloomToggle?.addEventListener("change", async () => {
    const enabled = threeGlassOrbsBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-glass-orbs-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeGlassOrbsBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeGlassOrbsBloomStrengthValue) {
      threeGlassOrbsBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeGlassOrbsBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-glass-orbs-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeGlassOrbsGainRange?.addEventListener("input", () => {
    void syncThreeGlassOrbsShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGlassOrbsSmoothRange?.addEventListener("input", () => {
    void syncThreeGlassOrbsShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGlassOrbsSoftClipRange?.addEventListener("input", () => {
    void syncThreeGlassOrbsShapeConfig(visualTargetLabel, emitVisual);
  });
  threeGlassOrbsFallEaseRange?.addEventListener("input", () => {
    void syncThreeGlassOrbsShapeConfig(visualTargetLabel, emitVisual);
  });

  threeHoloPrismTintLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismTintLow",
        threeHoloPrismTintLow.value,
      );
      await emitVisual("waveform-three-holo-prism-tint-low", threeHoloPrismTintLow.value);
    } catch (err) {
      statusEl.textContent = `更新低色染色失败：${String(err)}`;
    }
  });
  threeHoloPrismTintHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismTintHigh",
        threeHoloPrismTintHigh.value,
      );
      await emitVisual("waveform-three-holo-prism-tint-high", threeHoloPrismTintHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高色染色失败：${String(err)}`;
    }
  });
  threeHoloPrismSidesRange?.addEventListener("input", async (event) => {
    const sides = clampInt(event.target.value, 4, 8);
    if (threeHoloPrismSidesValue) threeHoloPrismSidesValue.textContent = String(sides);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismSides",
        String(sides),
      );
      await emitVisual("waveform-three-holo-prism-sides", sides);
    } catch (err) {
      statusEl.textContent = `更新棱柱边数失败：${String(err)}`;
    }
  });
  threeHoloPrismRotationSpeedRange?.addEventListener("input", async (event) => {
    const rot = clampInt(event.target.value, 0, 30);
    if (threeHoloPrismRotationSpeedValue) threeHoloPrismRotationSpeedValue.textContent = String(rot);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismRotationSpeedDeg",
        String(rot),
      );
      await emitVisual("waveform-three-holo-prism-rotation-speed", rot);
    } catch (err) {
      statusEl.textContent = `更新自转速度失败：${String(err)}`;
    }
  });
  threeHoloPrismSpectralStrengthRange?.addEventListener("input", async (event) => {
    const spectral = clampInt(event.target.value, 0, 100);
    if (threeHoloPrismSpectralStrengthValue) {
      threeHoloPrismSpectralStrengthValue.textContent = String(spectral);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismSpectralStrength",
        String(spectral),
      );
      await emitVisual("waveform-three-holo-prism-spectral-strength", spectral);
    } catch (err) {
      statusEl.textContent = `更新光谱色散失败：${String(err)}`;
    }
  });
  threeHoloPrismPulseOnPeakToggle?.addEventListener("change", async () => {
    const enabled = threeHoloPrismPulseOnPeakToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismPulseOnPeak",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-holo-prism-pulse-on-peak", enabled);
    } catch (err) {
      statusEl.textContent = `更新峰值色散脉冲失败：${String(err)}`;
    }
  });
  threeHoloPrismChromaticOffsetRange?.addEventListener("input", async (event) => {
    const offset = Math.min(0.01, Math.max(0, Number(event.target.value) / 1000));
    if (threeHoloPrismChromaticOffsetValue) {
      threeHoloPrismChromaticOffsetValue.textContent = offset.toFixed(3);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismChromaticOffset",
        String(offset),
      );
      await emitVisual("waveform-three-holo-prism-chromatic-offset", offset);
    } catch (err) {
      statusEl.textContent = `更新色散偏移失败：${String(err)}`;
    }
  });
  threeHoloPrismBloomToggle?.addEventListener("change", async () => {
    const enabled = threeHoloPrismBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-holo-prism-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeHoloPrismBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeHoloPrismBloomStrengthValue) {
      threeHoloPrismBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeHoloPrismBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-holo-prism-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeHoloPrismGainRange?.addEventListener("input", () => {
    void syncThreeHoloPrismShapeConfig(visualTargetLabel, emitVisual);
  });
  threeHoloPrismSmoothRange?.addEventListener("input", () => {
    void syncThreeHoloPrismShapeConfig(visualTargetLabel, emitVisual);
  });
  threeHoloPrismSoftClipRange?.addEventListener("input", () => {
    void syncThreeHoloPrismShapeConfig(visualTargetLabel, emitVisual);
  });
  threeHoloPrismFallEaseRange?.addEventListener("input", () => {
    void syncThreeHoloPrismShapeConfig(visualTargetLabel, emitVisual);
  });

  threeNebulaVolumeColorCore?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeColorCore",
        threeNebulaVolumeColorCore.value,
      );
      await emitVisual("waveform-three-nebula-volume-color-core", threeNebulaVolumeColorCore.value);
    } catch (err) {
      statusEl.textContent = `更新核心色失败：${String(err)}`;
    }
  });
  threeNebulaVolumeColorMid?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeColorMid",
        threeNebulaVolumeColorMid.value,
      );
      await emitVisual("waveform-three-nebula-volume-color-mid", threeNebulaVolumeColorMid.value);
    } catch (err) {
      statusEl.textContent = `更新中间色失败：${String(err)}`;
    }
  });
  threeNebulaVolumeColorEdge?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeColorEdge",
        threeNebulaVolumeColorEdge.value,
      );
      await emitVisual("waveform-three-nebula-volume-color-edge", threeNebulaVolumeColorEdge.value);
    } catch (err) {
      statusEl.textContent = `更新边缘色失败：${String(err)}`;
    }
  });
  threeNebulaVolumeDensityScaleRange?.addEventListener("input", async (event) => {
    const density = Math.min(2.5, Math.max(0.4, Number(event.target.value) / 10));
    if (threeNebulaVolumeDensityScaleValue) {
      threeNebulaVolumeDensityScaleValue.textContent = density.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeDensityScale",
        String(density),
      );
      await emitVisual("waveform-three-nebula-volume-density-scale", density);
    } catch (err) {
      statusEl.textContent = `更新密度缩放失败：${String(err)}`;
    }
  });
  threeNebulaVolumeNoiseScaleRange?.addEventListener("input", async (event) => {
    const noise = Math.min(4.0, Math.max(0.6, Number(event.target.value) / 10));
    if (threeNebulaVolumeNoiseScaleValue) threeNebulaVolumeNoiseScaleValue.textContent = noise.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeNoiseScale",
        String(noise),
      );
      await emitVisual("waveform-three-nebula-volume-noise-scale", noise);
    } catch (err) {
      statusEl.textContent = `更新噪声尺度失败：${String(err)}`;
    }
  });
  threeNebulaVolumeSwirlSpeedRange?.addEventListener("input", async (event) => {
    const swirl = Math.min(2.0, Math.max(0.1, Number(event.target.value) / 10));
    if (threeNebulaVolumeSwirlSpeedValue) threeNebulaVolumeSwirlSpeedValue.textContent = swirl.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeSwirlSpeed",
        String(swirl),
      );
      await emitVisual("waveform-three-nebula-volume-swirl-speed", swirl);
    } catch (err) {
      statusEl.textContent = `更新旋涡速度失败：${String(err)}`;
    }
  });
  threeNebulaVolumeMarchStepsRange?.addEventListener("input", async (event) => {
    const steps = clampInt(event.target.value, 32, 48);
    if (threeNebulaVolumeMarchStepsValue) threeNebulaVolumeMarchStepsValue.textContent = String(steps);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeMarchSteps",
        String(steps),
      );
      await emitVisual("waveform-three-nebula-volume-march-steps", steps);
    } catch (err) {
      statusEl.textContent = `更新体积步数失败：${String(err)}`;
    }
  });
  threeNebulaVolumeBloomToggle?.addEventListener("change", async () => {
    const enabled = threeNebulaVolumeBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-nebula-volume-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeNebulaVolumeBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeNebulaVolumeBloomStrengthValue) {
      threeNebulaVolumeBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNebulaVolumeBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-nebula-volume-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeNebulaVolumeGainRange?.addEventListener("input", () => {
    void syncThreeNebulaVolumeShapeConfig(visualTargetLabel, emitVisual);
  });
  threeNebulaVolumeSmoothRange?.addEventListener("input", () => {
    void syncThreeNebulaVolumeShapeConfig(visualTargetLabel, emitVisual);
  });
  threeNebulaVolumeSoftClipRange?.addEventListener("input", () => {
    void syncThreeNebulaVolumeShapeConfig(visualTargetLabel, emitVisual);
  });
  threeNebulaVolumeFallEaseRange?.addEventListener("input", () => {
    void syncThreeNebulaVolumeShapeConfig(visualTargetLabel, emitVisual);
  });

  threeKnotOrganicColor1?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicColor1",
        threeKnotOrganicColor1.value,
      );
      await emitVisual("waveform-three-knot-organic-color1", threeKnotOrganicColor1.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 1 失败：${String(err)}`;
    }
  });
  threeKnotOrganicColor2?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicColor2",
        threeKnotOrganicColor2.value,
      );
      await emitVisual("waveform-three-knot-organic-color2", threeKnotOrganicColor2.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 2 失败：${String(err)}`;
    }
  });
  threeKnotOrganicColor3?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicColor3",
        threeKnotOrganicColor3.value,
      );
      await emitVisual("waveform-three-knot-organic-color3", threeKnotOrganicColor3.value);
    } catch (err) {
      statusEl.textContent = `更新颜色 3 失败：${String(err)}`;
    }
  });
  threeKnotOrganicKnotPRange?.addEventListener("input", async (event) => {
    const knotP = clampInt(event.target.value, 2, 4);
    if (threeKnotOrganicKnotPValue) threeKnotOrganicKnotPValue.textContent = String(knotP);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeKnotOrganicKnotP", String(knotP));
      await emitVisual("waveform-three-knot-organic-knot-p", knotP);
    } catch (err) {
      statusEl.textContent = `更新扭结 P 失败：${String(err)}`;
    }
  });
  threeKnotOrganicKnotQRange?.addEventListener("input", async (event) => {
    const knotQ = clampInt(event.target.value, 3, 7);
    if (threeKnotOrganicKnotQValue) threeKnotOrganicKnotQValue.textContent = String(knotQ);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeKnotOrganicKnotQ", String(knotQ));
      await emitVisual("waveform-three-knot-organic-knot-q", knotQ);
    } catch (err) {
      statusEl.textContent = `更新扭结 Q 失败：${String(err)}`;
    }
  });
  threeKnotOrganicTubeRadiusRange?.addEventListener("input", async (event) => {
    const tube = Math.min(0.28, Math.max(0.06, Number(event.target.value) / 100));
    if (threeKnotOrganicTubeRadiusValue) threeKnotOrganicTubeRadiusValue.textContent = tube.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicTubeRadius",
        String(tube),
      );
      await emitVisual("waveform-three-knot-organic-tube-radius", tube);
    } catch (err) {
      statusEl.textContent = `更新管径失败：${String(err)}`;
    }
  });
  threeKnotOrganicSurfaceNoiseRange?.addEventListener("input", async (event) => {
    const noise = clampInt(event.target.value, 0, 100);
    if (threeKnotOrganicSurfaceNoiseValue) threeKnotOrganicSurfaceNoiseValue.textContent = String(noise);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicSurfaceNoise",
        String(noise),
      );
      await emitVisual("waveform-three-knot-organic-surface-noise", noise);
    } catch (err) {
      statusEl.textContent = `更新表面涟漪失败：${String(err)}`;
    }
  });
  threeKnotOrganicRotationSpeedRange?.addEventListener("input", async (event) => {
    const speed = clampInt(event.target.value, 0, 30);
    if (threeKnotOrganicRotationSpeedValue) threeKnotOrganicRotationSpeedValue.textContent = String(speed);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicRotationSpeedDeg",
        String(speed),
      );
      await emitVisual("waveform-three-knot-organic-rotation-speed", speed);
    } catch (err) {
      statusEl.textContent = `更新旋转速度失败：${String(err)}`;
    }
  });
  threeKnotOrganicBloomToggle?.addEventListener("change", async () => {
    const enabled = threeKnotOrganicBloomToggle.checked;
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicBloom",
        enabled ? "1" : "0",
      );
      await emitVisual("waveform-three-knot-organic-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeKnotOrganicBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeKnotOrganicBloomStrengthValue) {
      threeKnotOrganicBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeKnotOrganicBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-knot-organic-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeKnotOrganicGainRange?.addEventListener("input", () => {
    void syncThreeKnotOrganicShapeConfig(visualTargetLabel, emitVisual);
  });
  threeKnotOrganicSmoothRange?.addEventListener("input", () => {
    void syncThreeKnotOrganicShapeConfig(visualTargetLabel, emitVisual);
  });
  threeKnotOrganicSoftClipRange?.addEventListener("input", () => {
    void syncThreeKnotOrganicShapeConfig(visualTargetLabel, emitVisual);
  });
  threeKnotOrganicFallEaseRange?.addEventListener("input", () => {
    void syncThreeKnotOrganicShapeConfig(visualTargetLabel, emitVisual);
  });

  threeAuroraColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraColorLow",
        threeAuroraColorLow.value,
      );
      await emitVisual("waveform-three-aurora-color-low", threeAuroraColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低能量色失败：${String(err)}`;
    }
  });
  threeAuroraColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraColorHigh",
        threeAuroraColorHigh.value,
      );
      await emitVisual("waveform-three-aurora-color-high", threeAuroraColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高能量色失败：${String(err)}`;
    }
  });
  threeAuroraRibbonCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 2, 6);
    if (threeAuroraRibbonCountValue) threeAuroraRibbonCountValue.textContent = String(count);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeAuroraRibbonCount", String(count));
      await emitVisual("waveform-three-aurora-ribbon-count", count);
    } catch (err) {
      statusEl.textContent = `更新飘带数量失败：${String(err)}`;
    }
  });
  threeAuroraRibbonWidthRange?.addEventListener("input", async (event) => {
    const width = Math.min(0.2, Math.max(0.02, Number(event.target.value) / 100));
    if (threeAuroraRibbonWidthValue) threeAuroraRibbonWidthValue.textContent = width.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraRibbonWidth",
        String(width),
      );
      await emitVisual("waveform-three-aurora-ribbon-width", width);
    } catch (err) {
      statusEl.textContent = `更新飘带宽度失败：${String(err)}`;
    }
  });
  threeAuroraWaveAmplitudeRange?.addEventListener("input", async (event) => {
    const amplitude = Math.min(0.8, Math.max(0.1, Number(event.target.value) / 100));
    if (threeAuroraWaveAmplitudeValue) {
      threeAuroraWaveAmplitudeValue.textContent = amplitude.toFixed(2);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraWaveAmplitude",
        String(amplitude),
      );
      await emitVisual("waveform-three-aurora-wave-amplitude", amplitude);
    } catch (err) {
      statusEl.textContent = `更新波浪幅度失败：${String(err)}`;
    }
  });
  threeAuroraWaveSpeedRange?.addEventListener("input", async (event) => {
    const waveSpeed = Math.min(3, Math.max(0.2, Number(event.target.value) / 10));
    if (threeAuroraWaveSpeedValue) threeAuroraWaveSpeedValue.textContent = waveSpeed.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraWaveSpeed",
        String(waveSpeed),
      );
      await emitVisual("waveform-three-aurora-wave-speed", waveSpeed);
    } catch (err) {
      statusEl.textContent = `更新波浪速度失败：${String(err)}`;
    }
  });
  threeAuroraBassBandIndexRange?.addEventListener("input", async (event) => {
    const bassBand = clampInt(event.target.value, 0, 7);
    if (threeAuroraBassBandIndexValue) threeAuroraBassBandIndexValue.textContent = String(bassBand);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraBassBandIndex",
        String(bassBand),
      );
      await emitVisual("waveform-three-aurora-bass-band-index", bassBand);
    } catch (err) {
      statusEl.textContent = `更新低频带偏移失败：${String(err)}`;
    }
  });
  threeAuroraAutoRotateSpeedRange?.addEventListener("input", async (event) => {
    const rotateSpeed = Math.min(15, Math.max(0, Number(event.target.value)));
    if (threeAuroraAutoRotateSpeedValue) {
      threeAuroraAutoRotateSpeedValue.textContent = String(Math.round(rotateSpeed));
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraAutoRotateSpeed",
        String(rotateSpeed),
      );
      await emitVisual("waveform-three-aurora-auto-rotate-speed", rotateSpeed);
    } catch (err) {
      statusEl.textContent = `更新自转速度失败：${String(err)}`;
    }
  });
  threeAuroraBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(window.localStorage, visualTargetLabel, "threeAuroraBloom", String(enabled));
      await emitVisual("waveform-three-aurora-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeAuroraBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeAuroraBloomStrengthValue) {
      threeAuroraBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeAuroraBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-aurora-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeAuroraGainRange?.addEventListener("input", () => {
    void syncThreeAuroraShapeConfig(visualTargetLabel, emitVisual);
  });
  threeAuroraSmoothRange?.addEventListener("input", () => {
    void syncThreeAuroraShapeConfig(visualTargetLabel, emitVisual);
  });
  threeAuroraSoftClipRange?.addEventListener("input", () => {
    void syncThreeAuroraShapeConfig(visualTargetLabel, emitVisual);
  });
  threeAuroraFallEaseRange?.addEventListener("input", () => {
    void syncThreeAuroraShapeConfig(visualTargetLabel, emitVisual);
  });

  threeBreathingRingColor?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingRingColor",
        threeBreathingRingColor.value,
      );
      await emitVisual("waveform-three-breathing-ring-color", threeBreathingRingColor.value);
    } catch (err) {
      statusEl.textContent = `更新光环颜色失败：${String(err)}`;
    }
  });
  threeBreathingRingCountRange?.addEventListener("input", async (event) => {
    const count = clampInt(event.target.value, 2, 8);
    if (threeBreathingRingCountValue) threeBreathingRingCountValue.textContent = String(count);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingRingCount",
        String(count),
      );
      await emitVisual("waveform-three-breathing-ring-count", count);
    } catch (err) {
      statusEl.textContent = `更新光环层数失败：${String(err)}`;
    }
  });
  threeBreathingBaseRadiusRange?.addEventListener("input", async (event) => {
    const baseRadius = Math.min(0.8, Math.max(0.2, Number(event.target.value) / 100));
    if (threeBreathingBaseRadiusValue) threeBreathingBaseRadiusValue.textContent = baseRadius.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingBaseRadius",
        String(baseRadius),
      );
      await emitVisual("waveform-three-breathing-base-radius", baseRadius);
    } catch (err) {
      statusEl.textContent = `更新基础半径失败：${String(err)}`;
    }
  });
  threeBreathingRadiusStepRange?.addEventListener("input", async (event) => {
    const radiusStep = Math.min(0.3, Math.max(0.05, Number(event.target.value) / 100));
    if (threeBreathingRadiusStepValue) threeBreathingRadiusStepValue.textContent = radiusStep.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingRadiusStep",
        String(radiusStep),
      );
      await emitVisual("waveform-three-breathing-radius-step", radiusStep);
    } catch (err) {
      statusEl.textContent = `更新层间距失败：${String(err)}`;
    }
  });
  threeBreathingPulseStrengthRange?.addEventListener("input", async (event) => {
    const pulseStrength = clampInt(event.target.value, 0, 100);
    if (threeBreathingPulseStrengthValue) {
      threeBreathingPulseStrengthValue.textContent = String(pulseStrength);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingPulseStrength",
        String(pulseStrength),
      );
      await emitVisual("waveform-three-breathing-pulse-strength", pulseStrength);
    } catch (err) {
      statusEl.textContent = `更新呼吸强度失败：${String(err)}`;
    }
  });
  threeBreathingTubeRadiusRange?.addEventListener("input", async (event) => {
    const tubeRadius = Math.min(0.06, Math.max(0.01, Number(event.target.value) / 100));
    if (threeBreathingTubeRadiusValue) threeBreathingTubeRadiusValue.textContent = tubeRadius.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingTubeRadius",
        String(tubeRadius),
      );
      await emitVisual("waveform-three-breathing-tube-radius", tubeRadius);
    } catch (err) {
      statusEl.textContent = `更新管径失败：${String(err)}`;
    }
  });
  threeBreathingAutoRotateSpeedRange?.addEventListener("input", async (event) => {
    const rotateSpeed = Math.min(15, Math.max(0, Number(event.target.value)));
    if (threeBreathingAutoRotateSpeedValue) {
      threeBreathingAutoRotateSpeedValue.textContent = String(Math.round(rotateSpeed));
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingAutoRotateSpeed",
        String(rotateSpeed),
      );
      await emitVisual("waveform-three-breathing-auto-rotate-speed", rotateSpeed);
    } catch (err) {
      statusEl.textContent = `更新自转速度失败：${String(err)}`;
    }
  });
  threeBreathingBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingBloom",
        String(enabled),
      );
      await emitVisual("waveform-three-breathing-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeBreathingBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeBreathingBloomStrengthValue) {
      threeBreathingBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeBreathingBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-breathing-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeBreathingGainRange?.addEventListener("input", () => {
    void syncThreeBreathingShapeConfig(visualTargetLabel, emitVisual);
  });
  threeBreathingSmoothRange?.addEventListener("input", () => {
    void syncThreeBreathingShapeConfig(visualTargetLabel, emitVisual);
  });
  threeBreathingSoftClipRange?.addEventListener("input", () => {
    void syncThreeBreathingShapeConfig(visualTargetLabel, emitVisual);
  });
  threeBreathingFallEaseRange?.addEventListener("input", () => {
    void syncThreeBreathingShapeConfig(visualTargetLabel, emitVisual);
  });

  threeNoiseColorLow?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseColorLow",
        threeNoiseColorLow.value,
      );
      await emitVisual("waveform-three-noise-color-low", threeNoiseColorLow.value);
    } catch (err) {
      statusEl.textContent = `更新低能量色失败：${String(err)}`;
    }
  });
  threeNoiseColorHigh?.addEventListener("input", async () => {
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseColorHigh",
        threeNoiseColorHigh.value,
      );
      await emitVisual("waveform-three-noise-color-high", threeNoiseColorHigh.value);
    } catch (err) {
      statusEl.textContent = `更新高能量色失败：${String(err)}`;
    }
  });
  threeNoiseGridSizeRange?.addEventListener("input", async (event) => {
    const gridSize = clampInt(event.target.value, 32, 96);
    if (threeNoiseGridSizeValue) threeNoiseGridSizeValue.textContent = String(gridSize);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseGridSize",
        String(gridSize),
      );
      await emitVisual("waveform-three-noise-grid-size", gridSize);
    } catch (err) {
      statusEl.textContent = `更新网格精度失败：${String(err)}`;
    }
  });
  threeNoiseHeightScaleRange?.addEventListener("input", async (event) => {
    const heightScale = Math.min(1.2, Math.max(0.1, Number(event.target.value) / 100));
    if (threeNoiseHeightScaleValue) threeNoiseHeightScaleValue.textContent = heightScale.toFixed(2);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseHeightScale",
        String(heightScale),
      );
      await emitVisual("waveform-three-noise-height-scale", heightScale);
    } catch (err) {
      statusEl.textContent = `更新高度缩放失败：${String(err)}`;
    }
  });
  threeNoiseNoiseScaleRange?.addEventListener("input", async (event) => {
    const noiseScale = Math.min(4, Math.max(0.5, Number(event.target.value) / 10));
    if (threeNoiseNoiseScaleValue) threeNoiseNoiseScaleValue.textContent = noiseScale.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseNoiseScale",
        String(noiseScale),
      );
      await emitVisual("waveform-three-noise-noise-scale", noiseScale);
    } catch (err) {
      statusEl.textContent = `更新噪声尺度失败：${String(err)}`;
    }
  });
  threeNoiseScrollSpeedRange?.addEventListener("input", async (event) => {
    const scrollSpeed = Math.min(2.5, Math.max(0.1, Number(event.target.value) / 10));
    if (threeNoiseScrollSpeedValue) threeNoiseScrollSpeedValue.textContent = scrollSpeed.toFixed(1);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseScrollSpeed",
        String(scrollSpeed),
      );
      await emitVisual("waveform-three-noise-scroll-speed", scrollSpeed);
    } catch (err) {
      statusEl.textContent = `更新滚动速度失败：${String(err)}`;
    }
  });
  threeNoiseCameraPitchRange?.addEventListener("input", async (event) => {
    const cameraPitchDeg = clampInt(event.target.value, 25, 75);
    if (threeNoiseCameraPitchValue) threeNoiseCameraPitchValue.textContent = String(cameraPitchDeg);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseCameraPitch",
        String(cameraPitchDeg),
      );
      await emitVisual("waveform-three-noise-camera-pitch", cameraPitchDeg);
    } catch (err) {
      statusEl.textContent = `更新相机俯角失败：${String(err)}`;
    }
  });
  threeNoiseWireframeToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseWireframe",
        String(enabled),
      );
      await emitVisual("waveform-three-noise-wireframe", enabled);
    } catch (err) {
      statusEl.textContent = `更新线框叠加失败：${String(err)}`;
    }
  });
  threeNoiseBloomToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseBloom",
        String(enabled),
      );
      await emitVisual("waveform-three-noise-bloom-enabled", enabled);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 开关失败：${String(err)}`;
    }
  });
  threeNoiseBloomStrengthRange?.addEventListener("input", async (event) => {
    const bloomStrength = Math.min(2, Math.max(0, Number(event.target.value) / 10));
    if (threeNoiseBloomStrengthValue) {
      threeNoiseBloomStrengthValue.textContent = bloomStrength.toFixed(1);
    }
    try {
      writeWindowStorageString(
        window.localStorage,
        visualTargetLabel,
        "threeNoiseBloomStrength",
        String(bloomStrength),
      );
      await emitVisual("waveform-three-noise-bloom-strength", bloomStrength);
    } catch (err) {
      statusEl.textContent = `更新 Bloom 强度失败：${String(err)}`;
    }
  });
  threeNoiseGainRange?.addEventListener("input", () => {
    void syncThreeNoiseShapeConfig(visualTargetLabel, emitVisual);
  });
  threeNoiseSmoothRange?.addEventListener("input", () => {
    void syncThreeNoiseShapeConfig(visualTargetLabel, emitVisual);
  });
  threeNoiseSoftClipRange?.addEventListener("input", () => {
    void syncThreeNoiseShapeConfig(visualTargetLabel, emitVisual);
  });
  threeNoiseFallEaseRange?.addEventListener("input", () => {
    void syncThreeNoiseShapeConfig(visualTargetLabel, emitVisual);
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
        await invoke("close_settings_window", { visualTargetLabel });
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
