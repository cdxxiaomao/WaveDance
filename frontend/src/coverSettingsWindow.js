import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  DEFAULT_COVER_WINDOW_CONFIG,
  buildCoverStyleEventPayload,
  normalizeCoverWindowConfig,
  readCoverWindowConfig,
  writeCoverWindowConfig,
} from "./coverSettingsSchema.js";
import { normalizeHexColor } from "./lyricsSettingsSchema.js";

const coverTargetBanner = document.querySelector("#coverTargetBanner");
const closeCoverSettingsBtn = document.querySelector("#closeCoverSettingsBtn");
const borderEnabled = document.querySelector("#coverBorderEnabled");
const borderSize = document.querySelector("#coverBorderSize");
const borderSizeVal = document.querySelector("#coverBorderSizeVal");
const borderColor = document.querySelector("#coverBorderColor");
const borderOpacity = document.querySelector("#coverBorderOpacity");
const borderOpacityVal = document.querySelector("#coverBorderOpacityVal");
const borderRadius = document.querySelector("#coverBorderRadius");
const borderRadiusVal = document.querySelector("#coverBorderRadiusVal");
const shadowAngle = document.querySelector("#coverShadowAngle");
const shadowAngleVal = document.querySelector("#coverShadowAngleVal");
const shadowColor = document.querySelector("#coverShadowColor");
const shadowBlur = document.querySelector("#coverShadowBlur");
const shadowBlurVal = document.querySelector("#coverShadowBlurVal");
const shadowOpacity = document.querySelector("#coverShadowOpacity");
const shadowOpacityVal = document.querySelector("#coverShadowOpacityVal");

let coverTargetLabel = "";
/** @type {import("./coverSettingsSchema.js").CoverWindowConfig} */
let config = { ...DEFAULT_COVER_WINDOW_CONFIG };

function updateTargetBanner() {
  if (!coverTargetBanner) return;
  coverTargetBanner.textContent = coverTargetLabel
    ? `当前配置对象：${coverTargetLabel}`
    : "";
  coverTargetBanner.hidden = !coverTargetLabel;
}

function syncFormFromConfig() {
  if (borderEnabled) borderEnabled.checked = config.borderEnabled;
  if (borderSize) borderSize.value = String(config.borderSizePx);
  if (borderSizeVal) borderSizeVal.textContent = String(config.borderSizePx);
  if (borderColor) borderColor.value = config.borderColor;
  if (borderOpacity) borderOpacity.value = String(config.borderOpacity);
  if (borderOpacityVal) borderOpacityVal.textContent = String(config.borderOpacity);
  if (borderRadius) borderRadius.value = String(config.borderRadiusPercent);
  if (borderRadiusVal) borderRadiusVal.textContent = String(config.borderRadiusPercent);
  if (shadowAngle) shadowAngle.value = String(config.shadowAngleDeg);
  if (shadowAngleVal) shadowAngleVal.textContent = String(config.shadowAngleDeg);
  if (shadowColor) shadowColor.value = config.shadowColor;
  if (shadowBlur) shadowBlur.value = String(config.shadowBlurPx);
  if (shadowBlurVal) shadowBlurVal.textContent = String(config.shadowBlurPx);
  if (shadowOpacity) shadowOpacity.value = String(config.shadowOpacity);
  if (shadowOpacityVal) shadowOpacityVal.textContent = String(config.shadowOpacity);
}

async function persistAndNotify() {
  if (!coverTargetLabel) return;
  config = normalizeCoverWindowConfig(config);
  writeCoverWindowConfig(window.localStorage, coverTargetLabel, config);
  try {
    await emitTo(
      coverTargetLabel,
      "cover-window-style",
      buildCoverStyleEventPayload(coverTargetLabel, config),
    );
  } catch (err) {
    console.warn("emit cover-window-style failed:", err);
  }
}

function loadTargetConfig() {
  if (!coverTargetLabel) {
    config = { ...DEFAULT_COVER_WINDOW_CONFIG };
    syncFormFromConfig();
    return;
  }
  config = readCoverWindowConfig(window.localStorage, coverTargetLabel);
  syncFormFromConfig();
}

async function setCoverTarget(label) {
  coverTargetLabel = String(label ?? "").trim();
  updateTargetBanner();
  loadTargetConfig();
}

async function init() {
  try {
    await setCoverTarget(await invoke("get_cover_settings_target"));
  } catch {
    await setCoverTarget("");
  }

  await listen("cover-settings-target", (event) => {
    setCoverTarget(event.payload);
  });

  borderEnabled?.addEventListener("change", async () => {
    config.borderEnabled = Boolean(borderEnabled.checked);
    await persistAndNotify();
  });

  borderSize?.addEventListener("input", async () => {
    config.borderSizePx = Number(borderSize.value);
    if (borderSizeVal) borderSizeVal.textContent = String(config.borderSizePx);
    await persistAndNotify();
  });

  borderColor?.addEventListener("input", async () => {
    config.borderColor = normalizeHexColor(borderColor.value, config.borderColor);
    await persistAndNotify();
  });

  borderOpacity?.addEventListener("input", async () => {
    config.borderOpacity = Number(borderOpacity.value);
    if (borderOpacityVal) borderOpacityVal.textContent = String(config.borderOpacity);
    await persistAndNotify();
  });

  borderRadius?.addEventListener("input", async () => {
    config.borderRadiusPercent = Number(borderRadius.value);
    if (borderRadiusVal) borderRadiusVal.textContent = String(config.borderRadiusPercent);
    await persistAndNotify();
  });

  shadowAngle?.addEventListener("input", async () => {
    config.shadowAngleDeg = Number(shadowAngle.value);
    if (shadowAngleVal) shadowAngleVal.textContent = String(config.shadowAngleDeg);
    await persistAndNotify();
  });

  shadowColor?.addEventListener("input", async () => {
    config.shadowColor = normalizeHexColor(shadowColor.value, config.shadowColor);
    await persistAndNotify();
  });

  shadowBlur?.addEventListener("input", async () => {
    config.shadowBlurPx = Number(shadowBlur.value);
    if (shadowBlurVal) shadowBlurVal.textContent = String(config.shadowBlurPx);
    await persistAndNotify();
  });

  shadowOpacity?.addEventListener("input", async () => {
    config.shadowOpacity = Number(shadowOpacity.value);
    if (shadowOpacityVal) shadowOpacityVal.textContent = String(config.shadowOpacity);
    await persistAndNotify();
  });

  closeCoverSettingsBtn?.addEventListener("click", async () => {
    try {
      await invoke("close_cover_settings_window");
    } catch (err) {
      console.error("close_cover_settings_window failed:", err);
    }
  });
}

init().catch((err) => {
  console.error("cover settings init failed:", err);
});
