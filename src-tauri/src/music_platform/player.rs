use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

pub const MUSIC_PLAYER_LABEL: &str = "music-player";
pub const MUSIC_PLAYER_STATE_EVENT: &str = "music-player-state-update";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerTrack {
    pub provider: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_mid: Option<String>,
    pub name: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_key: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlayerSnapshot {
    pub queue: Vec<PlayerTrack>,
    pub current_index: Option<usize>,
    pub playing: bool,
    pub loading: bool,
    pub loop_mode: String,
    pub quality: String,
    pub position_ms: u64,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for MusicPlayerSnapshot {
    fn default() -> Self {
        Self {
            queue: Vec::new(),
            current_index: None,
            playing: false,
            loading: false,
            loop_mode: "all".into(),
            quality: "lossless".into(),
            position_ms: 0,
            duration_ms: 0,
            error: None,
        }
    }
}

pub struct MusicPlayerState {
    inner: Mutex<MusicPlayerSnapshot>,
}

impl Default for MusicPlayerState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(MusicPlayerSnapshot::default()),
        }
    }
}

impl MusicPlayerState {
    fn with_mut<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut MusicPlayerSnapshot) -> R,
    {
        let mut guard = self.inner.lock().expect("music player lock");
        f(&mut guard)
    }

    pub fn snapshot(&self) -> MusicPlayerSnapshot {
        self.inner.lock().expect("music player lock").clone()
    }
}

fn emit_player_state(app: &AppHandle, snapshot: &MusicPlayerSnapshot) {
    let _ = app.emit(MUSIC_PLAYER_STATE_EVENT, snapshot.clone());
    if let Some(win) = app.get_webview_window(MUSIC_PLAYER_LABEL) {
        let _ = win.emit(MUSIC_PLAYER_STATE_EVENT, snapshot.clone());
    }
    if let Some(win) = app.get_webview_window(crate::music_platform::MUSIC_PLAYER_QUEUE_LABEL) {
        let _ = win.emit(MUSIC_PLAYER_STATE_EVENT, snapshot.clone());
    }
    #[cfg(target_os = "macos")]
    super::now_playing_bridge::InternalPlayerNowPlayingBridge::sync_from_player(app, snapshot);
}

fn update_and_emit(app: &AppHandle, state: &MusicPlayerState, f: impl FnOnce(&mut MusicPlayerSnapshot)) {
    let snapshot = state.with_mut(|snap| {
        f(snap);
        snap.clone()
    });
    emit_player_state(app, &snapshot);
}

#[tauri::command]
pub fn music_player_get_state(state: State<'_, MusicPlayerState>) -> MusicPlayerSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn music_player_set_queue(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    tracks: Vec<PlayerTrack>,
    start_index: usize,
) -> Result<(), String> {
    if tracks.is_empty() {
        return Err("播放列表为空".into());
    }
    if start_index >= tracks.len() {
        return Err("起始索引超出范围".into());
    }
    update_and_emit(&app, &state, |snap| {
        snap.queue = tracks;
        snap.current_index = Some(start_index);
        snap.playing = true;
        snap.loading = true;
        snap.error = None;
        snap.position_ms = 0;
        snap.duration_ms = snap
            .queue
            .get(start_index)
            .and_then(|t| t.duration_ms)
            .unwrap_or(0);
    });
    Ok(())
}

#[tauri::command]
pub fn music_player_toggle(app: AppHandle, state: State<'_, MusicPlayerState>) -> Result<(), String> {
    let snap = state.snapshot();
    if snap.current_index.is_none() {
        return Err("当前无播放曲目".into());
    }
    update_and_emit(&app, &state, |s| {
        s.playing = !s.playing;
        s.error = None;
    });
    Ok(())
}

#[tauri::command]
pub fn music_player_pause(app: AppHandle, state: State<'_, MusicPlayerState>) {
    update_and_emit(&app, &state, |s| {
        s.playing = false;
    });
}

#[tauri::command]
pub fn music_player_play(app: AppHandle, state: State<'_, MusicPlayerState>) {
    update_and_emit(&app, &state, |s| {
        if s.current_index.is_some() {
            s.playing = true;
            s.error = None;
        }
    });
}

