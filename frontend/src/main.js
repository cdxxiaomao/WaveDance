import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const canvas = document.querySelector("#waveCanvas");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const resizeHandles = Array.from(document.querySelectorAll("[data-resize-dir]"));

const gl = canvas.getContext("webgl");
if (!gl) {
  throw new Error("当前环境不支持 WebGL");
}

const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_lineColor;
void main() {
  gl_FragColor = vec4(u_lineColor, 1.0);
}
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram() {
  const vShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

const program = createProgram();
const positionLoc = gl.getAttribLocation(program, "a_position");
const lineColorLoc = gl.getUniformLocation(program, "u_lineColor");
const buffer = gl.createBuffer();

const WAVE_SHAPE_KEY = "wavedance.waveShapeConfig";
const waveShapeConfig = {
  gainPercent: 50,
  smoothPercent: 28,
  softClipPercent: 22,
  fallEasePercent: 68,
};

let latestPoints = [];
let easedPoints = [];

function clampInt(n, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function applyWaveShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  waveShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  waveShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  waveShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  waveShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function loadWaveShapeConfigFromStorage() {
  try {
    const raw = window.localStorage.getItem(WAVE_SHAPE_KEY);
    if (!raw) return;
    applyWaveShapeConfig(JSON.parse(raw));
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

const DEFAULT_WAVEFORM_HEX = "#c4a574";

const waveformLineRgb = { r: 0, g: 0, b: 0 };

function applyWaveformColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_WAVEFORM_HEX;
  const { r, g, b } = hexToRgb(safe);
  waveformLineRgb.r = r / 255;
  waveformLineRgb.g = g / 255;
  waveformLineRgb.b = b / 255;
}

applyWaveformColorHex(DEFAULT_WAVEFORM_HEX);

const WAVEFORM_WIDTH_MIN = 1;
const WAVEFORM_WIDTH_MAX = 12;
let waveformLineWidthPx = 2;

function applyWaveformLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  waveformLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
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

  if (latestPoints.length > 1) {
    const len = latestPoints.length;
    const ys = new Float32Array(len);
    if (easedPoints.length !== len) {
      easedPoints = new Array(len).fill(0);
    }
    const gain = waveShapeConfig.gainPercent / 100;
    const softGamma = 1 + (waveShapeConfig.softClipPercent / 100) * 1.6;
    const fallBlend = 0.08 + (1 - waveShapeConfig.fallEasePercent / 100) * 0.62;
    for (let i = 0; i < len; i++) {
      const raw = Math.max(0, Math.min(1, latestPoints[i] * gain));
      const prev = easedPoints[i];
      const followed = raw >= prev ? raw : prev + (raw - prev) * fallBlend;
      easedPoints[i] = followed;
      // 用 gamma 压缩峰值，避免波峰/波谷过尖。
      const softened = Math.pow(followed, softGamma);
      ys[i] = (softened * 2 - 1) * 0.95;
    }

    const smoothNorm = waveShapeConfig.smoothPercent / 400;
    const smoothPasses = Math.round(smoothNorm * smoothNorm * 24);
    if (smoothPasses > 0 && len > 2) {
      const temp = new Float32Array(len);
      for (let pass = 0; pass < smoothPasses; pass++) {
        temp[0] = ys[0];
        temp[len - 1] = ys[len - 1];
        const useWideKernel = waveShapeConfig.smoothPercent > 260;
        for (let i = 1; i < len - 1; i++) {
          if (useWideKernel && i > 1 && i < len - 2) {
            temp[i] = (ys[i - 2] + ys[i - 1] * 2 + ys[i] * 4 + ys[i + 1] * 2 + ys[i + 2]) * 0.1;
          } else {
            temp[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) * 0.25;
          }
        }
        ys.set(temp);
      }
    }

    const canvasH = gl.canvas.height;
    const stepNdc = canvasH > 0 ? 2 / canvasH : 0;
    const passes = waveformLineWidthPx;
    const half = (passes - 1) / 2;

    const vertices = new Float32Array(len * 2);
    gl.useProgram(program);
    gl.uniform3f(lineColorLoc, waveformLineRgb.r, waveformLineRgb.g, waveformLineRgb.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.lineWidth(1);

    for (let p = 0; p < passes; p++) {
      const yOff = (p - half) * stepNdc;
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * 2 - 1;
        vertices[i * 2] = x;
        vertices[i * 2 + 1] = ys[i] + yOff;
      }
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINE_STRIP, 0, len);
    }
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

  await listen("waveform-line-width", (event) => {
    applyWaveformLineWidthPx(event.payload);
  });

  await listen("waveform-shape-config", (event) => {
    applyWaveShapeConfig(event.payload);
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
    const w = await invoke("get_waveform_line_width");
    applyWaveformLineWidthPx(w);
  } catch {
    applyWaveformLineWidthPx(2);
  }

  loadWaveShapeConfigFromStorage();

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
