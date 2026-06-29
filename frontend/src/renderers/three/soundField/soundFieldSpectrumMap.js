import {
  cellSpectralSamples,
  normalizeSoundFieldLayoutMode,
  SOUND_FIELD_LAYOUT_MODES,
} from "./soundFieldLayout.js";

/**
 * @param {Float32Array | number[]} processed
 * @param {number} t 0~1
 * @param {number} len
 * @param {Float32Array | number[] | null} bands
 */
function sampleSpectrumAt(processed, t, len, bands) {
  const specIdx = Math.min(len - 1, Math.floor(t * len));
  let spec = processed[specIdx] ?? 0;
  if (bands) {
    const bandIdx = Math.min(bands.length - 1, Math.floor(t * bands.length));
    spec = Math.max(spec, (bands[bandIdx] ?? 0) * 0.35);
  }
  return spec;
}

/**
 * 将 1D 频谱映射到 N×N 高度场（0~1）。
 * @param {Float32Array | number[]} processed
 * @param {Float32Array | number[] | undefined} bandPeaks
 * @param {number} gridSize
 * @param {{
 *   responseStrength?: number,
 *   responseRange?: number,
 *   freqReversed?: boolean,
 *   layoutMode?: import('./soundFieldLayout.js').SoundFieldLayoutMode,
 * }} [opts]
 * @returns {Float32Array}
 */
export function mapSpectrumToHeightField(processed, bandPeaks, gridSize, opts = {}) {
  const n = gridSize * gridSize;
  const out = new Float32Array(n);
  const len = processed?.length ?? 0;
  if (len === 0) return out;

  const strength = Math.max(0, Math.min(1, Number(opts.responseStrength ?? 72) / 100));
  const range = Math.max(0, Math.min(1, Number(opts.responseRange ?? 65) / 100));
  const gamma = 1 + (1 - range) * 0.8;
  const reversed = Boolean(opts.freqReversed);
  const bands = bandPeaks?.length ? bandPeaks : null;
  const layoutMode = normalizeSoundFieldLayoutMode(opts.layoutMode);
  const scattered = layoutMode === SOUND_FIELD_LAYOUT_MODES.scatter;

  for (let i = 0; i < n; i++) {
    const ix = i % gridSize;
    const iz = Math.floor(i / gridSize);
    const { low, mid, high } = cellSpectralSamples(ix, iz, gridSize, layoutMode, reversed);

    let spec;
    if (scattered) {
      const lowSpec = sampleSpectrumAt(processed, low, len, bands);
      const midSpec = sampleSpectrumAt(processed, mid, len, bands);
      const highSpec = sampleSpectrumAt(processed, high, len, bands);
      spec = Math.max(lowSpec * 0.82, midSpec * 0.78, highSpec * 0.78);
    } else {
      spec = sampleSpectrumAt(processed, low, len, bands);
    }

    const shaped = Math.pow(Math.max(0, Math.min(1, spec)), gamma);
    out[i] = shaped * strength;
  }

  return out;
}

/**
 * @param {Float32Array} current
 * @param {Float32Array} target
 * @param {number} fallEasePercent 0~100，越高下落越慢
 */
export function smoothHeightField(current, target, fallEasePercent) {
  const attack = 0.38;
  const release = 0.08 + (1 - Math.max(0, Math.min(100, fallEasePercent)) / 100) * 0.22;
  for (let i = 0; i < current.length; i++) {
    const t = target[i] ?? 0;
    const blend = t >= current[i] ? attack : release;
    current[i] += (t - current[i]) * blend;
  }
}
