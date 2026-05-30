import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createLineRenderer } from "./renderers/lineRenderer.js";
import { createBarRenderer } from "./renderers/barRenderer.js";
import {
  clampInt,
  DEFAULT_CONFIG,
  DISPLAY_MODES,
  parseBoolean,
  readWindowStorageString,
} from "./visualizationSchema.js";

const canvas = document.querySelector("#waveCanvas");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const newSpectrumWindowBtn = document.querySelector("#newSpectrumWindowBtn");
const mousePassthroughLockBtn = document.querySelector("#mousePassthroughLockBtn");
const nowPlayingPanel = document.querySelector("#nowPlayingPanel");
const nowPlayingArt = document.querySelector("#nowPlayingArt");
const nowPlayingTitle = document.querySelector("#nowPlayingTitle");
const nowPlayingArtist = document.querySelector("#nowPlayingArtist");
const nowPlayingAlbum = document.querySelector("#nowPlayingAlbum");
const nowPlayingSource = document.querySelector("#nowPlayingSource");
const nowPlayingLyrics = document.querySelector("#nowPlayingLyrics");
const resizeHandles = Array.from(document.querySelectorAll("[data-resize-dir]"));

const gl = canvas.getContext("webgl");
if (!gl) {
  throw new Error("当前环境不支持 WebGL");
}

const lineRenderer = createLineRenderer(gl);
const barRenderer = createBarRenderer(gl);

const waveShapeConfig = { ...DEFAULT_CONFIG.line.shape };
const barShapeConfig = { ...DEFAULT_CONFIG.bar.shape };

let latestPoints = [];
let displayMode = DEFAULT_CONFIG.displayMode;

function applyWaveShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  waveShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  waveShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  waveShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  waveShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function applyBarShapeConfig(payload) {
  if (!payload || typeof payload !== "object") return;
  barShapeConfig.gainPercent = clampInt(payload.gainPercent, 10, 150);
  barShapeConfig.smoothPercent = clampInt(payload.smoothPercent, 0, 400);
  barShapeConfig.softClipPercent = clampInt(payload.softClipPercent, 0, 100);
  barShapeConfig.fallEasePercent = clampInt(payload.fallEasePercent, 0, 100);
}

function loadShapeConfigsFromStorage(windowLabel) {
  try {
    const raw = readWindowStorageString(window.localStorage, windowLabel, "lineShape");
    if (raw) applyWaveShapeConfig(JSON.parse(raw));
    const barRaw = readWindowStorageString(window.localStorage, windowLabel, "barShape");
    if (barRaw) applyBarShapeConfig(JSON.parse(barRaw));
  } catch {
    // ignore storage failures and keep defaults
  }
}

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
  renderNowPlayingLyrics();
}

function pickCurrentLyricText(elapsedSec) {
  const ms = Math.max(0, elapsedSec) * 1000;
  const lines = lyricsDisplayState.lines;
  if (lines.length > 0) {
    let current = "";
    for (const line of lines) {
      const t = typeof line.timeMs === "number" ? line.timeMs : 0;
      const text = typeof line.text === "string" ? line.text : "";
      if (t <= ms) current = text;
      else break;
    }
    if (current) return current;
  }
  if (lyricsDisplayState.plainLyrics) {
    const rows = lyricsDisplayState.plainLyrics.split("\n").map((s) => s.trim()).filter(Boolean);
    if (rows.length > 0) {
      const idx = Math.min(rows.length - 1, Math.floor(elapsedSec / 4));
      return rows[idx];
    }
  }
  return "";
}

function renderNowPlayingLyrics() {
  if (!nowPlayingLyrics) return;
  const { status, instrumental } = lyricsDisplayState;
  if (status === "idle" || status === "miss") {
    nowPlayingLyrics.hidden = true;
    nowPlayingLyrics.classList.remove("is-visible", "is-loading");
    nowPlayingLyrics.textContent = "";
    return;
  }
  nowPlayingLyrics.hidden = false;
  if (status === "loading") {
    nowPlayingLyrics.classList.add("is-loading", "is-visible");
    nowPlayingLyrics.classList.remove("is-idle");
    nowPlayingLyrics.textContent = "歌词加载中…";
    return;
  }
  if (instrumental) {
    nowPlayingLyrics.classList.add("is-visible");
    nowPlayingLyrics.classList.remove("is-loading");
    nowPlayingLyrics.textContent = "纯音乐";
    return;
  }
  const line = pickCurrentLyricText(getLiveElapsedSec());
  if (!line) {
    nowPlayingLyrics.hidden = true;
    nowPlayingLyrics.classList.remove("is-visible");
    return;
  }
  nowPlayingLyrics.classList.add("is-visible");
  nowPlayingLyrics.classList.remove("is-loading");
  nowPlayingLyrics.textContent = line;
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
}

