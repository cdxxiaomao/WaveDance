import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createLineRenderer } from "./renderers/lineRenderer.js";
import { createBarRenderer } from "./renderers/barRenderer.js";
import { clampInt, DEFAULT_CONFIG, DISPLAY_MODES, STORAGE_KEYS, parseBoolean } from "./visualizationSchema.js";

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

const waveShapeConfig = { ...DEFAULT_CONFIG.line.shape };
const barShapeConfig = { ...DEFAULT_CONFIG.bar.shape };

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

function loadShapeConfigsFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.lineShape);
    if (raw) applyWaveShapeConfig(JSON.parse(raw));
    const barRaw = window.localStorage.getItem(STORAGE_KEYS.barShape);
    if (barRaw) applyBarShapeConfig(JSON.parse(barRaw));
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

const WAVEFORM_WIDTH_MIN = 1;
const WAVEFORM_WIDTH_MAX = 12;
let waveformLineWidthPx = 2;
let barWidthPercent = DEFAULT_CONFIG.bar.widthPercent;
let barGapPercent = DEFAULT_CONFIG.bar.gapPercent;
let barHeadroomPercent = DEFAULT_CONFIG.bar.headroomPercent;
let barMirrorEnabled = DEFAULT_CONFIG.bar.mirrorEnabled;
let barPeakHoldEnabled = DEFAULT_CONFIG.bar.peakHoldEnabled;
let barPeakFallSpeed = DEFAULT_CONFIG.bar.peakFallSpeed;
let barPeakThickness = DEFAULT_CONFIG.bar.peakThickness;

function applyBarColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.bar.color;
  const { r, g, b } = hexToRgb(safe);
  barFillRgb.r = r / 255;
  barFillRgb.g = g / 255;
  barFillRgb.b = b / 255;
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

function applyBarMirrorEnabled(value) {
  barMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.bar.mirrorEnabled);
}

function applyBarPeakHoldEnabled(value) {
  barPeakHoldEnabled = parseBoolean(value, DEFAULT_CONFIG.bar.peakHoldEnabled);
}

function applyBarPeakFallSpeed(value) {
  barPeakFallSpeed = clampInt(value, 5, 120);
}

function applyBarPeakThickness(value) {
  barPeakThickness = clampInt(value, 1, 8);
}

