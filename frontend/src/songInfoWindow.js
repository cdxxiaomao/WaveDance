import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  applySongInfoWindowStyle,
  parseSongInfoStyleEventPayload,
  readSongInfoWindowConfig,
} from "./songInfoSettingsSchema.js";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const songInfoPanel = document.querySelector("#songInfoPanel");
const songTitle = document.querySelector("#songTitle");
const songArtist = document.querySelector("#songArtist");
const songAlbum = document.querySelector("#songAlbum");
const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const openSettingsBtn = document.querySelector("#openSettingsBtn");

const IDLE_TITLE = "未检测到正在播放";
const IDLE_ARTIST = "—";
const IDLE_ALBUM = "—";

function applyLocalSongInfoStyle(windowLabel) {
  if (!songInfoPanel) return;
  applySongInfoWindowStyle(songInfoPanel, readSongInfoWindowConfig(window.localStorage, windowLabel));
  syncVerticalColumnMaxHeight();
}

function syncVerticalColumnMaxHeight() {
  if (!songInfoPanel) return;
  const h = songInfoPanel.clientHeight;
  if (h > 0) {
    songInfoPanel.style.setProperty("--songinfo-column-max-height", `${h}px`);
  }
}

function textOrFallback(value, fallback) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || fallback;
}

function applyNowPlaying(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const active = Boolean(p.active);

  if (!songInfoPanel || !songTitle || !songArtist || !songAlbum) return;

  songInfoPanel.hidden = false;
  songInfoPanel.classList.toggle("is-idle", !active);

  if (!active) {
    songTitle.textContent = IDLE_TITLE;
    songArtist.textContent = IDLE_ARTIST;
    songAlbum.textContent = IDLE_ALBUM;
    return;
  }

  songTitle.textContent = textOrFallback(p.title, "未知歌曲");
  songArtist.textContent = textOrFallback(p.artist, "未知歌手");
  songAlbum.textContent = textOrFallback(p.album, "未知专辑");
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  document.body.classList.add("songinfo-dedicated", "overlay-edge-hint-window");

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

  applyLocalSongInfoStyle(windowLabel);
  initWindowEdgeHint();

  if (songInfoPanel) {
    const columnHeightObserver = new ResizeObserver(() => syncVerticalColumnMaxHeight());
    columnHeightObserver.observe(songInfoPanel);
    syncVerticalColumnMaxHeight();
  }

  const songInfoStyleTarget = { kind: "WebviewWindow", label: windowLabel };
  await listen(
    "songinfo-window-style",
    (event) => {
      const cfg = parseSongInfoStyleEventPayload(event.payload, windowLabel);
      if (cfg && songInfoPanel) {
        applySongInfoWindowStyle(songInfoPanel, cfg);
        syncVerticalColumnMaxHeight();
      }
    },
    { target: songInfoStyleTarget },
  );

  await listen("now-playing-update", (event) => {
    applyNowPlaying(event.payload);
  });

  try {
    const snap = await invoke("get_now_playing_snapshot");
    applyNowPlaying(snap);
  } catch (err) {
    console.warn("get_now_playing_snapshot failed:", err);
    applyNowPlaying(null);
  }

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

  mousePassthroughLockBtn?.addEventListener("click", async () => {
    try {
      const cur = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
      const next = !cur;
      await invoke("set_mouse_passthrough_locked", { label: windowLabel, locked: next });
      applyMousePassthroughLockUi(next);
    } catch (err) {
      console.error("mouse passthrough toggle failed:", err);
    }
  });

  openSettingsBtn?.addEventListener("click", async () => {
    try {
      await invoke("open_songinfo_settings_window");
    } catch (err) {
      console.error("open_songinfo_settings_window failed:", err);
    }
  });
}

init().catch((error) => {
  console.error("song info window init failed:", error);
});
