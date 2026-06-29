/** @typedef {"linear"|"ring"|"scatter"} SoundFieldLayoutMode */

export const SOUND_FIELD_LAYOUT_MODES = {
  linear: "linear",
  ring: "ring",
  scatter: "scatter",
};

/** @param {unknown} value @param {SoundFieldLayoutMode} [fallback="scatter"] */
export function normalizeSoundFieldLayoutMode(value, fallback = "scatter") {
  const s = String(value ?? fallback).trim();
  if (s === SOUND_FIELD_LAYOUT_MODES.ring) return SOUND_FIELD_LAYOUT_MODES.ring;
  if (s === SOUND_FIELD_LAYOUT_MODES.linear) return SOUND_FIELD_LAYOUT_MODES.linear;
  if (s === SOUND_FIELD_LAYOUT_MODES.scatter) return SOUND_FIELD_LAYOUT_MODES.scatter;
  return fallback === SOUND_FIELD_LAYOUT_MODES.ring
    ? SOUND_FIELD_LAYOUT_MODES.ring
    : fallback === SOUND_FIELD_LAYOUT_MODES.linear
      ? SOUND_FIELD_LAYOUT_MODES.linear
      : SOUND_FIELD_LAYOUT_MODES.scatter;
}

/**
 * 网格坐标 → 稳定伪随机 [0, 1)，同 cell 每帧不变。
 * @param {number} ix
 * @param {number} iz
 * @param {number} [salt]
 */
export function stableCellHash(ix, iz, salt = 0) {
  let h = (ix + 1) * 374761393 + (iz + 1) * 668265263 + salt * 982451653;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * 计算 cell 对应的频谱采样参数 t（0=低频端，1=高频端）。
 * ring 模式：中心低频、外圈高频；linear 模式：沿网格扫描。
 * @param {number} ix
 * @param {number} iz
 * @param {number} gridSize
 * @param {SoundFieldLayoutMode} layoutMode
 * @param {boolean} [freqReversed]
 */
export function cellSpectralT(ix, iz, gridSize, layoutMode, freqReversed = false) {
  let t;
  if (layoutMode === SOUND_FIELD_LAYOUT_MODES.ring) {
    const cx = (ix + 0.5) / gridSize - 0.5;
    const cz = (iz + 0.5) / gridSize - 0.5;
    const dist = Math.sqrt(cx * cx + cz * cz) / (Math.SQRT1_2 * 0.5);
    const angle = Math.atan2(cz, cx);
    const wobble = Math.sin(angle * 4.0) * 0.04 + Math.cos(angle * 2.5 + 0.8) * 0.03;
    t = Math.max(0, Math.min(1, dist * 0.92 + wobble));
  } else {
    t = (ix / Math.max(1, gridSize - 1) + (iz * 0.37) / Math.max(1, gridSize - 1)) * 0.5;
  }
  if (freqReversed) t = 1 - t;
  return t;
}

/**
 * cell 对应低/中/高三个频谱采样点（t: 0=低频端，1=高频端）。
 * scatter：低频仍沿中心环，中频与高频各自随机落位。
 * @param {number} ix
 * @param {number} iz
 * @param {number} gridSize
 * @param {SoundFieldLayoutMode} layoutMode
 * @param {boolean} [freqReversed]
 * @returns {{ low: number, mid: number, high: number }}
 */
export function cellSpectralSamples(ix, iz, gridSize, layoutMode, freqReversed = false) {
  if (layoutMode === SOUND_FIELD_LAYOUT_MODES.scatter) {
    const low = cellSpectralT(ix, iz, gridSize, SOUND_FIELD_LAYOUT_MODES.ring, false) * 0.34;
    const mid = 0.34 + stableCellHash(ix, iz, 11) * 0.32;
    const high = 0.67 + stableCellHash(ix, iz, 29) * 0.33;
    if (!freqReversed) return { low, mid, high };
    return { low: 1 - low, mid: 1 - mid, high: 1 - high };
  }

  const t = cellSpectralT(ix, iz, gridSize, layoutMode, freqReversed);
  return { low: t, mid: t, high: t };
}
