import { clampPeakCapSpanAlongBar, minNdcForPixels } from "./common.js";
import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";

function writeRectVertices(vertices, offset, left, bottom, right, top, freqT) {
  const stride = 3;
  vertices[offset] = left;
  vertices[offset + 1] = bottom;
  vertices[offset + 2] = freqT;
  vertices[offset + stride] = left;
  vertices[offset + stride + 1] = top;
  vertices[offset + stride + 2] = freqT;
  vertices[offset + stride * 2] = right;
  vertices[offset + stride * 2 + 1] = bottom;
  vertices[offset + stride * 2 + 2] = freqT;
  vertices[offset + stride * 3] = left;
  vertices[offset + stride * 3 + 1] = top;
  vertices[offset + stride * 3 + 2] = freqT;
  vertices[offset + stride * 4] = right;
  vertices[offset + stride * 4 + 1] = top;
  vertices[offset + stride * 4 + 2] = freqT;
  vertices[offset + stride * 5] = right;
  vertices[offset + stride * 5 + 1] = bottom;
  vertices[offset + stride * 5 + 2] = freqT;
}

function writeCapVertices(vertices, offset, left, bottom, right, top) {
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

function updatePositivePeakCap(prev, current, fallNdc) {
  return current > prev ? current : Math.max(current, prev - fallNdc);
}

function updateNegativePeakCap(prev, current, fallNdc) {
  return current < prev ? current : Math.min(current, prev + fallNdc);
}

export function createGradientBarRenderer(gl) {
  const barVertexSource = `
attribute vec2 a_position;
attribute float a_freqT;
varying float v_freqT;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_freqT = a_freqT;
}
`;

  const barFragmentSource = `
precision mediump float;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
varying float v_freqT;
void main() {
  gl_FragColor = vec4(mix(u_colorLow, u_colorHigh, v_freqT), 1.0);
}
`;

  const capVertexSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const capFragmentSource = `
precision mediump float;
uniform vec3 u_color;
void main() {
  gl_FragColor = vec4(u_color, 1.0);
}
`;

  const barProgram = createProgram(gl, barVertexSource, barFragmentSource);
  const capProgram = createProgram(gl, capVertexSource, capFragmentSource);

  const barPosLoc = gl.getAttribLocation(barProgram, "a_position");
  const barFreqLoc = gl.getAttribLocation(barProgram, "a_freqT");
  const colorLowLoc = gl.getUniformLocation(barProgram, "u_colorLow");
  const colorHighLoc = gl.getUniformLocation(barProgram, "u_colorHigh");

  const capPosLoc = gl.getAttribLocation(capProgram, "a_position");
  const capColorLoc = gl.getUniformLocation(capProgram, "u_color");

  const buffer = gl.createBuffer();
  let easedBars = [];
  let peakCapsPos = [];
  let peakCapsNeg = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;
    const len = points.length;
    if (peakCapsPos.length !== len) {
      peakCapsPos = new Array(len).fill(0);
    }
    if (peakCapsNeg.length !== len) {
      peakCapsNeg = new Array(len).fill(0);
    }

    const normalized = processSpectrumPoints(points, shapeConfig, easedBars);

    const widthPercent = Math.max(20, Math.min(100, Number(styleConfig.widthPercent) || 76));
    const gapPercent = Math.max(0, Math.min(70, Number(styleConfig.gapPercent) || 18));
    const gapScale = 1 - gapPercent / 100;
    const barThickness = (2 / len) * (widthPercent / 100) * gapScale;
    const barHalf = barThickness / 2;
    const mirrored = Boolean(styleConfig.mirrorEnabled);
    const verticalLayout = styleConfig.orientation === "vertical";
    const headroomPercent = Math.max(0, Math.min(40, Number(styleConfig.headroomPercent) || 6));
    const endPaddingNdc = (headroomPercent / 100) * 2;
    const growthRoom = Math.max(0.05, 2 - endPaddingNdc);
    const baseline = mirrored ? 0 : -1;
    const maxExtent = mirrored ? growthRoom * 0.5 : growthRoom;

    const vertices = new Float32Array(len * 18);
    const peakHoldMode = styleConfig.peakHoldMode === "off"
      ? "off"
      : styleConfig.peakHoldMode === "both"
        ? "both"
        : "single";
    const drawPositivePeak = peakHoldMode === "single" || peakHoldMode === "both";
    const drawNegativePeak = peakHoldMode === "both" && mirrored;
    const capSlots = (drawPositivePeak ? 1 : 0) + (drawNegativePeak ? 1 : 0);
    const capVertices = capSlots > 0 ? new Float32Array(len * capSlots * 12) : null;
    const peakThicknessPx = Math.max(1, Math.min(8, Number(styleConfig.peakThickness) || 2));
    const capThicknessNdc = verticalLayout
      ? Math.max(minNdcForPixels(1, gl.canvas.width), (2 / Math.max(1, gl.canvas.width)) * peakThicknessPx)
      : Math.max(minNdcForPixels(1, gl.canvas.height), (2 / Math.max(1, gl.canvas.height)) * peakThicknessPx);
    const minCapSpanNdc = verticalLayout
      ? minNdcForPixels(1, gl.canvas.height)
      : minNdcForPixels(1, gl.canvas.width);
    const peakFallSpeed = Math.max(5, Math.min(120, Number(styleConfig.peakFallSpeed) || 35));
    const capFallNdc = (peakFallSpeed / 120) * 0.012;
    const freqReversed = Boolean(styleConfig.freqReversed);
    const freqDenom = Math.max(1, len - 1);
    let capWriteIndex = 0;

    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      const freqT = freqIndex / freqDenom;
      const extent = normalized[freqIndex] * maxExtent;
      const offset = slot * 18;
      let left;
      let right;
      let bottom;
      let top;
      let positivePeakPos;
      let negativePeakPos = null;

      if (verticalLayout) {
        const centerY = ((slot + 0.5) / len) * 2 - 1;
        bottom = centerY - barHalf;
        top = centerY + barHalf;
        right = baseline + extent;
        left = mirrored ? baseline - extent : baseline;
        positivePeakPos = right;
        if (mirrored) {
          negativePeakPos = left;
        }
      } else {
        const centerX = ((slot + 0.5) / len) * 2 - 1;
        left = centerX - barHalf;
        right = centerX + barHalf;
        top = baseline + extent;
        bottom = mirrored ? baseline - extent : baseline;
        positivePeakPos = top;
        if (mirrored) {
          negativePeakPos = bottom;
        }
      }

      writeRectVertices(vertices, offset, left, bottom, right, top, freqT);

      if (drawPositivePeak) {
        peakCapsPos[freqIndex] = updatePositivePeakCap(
          peakCapsPos[freqIndex],
          positivePeakPos,
          capFallNdc,
        );
      }
      if (drawNegativePeak && negativePeakPos != null) {
        peakCapsNeg[freqIndex] = updateNegativePeakCap(
          peakCapsNeg[freqIndex],
          negativePeakPos,
          capFallNdc,
        );
      }

      const writeCapAt = (peakPos, isVerticalCap) => {
        const capOffset = capWriteIndex * 12;
        capWriteIndex += 1;
        let capLeft;
        let capRight;
        let capBottom;
        let capTop;
        if (isVerticalCap) {
          capRight = peakPos + capThicknessNdc * 0.5;
          capLeft = peakPos - capThicknessNdc * 0.5;
          [capBottom, capTop] = clampPeakCapSpanAlongBar(bottom, top, minCapSpanNdc);
        } else {
          capTop = peakPos + capThicknessNdc * 0.5;
          capBottom = peakPos - capThicknessNdc * 0.5;
          [capLeft, capRight] = clampPeakCapSpanAlongBar(left, right, minCapSpanNdc);
        }
        writeCapVertices(capVertices, capOffset, capLeft, capBottom, capRight, capTop);
      };

      if (capVertices) {
        if (drawPositivePeak) {
          writeCapAt(peakCapsPos[freqIndex], verticalLayout);
        }
        if (drawNegativePeak && negativePeakPos != null) {
          writeCapAt(peakCapsNeg[freqIndex], verticalLayout);
        }
      }
    }

    const colorLow = styleConfig.colorLow;
    const colorHigh = styleConfig.colorHigh;

    gl.useProgram(barProgram);
    gl.uniform3f(colorLowLoc, colorLow.r, colorLow.g, colorLow.b);
    gl.uniform3f(colorHighLoc, colorHigh.r, colorHigh.g, colorHigh.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    const stride = 12;
    gl.enableVertexAttribArray(barPosLoc);
    gl.vertexAttribPointer(barPosLoc, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(barFreqLoc);
    gl.vertexAttribPointer(barFreqLoc, 1, gl.FLOAT, false, stride, 8);
    gl.drawArrays(gl.TRIANGLES, 0, len * 6);

    if (capVertices && capWriteIndex > 0) {
      const peakColor = styleConfig.peakColor ?? colorHigh;
      gl.useProgram(capProgram);
      gl.uniform3f(capColorLoc, peakColor.r, peakColor.g, peakColor.b);
      gl.enableVertexAttribArray(capPosLoc);
      gl.vertexAttribPointer(capPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bufferData(gl.ARRAY_BUFFER, capVertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, capWriteIndex * 6);
    }
  };

  return { render };
}
