import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  DEFAULT_LYRICS_WINDOW_CONFIG,
  LYRICS_ALIGN_H,
  LYRICS_ALIGN_V,
  LYRICS_FONT_PRESETS,
  LYRICS_LAYOUT,
  LYRICS_RENDERER,
  LYRICS_TRANSITION_OPTIONS,
  buildLyricsStyleEventPayload,
  isAmScrollRenderer,
  normalizeHexColor,
  normalizeLyricsWindowConfig,
  readLyricsWindowConfig,
  writeLyricsWindowConfig,
} from "./lyricsSettingsSchema.js";

const lyricsTargetBanner = document.querySelector("#lyricsTargetBanner");
const closeLyricsSettingsBtn = document.querySelector("#closeLyricsSettingsBtn");
const classicOptions = document.querySelector("#lyricsClassicOptions");
const amScrollOptions = document.querySelector("#lyricsAmScrollOptions");
const rendererClassic = document.querySelector("#lyricsRendererClassic");
const rendererAmScroll = document.querySelector("#lyricsRendererAmScroll");
const fontPreset = document.querySelector("#lyricsFontPreset");
const currentSize = document.querySelector("#lyricsCurrentSize");
const currentSizeVal = document.querySelector("#lyricsCurrentSizeVal");
const currentColor = document.querySelector("#lyricsCurrentColor");
const nextSize = document.querySelector("#lyricsNextSize");
const nextSizeVal = document.querySelector("#lyricsNextSizeVal");
const nextColor = document.querySelector("#lyricsNextColor");
const alignHorizontal = document.querySelector("#lyricsAlignHorizontal");
const alignVertical = document.querySelector("#lyricsAlignVertical");
const layoutHorizontal = document.querySelector("#lyricsLayoutHorizontal");
const layoutVertical = document.querySelector("#lyricsLayoutVertical");
const lineHeight = document.querySelector("#lyricsLineHeight");
const lineHeightVal = document.querySelector("#lyricsLineHeightVal");
const blockGap = document.querySelector("#lyricsBlockGap");
const blockGapVal = document.querySelector("#lyricsBlockGapVal");
const transitionEffect = document.querySelector("#lyricsTransitionEffect");
const amHighlightColor = document.querySelector("#lyricsAmHighlightColor");
const amFontPreset = document.querySelector("#lyricsAmFontPreset");
const amFontSize = document.querySelector("#lyricsAmFontSize");
const amFontSizeVal = document.querySelector("#lyricsAmFontSizeVal");
const amAutoscroll = document.querySelector("#lyricsAmAutoscroll");
const amInterpolate = document.querySelector("#lyricsAmInterpolate");

let lyricsTargetLabel = "";
/** @type {import("./lyricsSettingsSchema.js").LyricsWindowConfig} */
let config = { ...DEFAULT_LYRICS_WINDOW_CONFIG };

function updateTargetBanner() {
  if (!lyricsTargetBanner) return;
  lyricsTargetBanner.textContent = lyricsTargetLabel
    ? `当前配置对象：${lyricsTargetLabel}`
    : "";
  lyricsTargetBanner.hidden = !lyricsTargetLabel;
}

function syncModeSections() {
  const am = isAmScrollRenderer(config);
  classicOptions?.toggleAttribute("hidden", am);
  amScrollOptions?.toggleAttribute("hidden", !am);
}

