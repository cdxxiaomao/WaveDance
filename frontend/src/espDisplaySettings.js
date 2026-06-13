import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const STORAGE_KEY = "wavedance.espDisplayConfig";

const DEFAULT_CONFIG = {
  enabled: false,
  serial_path: "",
  baud_rate: 921600,
  max_fps: 30,
  bucket_count: 32,
  include_time_samples: false,
  time_sample_count: 128,
  freq_reversed: false,
};

function readLocalConfig() {
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

function writeLocalConfig(config) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
}

function formatEspStatus(status) {
  if (!status || typeof status !== "object") {
    return "状态未知";
  }
  const parts = [status.message || "—"];
  if (status.connected) {
    parts.push(`已发送 ${status.frames_sent ?? 0} 帧`);
  }
  if (status.last_seq != null) {
    parts.push(`seq ${status.last_seq}`);
  }
  return parts.join(" · ");
}

/**
 * 初始化设置页「外接屏 (ESP32)」区块。
 * @param {{ statusEl?: HTMLElement | null }} options
 */
export async function initEspDisplaySettings({ statusEl } = {}) {
  const enabledToggle = document.querySelector("#espDisplayEnabled");
  const serialSelect = document.querySelector("#espDisplaySerial");
  const refreshPortsBtn = document.querySelector("#espDisplayRefreshPortsBtn");
  const testBtn = document.querySelector("#espDisplayTestBtn");
  const baudSelect = document.querySelector("#espDisplayBaud");
  const maxFpsSelect = document.querySelector("#espDisplayMaxFps");
  const bucketsSelect = document.querySelector("#espDisplayBuckets");
  const includeTimeToggle = document.querySelector("#espDisplayIncludeTime");
  const freqReversedToggle = document.querySelector("#espDisplayFreqReversed");
  const statusHint = document.querySelector("#espDisplayStatus");

  if (!enabledToggle || !serialSelect) {
    return;
  }

  let applying = false;

  function showEspStatus(status) {
    if (statusHint) {
      statusHint.textContent = formatEspStatus(status);
    }
  }

  function applyToForm(config) {
    enabledToggle.checked = Boolean(config.enabled);
    baudSelect.value = String(config.baud_rate ?? DEFAULT_CONFIG.baud_rate);
    maxFpsSelect.value = String(config.max_fps ?? DEFAULT_CONFIG.max_fps);
    bucketsSelect.value = String(config.bucket_count ?? DEFAULT_CONFIG.bucket_count);
    includeTimeToggle.checked = Boolean(config.include_time_samples);
    freqReversedToggle.checked = Boolean(config.freq_reversed);
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

  function currentPatch() {
    return {
      enabled: enabledToggle.checked,
      serial_path: serialSelect.value.trim(),
      baud_rate: Number(baudSelect.value),
      max_fps: Number(maxFpsSelect.value),
      bucket_count: Number(bucketsSelect.value),
      include_time_samples: includeTimeToggle.checked,
      freq_reversed: freqReversedToggle.checked,
    };
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
      statusEl.textContent = response.status.ok
        ? "外接屏配置已更新"
        : `外接屏：${response.status.message}`;
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
      }
      if (statusEl) {
        statusEl.textContent = msg;
      }
    }
  }

  enabledToggle.addEventListener("change", () => {
    void syncFromControls();
  });
  serialSelect.addEventListener("change", () => {
    void syncFromControls();
  });
  baudSelect.addEventListener("change", () => {
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
        if (!patch.serial_path) {
          const msg = "请先选择串口";
          if (statusHint) {
            statusHint.textContent = msg;
          }
          if (statusEl) {
            statusEl.textContent = msg;
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
      local.serial_path &&
      (!backend.serial_path ||
        backend.baud_rate !== local.baud_rate ||
        backend.bucket_count !== local.bucket_count);
    if (needsPush || local.enabled !== backend.enabled) {
      await pushConfig({
        enabled: local.enabled,
        serial_path: local.serial_path,
        baud_rate: local.baud_rate,
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
    }
  }
}
