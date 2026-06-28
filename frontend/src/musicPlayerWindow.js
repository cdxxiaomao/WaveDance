import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { initWindowEdgeHint } from "./windowEdgeHint.js";
import {
  applyPlayerWindowStyle,
  readPlayerWindowConfig,
} from "./playerSettingsSchema.js";

const playerError = document.querySelector("#playerError");
const playerCurrentTime = document.querySelector("#playerCurrentTime");
const playerDuration = document.querySelector("#playerDuration");
const playerProgress = document.querySelector("#playerProgress");
const playerProgressBuffer = document.querySelector("#playerProgressBuffer");
const playerProgressFill = document.querySelector("#playerProgressFill");
const playerLoopBtn = document.querySelector("#playerLoopBtn");
const playerLoopIcon = document.querySelector("#playerLoopIcon");
const playerPrevBtn = document.querySelector("#playerPrevBtn");
const playerPlayBtn = document.querySelector("#playerPlayBtn");
const playerPlayIcon = document.querySelector("#playerPlayIcon");
const playerNextBtn = document.querySelector("#playerNextBtn");
const playerQuality = document.querySelector("#playerQuality");
const openPlayerSettingsBtn = document.querySelector("#openPlayerSettingsBtn");
const playerApp = document.querySelector(".app.player-only");
const playerAudio = document.querySelector("#playerAudio");

const LOOP_LABELS = { none: "不循环", one: "单曲循环", all: "列表循环" };
const LOOP_CYCLE = ["none", "all", "one"];
const LOOP_SVG = {
  all: `<path d="M17 2l3 3-3 3"/><path d="M20 5H9a4 4 0 0 0-4 4v1"/><path d="M7 22l-3-3 3-3"/><path d="M4 19h11a4 4 0 0 0 4-4v-1"/>`,
  one: `<path d="M17 2l3 3-3 3"/><path d="M20 5H9a4 4 0 0 0-4 4v1"/><path d="M7 22l-3-3 3-3"/><path d="M4 19h11a4 4 0 0 0 4-4v-1"/><text x="12" y="14" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-weight="600" font-family="system-ui,-apple-system,sans-serif">1</text>`,
  none: `<path d="M17 2l3 3-3 3"/><path d="M20 5H9a4 4 0 0 0-4 4v1"/><path d="M7 22l-3-3 3-3"/><path d="M4 19h11a4 4 0 0 0 4-4v-1"/><path d="M5 19L19 5"/>`,
};
/** 播放失败时按序降级（无损 FLAC → MP3） */
const QUALITY_FALLBACK = ["hires", "lossless", "exhigh", "standard", "aac"];
const QUALITY_LABELS = {
  hires: "Hi-Res",
  lossless: "无损",
  exhigh: "极高 320k",
  standard: "标准 128k",
  aac: "AAC",
};
const PLAY_ICON_PATH =
  "M8 5.14v13.72c0 .79.87 1.27 1.54.84l9.14-6.86a1 1 0 0 0 0-1.68l-9.14-6.86A1 1 0 0 0 8 5.14z";
const PAUSE_ICON_PATH = "M7 5h3v14H7V5zm7 0h3v14h-3V5z";
const DEFAULT_QUALITY = "lossless";

let progressTimer = null;
let analyzerRaf = null;
let seeking = false;
let loadToken = 0;
/** @type {AudioContext | null} */
let audioContext = null;
/** @type {AnalyserNode | null} */
let analyser = null;
let analyzerWired = false;

/** @type {Record<string, unknown>} */
let lastSnapshot = {};

