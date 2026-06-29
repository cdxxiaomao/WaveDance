import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "../postProcessing.js";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";
import { resolveSoundFieldColors } from "./soundFieldThemes.js";
import { mapSpectrumToHeightField, smoothHeightField } from "./soundFieldSpectrumMap.js";
import { applyIdleWave } from "./soundFieldIdleWave.js";
import {
  createSoundFieldGrid,
  createSoundFieldGround,
  soundFieldGridSize,
} from "./soundFieldGrid.js";
import { createSoundFieldRippleManager } from "./soundFieldRippleManager.js";
import { createSoundFieldMeteorSystem } from "./soundFieldMeteorSystem.js";

const HIGH_GRID_THRESHOLD = 112;

/**
 * @param {import('../threeContext.js').ThreeContext} ctx
 */
export function createSoundFieldRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeSoundField;

  camera.near = 0.1;
  camera.far = 80;
  camera.fov = cfg.cameraFovDeg;

  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);

  const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x0a0a12, 0.72);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.48);
  dirLight.position.set(5, 12, 7);
  scene.add(hemiLight, dirLight);

  let gridPreset = cfg.gridPreset;
  let gridSize = soundFieldGridSize(gridPreset, cfg);
  let lastThemeId = cfg.themeId;
  /** @type {ReturnType<typeof createSoundFieldGrid> | null} */
  let gridBundle = null;
  /** @type {THREE.Mesh | null} */
  let groundMesh = null;

  let cameraPitchDeg = cfg.cameraPitchDeg;
  let cameraDistance = cfg.cameraDistance;
  let autoRotateEnabled = cfg.autoRotateEnabled;
  let autoRotateSpeedDeg = cfg.autoRotateSpeedDeg;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let lastComposerKey = "";
  /** @type {ReturnType<typeof createBloomComposer> | null} */
  let composer = null;
  let savedPixelRatio = null;

  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let rotateYaw = 0;
  /** @type {ReturnType<typeof createSoundFieldRippleManager> | null} */
  let rippleManager = createSoundFieldRippleManager(cfg.worldWidth, cfg.worldDepth);
  /** @type {ReturnType<typeof createSoundFieldMeteorSystem> | null} */
  let meteorSystem = createSoundFieldMeteorSystem({
    worldWidth: cfg.worldWidth,
    worldDepth: cfg.worldDepth,
    maxBarHeight: cfg.maxBarHeight,
    colorHigh: cfg.colorHigh,
  });
  fieldGroup.add(meteorSystem.points);
  let prevBass = 0;
  /** @type {Float32Array | null} */
  let targetHeights = null;

  function updateCamera() {
    const pitch = THREE.MathUtils.degToRad(cameraPitchDeg);
    const y = cameraDistance * Math.sin(pitch);
    const z = cameraDistance * Math.cos(pitch) * 0.58;
    camera.position.set(0, y, z);
    camera.lookAt(0, cfg.maxBarHeight * 0.24, 0);
    camera.updateProjectionMatrix();
  }

  function applyDprCap(size) {
    const cap = size >= HIGH_GRID_THRESHOLD ? 1.25 : 1.5;
    const next = Math.min(window.devicePixelRatio || 1, cap);
    if (savedPixelRatio == null) {
      savedPixelRatio = renderer.getPixelRatio();
    }
    renderer.setPixelRatio(next);
  }

  function rebuildField(colors) {
    if (gridBundle) {
      fieldGroup.remove(gridBundle.mesh);
      gridBundle.dispose();
    }
    if (groundMesh) {
      fieldGroup.remove(groundMesh);
      groundMesh.geometry.dispose();
      groundMesh.material.dispose();
    }

    gridBundle = createSoundFieldGrid(gridSize, {
      worldWidth: cfg.worldWidth,
      worldDepth: cfg.worldDepth,
      maxBarHeight: cfg.maxBarHeight,
      barFootprint: cfg.barFootprint,
      colorLow: colors.colorLow,
      colorMid: colors.colorMid,
      colorHigh: colors.colorHigh,
    });
    fieldGroup.add(gridBundle.mesh);

    groundMesh = createSoundFieldGround(colors.groundColor, cfg.worldWidth, cfg.worldDepth);
    fieldGroup.add(groundMesh);

    targetHeights = new Float32Array(gridSize * gridSize);
    rippleManager?.clear();
    meteorSystem?.clear();
    applyDprCap(gridSize);
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
        luminanceThreshold: cfg.bloomThreshold,
        luminanceSmoothing: 0.35,
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  rebuildField(resolveSoundFieldColors({ themeId: cfg.themeId }, cfg));
  updateCamera();
  rebuildComposer();

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  function render(_points, shapeConfig, styleConfig, frameMeta, spectrum, processed) {
    const style = styleConfig ?? {};
    const shape = shapeConfig ?? cfg.shape;
    const colors = resolveSoundFieldColors(style, cfg);
    meteorSystem?.setColorHigh(colors.colorHigh);

    const nextPreset = normalizeGridPreset(style.gridPreset, cfg.gridPreset);
    const nextSize = soundFieldGridSize(nextPreset, cfg);
    if (nextPreset !== gridPreset || nextSize !== gridSize || colors.themeId !== lastThemeId || !gridBundle) {
      gridPreset = nextPreset;
      gridSize = nextSize;
      lastThemeId = colors.themeId;
      meteorSystem?.setColorHigh(colors.colorHigh);
      rebuildField(colors);
    }

    const nextPitch = clampInt(style.cameraPitchDeg, 25, 75, cameraPitchDeg);
    const nextDist = clampFloat(style.cameraDistance, 8, 22, cameraDistance);
    if (nextPitch !== cameraPitchDeg || Math.abs(nextDist - cameraDistance) > 0.01) {
      cameraPitchDeg = nextPitch;
      cameraDistance = nextDist;
      updateCamera();
    }

    autoRotateEnabled =
      style.autoRotateEnabled !== undefined ? Boolean(style.autoRotateEnabled) : autoRotateEnabled;
    autoRotateSpeedDeg = clampFloat(
      style.autoRotateSpeedDeg,
      0,
      12,
      autoRotateSpeedDeg || cfg.autoRotateSpeedDeg,
    );

    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : bloomEnabled;
    const nextBloomStrength = Number(style.bloomStrength) || bloomStrength;
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

    if (autoRotateEnabled) {
      rotateYaw += THREE.MathUtils.degToRad(autoRotateSpeedDeg) * safeDt;
      fieldGroup.rotation.y = rotateYaw;
    }

    if (!gridBundle || !targetHeights) return;

    targetHeights = mapSpectrumToHeightField(processed ?? [], spectrum?.bandPeaks, gridSize, {
      responseStrength: clampInt(style.responseStrength, 0, 100, cfg.responseStrength),
      responseRange: clampInt(style.responseRange, 0, 100, cfg.responseRange),
      freqReversed: Boolean(style.freqReversed),
      layoutMode: style.layoutMode ?? cfg.layoutMode,
    });

    smoothHeightField(
      gridBundle.currentHeights,
      targetHeights,
      Number(shape.fallEasePercent ?? cfg.shape.fallEasePercent),
    );

    const bass = Number(spectrum?.bass ?? 0);
    const bassRippleEnabled =
      style.bassRippleEnabled !== undefined ? Boolean(style.bassRippleEnabled) : cfg.bassRippleEnabled;
    const bassRippleStrength = clampInt(
      style.bassRippleStrength,
      0,
      100,
      cfg.bassRippleStrength,
    );
    const bassRippleSensitivity = clampInt(
      style.bassRippleSensitivity,
      0,
      100,
      cfg.bassRippleSensitivity,
    );

    if (rippleManager) {
      rippleManager.tick(safeDt);
      if (bassRippleEnabled) {
        const bassFlux = Math.max(0, bass - prevBass);
        const beatBoost = Math.min(1, bassFlux * 5 + Number(frameMeta?.peak ?? 0) * 0.35);
        rippleManager.pushIfTriggered(bass, bassRippleSensitivity, beatBoost);
        rippleManager.applyToHeights(gridBundle.currentHeights, gridSize, bassRippleStrength);
      }
    }
    prevBass = bass;

    const treble = Number(spectrum?.treble ?? 0);
    const meteorEnabled =
      style.meteorEnabled !== undefined ? Boolean(style.meteorEnabled) : cfg.meteorEnabled;
    const meteorStrength = clampInt(style.meteorStrength, 0, 100, cfg.meteorStrength);
    const meteorSensitivity = clampInt(style.meteorSensitivity, 0, 100, cfg.meteorSensitivity);

    if (meteorSystem) {
      meteorSystem.tick(
        treble,
        meteorSensitivity,
        meteorStrength,
        meteorEnabled,
        gridBundle.currentHeights,
        gridSize,
        safeDt,
      );
      meteorSystem.applyImpactFlashes(gridBundle.currentHeights, gridSize, meteorStrength);
    }

    const rms = Number(frameMeta?.rms ?? 0);
    applyIdleWave(gridBundle.currentHeights, gridSize, elapsed, rms, {
      enabled:
        style.idleWaveEnabled !== undefined ? Boolean(style.idleWaveEnabled) : cfg.idleWaveEnabled,
      amplitude: clampInt(style.idleWaveAmplitude, 0, 100, cfg.idleWaveAmplitude),
      speed: clampInt(style.idleWaveSpeed, 0, 100, cfg.idleWaveSpeed),
      threshold: cfg.idleEnergyThreshold,
    });

    gridBundle.updateMatrices(gridBundle.currentHeights);

    renderer.setClearColor(0x000000, 0);
    try {
      composer?.render();
    } catch (err) {
      console.warn("[WaveDance] 音域回响后处理渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      rebuildComposer();
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    if (savedPixelRatio != null) {
      renderer.setPixelRatio(savedPixelRatio);
      savedPixelRatio = null;
    }
    if (gridBundle) {
      fieldGroup.remove(gridBundle.mesh);
      gridBundle.dispose();
      gridBundle = null;
    }
    if (groundMesh) {
      fieldGroup.remove(groundMesh);
      groundMesh.geometry.dispose();
      groundMesh.material.dispose();
      groundMesh = null;
    }
    rippleManager?.dispose();
    rippleManager = null;
    if (meteorSystem) {
      fieldGroup.remove(meteorSystem.points);
      meteorSystem.dispose();
      meteorSystem = null;
    }
    scene.remove(fieldGroup);
    scene.remove(hemiLight);
    scene.remove(dirLight);
    clock.stop();
  }

  return { render, dispose };
}

/** @param {unknown} value @param {string} fallback */
function normalizeGridPreset(value, fallback) {
  const s = String(value ?? fallback).trim();
  if (s === "eco" || s === "normal" || s === "high") return s;
  return fallback === "eco" || fallback === "high" ? fallback : "normal";
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
