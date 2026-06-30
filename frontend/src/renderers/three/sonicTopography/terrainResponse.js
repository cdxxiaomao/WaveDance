/** Kick 低频脉冲叠加 sub-bass / bass（参考 sonic terrainResponse） */

/** @param {number} target @param {number} strength */
export function applyKickImpulse(target, strength) {
  const s = Math.max(0, Number(strength) || 0);
  return Math.min(1, Math.max(0, target) + s * 0.85);
}

/**
 * @param {{ current: number, target: number, delta: number }} params
 * @returns {{ current: number, target: number }}
 */
export function stepKickDeform({ current, target, delta }) {
  const safeDelta = Math.max(0, Number(delta) || 0);
  const attack = 1 - Math.exp(-18 * safeDelta);
  const release = 1 - Math.exp(-4.5 * safeDelta);
  const c = Number(current) || 0;
  const t = Number(target) || 0;
  const blend = t > c ? attack : release;
  const nextCurrent = c + (t - c) * blend;
  const nextTarget = Math.max(0, t - safeDelta * 0.35);
  return { current: nextCurrent, target: nextTarget };
}

/**
 * @param {{ subBass: number, bass: number, kickDeform: number }} params
 */
export function mixKickIntoLowBands({ subBass, bass, kickDeform }) {
  const k = Math.max(0, Number(kickDeform) || 0);
  const subBoost = 1 + k * 2.8;
  const bassBoost = 1 + k * 1.6;
  return {
    subBass: Math.min(1, Math.max(0, subBass) * subBoost),
    bass: Math.min(1, Math.max(0, bass) * bassBoost),
  };
}

/** @returns {{ current: number, target: number }} */
export function createKickDeformState() {
  return { current: 0, target: 0 };
}
