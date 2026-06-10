import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const PLANE_WORLD_SIZE = 10;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
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

// --- 2D Simplex noise (Ashima / Gustavson, compact JS port) ---
const SIMPLEX_GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const SIMPLEX_P = new Uint8Array(256);
for (let i = 0; i < 256; i++) SIMPLEX_P[i] = i;
for (let i = 255; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  const tmp = SIMPLEX_P[i];
  SIMPLEX_P[i] = SIMPLEX_P[j];
  SIMPLEX_P[j] = tmp;
}
const SIMPLEX_PERM = new Uint8Array(512);
const SIMPLEX_PERM_MOD12 = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  SIMPLEX_PERM[i] = SIMPLEX_P[i & 255];
  SIMPLEX_PERM_MOD12[i] = SIMPLEX_PERM[i] % 12;
}

function simplex2(xin, yin) {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = SIMPLEX_PERM_MOD12[ii + SIMPLEX_PERM[jj]];
  const gi1 = SIMPLEX_PERM_MOD12[ii + i1 + SIMPLEX_PERM[jj + j1]];
  const gi2 = SIMPLEX_PERM_MOD12[ii + 1 + SIMPLEX_PERM[jj + 1]];
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * (SIMPLEX_GRAD3[gi0][0] * x0 + SIMPLEX_GRAD3[gi0][1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * (SIMPLEX_GRAD3[gi1][0] * x1 + SIMPLEX_GRAD3[gi1][1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * (SIMPLEX_GRAD3[gi2][0] * x2 + SIMPLEX_GRAD3[gi2][1] * y2);
  }
  return 70 * (n0 + n1 + n2);
}

function layeredNoise(x, z) {
  return (
    simplex2(x, z) * 0.55 +
    simplex2(x * 2.03 + 17.2, z * 2.03 - 8.4) * 0.28 +
    simplex2(x * 4.07 - 3.1, z * 4.07 + 11.7) * 0.17
  );
}

/**
 * @param {Float32Array | number[]} processed
 * @param {number} u01
 * @param {boolean} freqReversed
 */
function sampleSpectrum(processed, u01, freqReversed) {
  const len = processed?.length ?? 0;
  if (len === 0) return 0;
  const u = Math.min(1, Math.max(0, u01));
  const fIdx = u * (len - 1);
  const i0 = Math.floor(fIdx);
  const i1 = Math.min(len - 1, i0 + 1);
  const t = fIdx - i0;
  let v0 = processed[i0] ?? 0;
  let v1 = processed[i1] ?? 0;
  if (freqReversed) {
    v0 = processed[len - 1 - i0] ?? 0;
    v1 = processed[len - 1 - i1] ?? 0;
  }
  return v0 * (1 - t) + v1 * t;
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createNoiseLandscapeRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.near = 0.1;
  camera.far = 80;
  camera.fov = 52;

  const landscapeRoot = new THREE.Group();
  scene.add(landscapeRoot);

  /** @type {THREE.Mesh | null} */
  let surfaceMesh = null;
  /** @type {THREE.LineSegments | null} */
  let wireMesh = null;

  let gridSize = DEFAULT_CONFIG.threeNoiseLandscape.gridSize;
  let cameraPitchDeg = DEFAULT_CONFIG.threeNoiseLandscape.cameraPitchDeg;
  let wireframeOverlay = DEFAULT_CONFIG.threeNoiseLandscape.wireframeOverlay;

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeNoiseLandscape.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeNoiseLandscape.bloomStrength;
  let lastComposerKey = "";

  const clock = new THREE.Clock(true);
  let scrollOffset = 0;

  /** @type {Float32Array} */
  let smoothedSpectrum = new Float32Array(0);

  function updateCamera() {
    const pitch = THREE.MathUtils.degToRad(cameraPitchDeg);
    const dist = 12.5;
    const y = dist * Math.sin(pitch);
    const z = dist * Math.cos(pitch) * 0.62;
    camera.position.set(0, y, z);
    camera.lookAt(0, 0.15, 0);
    camera.updateProjectionMatrix();
  }

  function rebuildSurface(nextGridSize) {
    if (surfaceMesh) {
      landscapeRoot.remove(surfaceMesh);
      surfaceMesh.geometry.dispose();
      surfaceMesh.material.dispose();
      surfaceMesh = null;
    }
    if (wireMesh) {
      landscapeRoot.remove(wireMesh);
      wireMesh.geometry.dispose();
      wireMesh.material.dispose();
      wireMesh = null;
    }

    gridSize = nextGridSize;
    const geometry = new THREE.PlaneGeometry(
      PLANE_WORLD_SIZE,
      PLANE_WORLD_SIZE,
      gridSize,
      gridSize,
    );
    geometry.rotateX(-Math.PI / 2);

    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: true,
    });

    surfaceMesh = new THREE.Mesh(geometry, material);
    landscapeRoot.add(surfaceMesh);

    if (wireframeOverlay) {
      const wireGeo = new THREE.WireframeGeometry(geometry);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0xc4b5fd,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      wireMesh = new THREE.LineSegments(wireGeo, wireMat);
      landscapeRoot.add(wireMesh);
    }
  }

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
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  rebuildSurface(gridSize);
  updateCamera();
  rebuildComposer();

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  function syncWireframeVisibility(show) {
    if (show === wireframeOverlay && (wireMesh !== null) === show) return;
    wireframeOverlay = show;
    rebuildSurface(gridSize);
  }

  function updateHeights(style, processed, freqReversed) {
    if (!surfaceMesh) return;

    const cfg = DEFAULT_CONFIG.threeNoiseLandscape;
    const heightScale = clampFloat(style.heightScale, 0.1, 1.2, cfg.heightScale);
    const noiseScale = clampFloat(style.noiseScale, 0.5, 4, cfg.noiseScale);
    const colorLow = hexToColor(style.colorLow, cfg.colorLow);
    const colorHigh = hexToColor(style.colorHigh, cfg.colorHigh);

    const pos = surfaceMesh.geometry.attributes.position;
    const col = surfaceMesh.geometry.attributes.color;
    const half = PLANE_WORLD_SIZE * 0.5;

    let minH = Infinity;
    let maxH = -Infinity;
    const heights = new Float32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = (x / half) * noiseScale;
      const nz = (z / half) * noiseScale - scrollOffset;

      const base = layeredNoise(nx, nz) * 0.5 + 0.08;
      const u = (x + half) / PLANE_WORLD_SIZE;
      const spec = sampleSpectrum(processed, u, freqReversed);
      const specBump = spec * spec * 1.35;

      const y = (base * 0.55 + specBump * 0.85) * heightScale;
      heights[i] = y;
      if (y < minH) minH = y;
      if (y > maxH) maxH = y;
    }

    const range = Math.max(0.08, maxH - minH);

    for (let i = 0; i < pos.count; i++) {
      const y = heights[i];
      pos.setY(i, y);

      const t = (y - minH) / range;
      const r = THREE.MathUtils.lerp(colorLow.r, colorHigh.r, t);
      const g = THREE.MathUtils.lerp(colorLow.g, colorHigh.g, t);
      const b = THREE.MathUtils.lerp(colorLow.b, colorHigh.b, t);
      col.setXYZ(i, r, g, b);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    surfaceMesh.geometry.computeVertexNormals();

    if (wireMesh) {
      wireMesh.geometry.dispose();
      wireMesh.geometry = new THREE.WireframeGeometry(surfaceMesh.geometry);
    }
  }

  function render(_points, _shapeConfig, styleConfig, _frameMeta, _spectrum, processed) {
    const style = styleConfig ?? {};
    const cfg = DEFAULT_CONFIG.threeNoiseLandscape;

    const nextGrid = clampInt(style.gridSize, 32, 96, cfg.gridSize);
    const nextPitch = clampInt(style.cameraPitchDeg, 25, 75, cfg.cameraPitchDeg);
    const nextWire =
      style.wireframeOverlay !== undefined ? Boolean(style.wireframeOverlay) : cfg.wireframeOverlay;
    const scrollSpeed = clampFloat(style.scrollSpeed, 0.1, 2.5, cfg.scrollSpeed);

    if (nextGrid !== gridSize) {
      rebuildSurface(nextGrid);
    } else if (nextWire !== wireframeOverlay) {
      syncWireframeVisibility(nextWire);
    }

    if (nextPitch !== cameraPitchDeg) {
      cameraPitchDeg = nextPitch;
      updateCamera();
    }

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
    scrollOffset += scrollSpeed * dt * 0.85;

    const proc = processed ?? new Float32Array(0);
    if (proc.length !== smoothedSpectrum.length) {
      smoothedSpectrum = new Float32Array(proc.length);
    }
    for (let i = 0; i < proc.length; i++) {
      smoothedSpectrum[i] += ((proc[i] ?? 0) - smoothedSpectrum[i]) * 0.22;
    }

    updateHeights(style, smoothedSpectrum, Boolean(style.freqReversed));

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 噪声地貌 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    if (surfaceMesh) {
      surfaceMesh.geometry.dispose();
      surfaceMesh.material.dispose();
      landscapeRoot.remove(surfaceMesh);
    }
    if (wireMesh) {
      wireMesh.geometry.dispose();
      wireMesh.material.dispose();
      landscapeRoot.remove(wireMesh);
    }
    scene.remove(landscapeRoot);
    clock.stop();
  }

  return { render, dispose };
}
