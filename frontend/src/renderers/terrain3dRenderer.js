import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { aggregateBands } from "./bandAggregate.js";
import {
  createMat4,
  createWireframeProgram,
  lookAt,
  multiply,
  perspective,
} from "./gl3d.js";

const TERRAIN_WIDTH = 1.6;
const TERRAIN_NEAR_Z = 0.35;
const TERRAIN_FAR_Z = -1.15;
const CAMERA_FOV_DEG = 45;

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getTerrainViewMatrix(out, distance, pitchDeg) {
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const eyeY = distance * Math.sin(pitchRad);
  const eyeZ = distance * Math.cos(pitchRad);
  return lookAt(out, [0, eyeY, eyeZ], [0, 0, -0.35], [0, 1, 0]);
}

const TERRAIN_FILL_VS = `
attribute vec3 a_position;
attribute float a_height;
uniform mat4 u_mvp;
varying float v_height;
void main() {
  v_height = a_height;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

const TERRAIN_FILL_FS = `
precision mediump float;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
varying float v_height;
void main() {
  float t = clamp(v_height, 0.0, 1.0);
  vec3 color = mix(u_colorLow, u_colorHigh, t);
  gl_FragColor = vec4(color, 0.88);
}
`;

function createTerrainFillProgram(gl) {
  const program = createProgram(gl, TERRAIN_FILL_VS, TERRAIN_FILL_FS);
  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, "a_position"),
      height: gl.getAttribLocation(program, "a_height"),
    },
    uniforms: {
      mvp: gl.getUniformLocation(program, "u_mvp"),
      colorLow: gl.getUniformLocation(program, "u_colorLow"),
      colorHigh: gl.getUniformLocation(program, "u_colorHigh"),
    },
  };
}

/**
 * @param {WebGLRenderingContext} gl
 */
export function createTerrain3dRenderer(gl) {
  const wireProgram = createWireframeProgram(gl);
  const fillProgram = createTerrainFillProgram(gl);

  const posBuffer = gl.createBuffer();
  const heightBuffer = gl.createBuffer();
  const lineIndexBuffer = gl.createBuffer();
  const triIndexBuffer = gl.createBuffer();

  const mvpMat = createMat4();
  const viewMat = createMat4();
  const projMat = createMat4();

  let history = null;
  let gridCols = 64;
  let gridRows = 48;
  let writeRow = 0;
  let frameCounter = 0;
  let sourceBucketCount = 0;
  let easedBars = [];

  function resetHistory(cols, rows) {
    gridCols = cols;
    gridRows = rows;
    history = new Float32Array(cols * rows);
    history.fill(0);
    writeRow = 0;
    frameCounter = 0;
    sourceBucketCount = 0;
    easedBars = [];
  }

  function readHistoryCell(age, col) {
    const ringRow = (writeRow - 1 - age + gridRows * 16) % gridRows;
    return history[ringRow * gridCols + col];
  }

  function buildMesh(styleConfig) {
    const cols = gridCols;
    const rows = gridRows;
    const heightScale = clampFloat(styleConfig.terrainHeightScale, 0.05, 1.2, 0.35);
    const freqReversed = Boolean(styleConfig.freqReversed);

    const positions = [];
    const heights = [];
    const lineIndices = [];
    const triIndices = [];

    for (let age = 0; age < rows; age++) {
      const t = rows > 1 ? age / (rows - 1) : 0;
      const z = TERRAIN_NEAR_Z + (TERRAIN_FAR_Z - TERRAIN_NEAR_Z) * t;

      for (let col = 0; col < cols; col++) {
        const srcCol = freqReversed ? cols - 1 - col : col;
        const amp = readHistoryCell(age, srcCol);
        const x = cols > 1 ? (col / (cols - 1) - 0.5) * TERRAIN_WIDTH : 0;
        const y = amp * heightScale;

        positions.push(x, y, z);
        heights.push(amp);
      }
    }

    for (let r = 0; r < rows; r++) {
      const rowBase = r * cols;
      for (let c = 0; c < cols - 1; c++) {
        const a = rowBase + c;
        const b = rowBase + c + 1;
        lineIndices.push(a, b);
      }
    }

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = r * cols + c;
        const b = (r + 1) * cols + c;
        lineIndices.push(a, b);
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = i0 + 1;
        const i2 = i0 + cols;
        const i3 = i2 + 1;
        triIndices.push(i0, i1, i2, i1, i3, i2);
      }
    }

    return { positions, heights, lineIndices, triIndices };
  }

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const cols = clampInt(styleConfig.gridCols, 16, 96);
    const rows = clampInt(styleConfig.gridRows, 16, 96);
    const scrollEveryNFrames = clampInt(styleConfig.scrollEveryNFrames, 1, 8);
    const autoScrollEnabled = styleConfig.autoScrollEnabled !== false;

    if (!history || gridCols !== cols || gridRows !== rows || sourceBucketCount !== points.length) {
      resetHistory(cols, rows);
      sourceBucketCount = points.length;
    }

    const normalized = processSpectrumPoints(points, shapeConfig, easedBars);
    const aggregated = aggregateBands(normalized, cols);
    const rowOffset = writeRow * cols;

    for (let c = 0; c < cols; c++) {
      history[rowOffset + c] = aggregated[c];
    }

    if (autoScrollEnabled) {
      frameCounter++;
      if (frameCounter >= scrollEveryNFrames) {
        frameCounter = 0;
        writeRow = (writeRow + 1) % rows;
      }
    }

    const wireframeEnabled = styleConfig.wireframeEnabled !== false;
    const fillEnabled = Boolean(styleConfig.fillEnabled);
    const cameraDistance = clampFloat(styleConfig.cameraDistance, 1.2, 4.5, 2.8);
    const cameraPitchDeg = clampFloat(styleConfig.cameraPitchDeg, 30, 75, 55);

    const mesh = buildMesh(styleConfig);
    const aspect = gl.canvas.width / Math.max(1, gl.canvas.height);

    getTerrainViewMatrix(viewMat, cameraDistance, cameraPitchDeg);
    perspective(projMat, (CAMERA_FOV_DEG * Math.PI) / 180, Math.max(0.01, aspect), 0.08, 50);
    multiply(mvpMat, projMat, viewMat);

    const colorLow = styleConfig.colorLow ?? { r: 0.1, g: 0.1, b: 0.18 };
    const colorHigh = styleConfig.colorHigh ?? { r: 0.56, g: 0.49, b: 1 };
    const wireframeColor = styleConfig.wireframeColor ?? { r: 0.77, g: 0.71, b: 0.99 };

    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (fillEnabled && mesh.triIndices.length > 0) {
      gl.useProgram(fillProgram.program);
      gl.uniformMatrix4fv(fillProgram.uniforms.mvp, false, mvpMat);
      gl.uniform3f(fillProgram.uniforms.colorLow, colorLow.r, colorLow.g, colorLow.b);
      gl.uniform3f(fillProgram.uniforms.colorHigh, colorHigh.r, colorHigh.g, colorHigh.b);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(fillProgram.attribs.position);
      gl.vertexAttribPointer(fillProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, heightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.heights), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(fillProgram.attribs.height);
      gl.vertexAttribPointer(fillProgram.attribs.height, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.triIndices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, mesh.triIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    if (wireframeEnabled && mesh.lineIndices.length > 0) {
      gl.useProgram(wireProgram.program);
      gl.uniformMatrix4fv(wireProgram.uniforms.mvp, false, mvpMat);
      gl.uniform3f(wireProgram.uniforms.color, wireframeColor.r, wireframeColor.g, wireframeColor.b);
      gl.uniform1f(wireProgram.uniforms.alpha, 0.9);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wireProgram.attribs.position);
      gl.vertexAttribPointer(wireProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.lineIndices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.LINES, mesh.lineIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.DEPTH_TEST);
  };

  return { render };
}
