//! 内部播放器模式下，将 `MusicPlayerSnapshot` 桥接为 `now-playing-update` 供封面/歌词窗使用。

#[cfg(target_os = "macos")]
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
#[cfg(target_os = "macos")]
use image::codecs::jpeg::JpegEncoder;
#[cfg(target_os = "macos")]
use image::{imageops::thumbnail, DynamicImage, ExtendedColorType, ImageEncoder};
#[cfg(target_os = "macos")]
use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
use crate::now_playing::NowPlayingPayload;
#[cfg(target_os = "macos")]
use crate::lyrics::{self, LyricTrackQuery};

#[cfg(target_os = "macos")]
use super::player::{MusicPlayerSnapshot, MusicPlayerState, PlayerTrack};

#[cfg(target_os = "macos")]
const PLAYER_COVER_FILENAME: &str = "internal_player_cover.jpg";

#[cfg(target_os = "macos")]
#[derive(Default)]
struct CoverCache {
    track_key: String,
    source_url: String,
    artwork_path: Option<String>,
    artwork_data_url: Option<String>,
    revision: u64,
    fetch_token: u64,
}

#[cfg(target_os = "macos")]
#[derive(Default)]
pub struct InternalPlayerNowPlayingBridge {
    last_fingerprint: Mutex<String>,
    last_payload: Mutex<Option<NowPlayingPayload>>,
    cover: Mutex<CoverCache>,
}

#[cfg(target_os = "macos")]
fn capture_source_is_internal_player(app: &AppHandle) -> bool {
    crate::capture_source_is_internal_player(app)
}

#[cfg(target_os = "macos")]
fn player_track_key(track: &PlayerTrack, index: usize) -> String {
    format!(
        "{}|{}|{}|{}|{}",
        track.provider, track.id, track.name, track.artist, index
    )
}

#[cfg(target_os = "macos")]
fn encode_cover_jpeg(cover: &DynamicImage, max_dim: u32) -> Option<Vec<u8>> {
    let max_dim = max_dim.max(32);
    let thumb = DynamicImage::ImageRgba8(thumbnail(cover, max_dim, max_dim));
    let rgb = thumb.into_rgb8();
    let (w, h) = (rgb.width(), rgb.height());
    let mut buf = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut buf, 82);
    encoder
        .write_image(rgb.as_raw(), w, h, ExtendedColorType::Rgb8)
        .ok()?;
    (!buf.is_empty()).then_some(buf)
}

#[cfg(target_os = "macos")]
fn write_player_cover_file(app: &AppHandle, jpeg: &[u8]) -> Option<String> {
    let dir = app.path().app_cache_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(PLAYER_COVER_FILENAME);
    std::fs::write(&path, jpeg).ok()?;
    Some(path.to_string_lossy().into_owned())
}

#[cfg(target_os = "macos")]
fn referer_for_provider(provider: &str) -> &'static str {
    match provider.trim().to_lowercase().as_str() {
        "qq" => "https://y.qq.com/",
        "netease" | "163" => "https://music.163.com/",
        _ => "https://y.qq.com/",
    }
}

#[cfg(target_os = "macos")]
async fn fetch_cover_bytes(provider: &str, url: &str) -> Result<Vec<u8>, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_static(referer_for_provider(provider)),
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("封面 HTTP {}", resp.status()));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn apply_cached_cover(
    payload: &mut NowPlayingPayload,
    cache: &CoverCache,
    track_key: &str,
) {
    if cache.track_key != track_key {
        return;
    }
    payload.artwork_path = cache.artwork_path.clone();
    payload.artwork_data_url = cache.artwork_data_url.clone();
    payload.artwork_revision = cache.revision;
}

