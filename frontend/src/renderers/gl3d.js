import { createProgram } from "./shaderUtils.js";

/** @returns {Float32Array} 4×4 单位矩阵（列主序） */
export function createMat4() {
  const out = new Float32Array(16);
  identity(out);
  return out;
}

/** @param {Float32Array} out */
export function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * @param {Float32Array} out
 * @param {number} fovRad 垂直 FOV（弧度）
 * @param {number} aspect 宽高比
 * @param {number} near
 * @param {number} far
 */
export function perspective(out, fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
  return out;
}

/**
 * @param {Float32Array} out
 * @param {number[]} eye
 * @param {number[]} center
 * @param {number[]} up
 */
export function lookAt(out, eye, center, up) {
  const ex = eye[0];
  const ey = eye[1];
  const ez = eye[2];
  let zx = ex - center[0];
  let zy = ey - center[1];
  let zz = ez - center[2];
  let len = Math.hypot(zx, zy, zz);
  if (len < 1e-8) len = 1;
  zx /= len;
  zy /= len;
  zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len < 1e-8) len = 1;
  xx /= len;
  xy /= len;
  xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

/** @param {Float32Array} out @param {number} rad */
export function rotateY(out, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  identity(out);
  out[0] = c;
  out[2] = s;
  out[8] = -s;
  out[10] = c;
  return out;
}

/** @param {Float32Array} out @param {number} s */
export function scale(out, s) {
  identity(out);
  out[0] = s;
  out[5] = s;
  out[10] = s;
  return out;
}

/** @param {Float32Array} out @param {Float32Array} a @param {Float32Array} b */
export function multiply(out, a, b) {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];
  const a10 = a[4];
  const a11 = a[5];
  const a12 = a[6];
  const a13 = a[7];
  const a20 = a[8];
  const a21 = a[9];
  const a22 = a[10];
  const a23 = a[11];
  const a30 = a[12];
  const a31 = a[13];
  const a32 = a[14];
  const a33 = a[15];

  let b0 = b[0];
  let b1 = b[1];
  let b2 = b[2];
  let b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

/**
 * @param {{ distance?: number, fovDeg?: number, autoRotateSpeedDeg?: number }} [options]
 */
export function createCamera(options = {}) {
  let rotationY = 0;
  let lastTime = performance.now();

  return {
    tick(now = performance.now(), autoRotateEnabled = true, speedDeg = 6) {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (autoRotateEnabled) {
        rotationY += (speedDeg * Math.PI) / 180 * dt;
      }
      return dt;
    },

    getRotationY() {
      return rotationY;
    },

    resetTime(now = performance.now()) {
      lastTime = now;
    },

    /**
     * @param {Float32Array} out
     * @param {number} distance
     */
    getViewMatrix(out, distance = options.distance ?? 2.2) {
      const eye = [0, 0.22, distance];
      return lookAt(out, eye, [0, 0, 0], [0, 1, 0]);
    },

    /**
     * @param {Float32Array} out
     * @param {number} aspect
     * @param {number} [fovDeg]
     */
    getProjectionMatrix(out, aspect, fovDeg = options.fovDeg ?? 45) {
      const safeAspect = Math.max(0.01, aspect);
      return perspective(out, (fovDeg * Math.PI) / 180, safeAspect, 0.08, 50);
    },

    /** @param {Float32Array} out */
    getModelMatrix(out) {
      return rotateY(out, rotationY);
    },
  };
}

const BASIC_LIT_VS = `
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_mvp;
uniform mat4 u_model;
varying vec3 v_normal;
void main() {
  v_normal = mat3(u_model) * a_normal;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

const BASIC_LIT_FS = `
precision mediump float;
uniform vec3 u_color;
uniform vec3 u_lightDir;
varying vec3 v_normal;
void main() {
  vec3 n = normalize(v_normal);
  vec3 l = normalize(u_lightDir);
  float diff = max(dot(n, l), 0.0);
  float ambient = 0.35;
  vec3 lit = u_color * (ambient + diff * 0.65);
  gl_FragColor = vec4(lit, 1.0);
}
`;

const WIREFRAME_VS = `
attribute vec3 a_position;
uniform mat4 u_mvp;
void main() {
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

const WIREFRAME_FS = `
precision mediump float;
uniform vec3 u_color;
uniform float u_alpha;
void main() {
  gl_FragColor = vec4(u_color, u_alpha);
}
`;

/**
 * @param {WebGLRenderingContext} gl
 */
export function createBasicLitProgram(gl) {
  const program = createProgram(gl, BASIC_LIT_VS, BASIC_LIT_FS);
  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, "a_position"),
      normal: gl.getAttribLocation(program, "a_normal"),
    },
    uniforms: {
      mvp: gl.getUniformLocation(program, "u_mvp"),
      model: gl.getUniformLocation(program, "u_model"),
      color: gl.getUniformLocation(program, "u_color"),
      lightDir: gl.getUniformLocation(program, "u_lightDir"),
    },
  };
}

/**
 * @param {WebGLRenderingContext} gl
 */
export function createWireframeProgram(gl) {
  const program = createProgram(gl, WIREFRAME_VS, WIREFRAME_FS);
  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, "a_position"),
    },
    uniforms: {
      mvp: gl.getUniformLocation(program, "u_mvp"),
      color: gl.getUniformLocation(program, "u_color"),
      alpha: gl.getUniformLocation(program, "u_alpha"),
    },
  };
}