function syncNowPlayingProgressFromPayload(p) {
  const active = Boolean(p?.active);
  if (!active) {
    nowPlayingProgressSync = null;
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
  nowPlayingProgressSync = {
    bundleName,
    playingLabel,
    elapsedSec,
    durationSec,
    syncedAt: performance.now(),
    isPlaying: p.isPlaying !== false,
  };
  renderNowPlayingSourceLine();
}

function applyNowPlaying(payload) {
  if (!nowPlayingPanel) return;
  const p = payload && typeof payload === "object" ? payload : {};
  const active = Boolean(p.active);

  if (!active) {
    nowPlayingPanel.hidden = false;
    nowPlayingPanel.classList.add("is-idle");
    if (nowPlayingTitle) nowPlayingTitle.textContent = "未检测到正在播放";
    if (nowPlayingArtist) nowPlayingArtist.textContent = "";
    if (nowPlayingAlbum) nowPlayingAlbum.textContent = "";
    if (nowPlayingSource) nowPlayingSource.textContent = "";
    if (nowPlayingArt) nowPlayingArt.removeAttribute("src");
    nowPlayingPanel?.classList.remove("has-artwork");
    nowPlayingProgressSync = null;
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

  nowPlayingPanel.hidden = false;
  nowPlayingPanel.classList.remove("is-idle");
  const title = typeof p.title === "string" && p.title.trim() ? p.title.trim() : "未知曲目";
  const artist = typeof p.artist === "string" ? p.artist.trim() : "";
  const album = typeof p.album === "string" ? p.album.trim() : "";
  if (nowPlayingTitle) nowPlayingTitle.textContent = title;
  if (nowPlayingArtist) nowPlayingArtist.textContent = artist;
  if (nowPlayingAlbum) nowPlayingAlbum.textContent = album;

  syncNowPlayingProgressFromPayload(p);

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
      nowPlayingPanel?.classList.add("has-artwork");
    } else {
      nowPlayingArt.removeAttribute("src");
      nowPlayingPanel?.classList.remove("has-artwork");
    }
  }
}

