import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const STORAGE_KEY = "wavedance.espDisplayConfig";

export const DEFAULT_CONFIG = {
  enabled: false,
  transport: "serial",
  serial_path: "",
  baud_rate: 921600,
  udp_host: "",
  udp_port: 47001,
  max_fps: 30,
  bucket_count: 32,
  include_time_samples: false,
  time_sample_count: 128,
  freq_reversed: false,
};

export function readLocalConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_CONFIG };
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeLocalConfig(config) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
}

function formatRelativeTime(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return null;
  }
  const delta = Date.now() - ms;
  if (delta < 0) {
    return "刚刚";
  }
  if (delta < 5000) {
    return "刚刚";
  }
  if (delta < 60_000) {
    return `${Math.floor(delta / 1000)} 秒前`;
  }
  if (delta < 3_600_000) {
    return `${Math.floor(delta / 60_000)} 分钟前`;
  }
  return new Date(ms).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatEspStatus(status) {
  if (!status || typeof status !== "object") {
    return { text: "状态未知", tone: "muted" };
  }

  const parts = [status.message || "—"];
  if (status.connected) {
    parts.push(`已发送 ${status.frames_sent ?? 0} 帧`);
    const sentAt = formatRelativeTime(status.last_sent_at_ms);
    if (sentAt) {
      parts.push(`最近 ${sentAt}`);
    }
  }
  if (status.last_seq != null) {
    parts.push(`seq ${status.last_seq}`);
  }

  let tone = "muted";
  if (status.ok && status.connected) {
    tone = "ok";
  } else if (
    status.message &&
    status.message !== "未连接" &&
    !status.message.includes("请选择串口") &&
    !status.message.includes("请填写 ESP IP")
  ) {
    tone = "error";
  } else if (status.connected === false && status.message === "未连接") {
    tone = "muted";
  }

  return { text: parts.join(" · "), tone };
}

function applyStatusTone(el, tone) {
  if (!el) {
    return;
  }
  el.classList.remove(
    "esp-display-status--ok",
    "esp-display-status--error",
    "esp-display-status--muted",
  );
  if (tone) {
    el.classList.add(`esp-display-status--${tone}`);
  }
}

function showEspStatusOn(el, status) {
  if (!el) {
    return;
  }
  const { text, tone } = formatEspStatus(status);
  el.textContent = text;
  applyStatusTone(el, tone);
}

/**
 * 启动时将 localStorage 中的外接屏配置同步到 Rust 后端（无需打开设置窗）。
 */
export async function syncEspDisplayConfigFromStorage() {
  const local = readLocalConfig();
  try {
    const response = await invoke("get_esp_display_config");
    const backend = response.config ?? {};
    const needsPush =
      (local.serial_path &&
        (!backend.serial_path ||
          backend.baud_rate !== local.baud_rate ||
          backend.max_fps !== local.max_fps ||
          backend.bucket_count !== local.bucket_count ||
          backend.include_time_samples !== local.include_time_samples ||
          backend.freq_reversed !== local.freq_reversed)) ||
      local.transport !== (backend.transport ?? "serial") ||
      local.udp_host !== (backend.udp_host ?? "") ||
      local.udp_port !== (backend.udp_port ?? 47001);
    if (needsPush || local.enabled !== backend.enabled) {
      await invoke("set_esp_display_config", {
        patch: {
          enabled: local.enabled,
          transport: local.transport,
          serial_path: local.serial_path,
          baud_rate: local.baud_rate,
          udp_host: local.udp_host,
          udp_port: local.udp_port,
          max_fps: local.max_fps,
          bucket_count: local.bucket_count,
          include_time_samples: local.include_time_samples,
          freq_reversed: local.freq_reversed,
        },
      });
    }
  } catch (err) {
    console.warn("esp display startup sync failed:", err);
  }
}

/**
 * 初始化独立外接屏设置窗口。
 * @param {{ statusEl?: HTMLElement | null }} options
 */
