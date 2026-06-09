import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { getAspectScale, polarToNdc, slotAngleRange } from "./polar.js";

function writeTriangleVertices(vertices, offset, ax, ay, bx, by, cx, cy) {
  vertices[offset] = ax;
  vertices[offset + 1] = ay;
  vertices[offset + 2] = bx;
  vertices[offset + 3] = by;
  vertices[offset + 4] = cx;
  vertices[offset + 5] = cy;
}

export function createRadialRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_barColor;
void main() {
  gl_FragColor = vec4(u_barColor, 1.0);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "u_barColor");
  const buffer = gl.createBuffer();
  let easedBars = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const len = points.length;
    const normalized = processSpectrumPoints(points, shapeConfig, easedBars, { circular: true });

    let maxAmp = 0;
    for (let i = 0; i < len; i++) {
      if (normalized[i] > maxAmp) maxAmp = normalized[i];
    }
    if (maxAmp < 0.002) return;

    const canvasW = gl.canvas.width;
    const canvasH = gl.canvas.height;
    const aspectScale = getAspectScale(canvasW, canvasH);

    const innerPercent = Math.max(0, Math.min(80, Number(styleConfig.innerRadiusPercent) || 25));
    let outerPercent = Math.max(0, Math.min(95, Number(styleConfig.outerRadiusPercent) || 90));
    if (outerPercent <= innerPercent) {
      outerPercent = Math.min(95, innerPercent + 5);
    }

    const innerR = innerPercent / 100;
    const outerR = outerPercent / 100;
    const mirrored = Boolean(styleConfig.mirrorEnabled);
    const freqReversed = Boolean(styleConfig.freqReversed);
    const rotationOffsetDeg = Number(styleConfig.rotationOffsetDeg) || 0;
    const clockwise = styleConfig.clockwise !== false;
    const barThicknessPercent = Math.max(10, Math.min(100, Number(styleConfig.barThicknessPercent) || 70));
    const barColor = styleConfig.barColor;

    const polarOpts = {
      freqReversed,
      rotationOffsetDeg,
      clockwise,
      barThicknessPercent,
    };

    const vertices = new Float32Array(len * 18);
    let writeOffset = 0;

    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      const amp = normalized[freqIndex];
      if (amp <= 0.001) continue;

      const { start, end } = slotAngleRange(slot, len, polarOpts);
      let rInnerBar;
      let rOuterBar;

      if (mirrored) {
        const midR = (innerR + outerR) * 0.5;
        const halfExtent = amp * (outerR - innerR) * 0.5;
        rInnerBar = Math.max(0, midR - halfExtent);
        rOuterBar = midR + halfExtent;
      } else {
        rInnerBar = innerR;
        rOuterBar = innerR + amp * (outerR - innerR);
      }

      const pInnerStart = polarToNdc(start, rInnerBar, aspectScale);
      const pInnerEnd = polarToNdc(end, rInnerBar, aspectScale);
      const pOuterStart = polarToNdc(start, rOuterBar, aspectScale);
      const pOuterEnd = polarToNdc(end, rOuterBar, aspectScale);

      writeTriangleVertices(
        vertices,
        writeOffset,
        pInnerStart.x,
        pInnerStart.y,
        pInnerEnd.x,
        pInnerEnd.y,
        pOuterEnd.x,
        pOuterEnd.y,
      );
      writeOffset += 6;
      writeTriangleVertices(
        vertices,
        writeOffset,
        pInnerStart.x,
        pInnerStart.y,
        pOuterEnd.x,
        pOuterEnd.y,
        pOuterStart.x,
        pOuterStart.y,
      );
      writeOffset += 6;
    }

    if (writeOffset === 0) return;

    gl.useProgram(program);
    gl.uniform3f(colorLoc, barColor.r, barColor.g, barColor.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, writeOffset), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, writeOffset / 2);
  };

  return { render };
}
