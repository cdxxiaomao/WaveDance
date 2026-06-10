import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const ICOSAHEDRON_DETAIL = 5;
const CORE_RADIUS = 0.82;
const HALO_INNER_RADIUS = 1.05;
const HALO_OUTER_RADIUS = 1.55;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {Float32Array} bandPeaks
 * @param {number} t01
 */
function sampleBandPeaks(bandPeaks, t01) {
  const count = bandPeaks.length;
  if (count === 0) return 0;
  const wrapped = ((t01 % 1) + 1) % 1;
  const f = wrapped * count;
  const i0 = Math.floor(f) % count;
  const i1 = (i0 + 1) % count;
  const frac = f - Math.floor(f);
  return bandPeaks[i0] * (1 - frac) + bandPeaks[i1] * frac;
}

/** @param {number} x @param {number} y @param {number} z @param {number} t */
function simpleNoise3(x, y, z, t) {
  const a = Math.sin(x * 2.17 + y * 1.31 + z * 0.73 + t * 1.1);
  const b = Math.cos(y * 1.67 - z * 2.13 + t * 0.85);
  const c = Math.sin(z * 1.89 + x * 0.57 - t * 0.62);
  return a * b * c;
}

/**
 * @param {number} count
 * @param {number} innerR
 * @param {number} outerR
 */
