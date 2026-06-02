import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const lockBtn = document.querySelector("#mousePassthroughLockBtn");

/** 与 Rust 中 `toolbar.html#spectrum-1` 等一致；无 hash 时视为控制主窗 */
function toolbarTargetLabel() {
  const raw = window.location.hash.replace(/^#/, "");
  const decoded = raw ? decodeURIComponent(raw) : "";
  return decoded && decoded.length > 0 ? decoded : "main";
}

const targetLabel = toolbarTargetLabel();
const UNLOCK_REVEAL_MS = 3000;
let unlockRevealTimer = null;
let isEdgeRevealFloater = false;

async function hideEdgeRevealFloaterIfNeeded() {
  if (!isEdgeRevealFloater) return;
  document.body.classList.remove("show-unlock-button");
  try {
    await getCurrentWebviewWindow().hide();
  } catch {
    // ignore
  }
}

async function revealUnlockButtonTemporarily() {
  if (isEdgeRevealFloater) {
    try {
      await getCurrentWebviewWindow().show();
    } catch {
      // ignore
    }
  }
  document.body.classList.add("show-unlock-button");
  if (unlockRevealTimer != null) {
    clearTimeout(unlockRevealTimer);
  }
  unlockRevealTimer = window.setTimeout(() => {
    unlockRevealTimer = null;
    hideEdgeRevealFloaterIfNeeded();
  }, UNLOCK_REVEAL_MS);
}

/** 浮动窗仅在穿透开启时出现，此处只关心「解锁」态的展示与快捷键同步 */
function applyLockUi(locked) {
  const on = Boolean(locked);
  if (!lockBtn) return;
  lockBtn.setAttribute("aria-pressed", on ? "true" : "false");
  lockBtn.classList.toggle("is-locked", on);
  lockBtn.title = on
    ? "解锁：关闭鼠标穿透（或按 ⌘⇧⌥L）"
    : "穿透已关闭（本窗通常不显示）";
  const lockImg = lockBtn.querySelector("img[data-lock-icon]");
  if (lockImg) {
    lockImg.src = on ? "/icons/passthrough-active.svg" : "/icons/passthrough-idle.svg";
  }
  if (!on && isEdgeRevealFloater) {
    if (unlockRevealTimer != null) {
      clearTimeout(unlockRevealTimer);
      unlockRevealTimer = null;
    }
    hideEdgeRevealFloaterIfNeeded();
  }
}

async function resolveEdgeRevealFloater() {
  if (targetLabel.startsWith("lyrics-")) {
    return true;
  }
  if (targetLabel.startsWith("spectrum-")) {
    try {
      return Boolean(
        await invoke("get_spectrum_window_overlay_mode", { label: targetLabel }),
      );
    } catch {
      return false;
    }
  }
  return false;
}

async function init() {
  isEdgeRevealFloater = await resolveEdgeRevealFloater();
  if (isEdgeRevealFloater) {
    document.body.classList.add("toolbar-floater-edge-reveal");
    await listen("overlay-unlock-toolbar-reveal", () => {
      revealUnlockButtonTemporarily();
    });
  }

  await listen("mouse-passthrough-changed", (event) => {
    const p = event.payload;
    const lbl =
      p && typeof p === "object" && p.label != null ? String(p.label) : "main";
    const locked =
      p && typeof p === "object" && typeof p.locked === "boolean"
        ? p.locked
        : Boolean(p);
    if (lbl !== targetLabel) return;
    applyLockUi(locked);
  });

  try {
    const locked = await invoke("get_mouse_passthrough_locked", { label: targetLabel });
    applyLockUi(locked);
  } catch {
    applyLockUi(false);
  }

  if (lockBtn) {
    lockBtn.addEventListener("click", async () => {
      try {
        const cur = await invoke("get_mouse_passthrough_locked", { label: targetLabel });
        const next = !cur;
        await invoke("set_mouse_passthrough_locked", { label: targetLabel, locked: next });
        applyLockUi(next);
      } catch (err) {
        console.error("mouse passthrough toggle failed:", err);
      }
    });
  }

  if (isEdgeRevealFloater) {
    try {
      if (await getCurrentWebviewWindow().isVisible()) {
        revealUnlockButtonTemporarily();
      }
    } catch {
      // ignore
    }
  }
}

init().catch((err) => {
  console.error("toolbar init failed:", err);
});
