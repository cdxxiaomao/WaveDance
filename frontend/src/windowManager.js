import { invoke } from "@tauri-apps/api/core";

const listEl = document.querySelector("#windowList");
const emptyEl = document.querySelector("#windowListEmpty");
const refreshBtn = document.querySelector("#refreshBtn");

const REFRESH_INTERVAL_MS = 2000;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderList(windows) {
  listEl.replaceChildren();

  if (!windows.length) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  for (const item of windows) {
    const li = document.createElement("li");
    li.className = "wm-item";

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "wm-item__main";
    mainBtn.dataset.label = item.label;
    mainBtn.innerHTML = `
      <span class="wm-item__title">${escapeHtml(item.title)}</span>
      <span class="wm-item__meta">
        <span class="wm-item__label">${escapeHtml(item.label)}</span>
        ${item.visible ? "" : '<span class="wm-item__badge">已隐藏</span>'}
      </span>
    `;
    mainBtn.addEventListener("click", () => focusWindow(item.label));

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "wm-item__close settings-btn settings-btn--ghost";
    closeBtn.textContent = "关闭";
    closeBtn.title = `关闭 ${item.title}`;
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeWindow(item.label);
    });

    li.append(mainBtn, closeBtn);
    listEl.appendChild(li);
  }
}

async function refreshList() {
  try {
    const windows = await invoke("list_managed_windows");
    renderList(Array.isArray(windows) ? windows : []);
  } catch (error) {
    console.error("刷新窗口列表失败", error);
  }
}

async function focusWindow(label) {
  try {
    await invoke("focus_managed_window", { label });
  } catch (error) {
    console.error("聚焦窗口失败", error);
    await refreshList();
  }
}

async function closeWindow(label) {
  try {
    await invoke("close_managed_window", { label });
    await refreshList();
  } catch (error) {
    console.error("关闭窗口失败", error);
    await refreshList();
  }
}

refreshBtn.addEventListener("click", () => {
  refreshList();
});

refreshList();
window.setInterval(refreshList, REFRESH_INTERVAL_MS);
