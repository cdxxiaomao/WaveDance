/**
 * 等距投影与建筑几何（30° 经典 2:1 isometric）。
 */

/**
 * 世界坐标 → 等距屏幕坐标（未归一化到 NDC）。
 * @param {number} wx
 * @param {number} wy
 * @param {number} wz
 * @returns {{ x: number, y: number }}
 */
export function isoProject(wx, wy, wz) {
  const x = wx - wz;
  const y = wy + (wx + wz) * 0.5;
  return { x, y };
}

/**
 * 画家算法排序键：值越大表示在屏幕上越靠后（应先绘制）。
 * @param {number} wx
 * @param {number} wz
 * @param {number} width
 * @param {number} depth
 */
export function isoBuildingPainterSortKey(wx, wz, width, depth) {
  const cx = wx + width * 0.5;
  const cz = wz + depth * 0.5;
  return isoProject(cx, 0, cz).y;
}

/**
 * 建筑 box 三个可见面顶点（世界坐标）。
 * @param {number} wx 建筑左下角世界 X
 * @param {number} wz 建筑左下角世界 Z
 * @param {number} height 建筑高度（世界 Y）
 * @param {number} width 建筑底面宽度（X 方向）
 * @param {number} [depth] 建筑底面深度（Z 方向），默认与 width 相同
 * @returns {{ left: number[][], right: number[][], top: number[][] }}
 */
export function buildIsoBuilding(wx, wz, height, width, depth = width) {
  const W = width;
  const D = depth;
  const H = height;

  const left = [
    [wx, 0, wz + D],
    [wx, 0, wz],
    [wx, H, wz],
    [wx, H, wz + D],
  ];
  const right = [
    [wx, 0, wz],
    [wx + W, 0, wz],
    [wx + W, H, wz],
    [wx, H, wz],
  ];
  const top = [
    [wx, H, wz],
    [wx + W, H, wz],
    [wx + W, H, wz + D],
    [wx, H, wz + D],
  ];

  return { left, right, top };
}
