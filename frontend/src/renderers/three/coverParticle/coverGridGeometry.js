import * as THREE from "three";

const PLANE_SIZE = 4.8;

/**
 * @param {number} grid 奇数，88~183
 * @returns {THREE.BufferGeometry}
 */
export function buildCoverParticleGeometry(grid) {
  const safeGrid = Math.max(3, Math.floor(grid));
  const count = safeGrid * safeGrid;
  const positions = new Float32Array(count * 3);
  const aUv = new Float32Array(count * 2);
  const aRand = new Float32Array(count);
  const texelStep = 1 / safeGrid;

  for (let i = 0; i < count; i++) {
    const gx = i % safeGrid;
    const gy = Math.floor(i / safeGrid);
    const u = (gx + 0.5) * texelStep;
    const v = (gy + 0.5) * texelStep;
    const px = gx / (safeGrid - 1);
    const py = gy / (safeGrid - 1);

    positions[i * 3] = (px - 0.5) * PLANE_SIZE;
    positions[i * 3 + 1] = (py - 0.5) * PLANE_SIZE;
    positions[i * 3 + 2] = 0;
    aUv[i * 2] = u;
    aUv[i * 2 + 1] = v;
    aRand[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aUv", new THREE.BufferAttribute(aUv, 2));
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
  geo.userData = { grid: safeGrid, count };
  return geo;
}
