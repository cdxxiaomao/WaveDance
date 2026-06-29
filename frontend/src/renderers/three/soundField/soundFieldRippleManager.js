const MAX_RIPPLES = 8;
const RIPPLE_LIFETIME_S = 1.8;
const SPAWN_COOLDOWN_S = 0.12;

/**
 * bass 触地涟漪：CPU 维护环形波，叠加到柱高度场。
 * @param {number} worldWidth
 * @param {number} worldDepth
 */
export function createSoundFieldRippleManager(worldWidth, worldDepth) {
  /** @type {{ x: number, z: number, age: number, strength: number, radius: number }[]} */
  const ripples = [];
  let lastSpawnAt = -999;
  let phase = 0;

  /**
   * @param {number} sensitivity 0~100，越高越容易触发
   */
  function bassThreshold(sensitivity) {
    return (1 - Math.max(0, Math.min(100, sensitivity)) / 100) * 0.55;
  }

  /**
   * @param {number} bass 0~1
   * @param {number} sensitivity 0~100
   * @param {number} [beatBoost=0] 额外鼓点增益 0~1
   */
  function pushIfTriggered(bass, sensitivity, beatBoost = 0) {
    const level = Math.max(0, Math.min(1, bass + beatBoost * 0.35));
    if (level <= bassThreshold(sensitivity)) return;

    const now = performance.now() / 1000;
    if (now - lastSpawnAt < SPAWN_COOLDOWN_S) return;
    lastSpawnAt = now;

    const spread = Math.min(worldWidth, worldDepth) * 0.38;
    ripples.unshift({
      x: (Math.random() - 0.5) * spread,
      z: (Math.random() - 0.5) * spread,
      age: 0,
      strength: 0.5 + level * 0.55,
      radius: 1.6 + level * 2.4,
    });
    while (ripples.length > MAX_RIPPLES) ripples.pop();
  }

  /** @param {number} dt */
  function tick(dt) {
    const safeDt = Math.max(0, dt);
    phase += safeDt * 9.5;
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += safeDt;
      if (ripples[i].age > RIPPLE_LIFETIME_S) ripples.splice(i, 1);
    }
  }

  /**
   * 将涟漪 boost 叠加到高度场（0~1 归一化高度）。
   * @param {Float32Array} heights
   * @param {number} gridSize
   * @param {number} rippleStrengthPercent 0~100
   */
  function applyToHeights(heights, gridSize, rippleStrengthPercent) {
    if (ripples.length === 0) return;

    const amp = Math.max(0, Math.min(1, rippleStrengthPercent / 100)) * 0.24;
    const x0 = -worldWidth * 0.5;
    const z0 = -worldDepth * 0.5;
    const xStep = worldWidth / gridSize;
    const zStep = worldDepth / gridSize;

    for (let i = 0; i < heights.length; i++) {
      const ix = i % gridSize;
      const iz = Math.floor(i / gridSize);
      const cx = x0 + (ix + 0.5) * xStep;
      const cz = z0 + (iz + 0.5) * zStep;
      let boost = 0;

      for (const r of ripples) {
        const dx = cx - r.x;
        const dz = cz - r.z;
        const distSq = dx * dx + dz * dz;
        const fade = 1 - r.age / RIPPLE_LIFETIME_S;
        if (fade <= 0) continue;
        const wave =
          r.strength * Math.exp(-distSq / (r.radius * r.radius)) * Math.sin(phase - Math.sqrt(distSq) * 8);
        boost += Math.max(0, wave) * fade;
      }

      heights[i] = Math.min(1.15, heights[i] + boost * amp);
    }
  }

  function clear() {
    ripples.length = 0;
  }

  function dispose() {
    ripples.length = 0;
  }

  return { pushIfTriggered, tick, applyToHeights, clear, dispose };
}
