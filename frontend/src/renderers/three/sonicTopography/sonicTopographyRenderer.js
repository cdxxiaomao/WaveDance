import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "../postProcessing.js";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";
import {
  createAudioAnalysisState,
  analyzeSpectrum,
  smoothAudioUniforms,
} from "./audioAnalysis.js";
import { applyGroundEq, amplitudeFromSlider } from "./groundEq.js";
import {
  resolveGridFromPreset,
  createTerrainGrid,
  TERRAIN_BASE_SIZE,
} from "./gridSettings.js";
import {
  createTerrainMaterial,
  updateTerrainAudioUniforms,
} from "./terrainMaterial.js";
import { resolveTheme, lerpThemeColors, applyThemeToUniforms } from "./themes.js";
import { createRippleBuffer } from "./rippleBuffer.js";
import { createTriggerEngine } from "./triggerEngine.js";
import {
  applyKickImpulse,
  stepKickDeform,
  mixKickIntoLowBands,
  createKickDeformState,
} from "./terrainResponse.js";
import { createMeteorSystem } from "./meteorSystem.js";
import { createFloatingBlocks } from "./floatingBlocks.js";
import { createCoverPlane } from "./coverPlane.js";
import { applySonicDprCap, createFpsMonitor } from "./performance.js";

const VISUAL_FIT = 12 / TERRAIN_BASE_SIZE;

/**
 * @param {import('../threeContext.js').ThreeContext} ctx
 */
