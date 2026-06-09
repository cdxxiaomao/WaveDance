import { applyAdaptiveSmooth, clamp01 } from "./common.js";

/**
 * gain → 缓落 → gamma → adaptive smooth
 * @param {number[]} points
 * @param {{ gainPercent: number, smoothPercent: number, softClipPercent: number, fallEasePercent: number }} shapeConfig
 * @param {number[]} easedStateRef 调用方持有的缓落状态数组（原地更新）
 * @param {{ mapToNdcLine?: boolean, circular?: boolean }} [options]
 *   mapToNdcLine: line 模式需在 smooth 前映射到 NDC；circular: 环形模式首尾邻接平滑
 * @returns {Float32Array}
 */
export function processSpectrumPoints(points, shapeConfig, easedStateRef, options = {}) {
  const len = points.length;
  if (easedStateRef.length !== len) {
    easedStateRef.length = len;
    easedStateRef.fill(0);
  }

  const result = new Float32Array(len);
  const gain = Number(shapeConfig.gainPercent) / 100;
  const softGamma = 1 + (Number(shapeConfig.softClipPercent) / 100) * 1.6;
  const fallBlend = 0.08 + (1 - Number(shapeConfig.fallEasePercent) / 100) * 0.62;

  for (let i = 0; i < len; i++) {
    const raw = clamp01(points[i] * gain);
    const prev = easedStateRef[i];
    const followed = raw >= prev ? raw : prev + (raw - prev) * fallBlend;
    easedStateRef[i] = followed;
    result[i] = Math.pow(followed, softGamma);
  }

  if (options.mapToNdcLine) {
    for (let i = 0; i < len; i++) {
      result[i] = (result[i] * 2 - 1) * 0.95;
    }
  }

  applyAdaptiveSmooth(result, shapeConfig.smoothPercent, { circular: Boolean(options.circular) });
  return result;
}
