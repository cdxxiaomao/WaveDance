import { processSpectrumPoints } from "./shapePipeline.js";
import { aggregateBands } from "./bandAggregate.js";
import { slotToAngle } from "./polar.js";
import {
  createMat4,
  createCamera,
  createBasicLitProgram,
  createWireframeProgram,
  multiply,
  scale,
} from "./gl3d.js";

const MIN_BAR_HEIGHT = 0.02;
const BOX_LINE_INDICES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
];

const BOX_FACE_INDICES = [
  4, 5, 6, 4, 6, 7,
  1, 5, 6, 1, 6, 2,
  0, 3, 7, 0, 7, 4,
  0, 1, 5, 0, 5, 4,
  2, 6, 7, 2, 7, 3,
];

const BOX_NORMALS = [
  [0, -1, 0],
  [0, -1, 0],
  [0, -1, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 1, 0],
  [0, 1, 0],
  [0, 1, 0],
];

function clampRadius(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function buildBarVertices(innerR, outerR, angleStart, angleEnd, height) {
  const sin0 = Math.sin(angleStart);
  const cos0 = Math.cos(angleStart);
  const sin1 = Math.sin(angleEnd);
  const cos1 = Math.cos(angleEnd);

  return [
    [sin0 * innerR, 0, cos0 * innerR],
    [sin0 * outerR, 0, cos0 * outerR],
    [sin1 * outerR, 0, cos1 * outerR],
    [sin1 * innerR, 0, cos1 * innerR],
    [sin0 * innerR, height, cos0 * innerR],
    [sin0 * outerR, height, cos0 * outerR],
    [sin1 * outerR, height, cos1 * outerR],
    [sin1 * innerR, height, cos1 * innerR],
  ];
}

function appendBarLineMesh(positions, lineIndices, barVerts, baseIndex) {
  for (const [x, y, z] of barVerts) {
    positions.push(x, y, z);
  }
  for (const idx of BOX_LINE_INDICES) {
    lineIndices.push(baseIndex + idx);
  }
}

function appendBarFillMesh(positions, normals, triIndices, barVerts, baseIndex) {
  for (let i = 0; i < barVerts.length; i++) {
    const [x, y, z] = barVerts[i];
    positions.push(x, y, z);
    const [nx, ny, nz] = BOX_NORMALS[i];
    normals.push(nx, ny, nz);
  }
  for (const idx of BOX_FACE_INDICES) {
    triIndices.push(baseIndex + idx);
  }
}

/**
 * @param {WebGLRenderingContext} gl
 */
export function createRing3dRenderer(gl) {
  const camera = createCamera();
  const wireProgram = createWireframeProgram(gl);
  const litProgram = createBasicLitProgram(gl);

  const posBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const lineIndexBuffer = gl.createBuffer();
  const triIndexBuffer = gl.createBuffer();

  const mvpMat = createMat4();
  const viewMat = createMat4();
  const projMat = createMat4();
  const modelMat = createMat4();
  const rotMat = createMat4();
  const scaleMat = createMat4();
  const viewModelMat = createMat4();

  let easedBars = [];
  let lastNow = performance.now();

  const render = (points, shapeConfig, styleConfig, frameMeta) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const normalized = processSpectrumPoints(points, shapeConfig, easedBars);
    const displayBarCount = Math.max(8, Math.min(128, Math.round(Number(styleConfig.displayBarCount) || 48)));
    const amps = aggregateBands(normalized, displayBarCount);
    const barCount = amps.length;
    if (barCount === 0) return;

    let innerRadius = clampRadius(styleConfig.innerRadius, 0.1, 0.8);
    let outerRadius = clampRadius(styleConfig.outerRadius, 0.15, 1.0);
    if (outerRadius <= innerRadius + 0.05) {
      outerRadius = innerRadius + 0.05;
    }

    const barHeightScale = clampRadius(styleConfig.barHeightScale, 0.1, 1.5);
    const barThicknessDeg = Math.max(1, Math.min(12, Number(styleConfig.barThicknessDeg) || 4));
    const wireframeEnabled = styleConfig.wireframeEnabled !== false;
    const fillEnabled = Boolean(styleConfig.fillEnabled);
    const autoRotateEnabled = styleConfig.autoRotateEnabled !== false;
    const autoRotateSpeedDeg = Math.max(0, Math.min(20, Number(styleConfig.autoRotateSpeedDeg) || 6));
    const cameraDistance = clampRadius(styleConfig.cameraDistance, 1.2, 4.5);
    const cameraFovDeg = Math.max(30, Math.min(75, Number(styleConfig.cameraFovDeg) || 45));
    const breatheWithPeak = styleConfig.breatheWithPeak !== false;
    const freqReversed = Boolean(styleConfig.freqReversed);

    const peak = Number(frameMeta?.peak) || 0;
    const breatheScale = breatheWithPeak ? 1 + Math.min(1, Math.max(0, peak)) * 0.18 : 1;

    const now = performance.now();
    camera.tick(now, autoRotateEnabled, autoRotateSpeedDeg);

    const linePositions = [];
    const lineIndices = [];
    const fillPositions = [];
    const fillNormals = [];
    const triIndices = [];

    const angleOpts = { freqReversed, rotationOffsetDeg: 0, clockwise: true };
    const barSpanRad = (barThicknessDeg * Math.PI) / 180;

    for (let slot = 0; slot < barCount; slot++) {
      const amp = amps[slot];
      const height = Math.max(MIN_BAR_HEIGHT, amp * barHeightScale * breatheScale);
      const center = slotToAngle(slot, barCount, angleOpts);
      const start = center - barSpanRad * 0.5;
      const end = center + barSpanRad * 0.5;
      const barVerts = buildBarVertices(innerRadius, outerRadius, start, end, height);

      if (wireframeEnabled) {
        appendBarLineMesh(linePositions, lineIndices, barVerts, slot * 8);
      }
      if (fillEnabled) {
        appendBarFillMesh(fillPositions, fillNormals, triIndices, barVerts, slot * 8);
      }
    }

    const aspect = gl.canvas.width / Math.max(1, gl.canvas.height);
    camera.getProjectionMatrix(projMat, aspect, cameraFovDeg);
    camera.getViewMatrix(viewMat, cameraDistance);
    scale(scaleMat, breatheScale);
    camera.getModelMatrix(rotMat);
    multiply(modelMat, rotMat, scaleMat);
    multiply(viewModelMat, viewMat, modelMat);
    multiply(mvpMat, projMat, viewModelMat);

    const barColor = styleConfig.barColor ?? { r: 0.56, g: 0.49, b: 1 };

    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (wireframeEnabled && lineIndices.length > 0) {
      gl.useProgram(wireProgram.program);
      gl.uniformMatrix4fv(wireProgram.uniforms.mvp, false, mvpMat);
      gl.uniform3f(wireProgram.uniforms.color, barColor.r, barColor.g, barColor.b);
      gl.uniform1f(wireProgram.uniforms.alpha, 0.92);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(linePositions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wireProgram.attribs.position);
      gl.vertexAttribPointer(wireProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lineIndices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.LINES, lineIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    if (fillEnabled && triIndices.length > 0) {
      gl.useProgram(litProgram.program);
      gl.uniformMatrix4fv(litProgram.uniforms.mvp, false, mvpMat);
      gl.uniformMatrix4fv(litProgram.uniforms.model, false, modelMat);
      gl.uniform3f(litProgram.uniforms.color, barColor.r, barColor.g, barColor.b);
      gl.uniform3f(litProgram.uniforms.lightDir, 0.35, 0.85, 0.25);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fillPositions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(litProgram.attribs.position);
      gl.vertexAttribPointer(litProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fillNormals), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(litProgram.attribs.normal);
      gl.vertexAttribPointer(litProgram.attribs.normal, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triIndices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, triIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.DEPTH_TEST);
  };

  camera.resetTime(lastNow);

  return { render };
}
