import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { initNowPlayingLyrics, applyLyricsRendererFromConfig } from "./nowPlayingLyrics.js";
import {
  parseLyricsStyleEventPayload,
  readLyricsWindowConfig,
} from "./lyricsSettingsSchema.js";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const openLyricsSearchBtn = document.querySelector("#openLyricsSearchBtn");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const lyricsRoot = document.querySelector("#nowPlayingLyrics");

function applyLocalLyricsStyle(windowLabel) {
  applyLyricsRendererFromConfig(readLyricsWindowConfig(window.localStorage, windowLabel));
  syncVerticalColumnMaxHeight();
}

/** 竖排列高上限：用容器像素高度，避免 vertical-rl + height:100% 链导致 stage 宽度算窄 */
function syncVerticalColumnMaxHeight() {
  if (!lyricsRoot || lyricsRoot.classList.contains("uses-am-lyrics")) return;
  const h = lyricsRoot.clientHeight;
  if (h > 0) {
    lyricsRoot.style.setProperty("--lyrics-column-max-height", `${h}px`);
  }
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  document.body.classList.add("lyrics-dedicated", "overlay-edge-hint-window");

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

  initWindowEdgeHint();

  if (lyricsRoot) {
    const columnHeightObserver = new ResizeObserver(() => syncVerticalColumnMaxHeight());
    columnHeightObserver.observe(lyricsRoot);
  }

  const lyricsStyleTarget = { kind: "WebviewWindow", label: windowLabel };
  await listen(
    "lyrics-window-style",
    (event) => {
      const cfg = parseLyricsStyleEventPayload(event.payload, windowLabel);
      if (cfg) applyLyricsRendererFromConfig(cfg);
    },
    { target: lyricsStyleTarget },
  );

  await initNowPlayingLyrics({ lyricsOnly: true });
  applyLocalLyricsStyle(windowLabel);

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

  if (openLyricsSearchBtn) {
    openLyricsSearchBtn.addEventListener("click", async () => {
      try {
        await invoke("open_lyrics_search_window");
      } catch (err) {
        console.error("open_lyrics_search_window failed:", err);
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
