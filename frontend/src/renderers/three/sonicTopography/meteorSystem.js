import * as THREE from "three";

const MAX_METEORS = 20;
const MAX_BURST = 200;
const SPAWN_COOLDOWN_S = 0.06;
const BURST_LIFETIME_S = 0.62;
const GROUND_Y = 0.05;

/**
 * @param {{
 *   terrainHalf?: number,
 *   maxMeteors?: number,
 *   maxBurst?: number,
 * }} [opts]
 */
export function createMeteorSystem(opts = {}) {
  const terrainHalf = opts.terrainHalf ?? 84;
  const maxMeteors = opts.maxMeteors ?? MAX_METEORS;
  const maxBurst = opts.maxBurst ?? MAX_BURST;

  /** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, strength: number }[]} */
  const meteors = [];
  /** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, age: number, life: number }[]} */
  const bursts = [];

  let lastSpawnAt = -999;

  const streakGeo = new THREE.BoxGeometry(0.12, 1.4, 0.12);
  streakGeo.translate(0, 0.7, 0);

  const meteorMaterial = new THREE.MeshBasicMaterial({
    color: 0xd0d0e8,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    toneMapped: false,
  });

  const meteorMesh = new THREE.InstancedMesh(streakGeo, meteorMaterial, maxMeteors);
  meteorMesh.frustumCulled = false;
  meteorMesh.renderOrder = 2;

  const burstPositions = new Float32Array(maxBurst * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));

  const burstMaterial = new THREE.PointsMaterial({
    color: 0xe8e8ff,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const burstPoints = new THREE.Points(burstGeo, burstMaterial);
  burstPoints.frustumCulled = false;
  burstPoints.renderOrder = 3;

  const dummy = new THREE.Object3D();
  const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  /** @param {number} strength 0~1 */
  function spawn(strength) {
    const now = performance.now() / 1000;
    if (now - lastSpawnAt < SPAWN_COOLDOWN_S) return;
    if (meteors.length >= maxMeteors) return;
    lastSpawnAt = now;

    const power = 0.5 + Math.min(1, Math.max(0, strength)) * 0.55;
    const spread = 0.88;
    const x = (Math.random() * 2 - 1) * terrainHalf * spread;
    const z = (Math.random() * 2 - 1) * terrainHalf * spread;

    meteors.push({
      x,
      z,
      y: 10 + Math.random() * 8,
      vy: -(8.5 + Math.random() * 5) * power,
      vx: (Math.random() - 0.5) * 0.45,
      vz: (Math.random() - 0.5) * 0.45,
      strength: power,
    });
  }

  /** @param {number} x @param {number} z @param {number} strength */
  function spawnBurst(x, z, strength) {
    const power = Math.min(1, Math.max(0, strength));
    const count = Math.round(10 + power * 18);
    for (let i = 0; i < count; i++) {
      if (bursts.length >= maxBurst) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = (1.4 + Math.random() * 3.2) * power;
      bursts.push({
        x,
        y: GROUND_Y + 0.08 + Math.random() * 0.35,
        z,
        vx: Math.cos(ang) * spd,
        vy: 1.8 + Math.random() * 2.5 * power,
        vz: Math.sin(ang) * spd,
        age: 0,
        life: BURST_LIFETIME_S * (0.6 + Math.random() * 0.55),
      });
    }
  }

  /** @param {number} dt */
  function tick(dt) {
    const safeDt = Math.max(0, dt);

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx * safeDt;
      m.z += m.vz * safeDt;
      m.y += m.vy * safeDt;
      m.vy -= 12 * safeDt;

      if (m.y <= GROUND_Y) {
        spawnBurst(m.x, m.z, m.strength);
        meteors.splice(i, 1);
      } else if (m.y < -4) {
        meteors.splice(i, 1);
      }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.age += safeDt;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.z += p.vz * safeDt;
      p.vy -= 6 * safeDt;
      if (p.age >= p.life || p.y < GROUND_Y - 0.5) bursts.splice(i, 1);
    }

    syncMeteorInstances();
    syncBurstPoints();
  }

  function syncMeteorInstances() {
    for (let i = 0; i < maxMeteors; i++) {
      if (i < meteors.length) {
        const m = meteors[i];
        const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy + m.vz * m.vz);
        dummy.position.set(m.x, m.y, m.z);
        const dir = new THREE.Vector3(m.vx, m.vy, m.vz);
        if (dir.lengthSq() > 1e-8) {
          dir.normalize();
          dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        } else {
          dummy.rotation.set(0, 0, 0);
        }
        const stretch = 0.85 + speed * 0.08;
        dummy.scale.set(1, stretch, 1);
        dummy.updateMatrix();
        meteorMesh.setMatrixAt(i, dummy.matrix);
      } else {
        meteorMesh.setMatrixAt(i, hideMatrix);
      }
    }
    meteorMesh.instanceMatrix.needsUpdate = true;
    meteorMesh.visible = meteors.length > 0;
  }

  function syncBurstPoints() {
    let idx = 0;
    for (const p of bursts) {
      if (idx >= maxBurst) break;
      const fade = 1 - p.age / p.life;
      if (fade <= 0) continue;
      const base = idx * 3;
      burstPositions[base] = p.x;
      burstPositions[base + 1] = p.y;
      burstPositions[base + 2] = p.z;
      idx += 1;
    }
    for (let i = idx; i < maxBurst; i++) {
      const base = i * 3;
      burstPositions[base] = 0;
      burstPositions[base + 1] = -999;
      burstPositions[base + 2] = 0;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstPoints.visible = bursts.length > 0;
  }

  /** @param {THREE.Color} color */
  function setColor(color) {
    meteorMaterial.color.copy(color);
    burstMaterial.color.copy(color);
  }

  function clear() {
    meteors.length = 0;
    bursts.length = 0;
    syncMeteorInstances();
    syncBurstPoints();
  }

  function dispose() {
    streakGeo.dispose();
    meteorMaterial.dispose();
    burstGeo.dispose();
    burstMaterial.dispose();
  }

  return {
    meteorMesh,
    burstPoints,
    spawn,
    tick,
    setColor,
    clear,
    dispose,
  };
}
