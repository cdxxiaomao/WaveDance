import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { initNowPlayingLyrics } from "./nowPlayingLyrics.js";
import {
  applyLyricsWindowStyle,
  parseLyricsStyleEventPayload,
  readLyricsWindowConfig,
} from "./lyricsSettingsSchema.js";

const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const openLyricsSettingsBtn = document.querySelector("#openLyricsSettingsBtn");
const resizeHandles = Array.from(document.querySelectorAll("[data-resize-dir]"));
const lyricsRoot = document.querySelector("#nowPlayingLyrics");

function applyLocalLyricsStyle(windowLabel) {
  if (!lyricsRoot) return;
  applyLyricsWindowStyle(lyricsRoot, readLyricsWindowConfig(window.localStorage, windowLabel));
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

  const triggerNativeResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const direction = event.currentTarget.dataset.resizeDir;
    if (!direction) return;
    document.body.classList.add("is-resizing-window");
    let lastX = event.screenX;
    let lastY = event.screenY;

    const onMouseMove = async (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.screenX - lastX;
      const deltaY = moveEvent.screenY - lastY;
      if (deltaX === 0 && deltaY === 0) return;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      try {
        await invoke("resize_window_by_delta", { direction, deltaX, deltaY });
      } catch {
        // ignore
      }
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("mouseleave", stopResize);
      document.body.classList.remove("is-resizing-window");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseleave", stopResize);
  };

  resizeHandles.forEach((handle) => {
    handle.addEventListener("mousedown", triggerNativeResize);
  });

  applyLocalLyricsStyle(windowLabel);

  const lyricsStyleTarget = { kind: "WebviewWindow", label: windowLabel };
  await listen(
    "lyrics-window-style",
    (event) => {
      const cfg = parseLyricsStyleEventPayload(event.payload, windowLabel);
      if (cfg && lyricsRoot) applyLyricsWindowStyle(lyricsRoot, cfg);
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

  if (openLyricsSettingsBtn) {
    openLyricsSettingsBtn.addEventListener("click", async () => {
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
