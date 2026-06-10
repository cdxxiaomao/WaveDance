import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const TUNNEL_LENGTH = 22;
const TUNNEL_WIDTH = 1.65;
const WALL_HEIGHT = 2.8;
const DEPTH_ROWS = 64;

const WALL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WALL_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_history;
uniform float u_scroll;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
uniform float u_segments;
uniform float u_maxBarFrac;

varying vec2 vUv;

void main() {
  float depth = fract(vUv.x + u_scroll);
  float band = vUv.y * u_segments;
  float segIdx = floor(band);
  float segFrac = fract(band);

  float amp = texture2D(u_history, vec2((segIdx + 0.5) / u_segments, depth)).r;
  float barTop = amp * u_maxBarFrac;

  if (segFrac > barTop) discard;

  vec3 col = mix(u_colorLow, u_colorHigh, clamp(amp * 1.15, 0.0, 1.0));
  float edge = smoothstep(barTop - 0.04, barTop, segFrac);
  col *= 0.55 + 0.45 * (1.0 - edge);
  float glow = smoothstep(0.0, 0.12, barTop - segFrac);
  col += u_colorHigh * glow * amp * 0.35;

  gl_FragColor = vec4(col, 0.88);
}
`;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {Float32Array | number[]} processed
 * @param {number} segments
 * @param {boolean} freqReversed
 */
function sampleWallSegments(processed, segments, freqReversed) {
  const row = new Float32Array(segments);
  const len = processed.length;
  if (len === 0) return row;

  for (let s = 0; s < segments; s++) {
    const start = Math.floor((s * len) / segments);
    const end = Math.floor(((s + 1) * len) / segments);
    let peak = 0;
    for (let i = start; i < end; i++) {
      if (processed[i] > peak) peak = processed[i];
    }
    row[s] = peak;
  }

  if (freqReversed) row.reverse();
  return row;
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createBloomTunnelRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0.18, 0.6);
  camera.lookAt(0, 0.12, -TUNNEL_LENGTH * 0.45);
  camera.near = 0.1;
  camera.far = 80;
  camera.fov = DEFAULT_CONFIG.threeBloomTunnel.fovDeg;
  camera.updateProjectionMatrix();

  const tunnelGroup = new THREE.Group();
  scene.add(tunnelGroup);

  let wallSegments = DEFAULT_CONFIG.threeBloomTunnel.wallSegments;
  let historyData = new Float32Array(DEPTH_ROWS * wallSegments);

  let historyTexture = new THREE.DataTexture(
    historyData,
    wallSegments,
    DEPTH_ROWS,
    THREE.RedFormat,
    THREE.FloatType,
  );
  historyTexture.minFilter = THREE.LinearFilter;
  historyTexture.magFilter = THREE.LinearFilter;
  historyTexture.wrapS = THREE.ClampToEdgeWrapping;
  historyTexture.wrapT = THREE.RepeatWrapping;
  historyTexture.needsUpdate = true;

  const wallUniforms = {
    u_history: { value: historyTexture },
    u_scroll: { value: 0 },
    u_colorLow: {
      value: hexToColor(
        DEFAULT_CONFIG.threeBloomTunnel.wallColorLow,
        DEFAULT_CONFIG.threeBloomTunnel.wallColorLow,
      ),
    },
    u_colorHigh: {
      value: hexToColor(
        DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh,
        DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh,
      ),
    },
    u_segments: { value: wallSegments },
    u_maxBarFrac: { value: 0.92 },
  };

  const wallMaterial = new THREE.ShaderMaterial({
    uniforms: wallUniforms,
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const wallGeometry = new THREE.PlaneGeometry(TUNNEL_LENGTH, WALL_HEIGHT, 1, 1);

  const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
  leftWall.position.set(-TUNNEL_WIDTH, WALL_HEIGHT * 0.38, -TUNNEL_LENGTH * 0.5);
  leftWall.rotation.y = Math.PI / 2;
  tunnelGroup.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
  rightWall.position.set(TUNNEL_WIDTH, WALL_HEIGHT * 0.38, -TUNNEL_LENGTH * 0.5);
  rightWall.rotation.y = -Math.PI / 2;
  tunnelGroup.add(rightWall);

  const floorMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a14,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(TUNNEL_LENGTH, TUNNEL_WIDTH * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -TUNNEL_LENGTH * 0.5);
  tunnelGroup.add(floor);

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: hexToColor(DEFAULT_CONFIG.threeBloomTunnel.coreColor, DEFAULT_CONFIG.threeBloomTunnel.coreColor),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), coreMaterial);
  core.position.set(0, 0.12, -7.5);
  tunnelGroup.add(core);

  const coreHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 16),
    new THREE.MeshBasicMaterial({
      color: hexToColor(DEFAULT_CONFIG.threeBloomTunnel.coreColor, DEFAULT_CONFIG.threeBloomTunnel.coreColor),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  core.add(coreHalo);

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeBloomTunnel.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeBloomTunnel.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let scrollOffset = 0;
  let energySmoothed = 0;
  let peakSmoothed = 0;

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.1,
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
  }

  function rebuildHistoryBuffer(nextSegments) {
    const oldData = historyData;
    const oldSegments = wallSegments;
    wallSegments = nextSegments;
    historyData = new Float32Array(DEPTH_ROWS * wallSegments);

    for (let row = 0; row < DEPTH_ROWS; row++) {
      for (let s = 0; s < wallSegments; s++) {
        const oldS = Math.floor((s * oldSegments) / wallSegments);
        historyData[row * wallSegments + s] = oldData[row * oldSegments + oldS] ?? 0;
      }
    }

    historyTexture.dispose();
    historyTexture = new THREE.DataTexture(
      historyData,
      wallSegments,
      DEPTH_ROWS,
      THREE.RedFormat,
      THREE.FloatType,
    );
    historyTexture.minFilter = THREE.LinearFilter;
    historyTexture.magFilter = THREE.LinearFilter;
    historyTexture.wrapS = THREE.ClampToEdgeWrapping;
    historyTexture.wrapT = THREE.RepeatWrapping;
    historyTexture.needsUpdate = true;
    wallUniforms.u_history.value = historyTexture;
    wallUniforms.u_segments.value = wallSegments;
  }

  function pushHistoryRow(row) {
    for (let r = DEPTH_ROWS - 1; r > 0; r--) {
      const dst = r * wallSegments;
      const src = (r - 1) * wallSegments;
      historyData.set(historyData.subarray(src, src + wallSegments), dst);
    }
    for (let i = 0; i < wallSegments; i++) {
      historyData[i] = row[i] ?? 0;
    }
    historyTexture.needsUpdate = true;
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum, processed) {
    const style = styleConfig ?? {};
    const nextSegments = clampInt(
      Number(style.wallSegments),
      16,
      64,
      DEFAULT_CONFIG.threeBloomTunnel.wallSegments,
    );
    if (nextSegments !== wallSegments) {
      rebuildHistoryBuffer(nextSegments);
    }

    const tunnelSpeed = clampFloat(
      Number(style.tunnelSpeed),
      0.2,
      3,
      DEFAULT_CONFIG.threeBloomTunnel.tunnelSpeed,
    );
    const corePulseStrength =
      clampInt(
        Number(style.corePulseStrength),
        0,
        100,
        DEFAULT_CONFIG.threeBloomTunnel.corePulseStrength,
      ) / 100;
    const fovDeg = clampInt(Number(style.fovDeg), 45, 85, DEFAULT_CONFIG.threeBloomTunnel.fovDeg);
    const nextBloomEnabled =
      style.bloomEnabled !== undefined
        ? Boolean(style.bloomEnabled)
        : DEFAULT_CONFIG.threeBloomTunnel.bloomEnabled;
    const nextBloomStrength =
      Number(style.bloomStrength) || DEFAULT_CONFIG.threeBloomTunnel.bloomStrength;

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    if (Math.abs(camera.fov - fovDeg) > 0.5) {
      camera.fov = fovDeg;
      camera.updateProjectionMatrix();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    const safeDt = dt > 0 ? dt : 1 / 60;

    const bass = spectrum?.bass ?? 0;
    const mid = spectrum?.mid ?? 0;
    const treble = spectrum?.treble ?? 0;
    const energy = (bass + mid + treble) / 3;
    energySmoothed += (energy - energySmoothed) * 0.2;

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : energy;
    peakSmoothed += (peak - peakSmoothed) * 0.25;

    const effectiveSpeed = tunnelSpeed * (0.12 + energySmoothed * 0.88);
    scrollOffset = (scrollOffset + (effectiveSpeed * safeDt) / TUNNEL_LENGTH) % 1;
    wallUniforms.u_scroll.value = scrollOffset;

    const freqReversed = Boolean(style.freqReversed);
    const row = sampleWallSegments(processed ?? [], wallSegments, freqReversed);
    pushHistoryRow(row);

    if (style.wallColorLow) {
      wallUniforms.u_colorLow.value.copy(
        hexToColor(style.wallColorLow, DEFAULT_CONFIG.threeBloomTunnel.wallColorLow),
      );
    }
    if (style.wallColorHigh) {
      wallUniforms.u_colorHigh.value.copy(
        hexToColor(style.wallColorHigh, DEFAULT_CONFIG.threeBloomTunnel.wallColorHigh),
      );
    }

    const coreScale = 0.55 + peakSmoothed * corePulseStrength * 0.9 + bass * 0.25;
    core.scale.setScalar(coreScale);
    coreHalo.scale.setScalar(1.15 + peakSmoothed * 0.35);

    if (style.coreColor) {
      const col = hexToColor(style.coreColor, DEFAULT_CONFIG.threeBloomTunnel.coreColor);
      coreMaterial.color.copy(col);
      coreHalo.material.color.copy(col);
    }

    coreMaterial.opacity = 0.7 + peakSmoothed * 0.3;
    coreHalo.material.opacity = 0.12 + peakSmoothed * 0.25;

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 能量隧道 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    historyTexture.dispose();
    wallGeometry.dispose();
    wallMaterial.dispose();
    floor.geometry.dispose();
    floorMat.dispose();
    core.geometry.dispose();
    coreMaterial.dispose();
    coreHalo.geometry.dispose();
    coreHalo.material.dispose();
    scene.remove(tunnelGroup);
    clock.stop();
  }

  return { render, dispose };
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
