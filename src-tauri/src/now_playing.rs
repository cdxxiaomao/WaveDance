//! macOS 系统「正在播放」元数据（Media Remote + Perl 适配器，兼容 15.4+）。

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::{imageops::thumbnail, DynamicImage, ExtendedColorType, ImageEncoder};
use media_remote::prelude::*;
use media_remote::{ListenerToken, NowPlayingInfo, NowPlayingPerl};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingPayload {
    pub active: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub bundle_id: Option<String>,
    pub bundle_name: Option<String>,
    pub is_playing: Option<bool>,
    pub elapsed_time: Option<f64>,
    pub duration: Option<f64>,
    /// 缓存目录中的封面 JPEG，前端用 `convertFileSrc` 加载。
    pub artwork_path: Option<String>,
    /// 小图标兜底（如 App 图标），体积较小时才内联。
    pub artwork_data_url: Option<String>,
    /// 封面文件更新序号，用于前端破除 img 缓存。
    pub artwork_revision: u64,
}

/// 轻量进度心跳，避免每秒克隆整份 NowPlayingPayload 经 IPC 下发。
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressTick {
    elapsed_time: Option<f64>,
    duration: Option<f64>,
    is_playing: Option<bool>,
}

#[derive(Default)]
struct LastFingerprint {
    key: String,
}

#[derive(Default)]
struct ArtworkCache {
    track_key: String,
    jpeg: Vec<u8>,
    revision: u64,
}

/// 在系统 `elapsedTime` 不刷新或恒为 0 时，用本地时钟推算当前进度。
#[derive(Default)]
struct PlaybackClock {
    track_key: String,
    base_elapsed: f64,
    anchor: Option<Instant>,
    playing: bool,
    duration: Option<f64>,
}

impl PlaybackClock {
    fn sync(
        &mut self,
        track_key: &str,
        elapsed: Option<f64>,
        duration: Option<f64>,
        playing: Option<bool>,
    ) {
        let playing = playing == Some(true);
        if self.track_key != track_key {
            self.track_key = track_key.to_string();
            self.base_elapsed = elapsed.unwrap_or(0.0).max(0.0);
            self.duration = duration;
            self.playing = playing;
            self.anchor = if playing { Some(Instant::now()) } else { None };
            return;
        }
        if duration.is_some() {
            self.duration = duration;
        }
        if let Some(e) = elapsed {
            let e = e.max(0.0);
            let drift = self
                .current()
                .map(|current| (current - e).abs() > 1.5)
                .unwrap_or(true);
            if self.playing != playing || drift {
                self.base_elapsed = e;
                self.anchor = if playing { Some(Instant::now()) } else { None };
            }
        }
        self.playing = playing;
        if playing && self.anchor.is_none() {
            self.anchor = Some(Instant::now());
        }
        if !playing {
            self.anchor = None;
        }
    }

    fn current(&self) -> Option<f64> {
        if !self.playing {
            return Some(self.base_elapsed);
        }
        let anchor = self.anchor?;
        let mut elapsed = self.base_elapsed + anchor.elapsed().as_secs_f64();
        if let Some(duration) = self.duration {
            if duration > 0.0 {
                elapsed = elapsed.min(duration);
            }
        }
        Some(elapsed.max(0.0))
    }
}

pub struct NowPlayingMonitor {
    perl: NowPlayingPerl,
    app: AppHandle,
    artwork_cache: Arc<Mutex<ArtworkCache>>,
    playback_clock: Arc<Mutex<PlaybackClock>>,
    last: Arc<Mutex<LastFingerprint>>,
    /// 最近一次成功推送给前端的快照（新开窗时优先复用，避免错过事件）。
    last_payload: Arc<Mutex<Option<NowPlayingPayload>>>,
    _token: ListenerToken,
}

impl NowPlayingMonitor {
    /// 读取当前系统正在播放信息（供晚加入的频谱窗初始化同步）。
    pub fn snapshot(&self) -> NowPlayingPayload {
        if let Ok(guard) = self.last_payload.lock() {
            if let Some(mut cached) = guard.clone() {
                if cached.active {
                    if let Ok(clock) = self.playback_clock.lock() {
                        cached.elapsed_time = clock.current();
                        if cached.duration.is_none() {
                            cached.duration = clock.duration;
                        }
                    }
                    return cached;
                }
            }
        }
        info_to_payload(
            &self.app,
            &self.artwork_cache,
            &self.playback_clock,
            self.perl.get_info().as_ref(),
        )
    }
}

