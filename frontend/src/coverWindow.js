import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  applyCoverShadowInset,
  applyCoverWindowStyle,
  normalizeCoverWindowConfig,
  parseCoverStyleEventPayload,
  readCoverWindowConfig,
} from "./coverSettingsSchema.js";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const coverArt = document.querySelector("#coverArt");
const coverPlaceholder = document.querySelector("#coverPlaceholder");
const coverWindowBody = document.querySelector("#coverWindowBody");
const coverArtFrame = document.querySelector("#coverArtFrame");
const openCoverSettingsBtn = document.querySelector("#openCoverSettingsBtn");

function applyCoverLayout(config) {
  const normalized = normalizeCoverWindowConfig(config);
  if (coverArtFrame) applyCoverWindowStyle(coverArtFrame, normalized);
  if (coverWindowBody) applyCoverShadowInset(coverWindowBody, normalized);
}

function applyLocalCoverStyle(windowLabel) {
  applyCoverLayout(readCoverWindowConfig(window.localStorage, windowLabel));
}

function applyCoverArtwork(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const active = Boolean(p.active);

  if (!coverArt || !coverPlaceholder || !coverWindowBody) return;

  coverWindowBody.classList.toggle("is-idle", !active);

  if (!active) {
    coverArt.hidden = true;
    coverArt.removeAttribute("src");
    coverPlaceholder.hidden = false;
    coverPlaceholder.textContent = "未检测到正在播放";
    return;
  }

  const path = typeof p.artworkPath === "string" ? p.artworkPath.trim() : "";
  const revision =
    typeof p.artworkRevision === "number" && Number.isFinite(p.artworkRevision)
      ? p.artworkRevision
      : 0;
  let art = "";
  if (path) {
    const base = convertFileSrc(path);
    art = `${base}${base.includes("?") ? "&" : "?"}v=${revision}`;
  } else if (
    typeof p.artworkDataUrl === "string" &&
    p.artworkDataUrl.startsWith("data:")
  ) {
    art = p.artworkDataUrl;
  }

  if (art) {
    coverArt.onerror = () => {
      if (path && typeof p.artworkDataUrl === "string" && p.artworkDataUrl.startsWith("data:")) {
        coverArt.onerror = null;
        coverArt.src = p.artworkDataUrl;
        return;
      }
      coverArt.hidden = true;
      coverArt.removeAttribute("src");
      coverPlaceholder.hidden = false;
      coverPlaceholder.textContent = "封面加载失败";
    };
    coverArt.src = art;
    coverArt.hidden = false;
    coverPlaceholder.hidden = true;
  } else {
    coverArt.hidden = true;
    coverArt.removeAttribute("src");
    coverPlaceholder.hidden = false;
    coverPlaceholder.textContent = "暂无封面";
  }
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  document.body.classList.add("cover-dedicated", "overlay-edge-hint-window");

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

  if (coverArt) {
    coverArt.addEventListener("dragstart", (event) => event.preventDefault());
  }
  document.addEventListener("dragstart", (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
    }
  });

  applyLocalCoverStyle(windowLabel);
  initWindowEdgeHint();

  const coverStyleTarget = { kind: "WebviewWindow", label: windowLabel };
  await listen(
    "cover-window-style",
    (event) => {
      const cfg = parseCoverStyleEventPayload(event.payload, windowLabel);
      if (cfg) applyCoverLayout(cfg);
    },
    { target: coverStyleTarget },
  );

  await listen("now-playing-update", (event) => {
    applyCoverArtwork(event.payload);
  });

  try {
    const snap = await invoke("get_now_playing_snapshot");
    applyCoverArtwork(snap);
  } catch (err) {
    console.warn("get_now_playing_snapshot failed:", err);
  }

  openCoverSettingsBtn?.addEventListener("click", async () => {
    try {
      await invoke("open_cover_settings_window");
    } catch (err) {
      console.error("open_cover_settings_window failed:", err);
    }
  });
}

init().catch((error) => {
  console.error("cover window init failed:", error);
});
