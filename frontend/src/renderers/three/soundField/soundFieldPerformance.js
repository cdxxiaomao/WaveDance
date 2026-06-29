/** @typedef {"eco"|"normal"|"high"} SoundFieldGridPreset */

/** eco / normal / high 三档 DPR 上限 */
const PRESET_DPR_CAP = {
  eco: 1.0,
  normal: 1.5,
  high: 1.25,
};

/** high 档柱矩阵 GPU 上传间隔（秒），约 30fps */
export const HIGH_PRESET_MATRIX_INTERVAL_S = 1 / 30;

/**
 * @param {string} preset
 * @param {number} gridSize
 */
export function resolveSoundFieldDprCap(preset, gridSize) {
  const key = preset === "eco" || preset === "high" ? preset : "normal";
  let cap = PRESET_DPR_CAP[key] ?? PRESET_DPR_CAP.normal;
  if (gridSize >= 112 && cap > 1.25) cap = 1.25;
  if (gridSize <= 64 && key === "eco") cap = Math.min(cap, 1.0);
  return cap;
}

/**
 * @param {string} preset
 * @param {number} gridSize
 * @returns {number} 0 表示每帧上传；>0 为最小间隔秒数
 */
export function resolveSoundFieldMatrixUpdateInterval(preset, gridSize) {
  if (preset === "high" || gridSize >= 112) return HIGH_PRESET_MATRIX_INTERVAL_S;
  return 0;
}

/**
 * @param {number} accumulator
 * @param {number} interval
 * @param {number} dt
 */
export function shouldUploadSoundFieldMatrices(accumulator, interval, dt) {
  if (interval <= 0) return { upload: true, nextAccumulator: 0 };
  const next = accumulator + dt;
  if (next >= interval) return { upload: true, nextAccumulator: next % interval };
  return { upload: false, nextAccumulator: next };
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {number | null} savedPixelRatio
 * @param {string} preset
 * @param {number} gridSize
 * @returns {number | null}
 */
export function applySoundFieldDprCap(renderer, savedPixelRatio, preset, gridSize) {
  const cap = resolveSoundFieldDprCap(preset, gridSize);
  const next = Math.min(window.devicePixelRatio || 1, cap);
  if (savedPixelRatio == null) {
    savedPixelRatio = renderer.getPixelRatio();
  }
  renderer.setPixelRatio(next);
  return savedPixelRatio;
}