#[cfg(not(target_os = "macos"))]
pub fn empty_payload() -> NowPlayingPayload {
    NowPlayingPayload {
        active: false,
        title: None,
        artist: None,
        album: None,
        bundle_id: None,
        bundle_name: None,
        is_playing: None,
        elapsed_time: None,
        duration: None,
        artwork_path: None,
        artwork_data_url: None,
        artwork_revision: 0,
    }
}

fn track_key(info: &NowPlayingInfo) -> String {
    format!(
        "{}|{}|{}|{}",
        info.title.as_deref().unwrap_or(""),
        info.artist.as_deref().unwrap_or(""),
        info.album.as_deref().unwrap_or(""),
        info.bundle_id.as_deref().unwrap_or(""),
    )
}

fn encode_cover_jpeg(cover: &DynamicImage) -> Option<Vec<u8>> {
    let thumb = DynamicImage::ImageRgba8(thumbnail(cover, 96, 96));
    let rgb = thumb.into_rgb8();
    let (w, h) = (rgb.width(), rgb.height());
    let mut buf = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut buf, 82);
    encoder
        .write_image(rgb.as_raw(), w, h, ExtendedColorType::Rgb8)
        .ok()?;
    (!buf.is_empty()).then_some(buf)
}

fn cover_from_info(info: &NowPlayingInfo) -> Option<Vec<u8>> {
    if let Some(cover) = info.album_cover.as_ref() {
        if let Some(jpeg) = encode_cover_jpeg(cover) {
            return Some(jpeg);
        }
    }
    if let Some(icon) = info.bundle_icon.as_ref() {
        return encode_cover_jpeg(icon);
    }
    None
}

fn resolve_artwork_jpeg(
    cache: &mut ArtworkCache,
    info: &NowPlayingInfo,
) -> Option<(Vec<u8>, u64)> {
    let key = track_key(info);
    if let Some(jpeg) = cover_from_info(info) {
        let revision = cache.revision.saturating_add(1);
        cache.track_key = key;
        cache.jpeg = jpeg;
        cache.revision = revision;
        return Some((cache.jpeg.clone(), revision));
    }
    if !cache.jpeg.is_empty() && cache.track_key == key {
        return Some((cache.jpeg.clone(), cache.revision));
    }
    if key != cache.track_key {
        cache.track_key.clear();
        cache.jpeg.clear();
    }
    None
}

fn write_artwork_file(app: &AppHandle, jpeg: &[u8]) -> Option<String> {
    let dir = app.path().app_cache_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join("now_playing_cover.jpg");
    std::fs::write(&path, jpeg).ok()?;
    Some(path.to_string_lossy().into_owned())
}

fn small_icon_data_url(icon: &DynamicImage) -> Option<String> {
    let jpeg = encode_cover_jpeg(icon)?;
    if jpeg.len() > 48_000 {
        return None;
    }
    Some(format!("data:image/jpeg;base64,{}", B64.encode(&jpeg)))
}

fn apply_playback_clock(payload: &mut NowPlayingPayload, clock: &mut PlaybackClock, info: &NowPlayingInfo) {
    let key = track_key(info);
    clock.sync(
        &key,
        info.elapsed_time,
        info.duration,
        info.is_playing,
    );
    payload.elapsed_time = clock.current();
    if payload.duration.is_none() {
        payload.duration = clock.duration;
    }
}

fn info_to_payload(
    app: &AppHandle,
    artwork_cache: &Mutex<ArtworkCache>,
    playback_clock: &Mutex<PlaybackClock>,
    info: Option<&NowPlayingInfo>,
) -> NowPlayingPayload {
    let Some(info) = info else {
        return NowPlayingPayload {
            active: false,
            title: None,
            artist: None,
            album: None,
            bundle_id: None,
            bundle_name: None,
            is_playing: None,
            elapsed_time: None,
            duration: None,
            artwork_path: None,
            artwork_data_url: None,
            artwork_revision: 0,
        };
    };

    let has_meta = info.title.is_some()
        || info.artist.is_some()
        || info.album.is_some()
        || info.bundle_id.is_some();

    let mut artwork_path = None;
    let mut artwork_data_url = None;
    let mut artwork_revision = 0u64;

    if has_meta {
        let mut cache = artwork_cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((jpeg, revision)) = resolve_artwork_jpeg(&mut cache, info) {
            artwork_revision = revision;
            artwork_path = write_artwork_file(app, &jpeg);
            if artwork_path.is_none() {
                artwork_data_url =
                    Some(format!("data:image/jpeg;base64,{}", B64.encode(&jpeg)));
            }
        } else if let Some(icon) = info.bundle_icon.as_ref() {
            artwork_data_url = small_icon_data_url(icon);
        }
    }

    let mut payload = NowPlayingPayload {
        active: has_meta,
        title: info.title.clone(),
        artist: info.artist.clone(),
        album: info.album.clone(),
        bundle_id: info.bundle_id.clone(),
        bundle_name: info.bundle_name.clone(),
        is_playing: info.is_playing,
        elapsed_time: info.elapsed_time,
        duration: info.duration,
        artwork_path,
        artwork_data_url,
        artwork_revision,
    };
    if has_meta {
        if let Ok(mut clock) = playback_clock.lock() {
            apply_playback_clock(&mut payload, &mut clock, info);
        }
    }
    payload
}

