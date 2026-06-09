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
  parseBoolean,
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
