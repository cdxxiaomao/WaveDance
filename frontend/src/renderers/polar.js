/**
 * 极坐标 → NDC，按画布宽高比修正以保持屏幕上的正圆。
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{ x: number, y: number }}
 */
export function getAspectScale(canvasWidth, canvasHeight) {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 1, y: 1 };
  }
  const aspect = canvasWidth / canvasHeight;
  if (aspect >= 1) {
    return { x: 1 / aspect, y: 1 };
  }
  return { x: 1, y: aspect };
}

/**
 * @param {number} angleRad
 * @param {number} radiusNdc 0~1 相对 min(w,h) 半轴
 * @param {{ x: number, y: number }} aspectScale
 * @returns {{ x: number, y: number }}
 */
export function polarToNdc(angleRad, radiusNdc, aspectScale) {
  const scale = aspectScale ?? { x: 1, y: 1 };
  return {
    x: Math.cos(angleRad) * radiusNdc * scale.x,
    y: Math.sin(angleRad) * radiusNdc * scale.y,
  };
}

/**
 * 将 slot index 映射到桶中心角（弧度），12 点方向为起始。
 * @param {number} slot
 * @param {number} len
 * @param {{ freqReversed?: boolean, rotationOffsetDeg?: number, clockwise?: boolean }} [options]
 * @returns {number}
 */
export function slotToAngle(slot, len, options = {}) {
  const { freqReversed = false, rotationOffsetDeg = 0, clockwise = true } = options;
  const idx = freqReversed ? len - 1 - slot : slot;
  const slotCount = Math.max(1, len);
  const t = slotCount <= 1 ? 0 : (idx + 0.5) / slotCount;
  const startAngle = -Math.PI / 2;
  const sweep = Math.PI * 2;
  const dir = clockwise ? 1 : -1;
  const offsetRad = (Number(rotationOffsetDeg) * Math.PI) / 180;
  return startAngle + dir * t * sweep + offsetRad;
}

/**
 * @param {number} slot
 * @param {number} len
 * @param {{ freqReversed?: boolean, rotationOffsetDeg?: number, clockwise?: boolean, barThicknessPercent?: number }} options
 * @returns {{ start: number, end: number }}
 */
export function slotAngleRange(slot, len, options = {}) {
  const center = slotToAngle(slot, len, options);
  const slotSpan = (Math.PI * 2) / Math.max(1, len);
  const thickness = Math.max(10, Math.min(100, Number(options.barThicknessPercent) || 70));
  const barSpan = slotSpan * (thickness / 100);
  const dir = options.clockwise !== false ? 1 : -1;
  return {
    start: center - (barSpan / 2) * dir,
    end: center + (barSpan / 2) * dir,
  };
}
