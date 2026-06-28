import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const MUSIC_PLAYER_STATE_EVENT = "music-player-state-update";

const playerQueueStatus = document.querySelector("#playerQueueStatus");
const playerQueueList = document.querySelector("#playerQueueList");

function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createPlayingIndicator() {
  const indicator = document.createElement("span");
  indicator.className = "player-queue-window-item__playing-indicator";
  indicator.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i += 1) {
    const bar = document.createElement("span");
    bar.className = "player-queue-window-item__playing-bar";
    bar.style.setProperty("--bar-index", String(i));
    indicator.appendChild(bar);
  }
  return indicator;
}

function setStatus(text, kind = "empty") {
  if (!playerQueueStatus) return;
  playerQueueStatus.hidden = false;
  playerQueueStatus.textContent = text;
  playerQueueStatus.classList.remove("playlist-status--error", "playlist-status--empty");
  if (kind === "error") playerQueueStatus.classList.add("playlist-status--error");
  if (kind === "empty") playerQueueStatus.classList.add("playlist-status--empty");
  if (playerQueueList) playerQueueList.hidden = true;
}

function renderQueue(snapshot) {
  const queue = Array.isArray(snapshot?.queue) ? snapshot.queue : [];
  const currentIndex = snapshot?.currentIndex;

  if (!playerQueueList) return;

  if (queue.length === 0) {
    setStatus("暂无播放队列", "empty");
    return;
  }

  if (playerQueueStatus) playerQueueStatus.hidden = true;
  playerQueueList.hidden = false;
  playerQueueList.innerHTML = "";

  queue.forEach((track, index) => {
    const isPlaying = index === currentIndex;

    const li = document.createElement("li");
    li.className = "player-queue-window-item";
    if (isPlaying) li.classList.add("is-playing");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "player-queue-window-item__btn";

    const body = document.createElement("div");
    body.className = "player-queue-window-item__body";

    const titleRow = document.createElement("div");
    titleRow.className = "player-queue-window-item__title-row";

    const name = document.createElement("span");
    name.className = "player-queue-window-item__name";
    name.textContent = String(track?.name ?? "未知曲目");

    const status = document.createElement("span");
    status.className = "player-queue-window-item__status";
    status.textContent = "播放中";

    titleRow.appendChild(name);
    titleRow.appendChild(createPlayingIndicator());
    titleRow.appendChild(status);

    const artist = document.createElement("span");
    artist.className = "player-queue-window-item__artist";
    artist.textContent = String(track?.artist ?? "");

    body.appendChild(titleRow);
    body.appendChild(artist);

    const dur = document.createElement("span");
    dur.className = "player-queue-window-item__dur";
    dur.textContent = formatDuration(track?.durationMs);

    btn.appendChild(body);
    btn.appendChild(dur);
    btn.addEventListener("click", () => {
      invoke("music_player_play_index", { index }).catch(console.error);
    });
    li.appendChild(btn);
    playerQueueList.appendChild(li);
  });
}

async function loadInitialState() {
  try {
    const snap = await invoke("music_player_get_state");
    renderQueue(snap);
  } catch (err) {
    setStatus(String(err), "error");
  }
}

async function init() {
  document.body.classList.add("player-queue-dedicated", "overlay-edge-hint-window");

  document.body.addEventListener("mousedown", async (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest("[data-no-drag], button, input, select, textarea, a")) return;
    try {
      await invoke("start_window_dragging");
    } catch {
      // ignore
    }
  });

  initWindowEdgeHint();

  await listen(MUSIC_PLAYER_STATE_EVENT, (event) => {
    renderQueue(event.payload);
  });

  await loadInitialState();
}

init().catch((err) => {
  console.error("music player queue window init failed:", err);
});