function formatTime(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function currentTrack(snapshot) {
  const idx = snapshot.currentIndex;
  if (typeof idx !== "number" || !Array.isArray(snapshot.queue)) return null;
  return snapshot.queue[idx] ?? null;
}

function trackKey(track, index) {
  if (!track || typeof track !== "object") return String(index);
  const provider = track.provider ?? "";
  const id = track.id ?? index;
  const pk = track.playlistKey ?? "";
  return `${provider}:${id}:${pk}:${index}`;
}

/** @type {Record<string, unknown> | null} */
let lastDisplayedTrack = null;

function resolvePlaybackTrack(snapshot) {
  const track = currentTrack(snapshot);
  if (track) {
    lastDisplayedTrack = track;
    return track;
  }
  if (lastDisplayedTrack && playerAudio && (!playerAudio.paused || playerAudio.currentTime > 0)) {
    return lastDisplayedTrack;
  }
  if (lastDisplayedTrack && snapshot?.playing) {
    return lastDisplayedTrack;
  }
  return null;
}

function getBufferedEndMs(audio) {
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return 0;
  const { buffered } = audio;
  if (!buffered || buffered.length === 0) return 0;
  let endMs = 0;
  for (let i = 0; i < buffered.length; i++) {
    endMs = Math.max(endMs, Math.floor(buffered.end(i) * 1000));
  }
  return endMs;
}

function updateProgressVisual(positionMs, durationMs) {
  const playedPct = durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;
  const bufferEndMs = playerAudio ? getBufferedEndMs(playerAudio) : 0;
  const bufferPct = durationMs > 0 ? Math.min(100, Math.max(0, (bufferEndMs / durationMs) * 100)) : 0;
  if (playerProgressFill) {
    playerProgressFill.style.width = `${playedPct}%`;
  }
  if (playerProgressBuffer) {
    playerProgressBuffer.style.width = `${bufferPct}%`;
  }
}

function applyLoopUi(mode) {
  if (!playerLoopBtn) return;
  const label = LOOP_LABELS[mode] ?? LOOP_LABELS.all;
  playerLoopBtn.title = `循环模式：${label}`;
  playerLoopBtn.setAttribute("aria-label", label);
  playerLoopBtn.classList.toggle("is-active", mode !== "none");
  if (playerLoopIcon) {
    playerLoopIcon.innerHTML = LOOP_SVG[mode] ?? LOOP_SVG.all;
  }
}

function applyPlayerStylePayload(payload) {
  const config = readPlayerWindowConfig(window.localStorage);
  if (payload && typeof payload === "object") {
    if (typeof payload.color === "string") config.bgColor = payload.color;
    if (Number.isFinite(payload.alpha)) config.bgAlphaPercent = Math.round(payload.alpha * 100);
    if (typeof payload.blurEnabled === "boolean") config.blurEnabled = payload.blurEnabled;
  }
  applyPlayerWindowStyle(playerApp, config);
}

async function syncPlayerBlurFromConfig(config) {
  try {
    await invoke("set_overlay_blur_enabled", {
      label: "music-player",
      enabled: Boolean(config.blurEnabled),
    });
  } catch (err) {
    console.warn("set_overlay_blur_enabled failed:", err);
  }
}

async function loadPlayerWindowAppearance() {
  const config = readPlayerWindowConfig(window.localStorage);
  applyPlayerWindowStyle(playerApp, config);
  await syncPlayerBlurFromConfig(config);
}

function applyPlayUi(playing, loading) {
  if (playerPlayBtn) {
    playerPlayBtn.setAttribute("aria-label", playing ? "暂停" : "播放");
    playerPlayBtn.title = playing ? "暂停" : "播放";
    playerPlayBtn.classList.toggle("is-playing", playing);
    playerPlayBtn.disabled = Boolean(loading);
  }
  if (playerPlayIcon) {
    const path = playerPlayIcon.querySelector("path");
    if (path) {
      path.setAttribute("d", playing ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
    }
  }
}

function applySnapshot(snapshot) {
  lastSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
  const playing = Boolean(lastSnapshot.playing) || Boolean(playerAudio && !playerAudio.paused);
  const loading = Boolean(lastSnapshot.loading);
  const positionMs =
    Number(lastSnapshot.positionMs) ||
    (playerAudio ? Math.floor(playerAudio.currentTime * 1000) : 0);
  const durationMs =
    Number(lastSnapshot.durationMs) ||
    (playerAudio && Number.isFinite(playerAudio.duration) ? Math.floor(playerAudio.duration * 1000) : 0);

  applyPlayUi(playing, loading);
  applyLoopUi(String(lastSnapshot.loopMode ?? "all"));

  if (playerQuality && typeof lastSnapshot.quality === "string") {
    playerQuality.value = lastSnapshot.quality;
  }

  if (playerError) {
    const err = lastSnapshot.error;
    if (err) {
      playerError.hidden = false;
      playerError.textContent = String(err);
    } else {
      playerError.hidden = true;
      playerError.textContent = "";
    }
  }

  if (!seeking) {
    if (playerCurrentTime) playerCurrentTime.textContent = formatTime(positionMs);
    if (playerDuration) playerDuration.textContent = formatTime(durationMs);
    if (playerProgress) {
      if (durationMs > 0) {
        playerProgress.value = String(Math.round((positionMs / durationMs) * 1000));
      }
      updateProgressVisual(positionMs, durationMs);
    }
  }
}

function isSourceFormatError(err) {
  const message = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  return (
    name === "NotSupportedError" ||
    message.includes("不支持") ||
    message.includes("音源无效") ||
    message.includes("非音频")
  );
}

function nextFallbackQuality(current) {
  const idx = QUALITY_FALLBACK.indexOf(current);
  if (idx < 0 || idx >= QUALITY_FALLBACK.length - 1) return null;
  return QUALITY_FALLBACK[idx + 1];
}

function formatPlayError(err) {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  const message = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
  if (name === "NotSupportedError") {
    return "当前音源无法播放，已尝试自动降级；请手动切换为 320k/128k";
  }
  return message || "播放失败";
}

function waitForCanPlay(audio, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    let timer = null;
    const cleanup = () => {
      if (timer != null) window.clearTimeout(timer);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
    };
    const onCanPlay = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      const code = audio.error?.code;
      const detail =
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "浏览器不支持该音频格式或音源无效"
          : "音频资源加载失败";
      reject(new Error(detail));
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("音频加载超时"));
    }, timeoutMs);
    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}

