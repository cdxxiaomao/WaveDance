/**
 * Phase 29 验收用 sandbox renderer — 不注册 UI，仅供验证 raymarchHelpers + noiseGlsl + chromatic。
 * Phase 30+ 可删除或保留作开发参考。
 */
import * as THREE from "three";
import {
  MARCH_STEPS,
  GLSL_SMIN,
  GLSL_CALC_NORMAL,
  RAYMARCH_VERTEX,
  createRaymarchUniforms,
  createFullscreenQuadScene,
  updateSpectrumUniforms,
  syncRaymarchResolution,
} from "./raymarchHelpers.js";
import { prependNoiseGlsl, GLSL_FBM_SNOISE_3D } from "./noiseGlsl.js";
import { createChromaticComposer, disposeComposer } from "./postProcessing.js";

const FRAGMENT = prependNoiseGlsl(/* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2 u_resolution;

varying vec2 vUv;

${GLSL_SMIN}

${GLSL_FBM_SNOISE_3D}

float mapScene(vec3 p) {
  float warp = fbmSnoise3(p * 1.6 + u_time * 0.15) * 0.18 * (1.0 + u_bass * 0.5);
  vec3 q = p + vec3(warp, warp * 0.6, warp * 0.4);
  float sphere = length(q) - (0.72 + u_bass * 0.12);
  float bubble = length(q - vec3(0.35, sin(u_time * 0.7) * 0.25, 0.0)) - 0.28;
  return smin(sphere, bubble, 0.18);
}

${GLSL_CALC_NORMAL}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.0, 2.6);
  vec3 rd = normalize(vec3(uv, -1.5));

  float t = 0.0;
  float hit = -1.0;
  vec3 p;

  for (int i = 0; i < ${MARCH_STEPS}; i++) {
    p = ro + rd * t;
    float d = mapScene(p);
    if (d < 0.0015) {
      hit = t;
      break;
    }
    t += d * 0.92;
    if (t > 6.0) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);
  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.2);
  vec3 col = mix(vec3(0.45, 0.35, 0.95), vec3(0.95, 0.4, 0.75), clamp(0.5 + p.y * 0.6 + u_mid * 0.3, 0.0, 1.0));
  col *= 0.65 + 0.35 * dot(n, normalize(vec3(0.2, 0.9, 0.4)));
  col += fresnel * vec3(0.25, 0.35, 0.55) * (1.0 + u_treble * 0.4);

  float alpha = clamp(0.7 + fresnel * 0.25 + u_bass * 0.1, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`);

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createPhase29SandboxRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const uniforms = createRaymarchUniforms();
  const { quad, dispose: disposeQuad } = createFullscreenQuadScene(scene, {
    vertexShader: RAYMARCH_VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
  });

  const spectrumState = { bass: 0, mid: 0, treble: 0 };
  const clock = new THREE.Clock(true);
  let elapsed = 0;

  const { composer } = createChromaticComposer(renderer, scene, camera, {
    offset: 0.008,
    bloomStrength: 0.75,
  });
  syncRaymarchResolution(renderer, uniforms, composer);

  function render(_points, _shapeConfig, _styleConfig, _frameMeta, spectrum) {
    const dt = clock.getDelta();
    elapsed += dt > 0 ? dt : 1 / 60;
    uniforms.u_time.value = elapsed;
    updateSpectrumUniforms(uniforms, spectrum, spectrumState);
    syncRaymarchResolution(renderer, uniforms, composer);

    renderer.setClearColor(0x000000, 0);
    composer.render();
  }

  function dispose() {
    disposeComposer(composer);
    disposeQuad();
    clock.stop();
  }

  return { render, dispose };
}
