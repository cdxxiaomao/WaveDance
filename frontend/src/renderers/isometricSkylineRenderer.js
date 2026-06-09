import { createProgram } from "./shaderUtils.js";
import { minNdcForPixels } from "./common.js";
import { processSpectrumPoints } from "./shapePipeline.js";
import { aggregateBands } from "./bandAggregate.js";
import { isoProject, buildIsoBuilding } from "./isometric.js";

const MIN_BUILDING_HEIGHT = 0.04;
const MAX_BUILDING_HEIGHT = 2.8;
const BUILDING_DEPTH_RATIO = 0.72;
const GROUND_ALPHA = 0.32;

function projectCorner(wx, wy, wz) {
  return isoProject(wx, wy, wz);
}

function facePainterSortKey(corners) {
  let maxY = -Infinity;
  for (const [wx, wy, wz] of corners) {
    maxY = Math.max(maxY, isoProject(wx, wy, wz).y);
  }
  return maxY;
}

function writeProjectedQuad(verts, offset, corners, layout) {
  const projected = corners.map(([wx, wy, wz]) => {
    const p = projectCorner(wx, wy, wz);
    return {
      x: p.x * layout.scale + layout.offsetX,
      y: p.y * layout.scale + layout.offsetY,
    };
  });
  const tri = [projected[0], projected[1], projected[2], projected[0], projected[2], projected[3]];
  let write = offset;
  for (let i = 0; i < 6; i++) {
    verts[write++] = tri[i].x;
    verts[write++] = tri[i].y;
  }
  return write;
}

/**
 * 用固定最大建筑高度计算布局，避免随音乐幅度变化整体缩放（跳动）。
 */
function computeStableLayout(
  buildingCount,
  pitch,
  buildingWidth,
  buildingDepth,
  totalExtentX,
  showGroundPlane,
  skylineBaselinePercent,
) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

  const expandBounds = (wx, wy, wz) => {
    const p = projectCorner(wx, wy, wz);
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxY = Math.max(bounds.maxY, p.y);
  };

  const layoutHeight = MIN_BUILDING_HEIGHT + MAX_BUILDING_HEIGHT;
  for (let i = 0; i < buildingCount; i++) {
    const wx = i * pitch;
    const faces = buildIsoBuilding(wx, 0, layoutHeight, buildingWidth, buildingDepth);
    for (const face of [faces.left, faces.right, faces.top]) {
      for (const [wxp, wy, wz] of face) {
        expandBounds(wxp, wy, wz);
      }
    }
  }

  if (showGroundPlane) {
    expandBounds(0, 0, 0);
    expandBounds(totalExtentX, 0, 0);
    expandBounds(totalExtentX, 0, buildingDepth);
    expandBounds(0, 0, buildingDepth);
  }

  if (!Number.isFinite(bounds.minX)) return null;

  const minX = bounds.minX;
  const maxX = bounds.maxX;
  const minY = bounds.minY;
  const maxY = bounds.maxY;
  const contentWidth = Math.max(0.001, maxX - minX);
  const contentHeight = Math.max(0.001, maxY - minY);

  const baselineNdcY = -1 + 2 * (Math.max(5, Math.min(40, skylineBaselinePercent)) / 100);
  const topMargin = 0.08;
  const horizontalPad = 0.08;
  const availableWidth = 2 - horizontalPad * 2;
  const availableHeight = 1 - baselineNdcY - topMargin;

  const scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  const centerX = (minX + maxX) * 0.5;
  const offsetX = -centerX * scale;
  const offsetY = baselineNdcY - minY * scale;

  return { scale, offsetX, offsetY };
}

