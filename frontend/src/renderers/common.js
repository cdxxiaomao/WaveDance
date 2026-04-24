export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function applyAdaptiveSmooth(samples, smoothPercent) {
  const len = samples.length;
  if (len <= 2) return;
  const smoothNorm = Number(smoothPercent) / 400;
  const smoothPasses = Math.round(smoothNorm * smoothNorm * 24);
  if (smoothPasses <= 0) return;
  const temp = new Float32Array(len);
  const useWideKernel = Number(smoothPercent) > 260;
  for (let pass = 0; pass < smoothPasses; pass++) {
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
    samples.set(temp);
  }
}
