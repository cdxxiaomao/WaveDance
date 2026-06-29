import * as THREE from "three";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";

const COVER_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const COVER_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uCoverTex;
uniform sampler2D uPrevCoverTex;
uniform float uColorMixT;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec4 prev = texture2D(uPrevCoverTex, vUv);
  vec4 cur = texture2D(uCoverTex, vUv);
  vec4 col = mix(prev, cur, clamp(uColorMixT, 0.0, 1.0));

  vec2 p = vUv - 0.5;
  float corner = 0.46;
  float roundMask = smoothstep(corner, corner - 0.045, max(abs(p.x), abs(p.y)));
  float alpha = col.a * uOpacity * roundMask;

  vec3 rim = vec3(1.0) * pow(1.0 - roundMask, 2.0) * 0.12;
  gl_FragColor = vec4(col.rgb + rim, alpha);
}
`;

/** @type {THREE.DataTexture} */
let fallbackTex = null;

function getFallbackTexture() {
  if (fallbackTex) return fallbackTex;
  const data = new Uint8Array([32, 32, 48, 255]);
  fallbackTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  fallbackTex.needsUpdate = true;
  return fallbackTex;
}

/**
 * @param {typeof DEFAULT_CONFIG.threeSoundField} [cfg]
 */
export function createSoundFieldCoverPlane(cfg = DEFAULT_CONFIG.threeSoundField) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uniforms = {
    uCoverTex: { value: getFallbackTexture() },
    uPrevCoverTex: { value: getFallbackTexture() },
    uColorMixT: { value: 1 },
    uOpacity: { value: cfg.coverOpacity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: COVER_VERTEX,
    fragmentShader: COVER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = cfg.coverHeight;
  mesh.renderOrder = 3;
  mesh.visible = false;

  /**
   * @param {import('../coverTextureLoader.js').ReturnType<typeof import('../coverTextureLoader.js').createCoverTextureLoader>['getTextures'] extends () => infer R ? R : never} coverTextures
   * @param {{ coverEnabled?: boolean, coverSize?: number, coverHeight?: number, coverOpacity?: number }} opts
   */
  function update(coverTextures, opts = {}) {
    const enabled = opts.coverEnabled !== undefined ? Boolean(opts.coverEnabled) : cfg.coverEnabled;
    const size = clampFloat(opts.coverSize, 1.2, 4.5, cfg.coverSize);
    const height = clampFloat(opts.coverHeight, 2.5, 7, cfg.coverHeight);
    const opacity = clampFloat(opts.coverOpacity, 0.2, 1, cfg.coverOpacity);

    const tex = coverTextures ?? {};
    const hasCover = Boolean(tex.hasCover && tex.coverTex);
    mesh.visible = enabled && hasCover;
    mesh.scale.set(size, size, 1);
    mesh.position.y = height;
    uniforms.uOpacity.value = opacity;

    if (hasCover) {
      uniforms.uCoverTex.value = tex.coverTex;
      uniforms.uPrevCoverTex.value = tex.prevCoverTex ?? tex.coverTex;
      uniforms.uColorMixT.value = tex.colorMixT ?? 1;
    }
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, dispose };
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
