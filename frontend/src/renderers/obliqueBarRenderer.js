import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { aggregateBands } from "./bandAggregate.js";

function writeRectVertices(vertices, offset, left, bottom, right, top, depthT) {
  const corners = [
    [left, bottom],
    [left, top],
    [right, bottom],
    [left, top],
    [right, top],
    [right, bottom],
  ];
  for (let i = 0; i < 6; i++) {
    const base = offset + i * 3;
    vertices[base] = corners[i][0];
    vertices[base + 1] = corners[i][1];
    vertices[base + 2] = depthT;
  }
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

export function createObliqueBarRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
attribute float a_depthT;
varying float v_depthT;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_depthT = a_depthT;
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_colorNear;
uniform vec3 u_colorFar;
uniform float u_farBright;
varying float v_depthT;
void main() {
  vec3 color = mix(u_colorFar, u_colorNear, v_depthT);
  float bright = mix(u_farBright, 1.0, v_depthT);
  gl_FragColor = vec4(color * bright, 1.0);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const depthLoc = gl.getAttribLocation(program, "a_depthT");
  const colorNearLoc = gl.getUniformLocation(program, "u_colorNear");
  const colorFarLoc = gl.getUniformLocation(program, "u_colorFar");
  const farBrightLoc = gl.getUniformLocation(program, "u_farBright");
  const buffer = gl.createBuffer();
  let easedBars = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const normalized = processSpectrumPoints(points, shapeConfig, easedBars);
    const displayBarCount = Math.max(0, Math.min(128, Math.round(Number(styleConfig.displayBarCount) || 0)));
    const amps =
      displayBarCount > 0 ? aggregateBands(normalized, displayBarCount) : normalized;
    const len = amps.length;
    if (len === 0) return;

    const widthPercent = Math.max(20, Math.min(100, Number(styleConfig.widthPercent) || 76));
    const gapPercent = Math.max(0, Math.min(70, Number(styleConfig.gapPercent) || 18));
    const gapScale = 1 - gapPercent / 100;
    const barThickness = (2 / len) * (widthPercent / 100) * gapScale;
    const mirrored = Boolean(styleConfig.mirrorEnabled);
    const headroomPercent = Math.max(0, Math.min(40, Number(styleConfig.headroomPercent) || 8));
    const endPaddingNdc = (headroomPercent / 100) * 2;
    const growthRoom = Math.max(0.05, 2 - endPaddingNdc);
    const maxExtent = mirrored ? growthRoom * 0.5 : growthRoom;

    const tiltDeg = Math.max(30, Math.min(70, Number(styleConfig.tiltDeg) || 55));
    const tiltNorm = (tiltDeg - 30) / 40;
    const farScale = mix(0.32, 0.48, tiltNorm);
    const nearY = mix(-0.88, -0.78, tiltNorm);
    const farY = mix(0.35, 0.55, tiltNorm);
    const farBright = mix(0.45, 0.65, tiltNorm);

    const freqReversed = Boolean(styleConfig.freqReversed);
    const showGroundLine = Boolean(styleConfig.showGroundLine);

    const barVerts = new Float32Array(len * 18);
    let groundVerts = null;

    if (showGroundLine) {
      const farSlot = freqReversed ? len - 1 : 0;
      const nearSlot = freqReversed ? 0 : len - 1;
      const farT = len > 1 ? farSlot / (len - 1) : 0;
      const nearT = len > 1 ? nearSlot / (len - 1) : 1;
      const farX = len > 1 ? ((farSlot + 0.5) / len) * 2 - 1 : -1;
      const nearX = len > 1 ? ((nearSlot + 0.5) / len) * 2 - 1 : 1;
      const farYBase = mix(farY, nearY, farT);
      const nearYBase = mix(farY, nearY, nearT);
      groundVerts = new Float32Array([
        farX, farYBase, farT,
        nearX, nearYBase, nearT,
      ]);
    }

    for (let slot = 0; slot < len; slot++) {
      const depthSlot = freqReversed ? len - 1 - slot : slot;
      const t = len > 1 ? depthSlot / (len - 1) : 0;
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      const scale = mix(farScale, 1, t);
      const yBase = mix(farY, nearY, t);
      const extent = amps[freqIndex] * maxExtent * scale;
      const centerX = ((slot + 0.5) / len) * 2 - 1;
      const barHalf = (barThickness * scale) / 2;
      const left = centerX - barHalf;
      const right = centerX + barHalf;

      let bottom;
      let top;
      if (mirrored) {
        bottom = yBase - extent;
        top = yBase + extent;
      } else {
        bottom = yBase;
        top = yBase + extent;
      }

      writeRectVertices(barVerts, slot * 18, left, bottom, right, top, t);
    }

    gl.useProgram(program);
    gl.uniform3f(
      colorNearLoc,
      styleConfig.colorNear.r,
      styleConfig.colorNear.g,
      styleConfig.colorNear.b,
    );
    gl.uniform3f(
      colorFarLoc,
      styleConfig.colorFar.r,
      styleConfig.colorFar.g,
      styleConfig.colorFar.b,
    );
    gl.uniform1f(farBrightLoc, farBright);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.enableVertexAttribArray(depthLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 12, 0);
    gl.vertexAttribPointer(depthLoc, 1, gl.FLOAT, false, 12, 8);

    if (groundVerts) {
      gl.bufferData(gl.ARRAY_BUFFER, groundVerts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, 2);
    }

    gl.bufferData(gl.ARRAY_BUFFER, barVerts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, len * 6);
  };

  return { render };
}
