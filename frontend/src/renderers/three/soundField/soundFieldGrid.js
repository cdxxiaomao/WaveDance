import * as THREE from "three";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";

/** @param {string} hex */
function hexToColor(hex) {
  return new THREE.Color(/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#8f7cff");
}

/**
 * @param {string} preset
 * @param {typeof DEFAULT_CONFIG.threeSoundField} [cfg]
 */
export function soundFieldGridSize(preset, cfg = DEFAULT_CONFIG.threeSoundField) {
  if (preset === "eco") return cfg.gridSizeEco;
  if (preset === "high") return cfg.gridSizeHigh;
  return cfg.gridSizeNormal;
}

/**
 * @param {number} gridSize
 * @param {{
 *   worldWidth?: number,
 *   worldDepth?: number,
 *   maxBarHeight?: number,
 *   barFootprint?: number,
 *   colorLow?: string,
 *   colorMid?: string,
 *   colorHigh?: string,
 * }} opts
 */
export function createSoundFieldGrid(gridSize, opts = {}) {
  const cfg = DEFAULT_CONFIG.threeSoundField;
  const worldWidth = opts.worldWidth ?? cfg.worldWidth;
  const worldDepth = opts.worldDepth ?? cfg.worldDepth;
  const maxBarHeight = opts.maxBarHeight ?? cfg.maxBarHeight;
  const footprint = opts.barFootprint ?? cfg.barFootprint;

  const count = gridSize * gridSize;
  const geometry = new THREE.BoxGeometry(footprint, 1, footprint);
  geometry.translate(0, 0.5, 0);

  const material = new THREE.MeshStandardMaterial({
    metalness: 0.12,
    roughness: 0.58,
    emissive: new THREE.Color(0x080812),
    emissiveIntensity: 0.35,
    vertexColors: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const currentHeights = new Float32Array(count);
  const colorLow = hexToColor(opts.colorLow ?? cfg.colorLow);
  const colorMid = hexToColor(opts.colorMid ?? cfg.colorMid);
  const colorHigh = hexToColor(opts.colorHigh ?? cfg.colorHigh);
  const tempColor = new THREE.Color();
  const dummy = new THREE.Object3D();

  function updateMatrices(heights) {
    for (let i = 0; i < count; i++) {
      const ix = i % gridSize;
      const iz = Math.floor(i / gridSize);
      const x = (ix + 0.5) / gridSize * worldWidth - worldWidth * 0.5;
      const z = (iz + 0.5) / gridSize * worldDepth - worldDepth * 0.5;
      const norm = Math.max(0, Math.min(1, heights[i] ?? 0));
      const h = Math.max(0.03, norm * maxBarHeight);

      dummy.position.set(x, h * 0.5, z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      tempColor.copy(colorLow).lerp(colorMid, norm * 0.72);
      tempColor.lerp(colorHigh, norm * norm);
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return {
    mesh,
    currentHeights,
    gridSize,
    worldWidth,
    worldDepth,
    maxBarHeight,
    updateMatrices,
    dispose,
  };
}

/**
 * @param {string} groundColor
 * @param {number} worldWidth
 * @param {number} worldDepth
 */
export function createSoundFieldGround(groundColor, worldWidth, worldDepth) {
  const mat = new THREE.MeshBasicMaterial({
    color: hexToColor(groundColor),
    transparent: true,
    opacity: 0.92,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth * 1.02, worldDepth * 1.02), mat);
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.y = -0.01;
  return mesh;
}