fn fingerprint(payload: &NowPlayingPayload) -> String {
    format!(
        "{}|{}|{}|{}|{:?}|{}|{}",
        payload.active,
        payload.title.as_deref().unwrap_or(""),
        payload.artist.as_deref().unwrap_or(""),
        payload.album.as_deref().unwrap_or(""),
        payload.is_playing,
        payload.artwork_path.is_some() || payload.artwork_data_url.is_some(),
        payload.artwork_revision,
    )
}

fn emit_if_changed(
    app: &AppHandle,
    last: &Mutex<LastFingerprint>,
    last_payload: &Mutex<Option<NowPlayingPayload>>,
    payload: NowPlayingPayload,
) {
    let key = fingerprint(&payload);
    let mut guard = last.lock().unwrap_or_else(|e| e.into_inner());
    if guard.key == key {
        return;
    }
    guard.key = key;
    if payload.active {
        if let Ok(mut cached) = last_payload.lock() {
            *cached = Some(payload.clone());
        }
    }
    let _ = app.emit("now-playing-update", payload.clone());
    if let Some(fetcher) = app.try_state::<crate::lyrics::LyricsFetcher>() {
        fetcher.notify_track(
            app,
            &crate::lyrics::LyricTrackQuery {
                active: payload.active,
                title: payload.title.clone(),
                artist: payload.artist.clone(),
                album: payload.album.clone(),
                duration: payload.duration,
            },
        );
    }
}

fn spawn_progress_ticker(
    app: AppHandle,
    last_payload: Arc<Mutex<Option<NowPlayingPayload>>>,
    playback_clock: Arc<Mutex<PlaybackClock>>,
) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(1));
            let payload = match last_payload.lock() {
                Ok(guard) => guard.clone(),
                Err(_) => continue,
            };
            let Some(payload) = payload else { continue };
            if !payload.active || payload.is_playing != Some(true) {
                continue;
            }
            let elapsed = match playback_clock.lock() {
                Ok(clock) => clock.current(),
                Err(_) => continue,
            };
            let _ = app.emit(
                "now-playing-progress",
                ProgressTick {
                    elapsed_time: elapsed,
                    duration: payload.duration,
                    is_playing: payload.is_playing,
                },
            );
        }
    });
}

pub fn spawn_monitor(app: AppHandle) -> NowPlayingMonitor {
    let perl = NowPlayingPerl::new();
    let last = Arc::new(Mutex::new(LastFingerprint::default()));
    let last_payload = Arc::new(Mutex::new(None));
    let artwork_cache = Arc::new(Mutex::new(ArtworkCache::default()));
    let playback_clock = Arc::new(Mutex::new(PlaybackClock::default()));
    let app_for_sub = app.clone();
    let last_for_sub = last.clone();
    let last_payload_for_sub = last_payload.clone();
    let cache_for_sub = artwork_cache.clone();
    let clock_for_sub = playback_clock.clone();

    let token = perl.subscribe(move |guard| {
        let payload = info_to_payload(
            &app_for_sub,
            &cache_for_sub,
            &clock_for_sub,
            guard.as_ref(),
        );
        emit_if_changed(
            &app_for_sub,
            last_for_sub.as_ref(),
            last_payload_for_sub.as_ref(),
            payload,
        );
    });

    let initial = info_to_payload(
        &app,
        &artwork_cache,
        &playback_clock,
        perl.get_info().as_ref(),
    );
    emit_if_changed(
        &app,
        last.as_ref(),
        last_payload.as_ref(),
        initial,
    );

    spawn_progress_ticker(app.clone(), last_payload.clone(), playback_clock.clone());

    NowPlayingMonitor {
        perl,
        app,
        artwork_cache,
        playback_clock,
        last,
        last_payload,
        _token: token,
    }
}
