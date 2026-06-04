import "@uimaxbai/am-lyrics/am-lyrics.js";
import { linesToTtml, plainLyricsToTtml } from "./lrcToTtml.js";

const LYRICS_LEAD_MS = 320;

/** @type {HTMLElement | null} */
let hostEl = null;
/** @type {HTMLElement | null} */
let statusEl = null;
/** @type {HTMLElement | null} */
let mountEl = null;
/** @type {HTMLElement | null} */
let amEl = null;
let boundTrackKey = "";
let boundTtml = "";
/** @type {number | null} */
let activationTimerId = null;
/** @type {MutationObserver | null} */
let lyricsReadyObserver = null;

/** 清除 TTML 绑定缓存，便于模式切换后强制重新注入 */
export function resetAmLyricsBinding() {
  boundTrackKey = "";
  boundTtml = "";
}

function disconnectLyricsReadyObserver() {
  lyricsReadyObserver?.disconnect();
  lyricsReadyObserver = null;
}

/** @param {number} elapsedSec */
function scheduleAmLyricsActivation(elapsedSec) {
  if (!amEl) return;
  if (activationTimerId != null) {
    clearTimeout(activationTimerId);
    activationTimerId = null;
  }
  const ms = Math.max(0, elapsedSec) * 1000 + LYRICS_LEAD_MS;
  const apply = () => {
    if (!amEl?.isConnected) return;
    amEl.currentTime = ms;
  };
  apply();
  requestAnimationFrame(apply);
  requestAnimationFrame(() => requestAnimationFrame(apply));
  setTimeout(apply, 80);
  setTimeout(apply, 220);
  setTimeout(apply, 500);
  activationTimerId = window.setTimeout(apply, 900);
}

/** 等 Shadow DOM 出现歌词行后再激活，避免模式切换后 currentTime 早于渲染 */
/** @param {number} elapsedSec */
function watchAmLyricsReady(elapsedSec) {
  disconnectLyricsReadyObserver();
  scheduleAmLyricsActivation(elapsedSec);
  const sr = amEl?.shadowRoot;
  if (!sr) return;

  const activateIfReady = () => {
    if (!amEl?.isConnected) return false;
    const hasLines = sr.querySelector(".lyrics-line");
    if (!hasLines) return false;
    scheduleAmLyricsActivation(elapsedSec);
    disconnectLyricsReadyObserver();
    return true;
  };

  if (activateIfReady()) return;

  lyricsReadyObserver = new MutationObserver(() => {
    activateIfReady();
  });
  lyricsReadyObserver.observe(sr, { childList: true, subtree: true });
}

/** 隐藏 am-lyrics 底部来源 / GitHub 推广信息（Shadow DOM 内） */
function suppressAmLyricsFooter() {
  const inject = () => {
    const sr = amEl?.shadowRoot;
    if (!sr || sr.querySelector("#wd-hide-footer")) return;
    const style = document.createElement("style");
    style.id = "wd-hide-footer";
    style.textContent = ".lyrics-footer { display: none !important; }";
    sr.appendChild(style);
  };
  inject();
  requestAnimationFrame(inject);
  setTimeout(inject, 120);
  setTimeout(inject, 600);
}

function detachAmElFromDom() {
  disconnectLyricsReadyObserver();
  if (amEl?.isConnected) {
    amEl.remove();
  }
}

/**
 * 在独立歌词窗根节点挂载 am-lyrics 容器（组件延后到有真实 TTML 再插入 DOM）。
 * @param {HTMLElement} root
 */
export function mountAmLyricsPanel(root) {
  if (!root || amEl) return amEl;

  hostEl = root;
  hostEl.classList.add("uses-am-lyrics");

  statusEl = document.createElement("div");
  statusEl.className = "am-lyrics-status";
  statusEl.hidden = true;

  mountEl = document.createElement("div");
  mountEl.className = "am-lyrics-mount";

  amEl = document.createElement("am-lyrics");
  amEl.autoscroll = true;
  amEl.interpolate = true;
  amEl.highlightColor = "#edd6ad";

  hostEl.replaceChildren(statusEl, mountEl);
  hostEl.hidden = false;
  hostEl.classList.add("is-visible");
  return amEl;
}

export function unmountAmLyricsPanel() {
  if (activationTimerId != null) {
    clearTimeout(activationTimerId);
    activationTimerId = null;
  }
  detachAmElFromDom();
  amEl = null;
  mountEl = null;
  statusEl = null;
  hostEl = null;
  boundTrackKey = "";
  boundTtml = "";
}

export function isAmLyricsMounted() {
  return Boolean(amEl);
}

/**
 * 模式切回 Apple Music 滚动时强制重载当前歌词。
 * @param {Parameters<typeof renderAmLyricsPanel>[0]} state
 * @param {number} elapsedSec
 * @param {number | null | undefined} durationSec
 * @param {{ title?: string, artist?: string }} [meta]
 */
export function refreshAmLyricsPanel(state, elapsedSec, durationSec, meta = {}) {
  resetAmLyricsBinding();
  detachAmElFromDom();
  renderAmLyricsPanel(state, elapsedSec, durationSec, meta);
}

