import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { applyAdaptiveSmooth, minNdcForPixels } from "./common.js";
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

/** 每个顶点：position(2) + localCoord(2) + alpha(1) */
function writeCircleQuad(vertices, offset, cx, cy, halfW, halfH, alpha) {
  const corners = [
    { lx: -1, ly: -1 },
    { lx: 1, ly: -1 },
    { lx: 1, ly: 1 },
    { lx: -1, ly: 1 },
  ];
  const indices = [0, 1, 2, 0, 2, 3];

  for (let i = 0; i < 6; i++) {
    const c = corners[indices[i]];
    const base = offset + i * 5;
    vertices[base] = cx + c.lx * halfW;
    vertices[base + 1] = cy + c.ly * halfH;
    vertices[base + 2] = c.lx;
    vertices[base + 3] = c.ly;
    vertices[base + 4] = alpha;
  }
}

export function createDotRingRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_localCoord;
attribute float a_alpha;
varying vec2 v_localCoord;
varying float v_alpha;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_localCoord = a_localCoord;
  v_alpha = a_alpha;
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_dotColor;
varying vec2 v_localCoord;
varying float v_alpha;
void main() {
  float dist = length(v_localCoord);
  if (dist > 1.0) {
    discard;
  }
  float edge = smoothstep(1.0, 0.82, dist);
  gl_FragColor = vec4(u_dotColor, v_alpha * edge);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const localCoordLoc = gl.getAttribLocation(program, "a_localCoord");
  const alphaLoc = gl.getAttribLocation(program, "a_alpha");
  const colorLoc = gl.getUniformLocation(program, "u_dotColor");
  const buffer = gl.createBuffer();
  const stride = 5 * 4;
  let easedPoints = [];
  let easedBandAmps = [];
  let pulseEased = 0;

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const len = points.length;
    const normalized = processSpectrumPoints(points, shapeConfig, easedPoints, { circular: true });
    const dotCount = Math.max(4, Math.min(128, Math.round(Number(styleConfig.dotCount) || 32)));
    const bandAmps = aggregateBands(normalized, dotCount);
    applyAdaptiveSmooth(bandAmps, shapeConfig.smoothPercent, { circular: true });

    if (easedBandAmps.length !== dotCount) {
      easedBandAmps = new Array(dotCount).fill(0);
    }

    const fallEasePercent = Number(shapeConfig?.fallEasePercent);
    const fallBlend = Number.isFinite(fallEasePercent)
      ? Math.max(0.02, Math.min(1, fallEasePercent / 100))
      : 0.55;

    let globalMax = 0;
    for (let i = 0; i < dotCount; i++) {
      const raw = bandAmps[i];
      const prev = easedBandAmps[i] ?? 0;
      const eased = raw >= prev ? raw : prev + (raw - prev) * fallBlend;
      easedBandAmps[i] = eased;
      if (eased > globalMax) globalMax = eased;
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
    const pulseBoost = pulseEnabled ? 1 + 0.25 * pulseEased : 1;

    // 振幅向外推的最大径向行程（相对 min 维度）
    const radialSpreadNdc = Math.min(0.38, Math.max(0.08, (0.96 - ringRadiusNdc) * 0.92));

    const halfWBase = minNdcForPixels(baseSizePx * 0.5, canvasW);
    const halfHBase = minNdcForPixels(baseSizePx * 0.5, canvasH);

    const polarOpts = { freqReversed, rotationOffsetDeg: 0, clockwise: true };
    const vertices = new Float32Array(dotCount * 30);
    let writeOffset = 0;

    for (let slot = 0; slot < dotCount; slot++) {
      const amp = easedBandAmps[slot];
      if (amp <= 0.001) continue;

      const angle = slotToAngle(slot, dotCount, polarOpts);
      const radialOffset = amp * radialSpreadNdc * pulseBoost;
      const effectiveRadius = Math.min(0.98, ringRadiusNdc + radialOffset);
      const center = polarToNdc(angle, effectiveRadius, aspectScale);

      const sizeScale = (0.55 + 0.45 * amp) * (pulseEnabled ? 1 + 0.15 * pulseEased : 1);
      const alpha = Math.max(0.2, Math.min(1, 0.35 + 0.65 * amp));
      const halfW = halfWBase * sizeScale;
      const halfH = halfHBase * sizeScale;

      writeCircleQuad(vertices, writeOffset, center.x, center.y, halfW, halfH, alpha);
      writeOffset += 30;
    }

    if (writeOffset === 0) return;

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3f(colorLoc, dotColor.r, dotColor.g, dotColor.b);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, writeOffset), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(localCoordLoc);
    gl.vertexAttribPointer(localCoordLoc, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(alphaLoc);
    gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, stride, 16);

    gl.drawArrays(gl.TRIANGLES, 0, writeOffset / 5);
  };

  return { render };
}