async function ensureAudioGraph() {
  if (!playerAudio || analyzerWired) return;
  try {
    audioContext = new AudioContext();
    const mediaSource = audioContext.createMediaElementSource(playerAudio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaSource.connect(analyser);
    analyser.connect(audioContext.destination);
    analyzerWired = true;
  } catch (err) {
    console.warn("Web Audio 初始化失败，播放仍可用但内部采集可能无效:", err);
  }
}

async function analyzerLoop() {
  if (!analyser || !playerAudio || !audioContext) {
    analyzerRaf = window.requestAnimationFrame(analyzerLoop);
    return;
  }
  const captureMode = await invoke("get_capture_source_mode").catch(() => "internal_player");
  const streamRunning = await invoke("get_waveform_stream_running").catch(() => false);
  if (captureMode === "internal_player" && streamRunning && !playerAudio.paused) {
    const timeData = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeData);
    invoke("submit_player_waveform_frame", {
      input: {
        samples: Array.from(timeData),
        sampleRate: Math.floor(audioContext.sampleRate),
      },
    }).catch(() => {});
  }
  analyzerRaf = window.requestAnimationFrame(analyzerLoop);
}

function startAnalyzer() {
  if (analyzerRaf != null) return;
  analyzerRaf = window.requestAnimationFrame(analyzerLoop);
}

function stopAnalyzer() {
  if (analyzerRaf != null) {
    window.cancelAnimationFrame(analyzerRaf);
    analyzerRaf = null;
  }
}

function stopProgressTimer() {
  if (progressTimer != null) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = window.setInterval(() => {
    if (!playerAudio || seeking) return;
    const positionMs = Math.floor(playerAudio.currentTime * 1000);
    const durationMs = Math.floor((playerAudio.duration || 0) * 1000);
    invoke("music_player_report_progress", {
      positionMs,
      durationMs: durationMs > 0 ? durationMs : null,
    }).catch(() => {});
  }, 500);
}