#[cfg(target_os = "macos")]
fn build_payload(snapshot: &MusicPlayerSnapshot, cache: &CoverCache) -> NowPlayingPayload {
    let Some(idx) = snapshot.current_index else {
        return NowPlayingPayload {
            active: false,
            title: None,
            artist: None,
            album: None,
            bundle_id: Some("com.wavedance.internal-player".into()),
            bundle_name: Some("WaveDance 内部播放器".into()),
            is_playing: None,
            elapsed_time: None,
            duration: None,
            artwork_path: None,
            artwork_data_url: None,
            artwork_revision: 0,
        };
    };
    let Some(track) = snapshot.queue.get(idx) else {
        return NowPlayingPayload {
            active: false,
            title: None,
            artist: None,
            album: None,
            bundle_id: Some("com.wavedance.internal-player".into()),
            bundle_name: Some("WaveDance 内部播放器".into()),
            is_playing: None,
            elapsed_time: None,
            duration: None,
            artwork_path: None,
            artwork_data_url: None,
            artwork_revision: 0,
        };
    };

    let track_key = player_track_key(track, idx);
    let duration_sec = if snapshot.duration_ms > 0 {
        Some(snapshot.duration_ms as f64 / 1000.0)
    } else {
        track.duration_ms.map(|ms| ms as f64 / 1000.0)
    };

    let mut payload = NowPlayingPayload {
        active: true,
        title: Some(track.name.clone()),
        artist: Some(track.artist.clone()),
        album: track.album.clone(),
        bundle_id: Some("com.wavedance.internal-player".into()),
        bundle_name: Some("WaveDance 内部播放器".into()),
        is_playing: Some(snapshot.playing && !snapshot.loading),
        elapsed_time: Some(snapshot.position_ms as f64 / 1000.0),
        duration: duration_sec,
        artwork_path: None,
        artwork_data_url: None,
        artwork_revision: 0,
    };
    apply_cached_cover(&mut payload, cache, &track_key);
    payload
}

#[cfg(target_os = "macos")]
fn payload_fingerprint(payload: &NowPlayingPayload) -> String {
    let duration_key = payload
        .duration
        .filter(|d| *d >= 1.0)
        .map(|d| d.round() as i64)
        .unwrap_or(0);
    format!(
        "{}|{}|{}|{}|{:?}|{}|{}|{duration_key}",
        payload.active,
        payload.title.as_deref().unwrap_or(""),
        payload.artist.as_deref().unwrap_or(""),
        payload.album.as_deref().unwrap_or(""),
        payload.is_playing,
        payload.artwork_path.is_some() || payload.artwork_data_url.is_some(),
        payload.artwork_revision,
    )
}

#[cfg(target_os = "macos")]
fn notify_lyrics(app: &AppHandle, payload: &NowPlayingPayload) {
    if let Some(fetcher) = app.try_state::<lyrics::LyricsFetcher>() {
        fetcher.notify_track(
            app,
            &LyricTrackQuery {
                active: payload.active,
                title: payload.title.clone(),
                artist: payload.artist.clone(),
                album: payload.album.clone(),
                duration: payload.duration,
            },
        );
    }
}

#[cfg(target_os = "macos")]
fn emit_now_playing(app: &AppHandle, bridge: &InternalPlayerNowPlayingBridge, payload: NowPlayingPayload) {
    let key = payload_fingerprint(&payload);
    let mut fp = bridge
        .last_fingerprint
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if *fp == key {
        return;
    }
    *fp = key;
    if payload.active {
        if let Ok(mut cached) = bridge.last_payload.lock() {
            *cached = Some(payload.clone());
        }
    } else if let Ok(mut cached) = bridge.last_payload.lock() {
        *cached = None;
    }
    let _ = app.emit("now-playing-update", payload.clone());
    notify_lyrics(app, &payload);
}

