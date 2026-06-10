import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const HIGH_COUNT_THRESHOLD = 15000;
const HIGH_COUNT_UPDATE_INTERVAL = 1 / 30;

/** @param {string} hex */
function hexToColor(hex) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex)
    ? hex
    : DEFAULT_CONFIG.threeParticleGalaxy.particleColor;
  return new THREE.Color(safe);
}

/**
 * @param {number} count
 * @param {number} radius
 * @param {number} arms
 */
function fillGalaxyAttributes(count, radius, arms) {
  const positions = new Float32Array(count * 3);
  const baseAngles = new Float32Array(count);
  const baseRadii = new Float32Array(count);
  const baseHeights = new Float32Array(count);
  const seeds = new Float32Array(count);
  const safeArms = Math.max(1, Math.min(4, Math.round(arms)));

  for (let i = 0; i < count; i++) {
    const arm = i % safeArms;
    const armAngle = (arm / safeArms) * Math.PI * 2;
    const t = Math.random();
    const r = Math.pow(t, 0.62) * radius;
    const spiralTwist = r * 2.8;
    const angle = armAngle + spiralTwist + (Math.random() - 0.5) * 0.35;

    baseAngles[i] = angle;
    baseRadii[i] = r;
    baseHeights[i] = (Math.random() - 0.5) * 0.1 * radius;
    seeds[i] = Math.random() * 1000;

    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = baseHeights[i];
    positions[i * 3 + 2] = Math.sin(angle) * r;
  }

  return { positions, baseAngles, baseRadii, baseHeights, seeds };
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createParticleGalaxyRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 1.6, 2.8);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 50;
  camera.fov = 55;
  camera.updateProjectionMatrix();

  const galaxyGroup = new THREE.Group();
  scene.add(galaxyGroup);

  let particleCount = DEFAULT_CONFIG.threeParticleGalaxy.particleCount;
  let galaxyRadius = DEFAULT_CONFIG.threeParticleGalaxy.galaxyRadius;
  let spiralArms = DEFAULT_CONFIG.threeParticleGalaxy.spiralArms;

  let geometry = null;
  let material = null;
  let points = null;
  /** @type {Float32Array | null} */
  let baseAngles = null;
  /** @type {Float32Array | null} */
  let baseRadii = null;
  /** @type {Float32Array | null} */
  let baseHeights = null;
  /** @type {Float32Array | null} */
  let seeds = null;

  function rebuildParticles() {
    if (points) {
      galaxyGroup.remove(points);
      geometry?.dispose();
      material?.dispose();
    }

    const attrs = fillGalaxyAttributes(particleCount, galaxyRadius, spiralArms);
    baseAngles = attrs.baseAngles;
    baseRadii = attrs.baseRadii;
    baseHeights = attrs.baseHeights;
    seeds = attrs.seeds;

    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(attrs.positions, 3));

    material = new THREE.PointsMaterial({
      color: hexToColor(DEFAULT_CONFIG.threeParticleGalaxy.particleColor),
      size: 0.028,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    points = new THREE.Points(geometry, material);
    galaxyGroup.add(points);

    syncPerformancePixelRatio();
  }

  function syncPerformancePixelRatio() {
    const dpr =
      particleCount > HIGH_COUNT_THRESHOLD
        ? Math.min(1.5, window.devicePixelRatio || 1)
        : Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
  }

  rebuildParticles();

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeParticleGalaxy.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeParticleGalaxy.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let updateAccumulator = 0;
  let bassSmoothed = 0;
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

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  function updateParticlePositions(bass, treble, bassPull, trebleSpread, rotateRad) {
    if (!geometry || !baseAngles || !baseRadii || !baseHeights || !seeds) return;

    const posAttr = geometry.getAttribute("position");
    const positions = /** @type {Float32Array} */ (posAttr.array);
    const pull = bass * bassPull * 0.5;
    const spread = treble * trebleSpread;
    const time = elapsed;

    for (let i = 0; i < particleCount; i++) {
      const angle = baseAngles[i] + rotateRad;
      const r = baseRadii[i] * Math.max(0.05, 1 - pull);
      const seed = seeds[i];

      const nx = Math.sin(seed * 12.9898 + time * 1.7) * spread * galaxyRadius * 0.38;
      const nz = Math.cos(seed * 78.233 + time * 1.35) * spread * galaxyRadius * 0.38;
      const ny = baseHeights[i] + spread * Math.sin(seed * 0.17 + time * 2.1) * galaxyRadius * 0.15;

      positions[i * 3] = Math.cos(angle) * r + nx;
      positions[i * 3 + 1] = ny;
      positions[i * 3 + 2] = Math.sin(angle) * r + nz;
    }

    posAttr.needsUpdate = true;
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const nextCount = clampInt(
      Number(style.particleCount),
      2000,
      20000,
      DEFAULT_CONFIG.threeParticleGalaxy.particleCount,
    );
    const nextRadius = clampFloat(
      Number(style.galaxyRadius),
      0.5,
      2.5,
      DEFAULT_CONFIG.threeParticleGalaxy.galaxyRadius,
    );
    const nextArms = clampInt(
      Number(style.spiralArms),
      1,
      4,
      DEFAULT_CONFIG.threeParticleGalaxy.spiralArms,
    );

    if (nextCount !== particleCount || Math.abs(nextRadius - galaxyRadius) > 0.01 || nextArms !== spiralArms) {
      particleCount = nextCount;
      galaxyRadius = nextRadius;
      spiralArms = nextArms;
      rebuildParticles();
    }

    const bassPull =
      clampInt(Number(style.bassPullStrength), 0, 100, DEFAULT_CONFIG.threeParticleGalaxy.bassPullStrength) /
      100;
    const trebleSpread =
      clampInt(
        Number(style.trebleSpreadStrength),
        0,
        100,
        DEFAULT_CONFIG.threeParticleGalaxy.trebleSpreadStrength,
      ) / 100;
    const autoRotateSpeedDeg = clampFloat(
      Number(style.autoRotateSpeedDeg),
      0,
      20,
      DEFAULT_CONFIG.threeParticleGalaxy.autoRotateSpeedDeg,
    );
    const nextBloomEnabled =
      style.bloomEnabled !== undefined
        ? Boolean(style.bloomEnabled)
        : DEFAULT_CONFIG.threeParticleGalaxy.bloomEnabled;
    const nextBloomStrength =
      Number(style.bloomStrength) || DEFAULT_CONFIG.threeParticleGalaxy.bloomStrength;

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();
    syncPerformancePixelRatio();

    const dt = clock.getDelta();
    const safeDt = dt > 0 ? dt : 1 / 60;
    elapsed += safeDt;

    const bass = spectrum?.bass ?? 0;
    const treble = spectrum?.treble ?? 0;
    bassSmoothed += (bass - bassSmoothed) * 0.22;
    trebleSmoothed += (treble - trebleSmoothed) * 0.18;

    const peakBoost = frameMeta?.peak ? Number(frameMeta.peak) * 0.12 : 0;
    const effectiveBass = Math.min(1.2, bassSmoothed + peakBoost);
    const effectiveTreble = Math.min(1.2, trebleSmoothed + peakBoost * 0.5);

    const rotateRad = elapsed * THREE.MathUtils.degToRad(autoRotateSpeedDeg);
    galaxyGroup.rotation.y = rotateRad * 0.35;

    const updateInterval = particleCount > HIGH_COUNT_THRESHOLD ? HIGH_COUNT_UPDATE_INTERVAL : 0;
    updateAccumulator += safeDt;
    if (updateInterval === 0 || updateAccumulator >= updateInterval) {
      updateParticlePositions(effectiveBass, effectiveTreble, bassPull, trebleSpread, rotateRad);
      updateAccumulator = updateInterval > 0 ? updateAccumulator % updateInterval : 0;
    }

    if (style.particleColor && material) {
      material.color.copy(hexToColor(style.particleColor));
    }

    if (material) {
      material.size = 0.022 + effectiveBass * 0.012 + effectiveTreble * 0.006;
      material.opacity = 0.72 + effectiveBass * 0.2;
    }

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 粒子银河 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    if (points) {
      galaxyGroup.remove(points);
      geometry?.dispose();
      material?.dispose();
    }
    scene.remove(galaxyGroup);
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
