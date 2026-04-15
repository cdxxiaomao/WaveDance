#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

use tauri::{Emitter, State};
use wavedance::audio_capture::{AudioSource, MacSystemAudioSource};
use wavedance::audio_processing::{DefaultWaveformExtractor, WaveformExtractor};

struct StreamState {
    running: Arc<AtomicBool>,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[tauri::command]
fn start_waveform_stream(app: tauri::AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let running = Arc::clone(&state.running);
    thread::spawn(move || {
        let mut source = MacSystemAudioSource::new(Some("BlackHole".to_string()));
        let extractor = DefaultWaveformExtractor::new(512, 0.95);

        if let Err(err) = source.start() {
            let _ = app.emit("waveform-error", format!("启动系统音频采集失败: {err}"));
            running.store(false, Ordering::SeqCst);
            return;
        }

        let _ = app.emit("waveform-status", "系统音频采集已启动");
        while running.load(Ordering::SeqCst) {
            match source.read_frame(1024) {
                Ok(frame) => {
                    let waveform = extractor.extract(&frame);
                    let _ = app.emit("waveform-frame", waveform);
                }
                Err(err) => {
                    let _ = app.emit("waveform-error", format!("读取音频帧失败: {err}"));
                    thread::sleep(Duration::from_millis(25));
                }
            }
        }

        let _ = source.stop();
        let _ = app.emit("waveform-status", "系统音频采集已停止");
    });

    Ok(())
}

#[tauri::command]
fn stop_waveform_stream(state: State<'_, StreamState>) {
    state.running.store(false, Ordering::SeqCst);
}

fn main() {
    tauri::Builder::default()
        .manage(StreamState::default())
        .invoke_handler(tauri::generate_handler![
            start_waveform_stream,
            stop_waveform_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
