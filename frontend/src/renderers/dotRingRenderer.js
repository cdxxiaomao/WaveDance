import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { minNdcForPixels } from "./common.js";
import { getAspectScale, polarToNdc, slotToAngle } from "./polar.js";

/**
 * 将频谱桶聚合为 dotCount 个频段（取各段峰值）。
 * @param {Float32Array | number[]} values
 * @param {number} dotCount
 * @returns {Float32Array}
 */
export function aggregateBands(values, dotCount) {
  const len = values.length;
  const count = Math.max(1, Math.min(Math.round(Number(dotCount) || 1), len));
  const result = new Float32Array(count);
  for (let band = 0; band < count; band++) {
    const start = Math.floor((band * len) / count);
    const end = Math.floor(((band + 1) * len) / count);
    let peak = 0;
    for (let i = start; i < end; i++) {
      if (values[i] > peak) peak = values[i];
    }
    result[band] = peak;
  }
  return result;
}

function writeQuad(vertices, alphaAttr, offset, cx, cy, halfW, halfH, alpha) {
  const x0 = cx - halfW;
  const x1 = cx + halfW;
  const y0 = cy - halfH;
  const y1 = cy + halfH;

  vertices[offset] = x0;
  vertices[offset + 1] = y0;
  vertices[offset + 2] = x1;
  vertices[offset + 3] = y0;
  vertices[offset + 4] = x1;
  vertices[offset + 5] = y1;
  alphaAttr[offset / 2] = alpha;
  alphaAttr[offset / 2 + 1] = alpha;
  alphaAttr[offset / 2 + 2] = alpha;

  vertices[offset + 6] = x0;
  vertices[offset + 7] = y0;
  vertices[offset + 8] = x1;
  vertices[offset + 9] = y1;
  vertices[offset + 10] = x0;
  vertices[offset + 11] = y1;
  alphaAttr[offset / 2 + 3] = alpha;
  alphaAttr[offset / 2 + 4] = alpha;
  alphaAttr[offset / 2 + 5] = alpha;
}

export function createDotRingRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
attribute float a_alpha;
varying float v_alpha;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_alpha = a_alpha;
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_dotColor;
varying float v_alpha;
void main() {
  gl_FragColor = vec4(u_dotColor, v_alpha);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const alphaLoc = gl.getAttribLocation(program, "a_alpha");
  const colorLoc = gl.getUniformLocation(program, "u_dotColor");
  const buffer = gl.createBuffer();
  const alphaBuffer = gl.createBuffer();
  let easedPoints = [];
  let pulseEased = 0;

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const len = points.length;
    const normalized = processSpectrumPoints(points, shapeConfig, easedPoints);
    const dotCount = Math.max(4, Math.min(128, Math.round(Number(styleConfig.dotCount) || 32)));
    const bandAmps = aggregateBands(normalized, dotCount);

    let globalMax = 0;
    for (let i = 0; i < bandAmps.length; i++) {
      if (bandAmps[i] > globalMax) globalMax = bandAmps[i];
    }
    if (globalMax < 0.002) return;

    const canvasW = gl.canvas.width;
    const canvasH = gl.canvas.height;
    const aspectScale = getAspectScale(canvasW, canvasH);

    const ringRadiusPercent = Math.max(10, Math.min(95, Number(styleConfig.ringRadiusPercent) || 75));
    const ringRadiusNdc = ringRadiusPercent / 100;
    const baseSizePx = Math.max(2, Math.min(24, Number(styleConfig.dotSizePx) || 6));
    const pulseEnabled = Boolean(styleConfig.pulseEnabled);
    const freqReversed = Boolean(styleConfig.freqReversed);
    const dotColor = styleConfig.dotColor;

    if (pulseEnabled) {
      pulseEased = globalMax >= pulseEased ? globalMax : pulseEased + (globalMax - pulseEased) * 0.18;
    } else {
      pulseEased = 0;
    }
    const pulseScale = pulseEnabled ? 1 + 0.45 * pulseEased : 1;

    const halfWBase = minNdcForPixels(baseSizePx * 0.5, canvasW);
    const halfHBase = minNdcForPixels(baseSizePx * 0.5, canvasH);

    const polarOpts = { freqReversed, rotationOffsetDeg: 0, clockwise: true };
    const vertices = new Float32Array(dotCount * 12);
    const alphaAttr = new Float32Array(dotCount * 6);
    let writeOffset = 0;

    for (let slot = 0; slot < dotCount; slot++) {
      const amp = bandAmps[slot];
      if (amp <= 0.001) continue;

      const angle = slotToAngle(slot, dotCount, polarOpts);
      const center = polarToNdc(angle, ringRadiusNdc, aspectScale);
      const sizeScale = (0.3 + 0.7 * amp) * pulseScale;
      const alpha = Math.max(0.15, Math.min(1, amp));
      const halfW = halfWBase * sizeScale;
      const halfH = halfHBase * sizeScale;

      writeQuad(vertices, alphaAttr, writeOffset, center.x, center.y, halfW, halfH, alpha);
      writeOffset += 12;
    }

    if (writeOffset === 0) return;

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3f(colorLoc, dotColor.r, dotColor.g, dotColor.b);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, writeOffset), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, alphaAttr.subarray(0, writeOffset / 2), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(alphaLoc);
    gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, writeOffset / 2);
  };

  return { render };
}
