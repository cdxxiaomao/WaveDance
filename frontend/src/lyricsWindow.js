import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { initNowPlayingLyrics } from "./nowPlayingLyrics.js";
import {
  applyLyricsWindowStyle,
  parseLyricsStyleEventPayload,
  readLyricsWindowConfig,
} from "./lyricsSettingsSchema.js";

const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const lyricsRoot = document.querySelector("#nowPlayingLyrics");

const WINDOW_EDGE_HINT_HIDE_MS = 1500;
const WINDOW_EDGE_BAND_LOGICAL = 10;
const WINDOW_EDGE_HINT_POLL_MS = 80;
let windowEdgeHintHideTimer = null;
let windowEdgeActive = false;

function revealWindowEdges() {
  document.body.classList.add("show-window-edges");
  if (document.body.classList.contains("mouse-passthrough-locked")) {
    invoke("reveal_lyrics_unlock_toolbar", {
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

  // macOS：cursorPosition 常为逻辑坐标，outer* 为物理像素
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

  // 其他平台或已统一为物理坐标
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

function applyLocalLyricsStyle(windowLabel) {
  if (!lyricsRoot) return;
  applyLyricsWindowStyle(lyricsRoot, readLyricsWindowConfig(window.localStorage, windowLabel));
  syncVerticalColumnMaxHeight();
}

/** 竖排列高上限：用容器像素高度，避免 vertical-rl + height:100% 链导致 stage 宽度算窄 */
function syncVerticalColumnMaxHeight() {
  if (!lyricsRoot) return;
  const h = lyricsRoot.clientHeight;
  if (h > 0) {
    lyricsRoot.style.setProperty("--lyrics-column-max-height", `${h}px`);
  }
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  document.body.classList.add("lyrics-dedicated");

  const triggerNativeDrag = async (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest("[data-no-drag], button, input, select, textarea, a")) return;
    try {
      await invoke("start_window_dragging");
    } catch {
      // ignore
    }
  };
  document.body.addEventListener("mousedown", triggerNativeDrag);

  applyLocalLyricsStyle(windowLabel);

  if (lyricsRoot) {
    const columnHeightObserver = new ResizeObserver(() => syncVerticalColumnMaxHeight());
    columnHeightObserver.observe(lyricsRoot);
    syncVerticalColumnMaxHeight();
  }

  const lyricsStyleTarget = { kind: "WebviewWindow", label: windowLabel };
  window.setInterval(pollWindowEdgeHint, WINDOW_EDGE_HINT_POLL_MS);
  await listen(
    "lyrics-window-style",
    (event) => {
      const cfg = parseLyricsStyleEventPayload(event.payload, windowLabel);
      if (cfg && lyricsRoot) {
        applyLyricsWindowStyle(lyricsRoot, cfg);
        syncVerticalColumnMaxHeight();
      }
    },
    { target: lyricsStyleTarget },
  );

  await initNowPlayingLyrics({ lyricsOnly: true });

  const applyMousePassthroughLockUi = (locked) => {
    const on = Boolean(locked);
    document.body.classList.toggle("mouse-passthrough-locked", on);
    if (!mousePassthroughLockBtn) return;
    mousePassthroughLockBtn.setAttribute("aria-pressed", on ? "true" : "false");
    mousePassthroughLockBtn.classList.toggle("is-locked", on);
    mousePassthroughLockBtn.title = on
      ? "已穿透：点击关闭穿透"
      : "开启后本窗口鼠标穿透到下层";
    const lockImg = mousePassthroughLockBtn.querySelector("img[data-lock-icon]");
    if (lockImg) {
      lockImg.src = on ? "/icons/passthrough-active.svg" : "/icons/passthrough-idle.svg";
    }
  };

  await listen("mouse-passthrough-changed", (event) => {
    const p = event.payload;
    const lbl =
      p && typeof p === "object" && p.label != null ? String(p.label) : "";
    const locked =
      p && typeof p === "object" && typeof p.locked === "boolean"
        ? p.locked
        : Boolean(p);
    if (lbl !== windowLabel) return;
    applyMousePassthroughLockUi(locked);
  });

  try {
    const locked = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
    applyMousePassthroughLockUi(locked);
  } catch {
    applyMousePassthroughLockUi(false);
  }

  if (mousePassthroughLockBtn) {
    mousePassthroughLockBtn.addEventListener("click", async () => {
      try {
        const cur = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
        const next = !cur;
        await invoke("set_mouse_passthrough_locked", { label: windowLabel, locked: next });
        applyMousePassthroughLockUi(next);
      } catch (err) {
        console.error("mouse passthrough toggle failed:", err);
      }
    });
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", async () => {
      try {
        await invoke("open_lyrics_settings_window");
      } catch (err) {
        console.error("open_lyrics_settings_window failed:", err);
      }
    });
  }

}

init().catch((error) => {
  console.error("lyrics window init failed:", error);
});
