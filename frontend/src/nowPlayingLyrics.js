import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  applyAmLyricsStyle,
  isAmLyricsMounted,
  mountAmLyricsPanel,
  refreshAmLyricsPanel,
  renderAmLyricsPanel,
  resetAmLyricsBinding,
  syncAmLyricsTime,
  unmountAmLyricsPanel,
} from "./amLyricsPanel.js";
import { buildClassicLyricsDom } from "./classicLyricsDom.js";
import { createLyricsLineTransition } from "./lyricsLineTransition.js";
import {
  applyMineradioLyricsStyle,
  feedMineradioWaveformFrame,
  isMineradioLyricsMounted,
  mountMineradioLyricsPanel,
  renderMineradioLyricsPanel,
  tickMineradioLyrics,
  unmountMineradioLyricsPanel,
} from "./mineradioLyricsPanel.js";
import {
  applyLyricsWindowStyle,
  isAmScrollRenderer,
  isMineradioRenderer,
  normalizeLyricsWindowConfig,
} from "./lyricsSettingsSchema.js";

function formatPlaybackTime(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** @type {null | { bundleName: string, playingLabel: string, elapsedSec: number, durationSec: number | null, syncedAt: number, isPlaying: boolean }} */
let nowPlayingProgressSync = null;

/** @type {{ trackKey: string, status: string, lines: { timeMs: number, text: string }[], plainLyrics: string, instrumental: boolean, lyricsSource: string }} */
let lyricsDisplayState = {
  trackKey: "",
  status: "idle",
  lines: [],
  plainLyrics: "",
  instrumental: false,
  lyricsSource: "",
};

const LYRICS_LEAD_MS = 320;
/** @type {{ current: string, next: string, lineIndex: number }} */
let lastRenderedLyrics = { current: "", next: "", lineIndex: -1 };
/** @type {number | null} */
let lyricsRafId = null;
let nowPlayingTrackTitle = "";
let nowPlayingTrackArtist = "";

let nowPlayingPanel = null;
let nowPlayingArt = null;
let nowPlayingTitle = null;
let nowPlayingArtist = null;
let nowPlayingAlbum = null;
let nowPlayingSource = null;
let nowPlayingLyrics = null;
let nowPlayingLyricCurrent = null;
let nowPlayingLyricNext = null;
let lyricsOnlyMode = false;
let useAmScrollRenderer = false;
let useMineradioRenderer = false;
/** @type {ReturnType<typeof createLyricsLineTransition> | null} */
let lyricsLineTransition = null;

function getLiveElapsedSec() {
  if (!nowPlayingProgressSync) return 0;
  let elapsed = nowPlayingProgressSync.elapsedSec;
  if (nowPlayingProgressSync.isPlaying) {
    elapsed += (performance.now() - nowPlayingProgressSync.syncedAt) / 1000;
  }
  const duration = nowPlayingProgressSync.durationSec;
  if (typeof duration === "number" && duration > 0) {
    elapsed = Math.min(elapsed, duration);
  }
  return Math.max(0, elapsed);
}

function renderNowPlayingSourceLine() {
  if (!nowPlayingSource || !nowPlayingProgressSync) return;
  const elapsed = formatPlaybackTime(getLiveElapsedSec());
  const duration =
    nowPlayingProgressSync.durationSec != null
      ? formatPlaybackTime(nowPlayingProgressSync.durationSec)
      : "";
  const progress =
    elapsed && duration ? `${elapsed} / ${duration}` : elapsed || duration || "";
  const parts = [
    nowPlayingProgressSync.bundleName,
    nowPlayingProgressSync.playingLabel,
    progress,
  ].filter(Boolean);
  nowPlayingSource.textContent = parts.join(" · ");
}

function pickLyricLineIndexAtMs(ms) {
  const lines = lyricsDisplayState.lines;
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = typeof lines[mid].timeMs === "number" ? lines[mid].timeMs : 0;
    if (t <= ms) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

/** @returns {{ current: string, next: string, lineIndex: number }} */
function pickLyricPairAtTime(elapsedSec) {
  const ms = Math.max(0, elapsedSec) * 1000 + LYRICS_LEAD_MS;
  const lines = lyricsDisplayState.lines;
  if (lines.length > 0) {
    const idx = pickLyricLineIndexAtMs(ms);
    const current = idx >= 0 ? (lines[idx].text || "") : "";
    const nextRaw = idx + 1 < lines.length ? (lines[idx + 1].text || "") : "";
    const next = nextRaw && nextRaw !== current ? nextRaw : "";
    return { current, next, lineIndex: idx };
  }
  if (lyricsDisplayState.plainLyrics) {
    const rows = lyricsDisplayState.plainLyrics.split("\n").map((s) => s.trim()).filter(Boolean);
    if (rows.length > 0) {
      const idx = Math.min(rows.length - 1, Math.floor(elapsedSec / 4));
      const current = rows[idx] || "";
      const nextRaw = idx + 1 < rows.length ? rows[idx + 1] : "";
      const next = nextRaw && nextRaw !== current ? nextRaw : "";
      return { current, next, lineIndex: idx };
    }
  }
  return { current: "", next: "", lineIndex: -1 };
}

/** @returns {{ current: string, next: string }} */
function getTrackMetaLyricLines() {
  return {
    current: nowPlayingTrackTitle || "未知曲目",
    next: nowPlayingTrackArtist,
  };
}

function setLyricsLines(current, next, options = {}) {
  if (lyricsOnlyMode && lyricsLineTransition) {
    lyricsLineTransition.apply(current, next, options);
    return;
  }
  if (nowPlayingLyricCurrent) {
    nowPlayingLyricCurrent.textContent = current;
    nowPlayingLyricCurrent.hidden = !current;
  }
  if (nowPlayingLyricNext) {
    nowPlayingLyricNext.textContent = next;
    nowPlayingLyricNext.hidden = !next;
  }
}

function clearLyricsLines() {
  lastRenderedLyrics = { current: "", next: "", lineIndex: -1 };
  if (lyricsLineTransition) {
    lyricsLineTransition.reset();
    return;
  }
  setLyricsLines("", "");
}

function stopLyricsRaf() {
  if (lyricsRafId != null) {
    cancelAnimationFrame(lyricsRafId);
    lyricsRafId = null;
  }
}

function lyricsRafTick() {
  lyricsRafId = null;
  if (!shouldTickLyrics()) return;
  const elapsed = getLiveElapsedSec();
  const duration = nowPlayingProgressSync?.durationSec ?? null;
  const playing = nowPlayingProgressSync?.isPlaying !== false;
  if (useMineradioRenderer && isMineradioLyricsMounted()) {
    tickMineradioLyrics(elapsed, duration, playing);
  } else if (useAmScrollRenderer && isAmLyricsMounted()) {
    syncAmLyricsTime(elapsed);
  } else {
    renderNowPlayingLyrics(false);
  }
  lyricsRafId = requestAnimationFrame(lyricsRafTick);
}

function startLyricsRaf() {
  if (lyricsRafId != null) return;
  lyricsRafId = requestAnimationFrame(lyricsRafTick);
}

function stopLyricsTick() {
  stopLyricsRaf();
}

function shouldTickLyrics() {
  if (useMineradioRenderer && isMineradioLyricsMounted()) {
    return (
      lyricsDisplayState.status !== "idle" &&
      nowPlayingProgressSync?.isPlaying !== false
    );
  }
  return (
    lyricsDisplayState.status === "hit" &&
    !lyricsDisplayState.instrumental &&
    (lyricsDisplayState.lines.length > 0 || Boolean(lyricsDisplayState.plainLyrics)) &&
    nowPlayingProgressSync?.isPlaying !== false
  );
}

/**
 * @param {boolean} [force]
 */
function renderNowPlayingLyrics(force = true) {
  if (!nowPlayingLyrics) return;
  const elapsed = getLiveElapsedSec();
  const duration = nowPlayingProgressSync?.durationSec ?? null;
  const playing = nowPlayingProgressSync?.isPlaying !== false;
  if (useMineradioRenderer && isMineradioLyricsMounted()) {
    renderMineradioLyricsPanel(
      lyricsDisplayState,
      elapsed,
      duration,
      { title: nowPlayingTrackTitle, artist: nowPlayingTrackArtist },
      playing,
      force,
    );
    return;
  }
  if (useAmScrollRenderer && isAmLyricsMounted()) {
    renderAmLyricsPanel(
      lyricsDisplayState,
      elapsed,
      duration,
      { title: nowPlayingTrackTitle, artist: nowPlayingTrackArtist },
    );
    return;
  }
  const { status, instrumental } = lyricsDisplayState;
  if (status === "idle") {
    stopLyricsTick();
    if (lyricsOnlyMode) {
      nowPlayingLyrics.hidden = false;
      nowPlayingLyrics.classList.add("is-visible", "is-idle");
      nowPlayingLyrics.classList.remove("is-loading");
      setLyricsLines("未检测到正在播放", "", { instant: true });
      lastRenderedLyrics = { current: "未检测到正在播放", next: "", lineIndex: -1 };
      return;
    }
    nowPlayingLyrics.hidden = true;
    nowPlayingLyrics.classList.remove("is-visible", "is-loading");
    clearLyricsLines();
    return;
  }
  if (status === "miss") {
    stopLyricsTick();
    if (lyricsOnlyMode) {
      nowPlayingLyrics.hidden = false;
      nowPlayingLyrics.classList.add("is-visible");
      nowPlayingLyrics.classList.remove("is-idle", "is-loading");
      const { current, next } = getTrackMetaLyricLines();
      if (current !== lastRenderedLyrics.current || next !== lastRenderedLyrics.next) {
        lastRenderedLyrics = { current, next, lineIndex: -1 };
        setLyricsLines(current, next, { instant: true });
      }
      return;
    }
    nowPlayingLyrics.hidden = true;
    nowPlayingLyrics.classList.remove("is-visible", "is-loading");
    clearLyricsLines();
    return;
  }
  nowPlayingLyrics.hidden = false;
  if (status === "loading") {
    stopLyricsTick();
    nowPlayingLyrics.classList.add("is-visible");
    nowPlayingLyrics.classList.remove("is-idle", "is-loading");
    const { current, next } = getTrackMetaLyricLines();
    if (current !== lastRenderedLyrics.current || next !== lastRenderedLyrics.next) {
      lastRenderedLyrics = { current, next, lineIndex: -1 };
      setLyricsLines(current, next, { instant: true });
    }
    return;
  }
  if (instrumental) {
    stopLyricsTick();
    nowPlayingLyrics.classList.add("is-visible");
    nowPlayingLyrics.classList.remove("is-loading");
    setLyricsLines("纯音乐", "", { instant: true });
    lastRenderedLyrics = { current: "纯音乐", next: "", lineIndex: -1 };
    return;
  }
  const { current, next, lineIndex } = pickLyricPairAtTime(getLiveElapsedSec());
  if (!current && !next) {
    clearLyricsLines();
    nowPlayingLyrics.hidden = true;
    nowPlayingLyrics.classList.remove("is-visible");
    return;
  }
  nowPlayingLyrics.hidden = false;
  nowPlayingLyrics.classList.add("is-visible");
  nowPlayingLyrics.classList.remove("is-loading");
  const lineChanged = lineIndex !== lastRenderedLyrics.lineIndex;
  const nextChanged = next !== lastRenderedLyrics.next;
  if (force || lineChanged || nextChanged) {
    lastRenderedLyrics = { current, next, lineIndex };
    setLyricsLines(current, next);
  }
  if (lyricsDisplayState.lyricsSource) {
    nowPlayingLyrics.title = `歌词来源：${lyricsDisplayState.lyricsSource}`;
  } else {
    nowPlayingLyrics.removeAttribute("title");
  }
}

function applyLyricsUpdate(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  lyricsDisplayState = {
    trackKey: typeof p.trackKey === "string" ? p.trackKey : "",
    status: typeof p.status === "string" ? p.status : "idle",
    lines: Array.isArray(p.lines)
      ? p.lines
          .map((line) => ({
            timeMs: typeof line?.timeMs === "number" ? line.timeMs : 0,
            text: typeof line?.text === "string" ? line.text : "",
          }))
          .filter((line) => line.text)
      : [],
    plainLyrics: typeof p.plainLyrics === "string" ? p.plainLyrics : "",
    instrumental: Boolean(p.instrumental),
    lyricsSource: typeof p.lyricsSource === "string" ? p.lyricsSource : "",
  };
  renderNowPlayingLyrics();
  if (shouldTickLyrics()) startLyricsRaf();
  else stopLyricsTick();
}

function softSyncPlaybackClock(p) {
  if (!p || !nowPlayingProgressSync) return;
  const elapsedSec =
    typeof p.elapsedTime === "number" && Number.isFinite(p.elapsedTime) ? p.elapsedTime : null;
  if (elapsedSec == null) return;
  const local = getLiveElapsedSec();
  if (Math.abs(local - elapsedSec) >= 1.5) {
    nowPlayingProgressSync.elapsedSec = elapsedSec;
    nowPlayingProgressSync.syncedAt = performance.now();
  }
  if (typeof p.duration === "number" && Number.isFinite(p.duration) && p.duration > 0) {
    nowPlayingProgressSync.durationSec = p.duration;
  }
  if (p.isPlaying === false) {
    nowPlayingProgressSync.isPlaying = false;
    stopLyricsTick();
    if (useAmScrollRenderer && isAmLyricsMounted()) syncAmLyricsTime(getLiveElapsedSec());
  } else if (p.isPlaying === true) {
    nowPlayingProgressSync.isPlaying = true;
    if (shouldTickLyrics()) startLyricsRaf();
  }
}

function syncNowPlayingProgressFromPayload(p) {
  const active = Boolean(p?.active);
  if (!active) {
    nowPlayingProgressSync = null;
    stopLyricsTick();
    return;
  }
  const elapsedSec =
    typeof p.elapsedTime === "number" && Number.isFinite(p.elapsedTime) ? p.elapsedTime : 0;
  const durationSec =
    typeof p.duration === "number" && Number.isFinite(p.duration) && p.duration > 0
      ? p.duration
      : null;
  const bundleName =
    typeof p.bundleName === "string" && p.bundleName.trim()
      ? p.bundleName.trim()
      : typeof p.bundleId === "string"
        ? p.bundleId
        : "";
  const playingLabel =
    p.isPlaying === false ? "已暂停" : p.isPlaying === true ? "播放中" : "";
  const isPlaying = p.isPlaying !== false;

  if (nowPlayingProgressSync && nowPlayingProgressSync.isPlaying && isPlaying) {
    const localElapsed = getLiveElapsedSec();
    if (Math.abs(localElapsed - elapsedSec) < 1.2) {
      nowPlayingProgressSync.bundleName = bundleName;
      nowPlayingProgressSync.playingLabel = playingLabel;
      nowPlayingProgressSync.durationSec = durationSec;
      nowPlayingProgressSync.isPlaying = true;
      return;
    }
  }

  nowPlayingProgressSync = {
    bundleName,
    playingLabel,
    elapsedSec,
    durationSec,
    syncedAt: performance.now(),
    isPlaying,
  };
  if (isPlaying) startLyricsRaf();
  else stopLyricsTick();
}

function applyNowPlaying(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const active = Boolean(p.active);

  if (!active) {
    nowPlayingTrackTitle = "";
    nowPlayingTrackArtist = "";
    if (nowPlayingPanel) {
      nowPlayingPanel.hidden = false;
      nowPlayingPanel.classList.add("is-idle");
      if (nowPlayingTitle) nowPlayingTitle.textContent = "未检测到正在播放";
      if (nowPlayingArtist) nowPlayingArtist.textContent = "";
      if (nowPlayingAlbum) nowPlayingAlbum.textContent = "";
      if (nowPlayingSource) nowPlayingSource.textContent = "";
      if (nowPlayingArt) nowPlayingArt.removeAttribute("src");
      nowPlayingPanel.classList.remove("has-artwork");
    }
    nowPlayingProgressSync = null;
    stopLyricsTick();
    lyricsDisplayState = {
      trackKey: "",
      status: "idle",
      lines: [],
      plainLyrics: "",
      instrumental: false,
      lyricsSource: "",
    };
    renderNowPlayingLyrics();
    return;
  }

  const title = typeof p.title === "string" && p.title.trim() ? p.title.trim() : "未知曲目";
  const artist = typeof p.artist === "string" ? p.artist.trim() : "";
  nowPlayingTrackTitle = title;
  nowPlayingTrackArtist = artist;

  if (nowPlayingPanel) {
    nowPlayingPanel.hidden = false;
    nowPlayingPanel.classList.remove("is-idle");
    const album = typeof p.album === "string" ? p.album.trim() : "";
    if (nowPlayingTitle) nowPlayingTitle.textContent = title;
    if (nowPlayingArtist) nowPlayingArtist.textContent = artist;
    if (nowPlayingAlbum) nowPlayingAlbum.textContent = album;

    if (nowPlayingArt) {
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
        nowPlayingArt.src = art;
        nowPlayingPanel.classList.add("has-artwork");
      } else {
        nowPlayingArt.removeAttribute("src");
        nowPlayingPanel.classList.remove("has-artwork");
      }
    }
  }

  syncNowPlayingProgressFromPayload(p);
  if (nowPlayingSource) renderNowPlayingSourceLine();
  if (lyricsDisplayState.status === "loading" || lyricsDisplayState.status === "miss") {
    renderNowPlayingLyrics();
  }
}

/**
 * 按歌词窗配置切换经典双行 / am-lyrics 滚动，并应用样式。
 * @param {import("./lyricsSettingsSchema.js").LyricsWindowConfig} cfg
 */
export function applyLyricsRendererFromConfig(cfg) {
  if (!lyricsOnlyMode || !nowPlayingLyrics) return;
  const c = normalizeLyricsWindowConfig(cfg);
  const wantAm = isAmScrollRenderer(c);
  const wantMineradio = isMineradioRenderer(c);
  const modeChanged =
    wantAm !== useAmScrollRenderer ||
    wantMineradio !== useMineradioRenderer ||
    (wantAm && !isAmLyricsMounted()) ||
    (wantMineradio && !isMineradioLyricsMounted()) ||
    (!wantAm && isAmLyricsMounted()) ||
    (!wantMineradio && isMineradioLyricsMounted()) ||
    (!wantAm && !wantMineradio && !lyricsLineTransition);

  if (wantMineradio && !isMineradioLyricsMounted()) {
    unmountAmLyricsPanel();
    mountMineradioLyricsPanel(nowPlayingLyrics);
    lyricsLineTransition = null;
  } else if (wantAm && !isAmLyricsMounted()) {
    unmountMineradioLyricsPanel();
    resetAmLyricsBinding();
    mountAmLyricsPanel(nowPlayingLyrics);
    lyricsLineTransition = null;
  } else if (!wantAm && !wantMineradio) {
    if (isAmLyricsMounted()) unmountAmLyricsPanel();
    const hadMineradio = isMineradioLyricsMounted();
    if (hadMineradio) unmountMineradioLyricsPanel();
    if (hadMineradio || !nowPlayingLyrics.querySelector(".now-playing-lyrics-current-stage")) {
      const { nextEl } = buildClassicLyricsDom(nowPlayingLyrics);
      nowPlayingLyricNext = nextEl;
      lyricsLineTransition = createLyricsLineTransition(nowPlayingLyrics, nowPlayingLyricNext);
    } else if (!lyricsLineTransition) {
      nowPlayingLyricNext = nowPlayingLyrics.querySelector("#nowPlayingLyricNext");
      lyricsLineTransition = createLyricsLineTransition(nowPlayingLyrics, nowPlayingLyricNext);
    }
  } else if (wantAm && modeChanged) {
    unmountMineradioLyricsPanel();
    resetAmLyricsBinding();
  } else if (wantMineradio && modeChanged) {
    unmountAmLyricsPanel();
  }

  useAmScrollRenderer = wantAm;
  useMineradioRenderer = wantMineradio;
  nowPlayingLyrics.dataset.lyricsRenderer = c.renderer;
  applyLyricsWindowStyle(nowPlayingLyrics, c);
  if (wantMineradio) {
    applyMineradioLyricsStyle(c);
    renderNowPlayingLyrics(true);
  } else if (wantAm) {
    applyAmLyricsStyle(c);
    if (modeChanged) {
      refreshAmLyricsPanel(
        lyricsDisplayState,
        getLiveElapsedSec(),
        nowPlayingProgressSync?.durationSec ?? null,
        { title: nowPlayingTrackTitle, artist: nowPlayingTrackArtist },
      );
    } else {
      renderNowPlayingLyrics(true);
    }
  } else {
    renderNowPlayingLyrics(true);
  }
  if (shouldTickLyrics()) startLyricsRaf();
  else stopLyricsTick();

  if (wantAm && modeChanged) {
    invoke("sync_lyrics_for_now_playing").catch(() => {});
  }
}

/**
 * 订阅系统正在播放与歌词事件（频谱窗 / 独立歌词窗共用）。
 * @param {{ syncOnStart?: boolean, lyricsOnly?: boolean }} [options]
 */
export async function initNowPlayingLyrics(options = {}) {
  const { syncOnStart = true, lyricsOnly = false } = options;
  lyricsOnlyMode = lyricsOnly;

  nowPlayingPanel = document.querySelector("#nowPlayingPanel");
  nowPlayingArt = document.querySelector("#nowPlayingArt");
  nowPlayingTitle = document.querySelector("#nowPlayingTitle");
  nowPlayingArtist = document.querySelector("#nowPlayingArtist");
  nowPlayingAlbum = document.querySelector("#nowPlayingAlbum");
  nowPlayingSource = document.querySelector("#nowPlayingSource");
  nowPlayingLyrics = document.querySelector("#nowPlayingLyrics");
  nowPlayingLyricCurrent = document.querySelector("#nowPlayingLyricCurrent");
  nowPlayingLyricNext = document.querySelector("#nowPlayingLyricNext");
  if (
    !lyricsOnlyMode &&
    nowPlayingLyrics?.querySelector(".now-playing-lyrics-current-stage")
  ) {
    lyricsLineTransition = createLyricsLineTransition(nowPlayingLyrics, nowPlayingLyricNext);
  }

  await listen("now-playing-update", (event) => {
    applyNowPlaying(event.payload);
  });
  await listen("now-playing-progress", (event) => {
    softSyncPlaybackClock(event.payload);
  });
  await listen("lyrics-update", (event) => {
    applyLyricsUpdate(event.payload);
  });

  if (lyricsOnlyMode) {
    await listen("waveform-frame", (event) => {
      if (!useMineradioRenderer || !isMineradioLyricsMounted()) return;
      const p = event.payload;
      if (!p || typeof p !== "object") return;
      feedMineradioWaveformFrame(p);
    });
  }

  if (!lyricsOnlyMode && nowPlayingSource) {
    setInterval(renderNowPlayingSourceLine, 1000);
  }

  if (!syncOnStart) return;

  try {
    const snap = await invoke("get_now_playing_snapshot");
    applyNowPlaying(snap);
  } catch (err) {
    console.warn("get_now_playing_snapshot failed:", err);
  }
  try {
    await invoke("sync_lyrics_for_now_playing");
  } catch {
    // 非 macOS 或未启用 now playing 时忽略
  }
}
