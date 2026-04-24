import { applyAdaptiveSmooth, clamp01 } from "./common.js";

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
  let peakCaps = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;
    const len = points.length;
    if (easedBars.length !== len) {
      easedBars = new Array(len).fill(0);
    }
    if (peakCaps.length !== len) {
      peakCaps = new Array(len).fill(0);
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
    const barWidth = (2 / len) * (widthPercent / 100) * gapScale;
    const barHalf = barWidth / 2;
    const mirrored = Boolean(styleConfig.mirrorEnabled);
    const headroomPercent = Math.max(0, Math.min(40, Number(styleConfig.headroomPercent) || 6));
    const topPaddingNdc = (headroomPercent / 100) * 2;
    const verticalRoom = Math.max(0.05, 2 - topPaddingNdc);
    const baseline = mirrored ? 0 : -1;
    const maxHeight = mirrored ? verticalRoom * 0.5 : verticalRoom;

    const vertices = new Float32Array(len * 12);
    const capVertices = new Float32Array(len * 12);
    const peakHoldEnabled = Boolean(styleConfig.peakHoldEnabled);
    const peakThicknessPx = Math.max(1, Math.min(8, Number(styleConfig.peakThickness) || 2));
    const capThicknessNdc = gl.canvas.height > 0 ? (2 / gl.canvas.height) * peakThicknessPx : 0.006;
    const capInset = barWidth * 0.16;
    const peakFallSpeed = Math.max(5, Math.min(120, Number(styleConfig.peakFallSpeed) || 35));
    const capFallNdc = (peakFallSpeed / 120) * 0.012;
    for (let i = 0; i < len; i++) {
      const centerX = ((i + 0.5) / len) * 2 - 1;
      const left = centerX - barHalf;
      const right = centerX + barHalf;
      const top = baseline + normalized[i] * maxHeight;
      const bottom = mirrored ? baseline - normalized[i] * maxHeight : baseline;
      const offset = i * 12;
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

      const nextCap = top > peakCaps[i] ? top : Math.max(top, peakCaps[i] - capFallNdc);
      peakCaps[i] = nextCap;
      const capTop = nextCap + capThicknessNdc * 0.5;
      const capBottom = nextCap - capThicknessNdc * 0.5;
      const capLeft = left + capInset;
      const capRight = right - capInset;
      capVertices[offset] = capLeft;
      capVertices[offset + 1] = capBottom;
      capVertices[offset + 2] = capLeft;
      capVertices[offset + 3] = capTop;
      capVertices[offset + 4] = capRight;
      capVertices[offset + 5] = capBottom;
      capVertices[offset + 6] = capLeft;
      capVertices[offset + 7] = capTop;
      capVertices[offset + 8] = capRight;
      capVertices[offset + 9] = capTop;
      capVertices[offset + 10] = capRight;
      capVertices[offset + 11] = capBottom;
    }

    gl.useProgram(program);
    gl.uniform3f(colorLoc, styleConfig.color.r, styleConfig.color.g, styleConfig.color.b);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, len * 6);

    if (peakHoldEnabled) {
      const capR = Math.min(1, styleConfig.color.r * 0.4 + 0.6);
      const capG = Math.min(1, styleConfig.color.g * 0.4 + 0.6);
      const capB = Math.min(1, styleConfig.color.b * 0.4 + 0.6);
      gl.uniform3f(colorLoc, capR, capG, capB);
      gl.bufferData(gl.ARRAY_BUFFER, capVertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, len * 6);
    }
  };

  return { render };
}
