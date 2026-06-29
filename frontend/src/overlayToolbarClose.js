import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** 绑定浮层窗右上角「关闭」按钮，走窗口管理器统一关闭逻辑。 */
export function initOverlayToolbarClose(buttonEl) {
  if (!buttonEl) return;
  buttonEl.addEventListener("click", async () => {
    try {
      const label = getCurrentWebviewWindow().label;
      await invoke("close_managed_window", { label });
    } catch (err) {
      console.error("close_managed_window failed:", err);
    }
  });
}
