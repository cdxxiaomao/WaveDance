import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const statusEl = document.querySelector("#status");
const canvas = document.querySelector("#waveCanvas");
const startBtn = document.querySelector("#startBtn");
const stopBtn = document.querySelector("#stopBtn");

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
const WAVEFORM_GAIN = 50;

let latestPoints = [];

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
  gl.clearColor(0.03, 0.05, 0.12, 1.0);
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

await listen("waveform-frame", (event) => {
  const payload = event.payload;
  if (Array.isArray(payload.points)) {
    latestPoints = payload.points;
    statusEl.textContent = `实时采集中 · peak=${payload.peak.toFixed(3)} · rms=${payload.rms.toFixed(3)}`;
  }
});

await listen("waveform-error", (event) => {
  statusEl.textContent = `错误：${event.payload}`;
});

await listen("waveform-status", (event) => {
  statusEl.textContent = event.payload;
});

startBtn.addEventListener("click", async () => {
  await invoke("start_waveform_stream");
});

stopBtn.addEventListener("click", async () => {
  await invoke("stop_waveform_stream");
});

renderWaveform();
