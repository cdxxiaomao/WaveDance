import { createProgram } from "./shaderUtils.js";
import { minNdcForPixels } from "./common.js";
import { processSpectrumPoints } from "./shapePipeline.js";

const LINE_BASELINE_Y = -0.95;
const EDGE_TAPER_FRACTION = 0.08;
const HORIZONTAL_PAD_EXTRA_PX = 4;
const CAP_SEGMENTS = 12;
const BAR_WIDTH_PERCENT = 76;
const BAR_GAP_PERCENT = 18;

function mix(a, b, t) {
  return a + (b - a) * t;
}

function writeRectVertices(vertices, offset, left, bottom, right, top) {
  vertices[offset] = left;
  vertices[offset + 1] = bottom;
  vertices[offset + 2] = left;
  vertices[offset + 3] = top;
  vertices[offset + 4] = right;
  vertices[offset + 5] = bottom;
  vertices[offset + 6] = left;
  vertices[offset + 7] = top;
  vertices[offset + 8] = right;
  vertices[offset + 9] = top;
  vertices[offset + 10] = right;
  vertices[offset + 11] = bottom;
}

function applyEndpointTaper(ys, len) {
  const taperSlots = Math.max(2, Math.round(len * EDGE_TAPER_FRACTION));
  for (let i = 0; i < taperSlots; i++) {
    const fade = Math.sin(((i + 1) / (taperSlots + 1)) * Math.PI * 0.5);
    ys[i] = LINE_BASELINE_Y + (ys[i] - LINE_BASELINE_Y) * fade;
    const j = len - 1 - i;
    ys[j] = LINE_BASELINE_Y + (ys[j] - LINE_BASELINE_Y) * fade;
  }
}

function computeHorizontalLayout(canvasW, lineWidthPx) {
  const maxHalfWidthPx = lineWidthPx * 0.5 + HORIZONTAL_PAD_EXTRA_PX;
  const xInset = canvasW > 0 ? minNdcForPixels(maxHalfWidthPx, canvasW) : 0.06;
  const safeInset = Math.min(0.38, Math.max(0.04, xInset));
  return { xLeft: -1 + safeInset, xSpan: Math.max(0.24, 2 - safeInset * 2) };
}

function slotX(slot, len, xLeft, xSpan) {
  return xLeft + (slot / (len - 1)) * xSpan;
}

function freqEmphasis(freqIndex, len, layerT, bassFront) {
  const freqT = len > 1 ? freqIndex / (len - 1) : 0;
  const bassW = 1 - freqT;
  const trebleW = freqT;
  if (bassFront) return mix(trebleW, bassW, layerT);
  return mix(bassW, trebleW, layerT);
}

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

export function createDepthLayersRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_color;
uniform float u_alpha;
void main() {
  gl_FragColor = vec4(u_color, u_alpha);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "u_color");
  const alphaLoc = gl.getUniformLocation(program, "u_alpha");
  const buffer = gl.createBuffer();
  let easedPoints = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length <= 1) return;

    const len = points.length;
    const normalized = processSpectrumPoints(points, shapeConfig, easedPoints);
    const layerCount = Math.max(2, Math.min(6, Math.round(Number(styleConfig.layerCount) || 4)));
    const farScale = Math.max(0.5, Math.min(0.9, Number(styleConfig.farScalePercent) / 100 || 0.72));
    const farAlpha = Math.max(0, Math.min(1, Number(styleConfig.farAlphaPercent) / 100 || 0.25));
    const layerSpacingPx = Math.max(0, Math.min(24, Number(styleConfig.layerSpacingPx) || 6));
    const lineWidthPx = Math.max(1, Math.min(12, Number(styleConfig.lineWidthPx) || 2));
    const bassFront = Boolean(styleConfig.bassFrontEnabled);
    const renderStyle = styleConfig.renderStyle === "bar" ? "bar" : "line";
    const freqReversed = Boolean(styleConfig.freqReversed);
    const colorNear = styleConfig.color;
    const colorFar = styleConfig.colorFar;

    const canvasW = gl.canvas.width;
    const canvasH = gl.canvas.height;
    const spacingNdc = minNdcForPixels(layerSpacingPx, canvasH);
    const { xLeft, xSpan } = computeHorizontalLayout(canvasW, lineWidthPx);

    const lineYs = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      lineYs[i] = (normalized[i] * 2 - 1) * 0.95;
    }
    applyEndpointTaper(lineYs, len);

    const gapScale = 1 - BAR_GAP_PERCENT / 100;
    const barThickness = (2 / len) * (BAR_WIDTH_PERCENT / 100) * gapScale;
    const barHalf = barThickness / 2;
    const maxExtent = 1.9;

    const bodyTris = Math.max(0, len - 1) * 2;
    const capTris = CAP_SEGMENTS * 2;
    const lineMeshFloats = (bodyTris + capTris) * 3 * 2;
    const lineMeshBuffer = new Float32Array(lineMeshFloats);
    const barVerts = new Float32Array(len * 12);

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for (let layer = 0; layer < layerCount; layer++) {
      const depthT = layerCount > 1 ? layer / (layerCount - 1) : 0;
      const scale = mix(farScale, 1, depthT);
      const alpha = mix(farAlpha, 1, depthT);
      const yOffset = layer * spacingNdc;
      const layerColor = {
        r: mix(colorFar.r, colorNear.r, depthT),
        g: mix(colorFar.g, colorNear.g, depthT),
        b: mix(colorFar.b, colorNear.b, depthT),
      };

      if (renderStyle === "line") {
        const xs = new Float32Array(len);
        const displayYs = new Float32Array(len);
        for (let slot = 0; slot < len; slot++) {
          const freqIndex = freqReversed ? len - 1 - slot : slot;
          const emphasis = freqEmphasis(freqIndex, len, depthT, bassFront);
          const amp = (lineYs[freqIndex] - LINE_BASELINE_Y) * emphasis * scale;
          xs[slot] = slotX(slot, len, xLeft, xSpan);
          displayYs[slot] = LINE_BASELINE_Y + amp + yOffset;
        }

        const halfH = minNdcForPixels(lineWidthPx * 0.5, canvasH);
        const halfCapX = minNdcForPixels(lineWidthPx * 0.5, canvasW);
        const vertCount = writeStrokeMesh(lineMeshBuffer, 0, xs, displayYs, halfH, halfCapX, halfH);

        gl.uniform3f(colorLoc, layerColor.r, layerColor.g, layerColor.b);
        gl.uniform1f(alphaLoc, alpha);
        gl.bufferData(gl.ARRAY_BUFFER, lineMeshBuffer.subarray(0, vertCount), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, vertCount / 2);
      } else {
        for (let slot = 0; slot < len; slot++) {
          const freqIndex = freqReversed ? len - 1 - slot : slot;
          const emphasis = freqEmphasis(freqIndex, len, depthT, bassFront);
          const extent = normalized[freqIndex] * emphasis * maxExtent * scale;
          const centerX = xLeft + ((slot + 0.5) / len) * xSpan;
          const left = centerX - barHalf * scale;
          const right = centerX + barHalf * scale;
          const bottom = -1 + yOffset;
          const top = bottom + extent;
          writeRectVertices(barVerts, slot * 12, left, bottom, right, top);
        }

        gl.uniform3f(colorLoc, layerColor.r, layerColor.g, layerColor.b);
        gl.uniform1f(alphaLoc, alpha);
        gl.bufferData(gl.ARRAY_BUFFER, barVerts, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, len * 6);
      }
    }
  };

  return { render };
}
