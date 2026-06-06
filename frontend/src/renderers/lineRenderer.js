import { applyAdaptiveSmooth, clamp01 } from "./common.js";

export function createLineRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_lineColor;
void main() {
  gl_FragColor = vec4(u_lineColor, 1.0);
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
  const colorLoc = gl.getUniformLocation(program, "u_lineColor");
  const buffer = gl.createBuffer();
  let easedPoints = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length <= 1) return;
    const len = points.length;
    const ys = new Float32Array(len);
    if (easedPoints.length !== len) {
      easedPoints = new Array(len).fill(0);
    }
    const gain = Number(shapeConfig.gainPercent) / 100;
    const softGamma = 1 + (Number(shapeConfig.softClipPercent) / 100) * 1.6;
    const fallBlend = 0.08 + (1 - Number(shapeConfig.fallEasePercent) / 100) * 0.62;
    for (let i = 0; i < len; i++) {
      const raw = clamp01(points[i] * gain);
      const prev = easedPoints[i];
      const followed = raw >= prev ? raw : prev + (raw - prev) * fallBlend;
      easedPoints[i] = followed;
      const softened = Math.pow(followed, softGamma);
      ys[i] = (softened * 2 - 1) * 0.95;
    }

    applyAdaptiveSmooth(ys, shapeConfig.smoothPercent);

    const canvasH = gl.canvas.height;
    const stepNdc = canvasH > 0 ? 2 / canvasH : 0;
    const passes = Math.max(1, Number(styleConfig.lineWidthPx) || 1);
    const half = (passes - 1) / 2;
    const freqReversed = Boolean(styleConfig.freqReversed);

    const vertices = new Float32Array(len * 2);
    gl.useProgram(program);
    gl.uniform3f(colorLoc, styleConfig.color.r, styleConfig.color.g, styleConfig.color.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.lineWidth(1);

    for (let p = 0; p < passes; p++) {
      const yOff = (p - half) * stepNdc;
      for (let slot = 0; slot < len; slot++) {
        const freqIndex = freqReversed ? len - 1 - slot : slot;
        vertices[slot * 2] = (slot / (len - 1)) * 2 - 1;
        vertices[slot * 2 + 1] = ys[freqIndex] + yOff;
      }
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINE_STRIP, 0, len);
    }
  };

  return { render };
}
