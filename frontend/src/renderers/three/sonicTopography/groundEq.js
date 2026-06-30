const BAND_KEYS = [
  "subBass",
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "presence",
  "brilliance",
  "air",
];

/**
 * @param {number} raw 0~1
 * @param {number} eqValue 0~100，50 为中性
 */
export function applyGroundEqBandValue(raw, eqValue) {
  const safe = Math.min(1, Math.max(0, Number(raw) || 0));
  const delta = ((Number(eqValue) || 50) - 50) / 50;
  if (delta >= 0) {
    return Math.min(1, Math.max(0, safe * (1 + delta * 1.8)));
  }
  const dullness = Math.abs(delta);
  return Math.min(1, Math.max(0, Math.max(0, safe - dullness * 0.35) * (1 - dullness * 0.35)));
}

/**
 * @param {Record<string, number>} raw
 * @param {number[]} bands 8 个推子值
 * @param {boolean[]} enabledBands
 */
export function applyGroundEq(raw, bands, enabledBands) {
  /** @type {Record<string, number>} */
  const out = { ...raw };
  for (let i = 0; i < BAND_KEYS.length; i++) {
    const key = BAND_KEYS[i];
    const enabled = enabledBands?.[i] !== false;
    const eqVal = bands?.[i] ?? 50;
    out[key] = enabled ? applyGroundEqBandValue(raw[key] ?? 0, eqVal) : 0;
  }
  return out;
}

/** 幅度推子 0~100 → 整体高度倍率（50=1×，100≈15×） */
export function amplitudeFromSlider(percent) {
  const v = Math.min(100, Math.max(0, Number(percent) || 50));
  if (v <= 50) return (v / 50) * 1.0;
  const t = (v - 50) / 50;
  return 1.0 + t * t * 14.0;
}

export { BAND_KEYS };
