import { processSpectrumPoints } from "./shapePipeline.js";
import { aggregateBands } from "./bandAggregate.js";
import {
  createMat4,
  createCamera,
  createWireframeProgram,
  multiply,
} from "./gl3d.js";

const BOX_LINE_INDICES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
];

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildCubeWireframe(cx, cy, cz, halfSize) {
  const hs = halfSize;
  return [
    [cx - hs, cy - hs, cz - hs],
    [cx + hs, cy - hs, cz - hs],
    [cx + hs, cy + hs, cz - hs],
    [cx - hs, cy + hs, cz - hs],
    [cx - hs, cy - hs, cz + hs],
    [cx + hs, cy - hs, cz + hs],
    [cx + hs, cy + hs, cz + hs],
    [cx - hs, cy + hs, cz + hs],
  ];
}

function appendCubeLineMesh(positions, lineIndices, cx, cy, cz, halfSize, baseIndex) {
  const verts = buildCubeWireframe(cx, cy, cz, halfSize);
  for (const [x, y, z] of verts) {
    positions.push(x, y, z);
  }
  for (const idx of BOX_LINE_INDICES) {
    lineIndices.push(baseIndex + idx);
  }
}

/**
 * @param {number} t 沿螺旋 0~1
 * @param {number} amp 归一化幅度
 * @param {object} opts
 * @returns {[number, number, number]}
 */
function helixPointAt(t, amp, opts) {
  const {
    helixRadius,
    helixPitch,
    helixTurns,
    extrudeMode,
    extrudeScale,
    heightScale,
  } = opts;
  const theta = t * helixTurns * Math.PI * 2;
  const yBase = t * helixPitch * helixTurns - helixPitch * 0.5;
  let r = helixRadius;
  let y = yBase;
  if (extrudeMode === "height") {
    y = yBase + amp * heightScale;
  } else {
    r = helixRadius + amp * extrudeScale;
  }
  return [r * Math.cos(theta), y, r * Math.sin(theta)];
}

/**
 * @param {number} slot
 * @param {number} pointCount
 * @param {object} opts
 * @returns {[number, number, number]}
 */
function helixPointPosition(slot, pointCount, opts) {
  const t = pointCount <= 1 ? 0 : slot / (pointCount - 1);
  return helixPointAt(t, opts.amp, opts);
}

/** @param {number} a @param {number} b @param {number} t */
function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * 沿螺旋参数高密度采样 + 幅度 smoothstep 插值，生成平滑链线顶点。
 * @param {number[]} amps
 * @param {number} pointCount
 * @param {object} helixOpts
 * @param {boolean} freqReversed
 * @param {number} subdivisionsPerSegment
 * @returns {number[]}
 */
function buildSmoothChainPositions(amps, pointCount, helixOpts, freqReversed, subdivisionsPerSegment) {
  if (pointCount < 2) return [];

  const chainPositions = [];
  const segments = (pointCount - 1) * subdivisionsPerSegment;

  for (let s = 0; s <= segments; s++) {
    const u = s / segments;
    const slotFloat = freqReversed ? (1 - u) * (pointCount - 1) : u * (pointCount - 1);
    const slot0 = Math.floor(slotFloat);
    const slot1 = Math.min(pointCount - 1, slot0 + 1);
    const localT = slotFloat - slot0;
    const amp = amps[slot0] + (amps[slot1] - amps[slot0]) * smoothstep(0, 1, localT);
    const t = pointCount <= 1 ? 0 : slotFloat / (pointCount - 1);
    const [x, y, z] = helixPointAt(t, amp, helixOpts);
    chainPositions.push(x, y, z);
  }

  return chainPositions;
}

function pointHalfSizeWorld(pointSizePx, canvasHeight, cameraDistance, amp) {
  const pxScale = pointSizePx / Math.max(1, canvasHeight);
  const base = pxScale * cameraDistance * 0.55;
  return base * (0.35 + 0.65 * amp);
}

/**
 * @param {WebGLRenderingContext} gl
 */