export async function initEspDisplaySettings({ statusEl } = {}) {
  const enabledToggle = document.querySelector("#espDisplayEnabled");
  const transportSelect = document.querySelector("#espDisplayTransport");
  const serialSelect = document.querySelector("#espDisplaySerial");
  const refreshPortsBtn = document.querySelector("#espDisplayRefreshPortsBtn");
  const testBtn = document.querySelector("#espDisplayTestBtn");
  const baudSelect = document.querySelector("#espDisplayBaud");
  const udpHostInput = document.querySelector("#espDisplayUdpHost");
  const udpPortInput = document.querySelector("#espDisplayUdpPort");
  const serialFields = document.querySelector("#espDisplaySerialFields");
  const udpFields = document.querySelector("#espDisplayUdpFields");
  const maxFpsSelect = document.querySelector("#espDisplayMaxFps");
  const bucketsSelect = document.querySelector("#espDisplayBuckets");
  const includeTimeToggle = document.querySelector("#espDisplayIncludeTime");
  const freqReversedToggle = document.querySelector("#espDisplayFreqReversed");
  const statusHint = document.querySelector("#espDisplayStatus");

  if (!enabledToggle || !transportSelect) {
    return;
  }

  let applying = false;

  function usesSerial(transport) {
    return transport === "serial" || transport === "both";
  }

  function usesUdp(transport) {
    return transport === "udp" || transport === "both";
  }

  function updateTransportVisibility(transport) {
    if (serialFields) {
      serialFields.hidden = !usesSerial(transport);
    }
    if (udpFields) {
      udpFields.hidden = !usesUdp(transport);
    }
  }

  function showEspStatus(status) {
    showEspStatusOn(statusHint, status);
  }

  function applyToForm(config) {
    const transport = config.transport ?? DEFAULT_CONFIG.transport;
    enabledToggle.checked = Boolean(config.enabled);
    transportSelect.value = transport;
    updateTransportVisibility(transport);
    baudSelect.value = String(config.baud_rate ?? DEFAULT_CONFIG.baud_rate);
    if (udpHostInput) {
      udpHostInput.value = config.udp_host ?? "";
    }
    if (udpPortInput) {
      udpPortInput.value = String(config.udp_port ?? DEFAULT_CONFIG.udp_port);
    }
    maxFpsSelect.value = String(config.max_fps ?? DEFAULT_CONFIG.max_fps);
    bucketsSelect.value = String(config.bucket_count ?? DEFAULT_CONFIG.bucket_count);
    includeTimeToggle.checked = Boolean(config.include_time_samples);
    freqReversedToggle.checked = Boolean(config.freq_reversed);
    if (serialSelect) {
      if (config.serial_path) {
        const hasOption = Array.from(serialSelect.options).some(
          (opt) => opt.value === config.serial_path,
        );
        if (!hasOption) {
          const missing = document.createElement("option");
          missing.value = config.serial_path;
          missing.textContent = `${config.serial_path}（未检测到）`;
          serialSelect.appendChild(missing);
        }
        serialSelect.value = config.serial_path;
      } else {
        serialSelect.value = "";
      }
    }
  }

  function currentPatch() {
    const transport = transportSelect.value || DEFAULT_CONFIG.transport;
    return {
      enabled: enabledToggle.checked,
      transport,
      serial_path: serialSelect?.value.trim() ?? "",
      baud_rate: Number(baudSelect.value),
      udp_host: udpHostInput?.value.trim() ?? "",
      udp_port: Number(udpPortInput?.value || DEFAULT_CONFIG.udp_port),
      max_fps: Number(maxFpsSelect.value),
      bucket_count: Number(bucketsSelect.value),
      include_time_samples: includeTimeToggle.checked,
      freq_reversed: freqReversedToggle.checked,
    };
  }

  function validateTransportConfig(patch) {
    const transport = patch.transport || DEFAULT_CONFIG.transport;
    if (usesSerial(transport) && !patch.serial_path) {
      return "请先选择串口";
    }
    if (usesUdp(transport) && !patch.udp_host) {
      return "请填写 ESP32 的 IP 地址";
    }
    return null;
  }

  async function refreshPortList(selectedPath) {
    const ports = await invoke("list_serial_ports");
    const keepPath = selectedPath || serialSelect.value.trim();
    serialSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = ports.length ? "选择串口…" : "未检测到串口（请插好 Type-C）";
    serialSelect.appendChild(placeholder);
    ports.forEach((path) => {
      const opt = document.createElement("option");
      opt.value = path;
      opt.textContent = path;
      serialSelect.appendChild(opt);
    });
    if (keepPath) {
      const found = ports.includes(keepPath);
      if (!found) {
        const missing = document.createElement("option");
        missing.value = keepPath;
        missing.textContent = `${keepPath}（未检测到）`;
        serialSelect.appendChild(missing);
      }
      serialSelect.value = keepPath;
    }
  }

  async function pushConfig(patch, { flashMainStatus = false } = {}) {
    const response = await invoke("set_esp_display_config", { patch });
    const merged = { ...readLocalConfig(), ...response.config };
    writeLocalConfig(merged);
    applying = true;
    applyToForm(merged);
    applying = false;
    showEspStatus(response.status);
    if (flashMainStatus && statusEl) {
      const { text } = formatEspStatus(response.status);
      statusEl.textContent = response.status.ok ? "外接屏配置已更新" : `外接屏：${text}`;
    }
    return response;
  }

  async function syncFromControls() {
    if (applying) {
      return;
    }
    const patch = currentPatch();
    writeLocalConfig({ ...readLocalConfig(), ...patch });
    try {
      await pushConfig(patch);
    } catch (err) {
      const msg = `外接屏配置失败：${String(err)}`;
      if (statusHint) {
        statusHint.textContent = msg;
        applyStatusTone(statusHint, "error");
      }
      if (statusEl) {
        statusEl.textContent = msg;
      }
    }
  }

  enabledToggle.addEventListener("change", () => {
    void syncFromControls();
  });
  transportSelect.addEventListener("change", () => {
    updateTransportVisibility(transportSelect.value);
    void syncFromControls();
  });
  serialSelect?.addEventListener("change", () => {
    void syncFromControls();
  });
  baudSelect.addEventListener("change", () => {
    void syncFromControls();
  });
  udpHostInput?.addEventListener("change", () => {
    void syncFromControls();
  });
  udpPortInput?.addEventListener("change", () => {
    void syncFromControls();
  });
  maxFpsSelect.addEventListener("change", () => {
    void syncFromControls();
  });
  bucketsSelect.addEventListener("change", () => {
    void syncFromControls();
  });
  includeTimeToggle.addEventListener("change", () => {
    void syncFromControls();
  });
  freqReversedToggle.addEventListener("change", () => {
    void syncFromControls();
  });

  refreshPortsBtn?.addEventListener("click", () => {
    void (async () => {
      try {
        await refreshPortList(readLocalConfig().serial_path);
        if (statusEl) {
          statusEl.textContent = "已刷新串口列表";
        }
      } catch (err) {
        const msg = `刷新串口失败：${String(err)}`;
        if (statusHint) {
          statusHint.textContent = msg;
          applyStatusTone(statusHint, "error");
        }
        if (statusEl) {
          statusEl.textContent = msg;
        }
      }
    })();
  });

  testBtn?.addEventListener("click", () => {
    void (async () => {
      try {
        const patch = currentPatch();
        const validationError = validateTransportConfig(patch);
        if (validationError) {
          if (statusHint) {
            statusHint.textContent = validationError;
            applyStatusTone(statusHint, "error");
          }
          if (statusEl) {
            statusEl.textContent = validationError;
          }
          return;
        }
        await pushConfig(patch, { flashMainStatus: true });
        const status = await invoke("test_esp_display_ping");
        showEspStatus(status);
        if (statusEl) {
          statusEl.textContent = status.ok ? "外接屏测试帧已发送" : `测试失败：${status.message}`;
        }
      } catch (err) {
        const msg = `测试连接失败：${String(err)}`;
        if (statusHint) {
          statusHint.textContent = msg;
          applyStatusTone(statusHint, "error");
        }
        if (statusEl) {
          statusEl.textContent = msg;
        }
      }
    })();
  });

  await listen("esp-display-status", (event) => {
    showEspStatus(event.payload);
  });

  const local = readLocalConfig();
  try {
    await refreshPortList(local.serial_path);
    applyToForm(local);
    const response = await invoke("get_esp_display_config");
    const backend = response.config ?? {};
    const needsPush =
      local.transport !== (backend.transport ?? "serial") ||
      local.udp_host !== (backend.udp_host ?? "") ||
      local.udp_port !== (backend.udp_port ?? 47001) ||
      (local.serial_path &&
        (!backend.serial_path ||
          backend.baud_rate !== local.baud_rate ||
          backend.max_fps !== local.max_fps ||
          backend.bucket_count !== local.bucket_count ||
          backend.include_time_samples !== local.include_time_samples ||
          backend.freq_reversed !== local.freq_reversed));
    if (needsPush || local.enabled !== backend.enabled) {
      await pushConfig({
        enabled: local.enabled,
        transport: local.transport,
        serial_path: local.serial_path,
        baud_rate: local.baud_rate,
        udp_host: local.udp_host,
        udp_port: local.udp_port,
        max_fps: local.max_fps,
        bucket_count: local.bucket_count,
        include_time_samples: local.include_time_samples,
        freq_reversed: local.freq_reversed,
      });
    } else {
      const merged = { ...local, ...backend };
      writeLocalConfig(merged);
      applying = true;
      applyToForm(merged);
      applying = false;
      showEspStatus(response.status);
    }
  } catch (err) {
    if (statusHint) {
      statusHint.textContent = `加载外接屏配置失败：${String(err)}`;
      applyStatusTone(statusHint, "error");
    }
  }
}
