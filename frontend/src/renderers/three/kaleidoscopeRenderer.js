import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG, normalizeKaleidoscopeSegments } from "../../visualizationSchema.js";

const KALEIDOSCOPE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const KALEIDOSCOPE_FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_rotation;
uniform float u_segments;
uniform float u_reactiveness;
uniform float u_freqReversed;
uniform sampler2D u_spectrum;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2 u_resolution;

varying vec2 vUv;

const float PI = 3.14159265359;

float foldAngle(float angle, float segments) {
  float wedge = 2.0 * PI / segments;
  angle = mod(angle, wedge);
  if (angle > wedge * 0.5) {
    angle = wedge - angle;
  }
  return angle;
}

void main() {
  vec2 p = vUv - 0.5;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float radius = length(p);
  float angle = atan(p.y, p.x) + u_rotation;
  angle = foldAngle(angle, u_segments);

  float wedge = 2.0 * PI / u_segments;
  float specT = clamp(angle / (wedge * 0.5), 0.0, 1.0);
  if (u_freqReversed > 0.5) {
    specT = 1.0 - specT;
  }

  float amp = texture2D(u_spectrum, vec2(specT, 0.5)).r;
  float react = u_reactiveness * (0.3 + u_bass * 0.55 + u_mid * 0.35 + u_treble * 0.2);
  amp = clamp(amp * react, 0.0, 1.0);

  float maxR = 0.78;
  float barEdge = amp * maxR;
  float barWidth = 0.018 + amp * 0.025;
  float barMask =
    smoothstep(barEdge + barWidth, barEdge, radius) *
    smoothstep(barEdge - barWidth * 2.5, barEdge, radius);

  float hueMix = clamp(amp + specT * 0.35 + u_mid * 0.15, 0.0, 1.0);
  vec3 col = mix(u_colorLow, u_colorHigh, hueMix);

  float centerGlow = exp(-radius * 4.2) * (0.12 + amp * 0.45 + u_bass * 0.25);
  float rings =
    (sin(radius * 36.0 - u_rotation * 3.0 + amp * 12.0) * 0.5 + 0.5) *
    smoothstep(maxR, 0.05, radius) *
    (0.08 + amp * 0.2);

  float intensity = barMask * 1.15 + centerGlow + rings;
  col *= intensity * (0.65 + u_treble * 0.45);
  col += u_colorHigh * barMask * amp * 0.25;

  float alpha = clamp(intensity * 0.9 + 0.08, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createKaleidoscopeRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    u_rotation: { value: 0 },
    u_segments: { value: DEFAULT_CONFIG.threeKaleidoscope.segments },
    u_reactiveness: { value: DEFAULT_CONFIG.threeKaleidoscope.reactiveness / 100 },
    u_freqReversed: { value: 0 },
    u_spectrum: { value: null },
    u_colorLow: { value: hexToColor(DEFAULT_CONFIG.threeKaleidoscope.colorLow, DEFAULT_CONFIG.threeKaleidoscope.colorLow) },
    u_colorHigh: { value: hexToColor(DEFAULT_CONFIG.threeKaleidoscope.colorHigh, DEFAULT_CONFIG.threeKaleidoscope.colorHigh) },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_treble: { value: 0 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: KALEIDOSCOPE_VERTEX,
    fragmentShader: KALEIDOSCOPE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeKaleidoscope.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeKaleidoscope.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsedRotation = 0;

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.12,
        luminanceSmoothing: 0.35,
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
    const segments = normalizeKaleidoscopeSegments(
      style.segments,
      DEFAULT_CONFIG.threeKaleidoscope.segments,
    );
    const rotationSpeedDeg =
      Number(style.rotationSpeedDeg) || DEFAULT_CONFIG.threeKaleidoscope.rotationSpeedDeg;
    const reactiveness = Number(style.reactiveness);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined
        ? Boolean(style.bloomEnabled)
        : DEFAULT_CONFIG.threeKaleidoscope.bloomEnabled;
    const nextBloomStrength =
      Number(style.bloomStrength) || DEFAULT_CONFIG.threeKaleidoscope.bloomStrength;

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    elapsedRotation += (dt > 0 ? dt : 1 / 60) * THREE.MathUtils.degToRad(rotationSpeedDeg);
    uniforms.u_rotation.value = elapsedRotation;
    uniforms.u_segments.value = segments;
    uniforms.u_reactiveness.value =
      (Number.isFinite(reactiveness) ? reactiveness : DEFAULT_CONFIG.threeKaleidoscope.reactiveness) /
      100;
    uniforms.u_freqReversed.value = style.freqReversed ? 1 : 0;
    uniforms.u_bass.value = spectrum?.bass ?? 0;
    uniforms.u_mid.value = spectrum?.mid ?? 0;
    uniforms.u_treble.value = spectrum?.treble ?? 0;

    if (spectrum?.spectrumTexture) {
      uniforms.u_spectrum.value = spectrum.spectrumTexture;
    }

    if (style.colorLow) {
      uniforms.u_colorLow.value.copy(
        hexToColor(style.colorLow, DEFAULT_CONFIG.threeKaleidoscope.colorLow),
      );
    }
    if (style.colorHigh) {
      uniforms.u_colorHigh.value.copy(
        hexToColor(style.colorHigh, DEFAULT_CONFIG.threeKaleidoscope.colorHigh),
      );
    }

    const peakBoost = frameMeta?.peak ? Number(frameMeta.peak) * 0.06 : 0;
    uniforms.u_reactiveness.value = Math.min(1.5, uniforms.u_reactiveness.value + peakBoost);

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 万花筒 Bloom 渲染失败，回退直绘", err);
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
