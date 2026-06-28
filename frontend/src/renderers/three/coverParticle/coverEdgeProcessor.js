/**
 * 封面 Canvas → 边缘/深度 RGBA 纹理（R=亮度深度, G=Sobel 边缘）。
 * @param {HTMLCanvasElement} coverCanvas
 * @returns {HTMLCanvasElement}
 */
export function buildEdgeAndDepth(coverCanvas) {
  const w = coverCanvas.width;
  const h = coverCanvas.height;
  const srcCtx = coverCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx || w < 3 || h < 3) {
    return coverCanvas;
  }

  const src = srcCtx.getImageData(0, 0, w, h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    lum[i] =
      (src.data[j] * 0.299 + src.data[j + 1] * 0.587 + src.data[j + 2] * 0.114) / 255;
  }

  const outCv = document.createElement("canvas");
  outCv.width = w;
  outCv.height = h;
  const outCtx = outCv.getContext("2d");
  if (!outCtx) return coverCanvas;

  const out = outCtx.createImageData(w, h);
  const sample = (x, y) => {
    const sx = Math.min(w - 1, Math.max(0, x));
    const sy = Math.min(h - 1, Math.max(0, y));
    return lum[sy * w + sx];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const depth = lum[y * w + x];
      const gx =
        -sample(x - 1, y - 1) -
        2 * sample(x - 1, y) -
        sample(x - 1, y + 1) +
        sample(x + 1, y - 1) +
        2 * sample(x + 1, y) +
        sample(x + 1, y + 1);
      const gy =
        -sample(x - 1, y - 1) -
        2 * sample(x, y - 1) -
        sample(x + 1, y - 1) +
        sample(x - 1, y + 1) +
        2 * sample(x, y + 1) +
        sample(x + 1, y + 1);
      const edge = Math.min(1, Math.hypot(gx, gy) * 1.35);
      const idx = (y * w + x) * 4;
      out.data[idx] = Math.round(depth * 255);
      out.data[idx + 1] = Math.round(edge * 255);
      out.data[idx + 2] = 0;
      out.data[idx + 3] = Math.round(depth * 255);
    }
  }

  outCtx.putImageData(out, 0, 0);
  return outCv;
}
