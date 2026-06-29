/**
 * 液态球体式运动：smax 高度融合 + 频谱缓动（算法来自 liquidBlob / smin.glsl）。
 */

/** @typedef {{ bass: number, mid: number, treble: number, peak: number }} SoundFieldSpectrumState */

/** liquidBlob smin */
export function smin(a, b, k) {
  const kk = Math.max(1e-5, k);
  const h = Math.max(kk - Math.abs(a - b), 0) / kk;
  return Math.min(a, b) - h * h * kk * 0.25;
}

/** 高度场用 smax：相邻鼓包平滑粘连 */
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/**
 * 液态缓动频谱（与 liquidBlob updateSpectrumUniforms + peak 一致）。
 * @param {SoundFieldSpectrumState} state 原地更新
 * @param {{ bass?: number, mid?: number, treble?: number }} spectrum
 * @param {number} peak
 * @param {number} dt
 * @param {{ bassRate?: number, midRate?: number, trebleRate?: number, peakRate?: number }} [rates]
 */
export function smoothSoundFieldSpectrum(state, spectrum, peak, dt, rates = {}) {
  const fpsNorm = Math.min(2.5, Math.max(0.25, dt * 60));
  const bassRate = (rates.bassRate ?? 0.32) * fpsNorm;
  const midRate = (rates.midRate ?? 0.28) * fpsNorm;
  const trebleRate = (rates.trebleRate ?? 0.24) * fpsNorm;
  const peakRate = (rates.peakRate ?? 0.28) * fpsNorm;

  const bass = Math.max(0, Number(spectrum?.bass ?? 0));
  const mid = Math.max(0, Number(spectrum?.mid ?? 0));
  const treble = Math.max(0, Number(spectrum?.treble ?? 0));
  const pk = Math.max(0, Number(peak ?? 0));

  state.bass += (bass - state.bass) * Math.min(1, bassRate);
  state.mid += (mid - state.mid) * Math.min(1, midRate);
  state.treble += (treble - state.treble) * Math.min(1, trebleRate);
  state.peak += (pk - state.peak) * Math.min(1, peakRate);
}

/**
 * smax 多轮融合：整块胶状顶起（替代简单邻域均值扩散）。
 * @param {Float32Array} field 原地修改
 * @param {number} gridSize
 * @param {Float32Array} scratch
 * @param {{ mergeK?: number, iterations?: number, radius?: number }} [opts]
 */
export function mergeHeightFieldLiquid(field, gridSize, scratch, opts = {}) {
  const mergeK = Math.max(0.02, Number(opts.mergeK ?? 0.12));
  const iterations = Math.max(1, Math.min(8, Math.round(Number(opts.iterations ?? 4))));
  const radius = Math.max(1, Math.min(4, Math.round(Number(opts.radius ?? 2))));

  let src = field;
  let dst = scratch;

  for (let pass = 0; pass < iterations; pass++) {
    for (let iz = 0; iz < gridSize; iz++) {
      for (let ix = 0; ix < gridSize; ix++) {
        const i = iz * gridSize + ix;
        let h = src[i];
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nx = ix + dx;
            const nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= gridSize || nz >= gridSize) continue;
            const dist = Math.hypot(dx, dz);
            if (dist > radius) continue;
            const k = mergeK * (1 + dist * 0.22);
            h = smax(h, src[nz * gridSize + nx], k);
          }
        }
        dst[i] = h;
      }
    }

    if (pass === iterations - 1) {
      if (dst !== field) field.set(dst);
    } else {
      const tmp = src;
      src = dst;
      dst = tmp === field ? scratch : field;
    }
  }
}

/**
 * 液态球体式高度缓动（逐格 lerp，attack 快、release 慢且带弹性拖尾）。
 * @param {Float32Array} current
 * @param {Float32Array} target
 * @param {number} fallEasePercent
 * @param {number} [dt]
 * @param {{ rms?: number, silenceThreshold?: number }} [opts]
 */
export function smoothHeightFieldLiquid(current, target, fallEasePercent, dt = 1 / 60, opts = {}) {
  const fpsNorm = Math.min(2.5, Math.max(0.25, dt * 60));
  const fallEase = Math.max(0, Math.min(100, fallEasePercent));

  let attackBlend = 0.32 * fpsNorm;
  let releaseBlend = (0.12 + (1 - fallEase / 100) * 0.1) * fpsNorm;

  const rms = Math.max(0, Number(opts.rms ?? 1));
  const silenceThreshold = Math.max(0.001, Number(opts.silenceThreshold ?? 0.035));
  if (rms < silenceThreshold) {
    releaseBlend *= 1.35 + (1 - rms / silenceThreshold) * 0.85;
  }

  attackBlend = Math.min(1, attackBlend);
  releaseBlend = Math.min(1, releaseBlend);

  for (let i = 0; i < current.length; i++) {
    const t = target[i] ?? 0;
    const blend = t >= current[i] ? attackBlend : releaseBlend;
    current[i] += (t - current[i]) * blend;
    if (current[i] < 0.0004 && t < 0.0004) current[i] = 0;
  }
}
