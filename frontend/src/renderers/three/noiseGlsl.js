/**
 * glsl-noise 预打包：通过 Vite ?raw 导入，剥离 glslify pragma 后拼入 Three ShaderMaterial。
 * Phase 30~37 有机渐变 renderer 在 fragment shader 前 prepend 对应 chunk 即可。
 */
import simplex2dRaw from "glsl-noise/simplex/2d.glsl?raw";
import simplex3dRaw from "glsl-noise/simplex/3d.glsl?raw";
import classic3dRaw from "glsl-noise/classic/3d.glsl?raw";

/** @param {string} source */
function stripGlslifyPragma(source) {
  return source.replace(/#pragma\s+glslify:[^\n]*\n?/g, "").trim();
}

/** 2D Simplex noise（函数名 snoise(vec2) 或 snoise(vec3) 视文件而定） */
export const GLSL_NOISE_SIMPLEX_2D = stripGlslifyPragma(simplex2dRaw);

/** 3D Simplex noise（函数名 snoise(vec3)） */
export const GLSL_NOISE_SIMPLEX_3D = stripGlslifyPragma(simplex3dRaw);

/** 3D Classic Perlin noise（函数名 cnoise(vec3)） */
export const GLSL_NOISE_CLASSIC_3D = stripGlslifyPragma(classic3dRaw);

/** @typedef {'simplex2d' | 'simplex3d' | 'classic3d'} NoiseVariant */

/**
 * 将 noise chunk 拼接到 fragment shader 源码前部。
 * @param {string} fragmentShader
 * @param {NoiseVariant} [variant='simplex3d']
 */
export function prependNoiseGlsl(fragmentShader, variant = "simplex3d") {
  const chunk =
    variant === "simplex2d"
      ? GLSL_NOISE_SIMPLEX_2D
      : variant === "classic3d"
        ? GLSL_NOISE_CLASSIC_3D
        : GLSL_NOISE_SIMPLEX_3D;
  return `${chunk}\n\n${fragmentShader}`;
}

/**
 * 简易 3D fbm（依赖已 prepend 的 snoise(vec3)）。
 * 复制进 shader 或作为字符串注入。
 */
export const GLSL_FBM_SNOISE_3D = /* glsl */ `
float fbmSnoise3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}
`;
