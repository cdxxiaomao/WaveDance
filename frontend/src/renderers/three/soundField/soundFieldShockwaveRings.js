import * as THREE from "three";
import { MAX_RIPPLES, RIPPLE_LIFETIME_S } from "./soundFieldRippleManager.js";
import { sampleHorizonSurface } from "./soundFieldHorizon.js";

const SLOTS_PER_RIPPLE = 2;
const MAX_SLOTS = MAX_RIPPLES * SLOTS_PER_RIPPLE;
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

/** @param {string} hex */
function hexToColor(hex) {
  return new THREE.Color(/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#8f7cff");
}

/**
 * 地面可见爆炸扩散环（Additive + Bloom），波前半径与 rippleManager 同步。
 */
export function createSoundFieldShockwaveRings() {
  const group = new THREE.Group();
  group.renderOrder = 1;

  const torusGeo = new THREE.TorusGeometry(1, 0.065, 8, 72);
  torusGeo.rotateX(Math.PI * 0.5);

  /** @type {Array<{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial }>} */
  const slots = [];

  for (let i = 0; i < MAX_SLOTS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa894ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(torusGeo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    slots.push({ mesh, mat });
  }

  let colorMid = hexToColor("#5c56a8");
  let colorHigh = hexToColor("#a894ff");

  /**
   * @param {readonly { x: number, z: number, age: number, strength: number, speed: number, ringWidth: number }[]} ripples
   * @param {number} strengthPercent 0~100
   * @param {import('./soundFieldHorizon.js').SoundFieldHorizonOptions | null | undefined} [horizonOpts]
   */
  function sync(ripples, strengthPercent, horizonOpts) {
    const power = Math.max(0, Math.min(1, strengthPercent / 100));
    let slotIdx = 0;

    for (const r of ripples) {
      const lifeFade = 1 - r.age / RIPPLE_LIFETIME_S;
      if (lifeFade <= 0) continue;

      const front = r.age * r.speed;
      const bands = [
        { radius: front, alphaScale: 1, colorMix: 0.38, tube: 1 },
        { radius: front * 0.52, alphaScale: 0.48, colorMix: 0.68, tube: 0.82 },
      ];

      for (const band of bands) {
        if (slotIdx >= MAX_SLOTS) break;
        if (band.radius < 0.08) continue;

        const alpha =
          lifeFade * power * r.strength * band.alphaScale * Math.exp(-band.radius * 0.095) * 0.88;
        if (alpha < 0.02) continue;

        const { mesh, mat } = slots[slotIdx];
        mesh.visible = true;
        if (horizonOpts) {
          const surf = sampleHorizonSurface(r.x, r.z, horizonOpts);
          _quat.setFromUnitVectors(_up, surf.normal);
          mesh.quaternion.copy(_quat);
          mesh.position.set(r.x, surf.yBase + 0.045, r.z);
        } else {
          mesh.quaternion.identity();
          mesh.position.set(r.x, 0.04, r.z);
        }
        mesh.scale.set(band.radius, band.radius, band.radius * band.tube);
        mat.color.copy(colorMid).lerp(colorHigh, band.colorMix);
        mat.opacity = Math.min(0.95, alpha);
        slotIdx++;
      }
    }

    for (let i = slotIdx; i < MAX_SLOTS; i++) {
      slots[i].mesh.visible = false;
      slots[i].mat.opacity = 0;
    }
  }

  /** @param {string} colorMidHex @param {string} colorHighHex */
  function setThemeColors(colorMidHex, colorHighHex) {
    colorMid = hexToColor(colorMidHex);
    colorHigh = hexToColor(colorHighHex);
  }

  function dispose() {
    for (const { mesh, mat } of slots) {
      mat.dispose();
      group.remove(mesh);
    }
    torusGeo.dispose();
  }

  return { group, sync, setThemeColors, dispose };
}
