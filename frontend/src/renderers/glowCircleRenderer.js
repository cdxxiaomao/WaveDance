import { createProgram } from "./shaderUtils.js";
import { minNdcForPixels } from "./common.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { getAspectScale, polarToNdc, slotToAngle } from "./polar.js";

function normalize2(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1e-8) return { x: 0, y: 1 };
  return { x: x / len, y: y / len };
}

/**
 * 闭合环形描边网格，顶点法线采用 miter 衔接，首尾接缝与中间段一致。
 * @returns {number} 写入的 float 数量
 */
function writeClosedStrokeMesh(vertices, offset, points, halfWidthNdc) {
  const n = points.length;
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

  const offsets = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const d0 = normalize2(curr.x - prev.x, curr.y - prev.y);
    const d1 = normalize2(next.x - curr.x, next.y - curr.y);

    const n0x = -d0.y;
    const n0y = d0.x;
    const n1x = -d1.y;
    const n1y = d1.x;
    let mx = n0x + n1x;
    let my = n0y + n1y;
    const mlen = Math.hypot(mx, my);
    if (mlen < 1e-8) {
      mx = n0x;
      my = n0y;
    } else {
      mx /= mlen;
      my /= mlen;
    }
    const dot = mx * n0x + my * n0y;
    const scale = dot > 0.15 ? halfWidthNdc / dot : halfWidthNdc;
    offsets[i] = { x: mx * scale, y: my * scale };
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = points[i];
    const pj = points[j];
    const oi = offsets[i];
    const oj = offsets[j];
    pushTri(pi.x + oi.x, pi.y + oi.y, pj.x + oj.x, pj.y + oj.y, pj.x - oj.x, pj.y - oj.y);
    pushTri(pi.x + oi.x, pi.y + oi.y, pj.x - oj.x, pj.y - oj.y, pi.x - oi.x, pi.y - oi.y);
  }

  return write;
}

export function createGlowCircleRenderer(gl) {
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

  const drawStrokeLayer = (meshBuffer, ringPoints, passWidthPx, color, alpha, canvasW, canvasH) => {
    const minDim = Math.min(canvasW, canvasH);
    const halfWidthNdc = minNdcForPixels(passWidthPx * 0.5, minDim);
    const vertCount = writeClosedStrokeMesh(meshBuffer, 0, ringPoints, halfWidthNdc);

    gl.uniform3f(colorLoc, color.r, color.g, color.b);
    gl.uniform1f(alphaLoc, alpha);
    gl.bufferData(gl.ARRAY_BUFFER, meshBuffer.subarray(0, vertCount), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, vertCount / 2);
  };

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length <= 1) return;

    const len = points.length;
    const normalized = processSpectrumPoints(points, shapeConfig, easedPoints, { circular: true });

    let maxAmp = 0;
    for (let i = 0; i < len; i++) {
      if (normalized[i] > maxAmp) maxAmp = normalized[i];
    }
    if (maxAmp < 0.002) return;

    const canvasW = gl.canvas.width;
    const canvasH = gl.canvas.height;
    const aspectScale = getAspectScale(canvasW, canvasH);
    const minDim = Math.min(canvasW, canvasH);

    const coreWidthPx = Math.max(1, Number(styleConfig.lineWidthPx) || 1);
    const glowRadiusPx = Math.max(0, Math.min(24, Number(styleConfig.glowRadiusPx) || 0));
    const glowIntensity = Math.max(0, Math.min(1, Number(styleConfig.glowIntensity) || 0));
    const glowPasses = Math.max(2, Math.min(6, Number(styleConfig.glowPasses) || 4));
    const freqReversed = Boolean(styleConfig.freqReversed);
    const coreColor = styleConfig.coreColor;
    const glowColor = styleConfig.glowColor;

    const ringRadiusPercent = Math.max(10, Math.min(85, Number(styleConfig.ringRadiusPercent) || 55));
    const ringRadiusNdc = ringRadiusPercent / 100;
    const rotationOffsetDeg = Number(styleConfig.rotationOffsetDeg) || 0;
    const clockwise = styleConfig.clockwise !== false;

    const radialSpreadNdc = Math.min(0.38, Math.max(0.06, (0.96 - ringRadiusNdc) * 0.88));
    const glowPadNdc = minNdcForPixels(coreWidthPx * 0.5 + glowRadiusPx + 6, minDim);

    const polarOpts = { freqReversed, rotationOffsetDeg, clockwise };

    const ringPoints = new Array(len);
    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      const amp = normalized[freqIndex];
      const angle = slotToAngle(slot, len, polarOpts);
      const effectiveRadius = Math.min(0.98 - glowPadNdc, ringRadiusNdc + amp * radialSpreadNdc);
      ringPoints[slot] = polarToNdc(angle, effectiveRadius, aspectScale);
    }

    const meshFloats = len * 2 * 3 * 2;
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
        drawStrokeLayer(meshBuffer, ringPoints, passWidth, glowColor, alpha, canvasW, canvasH);
      }
    }

    drawStrokeLayer(meshBuffer, ringPoints, coreWidthPx, coreColor, 1, canvasW, canvasH);
  };

  return { render };
}