export function createSonicTopographyRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeSoundField2;

  camera.near = 0.1;
  camera.far = 160;
  camera.fov = cfg.cameraFovDeg;

  const fieldGroup = new THREE.Group();
  fieldGroup.scale.setScalar(VISUAL_FIT);
  scene.add(fieldGroup);

  const hemiLight = new THREE.HemisphereLight(0x8899aa, 0x080810, 0.55);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.35);
  dirLight.position.set(6, 14, 8);
  scene.add(hemiLight, dirLight);

  let { material, uniforms } = createTerrainMaterial();
  const audioState = createAudioAnalysisState();
  const rippleBuffer = createRippleBuffer();
  const triggerEngine = createTriggerEngine(cfg);
  let kickDeform = createKickDeformState();

  let gridPreset = cfg.gridPreset;
  const baseSize = cfg.terrainBaseSize ?? TERRAIN_BASE_SIZE;
  let gridSettings = resolveGridFromPreset(gridPreset, baseSize);
  let themeCurrent = resolveTheme(cfg.themeId);
  let themeTarget = resolveTheme(cfg.themeId);
  applyThemeToUniforms(themeCurrent, uniforms);

  const meteorSystem = createMeteorSystem({ terrainHalf: gridSettings.terrainHalf });
  fieldGroup.add(meteorSystem.meteorMesh);
  fieldGroup.add(meteorSystem.burstPoints);
  meteorSystem.setColor(themeCurrent.uWarmEdge);
  let pendingMeteorStrength = 0;

  const floatingBlocks = createFloatingBlocks({ count: cfg.floatingBlockCount });
  fieldGroup.add(floatingBlocks.mesh);

  const coverPlane = createCoverPlane(cfg);
  fieldGroup.add(coverPlane.mesh);

  const fpsMonitor = createFpsMonitor();

  /** @type {ReturnType<typeof createTerrainGrid> | null} */
  let terrainGrid = null;

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

  function updateCamera() {
    const pitch = THREE.MathUtils.degToRad(cameraPitchDeg);
    const y = cameraDistance * Math.sin(pitch);
    const z = cameraDistance * Math.cos(pitch) * 0.58;
    camera.position.set(0, y, z);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
    uniforms.uCameraPos.value.copy(camera.position);
  }

  function applyDprCap(preset, gridSize) {
    savedPixelRatio = applySonicDprCap(renderer, savedPixelRatio, preset, gridSize);
  }

  function rebuildTerrain() {
    if (terrainGrid) {
      fieldGroup.remove(terrainGrid.mesh);
      terrainGrid.mesh.material.dispose();
      terrainGrid.dispose();
      terrainGrid = null;
    }

    gridSettings = resolveGridFromPreset(gridPreset, baseSize);
    const fresh = createTerrainMaterial();
    material = fresh.material;
    uniforms = fresh.uniforms;
    applyThemeToUniforms(themeCurrent, uniforms);
    uniforms.uTerrainHalf.value = gridSettings.terrainHalf;
    uniforms.uAmplitude.value = amplitudeFromSlider(cfg.groundEqAmplitude);

    terrainGrid = createTerrainGrid(gridSettings, material);
    fieldGroup.add(terrainGrid.mesh);
    rippleBuffer.clear();
    kickDeform = createKickDeformState();
    meteorSystem.clear();
    floatingBlocks.update(
      0,
      {},
      themeCurrent,
      {
        enabled: cfg.floatingBlocksEnabled,
        intensity: cfg.floatingBlockIntensity,
        speed: cfg.floatingBlockSpeed,
        minSize: cfg.floatingBlockMinSize,
        maxSize: cfg.floatingBlockMaxSize,
        count: cfg.floatingBlockCount,
      },
      elapsed,
      camera.position,
    );
    applyDprCap(gridPreset, gridSettings.gridSize);
    fpsMonitor.reset();
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

  rebuildTerrain();
  updateCamera();
  rebuildComposer();

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  function render(_points, shapeConfig, styleConfig, frameMeta, _spectrum, processed) {
    const style = styleConfig ?? {};

    const nextPreset = normalizeGridPreset(style.gridPreset, cfg.gridPreset);
    if (nextPreset !== gridPreset) {
      gridPreset = nextPreset;
      rebuildTerrain();
    }

    const nextThemeId = String(style.themeId ?? cfg.themeId).trim();
    if (nextThemeId !== themeTarget.id) {
      themeTarget = resolveTheme(nextThemeId);
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

    lerpThemeColors(themeCurrent, themeTarget, safeDt);
    applyThemeToUniforms(themeCurrent, uniforms);
    meteorSystem.setColor(themeCurrent.uWarmEdge);
    renderer.setClearColor(themeCurrent.uFogColor, 1);

    const motionSpeed = style.groundEqMotionSpeed ?? cfg.groundEqMotionSpeed;
    const amplitudeSlider = style.groundEqAmplitude ?? cfg.groundEqAmplitude;
    uniforms.uAmplitude.value = amplitudeFromSlider(amplitudeSlider);
    uniforms.uTime.value = elapsed;

    const proc =
      processed instanceof Float32Array
        ? processed
        : Float32Array.from(Array.isArray(processed) ? processed : []);

    triggerEngine.syncFromStyle(style, cfg);
    pendingMeteorStrength = 0;
    triggerEngine.evaluate(proc, audioState.prevProcessed, {
      onPulse: (strength) => {
        rippleBuffer.spawnKick(strength, gridSettings.terrainHalf, elapsed);
        kickDeform.target = applyKickImpulse(kickDeform.target, strength);
      },
      onSnare: (strength) => {
        rippleBuffer.spawnSnare(strength, gridSettings.terrainHalf, elapsed);
      },
      onMeteor: (strength) => {
        pendingMeteorStrength = strength;
      },
    });

    const raw = analyzeSpectrum(proc, audioState);
    const eqBands = Array.isArray(style.groundEqBands) ? style.groundEqBands : cfg.groundEqBands;
    const eqEnabled = Array.isArray(style.groundEqEnabledBands)
      ? style.groundEqEnabledBands
      : cfg.groundEqEnabledBands;
    let eq = applyGroundEq(raw, eqBands, eqEnabled);

    kickDeform = stepKickDeform({ ...kickDeform, delta: safeDt });
    const lows = mixKickIntoLowBands({
      subBass: eq.subBass,
      bass: eq.bass,
      kickDeform: kickDeform.current,
    });
    eq = { ...eq, subBass: lows.subBass, bass: lows.bass };

    const smoothed = smoothAudioUniforms(
      audioState,
      eq,
      motionSpeed,
      safeDt,
      Number(frameMeta?.rms ?? 0),
    );
    updateTerrainAudioUniforms(uniforms, smoothed);
    rippleBuffer.bindUniforms(/** @type {THREE.Vector4[]} */ (uniforms.uRipples.value), elapsed);

    const meteorEnabled =
      style.meteorEnabled !== undefined ? Boolean(style.meteorEnabled) : cfg.meteorEnabled;
    if (meteorEnabled && pendingMeteorStrength > 0) {
      meteorSystem.spawn(pendingMeteorStrength);
    }
    meteorSystem.tick(safeDt);

    const floatingEnabled =
      style.floatingBlocksEnabled !== undefined
        ? Boolean(style.floatingBlocksEnabled)
        : cfg.floatingBlocksEnabled;
    floatingBlocks.update(
      safeDt,
      smoothed,
      themeCurrent,
      {
        enabled: floatingEnabled,
        intensity: style.floatingBlockIntensity ?? cfg.floatingBlockIntensity,
        speed: style.floatingBlockSpeed ?? cfg.floatingBlockSpeed,
        minSize: style.floatingBlockMinSize ?? cfg.floatingBlockMinSize,
        maxSize: style.floatingBlockMaxSize ?? cfg.floatingBlockMaxSize,
        count: style.floatingBlockCount ?? cfg.floatingBlockCount,
      },
      elapsed,
      camera.position,
    );

    coverPlane.update(frameMeta?.coverTextures, {
      coverEnabled: style.coverEnabled !== undefined ? Boolean(style.coverEnabled) : cfg.coverEnabled,
      coverSize: style.coverSize ?? cfg.coverSize,
      coverHeight: style.coverHeight ?? cfg.coverHeight,
      coverOpacity: style.coverOpacity ?? cfg.coverOpacity,
    });

    fpsMonitor.tick(safeDt, gridPreset);

    try {
      composer?.render();
    } catch (err) {
      console.warn("[WaveDance] 音域回响 2 后处理渲染失败，回退直绘", err);
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
    if (terrainGrid) {
      fieldGroup.remove(terrainGrid.mesh);
      terrainGrid.mesh.material.dispose();
      terrainGrid.dispose();
      terrainGrid = null;
    }
    fieldGroup.remove(meteorSystem.meteorMesh);
    fieldGroup.remove(meteorSystem.burstPoints);
    meteorSystem.dispose();
    fieldGroup.remove(floatingBlocks.mesh);
    floatingBlocks.dispose();
    fieldGroup.remove(coverPlane.mesh);
    coverPlane.dispose();
    fpsMonitor.reset();
    scene.remove(fieldGroup);
    scene.remove(hemiLight);
    scene.remove(dirLight);
    rippleBuffer.dispose();
    triggerEngine.dispose();
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