#[tauri::command]
pub fn music_player_next(app: AppHandle, state: State<'_, MusicPlayerState>) -> Result<(), String> {
    let snap = state.snapshot();
    let idx = snap.current_index.ok_or_else(|| "当前无播放曲目".to_string())?;
    let next = match snap.loop_mode.as_str() {
        "one" => idx,
        "all" => (idx + 1) % snap.queue.len(),
        _ => {
            if idx + 1 >= snap.queue.len() {
                update_and_emit(&app, &state, |s| {
                    s.playing = false;
                    s.position_ms = s.duration_ms;
                });
                return Ok(());
            }
            idx + 1
        }
    };
    update_and_emit(&app, &state, |s| {
        s.current_index = Some(next);
        s.playing = true;
        s.loading = true;
        s.error = None;
        s.position_ms = 0;
        s.duration_ms = s.queue.get(next).and_then(|t| t.duration_ms).unwrap_or(0);
    });
    Ok(())
}

#[tauri::command]
pub fn music_player_prev(app: AppHandle, state: State<'_, MusicPlayerState>) -> Result<(), String> {
    let snap = state.snapshot();
    let idx = snap.current_index.ok_or_else(|| "当前无播放曲目".to_string())?;
    if snap.position_ms > 3000 {
        update_and_emit(&app, &state, |s| {
            s.position_ms = 0;
        });
        return Ok(());
    }
    let prev = if idx == 0 {
        if snap.loop_mode == "all" && !snap.queue.is_empty() {
            snap.queue.len() - 1
        } else {
            0
        }
    } else {
        idx - 1
    };
    update_and_emit(&app, &state, |s| {
        s.current_index = Some(prev);
        s.playing = true;
        s.loading = true;
        s.error = None;
        s.position_ms = 0;
        s.duration_ms = s.queue.get(prev).and_then(|t| t.duration_ms).unwrap_or(0);
    });
    Ok(())
}

#[tauri::command]
pub fn music_player_set_loop_mode(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    mode: String,
) -> Result<(), String> {
    let normalized = mode.trim().to_lowercase();
    if !matches!(normalized.as_str(), "none" | "one" | "all") {
        return Err("循环模式必须是 none、one 或 all".into());
    }
    update_and_emit(&app, &state, |s| {
        s.loop_mode = normalized;
    });
    Ok(())
}

#[tauri::command]
pub fn music_player_set_quality(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    quality: String,
) -> Result<(), String> {
    let q = quality.trim().to_lowercase();
    if q.is_empty() {
        return Err("音质不能为空".into());
    }
    update_and_emit(&app, &state, |s| {
        s.quality = q.clone();
        if s.current_index.is_some() {
            s.loading = true;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn music_player_seek(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    position_ms: u64,
) {
    update_and_emit(&app, &state, |s| {
        s.position_ms = position_ms.min(s.duration_ms.max(1));
    });
}

#[tauri::command]
pub fn music_player_report_progress(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    position_ms: u64,
    duration_ms: Option<u64>,
) {
    let snapshot = state.with_mut(|s| {
        s.position_ms = position_ms;
        if let Some(d) = duration_ms {
            if d > 0 {
                s.duration_ms = d;
            }
        }
        s.clone()
    });
    let _ = app.emit(MUSIC_PLAYER_STATE_EVENT, snapshot.clone());
    #[cfg(target_os = "macos")]
    super::now_playing_bridge::InternalPlayerNowPlayingBridge::sync_progress(&app, &snapshot);
}

#[tauri::command]
pub fn music_player_set_loading(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    loading: bool,
) {
    update_and_emit(&app, &state, |s| {
        s.loading = loading;
    });
}

#[tauri::command]
pub fn music_player_set_error(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    error: Option<String>,
) {
    update_and_emit(&app, &state, |s| {
        s.error = error.clone();
        s.loading = false;
        if error.is_some() {
            s.playing = false;
        }
    });
}

#[tauri::command]
pub fn music_player_play_index(
    app: AppHandle,
    state: State<'_, MusicPlayerState>,
    index: usize,
) -> Result<(), String> {
    let snap = state.snapshot();
    if index >= snap.queue.len() {
        return Err("索引超出范围".into());
    }
    update_and_emit(&app, &state, |s| {
        s.current_index = Some(index);
        s.playing = true;
        s.loading = true;
        s.error = None;
        s.position_ms = 0;
        s.duration_ms = s.queue.get(index).and_then(|t| t.duration_ms).unwrap_or(0);
    });
    Ok(())
}
