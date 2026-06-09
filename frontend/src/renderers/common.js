export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function minNdcForPixels(px, canvasPixels) {
  if (canvasPixels <= 0 || px <= 0) return 0;
  return (px / canvasPixels) * 2;
}

function clampSpanToMinNdc(low, high, minNdc) {
  if (high - low >= minNdc) {
    return [low, high];
  }
  const center = (low + high) * 0.5;
  return [center - minNdc * 0.5, center + minNdc * 0.5];
}

/**
 * 保证峰值保持线沿柱体方向至少占据 1 个设备像素，避免 capInset 把窄柱压成零宽线。
 * @returns {[number, number]}
 */
export function clampPeakCapSpanAlongBar(low, high, minNdc) {
  return clampSpanToMinNdc(low, high, minNdc);
}

/**
 * @param {Float32Array | number[]} samples
 * @param {number} smoothPercent
 * @param {{ circular?: boolean }} [options] circular 为 true 时首尾按环形邻接平滑（radial / dotRing）
 */
export function applyAdaptiveSmooth(samples, smoothPercent, options = {}) {
  const len = samples.length;
  if (len <= 2) return;
  const smoothNorm = Number(smoothPercent) / 400;
  const smoothPasses = Math.round(smoothNorm * smoothNorm * 24);
  if (smoothPasses <= 0) return;
  const temp = new Float32Array(len);
  const useWideKernel = Number(smoothPercent) > 260;
  const circular = Boolean(options.circular);

  const wrap = (index) => ((index % len) + len) % len;

  for (let pass = 0; pass < smoothPasses; pass++) {
    if (circular) {
      for (let i = 0; i < len; i++) {
        if (useWideKernel && len >= 5) {
          temp[i] =
            (samples[wrap(i - 2)] +
              samples[wrap(i - 1)] * 2 +
              samples[i] * 4 +
              samples[wrap(i + 1)] * 2 +
              samples[wrap(i + 2)]) *
            0.1;
        } else {
          temp[i] = (samples[wrap(i - 1)] + samples[i] * 2 + samples[wrap(i + 1)]) * 0.25;
        }
      }
    } else {
      temp[0] = samples[0];
      temp[len - 1] = samples[len - 1];
      for (let i = 1; i < len - 1; i++) {
        if (useWideKernel && i > 1 && i < len - 2) {
          temp[i] =
            (samples[i - 2] + samples[i - 1] * 2 + samples[i] * 4 + samples[i + 1] * 2 + samples[i + 2]) * 0.1;
        } else {
          temp[i] = (samples[i - 1] + samples[i] * 2 + samples[i + 1]) * 0.25;
        }
      }
    }
    samples.set(temp);
  }
}
