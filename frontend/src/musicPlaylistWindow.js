import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { initWindowEdgeHint } from "./windowEdgeHint.js";

const playlistTabs = document.querySelector("#playlistTabs");
const playlistStatus = document.querySelector("#playlistStatus");
const playlistSplit = document.querySelector("#playlistSplit");
const playlistList = document.querySelector("#playlistList");
const playlistTracksPane = document.querySelector("#playlistTracksPane");
const playlistTracksHeader = document.querySelector("#playlistTracksHeader");
const playlistTracksTitle = document.querySelector("#playlistTracksTitle");
const playlistTracksMeta = document.querySelector("#playlistTracksMeta");
const playlistTracksSearchWrap = document.querySelector("#playlistTracksSearchWrap");
const playlistTracksSearch = document.querySelector("#playlistTracksSearch");
const playlistTracksStatus = document.querySelector("#playlistTracksStatus");
const playlistTrackList = document.querySelector("#playlistTrackList");
const refreshPlaylistBtn = document.querySelector("#refreshPlaylistBtn");
const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const openMusicLoginBtn = document.querySelector("#openMusicLoginBtn");

/** @type {"qq" | "netease"} */
let activeProvider = "qq";
/** @type {string | null} */
let selectedKey = null;
/** @type {Map<string, Array<Record<string, unknown>>>} */
const tracksCache = new Map();
/** @type {string | null} 当前 UI 播放态（播放器接入前占位） */
let playingTrackKey = null;
let trackSearchQuery = "";

const PLAYLIST_INVOKE_TIMEOUT_MS = 30000;
const PLAY_ICON_PATH =
  "M8 5.14v13.72c0 .79.87 1.27 1.54.84l9.14-6.86a1 1 0 0 0 0-1.68l-9.14-6.86A1 1 0 0 0 8 5.14z";
const PAUSE_ICON_PATH = "M7 5h3v14H7V5zm7 0h3v14h-3V5z";

function invokeWithTimeout(command, args, timeoutMs = PLAYLIST_INVOKE_TIMEOUT_MS) {
  return Promise.race([
    invoke(command, args),
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("请求超时，请检查网络后点击刷新重试"));
      }, timeoutMs);
    }),
  ]);
}

function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function playlistKey(provider, id) {
  return `${provider}:${id}`;
}

function trackRowKey(playlistSelectionKey, trackId) {
  return `${playlistSelectionKey}::${trackId}`;
}

function createTrackPlayIcon(playing = false) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("playlist-track__play-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", playing ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
  svg.appendChild(path);
  return svg;
}

function setTrackPlayIcon(icon, playing) {
  const path = icon?.querySelector("path");
  if (!path) return;
  path.setAttribute("d", playing ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
}

function syncPlayingTrackUi() {
  if (!playlistTrackList) return;
  for (const row of playlistTrackList.querySelectorAll(".playlist-track")) {
    const key = row.dataset.trackKey;
    const playing = Boolean(key && key === playingTrackKey);
    row.classList.toggle("is-playing", playing);
    const btn = row.querySelector(".playlist-track__play");
    const icon = row.querySelector(".playlist-track__play-icon");
    if (btn) {
      btn.setAttribute("aria-label", playing ? "暂停" : "播放");
      btn.setAttribute("aria-pressed", playing ? "true" : "false");
      btn.title = playing ? "暂停" : "播放";
    }
    setTrackPlayIcon(icon, playing);
  }
}

function toggleTrackPlayback(trackKey) {
  if (playingTrackKey === trackKey) {
    playingTrackKey = null;
  } else {
    playingTrackKey = trackKey;
  }
  syncPlayingTrackUi();
  // TODO: 接入 QQ / 网易云播放器
}

function createPlayingIndicator() {
  const indicator = document.createElement("span");
  indicator.className = "playlist-track__playing-indicator";
  indicator.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i += 1) {
    const bar = document.createElement("span");
    bar.className = "playlist-track__playing-bar";
    bar.style.setProperty("--bar-index", String(i));
    indicator.appendChild(bar);
  }
  return indicator;
}

