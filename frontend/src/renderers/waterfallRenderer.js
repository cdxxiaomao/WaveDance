import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function createWaterfallRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform sampler2D u_historyTex;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
uniform float u_historyRows;
uniform float u_rowGap;
varying vec2 v_texCoord;

void main() {
  float rowF = v_texCoord.y * u_historyRows;
  float rowFrac = fract(rowF);
  if (u_rowGap > 0.001 && rowFrac < u_rowGap) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }
  float amp = texture2D(u_historyTex, v_texCoord).r;
  vec3 color = mix(u_colorLow, u_colorHigh, amp);
  gl_FragColor = vec4(color, 1.0);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");
  const historyTexLoc = gl.getUniformLocation(program, "u_historyTex");
  const colorLowLoc = gl.getUniformLocation(program, "u_colorLow");
  const colorHighLoc = gl.getUniformLocation(program, "u_colorHigh");
  const historyRowsLoc = gl.getUniformLocation(program, "u_historyRows");
  const rowGapLoc = gl.getUniformLocation(program, "u_rowGap");

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]),
    gl.STATIC_DRAW,
  );

  const texture = gl.createTexture();
  let history = null;
  let uploadBuffer = null;
  let bucketCount = 0;
  let configuredRows = 64;
  let writeRow = 0;
  let frameCounter = 0;
  let scrollEveryNFrames = 1;
  let easedBars = [];
  let texWidth = 0;
  let texHeight = 0;

  function resetHistory(rows, buckets) {
    configuredRows = rows;
    bucketCount = buckets;
    history = new Float32Array(rows * buckets);
    history.fill(0);
    uploadBuffer = new Uint8Array(rows * buckets);
    writeRow = 0;
    frameCounter = 0;
    texWidth = buckets;
    texHeight = rows;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      texWidth,
      texHeight,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      uploadBuffer,
    );
  }

  function uploadHistoryTexture() {
    const rows = configuredRows;
    const buckets = bucketCount;
    for (let age = 0; age < rows; age++) {
      const ringRow = (writeRow - 1 - age + rows * 16) % rows;
      const srcOffset = ringRow * buckets;
      const dstRow = rows - 1 - age;
      const dstOffset = dstRow * buckets;
      for (let b = 0; b < buckets; b++) {
        const amp = history[srcOffset + b];
        uploadBuffer[dstOffset + b] = Math.min(255, Math.max(0, Math.round(amp * 255)));
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      texWidth,
      texHeight,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      uploadBuffer,
    );
  }

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const len = points.length;
    const historyRows = clampInt(styleConfig.historyRows, 16, 128);
    scrollEveryNFrames = clampInt(styleConfig.scrollEveryNFrames, 1, 8);

    if (!history || bucketCount !== len || configuredRows !== historyRows) {
      resetHistory(historyRows, len);
    }

    const normalized = processSpectrumPoints(points, shapeConfig, easedBars);
    const freqReversed = Boolean(styleConfig.freqReversed);
    const rowOffset = writeRow * len;

    for (let b = 0; b < len; b++) {
      const srcIndex = freqReversed ? len - 1 - b : b;
      history[rowOffset + b] = normalized[srcIndex];
    }

    frameCounter++;
    if (frameCounter >= scrollEveryNFrames) {
      frameCounter = 0;
      writeRow = (writeRow + 1) % configuredRows;
    }

    uploadHistoryTexture();

    const rowGapPercent = Math.max(0, Math.min(50, Number(styleConfig.rowGapPercent) || 0));
    const colorLow = styleConfig.colorLow;
    const colorHigh = styleConfig.colorHigh;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(historyTexLoc, 0);
    gl.uniform3f(colorLowLoc, colorLow.r, colorLow.g, colorLow.b);
    gl.uniform3f(colorHighLoc, colorHigh.r, colorHigh.g, colorHigh.b);
    gl.uniform1f(historyRowsLoc, configuredRows);
    gl.uniform1f(rowGapLoc, rowGapPercent / 100);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { render };
}
