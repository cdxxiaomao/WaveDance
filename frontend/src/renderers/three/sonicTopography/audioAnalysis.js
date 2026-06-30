const BAND_EDGES = [0, 0.02, 0.06, 0.12, 0.28, 0.48, 0.65, 0.82, 1.0];
const BAND_KEYS = ["subBass", "bass", "lowMid", "mid", "highMid", "presence", "brilliance", "air"];
const SILENCE_RMS = 0.028;

/** @returns {{ prevProcessed: Float32Array | null, prevBrightness: number, smoothed: Record<string, number> }} */
export function createAudioAnalysisState() {
  /** @type {Record<string, number>} */
  const smoothed = {};
  for (const key of [
    ...BAND_KEYS,
    "energy",
    "warmth",
    "brightness",
    "sharpness",
    "smoothness",
    "density",
    "spectralCentroid",
    "treble",
    "bassLegacy",
  ]) {
    smoothed[key] = 0;
  }
  return { prevProcessed: null, prevBrightness: 0, visualRelease: 1, smoothed };
}

/**
 * @param {Float32Array | number[]} processed
 * @param {ReturnType<typeof createAudioAnalysisState>} state
 */
export function analyzeSpectrum(processed, state) {
  const len = processed?.length ?? 0;
  /** @type {Record<string, number>} */
  const bands = {};
  let energySum = 0;
  let energyCount = 0;
  let weightedSum = 0;
  let weightTotal = 0;

  for (let b = 0; b < BAND_KEYS.length; b++) {
    const t0 = BAND_EDGES[b];
    const t1 = BAND_EDGES[b + 1];
    let peak = 0;
    let binCount = 0;

    if (len <= 1) {
      peak = Number(processed?.[0] ?? 0);
      binCount = 1;
    } else {
      const i0 = Math.floor(t0 * (len - 1));
      const i1 = Math.max(i0, Math.floor(t1 * (len - 1)));
      for (let i = i0; i <= i1; i++) {
        const v = Number(processed[i] ?? 0);
        if (v > peak) peak = v;
        energySum += v;
        energyCount += 1;
        weightedSum += i * v;
        weightTotal += v;
        binCount += 1;
      }
    }

    bands[BAND_KEYS[b]] = binCount > 0 ? peak : 0;
  }

  const energy = energyCount > 0 ? energySum / energyCount : 0;
  const lowSum = bands.subBass + bands.bass + bands.lowMid + bands.mid;
  const highSum = bands.presence + bands.brilliance + bands.air;
  const denom = Math.max(energySum, 1e-6);

  let meanAbsDelta = 0;
  if (state.prevProcessed && state.prevProcessed.length === len && len > 0) {
    let deltaSum = 0;
    for (let i = 0; i < len; i++) {
      deltaSum += Math.abs(Number(processed[i] ?? 0) - state.prevProcessed[i]);
    }
    meanAbsDelta = deltaSum / len;
  }

  const brightness = highSum / denom;
  const sharpness = Math.max(0, brightness - state.prevBrightness) * 10;
  state.prevBrightness = brightness;

  let activeBands = 0;
  const activeThreshold = energy * 1.5;
  for (const key of BAND_KEYS) {
    if ((bands[key] ?? 0) > activeThreshold) activeBands += 1;
  }

  if (!state.prevProcessed || state.prevProcessed.length !== len) {
    state.prevProcessed = new Float32Array(len);
  }
  for (let i = 0; i < len; i++) {
    state.prevProcessed[i] = Number(processed[i] ?? 0);
  }

  return {
    ...bands,
    bassLegacy: bands.subBass + bands.bass + bands.lowMid,
    treble: highSum / 3,
    energy,
    warmth: lowSum / denom,
    brightness,
    sharpness,
    smoothness: Math.max(0, 1 - meanAbsDelta * 2),
    density: activeBands / 8,
    spectralCentroid: weightTotal > 1e-6 ? weightedSum / weightTotal / Math.max(len - 1, 1) : 0,
    flux: meanAbsDelta,
  };
}

/**
 * @param {ReturnType<typeof createAudioAnalysisState>} state
 * @param {Record<string, number>} target
 * @param {number} motionSpeed 0~100
 * @param {number} dt
 * @param {number} rms
 */
export function smoothAudioUniforms(state, target, motionSpeed, dt, rms) {
  const safeDt = dt > 0 ? dt : 1 / 60;
  const motionT = Math.min(1, Math.max(0, Number(motionSpeed) || 50) / 100);
  const responseRate = 2.2 + (60 - 2.2) * motionT;
  let blend = 1 - Math.exp(-responseRate * safeDt);

  const silent = Number(rms) < SILENCE_RMS;
  if (silent) {
    state.visualRelease = Math.max(0, (state.visualRelease ?? 1) - safeDt * 0.72);
    blend = 1 - Math.exp(-0.55 * safeDt);
  } else {
    const attack = 1 - Math.exp(-9 * safeDt);
    state.visualRelease = (state.visualRelease ?? 1) + (1 - (state.visualRelease ?? 1)) * attack;
  }

  const release = state.visualRelease ?? 1;
  const keys = Object.keys(state.smoothed);
  for (const key of keys) {
    const goal = Number(target[key] ?? 0) * release;
    state.smoothed[key] += (goal - state.smoothed[key]) * blend;
  }

  if (silent) {
    state.smoothed.smoothness = Math.max(state.smoothed.smoothness, 0.78);
    state.smoothed.energy = Math.max(state.smoothed.energy, 0.02 * release);
  }

  return state.smoothed;
}
