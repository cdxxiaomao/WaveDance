import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { normalizeHexColor } from "./lyricsSettingsSchema.js";
import {
  DEFAULT_PLAYER_WINDOW_CONFIG,
  PLAYER_WINDOW_LABEL,
  buildPlayerStyleEventPayload,
  normalizePlayerWindowConfig,
  readPlayerWindowConfig,
  writePlayerWindowConfig,
} from "./playerSettingsSchema.js";

const playerBgColor = document.querySelector("#playerBgColor");
const playerBgAlpha = document.querySelector("#playerBgAlpha");
const playerBgAlphaVal = document.querySelector("#playerBgAlphaVal");
const playerBlurToggle = document.querySelector("#playerBlurToggle");
const closePlayerSettingsBtn = document.querySelector("#closePlayerSettingsBtn");

/** @type {ReturnType<typeof normalizePlayerWindowConfig>} */
let config = { ...DEFAULT_PLAYER_WINDOW_CONFIG };

function syncFormFromConfig() {
  if (playerBgColor) playerBgColor.value = config.bgColor;
  if (playerBgAlpha) playerBgAlpha.value = String(config.bgAlphaPercent);
  if (playerBgAlphaVal) playerBgAlphaVal.textContent = String(config.bgAlphaPercent);
  if (playerBlurToggle) playerBlurToggle.checked = config.blurEnabled;
}

async function persistAndNotify() {
  config = normalizePlayerWindowConfig(config);
  writePlayerWindowConfig(window.localStorage, PLAYER_WINDOW_LABEL, config);
  try {
    await emitTo(
      PLAYER_WINDOW_LABEL,
      "player-window-style",
      buildPlayerStyleEventPayload(PLAYER_WINDOW_LABEL, config),
    );
  } catch (err) {
    console.warn("emit player-window-style failed:", err);
  }
  try {
    await invoke("set_overlay_blur_enabled", {
      label: PLAYER_WINDOW_LABEL,
      enabled: config.blurEnabled,
    });
  } catch (err) {
    console.warn("set_overlay_blur_enabled failed:", err);
  }
}

async function init() {
  config = readPlayerWindowConfig(window.localStorage, PLAYER_WINDOW_LABEL);
  syncFormFromConfig();

  playerBgColor?.addEventListener("input", async () => {
    config.bgColor = normalizeHexColor(playerBgColor.value, config.bgColor);
    await persistAndNotify();
  });

  playerBgAlpha?.addEventListener("input", async () => {
    config.bgAlphaPercent = Number(playerBgAlpha.value);
    if (playerBgAlphaVal) playerBgAlphaVal.textContent = String(config.bgAlphaPercent);
    await persistAndNotify();
  });

  playerBlurToggle?.addEventListener("change", async () => {
    config.blurEnabled = Boolean(playerBlurToggle.checked);
    await persistAndNotify();
  });

  closePlayerSettingsBtn?.addEventListener("click", async () => {
    try {
      await invoke("close_player_settings_window");
    } catch (err) {
      console.error("close_player_settings_window failed:", err);
    }
  });
}

init().catch((err) => {
  console.error("player settings init failed:", err);
});