function syncFormFromConfig() {
  if (rendererClassic) rendererClassic.checked = config.renderer === LYRICS_RENDERER.classic;
  if (rendererAmScroll) rendererAmScroll.checked = config.renderer === LYRICS_RENDERER.amScroll;
  syncModeSections();

  if (fontPreset) fontPreset.value = config.fontPresetId;
  if (currentSize) currentSize.value = String(config.currentFontSizePx);
  if (currentSizeVal) currentSizeVal.textContent = String(config.currentFontSizePx);
  if (currentColor) currentColor.value = config.currentColor;
  if (nextSize) nextSize.value = String(config.nextFontSizePx);
  if (nextSizeVal) nextSizeVal.textContent = String(config.nextFontSizePx);
  if (nextColor) nextColor.value = config.nextColor;
  if (alignHorizontal) alignHorizontal.value = config.alignHorizontal;
  if (alignVertical) alignVertical.value = config.alignVertical;
  if (layoutHorizontal) layoutHorizontal.checked = config.layout === LYRICS_LAYOUT.horizontal;
  if (layoutVertical) layoutVertical.checked = config.layout === LYRICS_LAYOUT.vertical;
  if (lineHeight) lineHeight.value = String(config.lineHeightPercent);
  if (lineHeightVal) lineHeightVal.textContent = String(config.lineHeightPercent);
  if (blockGap) blockGap.value = String(config.blockGapPx);
  if (blockGapVal) blockGapVal.textContent = String(config.blockGapPx);
  if (transitionEffect) transitionEffect.value = config.transitionEffect;

  if (amHighlightColor) amHighlightColor.value = config.amHighlightColor;
  if (amFontPreset) amFontPreset.value = config.fontPresetId;
  if (amFontSize) amFontSize.value = String(config.amFontSizePx);
  if (amFontSizeVal) amFontSizeVal.textContent = String(config.amFontSizePx);
  if (amAutoscroll) amAutoscroll.checked = config.amAutoscroll;
  if (amInterpolate) amInterpolate.checked = config.amInterpolate;
}

async function persistAndNotify() {
  if (!lyricsTargetLabel) return;
  config = normalizeLyricsWindowConfig(config);
  writeLyricsWindowConfig(window.localStorage, lyricsTargetLabel, config);
  try {
    await emitTo(
      lyricsTargetLabel,
      "lyrics-window-style",
      buildLyricsStyleEventPayload(lyricsTargetLabel, config),
    );
  } catch (err) {
    console.warn("emit lyrics-window-style failed:", err);
  }
}

function loadTargetConfig() {
  if (!lyricsTargetLabel) {
    config = { ...DEFAULT_LYRICS_WINDOW_CONFIG };
    syncFormFromConfig();
    return;
  }
  config = readLyricsWindowConfig(window.localStorage, lyricsTargetLabel);
  syncFormFromConfig();
}

async function setLyricsTarget(label) {
  lyricsTargetLabel = String(label ?? "").trim();
  updateTargetBanner();
  loadTargetConfig();
}

