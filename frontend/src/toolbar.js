import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const lockBtn = document.querySelector("#mousePassthroughLockBtn");

/** 与 Rust 中 `toolbar.html#spectrum-1` 等一致；无 hash 时视为控制主窗 */
function toolbarTargetLabel() {
  const raw = window.location.hash.replace(/^#/, "");
  const decoded = raw ? decodeURIComponent(raw) : "";
  return decoded && decoded.length > 0 ? decoded : "main";
}

const targetLabel = toolbarTargetLabel();

if (targetLabel.startsWith("lyrics-")) {
  document.body.classList.add("toolbar-floater-lyrics");
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
}

async function init() {
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

}

init().catch((err) => {
  console.error("toolbar init failed:", err);
});
