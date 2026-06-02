import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  LYRICS_ALIGN_H,
  LYRICS_ALIGN_V,
  LYRICS_FONT_PRESETS,
  LYRICS_LAYOUT,
  normalizeHexColor,
} from "./lyricsSettingsSchema.js";
import {
  DEFAULT_SONGINFO_WINDOW_CONFIG,
  buildSongInfoStyleEventPayload,
  normalizeSongInfoWindowConfig,
  readSongInfoWindowConfig,
  writeSongInfoWindowConfig,
} from "./songInfoSettingsSchema.js";

const songInfoTargetBanner = document.querySelector("#songInfoTargetBanner");
const closeSongInfoSettingsBtn = document.querySelector("#closeSongInfoSettingsBtn");
const fontPreset = document.querySelector("#songInfoFontPreset");
const titleSize = document.querySelector("#songInfoTitleSize");
const titleSizeVal = document.querySelector("#songInfoTitleSizeVal");
const titleColor = document.querySelector("#songInfoTitleColor");
const artistSize = document.querySelector("#songInfoArtistSize");
const artistSizeVal = document.querySelector("#songInfoArtistSizeVal");
const artistColor = document.querySelector("#songInfoArtistColor");
const albumSize = document.querySelector("#songInfoAlbumSize");
const albumSizeVal = document.querySelector("#songInfoAlbumSizeVal");
const albumColor = document.querySelector("#songInfoAlbumColor");
const alignHorizontal = document.querySelector("#songInfoAlignHorizontal");
const alignVertical = document.querySelector("#songInfoAlignVertical");
const layoutHorizontal = document.querySelector("#songInfoLayoutHorizontal");
const layoutVertical = document.querySelector("#songInfoLayoutVertical");
const lineHeight = document.querySelector("#songInfoLineHeight");
const lineHeightVal = document.querySelector("#songInfoLineHeightVal");
const blockGap = document.querySelector("#songInfoBlockGap");
const blockGapVal = document.querySelector("#songInfoBlockGapVal");

let songInfoTargetLabel = "";
/** @type {import("./songInfoSettingsSchema.js").SongInfoWindowConfig} */
let config = { ...DEFAULT_SONGINFO_WINDOW_CONFIG };

function updateTargetBanner() {
  if (!songInfoTargetBanner) return;
  songInfoTargetBanner.textContent = songInfoTargetLabel
    ? `当前配置对象：${songInfoTargetLabel}`
    : "";
  songInfoTargetBanner.hidden = !songInfoTargetLabel;
}

function syncFormFromConfig() {
  if (fontPreset) fontPreset.value = config.fontPresetId;
  if (titleSize) titleSize.value = String(config.titleFontSizePx);
  if (titleSizeVal) titleSizeVal.textContent = String(config.titleFontSizePx);
  if (titleColor) titleColor.value = config.titleColor;
  if (artistSize) artistSize.value = String(config.artistFontSizePx);
  if (artistSizeVal) artistSizeVal.textContent = String(config.artistFontSizePx);
  if (artistColor) artistColor.value = config.artistColor;
  if (albumSize) albumSize.value = String(config.albumFontSizePx);
  if (albumSizeVal) albumSizeVal.textContent = String(config.albumFontSizePx);
  if (albumColor) albumColor.value = config.albumColor;
  if (alignHorizontal) alignHorizontal.value = config.alignHorizontal;
  if (alignVertical) alignVertical.value = config.alignVertical;
  if (layoutHorizontal) layoutHorizontal.checked = config.layout === LYRICS_LAYOUT.horizontal;
  if (layoutVertical) layoutVertical.checked = config.layout === LYRICS_LAYOUT.vertical;
  if (lineHeight) lineHeight.value = String(config.lineHeightPercent);
  if (lineHeightVal) lineHeightVal.textContent = String(config.lineHeightPercent);
  if (blockGap) blockGap.value = String(config.blockGapPx);
  if (blockGapVal) blockGapVal.textContent = String(config.blockGapPx);
}

async function persistAndNotify() {
  if (!songInfoTargetLabel) return;
  config = normalizeSongInfoWindowConfig(config);
  writeSongInfoWindowConfig(window.localStorage, songInfoTargetLabel, config);
  try {
    await emitTo(
      songInfoTargetLabel,
      "songinfo-window-style",
      buildSongInfoStyleEventPayload(songInfoTargetLabel, config),
    );
  } catch (err) {
    console.warn("emit songinfo-window-style failed:", err);
  }
}

