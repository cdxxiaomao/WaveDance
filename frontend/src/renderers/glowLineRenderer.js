import { createProgram } from "./shaderUtils.js";
import { processSpectrumPoints } from "./shapePipeline.js";

export function createGlowLineRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_lineColor;
uniform float u_alpha;
void main() {
  gl_FragColor = vec4(u_lineColor, u_alpha);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "u_lineColor");
  const alphaLoc = gl.getUniformLocation(program, "u_alpha");
  const buffer = gl.createBuffer();
  let easedPoints = [];

  const fillVertices = (vertices, len, ys, freqReversed, yOff) => {
    for (let slot = 0; slot < len; slot++) {
      const freqIndex = freqReversed ? len - 1 - slot : slot;
      vertices[slot * 2] = (slot / (len - 1)) * 2 - 1;
      vertices[slot * 2 + 1] = ys[freqIndex] + yOff;
    }
  };

  const drawLineStrip = (vertices, len, color, alpha) => {
    gl.uniform3f(colorLoc, color.r, color.g, color.b);
    gl.uniform1f(alphaLoc, alpha);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINE_STRIP, 0, len);
  };

  const drawWidthPasses = (vertices, len, ys, freqReversed, stepNdc, passCount, color, alpha) => {
    const passes = Math.max(1, passCount);
    const half = (passes - 1) / 2;
    for (let p = 0; p < passes; p++) {
      const yOff = (p - half) * stepNdc;
      fillVertices(vertices, len, ys, freqReversed, yOff);
      drawLineStrip(vertices, len, color, alpha);
    }
  };

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length <= 1) return;

    const len = points.length;
    const ys = processSpectrumPoints(points, shapeConfig, easedPoints, { mapToNdcLine: true });

    let maxY = -Infinity;
    for (let i = 0; i < len; i++) {
      if (ys[i] > maxY) maxY = ys[i];
    }
    if (maxY < -0.94) return;

    const canvasH = gl.canvas.height;
    const stepNdc = canvasH > 0 ? 2 / canvasH : 0;
    const coreWidthPx = Math.max(1, Number(styleConfig.lineWidthPx) || 1);
    const glowRadiusPx = Math.max(0, Math.min(24, Number(styleConfig.glowRadiusPx) || 0));
    const glowIntensity = Math.max(0, Math.min(1, Number(styleConfig.glowIntensity) || 0));
    const glowPasses = Math.max(2, Math.min(6, Number(styleConfig.glowPasses) || 4));
    const freqReversed = Boolean(styleConfig.freqReversed);
    const coreColor = styleConfig.coreColor;
    const glowColor = styleConfig.glowColor;

    const vertices = new Float32Array(len * 2);

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.lineWidth(1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (glowIntensity > 0 && glowRadiusPx > 0) {
      for (let layer = glowPasses; layer >= 1; layer--) {
        const layerT = layer / glowPasses;
        const extraWidth = Math.max(1, Math.round(layerT * glowRadiusPx));
        const passWidth = coreWidthPx + extraWidth * 2;
        const alpha = glowIntensity * (1 - layerT * 0.82) * 0.42;
        drawWidthPasses(vertices, len, ys, freqReversed, stepNdc, passWidth, glowColor, alpha);
      }
    }

    drawWidthPasses(vertices, len, ys, freqReversed, stepNdc, coreWidthPx, coreColor, 1);
  };

  return { render };
}