async function attemptPlayAtQuality(snapshot, track, quality, token) {
  const urlResp = await invoke("music_song_url", {
    provider: String(track.provider ?? "qq"),
    id: String(track.id ?? ""),
    mediaMid: track.mediaMid ?? track.media_mid ?? null,
    quality,
  });

  if (token !== loadToken) return null;

  const cdnUrl = urlResp && typeof urlResp === "object" ? String(urlResp.url ?? "") : "";
  if (!cdnUrl) throw new Error("无法获取音源 URL");

  const mimeType =
    urlResp && typeof urlResp === "object" && urlResp.mimeType
      ? String(urlResp.mimeType)
      : null;

  const playbackUrl = await invoke("music_audio_playback_url", {
    provider: String(track.provider ?? "qq"),
    cdnUrl,
    mimeType,
  });

  if (token !== loadToken) return null;

  playerAudio.crossOrigin = "anonymous";
  playerAudio.src = String(playbackUrl);
  playerAudio.load();

  const seekMs = Number(snapshot.positionMs) || 0;
  if (seekMs > 0) {
    playerAudio.currentTime = seekMs / 1000;
  }

  await waitForCanPlay(playerAudio);

  if (token !== loadToken) return null;

  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }

  if (snapshot.playing) {
    await playerAudio.play();
    startProgressTimer();
    startAnalyzer();
  }

  return { urlResp, quality };
}

async function loadAndPlay(snapshot) {
  const track = resolvePlaybackTrack(snapshot) ?? currentTrack(snapshot);
  if (!track || !playerAudio) return;

  const token = ++loadToken;
  await invoke("music_player_set_loading", { loading: true });

  try {
    await ensureAudioGraph();

    let quality = String(snapshot.quality ?? DEFAULT_QUALITY);
    let lastErr = null;
    let played = null;

    for (let attempt = 0; attempt < QUALITY_FALLBACK.length; attempt += 1) {
      try {
        played = await attemptPlayAtQuality(snapshot, track, quality, token);
        if (!played) return;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!isSourceFormatError(err)) break;
        const next = nextFallbackQuality(quality);
        if (!next) break;
        quality = next;
        playerAudio.removeAttribute("src");
        playerAudio.load();
      }
    }

    if (lastErr) throw lastErr;
    if (!played) return;

    if (quality !== String(snapshot.quality ?? DEFAULT_QUALITY)) {
      await invoke("music_player_set_quality", { quality });
      const label = QUALITY_LABELS[quality] ?? quality;
      if (playerError) {
        playerError.hidden = false;
        playerError.textContent = `已自动切换为 ${label}（原无损格式无法播放）`;
      }
    } else if (playerError) {
      playerError.hidden = true;
      playerError.textContent = "";
    }

    await invoke("music_player_set_loading", { loading: false });
    if (played.urlResp?.trial) {
      console.warn("当前为试听片段");
    } else if (quality === String(snapshot.quality ?? DEFAULT_QUALITY)) {
      await invoke("music_player_set_error", { error: null });
    }
  } catch (err) {
    if (token !== loadToken) return;
    await invoke("music_player_set_loading", { loading: false });
    await invoke("music_player_set_error", { error: formatPlayError(err) });
  }
}

async function onStateUpdate(snapshot) {
  const prev = lastSnapshot;
  applySnapshot(snapshot);

  const prevTrack = currentTrack(prev);
  const nextTrack = currentTrack(snapshot);
  const prevKey = prevTrack ? trackKey(prevTrack, prev.currentIndex) : "";
  const nextKey = nextTrack ? trackKey(nextTrack, snapshot.currentIndex) : "";
  const qualityChanged = prev.quality !== snapshot.quality;
  const needReload = nextKey !== prevKey || qualityChanged;

  if (!nextTrack) {
    lastDisplayedTrack = null;
    playerAudio?.pause();
    stopProgressTimer();
    stopAnalyzer();
    return;
  }

  if (needReload) {
    await loadAndPlay(snapshot);
    return;
  }

  if (snapshot.playing && playerAudio?.paused) {
    try {
      await ensureAudioGraph();
      if (playerAudio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        await waitForCanPlay(playerAudio);
      }
      if (audioContext?.state === "suspended") await audioContext.resume();
      await playerAudio.play();
      startProgressTimer();
      startAnalyzer();
    } catch (err) {
      await invoke("music_player_set_error", { error: formatPlayError(err) });
    }
  } else if (!snapshot.playing && playerAudio && !playerAudio.paused) {
    playerAudio.pause();
    stopProgressTimer();
    stopAnalyzer();
  }

  const seekMs = Number(snapshot.positionMs) || 0;
  if (!seeking && playerAudio && Math.abs(playerAudio.currentTime * 1000 - seekMs) > 1500) {
    playerAudio.currentTime = seekMs / 1000;
  }
}