#[cfg(target_os = "macos")]
fn maybe_fetch_cover(
    app: &AppHandle,
    bridge: &InternalPlayerNowPlayingBridge,
    snapshot: &MusicPlayerSnapshot,
) {
    let Some(idx) = snapshot.current_index else {
        return;
    };
    let Some(track) = snapshot.queue.get(idx) else {
        return;
    };
    let track_key = player_track_key(track, idx);
    let cover_url = track
        .cover
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let mut cache = bridge.cover.lock().unwrap_or_else(|e| e.into_inner());
    if cache.track_key == track_key && cache.source_url == cover_url.clone().unwrap_or_default() {
        return;
    }
    cache.track_key = track_key.clone();
    cache.source_url = cover_url.clone().unwrap_or_default();
    cache.artwork_path = None;
    cache.artwork_data_url = None;
    cache.revision = cache.revision.saturating_add(1);
    cache.fetch_token = cache.fetch_token.saturating_add(1);
    let token = cache.fetch_token;
    drop(cache);

    let Some(url) = cover_url else {
        let cache = bridge.cover.lock().unwrap_or_else(|e| e.into_inner());
        let payload = build_payload(snapshot, &cache);
        emit_now_playing(app, bridge, payload);
        return;
    };

    let provider = track.provider.clone();
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        let bytes = match fetch_cover_bytes(&provider, &url).await {
            Ok(b) => b,
            Err(err) => {
                eprintln!("internal player cover fetch failed: {err}");
                return;
            }
        };
        let bridge = app_for_task.state::<InternalPlayerNowPlayingBridge>();
        let mut cache = bridge.cover.lock().unwrap_or_else(|e| e.into_inner());
        if cache.fetch_token != token || cache.source_url != url {
            return;
        }
        let revision = cache.revision.saturating_add(1);
        if let Ok(img) = image::load_from_memory(&bytes) {
            if let Some(jpeg) = encode_cover_jpeg(&img, 512) {
                cache.artwork_path = write_player_cover_file(&app_for_task, &jpeg);
                cache.artwork_data_url = if cache.artwork_path.is_none() && jpeg.len() <= 48_000 {
                    Some(format!("data:image/jpeg;base64,{}", B64.encode(&jpeg)))
                } else {
                    None
                };
                cache.revision = revision;
            }
        }
        let player = app_for_task.state::<MusicPlayerState>();
        let snap = player.snapshot();
        let payload = build_payload(&snap, &cache);
        drop(cache);
        emit_now_playing(&app_for_task, &bridge, payload);
    });
}

#[cfg(target_os = "macos")]
impl InternalPlayerNowPlayingBridge {
    pub fn sync_from_player(app: &AppHandle, snapshot: &MusicPlayerSnapshot) {
        if !capture_source_is_internal_player(app) {
            return;
        }
        let bridge = app.state::<Self>();
        let cache = bridge.cover.lock().unwrap_or_else(|e| e.into_inner());
        let payload = build_payload(snapshot, &cache);
        drop(cache);
        emit_now_playing(app, &bridge, payload);
        maybe_fetch_cover(app, &bridge, snapshot);
    }

    pub fn sync_progress(app: &AppHandle, snapshot: &MusicPlayerSnapshot) {
        if !capture_source_is_internal_player(app) {
            return;
        }
        if snapshot.current_index.is_none() || !snapshot.playing {
            return;
        }
        #[derive(Clone, serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ProgressTick {
            elapsed_time: Option<f64>,
            duration: Option<f64>,
            is_playing: Option<bool>,
        }
        let duration_sec = if snapshot.duration_ms > 0 {
            Some(snapshot.duration_ms as f64 / 1000.0)
        } else {
            None
        };
        let _ = app.emit(
            "now-playing-progress",
            ProgressTick {
                elapsed_time: Some(snapshot.position_ms as f64 / 1000.0),
                duration: duration_sec,
                is_playing: Some(snapshot.playing && !snapshot.loading),
            },
        );
    }

    pub fn snapshot(app: &AppHandle, player: &MusicPlayerState) -> Option<NowPlayingPayload> {
        if !capture_source_is_internal_player(app) {
            return None;
        }
        let bridge = app.state::<Self>();
        let snap = player.snapshot();
        let cache = bridge.cover.lock().unwrap_or_else(|e| e.into_inner());
        Some(build_payload(&snap, &cache))
    }
}

#[cfg(not(target_os = "macos"))]
pub struct InternalPlayerNowPlayingBridge;
