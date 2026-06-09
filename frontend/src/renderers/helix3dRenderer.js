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
 * @param {number} slot
 * @param {number} pointCount
 * @param {object} opts
 * @returns {[number, number, number]}
 */
function helixPointPosition(slot, pointCount, opts) {
  const {
    helixRadius,
    helixPitch,
    helixTurns,
    amp,
    extrudeMode,
    extrudeScale,
    heightScale,
  } = opts;
  const t = pointCount <= 1 ? 0 : slot / (pointCount - 1);
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
  const chainIndexBuffer = gl.createBuffer();

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
    const chainIndices = [];
    const helixPositions = [];

    for (let i = 0; i < pointCount; i++) {
      const slot = freqReversed ? pointCount - 1 - i : i;
      const amp = amps[slot];
      const [x, y, z] = helixPointPosition(slot, pointCount, {
        helixRadius,
        helixPitch,
        helixTurns,
        amp,
        extrudeMode,
        extrudeScale,
        heightScale,
      });
      helixPositions.push(x, y, z);

      const halfSize = pointHalfSizeWorld(pointSizePx, gl.canvas.height, cameraDistance, amp);
      appendCubeLineMesh(positions, cubeLineIndices, x, y, z, halfSize, i * 8);
    }

    if (wireframeEnabled && pointCount >= 2) {
      for (let i = 0; i < pointCount; i++) {
        chainIndices.push(i);
      }
    }

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

    if (wireframeEnabled && chainIndices.length >= 2) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(helixPositions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wireProgram.attribs.position);
      gl.vertexAttribPointer(wireProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.uniform3f(wireProgram.uniforms.color, dotColor.r * 0.85, dotColor.g * 0.85, dotColor.b);
      gl.uniform1f(wireProgram.uniforms.alpha, 0.55);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, chainIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(chainIndices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.LINE_STRIP, chainIndices.length, gl.UNSIGNED_SHORT, 0);
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
