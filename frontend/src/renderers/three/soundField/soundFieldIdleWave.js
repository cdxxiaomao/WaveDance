/**
 * 低能量时在高度场上叠加全局呼吸波。
 * @param {Float32Array} heights 原地修改
 * @param {number} gridSize
 * @param {number} time
 * @param {number} rms
 * @param {{ enabled?: boolean, amplitude?: number, speed?: number, threshold?: number }} opts
 */
export function applyIdleWave(heights, gridSize, time, rms, opts = {}) {
  if (opts.enabled === false) return;
  const threshold = Number(opts.threshold ?? 0.035);
  if (rms > threshold) return;

  const amp = Math.max(0, Math.min(1, Number(opts.amplitude ?? 18) / 100)) * 0.14;
  const speed = 0.4 + Math.max(0, Math.min(100, Number(opts.speed ?? 45) / 100)) * 2.2;

  for (let i = 0; i < heights.length; i++) {
    const ix = i % gridSize;
    const iz = Math.floor(i / gridSize);
    const wave =
      Math.sin(time * speed + ix * 0.31 + iz * 0.27) * amp +
      Math.sin(time * speed * 0.73 + ix * 0.17 - iz * 0.21) * amp * 0.45;
    heights[i] = Math.max(heights[i], 0.06 + wave);
  }
}
