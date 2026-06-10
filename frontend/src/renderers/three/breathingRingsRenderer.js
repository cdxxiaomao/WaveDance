import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const MAX_RINGS = 8;
const TORUS_RADIAL_SEGMENTS = 24;
const TORUS_TUBULAR_SEGMENTS = 64;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createBreathingRingsRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0.35, 3.2);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 50;
  camera.fov = 50;
  camera.updateProjectionMatrix();

  const ringsRoot = new THREE.Group();
  scene.add(ringsRoot);

  /** @type {Array<{ mesh: THREE.Mesh, material: THREE.MeshBasicMaterial }>} */
  const rings = [];

  for (let i = 0; i < MAX_RINGS; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 16), material);
    mesh.visible = false;
    ringsRoot.add(mesh);
    rings.push({ mesh, material });
  }

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeBreathingRings.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeBreathingRings.bloomStrength;
  let lastComposerKey = "";
  let activeRingCount = DEFAULT_CONFIG.threeBreathingRings.ringCount;
  let lastGeomKey = "";
  let peakSmoothed = 0;
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

  /**
   * @param {number} ringCount
   * @param {number} baseRadius
   * @param {number} radiusStep
   * @param {number} tubeRadius
   */
  function rebuildRingGeometries(ringCount, baseRadius, radiusStep, tubeRadius) {
    const geomKey = `${ringCount}:${baseRadius.toFixed(3)}:${radiusStep.toFixed(3)}:${tubeRadius.toFixed(4)}`;
    if (geomKey === lastGeomKey) return;
    lastGeomKey = geomKey;

    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = rings[i];
      ring.mesh.geometry.dispose();
      if (i < ringCount) {
        const majorRadius = baseRadius + i * radiusStep;
        ring.mesh.geometry = new THREE.TorusGeometry(
          majorRadius,
          tubeRadius,
          TORUS_RADIAL_SEGMENTS,
          TORUS_TUBULAR_SEGMENTS,
        );
        ring.mesh.visible = true;
      } else {
        ring.mesh.geometry = new THREE.TorusGeometry(1, tubeRadius, 8, 16);
        ring.mesh.visible = false;
      }
    }
    activeRingCount = ringCount;
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, _spectrum) {
    const style = styleConfig ?? {};
    const cfg = DEFAULT_CONFIG.threeBreathingRings;

    const ringCount = clampInt(Number(style.ringCount), 2, 8, cfg.ringCount);
    const baseRadius = clampFloat(Number(style.baseRadius), 0.2, 0.8, cfg.baseRadius);
    const radiusStep = clampFloat(Number(style.radiusStep), 0.05, 0.3, cfg.radiusStep);
    const pulseStrength = clampFloat(Number(style.pulseStrength), 0, 100, cfg.pulseStrength);
    const tubeRadius = clampFloat(Number(style.tubeRadius), 0.01, 0.06, cfg.tubeRadius);
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

    if (
      ringCount !== activeRingCount ||
      lastGeomKey !==
        `${ringCount}:${baseRadius.toFixed(3)}:${radiusStep.toFixed(3)}:${tubeRadius.toFixed(4)}`
    ) {
      rebuildRingGeometries(ringCount, baseRadius, radiusStep, tubeRadius);
    }

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;
    peakSmoothed += (peak - peakSmoothed) * 0.18;

    const ringColor = hexToColor(style.ringColor, cfg.ringColor);
    const pulseFactor = pulseStrength / 100;

    for (let i = 0; i < ringCount; i++) {
      const ring = rings[i];
      const layerT = ringCount <= 1 ? 0.5 : i / (ringCount - 1);
      const layerFactor = 0.55 + layerT * 0.45;
      const pulse = 1 + pulseFactor * peakSmoothed * layerFactor;
      ring.mesh.scale.setScalar(pulse);

      const brightness = 0.62 + layerT * 0.28 + peakSmoothed * 0.22;
      ring.material.color.copy(ringColor).multiplyScalar(brightness);
      ring.material.opacity = Math.min(1, 0.52 + layerT * 0.22 + peakSmoothed * 0.18);
    }

    ringsRoot.rotation.y = elapsed * THREE.MathUtils.degToRad(autoRotateSpeedDeg);
    ringsRoot.rotation.x = Math.sin(elapsed * 0.42) * 0.12;

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 呼吸光环 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    for (let i = 0; i < MAX_RINGS; i++) {
      rings[i].mesh.geometry.dispose();
      rings[i].material.dispose();
      ringsRoot.remove(rings[i].mesh);
    }
    scene.remove(ringsRoot);
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