function fillHaloAttributes(count, innerR, outerR) {
  const positions = new Float32Array(count * 3);
  const baseAngles = new Float32Array(count);
  const baseRadii = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = innerR + Math.random() * (outerR - innerR);

    baseAngles[i] = theta;
    baseRadii[i] = r;
    seeds[i] = Math.random() * 1000;

    const sinPhi = Math.sin(phi);
    positions[i * 3] = sinPhi * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r;
    positions[i * 3 + 2] = sinPhi * Math.sin(theta) * r;
  }

  return { positions, baseAngles, baseRadii, seeds };
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createEnergySphereRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.position.set(0, 0.2, 3.2);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 50;
  camera.fov = 50;
  camera.updateProjectionMatrix();

  const sphereGroup = new THREE.Group();
  scene.add(sphereGroup);

  const coreGeometry = new THREE.IcosahedronGeometry(CORE_RADIUS, ICOSAHEDRON_DETAIL);
  const posAttr = coreGeometry.getAttribute("position");
  const vertexCount = posAttr.count;
  const originalPositions = new Float32Array(posAttr.array);

  const coreMaterial = new THREE.MeshStandardMaterial({
    color: hexToColor(
      DEFAULT_CONFIG.threeEnergySphere.coreColor,
      DEFAULT_CONFIG.threeEnergySphere.coreColor,
    ),
    emissive: hexToColor(
      DEFAULT_CONFIG.threeEnergySphere.coreColor,
      DEFAULT_CONFIG.threeEnergySphere.coreColor,
    ),
    emissiveIntensity: 0.55,
    metalness: 0.35,
    roughness: 0.42,
    flatShading: false,
    transparent: true,
    opacity: 0.92,
  });

  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  sphereGroup.add(coreMesh);

  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: hexToColor(
      DEFAULT_CONFIG.threeEnergySphere.coreColor,
      DEFAULT_CONFIG.threeEnergySphere.coreColor,
    ),
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const wireframeMesh = new THREE.Mesh(coreGeometry, wireframeMaterial);
  wireframeMesh.visible = DEFAULT_CONFIG.threeEnergySphere.wireframeOverlay;
  sphereGroup.add(wireframeMesh);

  let haloParticleCount = DEFAULT_CONFIG.threeEnergySphere.haloParticleCount;
  let haloGeometry = null;
  let haloMaterial = null;
  let haloPoints = null;
  /** @type {Float32Array | null} */
  let haloBaseAngles = null;
  /** @type {Float32Array | null} */
  let haloBaseRadii = null;
  /** @type {Float32Array | null} */
  let haloSeeds = null;

  function rebuildHalo() {
    if (haloPoints) {
      sphereGroup.remove(haloPoints);
      haloGeometry?.dispose();
      haloMaterial?.dispose();
    }

    const attrs = fillHaloAttributes(haloParticleCount, HALO_INNER_RADIUS, HALO_OUTER_RADIUS);
    haloBaseAngles = attrs.baseAngles;
    haloBaseRadii = attrs.baseRadii;
    haloSeeds = attrs.seeds;

    haloGeometry = new THREE.BufferGeometry();
    haloGeometry.setAttribute("position", new THREE.BufferAttribute(attrs.positions, 3));

    haloMaterial = new THREE.PointsMaterial({
      color: hexToColor(
        DEFAULT_CONFIG.threeEnergySphere.haloColor,
        DEFAULT_CONFIG.threeEnergySphere.haloColor,
      ),
      size: 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    haloPoints = new THREE.Points(haloGeometry, haloMaterial);
    sphereGroup.add(haloPoints);
  }

  rebuildHalo();

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeEnergySphere.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeEnergySphere.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let bassSmoothed = 0;
  let midSmoothed = 0;
  let trebleSmoothed = 0;
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
        luminanceSmoothing: 0.32,
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

  function deformCore(bandPeaks, deformStrength, noiseSpeed, bass, mid, treble) {
    const positions = /** @type {Float32Array} */ (posAttr.array);
    const deform = (deformStrength / 100) * 0.38;
    const noiseAmt = 0.12 + mid * 0.18;
    const time = elapsed * noiseSpeed;

    for (let i = 0; i < vertexCount; i++) {
      const ox = originalPositions[i * 3];
      const oy = originalPositions[i * 3 + 1];
      const oz = originalPositions[i * 3 + 2];

      const len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      const nx = ox / len;
      const ny = oy / len;
      const nz = oz / len;

      const azimuth = (Math.atan2(nz, nx) / (Math.PI * 2) + 0.5) % 1;
      const bandVal = sampleBandPeaks(bandPeaks, azimuth);
      const noise = simpleNoise3(nx * 2.4, ny * 2.4, nz * 2.4, time) * noiseAmt;
      const radial =
        CORE_RADIUS * (1 + deform * (bandVal * 0.85 + bass * 0.25 + treble * 0.12 + noise));

      positions[i * 3] = nx * radial;
      positions[i * 3 + 1] = ny * radial;
      positions[i * 3 + 2] = nz * radial;
    }

    posAttr.needsUpdate = true;
    coreGeometry.computeVertexNormals();
  }

  function updateHalo(bass, treble, rotateRad) {
    if (!haloGeometry || !haloBaseAngles || !haloBaseRadii || !haloSeeds) return;

    const haloPosAttr = haloGeometry.getAttribute("position");
    const positions = /** @type {Float32Array} */ (haloPosAttr.array);
    const pulse = 1 + bass * 0.22 + treble * 0.1;
    const time = elapsed;

    for (let i = 0; i < haloParticleCount; i++) {
      const theta = haloBaseAngles[i] + rotateRad * 0.6;
      const seed = haloSeeds[i];
      const r =
        haloBaseRadii[i] *
        pulse *
        (1 + Math.sin(seed * 0.31 + time * 1.4) * treble * 0.12);
      const wobble = Math.sin(seed * 0.17 + time * 2.2) * treble * 0.08;

      const sinPhi = Math.sin(seed * 0.09 + 1.2);
      const cosPhi = Math.cos(seed * 0.11 + 0.8);
      positions[i * 3] = Math.cos(theta) * sinPhi * r + wobble;
      positions[i * 3 + 1] = cosPhi * r + wobble * 0.5;
      positions[i * 3 + 2] = Math.sin(theta) * sinPhi * r - wobble;
    }

    haloPosAttr.needsUpdate = true;
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const nextHaloCount = clampInt(
      Number(style.haloParticleCount),
      200,
      3000,
      DEFAULT_CONFIG.threeEnergySphere.haloParticleCount,
    );

    if (nextHaloCount !== haloParticleCount) {
      haloParticleCount = nextHaloCount;
      rebuildHalo();
    }

    const deformStrength = clampInt(
      Number(style.deformStrength),
      0,
      100,
      DEFAULT_CONFIG.threeEnergySphere.deformStrength,
    );
    const noiseSpeed = clampFloat(
      Number(style.noiseSpeed),
      0.2,
      3,
      DEFAULT_CONFIG.threeEnergySphere.noiseSpeed,
    );
    const autoRotateSpeedDeg = clampFloat(
      Number(style.autoRotateSpeedDeg),
      0,
      20,
      DEFAULT_CONFIG.threeEnergySphere.autoRotateSpeedDeg,
    );
    const wireframeOverlay =
      style.wireframeOverlay !== undefined
        ? Boolean(style.wireframeOverlay)
        : DEFAULT_CONFIG.threeEnergySphere.wireframeOverlay;
    const nextBloomEnabled =
      style.bloomEnabled !== undefined
        ? Boolean(style.bloomEnabled)
        : DEFAULT_CONFIG.threeEnergySphere.bloomEnabled;
    const nextBloomStrength =
      Number(style.bloomStrength) || DEFAULT_CONFIG.threeEnergySphere.bloomStrength;

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
    const bandPeaks = spectrum?.bandPeaks ?? new Float32Array(8);
    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;

    bassSmoothed += (bass - bassSmoothed) * 0.2;
    midSmoothed += (mid - midSmoothed) * 0.18;
    trebleSmoothed += (treble - trebleSmoothed) * 0.16;
    peakSmoothed += (peak - peakSmoothed) * 0.15;

    const rotateRad = elapsed * THREE.MathUtils.degToRad(autoRotateSpeedDeg);
    sphereGroup.rotation.y = rotateRad;

    const breathe = 1 + peakSmoothed * 0.18 + bassSmoothed * 0.08;
    sphereGroup.scale.setScalar(breathe);

    deformCore(bandPeaks, deformStrength, noiseSpeed, bassSmoothed, midSmoothed, trebleSmoothed);
    updateHalo(bassSmoothed, trebleSmoothed, rotateRad);

    wireframeMesh.visible = wireframeOverlay;

    const coreCol = hexToColor(style.coreColor, DEFAULT_CONFIG.threeEnergySphere.coreColor);
    coreMaterial.color.copy(coreCol);
    coreMaterial.emissive.copy(coreCol);
    coreMaterial.emissiveIntensity = 0.45 + bassSmoothed * 0.35 + midSmoothed * 0.15;
    wireframeMaterial.color.copy(coreCol);

    if (haloMaterial) {
      haloMaterial.color.copy(
        hexToColor(style.haloColor, DEFAULT_CONFIG.threeEnergySphere.haloColor),
      );
      haloMaterial.size = 0.028 + bassSmoothed * 0.014 + trebleSmoothed * 0.008;
      haloMaterial.opacity = 0.62 + bassSmoothed * 0.28;
    }

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 能量球 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    sphereGroup.remove(coreMesh);
    sphereGroup.remove(wireframeMesh);
    if (haloPoints) {
      sphereGroup.remove(haloPoints);
    }
    coreGeometry.dispose();
    coreMaterial.dispose();
    wireframeMaterial.dispose();
    haloGeometry?.dispose();
    haloMaterial?.dispose();
    scene.remove(sphereGroup);
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
