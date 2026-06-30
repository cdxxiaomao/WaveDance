import * as THREE from "three";
import { MAX_RIPPLES } from "./terrainMaterial.js";

const RIPPLE_LIFETIME = 4.2;

/**
 * @typedef {Object} RippleSlot
 * @property {number} x
 * @property {number} z
 * @property {number} spawnTime
 * @property {number} strength signed: >0 kick, <0 snare
 * @property {boolean} active
 */

/** @returns {RippleSlot} */
function emptyRipple() {
  return { x: 0, z: 0, spawnTime: 0, strength: 0, active: false };
}

export function createRippleBuffer() {
  /** @type {RippleSlot[]} */
  const ripples = Array.from({ length: MAX_RIPPLES }, emptyRipple);
  let writeIndex = 0;

  /**
   * @param {number} x
   * @param {number} z
   * @param {number} strength 0~1
   * @param {boolean} isWhite Snare 白波
   * @param {number} spawnTime
   */
  function spawn(x, z, strength, isWhite = false, spawnTime = 0) {
    const s = Math.min(1, Math.max(0.08, Number(strength) || 0));
    const slot = ripples[writeIndex];
    slot.x = x;
    slot.z = z;
    slot.spawnTime = spawnTime;
    slot.strength = isWhite ? -s : s;
    slot.active = true;
    writeIndex = (writeIndex + 1) % MAX_RIPPLES;
  }

  /** Kick 偏向中心（dist < 20） */
  function spawnKick(strength, terrainHalf = 84, spawnTime = 0) {
    const maxR = Math.min(20, terrainHalf * 0.24);
    const r = Math.random() * maxR;
    const a = Math.random() * Math.PI * 2;
    spawn(Math.cos(a) * r, Math.sin(a) * r, strength, false, spawnTime);
  }

  /** Snare 分布更广 */
  function spawnSnare(strength, terrainHalf = 84, spawnTime = 0) {
    const minR = 6;
    const maxR = terrainHalf * 0.82;
    const r = minR + Math.random() * (maxR - minR);
    const a = Math.random() * Math.PI * 2;
    spawn(Math.cos(a) * r, Math.sin(a) * r, strength, true, spawnTime);
  }

  /** @param {number} elapsedTime */
  function tick(elapsedTime) {
    for (const r of ripples) {
      if (!r.active) continue;
      if (elapsedTime - r.spawnTime > RIPPLE_LIFETIME) {
        r.active = false;
        r.strength = 0;
      }
    }
  }

  /**
   * @param {THREE.Vector4[]} uniformArray
   * @param {number} elapsedTime
   */
  function bindUniforms(uniformArray, elapsedTime) {
    tick(elapsedTime);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      const vec = uniformArray[i];
      if (!r.active) {
        vec.set(0, 0, 0, 0);
        continue;
      }
      vec.set(r.x, r.z, r.spawnTime, r.strength);
    }
  }

  function clear() {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples[i] = emptyRipple();
      writeIndex = 0;
    }
  }

  function dispose() {
    clear();
  }

  return { spawn, spawnKick, spawnSnare, tick, bindUniforms, clear, dispose };
}
