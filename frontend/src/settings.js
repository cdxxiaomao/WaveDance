import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

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
const bodyBgColor = document.querySelector("#bodyBgColor");
const bodyBgAlpha = document.querySelector("#bodyBgAlpha");
const bodyBgAlphaValue = document.querySelector("#bodyBgAlphaValue");
const blurToggle = document.querySelector("#blurToggle");
const blackholeHint = document.querySelector("#blackholeHint");
const blackholeInstallBtn = document.querySelector("#blackholeInstallBtn");
const blackholeRefreshBtn = document.querySelector("#blackholeRefreshBtn");
const quitAppBtn = document.querySelector("#quitAppBtn");
const WAVE_SHAPE_KEY = "wavedance.waveShapeConfig";

function clampInt(n, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function readWaveShapeConfig() {
  try {
    const raw = window.localStorage.getItem(WAVE_SHAPE_KEY);
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
    window.localStorage.setItem(WAVE_SHAPE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures in restricted contexts
  }
  try {
    await emit("waveform-shape-config", config);
  } catch (err) {
    statusEl.textContent = `同步波形形态参数失败：${String(err)}`;
  }
}

async function refreshBlackholeStatus() {
  if (!blackholeHint || !blackholeInstallBtn) {
    return;
  }
  try {
    const s = await invoke("get_loopback_device_status");
    blackholeHint.textContent = typeof s.hint === "string" ? s.hint : "";
    const installed = Boolean(s.blackhole_installed);
    blackholeInstallBtn.hidden = installed;
    blackholeInstallBtn.disabled = installed;
  } catch (err) {
    blackholeHint.textContent = `无法读取设备状态：${String(err)}`;
  }
}

function setCaptureTransportRunning(running) {
  startBtn.hidden = Boolean(running);
  stopBtn.hidden = !running;
  startBtn.classList.toggle("settings-btn--primary", !running);
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
    if (
      !confirm(
        "将打开 BlackHole 安装程序（若已随应用打包），否则打开官方下载页。安装时可能需要输入管理员密码，并在「系统设置」中允许相关音频组件。是否继续？",
      )
    ) {
      return;
    }
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
    gainPercent: 50,
    smoothPercent: 28,
    softClipPercent: 22,
    fallEasePercent: 68,
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
}

init().catch((error) => {
  statusEl.textContent = `初始化失败：${String(error)}`;
});
