import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const MAX_BLOBS = 4;
const MARCH_STEPS = 72;

const LAMP_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const LAMP_FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2 u_resolution;
uniform int u_blobCount;
uniform vec3 u_blobCenters[${MAX_BLOBS}];
uniform float u_blobRadii[${MAX_BLOBS}];
uniform vec3 u_colorWarm;
uniform vec3 u_colorCool;
uniform float u_mergeK;
uniform float u_lampAspect;

varying vec2 vUv;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float mapScene(vec3 p) {
  float d = 100.0;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= u_blobCount) break;
    float sd = length(p - u_blobCenters[i]) - u_blobRadii[i];
    d = (i == 0) ? sd : smin(d, sd, u_mergeK);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  const float e = 0.0015;
  vec2 ev = vec2(e, 0.0);
  return normalize(vec3(
    mapScene(p + ev.xyy) - mapScene(p - ev.xyy),
    mapScene(p + ev.yxy) - mapScene(p - ev.yxy),
    mapScene(p + ev.yyx) - mapScene(p - ev.yyx)
  ));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 ro = vec3(0.0, 0.05, 2.85);
  vec3 rd = normalize(vec3(uv, -1.65));

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
    if (t > 8.0) break;
  }

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  p = ro + rd * hit;
  vec3 n = calcNormal(p);

  float gradH = 0.55 * max(u_lampAspect, 0.35);
  float hueT = smoothstep(-gradH, gradH, p.y);
  hueT = clamp(hueT + u_mid * 0.22 - 0.08, 0.0, 1.0);
  vec3 col = mix(u_colorWarm, u_colorCool, hueT);

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);
  float shade = 0.55 + 0.45 * dot(n, normalize(vec3(0.3, 0.8, 0.5)));
  col *= shade + u_bass * 0.45 + u_treble * 0.15;
  col += fresnel * (mix(u_colorWarm, u_colorCool, 0.65) * 0.55 + vec3(0.12));

  float edgeSoft = smoothstep(0.012, 0.0, mapScene(p));
  float alpha = clamp(0.72 + fresnel * 0.28 + u_bass * 0.12, 0.0, 1.0) * edgeSoft;

  gl_FragColor = vec4(col, alpha);
}
`;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {number} count
 * @param {number} elapsed
 * @param {number} buoyancySpeed
 * @param {number} bass
 * @param {number} bassDrive
 * @param {number} lampAspect
 * @param {Float32Array} centers
 * @param {Float32Array} radii
 */
function updateLavaBlobField(count, elapsed, buoyancySpeed, bass, bassDrive, lampAspect, centers, radii) {
  const drive = bassDrive / 100;
  const verticalSpan = 0.62 * lampAspect;
  const baseRadius = 0.34 + bass * drive * 0.28;

  for (let i = 0; i < count; i++) {
    const phase = (i / Math.max(count, 1)) * Math.PI * 2 + i * 0.85;
    const buoyancyT = elapsed * buoyancySpeed;

    const y = Math.sin(buoyancyT + phase) * verticalSpan * 0.72;
    const x =
      Math.sin(buoyancyT * 0.45 + phase * 1.3) * 0.16 +
      Math.cos(buoyancyT * 0.28 + i * 1.7) * 0.06;
    const z =
      Math.cos(buoyancyT * 0.38 + phase * 0.9) * 0.12 +
      Math.sin(buoyancyT * 0.22 + i * 2.2) * 0.05;

    centers[i * 3] = x;
    centers[i * 3 + 1] = y;
    centers[i * 3 + 2] = z;

    const pulse = 0.9 + 0.14 * Math.sin(buoyancyT * 0.55 + i * 1.1);
    radii[i] = baseRadius * pulse * (1 + bass * drive * 0.55);
  }
}

/** @param {number} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {number} value @param {number} min @param {number} max @param {number} fallback */
function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createLavaLampRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeLavaLamp;

  camera.position.set(0, 0, 1);
  camera.near = 0.1;
  camera.far = 10;
  camera.fov = 90;
  camera.updateProjectionMatrix();

  const blobCenters = new Array(MAX_BLOBS).fill(0).map(() => new THREE.Vector3());
  const blobRadii = new Float32Array(MAX_BLOBS);
  const cpuCenters = new Float32Array(MAX_BLOBS * 3);

  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_treble: { value: 0 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
    u_blobCount: { value: cfg.blobCount },
    u_blobCenters: { value: blobCenters },
    u_blobRadii: { value: blobRadii },
    u_colorWarm: { value: hexToColor(cfg.colorWarm, cfg.colorWarm) },
    u_colorCool: { value: hexToColor(cfg.colorCool, cfg.colorCool) },
    u_mergeK: { value: 0.22 },
    u_lampAspect: { value: cfg.lampAspect },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: LAMP_VERTEX,
    fragmentShader: LAMP_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const quad = new THREE.Mesh(geometry, material);
  scene.add(quad);

  let composer = null;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let bassSmoothed = 0;
  let midSmoothed = 0;
  let trebleSmoothed = 0;

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.08,
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

  updateLavaBlobField(
    cfg.blobCount,
    0,
    cfg.buoyancySpeed,
    0,
    cfg.bassDrive,
    cfg.lampAspect,
    cpuCenters,
    blobRadii,
  );
  for (let i = 0; i < MAX_BLOBS; i++) {
    if (i < cfg.blobCount) {
      blobCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
    }
  }

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
    uniforms.u_resolution.value.set(size.x, size.y);
  }

  function render(_points, _shapeConfig, styleConfig, _frameMeta, spectrum) {
    const style = styleConfig ?? {};

    const blobCount = clampInt(Number(style.blobCount), 2, 4, cfg.blobCount);
    const mergeStrength = clampInt(Number(style.mergeStrength), 0, 100, cfg.mergeStrength);
    const buoyancySpeed = clampFloat(Number(style.buoyancySpeed), 0.2, 2, cfg.buoyancySpeed);
    const bassDrive = clampInt(Number(style.bassDrive), 0, 100, cfg.bassDrive);
    const lampAspect = clampFloat(Number(style.lampAspect), 0.35, 1.2, cfg.lampAspect);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : cfg.bloomEnabled;
    const nextBloomStrength = Number(style.bloomStrength) || cfg.bloomStrength;

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    const safeDt = dt > 0 ? dt : 1 / 60;
    elapsed += safeDt;

    const bass = spectrum?.bass ?? 0;
    const mid = spectrum?.mid ?? 0;
    const treble = spectrum?.treble ?? 0;

    bassSmoothed += (bass - bassSmoothed) * 0.22;
    midSmoothed += (mid - midSmoothed) * 0.18;
    trebleSmoothed += (treble - trebleSmoothed) * 0.16;

    updateLavaBlobField(
      blobCount,
      elapsed,
      buoyancySpeed,
      bassSmoothed,
      bassDrive,
      lampAspect,
      cpuCenters,
      blobRadii,
    );

    for (let i = 0; i < MAX_BLOBS; i++) {
      if (i < blobCount) {
        blobCenters[i].set(cpuCenters[i * 3], cpuCenters[i * 3 + 1], cpuCenters[i * 3 + 2]);
      } else {
        blobCenters[i].set(0, -10, 0);
        blobRadii[i] = 0.001;
      }
    }

    uniforms.u_time.value = elapsed;
    uniforms.u_bass.value = bassSmoothed;
    uniforms.u_mid.value = midSmoothed;
    uniforms.u_treble.value = trebleSmoothed;
    uniforms.u_blobCount.value = blobCount;
    uniforms.u_mergeK.value = 0.06 + (mergeStrength / 100) * 0.42;
    uniforms.u_lampAspect.value = lampAspect;
    uniforms.u_colorWarm.value.copy(hexToColor(style.colorWarm, cfg.colorWarm));
    uniforms.u_colorCool.value.copy(hexToColor(style.colorCool, cfg.colorCool));

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 熔岩灯 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    scene.remove(quad);
    geometry.dispose();
    material.dispose();
    clock.stop();
  }

  return { render, dispose };
}
