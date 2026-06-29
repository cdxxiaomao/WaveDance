import * as THREE from "three";

const MAX_METEORS = 12;
const MAX_BURST = 96;
const METEOR_SPAWN_COOLDOWN_S = 0.08;
const BURST_LIFETIME_S = 0.55;
const FLASH_LIFETIME_S = 0.12;

/**
 * @param {{
 *   worldWidth: number,
 *   worldDepth: number,
 *   maxBarHeight: number,
 *   colorHigh?: string,
 * }} opts
 */
export function createSoundFieldMeteorSystem(opts) {
  const worldWidth = opts.worldWidth;
  const worldDepth = opts.worldDepth;
  const maxBarHeight = opts.maxBarHeight;
  const halfW = worldWidth * 0.5;
  const halfD = worldDepth * 0.5;

  /** @type {{ x: number, z: number, y: number, vy: number, vx: number, vz: number }[]} */
  const meteors = [];
  /** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, age: number, life: number }[]} */
  const bursts = [];
  /** @type {{ ix: number, iz: number, age: number, strength: number }[]} */
  const flashes = [];

  let lastSpawnAt = -999;
  let prevTreble = 0;

  const maxPoints = MAX_METEORS + MAX_BURST;
  const positions = new Float32Array(maxPoints * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(/^#[0-9A-Fa-f]{6}$/.test(opts.colorHigh ?? "") ? opts.colorHigh : "#8f7cff"),
    size: 0.11,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;

  /**
   * @param {number} sensitivity 0~100
   */
  function fluxThreshold(sensitivity) {
    return (1 - Math.max(0, Math.min(100, sensitivity)) / 100) * 0.42;
  }

  /** @param {number} treble */
  function computeTrebleFlux(treble) {
    const flux = Math.max(0, treble - prevTreble) * 4.5 + treble * 0.08;
    prevTreble = treble;
    return flux;
  }

  /**
   * @param {Float32Array} heights
   * @param {number} gridSize
   * @param {number} x
   * @param {number} z
   */
  function sampleBarHeightWorld(heights, gridSize, x, z) {
    const fx = (x + halfW) / worldWidth;
    const fz = (z + halfD) / worldDepth;
    const ix = Math.min(gridSize - 1, Math.max(0, Math.floor(fx * gridSize)));
    const iz = Math.min(gridSize - 1, Math.max(0, Math.floor(fz * gridSize)));
    return (heights[iz * gridSize + ix] ?? 0) * maxBarHeight;
  }

  function spawnMeteor(strengthPercent) {
    const now = performance.now() / 1000;
    if (now - lastSpawnAt < METEOR_SPAWN_COOLDOWN_S) return;
    if (meteors.length >= MAX_METEORS) return;
    lastSpawnAt = now;

    const spread = 0.82;
    const x = (Math.random() * 2 - 1) * halfW * spread;
    const z = (Math.random() * 2 - 1) * halfD * spread;
    const power = 0.55 + Math.max(0, Math.min(1, strengthPercent / 100)) * 0.65;

    meteors.push({
      x,
      z,
      y: maxBarHeight + 5.5 + Math.random() * 4.5,
      vy: -(7.5 + Math.random() * 4) * power,
      vx: (Math.random() - 0.5) * 0.35,
      vz: (Math.random() - 0.5) * 0.35,
    });
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {number} strengthPercent
   * @param {Float32Array} heights
   * @param {number} gridSize
   */
  function spawnBurst(x, z, strengthPercent, heights, gridSize) {
    const power = Math.max(0, Math.min(1, strengthPercent / 100));
    const barH = sampleBarHeightWorld(heights, gridSize, x, z);
    const count = Math.round(8 + power * 14);
    for (let i = 0; i < count; i++) {
      if (bursts.length >= MAX_BURST) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = (1.2 + Math.random() * 2.8) * power;
      bursts.push({
        x,
        y: barH + 0.05,
        z,
        vx: Math.cos(ang) * spd,
        vy: 1.5 + Math.random() * 2.2 * power,
        vz: Math.sin(ang) * spd,
        age: 0,
        life: BURST_LIFETIME_S * (0.65 + Math.random() * 0.5),
      });
    }

    const fx = (x + halfW) / worldWidth;
    const fz = (z + halfD) / worldDepth;
    const ix = Math.min(gridSize - 1, Math.max(0, Math.floor(fx * gridSize)));
    const iz = Math.min(gridSize - 1, Math.max(0, Math.floor(fz * gridSize)));
    flashes.push({ ix, iz, age: 0, strength: 0.18 + power * 0.28 });
    while (flashes.length > 24) flashes.shift();
  }

  /**
   * @param {number} treble
   * @param {number} sensitivity
   * @param {number} strengthPercent
   * @param {boolean} enabled
   * @param {Float32Array} heights
   * @param {number} gridSize
   * @param {number} dt
   */
  function tick(treble, sensitivity, strengthPercent, enabled, heights, gridSize, dt) {
    const safeDt = Math.max(0, dt);
    const flux = computeTrebleFlux(treble);

    if (enabled && flux > fluxThreshold(sensitivity)) {
      spawnMeteor(strengthPercent);
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx * safeDt;
      m.z += m.vz * safeDt;
      m.y += m.vy * safeDt;
      m.vy -= 11.5 * safeDt;

      const barH = sampleBarHeightWorld(heights, gridSize, m.x, m.z);
      if (m.y <= barH + 0.04) {
        spawnBurst(m.x, m.z, strengthPercent, heights, gridSize);
        meteors.splice(i, 1);
      } else if (m.y < -1) {
        meteors.splice(i, 1);
      }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.age += safeDt;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.z += p.vz * safeDt;
      p.vy -= 5.5 * safeDt;
      if (p.age >= p.life || p.y < 0) bursts.splice(i, 1);
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].age += safeDt;
      if (flashes[i].age > FLASH_LIFETIME_S) flashes.splice(i, 1);
    }

    syncPoints();
  }

  function syncPoints() {
    let idx = 0;
    for (const m of meteors) {
      const base = idx * 3;
      positions[base] = m.x;
      positions[base + 1] = m.y;
      positions[base + 2] = m.z;
      idx++;
      if (idx >= maxPoints) break;
    }
    for (const p of bursts) {
      if (idx >= maxPoints) break;
      const base = idx * 3;
      positions[base] = p.x;
      positions[base + 1] = p.y;
      positions[base + 2] = p.z;
      idx++;
    }
    for (let i = idx; i < maxPoints; i++) {
      const base = i * 3;
      positions[base] = 0;
      positions[base + 1] = -999;
      positions[base + 2] = 0;
    }
    geometry.attributes.position.needsUpdate = true;
    points.visible = meteors.length > 0 || bursts.length > 0;
  }

  /**
   * @param {Float32Array} heights
   * @param {number} gridSize
   * @param {number} strengthPercent
   */
  function applyImpactFlashes(heights, gridSize, strengthPercent) {
    if (flashes.length === 0) return;
    const amp = Math.max(0, Math.min(1, strengthPercent / 100)) * 0.32;
    for (const f of flashes) {
      const fade = 1 - f.age / FLASH_LIFETIME_S;
      if (fade <= 0) continue;
      const idx = f.iz * gridSize + f.ix;
      heights[idx] = Math.min(1.2, heights[idx] + f.strength * fade * amp);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;
          const nx = f.ix + dx;
          const nz = f.iz + dz;
          if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) continue;
          const ni = nz * gridSize + nx;
          heights[ni] = Math.min(1.15, heights[ni] + f.strength * fade * amp * 0.45);
        }
      }
    }
  }

  /** @param {string} colorHigh */
  function setColorHigh(colorHigh) {
    if (/^#[0-9A-Fa-f]{6}$/.test(colorHigh)) {
      material.color.set(colorHigh);
    }
  }

  function clear() {
    meteors.length = 0;
    bursts.length = 0;
    flashes.length = 0;
    syncPoints();
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return {
    points,
    tick,
    applyImpactFlashes,
    setColorHigh,
    clear,
    dispose,
  };
}
