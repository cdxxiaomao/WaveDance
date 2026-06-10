import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const PLASMA_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PLASMA_FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
uniform float u_noiseScale;
uniform float u_reactiveness;
uniform vec2 u_resolution;

varying vec2 vUv;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.853735475937459 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float plasmaLayer(vec2 p, float t, float react) {
  float n1 = snoise(p + vec2(t * 0.31, t * 0.17));
  float n2 = snoise(p * 1.7 - vec2(t * 0.22, t * 0.41) + react);
  float n3 = sin(p.x * 3.0 + t + react * 2.0) + sin(p.y * 2.5 - t * 0.8 + u_bass * 4.0);
  return (n1 + n2 + n3 * 0.35) / 2.35;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * u_noiseScale;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float react = u_reactiveness * (0.25 + u_bass * 0.55 + u_mid * 0.35 + u_treble * 0.25);
  float t = u_time;

  float field = plasmaLayer(p, t, react);
  field += plasmaLayer(p * 2.1 + react, t * 1.3, react * 0.5) * 0.45;
  field = field * 0.5 + 0.5;

  float hueShift = u_mid * 0.35 + u_treble * 0.25;
  vec3 col = mix(u_colorLow, u_colorHigh, clamp(field + hueShift, 0.0, 1.0));
  col *= 0.75 + 0.55 * field + u_bass * 0.35;

  float alpha = clamp(0.35 + field * 0.55 + u_mid * 0.25, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/** @param {string} hex */
function hexToColor(hex) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : DEFAULT_CONFIG.threePlasmaField.colorLow;
  return new THREE.Color(safe);
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createPlasmaFieldRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_treble: { value: 0 },
    u_colorLow: { value: hexToColor(DEFAULT_CONFIG.threePlasmaField.colorLow) },
    u_colorHigh: { value: hexToColor(DEFAULT_CONFIG.threePlasmaField.colorHigh) },
    u_noiseScale: { value: DEFAULT_CONFIG.threePlasmaField.noiseScale },
    u_reactiveness: { value: DEFAULT_CONFIG.threePlasmaField.reactiveness / 100 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PLASMA_VERTEX,
    fragmentShader: PLASMA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threePlasmaField.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threePlasmaField.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.15,
        luminanceSmoothing: 0.4,
        mipmapBlur: true,
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  rebuildComposer();

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
    uniforms.u_resolution.value.set(size.x, size.y);
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const speed = Number(style.speed) || DEFAULT_CONFIG.threePlasmaField.speed;
    const noiseScale = Number(style.noiseScale) || DEFAULT_CONFIG.threePlasmaField.noiseScale;
    const reactiveness = Number(style.reactiveness);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined
        ? Boolean(style.bloomEnabled)
        : DEFAULT_CONFIG.threePlasmaField.bloomEnabled;
    const nextBloomStrength =
      Number(style.bloomStrength) || DEFAULT_CONFIG.threePlasmaField.bloomStrength;

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    elapsed += (dt > 0 ? dt : 1 / 60) * speed;
    uniforms.u_time.value = elapsed;
    uniforms.u_bass.value = spectrum?.bass ?? 0;
    uniforms.u_mid.value = spectrum?.mid ?? 0;
    uniforms.u_treble.value = spectrum?.treble ?? 0;
    uniforms.u_noiseScale.value = noiseScale;
    uniforms.u_reactiveness.value =
      (Number.isFinite(reactiveness) ? reactiveness : DEFAULT_CONFIG.threePlasmaField.reactiveness) / 100;

    if (style.colorLow) uniforms.u_colorLow.value.copy(hexToColor(style.colorLow));
    if (style.colorHigh) uniforms.u_colorHigh.value.copy(hexToColor(style.colorHigh));

    const peakBoost = frameMeta?.peak ? Number(frameMeta.peak) * 0.08 : 0;
    uniforms.u_reactiveness.value = Math.min(1.5, uniforms.u_reactiveness.value + peakBoost);

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 等离子场 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
    clock.stop();
  }

  return { render, dispose };
}