function createTrackPlayButton(trackKey) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "playlist-track__play";
  btn.setAttribute("aria-label", "播放");
  btn.setAttribute("aria-pressed", "false");
  btn.title = "播放";
  btn.appendChild(createTrackPlayIcon(false));
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTrackPlayback(trackKey);
  });
  return btn;
}

function setStatus(text, kind = "info") {
  if (!playlistStatus) return;
  playlistStatus.textContent = text;
  playlistStatus.className = `playlist-status playlist-status--${kind}`;
  playlistStatus.hidden = false;
}

function setTracksStatus(text, kind = "info") {
  if (!playlistTracksStatus) return;
  if (!text) {
    playlistTracksStatus.hidden = true;
    playlistTracksStatus.textContent = "";
    return;
  }
  playlistTracksStatus.textContent = text;
  playlistTracksStatus.className = `playlist-tracks-status playlist-tracks-status--${kind}`;
  playlistTracksStatus.hidden = false;
}

function updateSplitLayout() {
  const hasSelection = Boolean(selectedKey);
  playlistSplit?.classList.toggle("has-selection", hasSelection);
  if (playlistTracksPane) {
    playlistTracksPane.setAttribute("aria-hidden", hasSelection ? "false" : "true");
  }
}

function clearTrackSearch() {
  trackSearchQuery = "";
  if (playlistTracksSearch) playlistTracksSearch.value = "";
  if (playlistTracksSearchWrap) playlistTracksSearchWrap.hidden = true;
}

function setTrackSearchVisible(visible) {
  if (playlistTracksSearchWrap) playlistTracksSearchWrap.hidden = !visible;
}

function normalizeSearchText(text) {
  return String(text || "").trim().toLowerCase();
}

function filterTracks(tracks, query) {
  const q = normalizeSearchText(query);
  if (!q) return tracks;
  return tracks.filter((track) => {
    const haystack = [track.name, track.artist, track.album]
      .map((value) => normalizeSearchText(value))
      .join(" ");
    return haystack.includes(q);
  });
}

function renderFilteredTracks() {
  if (!selectedKey) return;
  const allTracks = tracksCache.get(selectedKey) || [];
  const filtered = filterTracks(allTracks, trackSearchQuery);
  const emptyMessage =
    allTracks.length > 0 && normalizeSearchText(trackSearchQuery)
      ? "无匹配曲目"
      : "暂无曲目";
  renderTrackRows(filtered, { emptyMessage });
}

function clearSelection() {
  selectedKey = null;
  playingTrackKey = null;
  clearTrackSearch();
  updateSplitLayout();
  if (playlistTracksHeader) playlistTracksHeader.hidden = true;
  if (playlistTrackList) playlistTrackList.innerHTML = "";
  setTracksStatus("");
  for (const row of playlistList?.querySelectorAll(".playlist-item__row") ?? []) {
    row.classList.remove("is-active");
  }
}

function renderTabs(ctx) {
  if (!playlistTabs) return;
  const show = Boolean(ctx?.showTabs);
  playlistTabs.hidden = !show;
  if (!show) return;
  for (const btn of playlistTabs.querySelectorAll(".playlist-tab")) {
    const provider = btn.getAttribute("data-provider");
    btn.classList.toggle("is-active", provider === activeProvider);
  }
}

