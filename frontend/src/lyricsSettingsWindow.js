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
  isMineradioRenderer,
  normalizeHexColor,
  normalizeLyricsWindowConfig,
  readLyricsWindowConfig,
  writeLyricsWindowConfig,
} from "./lyricsSettingsSchema.js";

const lyricsTargetBanner = document.querySelector("#lyricsTargetBanner");
const closeLyricsSettingsBtn = document.querySelector("#closeLyricsSettingsBtn");
const classicOptions = document.querySelector("#lyricsClassicOptions");
const amScrollOptions = document.querySelector("#lyricsAmScrollOptions");
const mineradioOptions = document.querySelector("#lyricsMineradioOptions");
const rendererClassic = document.querySelector("#lyricsRendererClassic");
const rendererAmScroll = document.querySelector("#lyricsRendererAmScroll");
const rendererMineradio = document.querySelector("#lyricsRendererMineradio");
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
const textShadow = document.querySelector("#lyricsTextShadow");
const textShadowVal = document.querySelector("#lyricsTextShadowVal");
const currentTextStrokeWidth = document.querySelector("#lyricsCurrentTextStrokeWidth");
const currentTextStrokeWidthVal = document.querySelector("#lyricsCurrentTextStrokeWidthVal");
const currentTextStrokeColor = document.querySelector("#lyricsCurrentTextStrokeColor");
const nextTextStrokeWidth = document.querySelector("#lyricsNextTextStrokeWidth");
const nextTextStrokeWidthVal = document.querySelector("#lyricsNextTextStrokeWidthVal");
const nextTextStrokeColor = document.querySelector("#lyricsNextTextStrokeColor");
const transitionEffect = document.querySelector("#lyricsTransitionEffect");
const amHighlightColor = document.querySelector("#lyricsAmHighlightColor");
const amTextPrimaryColor = document.querySelector("#lyricsAmTextPrimaryColor");
const amTextSecondaryColor = document.querySelector("#lyricsAmTextSecondaryColor");
const amFontPreset = document.querySelector("#lyricsAmFontPreset");
const amActiveFontSize = document.querySelector("#lyricsAmActiveFontSize");
const amActiveFontSizeVal = document.querySelector("#lyricsAmActiveFontSizeVal");
const amInactiveFontSize = document.querySelector("#lyricsAmInactiveFontSize");
const amInactiveFontSizeVal = document.querySelector("#lyricsAmInactiveFontSizeVal");
const amBlur = document.querySelector("#lyricsAmBlur");
const amBlurVal = document.querySelector("#lyricsAmBlurVal");
const amBlurNear = document.querySelector("#lyricsAmBlurNear");
const amBlurNearVal = document.querySelector("#lyricsAmBlurNearVal");
const amAutoscroll = document.querySelector("#lyricsAmAutoscroll");
const amInterpolate = document.querySelector("#lyricsAmInterpolate");
const mrFontPreset = document.querySelector("#lyricsMrFontPreset");
const mrFontSize = document.querySelector("#lyricsMrFontSize");
const mrFontSizeVal = document.querySelector("#lyricsMrFontSizeVal");
const mrPrimaryColor = document.querySelector("#lyricsMrPrimaryColor");
const mrHighlightColor = document.querySelector("#lyricsMrHighlightColor");
const mrGlowColor = document.querySelector("#lyricsMrGlowColor");
const mrHighlightFollow = document.querySelector("#lyricsMrHighlightFollow");
const mrCinemaMotion = document.querySelector("#lyricsMrCinemaMotion");
const mrBeatGlow = document.querySelector("#lyricsMrBeatGlow");
const mrBeatGlowStrength = document.querySelector("#lyricsMrBeatGlowStrength");
const mrBeatGlowStrengthVal = document.querySelector("#lyricsMrBeatGlowStrengthVal");

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
  const mr = isMineradioRenderer(config);
  classicOptions?.toggleAttribute("hidden", am || mr);
  amScrollOptions?.toggleAttribute("hidden", !am);
  mineradioOptions?.toggleAttribute("hidden", !mr);
}

