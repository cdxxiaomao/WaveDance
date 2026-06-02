import { invoke } from "@tauri-apps/api/core";
import { cursorPosition } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const WINDOW_EDGE_HINT_HIDE_MS = 1500;
const WINDOW_EDGE_BAND_LOGICAL = 18;
const WINDOW_EDGE_HINT_POLL_MS = 80;

let windowEdgeHintHideTimer = null;
let windowEdgeActive = false;
let pollTimer = null;

function revealWindowEdges() {
  document.body.classList.add("show-window-edges");
  if (document.body.classList.contains("mouse-passthrough-locked")) {
    invoke("reveal_overlay_unlock_toolbar", {
      label: getCurrentWebviewWindow().label,
    }).catch(() => {});
  }
  if (windowEdgeHintHideTimer != null) {
    clearTimeout(windowEdgeHintHideTimer);
  }
  windowEdgeHintHideTimer = window.setTimeout(() => {
    document.body.classList.remove("show-window-edges");
    windowEdgeHintHideTimer = null;
  }, WINDOW_EDGE_HINT_HIDE_MS);
}

/** 检测光标是否进入窗口边缘带（兼容 cursor 为逻辑/物理坐标两种平台行为） */
function cursorInWindowEdgeBand(cursor, pos, size, scale, bandLogical) {
  const inEdgeBand = (cx, cy, left, top, right, bottom, band) => {
    if (cx < left || cx > right || cy < top || cy > bottom) {
      return false;
    }
    return (
      cx - left <= band ||
      right - cx <= band ||
      cy - top <= band ||
      bottom - cy <= band
    );
  };

  const left = pos.x;
  const top = pos.y;
  const right = pos.x + size.width;
  const bottom = pos.y + size.height;
  const bandPhysical = bandLogical * scale;

  if (
    inEdgeBand(
      cursor.x * scale,
      cursor.y * scale,
      left,
      top,
      right,
      bottom,
      bandPhysical,
    )
  ) {
    return true;
  }

  return inEdgeBand(cursor.x, cursor.y, left, top, right, bottom, bandPhysical);
}

async function pollWindowEdgeHint() {
  try {
    const win = getCurrentWebviewWindow();
    const scale = await win.scaleFactor();
    const [cursor, pos, size] = await Promise.all([
      cursorPosition(),
      win.outerPosition(),
      win.outerSize(),
    ]);
    const inEdge = cursorInWindowEdgeBand(
      cursor,
      pos,
      size,
      scale,
      WINDOW_EDGE_BAND_LOGICAL,
    );
    if (inEdge && !windowEdgeActive) {
      revealWindowEdges();
    }
    windowEdgeActive = inEdge;
  } catch {
    // ignore
  }
}

/** 为浮层窗（歌词 / 浮层频谱）启用边缘蚂蚁线与穿透解锁条联动 */
export function initWindowEdgeHint() {
  if (pollTimer != null) return;
  pollTimer = window.setInterval(pollWindowEdgeHint, WINDOW_EDGE_HINT_POLL_MS);
}
