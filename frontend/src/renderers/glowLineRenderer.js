import { createProgram } from "./shaderUtils.js";
import { minNdcForPixels } from "./common.js";
import { processSpectrumPoints } from "./shapePipeline.js";

const LINE_BASELINE_Y = -0.95;
const EDGE_TAPER_FRACTION = 0.08;
const HORIZONTAL_PAD_EXTRA_PX = 6;
const CAP_SEGMENTS = 16;

/** 首尾振幅渐收至基线，避免端点突兀 */
function applyEndpointTaper(ys, len) {
  const taperSlots = Math.max(2, Math.round(len * EDGE_TAPER_FRACTION));
  for (let i = 0; i < taperSlots; i++) {
    const fade = Math.sin(((i + 1) / (taperSlots + 1)) * Math.PI * 0.5);
    ys[i] = LINE_BASELINE_Y + (ys[i] - LINE_BASELINE_Y) * fade;
    const j = len - 1 - i;
    ys[j] = LINE_BASELINE_Y + (ys[j] - LINE_BASELINE_Y) * fade;
  }
}

function computeHorizontalLayout(canvasW, coreWidthPx, glowRadiusPx) {
  const maxHalfWidthPx = coreWidthPx * 0.5 + glowRadiusPx + HORIZONTAL_PAD_EXTRA_PX;
  const xInset = canvasW > 0 ? minNdcForPixels(maxHalfWidthPx, canvasW) : 0.06;
  const safeInset = Math.min(0.38, Math.max(0.04, xInset));
  return { xLeft: -1 + safeInset, xSpan: Math.max(0.24, 2 - safeInset * 2) };
}

function slotX(slot, len, xLeft, xSpan) {
  return xLeft + (slot / (len - 1)) * xSpan;
}

/**
 * 构建含圆角端帽的实心描边网格（单次 draw，避免半透明叠层接缝）。
 * 线身用上下偏移四边形，端帽用与线身共享边的半圆扇形。
 * @returns {number} 写入的 float 数量
 */
function writeStrokeMesh(vertices, offset, xs, ys, halfH, halfCapX, halfCapY) {
  const n = xs.length;
  if (n < 2) return offset;

  let write = offset;
  const pushTri = (x1, y1, x2, y2, x3, y3) => {
    vertices[write++] = x1;
    vertices[write++] = y1;
    vertices[write++] = x2;
    vertices[write++] = y2;
    vertices[write++] = x3;
    vertices[write++] = y3;
  };

  const top = (i) => ys[i] + halfH;
  const bot = (i) => ys[i] - halfH;

  for (let i = 0; i < n - 1; i++) {
    pushTri(xs[i], top(i), xs[i + 1], top(i + 1), xs[i + 1], bot(i + 1));
    pushTri(xs[i], top(i), xs[i + 1], bot(i + 1), xs[i], bot(i));
  }

  const cx0 = xs[0];
  const cy0 = ys[0];
  for (let s = 0; s < CAP_SEGMENTS; s++) {
    const a0 = Math.PI * 0.5 + (s / CAP_SEGMENTS) * Math.PI;
    const a1 = Math.PI * 0.5 + ((s + 1) / CAP_SEGMENTS) * Math.PI;
    pushTri(
      cx0,
      cy0,
      cx0 + Math.cos(a0) * halfCapX,
      cy0 + Math.sin(a0) * halfCapY,
      cx0 + Math.cos(a1) * halfCapX,
      cy0 + Math.sin(a1) * halfCapY,
    );
  }

  const cx1 = xs[n - 1];
  const cy1 = ys[n - 1];
  for (let s = 0; s < CAP_SEGMENTS; s++) {
    const a0 = -Math.PI * 0.5 + (s / CAP_SEGMENTS) * Math.PI;
    const a1 = -Math.PI * 0.5 + ((s + 1) / CAP_SEGMENTS) * Math.PI;
    pushTri(
      cx1,
      cy1,
      cx1 + Math.cos(a0) * halfCapX,
      cy1 + Math.sin(a0) * halfCapY,
      cx1 + Math.cos(a1) * halfCapX,
      cy1 + Math.sin(a1) * halfCapY,
    );
  }

  return write;
}

export function createGlowLineRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_lineColor;
uniform float u_alpha;
void main() {
  gl_FragColor = vec4(u_lineColor, u_alpha);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "u_lineColor");
  const alphaLoc = gl.getUniformLocation(program, "u_alpha");
  const buffer = gl.createBuffer();
  let easedPoints = [];

  const drawStrokeLayer = (meshBuffer, xs, ys, passWidthPx, color, alpha, canvasW, canvasH) => {
    const halfH = minNdcForPixels(passWidthPx * 0.5, canvasH);
    const halfCapX = minNdcForPixels(passWidthPx * 0.5, canvasW);
    const halfCapY = halfH;
    const vertCount = writeStrokeMesh(meshBuffer, 0, xs, ys, halfH, halfCapX, halfCapY);

    gl.uniform3f(colorLoc, color.r, color.g, color.b);
    gl.uniform1f(alphaLoc, alpha);
    gl.bufferData(gl.ARRAY_BUFFER, meshBuffer.subarray(0, vertCount), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, vertCount / 2);
  };

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length <= 1) return;

    const len = points.length;
    const ys = processSpectrumPoints(points, shapeConfig, easedPoints, { mapToNdcLine: true });
    applyEndpointTaper(ys, len);

    let maxY = -Infinity;
    for (let i = 0; i < len; i++) {
      if (ys[i] > maxY) maxY = ys[i];
    }
    if (maxY < LINE_BASELINE_Y + 0.01) return;

    const canvasW = gl.canvas.width;
    const canvasH = gl.canvas.height;
    const coreWidthPx = Math.max(1, Number(styleConfig.lineWidthPx) || 1);
    const glowRadiusPx = Math.max(0, Math.min(24, Number(styleConfig.glowRadiusPx) || 0));
    const glowIntensity = Math.max(0, Math.min(1, Number(styleConfig.glowIntensity) || 0));
    const glowPasses = Math.max(2, Math.min(6, Number(styleConfig.glowPasses) || 4));
    const freqReversed = Boolean(styleConfig.freqReversed);
    const coreColor = styleConfig.coreColor;
    const glowColor = styleConfig.glowColor;
    const { xLeft, xSpan } = computeHorizontalLayout(canvasW, coreWidthPx, glowRadiusPx);

    const xs = new Float32Array(len);
    const displayYs = new Float32Array(len);
    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      xs[slot] = slotX(slot, len, xLeft, xSpan);
      displayYs[slot] = ys[freqIndex];
    }

    const bodyTris = Math.max(0, len - 1) * 2;
    const capTris = CAP_SEGMENTS * 2;
    const meshFloats = (bodyTris + capTris) * 3 * 2;
    const meshBuffer = new Float32Array(meshFloats);

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (glowIntensity > 0 && glowRadiusPx > 0) {
      for (let layer = glowPasses; layer >= 1; layer--) {
        const layerT = layer / glowPasses;
        const extraWidth = Math.max(1, Math.round(layerT * glowRadiusPx));
        const passWidth = coreWidthPx + extraWidth * 2;
        const alpha = glowIntensity * (1 - layerT * 0.82) * 0.42;
        drawStrokeLayer(meshBuffer, xs, displayYs, passWidth, glowColor, alpha, canvasW, canvasH);
      }
    }

    drawStrokeLayer(meshBuffer, xs, displayYs, coreWidthPx, coreColor, 1, canvasW, canvasH);
  };

  return { render };
}
