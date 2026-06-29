import { invoke } from "@tauri-apps/api/core";

/** 播放失败时按序降级（Hi-Res/无损 FLAC → MP3） */
const QUALITY_FALLBACK = ["hires", "lossless", "exhigh", "standard", "aac"];
const QUALITY_LABELS = {
  hires: "Hi-Res",
  lossless: "无损",
  exhigh: "极高 320k",
  standard: "标准 128k",
  aac: "AAC",
};
const DEFAULT_QUALITY = "exhigh";

/** QQ 在本会话内可尝试的最高音质（FLAC 失败后 cap 到 MP3，对齐 Mineradio） */
let qqPlaybackQualityCeiling = null;

function applyQqQualityCeiling(quality, provider) {
  if (provider !== "qq" || !qqPlaybackQualityCeiling) return quality;
  const reqIdx = QUALITY_FALLBACK.indexOf(quality);
  const ceilIdx = QUALITY_FALLBACK.indexOf(qqPlaybackQualityCeiling);
  if (reqIdx >= 0 && ceilIdx >= 0 && reqIdx < ceilIdx) {
    return qqPlaybackQualityCeiling;
  }
  return quality;
}

function recordQqQualityCeiling(failedQuality) {
  const next = nextFallbackQuality(failedQuality);
  if (!next) return;
  if (!qqPlaybackQualityCeiling) {
    qqPlaybackQualityCeiling = next;
    return;
  }
  const curIdx = QUALITY_FALLBACK.indexOf(qqPlaybackQualityCeiling);
  const nextIdx = QUALITY_FALLBACK.indexOf(next);
  if (curIdx >= 0 && nextIdx >= 0 && nextIdx > curIdx) {
    qqPlaybackQualityCeiling = next;
  }
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

function isSourceFormatError(err) {
  const message = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  return (
    name === "NotSupportedError" ||
    message.includes("不支持") ||
    message.includes("音源无效") ||
    message.includes("非音频") ||
    message.includes("preview_detected")
  );
}

function expectedTrackDurationMs(track, snapshot) {
  return Number(snapshot?.durationMs) || Number(track?.durationMs) || 0;
}

function isLikelyPreviewClip(audio, track, snapshot) {
  const audioMs = Math.floor((audio?.duration || 0) * 1000);
  const expectedMs = expectedTrackDurationMs(track, snapshot);
  if (audioMs <= 0 || expectedMs <= 0) return false;
  return expectedMs >= 120000 && audioMs <= 120000 && audioMs < expectedMs * 0.4;
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

/**
 * @param {HTMLAudioElement} playerAudio
 */
export function createMusicPlayerPlayback(playerAudio) {

  let progressTimer = null;
  let analyzerTimer = null;
  let captureCacheTimer = null;
  let cachedCaptureMode = "internal_player";
  let cachedStreamRunning = false;
  let loadToken = 0;
  let activeLoadToken = 0;
  let playbackActive = false;
  let stoodDown = true;
  let interruptRetryCount = 0;
  /** @type {Promise<void>} */
  let stateUpdateChain = Promise.resolve();
  /** @type {AudioContext | null} */
  let audioContext = null;
  /** @type {AnalyserNode | null} */
  let analyser = null;
  let analyzerWired = false;
  /** @type {Record<string, unknown>} */
  let lastSnapshot = {};
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

  function invalidatePlaybackSession() {
    playbackActive = false;
    activeLoadToken = 0;
    loadToken += 1;
  }

  function markPlaybackActive(token) {
    activeLoadToken = token;
    playbackActive = true;
    stoodDown = false;
    interruptRetryCount = 0;
  }

  function shouldAdvanceOnEnded() {
    if (!playbackActive || !playerAudio || activeLoadToken !== loadToken) {
      return false;
    }

    const positionMs = Math.floor(playerAudio.currentTime * 1000);
    const audioDurationMs =
      Number.isFinite(playerAudio.duration) && playerAudio.duration > 0
        ? Math.floor(playerAudio.duration * 1000)
        : 0;
    const expectedMs = expectedTrackDurationMs(currentTrack(lastSnapshot), lastSnapshot);

    if (audioDurationMs > 0 && positionMs >= audioDurationMs - 2500) {
      if (expectedMs <= 0 || audioDurationMs >= expectedMs * 0.82) {
        return true;
      }
      return false;
    }

    if (expectedMs <= 0) return true;
    if (positionMs >= expectedMs - 5000) return true;
    if (positionMs >= expectedMs * 0.92) return true;
    return false;
  }

  function isLikelyPreviewInterrupt() {
    if (!playerAudio) return false;
    const track = currentTrack(lastSnapshot);
    return isLikelyPreviewClip(playerAudio, track, lastSnapshot);
  }

  async function retryAfterInterrupt() {
    const track = currentTrack(lastSnapshot);
    const provider = String(track?.provider ?? "");
    let currentQuality = String(lastSnapshot.quality ?? DEFAULT_QUALITY);
    if (provider === "qq") {
      currentQuality = applyQqQualityCeiling(currentQuality, provider);
    }

    if (provider === "qq" && (isLikelyPreviewInterrupt() || interruptRetryCount === 0)) {
      const next = nextFallbackQuality(currentQuality);
      if (next) {
        recordQqQualityCeiling(currentQuality);
        interruptRetryCount += 1;
        playbackActive = false;
        await invoke("music_player_set_error", { error: null });
        await invoke("music_player_set_quality", { quality: next });
        return true;
      }
    }

    if (interruptRetryCount < 3 && track) {
      interruptRetryCount += 1;
      playbackActive = false;
      await invoke("music_player_set_error", { error: null });
      await loadAndPlay({
        ...lastSnapshot,
        playing: true,
        positionMs: 0,
      });
      return true;
    }

    if (provider === "qq") {
      const next = nextFallbackQuality(currentQuality);
      if (next && interruptRetryCount < QUALITY_FALLBACK.length + 2) {
        recordQqQualityCeiling(currentQuality);
        interruptRetryCount += 1;
        playbackActive = false;
        await invoke("music_player_set_error", { error: null });
        await invoke("music_player_set_quality", { quality: next });
        return true;
      }
    }

    return false;
  }

  async function refreshCaptureCache() {
    cachedCaptureMode = await invoke("get_capture_source_mode").catch(() => "internal_player");
    cachedStreamRunning = await invoke("get_waveform_stream_running").catch(() => false);
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
      document.addEventListener("visibilitychange", () => {
        if (audioContext?.state === "suspended") {
          audioContext.resume().catch(() => {});
        }
      });
    } catch (err) {
      console.warn("Web Audio 初始化失败，播放仍可用但内部采集可能无效:", err);
    }
  }

  function keepCaptureAlive() {
    refreshCaptureCache().catch(() => {});
    if (audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    if (playbackActive && analyzerTimer == null) {
      startAnalyzer();
    }
  }

  function pushAnalyzerFrame() {
    if (!playbackActive || !analyser || !playerAudio || !audioContext) return;
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    if (cachedCaptureMode !== "internal_player" || !cachedStreamRunning || playerAudio.paused) {
      return;
    }
    const timeData = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeData);
    invoke("submit_player_waveform_frame", {
      input: {
        samples: Array.from(timeData),
        sampleRate: Math.floor(audioContext.sampleRate),
      },
    }).catch(() => {});
  }

  function startAnalyzer() {
    if (analyzerTimer != null) return;
    refreshCaptureCache().catch(() => {});
    captureCacheTimer = window.setInterval(() => {
      refreshCaptureCache().catch(() => {});
    }, 2000);
    // 用 setInterval 代替 rAF：隐藏窗/切桌面时 rAF 会被 WebKit 节流导致频谱断流
    analyzerTimer = window.setInterval(pushAnalyzerFrame, 33);
  }

  function stopAnalyzer() {
    if (captureCacheTimer != null) {
      window.clearInterval(captureCacheTimer);
      captureCacheTimer = null;
    }
    if (analyzerTimer != null) {
      window.clearInterval(analyzerTimer);
      analyzerTimer = null;
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
      if (!playerAudio || !playbackActive) return;
      const positionMs = Math.floor(playerAudio.currentTime * 1000);
      const durationMs = Math.floor((playerAudio.duration || 0) * 1000);
      invoke("music_player_report_progress", {
        positionMs,
        durationMs: durationMs > 0 ? durationMs : null,
      }).catch(() => {});
    }, 1000);
  }

  async function attemptPlayAtQuality(snapshot, track, quality, token) {
    const songType =
      typeof track.songType === "number"
        ? track.songType
        : typeof track.song_type === "number"
          ? track.song_type
          : null;

    const urlResp = await invoke("music_song_url", {
      provider: String(track.provider ?? "qq"),
      id: String(track.id ?? ""),
      mediaMid: track.mediaMid ?? track.media_mid ?? null,
      songType,
      quality,
    });

    if (token !== loadToken) return null;

    const cdnUrl = urlResp && typeof urlResp === "object" ? String(urlResp.url ?? "") : "";
    if (!cdnUrl) throw new Error("无法获取音源 URL");

    const mimeType =
      urlResp && typeof urlResp === "object" && urlResp.mimeType ? String(urlResp.mimeType) : null;

    const playbackUrl = await invoke("music_audio_playback_url", {
      provider: String(track.provider ?? "qq"),
      cdnUrl,
      mimeType,
    });

    if (token !== loadToken) return null;

    activeLoadToken = 0;
    playbackActive = false;
    playerAudio.crossOrigin = "anonymous";
    playerAudio.src = String(playbackUrl);
    playerAudio.load();

    const seekMs = Number(snapshot.positionMs) || 0;
    if (seekMs > 0) {
      playerAudio.currentTime = seekMs / 1000;
    }

    await waitForCanPlay(playerAudio);

    if (token !== loadToken) return null;

    if (isLikelyPreviewClip(playerAudio, track, snapshot)) {
      throw new Error("preview_detected");
    }

    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }

    if (snapshot.playing) {
      await playerAudio.play();
      markPlaybackActive(token);
      startProgressTimer();
      startAnalyzer();
    }

    return { urlResp, quality };
  }

  async function loadAndPlay(snapshot) {
    const track = resolvePlaybackTrack(snapshot) ?? currentTrack(snapshot);
    if (!track || !playerAudio) return;

    const token = ++loadToken;
    activeLoadToken = 0;
    playbackActive = false;
    stoodDown = false;
    await invoke("music_player_set_loading", { loading: true });

    try {
      await ensureAudioGraph();

      let quality = String(snapshot.quality ?? DEFAULT_QUALITY);
      const provider = String(track.provider ?? "");
      quality = applyQqQualityCeiling(quality, provider);
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
          if (provider === "qq") {
            recordQqQualityCeiling(quality);
          }
          if (!isSourceFormatError(err)) break;
          const next = nextFallbackQuality(quality);
          if (!next) break;
          quality = next;
          activeLoadToken = 0;
          playbackActive = false;
          playerAudio.removeAttribute("src");
          playerAudio.load();
        }
      }

      if (lastErr) throw lastErr;
      if (!played) return;

      if (quality !== String(snapshot.quality ?? DEFAULT_QUALITY)) {
        await invoke("music_player_set_quality", { quality });
        const label = QUALITY_LABELS[quality] ?? quality;
        console.warn(`已自动切换为 ${label}（原格式无法播放）`);
      }

      await invoke("music_player_set_loading", { loading: false });
      if (played.urlResp?.trial) {
        console.warn("当前为试听片段");
      } else {
        await invoke("music_player_set_error", { error: null });
      }
    } catch (err) {
      if (token !== loadToken) return;
      invalidatePlaybackSession();
      stoodDown = true;
      await invoke("music_player_set_loading", { loading: false });
      await invoke("music_player_set_error", { error: formatPlayError(err) });
    }
  }

  function standDownPlayback() {
    if (stoodDown && !playbackActive) {
      return;
    }
    stoodDown = true;
    invalidatePlaybackSession();
    playerAudio?.pause();
    if (playerAudio?.src) {
      playerAudio.removeAttribute("src");
      playerAudio.load();
    }
    stopProgressTimer();
    stopAnalyzer();
  }

  async function onStateUpdateInner(snapshot) {
    const prev = lastSnapshot;
    lastSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};

    const prevTrack = currentTrack(prev);
    const nextTrack = currentTrack(snapshot);
    const prevKey = prevTrack ? trackKey(prevTrack, prev.currentIndex) : "";
    const nextKey = nextTrack ? trackKey(nextTrack, snapshot.currentIndex) : "";
    const qualityChanged = prev.quality !== snapshot.quality;
    const needReload = nextKey !== prevKey || qualityChanged;

    if (!nextTrack) {
      lastDisplayedTrack = null;
      standDownPlayback();
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
        markPlaybackActive(loadToken);
        startProgressTimer();
        startAnalyzer();
      } catch (err) {
        await invoke("music_player_set_error", { error: formatPlayError(err) });
      }
    } else if (!snapshot.playing && playerAudio && !playerAudio.paused) {
      playbackActive = false;
      playerAudio.pause();
      stopProgressTimer();
      stopAnalyzer();
    }

    const prevPos = Number(prev.positionMs) || 0;
    const nextPos = Number(snapshot.positionMs) || 0;
    const userSeek = Math.abs(nextPos - prevPos) > 1500;
    if (userSeek && playerAudio && Math.abs(playerAudio.currentTime * 1000 - nextPos) > 800) {
      playerAudio.currentTime = nextPos / 1000;
    }
  }

  function bindAudioEvents() {
    const queueRetry = (fn) => {
      stateUpdateChain = stateUpdateChain.then(fn).catch(console.error);
    };

    playerAudio?.addEventListener("ended", () => {
      queueRetry(async () => {
        if (shouldAdvanceOnEnded()) {
          await invoke("music_player_next").catch(console.error);
          return;
        }
        const retried = await retryAfterInterrupt();
        if (retried) return;
        playbackActive = false;
        await invoke("music_player_set_error", { error: null }).catch(console.error);
        console.warn("当前曲目播放提前结束，已自动跳过");
        await invoke("music_player_next").catch(console.error);
      });
    });

    playerAudio?.addEventListener("error", () => {
      if (!playbackActive) return;
      queueRetry(async () => {
        const retried = await retryAfterInterrupt();
        if (retried) return;
        playbackActive = false;
        const track = currentTrack(lastSnapshot);
        const provider = String(track?.provider ?? "");
        if (provider === "qq") {
          await invoke("music_player_set_error", { error: null }).catch(console.error);
          console.warn("QQ 音源加载失败，已跳过当前曲目");
          await invoke("music_player_next").catch(console.error);
          return;
        }
        await invoke("music_player_set_error", { error: "音频加载或播放失败" }).catch(console.error);
      });
    });

    playerAudio?.addEventListener("stalled", () => {
      if (!playbackActive || !playerAudio || playerAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        return;
      }
      window.setTimeout(() => {
        if (!playbackActive || !playerAudio || !playerAudio.paused) return;
        if (playerAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
        queueRetry(() => retryAfterInterrupt());
      }, 4000);
    });
  }

  bindAudioEvents();

  function onStateUpdate(snapshot) {
    stateUpdateChain = stateUpdateChain
      .then(() => onStateUpdateInner(snapshot))
      .catch((err) => {
        console.error("music player state update failed:", err);
      });
    return stateUpdateChain;
  }

  return { onStateUpdate, keepCaptureAlive };
}