function hexToRgb(hex) {
  const safeHex = typeof hex === "string" ? hex.replace("#", "") : "";
  if (safeHex.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

const DEFAULT_WAVEFORM_HEX = DEFAULT_CONFIG.line.color;

const waveformLineRgb = { r: 0, g: 0, b: 0 };
const barFillRgb = { r: 0, g: 0, b: 0 };

function applyWaveformColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_WAVEFORM_HEX;
  const { r, g, b } = hexToRgb(safe);
  waveformLineRgb.r = r / 255;
  waveformLineRgb.g = g / 255;
  waveformLineRgb.b = b / 255;
}

applyWaveformColorHex(DEFAULT_WAVEFORM_HEX);
applyBarColorHex(DEFAULT_CONFIG.bar.color);

const WAVEFORM_WIDTH_MIN = 1;
const WAVEFORM_WIDTH_MAX = 12;
let waveformLineWidthPx = 2;
let barWidthPercent = DEFAULT_CONFIG.bar.widthPercent;
let barGapPercent = DEFAULT_CONFIG.bar.gapPercent;
let barHeadroomPercent = DEFAULT_CONFIG.bar.headroomPercent;
let barMirrorEnabled = DEFAULT_CONFIG.bar.mirrorEnabled;
let barPeakHoldEnabled = DEFAULT_CONFIG.bar.peakHoldEnabled;
let barPeakFallSpeed = DEFAULT_CONFIG.bar.peakFallSpeed;
let barPeakThickness = DEFAULT_CONFIG.bar.peakThickness;

function applyBarColorHex(hex) {
  const raw = typeof hex === "string" ? hex.trim() : "";
  const safe = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CONFIG.bar.color;
  const { r, g, b } = hexToRgb(safe);
  barFillRgb.r = r / 255;
  barFillRgb.g = g / 255;
  barFillRgb.b = b / 255;
}

function applyWaveformLineWidthPx(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  waveformLineWidthPx = Math.min(WAVEFORM_WIDTH_MAX, Math.max(WAVEFORM_WIDTH_MIN, v));
}

function applyBarWidthPercent(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  barWidthPercent = Math.max(20, Math.min(100, v));
}

function applyBarGapPercent(n) {
  barGapPercent = clampInt(n, 0, 70);
}

function applyBarHeadroomPercent(n) {
  barHeadroomPercent = clampInt(n, 0, 40);
}

function applyBarMirrorEnabled(value) {
  barMirrorEnabled = parseBoolean(value, DEFAULT_CONFIG.bar.mirrorEnabled);
}

function applyBarPeakHoldEnabled(value) {
  barPeakHoldEnabled = parseBoolean(value, DEFAULT_CONFIG.bar.peakHoldEnabled);
}

function applyBarPeakFallSpeed(value) {
  barPeakFallSpeed = clampInt(value, 5, 120);
}

function applyBarPeakThickness(value) {
  barPeakThickness = clampInt(value, 1, 8);
}

function applyMainBackgroundStyle(payload) {
  const { color = "#000000", alpha = 0.35 } = payload ?? {};
  const { r, g, b } = hexToRgb(color);
  const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.35;
  document.body.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(3)})`;
}

function loadMainBackgroundStyleFromStorage(windowLabel) {
  try {
    const savedColor = readWindowStorageString(window.localStorage, windowLabel, "mainBgColor");
    const savedAlphaRaw = readWindowStorageString(window.localStorage, windowLabel, "mainBgAlpha");
    const color = /^#[0-9A-Fa-f]{6}$/.test(savedColor ?? "") ? savedColor.toLowerCase() : "#000000";
    const alphaPercent = clampInt(savedAlphaRaw, 0, 100);
    applyMainBackgroundStyle({ color, alpha: alphaPercent / 100 });
  } catch {
    applyMainBackgroundStyle({ color: "#000000", alpha: 0.35 });
  }
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function renderWaveform() {
  resizeCanvas();
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (displayMode === "bar") {
    barRenderer.render(latestPoints, barShapeConfig, {
      color: barFillRgb,
      widthPercent: barWidthPercent,
      gapPercent: barGapPercent,
      headroomPercent: barHeadroomPercent,
      mirrorEnabled: barMirrorEnabled,
      peakHoldEnabled: barPeakHoldEnabled,
      peakFallSpeed: barPeakFallSpeed,
      peakThickness: barPeakThickness,
    });
  } else {
    lineRenderer.render(latestPoints, waveShapeConfig, {
      color: waveformLineRgb,
      lineWidthPx: waveformLineWidthPx,
    });
  }

  requestAnimationFrame(renderWaveform);
}

async function init() {
  const windowLabel = getCurrentWebviewWindow().label;
  const isSpectrumClone = windowLabel.startsWith("spectrum-");
  let isSpectrumTraditional = false;
  if (isSpectrumClone) {
    document.body.classList.add("spectrum-clone");
    try {
      const overlayMode = await invoke("get_spectrum_window_overlay_mode", {
        label: windowLabel,
      });
      if (!overlayMode) {
        isSpectrumTraditional = true;
        document.body.classList.add("spectrum-traditional");
      }
    } catch (err) {
      console.error("get_spectrum_window_overlay_mode failed:", err);
    }
  }

  const triggerNativeDrag = async (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest("[data-no-drag], button, input, select, textarea, a")) return;
    try {
      await invoke("start_window_dragging");
    } catch {
      // ignore drag call failures when system rejects dragging state
    }
  };

  if (!isSpectrumTraditional) {
    document.body.addEventListener("mousedown", triggerNativeDrag);
  }

  const triggerNativeResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const direction = event.currentTarget.dataset.resizeDir;
    if (!direction) return;
    document.body.classList.add("is-resizing-window");
    let lastX = event.screenX;
    let lastY = event.screenY;

    const onMouseMove = async (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.screenX - lastX;
      const deltaY = moveEvent.screenY - lastY;
      if (deltaX === 0 && deltaY === 0) return;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      try {
        await invoke("resize_window_by_delta", { direction, deltaX, deltaY });
      } catch {
        // ignore resize call failures when system rejects resizing state
      }
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("mouseleave", stopResize);
      document.body.classList.remove("is-resizing-window");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseleave", stopResize);
  };
  if (!isSpectrumTraditional) {
    resizeHandles.forEach((handle) => {
      handle.addEventListener("mousedown", triggerNativeResize);
    });
  }

  await listen("waveform-frame", (event) => {
    const payload = event.payload;
    if (Array.isArray(payload.points)) {
      latestPoints = payload.points;
    }
  });

  await listen("waveform-error", (event) => {
    console.error("waveform-error:", event.payload);
  });

  await listen("waveform-status", (event) => {
    console.info("waveform-status:", event.payload);
  });

  await listen("now-playing-update", (event) => {
    applyNowPlaying(event.payload);
  });

  await listen("now-playing-progress", (event) => {
    syncNowPlayingProgressFromPayload(event.payload);
  });

  await listen("lyrics-update", (event) => {
    applyLyricsUpdate(event.payload);
  });

  setInterval(renderNowPlayingSourceLine, 500);

  async function syncNowPlayingSnapshot() {
    try {
      const snap = await invoke("get_now_playing_snapshot");
      applyNowPlaying(snap);
    } catch (err) {
      console.warn("get_now_playing_snapshot failed:", err);
    }
  }

  await syncNowPlayingSnapshot();
  try {
    await invoke("sync_lyrics_for_now_playing");
  } catch {
    // 非 macOS 或未启用 now playing 时忽略
  }

  const thisWebviewTarget = { kind: "WebviewWindow", label: windowLabel };

  await listen(
    "main-bg-style",
    (event) => {
      applyMainBackgroundStyle(event.payload);
    },
    { target: thisWebviewTarget },
  );

  await listen(
    "waveform-line-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyWaveformColorHex(color);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-color",
    (event) => {
      const raw = event.payload;
      const color = typeof raw === "string" ? raw : "";
      applyBarColorHex(color);
    },
    { target: thisWebviewTarget },
  );

  await listen(
    "waveform-line-width",
    (event) => {
      applyWaveformLineWidthPx(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-width",
    (event) => {
      applyBarWidthPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-gap",
    (event) => {
      applyBarGapPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-headroom",
    (event) => {
      applyBarHeadroomPercent(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-mirror",
    (event) => {
      applyBarMirrorEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-hold",
    (event) => {
      applyBarPeakHoldEnabled(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-fall-speed",
    (event) => {
      applyBarPeakFallSpeed(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-peak-thickness",
    (event) => {
      applyBarPeakThickness(event.payload);
    },
    { target: thisWebviewTarget },
  );

  await listen(
    "waveform-shape-config",
    (event) => {
      applyWaveShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "waveform-bar-shape-config",
    (event) => {
      applyBarShapeConfig(event.payload);
    },
    { target: thisWebviewTarget },
  );
  await listen(
    "visualization-display-mode",
    (event) => {
      const mode = String(event.payload ?? "");
      displayMode = mode === DISPLAY_MODES.bar ? DISPLAY_MODES.bar : DISPLAY_MODES.line;
    },
    { target: thisWebviewTarget },
  );

  const applyMousePassthroughLockUi = (locked) => {
    const on = Boolean(locked);
    document.body.classList.toggle("mouse-passthrough-locked", on);
    if (!mousePassthroughLockBtn) return;
    mousePassthroughLockBtn.setAttribute("aria-pressed", on ? "true" : "false");
    mousePassthroughLockBtn.classList.toggle("is-locked", on);
    const isMain = windowLabel === "main";
    mousePassthroughLockBtn.title = on
      ? isMain
        ? "已穿透：点击关闭穿透，或按 ⌘⇧⌥L"
        : "已穿透（本窗）：点击关闭，主窗仍可用 ⌘⇧⌥L 切换主窗穿透"
      : isMain
        ? "开启后主窗口鼠标穿透到下层；也可用 ⌘⇧⌥L"
        : "开启后本窗口鼠标穿透到下层";
    const lockImg = mousePassthroughLockBtn.querySelector("img[data-lock-icon]");
    if (lockImg) {
      lockImg.src = on ? "/icons/passthrough-active.svg" : "/icons/passthrough-idle.svg";
    }
  };

  await listen("mouse-passthrough-changed", (event) => {
    const p = event.payload;
    const lbl =
      p && typeof p === "object" && p.label != null ? String(p.label) : "main";
    const locked =
      p && typeof p === "object" && typeof p.locked === "boolean"
        ? p.locked
        : Boolean(p);
    if (lbl !== windowLabel) return;
    applyMousePassthroughLockUi(locked);
  });

  try {
    const savedLineHex = readWindowStorageString(window.localStorage, windowLabel, "lineColor");
    if (typeof savedLineHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(savedLineHex)) {
      applyWaveformColorHex(savedLineHex);
    } else {
      const rust = await invoke("get_waveform_color");
      applyWaveformColorHex(typeof rust === "string" ? rust : DEFAULT_WAVEFORM_HEX);
    }
  } catch {
    applyWaveformColorHex(DEFAULT_WAVEFORM_HEX);
  }

  try {
    const savedMode = readWindowStorageString(window.localStorage, windowLabel, "displayMode");
    if (savedMode === DISPLAY_MODES.bar || savedMode === DISPLAY_MODES.line) {
      displayMode = savedMode;
    }
    const savedBarColor = readWindowStorageString(window.localStorage, windowLabel, "barColor");
    if (savedBarColor) {
      applyBarColorHex(savedBarColor);
    }
    const savedBarWidth = readWindowStorageString(window.localStorage, windowLabel, "barWidth");
    if (savedBarWidth) {
      applyBarWidthPercent(savedBarWidth);
    }
    const savedBarGap = readWindowStorageString(window.localStorage, windowLabel, "barGap");
    if (savedBarGap) {
      applyBarGapPercent(savedBarGap);
    }
    const savedBarHeadroom = readWindowStorageString(window.localStorage, windowLabel, "barHeadroom");
    if (savedBarHeadroom) {
      applyBarHeadroomPercent(savedBarHeadroom);
    }
    applyBarMirrorEnabled(readWindowStorageString(window.localStorage, windowLabel, "barMirror"));
    applyBarPeakHoldEnabled(readWindowStorageString(window.localStorage, windowLabel, "barPeakHold"));
    applyBarPeakFallSpeed(readWindowStorageString(window.localStorage, windowLabel, "barPeakFallSpeed"));
    applyBarPeakThickness(readWindowStorageString(window.localStorage, windowLabel, "barPeakThickness"));
  } catch {
    // ignore storage failures
  }

  try {
    const savedW = readWindowStorageString(window.localStorage, windowLabel, "lineWidth");
    if (savedW) {
      applyWaveformLineWidthPx(savedW);
    } else {
      const w = await invoke("get_waveform_line_width");
      applyWaveformLineWidthPx(w);
    }
  } catch {
    applyWaveformLineWidthPx(2);
  }

  loadShapeConfigsFromStorage(windowLabel);

  try {
    const locked = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
    applyMousePassthroughLockUi(locked);
  } catch {
    applyMousePassthroughLockUi(false);
  }

  if (mousePassthroughLockBtn) {
    mousePassthroughLockBtn.addEventListener("click", async () => {
      try {
        const cur = await invoke("get_mouse_passthrough_locked", { label: windowLabel });
        const next = !cur;
        await invoke("set_mouse_passthrough_locked", { label: windowLabel, locked: next });
        applyMousePassthroughLockUi(next);
      } catch (err) {
        console.error("mouse passthrough toggle failed:", err);
      }
    });
  }

  openSettingsBtn.addEventListener("click", async () => {
    try {
      await invoke("open_settings_window", { visualTargetLabel: windowLabel });
    } catch (err) {
      console.error("open_settings_window failed:", err);
    }
  });

  const canOpenExtraSpectrum =
    windowLabel === "main" || windowLabel.startsWith("spectrum-");
  if (newSpectrumWindowBtn && canOpenExtraSpectrum) {
    newSpectrumWindowBtn.addEventListener("click", async () => {
      try {
        await invoke("open_extra_spectrum_window", { anchor_label: windowLabel });
      } catch (err) {
        console.error("open_extra_spectrum_window failed:", err);
      }
    });
  }

  if (windowLabel === "main" || windowLabel.startsWith("spectrum-")) {
    try {
      await invoke("start_waveform_stream");
    } catch (err) {
      console.error("start_waveform_stream failed:", err);
    }
    await syncNowPlayingSnapshot();
    try {
      await invoke("sync_lyrics_for_now_playing");
    } catch {
      // ignore
    }
  }
  loadMainBackgroundStyleFromStorage(windowLabel);
  renderWaveform();
}

init().catch((error) => {
  console.error("main init failed:", error);
});
