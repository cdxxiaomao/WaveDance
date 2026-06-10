import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const MAX_RIBBONS = 6;
const CONTROL_POINT_COUNT = 16;
const TUBULAR_SEGMENTS = 56;
const RADIAL_SEGMENTS = 6;
const BAND_COUNT = 8;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/** @param {number} x @param {number} y @param {number} z @param {number} t */
function ribbonNoise(x, y, z, t) {
  return (
    Math.sin(x * 1.73 + y * 0.91 + t * 1.05) *
    Math.cos(y * 2.17 - z * 1.41 + t * 0.82) *
    Math.sin(z * 1.59 + x * 0.67 - t * 0.58)
  );
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createAuroraRibbonRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0.15, 3.4);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 50;
  camera.fov = 48;
  camera.updateProjectionMatrix();

  const ribbonRoot = new THREE.Group();
  scene.add(ribbonRoot);

  /** @type {Array<{
   *   mesh: THREE.Mesh | null,
   *   material: THREE.MeshBasicMaterial,
   *   controlPoints: THREE.Vector3[],
   *   bandSmoothed: number,
   * }>} */
  const ribbons = [];

  for (let i = 0; i < MAX_RIBBONS; i++) {
    const controlPoints = Array.from(
      { length: CONTROL_POINT_COUNT },
      () => new THREE.Vector3(),
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    ribbons.push({
      mesh: null,
      material,
      controlPoints,
      bandSmoothed: 0,
    });
  }

  const tempColorLow = new THREE.Color();
  const tempColorHigh = new THREE.Color();
  const tempRibbonColor = new THREE.Color();

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeAuroraRibbon.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeAuroraRibbon.bloomStrength;
  let lastComposerKey = "";
  let activeRibbonCount = DEFAULT_CONFIG.threeAuroraRibbon.ribbonCount;
  let lastRibbonWidth = DEFAULT_CONFIG.threeAuroraRibbon.ribbonWidth;
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
        luminanceThreshold: 0.06,
        luminanceSmoothing: 0.38,
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

  function disposeRibbonMesh(ribbon) {
    if (!ribbon.mesh) return;
    ribbonRoot.remove(ribbon.mesh);
    ribbon.mesh.geometry.dispose();
    ribbon.mesh = null;
  }

  function ensureRibbonCount(count) {
    for (let i = 0; i < MAX_RIBBONS; i++) {
      if (i < count) continue;
      disposeRibbonMesh(ribbons[i]);
    }
    activeRibbonCount = count;
  }

  /**
   * @param {number} ribbonIndex
   * @param {number} ribbonCount
   * @param {number} bassBandIndex
   * @param {Float32Array} bandPeaks
   * @param {number} waveAmplitude
   * @param {number} waveSpeed
   * @param {THREE.Color} colorLow
   * @param {THREE.Color} colorHigh
   */
  function updateRibbonCurve(
    ribbonIndex,
    ribbonCount,
    bassBandIndex,
    bandPeaks,
    waveAmplitude,
    waveSpeed,
    colorLow,
    colorHigh,
  ) {
    const ribbon = ribbons[ribbonIndex];
    const bandIdx = (bassBandIndex + ribbonIndex) % BAND_COUNT;
    const bandTarget = bandPeaks[bandIdx] ?? 0;
    ribbon.bandSmoothed += (bandTarget - ribbon.bandSmoothed) * 0.2;

    const ribbonPhase = ribbonIndex * 1.37 + bassBandIndex * 0.42;
    const depthOffset = (ribbonIndex - (ribbonCount - 1) / 2) * 0.24;
    const speedT = elapsed * waveSpeed;
    const amp = waveAmplitude * (0.72 + ribbon.bandSmoothed * 0.95);

    for (let pi = 0; pi < CONTROL_POINT_COUNT; pi++) {
      const t = pi / (CONTROL_POINT_COUNT - 1);
      const x = (t - 0.5) * 2.6;
      const nx = ribbonNoise(x * 1.4, ribbonIndex * 0.8, speedT, speedT * 0.6);
      const ny = ribbonNoise(x * 0.9 + 4.2, ribbonIndex * 1.1, speedT * 1.2, speedT);
      const nz = ribbonNoise(x * 1.1 + 8.5, ribbonIndex * 0.6, speedT * 0.85, speedT * 1.4);

      const y =
        Math.sin(x * 1.85 + ribbonPhase + speedT * 0.95) * amp +
        Math.sin(x * 3.35 - speedT * 1.25 + ribbonIndex * 0.7) * amp * 0.38 +
        ny * amp * 0.42 +
        ribbon.bandSmoothed * 0.32;

      const z =
        depthOffset +
        Math.cos(x * 2.05 + ribbonPhase) * 0.18 +
        nz * 0.22 +
        nx * 0.12;

      ribbon.controlPoints[pi].set(x, y, z);
    }

    const hueT =
      ribbonCount <= 1
        ? 0.5
        : ribbonIndex / (ribbonCount - 1) + ribbon.bandSmoothed * 0.18;
    tempRibbonColor.copy(colorLow).lerp(colorHigh, Math.min(1, Math.max(0, hueT)));
    tempRibbonColor.multiplyScalar(0.58 + ribbon.bandSmoothed * 0.62);
    ribbon.material.color.copy(tempRibbonColor);
    ribbon.material.opacity = Math.min(1, 0.48 + ribbon.bandSmoothed * 0.42);
  }

  /**
   * @param {number} ribbonIndex
   * @param {number} ribbonWidth
   */
  function rebuildRibbonMesh(ribbonIndex, ribbonWidth) {
    const ribbon = ribbons[ribbonIndex];
    const curve = new THREE.CatmullRomCurve3(ribbon.controlPoints, false, "catmullrom", 0.42);
    const geometry = new THREE.TubeGeometry(
      curve,
      TUBULAR_SEGMENTS,
      ribbonWidth,
      RADIAL_SEGMENTS,
      false,
    );

    disposeRibbonMesh(ribbon);
    ribbon.mesh = new THREE.Mesh(geometry, ribbon.material);
    ribbonRoot.add(ribbon.mesh);
  }

  function render(_points, _shapeConfig, styleConfig, _frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const cfg = DEFAULT_CONFIG.threeAuroraRibbon;

    const ribbonCount = clampInt(Number(style.ribbonCount), 2, 6, cfg.ribbonCount);
    const ribbonWidth = clampFloat(Number(style.ribbonWidth), 0.02, 0.2, cfg.ribbonWidth);
    const waveAmplitude = clampFloat(Number(style.waveAmplitude), 0.1, 0.8, cfg.waveAmplitude);
    const waveSpeed = clampFloat(Number(style.waveSpeed), 0.2, 3, cfg.waveSpeed);
    const bassBandIndex = clampInt(Number(style.bassBandIndex), 0, 7, cfg.bassBandIndex);
    const autoRotateSpeedDeg = clampFloat(
      Number(style.autoRotateSpeedDeg),
      0,
      15,
      cfg.autoRotateSpeedDeg,
    );
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
    elapsed += dt > 0 ? dt : 1 / 60;

    if (ribbonCount !== activeRibbonCount) {
      ensureRibbonCount(ribbonCount);
    }

    const widthChanged = Math.abs(ribbonWidth - lastRibbonWidth) > 0.002;
    if (widthChanged) {
      lastRibbonWidth = ribbonWidth;
    }

    tempColorLow.copy(hexToColor(style.colorLow, cfg.colorLow));
    tempColorHigh.copy(hexToColor(style.colorHigh, cfg.colorHigh));

    const bandPeaks = spectrum?.bandPeaks ?? new Float32Array(BAND_COUNT);
    const bass = spectrum?.bass ?? 0;

    for (let i = 0; i < ribbonCount; i++) {
      updateRibbonCurve(
        i,
        ribbonCount,
        bassBandIndex,
        bandPeaks,
        waveAmplitude,
        waveSpeed,
        tempColorLow,
        tempColorHigh,
      );
      if (!ribbons[i].mesh || widthChanged) {
        rebuildRibbonMesh(i, ribbonWidth);
      } else {
        const curve = new THREE.CatmullRomCurve3(
          ribbons[i].controlPoints,
          false,
          "catmullrom",
          0.42,
        );
        ribbons[i].mesh.geometry.dispose();
        ribbons[i].mesh.geometry = new THREE.TubeGeometry(
          curve,
          TUBULAR_SEGMENTS,
          ribbonWidth,
          RADIAL_SEGMENTS,
          false,
        );
      }
    }

    ribbonRoot.rotation.y = elapsed * THREE.MathUtils.degToRad(autoRotateSpeedDeg);
    ribbonRoot.rotation.x =
      Math.sin(elapsed * 0.35) * 0.08 + bass * 0.06 * THREE.MathUtils.degToRad(12);

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 极光飘带 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    for (let i = 0; i < MAX_RIBBONS; i++) {
      disposeRibbonMesh(ribbons[i]);
      ribbons[i].material.dispose();
    }
    scene.remove(ribbonRoot);
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