function renderTrackRows(tracks, options = {}) {
  if (!playlistTrackList || !selectedKey) return;
  const emptyMessage = options.emptyMessage ?? "暂无曲目";
  playlistTrackList.innerHTML = "";
  if (tracks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "playlist-track playlist-track--empty";
    empty.textContent = emptyMessage;
    playlistTrackList.appendChild(empty);
    return;
  }

  tracks.forEach((track, index) => {
    const trackId = String(track.id || index);
    const rowKey = trackRowKey(selectedKey, trackId);
    const playing = rowKey === playingTrackKey;

    const trackLi = document.createElement("li");
    trackLi.className = "playlist-track";
    trackLi.dataset.trackKey = rowKey;
    if (playing) trackLi.classList.add("is-playing");

    const playBtn = createTrackPlayButton(rowKey);
    if (playing) {
      playBtn.setAttribute("aria-label", "暂停");
      playBtn.setAttribute("aria-pressed", "true");
      playBtn.title = "暂停";
      setTrackPlayIcon(playBtn.querySelector(".playlist-track__play-icon"), true);
    }

    const body = document.createElement("div");
    body.className = "playlist-track__body";

    const titleRow = document.createElement("div");
    titleRow.className = "playlist-track__title-row";

    const name = document.createElement("span");
    name.className = "playlist-track__name";
    name.textContent = String(track.name || "未知曲目");

    const status = document.createElement("span");
    status.className = "playlist-track__status";
    status.textContent = "播放中";

    titleRow.appendChild(name);
    titleRow.appendChild(createPlayingIndicator());
    titleRow.appendChild(status);

    const artist = document.createElement("span");
    artist.className = "playlist-track__artist";
    artist.textContent = String(track.artist || "");

    body.appendChild(titleRow);
    body.appendChild(artist);

    const dur = document.createElement("span");
    dur.className = "playlist-track__dur";
    dur.textContent = formatDuration(track.durationMs);

    trackLi.appendChild(playBtn);
    trackLi.appendChild(body);
    trackLi.appendChild(dur);
    playlistTrackList.appendChild(trackLi);
  });
}

function renderTracksPanel(item) {
  if (!item || !playlistTracksHeader || !playlistTracksTitle || !playlistTracksMeta) return;
  playlistTracksHeader.hidden = false;
  playlistTracksTitle.textContent = String(item.name || "未命名歌单");
  const count = typeof item.trackCount === "number" ? item.trackCount : 0;
  const creator = item.creator ? String(item.creator) : "";
  playlistTracksMeta.textContent = creator ? `${creator} · ${count} 首` : `${count} 首`;
}

async function loadTracksForSelection(key, item) {
  const activeRow = playlistList?.querySelector(`.playlist-item__row[data-playlist-key="${key}"]`);
  activeRow?.classList.add("is-loading");

  clearTrackSearch();
  setTracksStatus("正在加载曲目…", "loading");
  renderTracksPanel(item);
  renderTrackRows([]);

  try {
    if (tracksCache.has(key)) {
      const cached = tracksCache.get(key) || [];
      setTracksStatus("");
      setTrackSearchVisible(cached.length > 0);
      renderFilteredTracks();
      return;
    }

    const tracks = await invokeWithTimeout("music_playlist_tracks", {
      provider: activeProvider,
      playlistId: String(item.id),
    });
    const list = Array.isArray(tracks) ? tracks : [];
    tracksCache.set(key, list);
    setTracksStatus("");
    setTrackSearchVisible(list.length > 0);
    renderFilteredTracks();
  } catch (err) {
    selectedKey = null;
    updateSplitLayout();
    for (const row of playlistList?.querySelectorAll(".playlist-item__row") ?? []) {
      row.classList.remove("is-active");
    }
    setTracksStatus(String(err), "error");
  } finally {
    activeRow?.classList.remove("is-loading");
  }
}

async function selectPlaylist(item, provider) {
  const key = playlistKey(provider, String(item.id));
  if (selectedKey === key) {
    clearSelection();
    return;
  }

  selectedKey = key;
  updateSplitLayout();

  for (const row of playlistList?.querySelectorAll(".playlist-item__row") ?? []) {
    row.classList.toggle("is-active", row.dataset.playlistKey === key);
  }

  await loadTracksForSelection(key, item);
}

