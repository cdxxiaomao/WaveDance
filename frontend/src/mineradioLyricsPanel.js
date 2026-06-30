import { normalizeLyricsWindowConfig } from "./lyricsSettingsSchema.js";
import { getMineradioBeatMotion, resetMineradioBeatMotion } from "./mineradioBeatMotion.js";

const LYRICS_LEAD_MS = 320;

/** @type {HTMLElement | null} */
let hostEl = null;
/** @type {HTMLElement | null} */
let stageEl = null;
/** @type {HTMLElement | null} */
let viewportEl = null;
/** @type {HTMLElement | null} */
let scrollEl = null;
/** @type {HTMLElement | null} */
let lineStageEl = null;
/** @type {HTMLElement | null} */
let lineEl = null;

/** @type {HTMLCanvasElement | null} */
let measureCanvas = null;

let lastText = "";
let lastLineIndex = -1;
let layoutKey = "";
let displayedProgress = 0;
let progressText = "";
/** @type {{ needed: boolean, overflow: number, limit: number, offset: number, holdUntil: number }} */
let scrollState = { needed: false, overflow: 0, limit: 0, offset: 0, holdUntil: 0 };
/** @type {typeof import("./lyricsSettingsSchema.js").DEFAULT_LYRICS_WINDOW_CONFIG | null} */
let panelConfig = null;

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {string} hex @param {number} alpha */
function colorWithAlpha(hex, alpha) {
  const body = String(hex ?? "").replace(/^#/, "");
  if (body.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1, 0.5)})`;
}

function getMeasureCtx() {
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  return measureCanvas.getContext("2d");
}

/** @param {string} text @param {number} fontSize @param {typeof panelConfig} cfg */
function measureLineWidth(text, fontSize, cfg) {
  const ctx = getMeasureCtx();
  if (!ctx || !cfg) return 1;
  ctx.font = `${cfg.mrFontWeight} ${fontSize}px ${cfg.fontFamily}`;
  let width = ctx.measureText(text || "WaveDance").width;
  const chars = Array.from(text || "");
  if (chars.length > 1 && cfg.mrLetterSpacing) {
    width += (chars.length - 1) * fontSize * cfg.mrLetterSpacing;
  }
  return Math.max(1, width);
}

/** @param {number} t */
function lyricScrollEase(t) {
  t = clamp(t, 0, 1, 0);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** @param {number} progressSpanSec */
function lyricScrollInitialHoldMs(progressSpanSec) {
  return Math.round(clamp(progressSpanSec * 130, 140, 520, 320));
}

/**
 * @param {{ timeMs: number, text: string } | null} line
 * @param {{ timeMs: number, text: string } | null | undefined} nextLine
 * @param {number} nowSec
 * @param {number | null | undefined} durationSec
 */
function getLyricLineProgress(line, nextLine, nowSec, durationSec) {
  if (!line) return 0;
  const lineT = line.timeMs / 1000;
  let nextT =
    nextLine && nextLine.timeMs > line.timeMs
      ? nextLine.timeMs / 1000
      : lineT + 4.8;
  if (typeof durationSec === "number" && durationSec > lineT) {
    nextT = Math.min(durationSec, nextT);
  }
  const span = Math.max(0.75, nextT - lineT);
  const prog = clamp((nowSec - lineT) / span, 0, 1, 0);
  return prog * prog * (3 - 2 * prog);
}

/**
 * @param {{ lines: { timeMs: number, text: string }[], plainLyrics: string }} state
 * @param {number} elapsedSec
 * @param {number | null | undefined} durationSec
 */
function pickCurrentLineSnapshot(state, elapsedSec, durationSec) {
  const ms = Math.max(0, elapsedSec) * 1000 + LYRICS_LEAD_MS;
  const lines = state.lines;
  if (lines.length > 0) {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeMs <= ms) idx = i;
      else break;
    }
    if (idx >= 0) {
      const cur = lines[idx];
      const next = lines[idx + 1];
      const lineT = cur.timeMs / 1000;
      let nextT =
        next && next.timeMs > cur.timeMs ? next.timeMs / 1000 : lineT + 4.8;
      if (typeof durationSec === "number" && durationSec > lineT) {
        nextT = Math.min(durationSec, nextT);
      }
      return {
        text: cur.text || "",
        lineIndex: idx,
        progress: getLyricLineProgress(cur, next, elapsedSec, durationSec),
        progressSpan: Math.max(0.75, nextT - lineT),
      };
    }
  }
  if (state.plainLyrics) {
    const rows = state.plainLyrics
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (rows.length > 0) {
      const idx = Math.min(rows.length - 1, Math.floor(elapsedSec / 4));
      const span = 4;
      const lineT = idx * span;
      const prog = clamp((elapsedSec - lineT) / span, 0, 1, 0);
      return {
        text: rows[idx] || "",
        lineIndex: idx,
        progress: prog * prog * (3 - 2 * prog),
        progressSpan: span,
      };
    }
  }
  return { text: "", lineIndex: -1, progress: 0, progressSpan: 4.8 };
}

/** @param {number} target @param {boolean} playing @param {number} progressSpan @param {number} receivedAt */
function easeDisplayProgress(target, playing, progressSpan, receivedAt) {
  if (progressText !== lastText) {
    progressText = lastText;
    displayedProgress = target;
  }
  let liveTarget = target;
  if (playing && progressSpan > 0) {
    liveTarget += Math.max(0, performance.now() - receivedAt) / (progressSpan * 1000);
  }
  liveTarget = clamp(liveTarget, 0, 1, liveTarget);
  const delta = liveTarget - displayedProgress;
  if (delta < -0.018 && liveTarget > 0.035 && displayedProgress < 0.985) {
    displayedProgress = clamp(displayedProgress + Math.max(delta * 0.018, -0.0028), 0, 1, displayedProgress);
    return displayedProgress;
  }
  const ease =
    delta >= 0 ? Math.min(0.3, 0.074 + Math.abs(delta) * 0.5) : Math.min(0.03, 0.008 + Math.abs(delta) * 0.045);
  displayedProgress = clamp(displayedProgress + delta * ease, 0, 1, displayedProgress);
  return displayedProgress;
}

let progressReceivedAt = 0;
let progressSpanSec = 4.8;
/** @type {{ timeMs: number, text: string }[]} */
let cachedLines = [];
let cachedPlainLyrics = "";
let cachedTrackKey = "";
let lastMotionAt = 0;
let lineAnimGen = 0;

/** @param {boolean} [force] */
function fitLyricText(force = false) {
  if (!lineEl || !viewportEl || !stageEl || !panelConfig) return;
  const cfg = panelConfig;
  const safeWidth = Math.max(300, window.innerWidth - 8);
  const edgeWidth = Math.round(clamp(safeWidth * 0.085, 54, 116, 92));
  const viewportWidth = Math.round(
    Math.max(280, Math.min(safeWidth - 12, window.innerWidth - Math.min(240, Math.max(88, window.innerWidth * 0.13)))),
  );
  const clearWidth = Math.max(160, viewportWidth - edgeWidth * 2);
  const readableWidth = clearWidth;
  const maxHeight = Math.max(64, window.innerHeight - 188);
  const text = lineEl.textContent || "";
  const nextLayoutKey = [
    text,
    cfg.mrFontSizePx,
    cfg.fontFamily,
    cfg.mrFontWeight,
    cfg.mrLetterSpacing,
    cfg.mrLineHeight,
    window.innerWidth,
    window.innerHeight,
  ].join("|");
  if (!force && nextLayoutKey === layoutKey) return;
  layoutKey = nextLayoutKey;

  stageEl.style.width = `${safeWidth}px`;
  stageEl.style.maxWidth = `${safeWidth}px`;
  viewportEl.style.width = `${viewportWidth}px`;
  viewportEl.style.maxWidth = `${Math.max(280, safeWidth - 12)}px`;
  hostEl?.style.setProperty("--mr-edge-width", `${edgeWidth}px`);

  let size = cfg.mrFontSizePx;
  let fitScaleX = 1;
  const minSize = Math.max(24, Math.min(32, cfg.mrFontSizePx * 0.55));
  const maxScrollableWidth = readableWidth * 1.76;
  for (let i = 0; i < 24; i++) {
    const width = measureLineWidth(text, size, cfg);
    const height = size * cfg.mrLineHeight;
    if ((width <= maxScrollableWidth && height <= maxHeight) || size <= minSize) break;
    size = Math.max(minSize, size - Math.max(1.25, size * 0.062));
  }
  const measuredWidth = measureLineWidth(text, size, cfg);
  const maxRenderedWidth = readableWidth * 1.82;
  if (measuredWidth > maxRenderedWidth) {
    fitScaleX = clamp(maxRenderedWidth / measuredWidth, 0.72, 1, 1);
  }
  const scaledWidth = measuredWidth * fitScaleX;
  const travelWidth = Math.max(0, scaledWidth - clearWidth);
  const clearTailMargin = Math.max(58, Math.min(edgeWidth * 1.18, size * 1.08));
  const centeredTailLimit =
    scaledWidth > clearWidth * 1.28 ? Math.max(0, scaledWidth / 2 - clearWidth * 0.18) : 0;
  scrollState.limit = travelWidth > 0 ? Math.max(travelWidth / 2 + clearTailMargin, centeredTailLimit) : 0;
  scrollState.overflow = scrollState.limit * 2;
  scrollState.needed = travelWidth > Math.max(16, size * 0.18);
  const maskEdgeWidth = scrollState.needed
    ? Math.round(clamp(edgeWidth * 0.44, 26, 58, 42))
    : edgeWidth;
  if (!scrollState.needed) {
    scrollState.offset = 0;
    scrollState.holdUntil = 0;
  } else {
    const limit = scrollState.limit || scrollState.overflow / 2;
    if (!Number.isFinite(scrollState.offset) || Math.abs(scrollState.offset) > limit + 8) {
      scrollState.offset = 0;
      scrollState.holdUntil = performance.now() + lyricScrollInitialHoldMs(progressSpanSec);
    }
  }
  hostEl?.style.setProperty("--mr-size", `${Math.round(size)}px`);
  hostEl?.style.setProperty(
    "--mr-letter-spacing",
    `${(size * cfg.mrLetterSpacing).toFixed(2)}px`,
  );
  hostEl?.style.setProperty("--mr-fit-x", fitScaleX.toFixed(4));
  hostEl?.style.setProperty("--mr-mask-edge-width", `${maskEdgeWidth}px`);
  hostEl?.style.setProperty("--mr-scroll-x", `${scrollState.offset.toFixed(2)}px`);
}

/** @param {number} nowMs @param {number} progress */
function updateLyricScroll(nowMs, progress) {
  if (!hostEl) return;
  if (!scrollState.needed) {
    if (scrollState.offset !== 0) {
      scrollState.offset = 0;
      hostEl.style.setProperty("--mr-scroll-x", "0px");
    }
    return;
  }
  const limit = Math.max(0, scrollState.limit || scrollState.overflow / 2);
  if (limit > 0) {
    let p = clamp(progress, 0, 1, 0);
    const spanMs = Math.max(450, progressSpanSec * 1000);
    const startGate = clamp(lyricScrollInitialHoldMs(progressSpanSec) / spanMs, 0.035, 0.18, 0.08);
    const longLineBias = clamp(limit / Math.max(260, window.innerWidth), 0, 0.3, 0.12);
    const shortLineBias = clamp((4.8 - progressSpanSec) / 8, 0, 0.16, 0);
    let endGate = clamp(0.84 - longLineBias * 0.38 - shortLineBias * 0.5, 0.62, 0.88, 0.78);
    if (endGate <= startGate + 0.12) endGate = startGate + 0.12;
    const travel = lyricScrollEase((p - startGate) / (endGate - startGate));
    let targetOffset = -limit * travel;
    if (p >= endGate) targetOffset = -limit;
    if (nowMs < scrollState.holdUntil && p < startGate) targetOffset = 0;
    scrollState.offset = Math.max(-limit, Math.min(0, Math.min(scrollState.offset, targetOffset)));
  }
  hostEl.style.setProperty("--mr-scroll-x", `${scrollState.offset.toFixed(2)}px`);
}

function replayLineAnimation() {
  if (!lineStageEl) return;
  lineAnimGen++;
  const gen = lineAnimGen;

  lineStageEl.classList.remove("is-entering");
  lineStageEl.style.animation = "none";
  void lineStageEl.offsetWidth;
  lineStageEl.style.removeProperty("animation");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!lineStageEl || gen !== lineAnimGen) return;
      lineStageEl.classList.add("is-entering");
    });
  });
}

/**
 * @param {HTMLElement} root
 */
export function mountMineradioLyricsPanel(root) {
  if (!root || hostEl) return;

  hostEl = root;
  hostEl.classList.add("uses-mineradio-lyrics");
  hostEl.classList.remove("uses-am-lyrics");

  const wrap = document.createElement("div");
  wrap.className = "mr-lyrics-wrap";

  stageEl = document.createElement("div");
  stageEl.className = "mr-lyrics-stage";

  viewportEl = document.createElement("div");
  viewportEl.className = "mr-lyric-viewport";

  scrollEl = document.createElement("div");
  scrollEl.className = "mr-lyric-scroll";

  lineStageEl = document.createElement("div");
  lineStageEl.className = "mr-line-stage";

  lineEl = document.createElement("div");
  lineEl.className = "mr-line";
  lineEl.textContent = "WaveDance";

  lineStageEl.appendChild(lineEl);
  scrollEl.appendChild(lineStageEl);
  viewportEl.appendChild(scrollEl);
  stageEl.appendChild(viewportEl);
  wrap.appendChild(stageEl);
  hostEl.replaceChildren(wrap);
  hostEl.hidden = false;
  hostEl.classList.add("is-visible");

  window.addEventListener("resize", onResize);
}

function onResize() {
  layoutKey = "";
  fitLyricText(true);
}

export function unmountMineradioLyricsPanel() {
  window.removeEventListener("resize", onResize);
  lineAnimGen++;
  resetMineradioBeatMotion();
  hostEl?.classList.remove("uses-mineradio-lyrics");
  hostEl = null;
  stageEl = null;
  viewportEl = null;
  scrollEl = null;
  lineStageEl = null;
  lineEl = null;
  lastText = "";
  lastLineIndex = -1;
  layoutKey = "";
  displayedProgress = 0;
  progressText = "";
  scrollState = { needed: false, overflow: 0, limit: 0, offset: 0, holdUntil: 0 };
  panelConfig = null;
  cachedLines = [];
  cachedPlainLyrics = "";
  cachedTrackKey = "";
  lastMotionAt = 0;
}

export function isMineradioLyricsMounted() {
  return Boolean(hostEl && lineEl);
}

/** @param {typeof import("./lyricsSettingsSchema.js").DEFAULT_LYRICS_WINDOW_CONFIG} cfg */
export function applyMineradioLyricsStyle(cfg) {
  if (!hostEl) return;
  panelConfig = cfg;
  const primary = cfg.mrPrimaryColor;
  const highlight = cfg.mrHighlightColor;
  const glow = cfg.mrGlowColor;
  hostEl.style.setProperty("--mr-primary", primary);
  hostEl.style.setProperty("--mr-highlight", highlight);
  hostEl.style.setProperty("--mr-glow", glow);
  hostEl.style.setProperty("--mr-font", cfg.fontFamily);
  hostEl.style.setProperty("--mr-weight", String(cfg.mrFontWeight));
  hostEl.style.setProperty("--mr-line-height", String(cfg.mrLineHeight));
  hostEl.style.setProperty("--mr-feather", `${(cfg.mrFeather * 100).toFixed(2)}%`);
  hostEl.style.setProperty("--mr-shadow-soft", colorWithAlpha(primary, 0.34));
  hostEl.style.setProperty("--mr-shadow-glow", colorWithAlpha(glow, 0.26));
  hostEl.classList.toggle("mr-highlight-follow", cfg.mrHighlightFollow !== false);
  hostEl.classList.toggle("mr-cinema-motion", cfg.mrCinemaMotion !== false);
  getMineradioBeatMotion().configure({
    cinemaEnabled: cfg.mrCinemaMotion !== false,
    glowStrength: cfg.mrBeatGlowStrength,
    beatGlowEnabled: cfg.mrBeatGlow !== false,
  });
  layoutKey = "";
  fitLyricText(true);
}

/**
 * @param {{
 *   status: string,
 *   lines: { timeMs: number, text: string }[],
 *   plainLyrics: string,
 *   instrumental: boolean,
 *   lyricsSource: string,
 * }} state
 * @param {number} elapsedSec
 * @param {number | null | undefined} durationSec
 * @param {{ title?: string, artist?: string }} [meta]
 * @param {boolean} [playing]
 * @param {boolean} [force]
 */
export function renderMineradioLyricsPanel(
  state,
  elapsedSec,
  durationSec,
  meta = {},
  playing = true,
  force = true,
) {
  if (!hostEl || !lineEl) return;

  hostEl.classList.toggle("is-paused", !playing);
  cachedLines = state.lines;
  cachedPlainLyrics = state.plainLyrics || "";
  if (state.trackKey !== cachedTrackKey) {
    cachedTrackKey = state.trackKey || "";
    getMineradioBeatMotion().setLyricLineBeatMap(state.lines, cachedTrackKey);
  }

  const { status, instrumental } = state;

  if (status === "idle") {
    hostEl.classList.add("is-visible", "is-idle");
    setLineText("未检测到正在播放", -1, 0, 4.8, true);
    applyBeatMotion(elapsedSec, false);
    return;
  }

  hostEl.classList.remove("is-idle");

  if (status === "loading" || status === "miss") {
    const text = meta.title || "未知曲目";
    setLineText(text, -1, 0, 4.8, true);
    hostEl.classList.add("is-visible");
    applyBeatMotion(elapsedSec, playing);
    return;
  }

  if (instrumental) {
    setLineText("纯音乐", -1, 0, 4.8, true);
    hostEl.classList.add("is-visible");
    applyBeatMotion(elapsedSec, playing);
    return;
  }

  const snap = pickCurrentLineSnapshot(state, elapsedSec, durationSec);
  if (!snap.text) {
    hostEl.classList.remove("is-visible");
    hostEl.hidden = true;
    return;
  }

  hostEl.hidden = false;
  hostEl.classList.add("is-visible");

  const lineChanged = snap.lineIndex !== lastLineIndex;
  const textChanged = snap.text !== lastText;
  if (force || lineChanged || textChanged) {
    setLineText(snap.text, snap.lineIndex, snap.progress, snap.progressSpan, lineChanged || textChanged);
  }

  if (state.lyricsSource) {
    hostEl.title = `歌词来源：${state.lyricsSource}`;
  } else {
    hostEl.removeAttribute("title");
  }

  updateProgressVisuals(snap.progress, snap.progressSpan, playing);
  applyBeatMotion(elapsedSec, playing);
}

/**
 * @param {{ points?: number[], peak?: number, rms?: number }} frame
 */
export function feedMineradioWaveformFrame(frame) {
  if (!hostEl || !panelConfig) return;
  getMineradioBeatMotion().feedWaveformFrame(frame);
}

/** @param {unknown} payload @param {string} [key] */
export function setMineradioBeatMap(payload, key) {
  getMineradioBeatMotion().setBeatMap(payload, key);
}

/** @param {number} elapsedSec @param {boolean} playing */
function applyBeatMotion(elapsedSec, playing) {
  if (!hostEl || !stageEl || !panelConfig || panelConfig.mrCinemaMotion === false) {
    if (stageEl) {
      stageEl.style.removeProperty("transform");
      stageEl.style.removeProperty("filter");
    }
    hostEl?.style.setProperty("--mr-stage-brightness", "1");
    hostEl?.style.setProperty("--mr-stage-saturate", "1");
    hostEl?.style.setProperty("--mr-css-beat-glow", "0px");
    return;
  }

  const now = performance.now();
  const dt = lastMotionAt ? clamp((now - lastMotionAt) / 1000, 0.001, 0.12, 1 / 60) : 1 / 60;
  lastMotionAt = now;

  const motion = getMineradioBeatMotion();
  motion.syncPlaybackTime(elapsedSec);
  const stage = motion.tick(elapsedSec, dt, playing);
  stageEl.style.transform = stage.transform;
  stageEl.style.removeProperty("filter");
  hostEl.style.setProperty("--mr-stage-brightness", stage.brightness.toFixed(3));
  hostEl.style.setProperty("--mr-stage-saturate", stage.saturate.toFixed(3));
  hostEl.style.setProperty("--mr-css-beat-glow", `${stage.beatGlowPx.toFixed(2)}px`);
}

/**
 * @param {string} text
 * @param {number} lineIndex
 * @param {number} progress
 * @param {number} progressSpan
 * @param {boolean} animate
 */
function setLineText(text, lineIndex, progress, progressSpan, animate) {
  if (!lineEl) return;
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized !== lastText) {
    lastText = normalized;
    lastLineIndex = lineIndex;
    progressText = normalized;
    displayedProgress = progress;
    progressSpanSec = progressSpan;
    progressReceivedAt = performance.now();
    scrollState.offset = 0;
    scrollState.holdUntil = performance.now() + lyricScrollInitialHoldMs(progressSpan);
    lineEl.textContent = normalized;
    lineEl.dataset.text = normalized;
    layoutKey = "";
    fitLyricText(true);
    if (animate) {
      replayLineAnimation();
    } else if (lineStageEl) {
      lineAnimGen++;
      lineStageEl.classList.remove("is-entering");
      lineStageEl.style.removeProperty("animation");
    }
  } else if (lineIndex !== lastLineIndex) {
    lastLineIndex = lineIndex;
    progressSpanSec = progressSpan;
    progressReceivedAt = performance.now();
  }
}

/** @param {number} targetProgress @param {number} progressSpan @param {boolean} playing */
function updateProgressVisuals(targetProgress, progressSpan, playing) {
  if (!hostEl) return;
  progressSpanSec = progressSpan;
  const progress = easeDisplayProgress(targetProgress, playing, progressSpan, progressReceivedAt);
  hostEl.style.setProperty("--mr-progress", `${(progress * 100).toFixed(2)}%`);
  updateLyricScroll(performance.now(), progress);
}

/** @param {number} elapsedSec @param {number | null | undefined} durationSec @param {boolean} [playing] */
export function tickMineradioLyrics(elapsedSec, durationSec, playing = true) {
  if (!hostEl || !lineEl || !panelConfig || lastLineIndex < 0 || !lastText) return;
  hostEl.classList.toggle("is-paused", !playing);

  const snap = pickCurrentLineSnapshot(
    { lines: cachedLines, plainLyrics: cachedPlainLyrics },
    elapsedSec,
    durationSec,
  );
  if (snap.lineIndex !== lastLineIndex && snap.text) {
    setLineText(snap.text, snap.lineIndex, snap.progress, snap.progressSpan, true);
  } else {
    updateProgressVisuals(snap.progress, snap.progressSpan, playing);
  }
  applyBeatMotion(elapsedSec, playing);
}
