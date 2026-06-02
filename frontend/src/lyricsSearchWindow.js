import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const targetBanner = document.querySelector("#lyricsSearchTargetBanner");
const statusEl = document.querySelector("#lyricsSearchStatus");
const queryTitle = document.querySelector("#lyricsSearchQueryTitle");
const queryArtist = document.querySelector("#lyricsSearchQueryArtist");
const queryAlbum = document.querySelector("#lyricsSearchQueryAlbum");
const activeSource = document.querySelector("#lyricsSearchActiveSource");
const errorEl = document.querySelector("#lyricsSearchError");
const refreshBtn = document.querySelector("#refreshLyricsSearchBtn");
const candidatesEmpty = document.querySelector("#lyricsSearchCandidatesEmpty");
const candidatesList = document.querySelector("#lyricsSearchCandidates");

let lyricsTargetLabel = "";

const STATUS_LABELS = {
  idle: "等待播放",
  loading: "正在加载…",
  success: "加载成功",
  failed: "加载失败",
};

const RESULT_LABELS = {
  idle: "空闲",
  loading: "检索中",
  hit: "已命中",
  miss: "未命中",
};

function formatDuration(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return "";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateTargetBanner() {
  if (!targetBanner) return;
  targetBanner.textContent = lyricsTargetLabel
    ? `关联歌词窗：${lyricsTargetLabel}`
    : "";
  targetBanner.hidden = !lyricsTargetLabel;
}

/** @param {Record<string, unknown> | null | undefined} raw */
function applySession(raw) {
  const session = raw && typeof raw === "object" ? raw : {};
  const status = typeof session.status === "string" ? session.status : "idle";
  const resultStatus =
    typeof session.resultStatus === "string" ? session.resultStatus : "idle";

  if (statusEl) {
    statusEl.textContent = STATUS_LABELS[status] || status;
    statusEl.className = `lyrics-search-status lyrics-search-status--${status}`;
    const detail = RESULT_LABELS[resultStatus];
    if (detail && status !== "idle" && status !== "loading") {
      statusEl.textContent = `${STATUS_LABELS[status] || status}（${detail}）`;
    }
  }

  if (queryTitle) {
    queryTitle.textContent =
      typeof session.queryTitle === "string" && session.queryTitle.trim()
        ? session.queryTitle.trim()
        : "—";
  }
  if (queryArtist) {
    queryArtist.textContent =
      typeof session.queryArtist === "string" && session.queryArtist.trim()
        ? session.queryArtist.trim()
        : "—";
  }
  if (queryAlbum) {
    queryAlbum.textContent =
      typeof session.queryAlbum === "string" && session.queryAlbum.trim()
        ? session.queryAlbum.trim()
        : "—";
  }
  if (activeSource) {
    activeSource.textContent =
      typeof session.activeSource === "string" && session.activeSource.trim()
        ? session.activeSource.trim()
        : "—";
  }

  if (errorEl) {
    const err =
      typeof session.errorMessage === "string" ? session.errorMessage.trim() : "";
    errorEl.textContent = err;
    errorEl.hidden = !err;
  }

  const candidates = Array.isArray(session.candidates) ? session.candidates : [];
  renderCandidates(candidates);
}

/** @param {unknown[]} candidates */
function renderCandidates(candidates) {
  if (!candidatesList || !candidatesEmpty) return;
  candidatesList.replaceChildren();

  if (candidates.length === 0) {
    candidatesList.hidden = true;
    candidatesEmpty.hidden = false;
    return;
  }

  candidatesEmpty.hidden = true;
  candidatesList.hidden = false;

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const c = /** @type {Record<string, unknown>} */ (item);
    const id = typeof c.id === "string" ? c.id : "";
    const title = typeof c.title === "string" ? c.title : "未知曲目";
    const artist = typeof c.artist === "string" ? c.artist : "";
    const album = typeof c.album === "string" ? c.album : "";
    const source = typeof c.source === "string" ? c.source : "";
    const score = typeof c.score === "number" ? c.score : 0;
    const selected = Boolean(c.selected);
    const duration = formatDuration(
      typeof c.durationSec === "number" ? c.durationSec : null,
    );

    const li = document.createElement("li");
    li.className = "lyrics-search-candidate";
    if (selected) li.classList.add("is-selected");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lyrics-search-candidate__btn";
    btn.dataset.candidateId = id;
    btn.disabled = selected || !id;

    const metaParts = [source, duration, `评分 ${score.toFixed(1)}`].filter(Boolean);
    btn.innerHTML = `
      <span class="lyrics-search-candidate__title">${escapeHtml(title)}</span>
      <span class="lyrics-search-candidate__artist">${escapeHtml(artist || "未知艺术家")}</span>
      <span class="lyrics-search-candidate__meta">${escapeHtml(metaParts.join(" · "))}${album ? ` · ${escapeHtml(album)}` : ""}</span>
      ${selected ? '<span class="lyrics-search-candidate__badge">当前使用</span>' : ""}
    `;

    btn.addEventListener("click", async () => {
      if (!id || selected) return;
      try {
        await invoke("select_lyrics_candidate", { candidateId: id });
      } catch (err) {
        console.error("select_lyrics_candidate failed:", err);
      }
    });

    li.appendChild(btn);
    candidatesList.appendChild(li);
  }
}

/** @param {string} text */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  updateTargetBanner();

  await listen("lyrics-search-target", (event) => {
    lyricsTargetLabel =
      typeof event.payload === "string" ? event.payload : String(event.payload ?? "");
    updateTargetBanner();
  });

  await listen("lyrics-search-update", (event) => {
    applySession(event.payload);
  });

  refreshBtn?.addEventListener("click", async () => {
    try {
      await invoke("refresh_lyrics_search");
    } catch (err) {
      console.error("refresh_lyrics_search failed:", err);
    }
  });

  try {
    const session = await invoke("get_lyrics_search_session");
    applySession(session);
  } catch (err) {
    console.warn("get_lyrics_search_session failed:", err);
  }
}

init().catch((err) => {
  console.error("lyrics search window init failed:", err);
});