export function createIsometricSkylineRenderer(gl) {
  const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const fragmentShaderSource = `
precision mediump float;
uniform vec3 u_color;
uniform float u_alpha;
void main() {
  gl_FragColor = vec4(u_color, u_alpha);
}
`;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "u_color");
  const alphaLoc = gl.getUniformLocation(program, "u_alpha");
  const buffer = gl.createBuffer();
  let easedBars = [];

  const render = (points, shapeConfig, styleConfig) => {
    if (!Array.isArray(points) || points.length === 0) return;

    const normalized = processSpectrumPoints(points, shapeConfig, easedBars);
    const buildingCount = Math.max(16, Math.min(96, Math.round(Number(styleConfig.displayBuildingCount) || 48)));
    const amps = aggregateBands(normalized, buildingCount);
    const len = amps.length;
    if (len === 0) return;

    const buildingWidthPx = Math.max(4, Math.min(100, Number(styleConfig.buildingWidthPx) || 8));
    const buildingGapPx = Math.max(0, Math.min(12, Number(styleConfig.buildingGapPx) || 2));
    const skylineBaselinePercent = Math.max(5, Math.min(40, Number(styleConfig.skylineBaselinePercent) || 15));
    const showGroundPlane = Boolean(styleConfig.showGroundPlane);
    const freqReversed = Boolean(styleConfig.freqReversed);

    const canvasW = gl.canvas.width;
    const canvasH = gl.canvas.height;
    const pixelWorld = minNdcForPixels(1, Math.max(canvasW, canvasH)) * 0.55;
    const buildingWidth = buildingWidthPx * pixelWorld;
    const buildingGap = buildingGapPx * pixelWorld;
    const buildingDepth = buildingWidth * BUILDING_DEPTH_RATIO;
    // 等距投影下 Z 深度会在屏幕上向左延伸，间距须含 depth 才避免重叠
    const pitch = buildingWidth + buildingDepth + buildingGap;

    const buildings = [];
    for (let i = 0; i < len; i++) {
      const slot = freqReversed ? len - 1 - i : i;
      const amp = amps[slot];
      const height = MIN_BUILDING_HEIGHT + amp * MAX_BUILDING_HEIGHT;
      const wx = i * pitch;
      const wz = 0;
      buildings.push({ wx, wz, height, width: buildingWidth, depth: buildingDepth });
    }

    const rowExtentX = len > 1 ? (len - 1) * pitch + buildingWidth : buildingWidth;
    const layout = computeStableLayout(
      len,
      pitch,
      buildingWidth,
      buildingDepth,
      rowExtentX,
      showGroundPlane,
      skylineBaselinePercent,
    );
    if (!layout) return;

    const faceLeftColor = styleConfig.faceLeftColor;
    const faceRightColor = styleConfig.faceRightColor;
    const faceTopColor = styleConfig.faceTopColor;
    const drawFaces = [];

    if (showGroundPlane) {
      const ground = [
        [0, 0, 0],
        [rowExtentX, 0, 0],
        [rowExtentX, 0, buildingDepth],
        [0, 0, buildingDepth],
      ];
      drawFaces.push({
        corners: ground,
        color: faceTopColor,
        alpha: GROUND_ALPHA,
        sortKey: facePainterSortKey(ground) - 1e-3,
      });
    }

    for (const b of buildings) {
      const faces = buildIsoBuilding(b.wx, b.wz, b.height, b.width, b.depth);
      drawFaces.push({
        corners: faces.left,
        color: faceLeftColor,
        alpha: 1,
        sortKey: facePainterSortKey(faces.left),
      });
      drawFaces.push({
        corners: faces.right,
        color: faceRightColor,
        alpha: 1,
        sortKey: facePainterSortKey(faces.right),
      });
      drawFaces.push({
        corners: faces.top,
        color: faceTopColor,
        alpha: 1,
        sortKey: facePainterSortKey(faces.top),
      });
    }

    // 屏幕上方（远处）先画，下方（近处）后画
    drawFaces.sort((a, b) => b.sortKey - a.sortKey);

    const verts = new Float32Array(12);

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for (const face of drawFaces) {
      const vertCount = writeProjectedQuad(verts, 0, face.corners, layout);
      const c = face.color;
      const dim = face.alpha < 1 ? 0.55 : 1;
      gl.uniform3f(colorLoc, c.r * dim, c.g * dim, c.b * dim);
      gl.uniform1f(alphaLoc, face.alpha);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, vertCount), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vertCount / 2);
    }
  };

  return { render };
}
