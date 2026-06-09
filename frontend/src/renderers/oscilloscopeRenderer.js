import { createProgram } from "./shaderUtils.js";

export function createOscilloscopeRenderer(gl) {
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
  let phosphorState = null;

  const drawCurve = (ys, len, color, alpha, lineWidthPx, vertices) => {
    const canvasH = gl.canvas.height;
    const stepNdc = canvasH > 0 ? 2 / canvasH : 0;
    const passes = Math.max(1, Number(lineWidthPx) || 1);
    const half = (passes - 1) / 2;

    gl.uniform3f(colorLoc, color.r, color.g, color.b);
    gl.uniform1f(alphaLoc, alpha);

    for (let p = 0; p < passes; p++) {
      const yOff = (p - half) * stepNdc;
      for (let i = 0; i < len; i++) {
        vertices[i * 2] = len > 1 ? (i / (len - 1)) * 2 - 1 : 0;
        vertices[i * 2 + 1] = ys[i] + yOff;
      }
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINE_STRIP, 0, len);
    }
  };

  const render = (samples, _shapeConfig, styleConfig) => {
    if (!Array.isArray(samples) || samples.length <= 1) return;
    const len = samples.length;
    const color = styleConfig.color;
    const lineWidthPx = styleConfig.lineWidthPx;
    const phosphorEnabled = Boolean(styleConfig.phosphorEnabled);
    const phosphorDecay = Number(styleConfig.phosphorDecay) || 0.6;

    const currentYs = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const v = Number(samples[i]);
      currentYs[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    }

    if (phosphorEnabled) {
      if (!phosphorState || phosphorState.length !== len) {
        phosphorState = new Float32Array(len);
      }
      const keep = Math.max(0, Math.min(0.99, phosphorDecay));
      const blend = 1 - keep;
      for (let i = 0; i < len; i++) {
        phosphorState[i] = phosphorState[i] * keep + currentYs[i] * blend;
      }
    } else {
      phosphorState = null;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.lineWidth(1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const vertices = new Float32Array(len * 2);
    if (phosphorEnabled && phosphorState) {
      drawCurve(phosphorState, len, color, 0.5, lineWidthPx, vertices);
    }
    drawCurve(currentYs, len, color, 1, lineWidthPx, vertices);

    gl.disable(gl.BLEND);
  };

  return { render };
}