function renderPlaylistItem(item, provider) {
  const li = document.createElement("li");
  li.className = "playlist-item";

  const key = playlistKey(provider, String(item.id));
  const isActive = selectedKey === key;

  const row = document.createElement("button");
  row.type = "button";
  row.className = "playlist-item__row";
  row.dataset.playlistKey = key;
  if (isActive) row.classList.add("is-active");
  row.setAttribute("aria-pressed", isActive ? "true" : "false");

  if (item.cover) {
    const img = document.createElement("img");
    img.className = "playlist-item__cover";
    img.src = String(item.cover);
    img.alt = "";
    img.loading = "lazy";
    row.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "playlist-item__cover playlist-item__cover--placeholder";
    ph.textContent = "♪";
    row.appendChild(ph);
  }

  const meta = document.createElement("div");
  meta.className = "playlist-item__meta";
  const title = document.createElement("div");
  title.className = "playlist-item__title";
  title.textContent = String(item.name || "未命名歌单");
  const sub = document.createElement("div");
  sub.className = "playlist-item__sub";
  const count = typeof item.trackCount === "number" ? item.trackCount : 0;
  const creator = item.creator ? String(item.creator) : "";
  sub.textContent = creator ? `${creator} · ${count} 首` : `${count} 首`;
  meta.appendChild(title);
  meta.appendChild(sub);
  row.appendChild(meta);

  row.addEventListener("click", () => {
    selectPlaylist(item, provider).catch((err) => setStatus(String(err), "error"));
  });

  li.appendChild(row);
  return li;
}

function renderPlaylistList(items) {
  if (!playlistList) return;
  playlistList.innerHTML = "";
  for (const item of items) {
    playlistList.appendChild(renderPlaylistItem(item, activeProvider));
  }
}

async function renderCurrentProvider() {
  if (!playlistList || !playlistSplit) return;
  clearSelection();
  playlistSplit.hidden = true;
  playlistList.innerHTML = "";
  setStatus("正在加载歌单…", "loading");

  try {
    const items = await invokeWithTimeout("music_playlist_list", { provider: activeProvider });
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      setStatus("暂无歌单", "empty");
      return;
    }
    playlistStatus.hidden = true;
    playlistSplit.hidden = false;
    renderPlaylistList(list);
  } catch (err) {
    setStatus(String(err), "error");
  }
}

async function loadContextAndRender() {
  try {
    const ctx = await invokeWithTimeout("music_playlist_get_context");
    const data = ctx && typeof ctx === "object" ? ctx : {};

    if (!data.neteaseLoggedIn && !data.qqLoggedIn) {
      if (playlistTabs) playlistTabs.hidden = true;
      if (playlistSplit) playlistSplit.hidden = true;
      clearSelection();
      setStatus("请先在「登录音乐平台」中登录 QQ 音乐或网易云音乐", "empty");
      return;
    }

    activeProvider =
      data.defaultTab === "netease" && data.neteaseLoggedIn
        ? "netease"
        : data.qqLoggedIn
          ? "qq"
          : "netease";

    renderTabs(data);
    await renderCurrentProvider();
  } catch (err) {
    if (playlistTabs) playlistTabs.hidden = true;
    if (playlistSplit) playlistSplit.hidden = true;
    clearSelection();
    setStatus(String(err), "error");
  }
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  document.body.classList.add("playlist-dedicated", "overlay-edge-hint-window");

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

  const reloadPlaylists = () => {
    tracksCache.clear();
    loadContextAndRender().catch((err) => setStatus(String(err), "error"));
  };

  await listen("music-playlist-should-reload", reloadPlaylists);
  await loadContextAndRender();

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

  refreshPlaylistBtn?.addEventListener("click", reloadPlaylists);

  openMusicLoginBtn?.addEventListener("click", () => {
    invoke("open_music_platform_login_window").catch(console.error);
  });

  playlistTabs?.addEventListener("click", (event) => {
    const btn = event.target.closest(".playlist-tab");
    if (!btn) return;
    const provider = btn.getAttribute("data-provider");
    if (provider !== "qq" && provider !== "netease") return;
    activeProvider = provider;
    tracksCache.clear();
    for (const tab of playlistTabs.querySelectorAll(".playlist-tab")) {
      tab.classList.toggle("is-active", tab === btn);
    }
    renderCurrentProvider().catch((err) => setStatus(String(err), "error"));
  });

  playlistTracksSearch?.addEventListener("input", () => {
    trackSearchQuery = playlistTracksSearch.value;
    renderFilteredTracks();
  });

  await listen("netease-login-finished", reloadPlaylists);
  await listen("qq-login-finished", reloadPlaylists);
}

init().catch((error) => {
  console.error("playlist window init failed:", error);
  setStatus("歌单窗口初始化失败", "error");
});
