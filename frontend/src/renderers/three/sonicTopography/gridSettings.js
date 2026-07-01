import * as THREE from "three";

export const TERRAIN_BASE_SIZE = 168;
export const TERRAIN_MIN_GRID = 96;
export const TERRAIN_MAX_GRID = 224;

/** @type {Record<string, number>} */
export const GRID_PRESET_SIZES = {
  eco: 96,
  normal: 128,
  high: 160,
};

/**
 * @param {number} densityPercent 0~100
 * @param {number} [baseSize]
 */
export function deriveGridSettings(densityPercent, baseSize = TERRAIN_BASE_SIZE) {
  const density = Math.min(100, Math.max(0, Number(densityPercent) || 0));
  const gridSize = Math.round(TERRAIN_MIN_GRID + (TERRAIN_MAX_GRID - TERRAIN_MIN_GRID) * (density / 100));
  const spacing = baseSize / gridSize;
  const boxWidth = spacing;
  return {
    gridSize,
    spacing,
    boxWidth,
    baseSize,
    terrainHalf: baseSize * 0.5,
    instanceCount: gridSize * gridSize,
  };
}

/** @param {string} preset */
export function gridSizeFromPreset(preset) {
  const key = String(preset ?? "normal").trim();
  return GRID_PRESET_SIZES[key] ?? GRID_PRESET_SIZES.normal;
}

/** @param {string} preset @param {number} [baseSize] */
export function resolveGridFromPreset(preset, baseSize = TERRAIN_BASE_SIZE) {
  const gridSize = gridSizeFromPreset(preset);
  const spacing = baseSize / gridSize;
  const boxWidth = spacing;
  return {
    gridSize,
    spacing,
    boxWidth,
    baseSize,
    terrainHalf: baseSize * 0.5,
    instanceCount: gridSize * gridSize,
  };
}

/**
 * @param {ReturnType<typeof deriveGridSettings>} gridSettings
 * @param {THREE.Material} material
 */
export function createTerrainGrid(gridSettings, material) {
  const { gridSize, spacing, boxWidth, baseSize } = gridSettings;
  const half = baseSize * 0.5;
  const count = gridSize * gridSize;

  const geometry = new THREE.BoxGeometry(boxWidth, 1, boxWidth);
  geometry.translate(0, 0.5, 0);

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let iz = 0; iz < gridSize; iz++) {
    for (let ix = 0; ix < gridSize; ix++) {
      const x = ix * spacing - half + spacing * 0.5;
      const z = iz * spacing - half + spacing * 0.5;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      idx += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;

  function dispose() {
    geometry.dispose();
  }

  return { mesh, geometry, gridSize, gridSettings, dispose };
}