function syncFormFromConfig() {
  if (rendererClassic) rendererClassic.checked = config.renderer === LYRICS_RENDERER.classic;
  if (rendererAmScroll) rendererAmScroll.checked = config.renderer === LYRICS_RENDERER.amScroll;
  if (rendererMineradio) rendererMineradio.checked = config.renderer === LYRICS_RENDERER.mineradio;
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
  if (textShadow) textShadow.value = String(config.textShadowPercent);
  if (textShadowVal) textShadowVal.textContent = String(config.textShadowPercent);
  if (currentTextStrokeWidth) currentTextStrokeWidth.value = String(config.currentTextStrokeWidthPx);
  if (currentTextStrokeWidthVal) {
    currentTextStrokeWidthVal.textContent = String(config.currentTextStrokeWidthPx);
  }
  if (currentTextStrokeColor) currentTextStrokeColor.value = config.currentTextStrokeColor;
  if (currentTextStrokeColor) {
    currentTextStrokeColor.disabled = config.currentTextStrokeWidthPx <= 0;
  }
  if (nextTextStrokeWidth) nextTextStrokeWidth.value = String(config.nextTextStrokeWidthPx);
  if (nextTextStrokeWidthVal) nextTextStrokeWidthVal.textContent = String(config.nextTextStrokeWidthPx);
  if (nextTextStrokeColor) nextTextStrokeColor.value = config.nextTextStrokeColor;
  if (nextTextStrokeColor) nextTextStrokeColor.disabled = config.nextTextStrokeWidthPx <= 0;
  if (transitionEffect) transitionEffect.value = config.transitionEffect;

  if (amHighlightColor) amHighlightColor.value = config.amHighlightColor;
  if (amTextPrimaryColor) amTextPrimaryColor.value = config.amTextPrimaryColor;
  if (amTextSecondaryColor) amTextSecondaryColor.value = config.amTextSecondaryColor;
  if (amFontPreset) amFontPreset.value = config.fontPresetId;
  if (amActiveFontSize) amActiveFontSize.value = String(config.amActiveFontSizePx);
  if (amActiveFontSizeVal) amActiveFontSizeVal.textContent = String(config.amActiveFontSizePx);
  if (amInactiveFontSize) amInactiveFontSize.value = String(config.amInactiveFontSizePx);
  if (amInactiveFontSizeVal) {
    amInactiveFontSizeVal.textContent = String(config.amInactiveFontSizePx);
  }
  if (amBlur) amBlur.value = String(config.amBlurAmountEm);
  if (amBlurVal) amBlurVal.textContent = String(config.amBlurAmountEm);
  if (amBlurNear) amBlurNear.value = String(config.amBlurAmountNearEm);
  if (amBlurNearVal) amBlurNearVal.textContent = String(config.amBlurAmountNearEm);
  if (amAutoscroll) amAutoscroll.checked = config.amAutoscroll;
  if (amInterpolate) amInterpolate.checked = config.amInterpolate;

  if (mrFontPreset) mrFontPreset.value = config.fontPresetId;
  if (mrFontSize) mrFontSize.value = String(config.mrFontSizePx);
  if (mrFontSizeVal) mrFontSizeVal.textContent = String(config.mrFontSizePx);
  if (mrPrimaryColor) mrPrimaryColor.value = config.mrPrimaryColor;
  if (mrHighlightColor) mrHighlightColor.value = config.mrHighlightColor;
  if (mrGlowColor) mrGlowColor.value = config.mrGlowColor;
  if (mrHighlightFollow) mrHighlightFollow.checked = config.mrHighlightFollow;
  if (mrCinemaMotion) mrCinemaMotion.checked = config.mrCinemaMotion;
  if (mrBeatGlow) mrBeatGlow.checked = config.mrBeatGlow;
  if (mrBeatGlowStrength) mrBeatGlowStrength.value = String(config.mrBeatGlowStrength);
  if (mrBeatGlowStrengthVal) mrBeatGlowStrengthVal.textContent = String(config.mrBeatGlowStrength);
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
    config.renderer = rendererMineradio?.checked
      ? LYRICS_RENDERER.mineradio
      : rendererAmScroll?.checked
        ? LYRICS_RENDERER.amScroll
        : LYRICS_RENDERER.classic;
    syncModeSections();
    await persistAndNotify();
  };
  rendererClassic?.addEventListener("change", onRendererChange);
  rendererAmScroll?.addEventListener("change", onRendererChange);
  rendererMineradio?.addEventListener("change", onRendererChange);

  if (amHighlightColor) {
    amHighlightColor.addEventListener("input", async () => {
      config.amHighlightColor = normalizeHexColor(amHighlightColor.value, config.amHighlightColor);
      await persistAndNotify();
    });
  }

  if (amTextPrimaryColor) {
    amTextPrimaryColor.addEventListener("input", async () => {
      config.amTextPrimaryColor = normalizeHexColor(
        amTextPrimaryColor.value,
        config.amTextPrimaryColor,
      );
      await persistAndNotify();
    });
  }

  if (amTextSecondaryColor) {
    amTextSecondaryColor.addEventListener("input", async () => {
      config.amTextSecondaryColor = normalizeHexColor(
        amTextSecondaryColor.value,
        config.amTextSecondaryColor,
      );
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

  if (amActiveFontSize) {
    amActiveFontSize.addEventListener("input", async () => {
      config.amActiveFontSizePx = Number(amActiveFontSize.value);
      if (amActiveFontSizeVal) {
        amActiveFontSizeVal.textContent = String(config.amActiveFontSizePx);
      }
      await persistAndNotify();
    });
  }

  if (amInactiveFontSize) {
    amInactiveFontSize.addEventListener("input", async () => {
      config.amInactiveFontSizePx = Number(amInactiveFontSize.value);
      if (amInactiveFontSizeVal) {
        amInactiveFontSizeVal.textContent = String(config.amInactiveFontSizePx);
      }
      await persistAndNotify();
    });
  }

  if (amBlur) {
    amBlur.addEventListener("input", async () => {
      config.amBlurAmountEm = Number(amBlur.value);
      if (amBlurVal) amBlurVal.textContent = String(config.amBlurAmountEm);
      await persistAndNotify();
    });
  }

  if (amBlurNear) {
    amBlurNear.addEventListener("input", async () => {
      config.amBlurAmountNearEm = Number(amBlurNear.value);
      if (amBlurNearVal) amBlurNearVal.textContent = String(config.amBlurAmountNearEm);
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

  if (mrFontPreset) {
    mrFontPreset.addEventListener("change", async () => {
      const preset = LYRICS_FONT_PRESETS.find((p) => p.id === mrFontPreset.value);
      config.fontPresetId = preset?.id ?? DEFAULT_LYRICS_WINDOW_CONFIG.fontPresetId;
      config.fontFamily = preset?.value ?? DEFAULT_LYRICS_WINDOW_CONFIG.fontFamily;
      await persistAndNotify();
    });
  }

  if (mrFontSize) {
    mrFontSize.addEventListener("input", async () => {
      config.mrFontSizePx = Number(mrFontSize.value);
      if (mrFontSizeVal) mrFontSizeVal.textContent = String(config.mrFontSizePx);
      await persistAndNotify();
    });
  }

  if (mrPrimaryColor) {
    mrPrimaryColor.addEventListener("input", async () => {
      config.mrPrimaryColor = normalizeHexColor(mrPrimaryColor.value, config.mrPrimaryColor);
      await persistAndNotify();
    });
  }

  if (mrHighlightColor) {
    mrHighlightColor.addEventListener("input", async () => {
      config.mrHighlightColor = normalizeHexColor(mrHighlightColor.value, config.mrHighlightColor);
      await persistAndNotify();
    });
  }

  if (mrGlowColor) {
    mrGlowColor.addEventListener("input", async () => {
      config.mrGlowColor = normalizeHexColor(mrGlowColor.value, config.mrGlowColor);
      await persistAndNotify();
    });
  }

  if (mrHighlightFollow) {
    mrHighlightFollow.addEventListener("change", async () => {
      config.mrHighlightFollow = mrHighlightFollow.checked;
      await persistAndNotify();
    });
  }

  if (mrCinemaMotion) {
    mrCinemaMotion.addEventListener("change", async () => {
      config.mrCinemaMotion = mrCinemaMotion.checked;
      await persistAndNotify();
    });
  }

  if (mrBeatGlow) {
    mrBeatGlow.addEventListener("change", async () => {
      config.mrBeatGlow = mrBeatGlow.checked;
      await persistAndNotify();
    });
  }

  if (mrBeatGlowStrength) {
    mrBeatGlowStrength.addEventListener("input", async () => {
      config.mrBeatGlowStrength = Number(mrBeatGlowStrength.value);
      if (mrBeatGlowStrengthVal) {
        mrBeatGlowStrengthVal.textContent = String(config.mrBeatGlowStrength);
      }
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

  if (textShadow) {
    textShadow.addEventListener("input", async () => {
      config.textShadowPercent = Number(textShadow.value);
      if (textShadowVal) textShadowVal.textContent = String(config.textShadowPercent);
      await persistAndNotify();
    });
  }

  if (currentTextStrokeWidth) {
    currentTextStrokeWidth.addEventListener("input", async () => {
      config.currentTextStrokeWidthPx = Number(currentTextStrokeWidth.value);
      if (currentTextStrokeWidthVal) {
        currentTextStrokeWidthVal.textContent = String(config.currentTextStrokeWidthPx);
      }
      if (currentTextStrokeColor) {
        currentTextStrokeColor.disabled = config.currentTextStrokeWidthPx <= 0;
      }
      await persistAndNotify();
    });
  }

  if (currentTextStrokeColor) {
    currentTextStrokeColor.addEventListener("input", async () => {
      config.currentTextStrokeColor = normalizeHexColor(
        currentTextStrokeColor.value,
        config.currentTextStrokeColor,
      );
      await persistAndNotify();
    });
  }

  if (nextTextStrokeWidth) {
    nextTextStrokeWidth.addEventListener("input", async () => {
      config.nextTextStrokeWidthPx = Number(nextTextStrokeWidth.value);
      if (nextTextStrokeWidthVal) {
        nextTextStrokeWidthVal.textContent = String(config.nextTextStrokeWidthPx);
      }
      if (nextTextStrokeColor) nextTextStrokeColor.disabled = config.nextTextStrokeWidthPx <= 0;
      await persistAndNotify();
    });
  }

  if (nextTextStrokeColor) {
    nextTextStrokeColor.addEventListener("input", async () => {
      config.nextTextStrokeColor = normalizeHexColor(
        nextTextStrokeColor.value,
        config.nextTextStrokeColor,
      );
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
