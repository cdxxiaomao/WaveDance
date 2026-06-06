import { applyAdaptiveSmooth, clamp01, clampPeakCapSpanAlongBar, minNdcForPixels } from "./common.js";

function writeRectVertices(vertices, offset, left, bottom, right, top) {
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

export function createBarRenderer(gl) {
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

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  const createProgram = () => {
    const vShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  };

  const program = createProgram();
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "u_barColor");
  const buffer = gl.createBuffer();
  let easedBars = [];
  let peakCapsPos = [];
  let peakCapsNeg = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;
    const len = points.length;
    if (easedBars.length !== len) {
      easedBars = new Array(len).fill(0);
    }
    if (peakCapsPos.length !== len) {
      peakCapsPos = new Array(len).fill(0);
    }
    if (peakCapsNeg.length !== len) {
      peakCapsNeg = new Array(len).fill(0);
    }

    const normalized = new Float32Array(len);
    const gain = Number(shapeConfig.gainPercent) / 100;
    const softGamma = 1 + (Number(shapeConfig.softClipPercent) / 100) * 1.6;
    const fallBlend = 0.08 + (1 - Number(shapeConfig.fallEasePercent) / 100) * 0.62;
    for (let i = 0; i < len; i++) {
      const raw = clamp01(points[i] * gain);
      const prev = easedBars[i];
      const followed = raw >= prev ? raw : prev + (raw - prev) * fallBlend;
      easedBars[i] = followed;
      normalized[i] = Math.pow(followed, softGamma);
    }
    applyAdaptiveSmooth(normalized, shapeConfig.smoothPercent);

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

    const vertices = new Float32Array(len * 12);
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
    let capWriteIndex = 0;
    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      const extent = normalized[freqIndex] * maxExtent;
      const offset = slot * 12;
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

      writeRectVertices(vertices, offset, left, bottom, right, top);

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
        writeRectVertices(capVertices, capOffset, capLeft, capBottom, capRight, capTop);
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

    gl.useProgram(program);
    gl.uniform3f(colorLoc, styleConfig.color.r, styleConfig.color.g, styleConfig.color.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, len * 6);

    if (capVertices && capWriteIndex > 0) {
      const peakColor = styleConfig.peakColor ?? styleConfig.color;
      gl.uniform3f(colorLoc, peakColor.r, peakColor.g, peakColor.b);
      gl.bufferData(gl.ARRAY_BUFFER, capVertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, capWriteIndex * 6);
    }
  };

  return { render };
}