async function init() {
  document.body.classList.add("player-dedicated", "overlay-edge-hint-window");

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
  await loadPlayerWindowAppearance();

  await listen("player-window-style", async (event) => {
    applyPlayerStylePayload(event.payload);
    const config = readPlayerWindowConfig(window.localStorage);
    if (event.payload && typeof event.payload === "object" && typeof event.payload.blurEnabled === "boolean") {
      config.blurEnabled = event.payload.blurEnabled;
    }
    await syncPlayerBlurFromConfig(config);
  });

  await listen("music-player-state-update", (event) => {
    onStateUpdate(event.payload).catch(console.error);
  });

  try {
    const snap = await invoke("music_player_get_state");
    await onStateUpdate(snap);
  } catch (err) {
    console.warn("music_player_get_state failed:", err);
  }

  playerPlayBtn?.addEventListener("click", () => {
    invoke("music_player_toggle").catch(console.error);
  });
  playerPrevBtn?.addEventListener("click", () => {
    invoke("music_player_prev").catch(console.error);
  });
  playerNextBtn?.addEventListener("click", () => {
    invoke("music_player_next").catch(console.error);
  });

  playerLoopBtn?.addEventListener("click", () => {
    const cur = String(lastSnapshot.loopMode ?? "all");
    const idx = LOOP_CYCLE.indexOf(cur);
    const next = LOOP_CYCLE[(idx + 1) % LOOP_CYCLE.length];
    invoke("music_player_set_loop_mode", { mode: next }).catch(console.error);
  });

  playerQuality?.addEventListener("change", () => {
    invoke("music_player_set_quality", { quality: playerQuality.value }).catch(console.error);
  });

  openPlayerSettingsBtn?.addEventListener("click", () => {
    invoke("open_player_settings_window").catch(console.error);
  });

  playerProgress?.addEventListener("input", () => {
    seeking = true;
    const durationMs = Number(lastSnapshot.durationMs) || Math.floor((playerAudio?.duration || 0) * 1000);
    const ratio = Number(playerProgress.value) / 1000;
    const pos = Math.floor(durationMs * ratio);
    if (playerCurrentTime) playerCurrentTime.textContent = formatTime(pos);
    updateProgressVisual(pos, durationMs);
  });

  playerProgress?.addEventListener("change", async () => {
    const durationMs = Number(lastSnapshot.durationMs) || Math.floor((playerAudio?.duration || 0) * 1000);
    const ratio = Number(playerProgress.value) / 1000;
    const pos = Math.floor(durationMs * ratio);
    seeking = false;
    if (playerAudio) playerAudio.currentTime = pos / 1000;
    await invoke("music_player_seek", { positionMs: pos }).catch(console.error);
  });

  playerAudio?.addEventListener("ended", () => {
    invoke("music_player_next").catch(console.error);
  });

  playerAudio?.addEventListener("error", () => {
    invoke("music_player_set_error", { error: "音频加载或播放失败" }).catch(console.error);
  });

  const syncProgressFromAudio = () => {
    if (seeking || !playerAudio) return;
    const positionMs = Math.floor(playerAudio.currentTime * 1000);
    const durationMs = Math.floor((playerAudio.duration || 0) * 1000);
    if (playerCurrentTime) playerCurrentTime.textContent = formatTime(positionMs);
    if (playerDuration && durationMs > 0) playerDuration.textContent = formatTime(durationMs);
    if (playerProgress && durationMs > 0) {
      playerProgress.value = String(Math.round((positionMs / durationMs) * 1000));
    }
    updateProgressVisual(positionMs, durationMs);
  };

  playerAudio?.addEventListener("timeupdate", syncProgressFromAudio);
  playerAudio?.addEventListener("progress", syncProgressFromAudio);

  getCurrentWebviewWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    await getCurrentWebviewWindow().hide();
  });
}

init().catch((error) => {
  console.error("music player window init failed:", error);
});
