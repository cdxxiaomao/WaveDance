import * as THREE from "three";
import {
  createFloatingBlockMaterial,
  updateFloatingBlockAudioUniforms,
} from "./floatingBlockMaterial.js";
import { applyThemeToUniforms } from "./themes.js";

const DEFAULT_COUNT = 80;
const MIN_RADIUS = 14;
const MAX_RADIUS = 76;

/**
 * @param {{
 *   count?: number,
 *   minRadius?: number,
 *   maxRadius?: number,
 * }} [opts]
 */
export function createFloatingBlocks(opts = {}) {
  let instanceCount = Math.max(0, Math.round(opts.count ?? DEFAULT_COUNT));
  const minRadius = opts.minRadius ?? MIN_RADIUS;
  const maxRadius = opts.maxRadius ?? MAX_RADIUS;

  const { material, uniforms } = createFloatingBlockMaterial();
  const geometry = new THREE.BoxGeometry(1, 1.2, 1);
  geometry.translate(0, 0.6, 0);

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instanceCount));
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  /** @type {{ angle: number, radius: number, yOffset: number, seed: number }[]} */
  let layout = [];

  function rebuildLayout(count) {
    instanceCount = Math.max(0, Math.round(count));
    layout = [];
    for (let i = 0; i < instanceCount; i++) {
      const t = instanceCount > 1 ? i / instanceCount : 0;
      const angle = t * Math.PI * 2 + (i % 3) * 0.18;
      const radiusT = hash01(i * 1.37 + 0.5);
      const radius = minRadius + (maxRadius - minRadius) * radiusT;
      layout.push({
        angle,
        radius,
        yOffset: hash01(i * 2.11) * 0.6,
        seed: hash01(i * 3.73),
      });
    }
    mesh.count = Math.max(0, instanceCount);
    mesh.visible = instanceCount > 0;
  }

  rebuildLayout(instanceCount);

  const dummy = new THREE.Object3D();

  /**
   * @param {number} dt
   * @param {Record<string, number>} audio
   * @param {import('./themes.js').SonicThemeColors} theme
   * @param {{
   *   enabled?: boolean,
   *   intensity?: number,
   *   speed?: number,
   *   minSize?: number,
   *   maxSize?: number,
   *   count?: number,
   * }} style
   * @param {number} elapsed
   * @param {THREE.Vector3} cameraPos
   * @param {number} [currentRotationY=0] 当前的场景旋转角度
   */
  function update(dt, audio, theme, style, elapsed, cameraPos, currentRotationY = 0) {
    const enabled = style.enabled !== false;
    const nextCount = Math.max(0, Math.round(style.count ?? instanceCount));
    if (nextCount !== instanceCount) {
      rebuildLayout(nextCount);
    }

    mesh.visible = enabled && instanceCount > 0;
    if (!mesh.visible) return;

    uniforms.uTime.value = elapsed;
    uniforms.uIntensity.value = Math.min(1, Math.max(0, (Number(style.intensity) || 55) / 100));
    uniforms.uSpeed.value = Number(style.speed) || 77;
    uniforms.uMinSize.value = Number(style.minSize) || 9;
    uniforms.uMaxSize.value = Number(style.maxSize) || 26;

    applyThemeToUniforms(theme, uniforms);
    updateFloatingBlockAudioUniforms(uniforms, audio);

    const speedNorm = uniforms.uSpeed.value * 0.01;
    for (let i = 0; i < instanceCount; i++) {
      const item = layout[i];
      const drift = Math.sin(elapsed * speedNorm * 0.6 + item.seed * 9.0) * 0.35;
      // 将当前旋转角度考虑进去，使柱子随着场景旋转
      const effectiveAngle = item.angle + currentRotationY + drift * 0.08;
      const x = Math.cos(effectiveAngle) * item.radius;
      const z = Math.sin(effectiveAngle) * item.radius;
      const y = item.yOffset + Math.sin(elapsed * speedNorm + item.seed * 6.28) * 0.15;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, effectiveAngle + drift * 0.04, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, uniforms, update, dispose };
}

/** @param {number} n */
function hash01(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