export function createHelix3dRenderer(gl) {
  const camera = createCamera();
  const wireProgram = createWireframeProgram(gl);
  const posBuffer = gl.createBuffer();
  const lineIndexBuffer = gl.createBuffer();

  const mvpMat = createMat4();
  const viewMat = createMat4();
  const projMat = createMat4();
  const modelMat = createMat4();
  const viewModelMat = createMat4();

  let easedPoints = [];
  let lastNow = performance.now();

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const normalized = processSpectrumPoints(points, shapeConfig, easedPoints);
    const displayPointCount = Math.max(
      8,
      Math.min(64, Math.round(Number(styleConfig.displayPointCount) || 32)),
    );
    const amps = aggregateBands(normalized, displayPointCount);
    const pointCount = amps.length;
    if (pointCount === 0) return;

    const helixRadius = clampNum(styleConfig.helixRadius, 0.15, 1.0, 0.5);
    const helixPitch = clampNum(styleConfig.helixPitch, 0.1, 0.8, 0.35);
    const helixTurns = clampNum(styleConfig.helixTurns, 1, 4, 2.5);
    const extrudeMode = styleConfig.extrudeMode === "height" ? "height" : "radial";
    const extrudeScale = clampNum(styleConfig.extrudeScale, 0.05, 0.6, 0.28);
    const heightScale = clampNum(styleConfig.heightScale, 0.05, 0.8, 0.35);
    const pointSizePx = clampNum(styleConfig.pointSizePx, 2, 24, 8);
    const wireframeEnabled = styleConfig.wireframeEnabled !== false;
    const autoRotateEnabled = styleConfig.autoRotateEnabled !== false;
    const autoRotateSpeedDeg = clampNum(styleConfig.autoRotateSpeedDeg, 0, 20, 8);
    const cameraDistance = clampNum(styleConfig.cameraDistance, 1.2, 4.5, 2.5);
    const cameraFovDeg = clampNum(styleConfig.cameraFovDeg, 30, 75, 45);
    const freqReversed = Boolean(styleConfig.freqReversed);

    const now = performance.now();
    camera.tick(now, autoRotateEnabled, autoRotateSpeedDeg);

    const positions = [];
    const cubeLineIndices = [];
    const helixOpts = {
      helixRadius,
      helixPitch,
      helixTurns,
      extrudeMode,
      extrudeScale,
      heightScale,
    };

    for (let i = 0; i < pointCount; i++) {
      const slot = freqReversed ? pointCount - 1 - i : i;
      const amp = amps[slot];
      const [x, y, z] = helixPointPosition(slot, pointCount, { ...helixOpts, amp });

      const halfSize = pointHalfSizeWorld(pointSizePx, gl.canvas.height, cameraDistance, amp);
      appendCubeLineMesh(positions, cubeLineIndices, x, y, z, halfSize, i * 8);
    }

    const subdivisionsPerSegment = Math.max(4, Math.min(10, Math.round(48 / pointCount)));
    const chainPositions =
      wireframeEnabled && pointCount >= 2
        ? buildSmoothChainPositions(amps, pointCount, helixOpts, freqReversed, subdivisionsPerSegment)
        : [];

    const aspect = gl.canvas.width / Math.max(1, gl.canvas.height);
    camera.getProjectionMatrix(projMat, aspect, cameraFovDeg);
    camera.getViewMatrix(viewMat, cameraDistance);
    camera.getModelMatrix(modelMat);
    multiply(viewModelMat, viewMat, modelMat);
    multiply(mvpMat, projMat, viewModelMat);

    const dotColor = styleConfig.dotColor ?? { r: 0.56, g: 0.49, b: 1 };

    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(wireProgram.program);
    gl.uniformMatrix4fv(wireProgram.uniforms.mvp, false, mvpMat);

    if (wireframeEnabled && chainPositions.length >= 6) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(chainPositions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wireProgram.attribs.position);
      gl.vertexAttribPointer(wireProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.uniform3f(wireProgram.uniforms.color, dotColor.r * 0.85, dotColor.g * 0.85, dotColor.b);
      gl.uniform1f(wireProgram.uniforms.alpha, 0.55);

      gl.drawArrays(gl.LINE_STRIP, 0, chainPositions.length / 3);
    }

    if (cubeLineIndices.length > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wireProgram.attribs.position);
      gl.vertexAttribPointer(wireProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.uniform3f(wireProgram.uniforms.color, dotColor.r, dotColor.g, dotColor.b);
      gl.uniform1f(wireProgram.uniforms.alpha, 0.92);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeLineIndices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.LINES, cubeLineIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.DEPTH_TEST);
  };

  camera.resetTime(lastNow);

  return { render };
}