/** @param {typeof import('./lyricsSettingsSchema.js').DEFAULT_LYRICS_WINDOW_CONFIG} cfg */
export function applyAmLyricsStyle(cfg) {
  if (!amEl || !cfg) return;
  const highlight = cfg.amHighlightColor || cfg.currentColor;
  if (highlight) {
    amEl.highlightColor = highlight;
    hostEl?.style.setProperty("--lyrics-am-highlight-color", highlight);
    mountEl?.style.setProperty("--lyrics-am-highlight-color", highlight);
    amEl.style.setProperty("--am-lyrics-highlight-color", highlight);
    amEl.style.setProperty("--highlight-color", highlight);
  }
  if (cfg.fontFamily) {
    amEl.fontFamily = cfg.fontFamily;
  }
  amEl.autoscroll = cfg.amAutoscroll !== false;
  amEl.interpolate = cfg.amInterpolate !== false;
  const fontSize = cfg.amFontSizePx || 32;
  hostEl?.style.setProperty("--lyrics-am-font-size", `${fontSize}px`);
  mountEl?.style.setProperty("--lyplus-font-size-base", `${fontSize}px`);
  amEl.style.setProperty("--lyplus-font-size-base", `${fontSize}px`);
  if (amEl.isConnected) suppressAmLyricsFooter();
}

/**
 * @param {string} message
 * @param {boolean} [visible]
 */
function setStatusMessage(message, visible = true) {
  if (!statusEl) return;
  if (!visible || !message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    if (mountEl) mountEl.hidden = false;
    return;
  }
  statusEl.textContent = message;
  statusEl.hidden = false;
  if (mountEl) mountEl.hidden = true;
}

/**
 * @param {string} ttml
 * @param {string} trackKey
 * @param {number} elapsedSec
 * @param {{ force?: boolean }} [options]
 */
function applyTtml(ttml, trackKey, elapsedSec, options = {}) {
  if (!amEl || !ttml || !mountEl) return;
  const force = Boolean(options.force);
  if (!force && trackKey === boundTrackKey && ttml === boundTtml) {
    watchAmLyricsReady(elapsedSec);
    return;
  }

  boundTrackKey = trackKey;
  boundTtml = ttml;
  detachAmElFromDom();

  amEl.ttml = ttml;
  mountEl.appendChild(amEl);
  suppressAmLyricsFooter();
  watchAmLyricsReady(elapsedSec);
}

function clearLyrics() {
  resetAmLyricsBinding();
  detachAmElFromDom();
}

/**
 * @param {{
 *   trackKey: string,
 *   status: string,
 *   lines: { timeMs: number, text: string }[],
 *   plainLyrics: string,
 *   instrumental: boolean,
 *   lyricsSource: string,
 * }} state
 * @param {number} elapsedSec
 * @param {number | null | undefined} durationSec
 * @param {{ title?: string, artist?: string }} [meta]
 */
export function renderAmLyricsPanel(state, elapsedSec, durationSec, meta = {}) {
  if (!amEl) return;

  const durationMs =
    typeof durationSec === "number" && durationSec > 0 ? durationSec * 1000 : null;

  if (state.status === "idle") {
    clearLyrics();
    setStatusMessage("未检测到正在播放");
    return;
  }

  if (state.status === "loading") {
    clearLyrics();
    const title = meta.title || "未知曲目";
    const artist = meta.artist || "";
    setStatusMessage(artist ? `${title}\n${artist}` : title);
    return;
  }

  if (state.status === "miss") {
    clearLyrics();
    const title = meta.title || "未知曲目";
    const artist = meta.artist || "";
    setStatusMessage(artist ? `${title}\n${artist}` : title);
    return;
  }

  if (state.instrumental) {
    clearLyrics();
    setStatusMessage("纯音乐");
    return;
  }

  let ttml = "";
  if (state.lines.length > 0) {
    ttml = linesToTtml(state.lines, durationMs);
  } else if (state.plainLyrics) {
    ttml = plainLyricsToTtml(state.plainLyrics, durationMs);
  }

  if (!ttml) {
    clearLyrics();
    setStatusMessage("");
    if (hostEl) hostEl.classList.remove("is-visible");
    return;
  }

  setStatusMessage("", false);
  applyTtml(ttml, state.trackKey, elapsedSec);
  if (hostEl) {
    hostEl.hidden = false;
    hostEl.classList.add("is-visible");
    hostEl.classList.remove("is-loading", "is-idle");
    if (state.lyricsSource) {
      hostEl.title = `歌词来源：${state.lyricsSource}`;
    } else {
      hostEl.removeAttribute("title");
    }
  }
}

/** @param {number} elapsedSec */
function setAmLyricsCurrentTime(elapsedSec) {
  if (!amEl?.isConnected) return;
  amEl.currentTime = Math.max(0, elapsedSec) * 1000 + LYRICS_LEAD_MS;
}

/** @param {number} elapsedSec */
export function syncAmLyricsTime(elapsedSec) {
  if (!amEl?.isConnected || mountEl?.hidden) return;
  setAmLyricsCurrentTime(elapsedSec);
}