function loadTargetConfig() {
  if (!songInfoTargetLabel) {
    config = { ...DEFAULT_SONGINFO_WINDOW_CONFIG };
    syncFormFromConfig();
    return;
  }
  config = readSongInfoWindowConfig(window.localStorage, songInfoTargetLabel);
  syncFormFromConfig();
}

async function setSongInfoTarget(label) {
  songInfoTargetLabel = String(label ?? "").trim();
  updateTargetBanner();
  loadTargetConfig();
}

async function init() {
  try {
    await setSongInfoTarget(await invoke("get_songinfo_settings_target"));
  } catch {
    await setSongInfoTarget("");
  }

  await listen("songinfo-settings-target", (event) => {
    setSongInfoTarget(event.payload);
  });

  fontPreset?.addEventListener("change", async () => {
    const preset = LYRICS_FONT_PRESETS.find((p) => p.id === fontPreset.value);
    config.fontPresetId = preset?.id ?? DEFAULT_SONGINFO_WINDOW_CONFIG.fontPresetId;
    config.fontFamily = preset?.value ?? DEFAULT_SONGINFO_WINDOW_CONFIG.fontFamily;
    await persistAndNotify();
  });

  titleSize?.addEventListener("input", async () => {
    config.titleFontSizePx = Number(titleSize.value);
    if (titleSizeVal) titleSizeVal.textContent = String(config.titleFontSizePx);
    await persistAndNotify();
  });

  titleColor?.addEventListener("input", async () => {
    config.titleColor = normalizeHexColor(titleColor.value, config.titleColor);
    await persistAndNotify();
  });

  artistSize?.addEventListener("input", async () => {
    config.artistFontSizePx = Number(artistSize.value);
    if (artistSizeVal) artistSizeVal.textContent = String(config.artistFontSizePx);
    await persistAndNotify();
  });

  artistColor?.addEventListener("input", async () => {
    config.artistColor = normalizeHexColor(artistColor.value, config.artistColor);
    await persistAndNotify();
  });

  albumSize?.addEventListener("input", async () => {
    config.albumFontSizePx = Number(albumSize.value);
    if (albumSizeVal) albumSizeVal.textContent = String(config.albumFontSizePx);
    await persistAndNotify();
  });

  albumColor?.addEventListener("input", async () => {
    config.albumColor = normalizeHexColor(albumColor.value, config.albumColor);
    await persistAndNotify();
  });

  lineHeight?.addEventListener("input", async () => {
    config.lineHeightPercent = Number(lineHeight.value);
    if (lineHeightVal) lineHeightVal.textContent = String(config.lineHeightPercent);
    await persistAndNotify();
  });

  blockGap?.addEventListener("input", async () => {
    config.blockGapPx = Number(blockGap.value);
    if (blockGapVal) blockGapVal.textContent = String(config.blockGapPx);
    await persistAndNotify();
  });

  alignHorizontal?.addEventListener("change", async () => {
    const v = alignHorizontal.value;
    config.alignHorizontal =
      v === LYRICS_ALIGN_H.left || v === LYRICS_ALIGN_H.right ? v : LYRICS_ALIGN_H.center;
    await persistAndNotify();
  });

  alignVertical?.addEventListener("change", async () => {
    const v = alignVertical.value;
    config.alignVertical =
      v === LYRICS_ALIGN_V.top || v === LYRICS_ALIGN_V.bottom ? v : LYRICS_ALIGN_V.center;
    await persistAndNotify();
  });

  const onLayoutChange = async () => {
    config.layout = layoutVertical?.checked ? LYRICS_LAYOUT.vertical : LYRICS_LAYOUT.horizontal;
    await persistAndNotify();
  };
  layoutHorizontal?.addEventListener("change", onLayoutChange);
  layoutVertical?.addEventListener("change", onLayoutChange);

  closeSongInfoSettingsBtn?.addEventListener("click", async () => {
    try {
      await invoke("close_songinfo_settings_window");
    } catch (err) {
      console.error("close_songinfo_settings_window failed:", err);
    }
  });
}

init().catch((err) => {
  console.error("song info settings init failed:", err);
});
