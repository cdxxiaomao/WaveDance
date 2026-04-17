import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const canvas = document.querySelector("#waveCanvas");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
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
void main() {
  gl_FragColor = vec4(0.28, 0.84, 1.0, 1.0);
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
const buffer = gl.createBuffer();

// 手动调节波形显示增益：越大越“高”
const WAVEFORM_GAIN = 0.5;

let latestPoints = [];

function hexToRgb(hex) {
  const safeHex = typeof hex === "string" ? hex.replace("#", "") : "";
  if (safeHex.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
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
    const vertices = new Float32Array(latestPoints.length * 2);
    const len = latestPoints.length;
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * 2 - 1;
      const amplified = Math.min(1, latestPoints[i] * WAVEFORM_GAIN);
      const y = (amplified * 2 - 1) * 0.95;
      vertices[i * 2] = x;
      vertices[i * 2 + 1] = y;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.lineWidth(2);
    gl.drawArrays(gl.LINE_STRIP, 0, len);
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
    const direction = event.currentTarget.dataset.resizeDir;
    if (!direction) return;
    let lastX = event.screenX;
    let lastY = event.screenY;

    const onMouseMove = async (moveEvent) => {
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
