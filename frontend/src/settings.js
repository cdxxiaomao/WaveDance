import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  clampInt,
  DEFAULT_CONFIG,
  DISPLAY_MODES,
  PANEL_STYLES,
  STORAGE_KEYS,
  parseBoolean,
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
const displayModeSelect = document.querySelector("#displayMode");
const panelStyleModeSelect = document.querySelector("#panelStyleMode");
const lineConfigPanel = document.querySelector("#lineConfigPanel");
const barConfigPanel = document.querySelector("#barConfigPanel");
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
const barMirrorToggle = document.querySelector("#barMirrorToggle");
const barPeakHoldToggle = document.querySelector("#barPeakHoldToggle");
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
const quitAppBtn = document.querySelector("#quitAppBtn");
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

function readWaveShapeConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.lineShape);
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

async function syncWaveShapeConfig() {
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
    window.localStorage.setItem(STORAGE_KEYS.lineShape, JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emit("waveform-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步波形形态参数失败：${String(err)}`;
  }
}

function readBarShapeConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.barShape);
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

async function syncBarShapeConfig() {
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
    window.localStorage.setItem(STORAGE_KEYS.barShape, JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emit("waveform-bar-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步柱状图参数失败：${String(err)}`;
  }
}

function applyDisplayModePanels(mode) {
  const isBar = mode === "bar";
  displayMode = isBar ? DISPLAY_MODES.bar : DISPLAY_MODES.line;
  if (displayModeSelect) {
    displayModeSelect.value = displayMode;
  }
  if (lineConfigPanel) {
    lineConfigPanel.hidden = isBar;
  }
  if (barConfigPanel) {
    barConfigPanel.hidden = !isBar;
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

async function syncMainBackgroundStyle() {
  const color = bodyBgColor.value;
  const alpha = Number(bodyBgAlpha.value) / 100;
  bodyBgAlphaValue.textContent = String(bodyBgAlpha.value);
  try {
    await emit("main-bg-style", { color, alpha });
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
      await invoke("set_waveform_color", { color });
    } catch (err) {
      statusEl.textContent = `更新波形颜色失败：${String(err)}`;
    }
  });

  waveformWidthRange.addEventListener("input", async (event) => {
    const widthPx = Number(event.target.value);
    waveformWidthValue.textContent = String(widthPx);
    try {
      await invoke("set_waveform_line_width", { widthPx });
    } catch (err) {
      statusEl.textContent = `更新波形粗细失败：${String(err)}`;
    }
  });

  waveformGainRange.addEventListener("input", () => {
    void syncWaveShapeConfig();
  });
  waveformSmoothRange.addEventListener("input", () => {
    void syncWaveShapeConfig();
  });
  waveformSoftClipRange.addEventListener("input", () => {
    void syncWaveShapeConfig();
  });
  waveformFallEaseRange.addEventListener("input", () => {
    void syncWaveShapeConfig();
  });
  barColor?.addEventListener("input", async () => {
    try {
      await emit("waveform-bar-color", barColor.value);
      window.localStorage.setItem(STORAGE_KEYS.barColor, barColor.value);
    } catch (err) {
      statusEl.textContent = `更新柱状图颜色失败：${String(err)}`;
    }
  });
  barWidthRange?.addEventListener("input", async (event) => {
    const widthPercent = clampInt(event.target.value, 20, 100);
    barWidthValue.textContent = String(widthPercent);
    try {
      await emit("waveform-bar-width", widthPercent);
      window.localStorage.setItem(STORAGE_KEYS.barWidth, String(widthPercent));
    } catch (err) {
      statusEl.textContent = `更新柱体宽度失败：${String(err)}`;
    }
  });
  barGapRange?.addEventListener("input", async (event) => {
    const gapPercent = clampInt(event.target.value, 0, 70);
    barGapValue.textContent = String(gapPercent);
    try {
      await emit("waveform-bar-gap", gapPercent);
      window.localStorage.setItem(STORAGE_KEYS.barGap, String(gapPercent));
    } catch (err) {
      statusEl.textContent = `更新柱间距失败：${String(err)}`;
    }
  });
  barHeadroomRange?.addEventListener("input", async (event) => {
    const headroomPercent = clampInt(event.target.value, 0, 40);
    barHeadroomValue.textContent = String(headroomPercent);
    try {
      await emit("waveform-bar-headroom", headroomPercent);
      window.localStorage.setItem(STORAGE_KEYS.barHeadroom, String(headroomPercent));
    } catch (err) {
      statusEl.textContent = `更新顶部留白失败：${String(err)}`;
    }
  });
  barMirrorToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      await emit("waveform-bar-mirror", enabled);
      window.localStorage.setItem(STORAGE_KEYS.barMirror, String(enabled));
    } catch (err) {
      statusEl.textContent = `更新镜像模式失败：${String(err)}`;
    }
  });
  barPeakHoldToggle?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      await emit("waveform-bar-peak-hold", enabled);
      window.localStorage.setItem(STORAGE_KEYS.barPeakHold, String(enabled));
    } catch (err) {
      statusEl.textContent = `更新峰值保持线开关失败：${String(err)}`;
    }
  });
  barPeakFallSpeedRange?.addEventListener("input", async (event) => {
    const speed = clampInt(event.target.value, 5, 120);
    barPeakFallSpeedValue.textContent = String(speed);
    try {
      await emit("waveform-bar-peak-fall-speed", speed);
      window.localStorage.setItem(STORAGE_KEYS.barPeakFallSpeed, String(speed));
    } catch (err) {
      statusEl.textContent = `更新峰值线回落速度失败：${String(err)}`;
    }
  });
  barPeakThicknessRange?.addEventListener("input", async (event) => {
    const thickness = clampInt(event.target.value, 1, 8);
    barPeakThicknessValue.textContent = String(thickness);
    try {
      await emit("waveform-bar-peak-thickness", thickness);
      window.localStorage.setItem(STORAGE_KEYS.barPeakThickness, String(thickness));
    } catch (err) {
      statusEl.textContent = `更新峰值线粗细失败：${String(err)}`;
    }
  });
  barGainRange?.addEventListener("input", () => {
    void syncBarShapeConfig();
  });
  barSmoothRange?.addEventListener("input", () => {
    void syncBarShapeConfig();
  });
  barSoftClipRange?.addEventListener("input", () => {
    void syncBarShapeConfig();
  });
  barFallEaseRange?.addEventListener("input", () => {
    void syncBarShapeConfig();
  });
  displayModeSelect?.addEventListener("change", async (event) => {
    const mode = String(event.target.value || "line");
    applyDisplayModePanels(mode);
    try {
      window.localStorage.setItem(STORAGE_KEYS.displayMode, displayMode);
      await emit("visualization-display-mode", displayMode);
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
    void syncMainBackgroundStyle();
  });
  bodyBgAlpha.addEventListener("input", () => {
    void syncMainBackgroundStyle();
  });

  blurToggle.addEventListener("change", async (event) => {
    const enabled = event.target.checked;
    try {
      await invoke("set_overlay_blur_enabled", { enabled });
      statusEl.textContent = enabled ? "毛玻璃已开启" : "毛玻璃已关闭";
    } catch (err) {
      statusEl.textContent = `更新毛玻璃开关失败：${String(err)}`;
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

  try {
    const [
      currentBucket,
      currentMode,
      currentTilt,
      frequencyRange,
      overlayPinned,
      blurEnabled,
      streamRunning,
      sourceMode,
      waveformHex,
      waveformWidthPx,
    ] = await Promise.all([
      invoke("get_bucket_count"),
      invoke("get_bucket_mode"),
      invoke("get_high_tilt_percent"),
      invoke("get_frequency_range"),
      invoke("get_overlay_pinned"),
      invoke("get_overlay_blur_enabled"),
      invoke("get_waveform_stream_running"),
      invoke("get_capture_source_mode"),
      invoke("get_waveform_color"),
      invoke("get_waveform_line_width"),
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
    blurToggle.checked = Boolean(blurEnabled);
    setCaptureTransportRunning(Boolean(streamRunning));
    if (sourceMode === "microphone" || sourceMode === "blackhole") {
      captureSourceMode = sourceMode;
    }
    if (captureSourceModeSelect) {
      captureSourceModeSelect.value = captureSourceMode;
    }
    refreshMidiSetupVisibility();
    if (typeof waveformHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(waveformHex)) {
      waveformColor.value = waveformHex.toLowerCase();
    }
    const w = Number(waveformWidthPx);
    if (Number.isFinite(w) && w >= 1 && w <= 12) {
      waveformWidthRange.value = String(Math.round(w));
      waveformWidthValue.textContent = String(Math.round(w));
    }
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

  const savedWaveShape = readWaveShapeConfig() ?? {
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
  await syncWaveShapeConfig();
  const savedBarShape = readBarShapeConfig() ?? {
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
  await syncBarShapeConfig();
  try {
    const savedMode = window.localStorage.getItem(STORAGE_KEYS.displayMode);
    applyDisplayModePanels(savedMode === DISPLAY_MODES.bar ? DISPLAY_MODES.bar : DISPLAY_MODES.line);
    const savedPanelStyle = window.localStorage.getItem(STORAGE_KEYS.panelStyleMode);
    applyPanelStyleMode(savedPanelStyle === PANEL_STYLES.minimal ? PANEL_STYLES.minimal : PANEL_STYLES.pro);
    const savedBarColor = window.localStorage.getItem(STORAGE_KEYS.barColor);
    if (savedBarColor && /^#[0-9A-Fa-f]{6}$/.test(savedBarColor)) {
      barColor.value = savedBarColor.toLowerCase();
    }
    const savedBarWidthPercent = window.localStorage.getItem(STORAGE_KEYS.barWidth);
    if (savedBarWidthPercent) {
      const widthPercent = clampInt(savedBarWidthPercent, 20, 100);
      barWidthRange.value = String(widthPercent);
      barWidthValue.textContent = String(widthPercent);
    }
    const savedBarGap = window.localStorage.getItem(STORAGE_KEYS.barGap);
    if (savedBarGap) {
      const gapPercent = clampInt(savedBarGap, 0, 70);
      barGapRange.value = String(gapPercent);
      barGapValue.textContent = String(gapPercent);
    }
    const savedBarHeadroom = window.localStorage.getItem(STORAGE_KEYS.barHeadroom);
    if (savedBarHeadroom) {
      const headroomPercent = clampInt(savedBarHeadroom, 0, 40);
      barHeadroomRange.value = String(headroomPercent);
      barHeadroomValue.textContent = String(headroomPercent);
    }
    const savedBarMirror = window.localStorage.getItem(STORAGE_KEYS.barMirror);
    barMirrorToggle.checked = parseBoolean(savedBarMirror, DEFAULT_CONFIG.bar.mirrorEnabled);
    const savedBarPeakHold = window.localStorage.getItem(STORAGE_KEYS.barPeakHold);
    barPeakHoldToggle.checked = parseBoolean(savedBarPeakHold, DEFAULT_CONFIG.bar.peakHoldEnabled);
    const savedPeakFallSpeed = window.localStorage.getItem(STORAGE_KEYS.barPeakFallSpeed);
    if (savedPeakFallSpeed) {
      const speed = clampInt(savedPeakFallSpeed, 5, 120);
      barPeakFallSpeedRange.value = String(speed);
      barPeakFallSpeedValue.textContent = String(speed);
    }
    const savedPeakThickness = window.localStorage.getItem(STORAGE_KEYS.barPeakThickness);
    if (savedPeakThickness) {
      const thickness = clampInt(savedPeakThickness, 1, 8);
      barPeakThicknessRange.value = String(thickness);
      barPeakThicknessValue.textContent = String(thickness);
    }
  } catch {
    applyDisplayModePanels(DISPLAY_MODES.line);
    applyPanelStyleMode(PANEL_STYLES.pro);
  }
  await emit("visualization-display-mode", displayMode);
  await emit("waveform-bar-color", barColor.value);
  await emit("waveform-bar-width", clampInt(barWidthRange.value, 20, 100));
  await emit("waveform-bar-gap", clampInt(barGapRange.value, 0, 70));
  await emit("waveform-bar-headroom", clampInt(barHeadroomRange.value, 0, 40));
  await emit("waveform-bar-mirror", Boolean(barMirrorToggle.checked));
  await emit("waveform-bar-peak-hold", Boolean(barPeakHoldToggle.checked));
  await emit("waveform-bar-peak-fall-speed", clampInt(barPeakFallSpeedRange.value, 5, 120));
  await emit("waveform-bar-peak-thickness", clampInt(barPeakThicknessRange.value, 1, 8));

  if (quitAppBtn) {
    quitAppBtn.addEventListener("click", async () => {
      try {
        await invoke("quit_app");
      } catch (err) {
        statusEl.textContent = `退出失败：${String(err)}`;
      }
    });
  }

  await syncMainBackgroundStyle();
  await refreshBlackholeStatus();
  window.setInterval(refreshMidiSetupVisibility, 1000);
}

init().catch((error) => {
  statusEl.textContent = `初始化失败：${String(error)}`;
});