async function init() {
  try {
    await setLyricsTarget(await invoke("get_lyrics_settings_target"));
  } catch {
    await setLyricsTarget("");
  }

  await listen("lyrics-settings-target", (event) => {
    setLyricsTarget(event.payload);
  });

  const onRendererChange = async () => {
    config.renderer = rendererAmScroll?.checked
      ? LYRICS_RENDERER.amScroll
      : LYRICS_RENDERER.classic;
    syncModeSections();
    await persistAndNotify();
  };
  rendererClassic?.addEventListener("change", onRendererChange);
  rendererAmScroll?.addEventListener("change", onRendererChange);

  if (amHighlightColor) {
    amHighlightColor.addEventListener("input", async () => {
      config.amHighlightColor = normalizeHexColor(amHighlightColor.value, config.amHighlightColor);
      await persistAndNotify();
    });
  }

  if (amFontPreset) {
    amFontPreset.addEventListener("change", async () => {
      const preset = LYRICS_FONT_PRESETS.find((p) => p.id === amFontPreset.value);
      config.fontPresetId = preset?.id ?? DEFAULT_LYRICS_WINDOW_CONFIG.fontPresetId;
      config.fontFamily = preset?.value ?? DEFAULT_LYRICS_WINDOW_CONFIG.fontFamily;
      await persistAndNotify();
    });
  }

  if (amFontSize) {
    amFontSize.addEventListener("input", async () => {
      config.amFontSizePx = Number(amFontSize.value);
      if (amFontSizeVal) amFontSizeVal.textContent = String(config.amFontSizePx);
      await persistAndNotify();
    });
  }

  if (amAutoscroll) {
    amAutoscroll.addEventListener("change", async () => {
      config.amAutoscroll = amAutoscroll.checked;
      await persistAndNotify();
    });
  }

  if (amInterpolate) {
    amInterpolate.addEventListener("change", async () => {
      config.amInterpolate = amInterpolate.checked;
      await persistAndNotify();
    });
  }

  if (fontPreset) {
    fontPreset.addEventListener("change", async () => {
      const preset = LYRICS_FONT_PRESETS.find((p) => p.id === fontPreset.value);
      config.fontPresetId = preset?.id ?? DEFAULT_LYRICS_WINDOW_CONFIG.fontPresetId;
      config.fontFamily = preset?.value ?? DEFAULT_LYRICS_WINDOW_CONFIG.fontFamily;
      await persistAndNotify();
    });
  }

  if (currentSize) {
    currentSize.addEventListener("input", async () => {
      config.currentFontSizePx = Number(currentSize.value);
      if (currentSizeVal) currentSizeVal.textContent = String(config.currentFontSizePx);
      await persistAndNotify();
    });
  }

  if (currentColor) {
    currentColor.addEventListener("input", async () => {
      config.currentColor = normalizeHexColor(currentColor.value, config.currentColor);
      await persistAndNotify();
    });
  }

  if (nextSize) {
    nextSize.addEventListener("input", async () => {
      config.nextFontSizePx = Number(nextSize.value);
      if (nextSizeVal) nextSizeVal.textContent = String(config.nextFontSizePx);
      await persistAndNotify();
    });
  }

  if (nextColor) {
    nextColor.addEventListener("input", async () => {
      config.nextColor = normalizeHexColor(nextColor.value, config.nextColor);
      await persistAndNotify();
    });
  }

  if (lineHeight) {
    lineHeight.addEventListener("input", async () => {
      config.lineHeightPercent = Number(lineHeight.value);
      if (lineHeightVal) lineHeightVal.textContent = String(config.lineHeightPercent);
      await persistAndNotify();
    });
  }

  if (blockGap) {
    blockGap.addEventListener("input", async () => {
      config.blockGapPx = Number(blockGap.value);
      if (blockGapVal) blockGapVal.textContent = String(config.blockGapPx);
      await persistAndNotify();
    });
  }

  if (alignHorizontal) {
    alignHorizontal.addEventListener("change", async () => {
      const v = alignHorizontal.value;
      config.alignHorizontal =
        v === LYRICS_ALIGN_H.left || v === LYRICS_ALIGN_H.right ? v : LYRICS_ALIGN_H.center;
      await persistAndNotify();
    });
  }

  if (alignVertical) {
    alignVertical.addEventListener("change", async () => {
      const v = alignVertical.value;
      config.alignVertical =
        v === LYRICS_ALIGN_V.top || v === LYRICS_ALIGN_V.bottom ? v : LYRICS_ALIGN_V.center;
      await persistAndNotify();
    });
  }

  const onLayoutChange = async () => {
    config.layout = layoutVertical?.checked ? LYRICS_LAYOUT.vertical : LYRICS_LAYOUT.horizontal;
    await persistAndNotify();
  };
  layoutHorizontal?.addEventListener("change", onLayoutChange);
  layoutVertical?.addEventListener("change", onLayoutChange);

  if (transitionEffect) {
    transitionEffect.addEventListener("change", async () => {
      const allowed = new Set(LYRICS_TRANSITION_OPTIONS.map((item) => item.id));
      const v = transitionEffect.value;
      config.transitionEffect = allowed.has(v) ? v : DEFAULT_LYRICS_WINDOW_CONFIG.transitionEffect;
      await persistAndNotify();
    });
  }

  if (closeLyricsSettingsBtn) {
    closeLyricsSettingsBtn.addEventListener("click", async () => {
      try {
        await invoke("close_lyrics_settings_window");
      } catch (err) {
        console.error("close_lyrics_settings_window failed:", err);
      }
    });
  }
}

init().catch((err) => {
  console.error("lyrics settings init failed:", err);
});
