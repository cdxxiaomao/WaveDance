import * as THREE from "three";

const MAX_RIPPLES = 12;
const RIPPLE_LIFETIME_S = 2.6;

/**
 * CPU 维护最多 12 条涟漪，写入 1×12 RGBA Float 纹理供 Shader 采样。
 */
export function createRippleManager() {
  /** @type {{ x: number, y: number, age: number, strength: number }[]} */
  const ripples = [];
  const data = new Float32Array(MAX_RIPPLES * 4);
  const texture = new THREE.DataTexture(data, MAX_RIPPLES, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  function syncTexture() {
    data.fill(0);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      if (!r) continue;
      const base = i * 4;
      data[base] = r.x;
      data[base + 1] = r.y;
      data[base + 2] = r.age;
      data[base + 3] = r.strength;
    }
    texture.needsUpdate = true;
  }

  /**
   * @param {number} x 封面平面局部 X（约 ±2.4）
   * @param {number} y 封面平面局部 Y
   * @param {number} [strength=1]
   */
  function addRipple(x, y, strength = 1) {
    ripples.unshift({
      x,
      y,
      age: 0,
      strength: Math.min(1.5, Math.max(0.15, strength)),
    });
    while (ripples.length > MAX_RIPPLES) ripples.pop();
    syncTexture();
  }

  /** @param {number} dt 秒 */
  function tick(dt) {
    if (ripples.length === 0) return;
    const safeDt = Math.max(0, dt);
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += safeDt;
      if (ripples[i].age > RIPPLE_LIFETIME_S) ripples.splice(i, 1);
    }
    syncTexture();
  }

  function clear() {
    ripples.length = 0;
    syncTexture();
  }

  function dispose() {
    texture.dispose();
    ripples.length = 0;
  }

  return { addRipple, tick, clear, texture, dispose };
}