function applyMainBackgroundStyle(payload) {
  const { color = "#000000", alpha = 0.35 } = payload ?? {};
  const { r, g, b } = hexToRgb(color);
  const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.35;
  document.body.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(3)})`;
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

function renderWaveform() {
  resizeCanvas();
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (displayMode === "bar") {
    barRenderer.render(latestPoints, barShapeConfig, {
      color: barFillRgb,
      widthPercent: barWidthPercent,
      gapPercent: barGapPercent,
      headroomPercent: barHeadroomPercent,
      mirrorEnabled: barMirrorEnabled,
      peakHoldEnabled: barPeakHoldEnabled,
      peakFallSpeed: barPeakFallSpeed,
      peakThickness: barPeakThickness,
    });
  } else {
    lineRenderer.render(latestPoints, waveShapeConfig, {
      color: waveformLineRgb,
      lineWidthPx: waveformLineWidthPx,
    });
  }

  requestAnimationFrame(renderWaveform);
}

async function init() {
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

  document.body.addEventListener("mousedown", triggerNativeDrag);

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
  resizeHandles.forEach((handle) => {
    handle.addEventListener("mousedown", triggerNativeResize);
  });

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

  await listen("main-bg-style", (event) => {
    applyMainBackgroundStyle(event.payload);
  });

  await listen("waveform-line-color", (event) => {
    const raw = event.payload;
    const color = typeof raw === "string" ? raw : "";
    applyWaveformColorHex(color);
  });
  await listen("waveform-bar-color", (event) => {
    const raw = event.payload;
    const color = typeof raw === "string" ? raw : "";
    applyBarColorHex(color);
  });

  await listen("waveform-line-width", (event) => {
    applyWaveformLineWidthPx(event.payload);
  });
  await listen("waveform-bar-width", (event) => {
    applyBarWidthPercent(event.payload);
  });
  await listen("waveform-bar-gap", (event) => {
    applyBarGapPercent(event.payload);
  });
  await listen("waveform-bar-headroom", (event) => {
    applyBarHeadroomPercent(event.payload);
  });
  await listen("waveform-bar-mirror", (event) => {
    applyBarMirrorEnabled(event.payload);
  });
  await listen("waveform-bar-peak-hold", (event) => {
    applyBarPeakHoldEnabled(event.payload);
  });
  await listen("waveform-bar-peak-fall-speed", (event) => {
    applyBarPeakFallSpeed(event.payload);
  });
  await listen("waveform-bar-peak-thickness", (event) => {
    applyBarPeakThickness(event.payload);
  });

  await listen("waveform-shape-config", (event) => {
    applyWaveShapeConfig(event.payload);
  });
  await listen("waveform-bar-shape-config", (event) => {
    applyBarShapeConfig(event.payload);
  });
  await listen("visualization-display-mode", (event) => {
    const mode = String(event.payload ?? "");
    displayMode = mode === DISPLAY_MODES.bar ? DISPLAY_MODES.bar : DISPLAY_MODES.line;
  });

  const applyMousePassthroughLockUi = (locked) => {
    const on = Boolean(locked);
    document.body.classList.toggle("mouse-passthrough-locked", on);
    if (!mousePassthroughLockBtn) return;
    mousePassthroughLockBtn.setAttribute("aria-pressed", on ? "true" : "false");
    mousePassthroughLockBtn.classList.toggle("is-locked", on);
    mousePassthroughLockBtn.title = on
      ? "已穿透：点击关闭穿透，或按 ⌘⇧⌥L"
      : "开启后主窗口鼠标穿透到下层；也可用 ⌘⇧⌥L";
    const lockImg = mousePassthroughLockBtn.querySelector("img[data-lock-icon]");
    if (lockImg) {
      lockImg.src = on ? "/icons/passthrough-active.svg" : "/icons/passthrough-idle.svg";
    }
  };

  await listen("mouse-passthrough-changed", (event) => {
    applyMousePassthroughLockUi(event.payload);
  });

  try {
    const saved = await invoke("get_waveform_color");
    applyWaveformColorHex(saved);
  } catch {
    applyWaveformColorHex(DEFAULT_WAVEFORM_HEX);
  }

  try {
    const savedMode = window.localStorage.getItem(STORAGE_KEYS.displayMode);
    if (savedMode === DISPLAY_MODES.bar || savedMode === DISPLAY_MODES.line) {
      displayMode = savedMode;
    }
    const savedBarColor = window.localStorage.getItem(STORAGE_KEYS.barColor);
    if (savedBarColor) {
      applyBarColorHex(savedBarColor);
    }
    const savedBarWidth = window.localStorage.getItem(STORAGE_KEYS.barWidth);
    if (savedBarWidth) {
      applyBarWidthPercent(savedBarWidth);
    }
    const savedBarGap = window.localStorage.getItem(STORAGE_KEYS.barGap);
    if (savedBarGap) {
      applyBarGapPercent(savedBarGap);
    }
    const savedBarHeadroom = window.localStorage.getItem(STORAGE_KEYS.barHeadroom);
    if (savedBarHeadroom) {
      applyBarHeadroomPercent(savedBarHeadroom);
    }
    applyBarMirrorEnabled(window.localStorage.getItem(STORAGE_KEYS.barMirror));
    applyBarPeakHoldEnabled(window.localStorage.getItem(STORAGE_KEYS.barPeakHold));
    applyBarPeakFallSpeed(window.localStorage.getItem(STORAGE_KEYS.barPeakFallSpeed));
    applyBarPeakThickness(window.localStorage.getItem(STORAGE_KEYS.barPeakThickness));
  } catch {
    // ignore storage failures
  }

  try {
    const w = await invoke("get_waveform_line_width");
    applyWaveformLineWidthPx(w);
  } catch {
    applyWaveformLineWidthPx(2);
  }

  loadShapeConfigsFromStorage();

  try {
    const locked = await invoke("get_main_mouse_passthrough_locked");
    applyMousePassthroughLockUi(locked);
  } catch {
    applyMousePassthroughLockUi(false);
  }

  if (mousePassthroughLockBtn) {
    mousePassthroughLockBtn.addEventListener("click", async () => {
      try {
        const cur = await invoke("get_main_mouse_passthrough_locked");
        const next = !cur;
        await invoke("set_main_mouse_passthrough_locked", { locked: next });
        applyMousePassthroughLockUi(next);
      } catch (err) {
        console.error("mouse passthrough toggle failed:", err);
      }
    });
  }

  openSettingsBtn.addEventListener("click", async () => {
    try {
      await invoke("open_settings_window");
    } catch (err) {
      console.error("open_settings_window failed:", err);
    }
  });
  try {
    await invoke("start_waveform_stream");
  } catch (err) {
    console.error("start_waveform_stream failed:", err);
  }
  applyMainBackgroundStyle({ color: "#000000", alpha: 0.35 });
  renderWaveform();
}

init().catch((error) => {
  console.error("main init failed:", error);
});
