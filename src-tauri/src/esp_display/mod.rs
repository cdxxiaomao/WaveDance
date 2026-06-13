mod bridge;

use std::sync::{Arc, Mutex};

use bridge::{EspDisplayBridge, EspDisplayStatus};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use wavedance::audio_processing::WaveformFrame;

pub use bridge::EspDisplayConfig;

pub struct EspDisplayState {
    pub bridge: Mutex<EspDisplayBridge>,
}

impl Default for EspDisplayState {
    fn default() -> Self {
        Self {
            bridge: Mutex::new(EspDisplayBridge::default()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct EspDisplayConfigResponse {
    pub config: EspDisplayConfig,
    pub status: EspDisplayStatus,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EspDisplayConfigInput {
    pub enabled: Option<bool>,
    pub serial_path: Option<String>,
    pub baud_rate: Option<u32>,
    pub max_fps: Option<u32>,
    pub bucket_count: Option<usize>,
    pub include_time_samples: Option<bool>,
    pub time_sample_count: Option<usize>,
    pub freq_reversed: Option<bool>,
}

#[tauri::command]
pub fn list_serial_ports() -> Vec<String> {
    let mut ports: Vec<String> = serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .filter(|name| name.starts_with("/dev/cu.") || name.starts_with("/dev/tty."))
        .collect();
    ports.sort();
    ports
}

#[tauri::command]
pub fn get_esp_display_config(state: State<'_, Arc<EspDisplayState>>) -> EspDisplayConfigResponse {
    let bridge = state.bridge.lock().expect("esp display bridge lock");
    EspDisplayConfigResponse {
        config: bridge.config.clone(),
        status: bridge.status(),
    }
}

#[tauri::command]
pub fn set_esp_display_config(
    app: AppHandle,
    state: State<'_, Arc<EspDisplayState>>,
    patch: EspDisplayConfigInput,
) -> Result<EspDisplayConfigResponse, String> {
    let mut bridge = state.bridge.lock().expect("esp display bridge lock");
    bridge.apply_patch(patch)?;
    let response = EspDisplayConfigResponse {
        config: bridge.config.clone(),
        status: bridge.status(),
    };
    emit_status(&app, &response.status);
    Ok(response)
}

#[tauri::command]
pub fn test_esp_display_ping(
    app: AppHandle,
    state: State<'_, Arc<EspDisplayState>>,
) -> Result<EspDisplayStatus, String> {
    let mut bridge = state.bridge.lock().expect("esp display bridge lock");
    bridge.send_test_frame()?;
    let status = bridge.status();
    emit_status(&app, &status);
    Ok(status)
}

pub fn maybe_send_frame(
    app: &AppHandle,
    state: &Arc<EspDisplayState>,
    frame: &WaveformFrame,
) {
    let mut bridge = match state.bridge.try_lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    if let Some(status) = bridge.maybe_send(frame) {
        emit_status(app, &status);
    }
}

fn emit_status(app: &AppHandle, status: &EspDisplayStatus) {
    let _ = app.emit("esp-display-status", status.clone());
}
