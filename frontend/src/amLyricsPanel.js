import "@uimaxbai/am-lyrics/am-lyrics.js";
import { linesToTtml, plainLyricsToTtml } from "./lrcToTtml.js";

const LYRICS_LEAD_MS = 320;

/** @type {HTMLElement | null} */
let hostEl = null;
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

/** 隐藏 am-lyrics 顶部/底部推广区，并注入字号缓动与边缘淡出样式 */
/** @type {{ activePx: number, inactivePx: number, activeScale: number }} */
let lastAmFontSizes = { activePx: 32, inactivePx: 26, activeScale: 32 / 26 };

/** @param {{ activePx?: number, inactivePx?: number }} [sizes] */
function injectAmLyricsShadowOverrides(sizes = lastAmFontSizes) {
  const activePx = sizes.activePx ?? lastAmFontSizes.activePx;
  const inactivePx = sizes.inactivePx ?? lastAmFontSizes.inactivePx;
  const activeScale = inactivePx > 0 ? activePx / inactivePx : 1;
  lastAmFontSizes = { activePx, inactivePx, activeScale };
  const css = `
    .lyrics-header,
    .lyrics-footer { display: none !important; }

    /* 上下边缘：透明 → 不透明，避免硬裁切半行 */
    .lyrics-container {
      -webkit-mask-image: linear-gradient(
        to bottom,
        transparent 0,
        #000 var(--wd-lyrics-fade-top, 80px),
        #000 calc(100% - var(--wd-lyrics-fade-bottom, 80px)),
        transparent 100%
      );
      mask-image: linear-gradient(
        to bottom,
        transparent 0,
        #000 var(--wd-lyrics-fade-top, 80px),
        #000 calc(100% - var(--wd-lyrics-fade-bottom, 80px)),
        transparent 100%
      );
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      pointer-events: none !important;
      user-select: none !important;
      -webkit-user-select: none !important;
    }

    .lyrics-line,
    .lyrics-line-container,
    .lyrics-syllable,
    .lyrics-char,
    .lyrics-syllable.transliteration,
    .lyrics-translation-container,
    .lyrics-romanization-container {
      pointer-events: none !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      cursor: default !important;
    }

    @keyframes wd-am-scale-up {
      from { transform: scale(1) translateZ(0); }
      to { transform: scale(var(--wd-am-active-scale, ${activeScale})) translateZ(0); }
    }
    @keyframes wd-am-scale-down {
      from { transform: scale(var(--wd-am-active-scale, ${activeScale})) translateZ(0); }
      to { transform: scale(1) translateZ(0); }
    }

    .lyrics-line .lyrics-line-container {
      transform: scale(1) translateZ(0);
      transform-origin: left center;
      transition:
        transform var(--scroll-duration, 450ms) cubic-bezier(0.41, 0, 0.12, 0.99)
          var(--lyrics-line-delay, 0ms),
        background-color 0.18s,
        color 0.18s !important;
    }

    /* 滚动批次内不用 transition，改由 keyframes 与 scroll 同步 */
    .lyrics-line.scroll-animate .lyrics-line-container {
      transition: background-color 0.18s, color 0.18s !important;
    }

    /* 稳定播放中 */
    .lyrics-line.active:not(.scroll-animate) .lyrics-line-container {
      transform: scale(var(--wd-am-active-scale, ${activeScale})) translateZ(0) !important;
    }

    /* 滚动中：当前播放行保持大图（上一行 post-active 除外，见下方缩小规则） */
    .lyrics-line.active.scroll-animate:not(.post-active-line) .lyrics-line-container {
      transform: scale(var(--wd-am-active-scale, ${activeScale})) translateZ(0) !important;
      animation: none !important;
    }

    /* 预备行：与上一行缩小同时放大（不用 scroll 错峰 delay） */
    .lyrics-line.pre-active.scroll-animate .lyrics-line-container {
      animation: wd-am-scale-up var(--scroll-duration, 450ms)
        cubic-bezier(0.41, 0, 0.12, 0.99) 0ms both !important;
    }

    /* 上一行：predictive scroll 时可能仍为 .active，须同步缩小，不可等失去 active */
    .lyrics-line.post-active-line.scroll-animate:not(.pre-active) .lyrics-line-container {
      animation: wd-am-scale-down var(--scroll-duration, 450ms)
        cubic-bezier(0.41, 0, 0.12, 0.99) 0ms forwards !important;
    }

    /* 非播放行：滚动结束后保持小字（post-active-line 会残留，不可再锁大图） */
    .lyrics-line:not(.active):not(.pre-active):not(.scroll-animate) .lyrics-line-container {
      transform: scale(1) translateZ(0) !important;
      animation: none !important;
    }

    .lyrics-container.user-scrolling .lyrics-line .lyrics-line-container,
    .lyrics-container.touch-scrolling .lyrics-line .lyrics-line-container {
      transition: none !important;
      animation: none !important;
    }
  `;
  const inject = () => {
    const sr = amEl?.shadowRoot;
    if (!sr) return;
    let style = sr.querySelector("#wd-panel-overrides");
    if (!style) {
      style = document.createElement("style");
      style.id = "wd-panel-overrides";
      sr.appendChild(style);
    }
    style.textContent = css;
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

  mountEl = document.createElement("div");
  mountEl.className = "am-lyrics-mount";

  amEl = document.createElement("am-lyrics");
  amEl.autoscroll = true;
  amEl.interpolate = true;
  amEl.highlightColor = "#edd6ad";

  hostEl.replaceChildren(mountEl);
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
  const activePx = cfg.amActiveFontSizePx ?? cfg.amFontSizePx ?? 32;
  const inactivePx = cfg.amInactiveFontSizePx ?? Math.max(12, activePx - 6);
  const activeScale = inactivePx > 0 ? activePx / inactivePx : 1;
  const textPrimary = cfg.amTextPrimaryColor || highlight;
  const textSecondary = cfg.amTextSecondaryColor || cfg.nextColor || "#c4a574";
  const blurNear =
    typeof cfg.amBlurAmountNearEm === "number" ? cfg.amBlurAmountNearEm : 0.035;
  const blur = typeof cfg.amBlurAmountEm === "number" ? cfg.amBlurAmountEm : 0.07;
  const lyplusVars = {
    "--lyrics-am-active-font-size": `${activePx}px`,
    "--lyrics-am-inactive-font-size": `${inactivePx}px`,
    "--wd-am-active-scale": String(activeScale),
    "--lyplus-font-size-base": `${inactivePx}px`,
    "--lyplus-text-primary": textPrimary,
    "--lyplus-text-secondary": textSecondary,
    "--lyplus-blur-amount": `${blur}em`,
    "--lyplus-blur-amount-near": `${blurNear}em`,
    "--wd-lyrics-fade-top": "80px",
    "--wd-lyrics-fade-bottom": "80px",
  };
  for (const el of [hostEl, mountEl, amEl]) {
    if (!el) continue;
    for (const [name, value] of Object.entries(lyplusVars)) {
      el.style.setProperty(name, value);
    }
  }
  if (amEl.isConnected) injectAmLyricsShadowOverrides({ activePx, inactivePx });
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
  injectAmLyricsShadowOverrides();
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
    if (hostEl) hostEl.classList.remove("is-visible");
    return;
  }

  if (state.status === "loading") {
    clearLyrics();
    if (hostEl) {
      hostEl.classList.add("is-loading");
      hostEl.classList.remove("is-visible");
    }
    return;
  }

  if (state.status === "miss") {
    clearLyrics();
    if (hostEl) hostEl.classList.remove("is-visible");
    return;
  }

  if (state.instrumental) {
    clearLyrics();
    if (hostEl) hostEl.classList.remove("is-visible");
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
    if (hostEl) hostEl.classList.remove("is-visible");
    return;
  }

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
  if (!amEl?.isConnected) return;
  setAmLyricsCurrentTime(elapsedSec);
}
