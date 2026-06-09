/**
 * 将频谱桶聚合为 bandCount 个频段（取各段峰值）。
 * @param {Float32Array | number[]} values
 * @param {number} bandCount
 * @returns {Float32Array}
 */
export function aggregateBands(values, bandCount) {
  const len = values.length;
  const count = Math.max(1, Math.min(Math.round(Number(bandCount) || 1), len));
  const result = new Float32Array(count);
  for (let band = 0; band < count; band++) {
    const start = Math.floor((band * len) / count);
    const end = Math.floor(((band + 1) * len) / count);
    let peak = 0;
    for (let i = start; i < end; i++) {
      if (values[i] > peak) peak = values[i];
    }
    result[band] = peak;
  }
  return result;
}
