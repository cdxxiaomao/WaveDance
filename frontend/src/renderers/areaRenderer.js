import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";

function slotX(slot, len) {
  return (slot / (len - 1)) * 2 - 1;
}

export function createAreaRenderer(gl) {
  const fillVertexSource = `
attribute vec2 a_position;
attribute float a_height;
varying float v_height;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_height = a_height;
}
`;

  const fillFragmentSource = `
precision mediump float;
uniform vec3 u_fillColor;
uniform float u_fillAlpha;
uniform float u_gradientEnabled;
varying float v_height;
void main() {
  vec3 color = u_fillColor;
  if (u_gradientEnabled > 0.5) {
    color = u_fillColor * (0.35 + 0.65 * v_height);
  }
  gl_FragColor = vec4(color, u_fillAlpha);
}
`;

  const lineVertexSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const lineFragmentSource = `
precision mediump float;
uniform vec3 u_lineColor;
void main() {
  gl_FragColor = vec4(u_lineColor, 1.0);
}
`;

  const fillProgram = createProgram(gl, fillVertexSource, fillFragmentSource);
  const lineProgram = createProgram(gl, lineVertexSource, lineFragmentSource);

  const fillPosLoc = gl.getAttribLocation(fillProgram, "a_position");
  const fillHeightLoc = gl.getAttribLocation(fillProgram, "a_height");
  const fillColorLoc = gl.getUniformLocation(fillProgram, "u_fillColor");
  const fillAlphaLoc = gl.getUniformLocation(fillProgram, "u_fillAlpha");
  const fillGradientLoc = gl.getUniformLocation(fillProgram, "u_gradientEnabled");

  const linePosLoc = gl.getAttribLocation(lineProgram, "a_position");
  const lineColorLoc = gl.getUniformLocation(lineProgram, "u_lineColor");

  const fillBuffer = gl.createBuffer();
  const lineBuffer = gl.createBuffer();
  let easedPoints = [];

  const writeFillVertex = (data, index, x, y, height) => {
    const o = index * 3;
    data[o] = x;
    data[o + 1] = y;
    data[o + 2] = height;
  };

  const buildFillStrip = (len, ys, freqReversed, baseline, mapY) => {
    const data = new Float32Array(len * 2 * 3);
    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      const x = slotX(slot, len);
      const curveY = mapY(ys[freqIndex]);
      writeFillVertex(data, slot * 2, x, baseline, 0);
      writeFillVertex(data, slot * 2 + 1, x, curveY, 1);
    }
    return data;
  };

  const drawFillStrip = (data, vertCount) => {
    gl.useProgram(fillProgram);
    gl.uniform3f(fillColorLoc, styleFillColor.r, styleFillColor.g, styleFillColor.b);
    gl.uniform1f(fillAlphaLoc, styleFillAlpha);
    gl.uniform1f(fillGradientLoc, styleGradientEnabled ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, fillBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(fillPosLoc);
    gl.vertexAttribPointer(fillPosLoc, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(fillHeightLoc);
    gl.vertexAttribPointer(fillHeightLoc, 1, gl.FLOAT, false, 12, 8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
  };

  let styleFillColor = { r: 0, g: 0, b: 0 };
  let styleFillAlpha = 0.45;
  let styleGradientEnabled = true;
  let styleLineColor = { r: 0, g: 0, b: 0 };

  const drawLineStrip = (len, ys, freqReversed, mapY, lineWidthPx) => {
    const canvasH = gl.canvas.height;
    const stepNdc = canvasH > 0 ? 2 / canvasH : 0;
    const passes = Math.max(1, Number(lineWidthPx) || 1);
    const half = (passes - 1) / 2;
    const vertices = new Float32Array(len * 2);

    gl.useProgram(lineProgram);
    gl.uniform3f(lineColorLoc, styleLineColor.r, styleLineColor.g, styleLineColor.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.enableVertexAttribArray(linePosLoc);
    gl.vertexAttribPointer(linePosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.lineWidth(1);

    for (let p = 0; p < passes; p++) {
      const yOff = (p - half) * stepNdc;
      for (let slot = 0; slot < len; slot++) {
        const freqIndex = freqReversed ? len - 1 - slot : slot;
        vertices[slot * 2] = slotX(slot, len);
        vertices[slot * 2 + 1] = mapY(ys[freqIndex]) + yOff;
      }
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINE_STRIP, 0, len);
    }
  };

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length <= 1) return;
    const len = points.length;
    const ys = processSpectrumPoints(points, shapeConfig, easedPoints, { mapToNdcLine: true });

    styleFillColor = styleConfig.fillColor;
    styleFillAlpha = Math.max(0, Math.min(1, Number(styleConfig.fillAlpha) || 0));
    styleGradientEnabled = Boolean(styleConfig.gradientEnabled);
    styleLineColor = styleConfig.lineColor;

    const mirrored = Boolean(styleConfig.mirrorEnabled);
    const freqReversed = Boolean(styleConfig.freqReversed);

    const ampY = (y) => ((y + 0.95) / 1.9) * 0.95;
    const identityY = (y) => y;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (mirrored) {
      const upper = buildFillStrip(len, ys, freqReversed, 0, ampY);
      drawFillStrip(upper, len * 2);
      const lower = buildFillStrip(len, ys, freqReversed, 0, (y) => -ampY(y));
      drawFillStrip(lower, len * 2);
      drawLineStrip(len, ys, freqReversed, ampY, styleConfig.lineWidthPx);
      drawLineStrip(len, ys, freqReversed, (y) => -ampY(y), styleConfig.lineWidthPx);
    } else {
      const fill = buildFillStrip(len, ys, freqReversed, -1, identityY);
      drawFillStrip(fill, len * 2);
      drawLineStrip(len, ys, freqReversed, identityY, styleConfig.lineWidthPx);
    }

    gl.disable(gl.BLEND);
  };

  return { render };
}
