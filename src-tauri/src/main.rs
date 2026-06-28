#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod esp_display;
mod lyrics;

#[cfg(target_os = "macos")]
mod music_platform;
#[cfg(target_os = "macos")]
mod now_playing;

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, AtomicU8, AtomicU32, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;

#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSColor, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowOrderingMode,
    NSWindowStyleMask,
};
#[cfg(target_os = "macos")]
use window_vibrancy::clear_vibrancy;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use tauri::{
    window::{Effect, EffectState, EffectsBuilder},
    ActivationPolicy, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    Position, RunEvent, Size, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
#[cfg(target_os = "macos")]
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use wavedance::audio_capture::{AudioSource, MacSystemAudioSource};
use wavedance::audio_processing::{
    downsample_time_domain, WaveformFrame, TIME_DOMAIN_SAMPLE_COUNT,
};
use wavedance::platform::PlatformService;

fn gate_to_micro(gate: f32) -> u32 {
    (gate.clamp(0.0, 0.05) * 1_000_000.0).round() as u32
}

fn micro_to_gate(micro: u32) -> f32 {
    micro as f32 / 1_000_000.0
}

#[cfg(target_os = "macos")]
pub(crate) fn capture_source_is_internal_player(app: &tauri::AppHandle) -> bool {
    app.state::<StreamState>()
        .capture_source_mode
        .load(Ordering::Relaxed)
        == 2
}

#[cfg(target_os = "macos")]
fn current_now_playing_snapshot(app: &tauri::AppHandle) -> now_playing::NowPlayingPayload {
    if capture_source_is_internal_player(app) {
        if let Some(payload) = music_platform::InternalPlayerNowPlayingBridge::snapshot(
            app,
            &app.state::<music_platform::MusicPlayerState>(),
        ) {
            if payload.active {
                return payload;
            }
        }
    }
    app.state::<now_playing::NowPlayingMonitor>().snapshot()
}

struct StreamState {
    running: Arc<AtomicBool>,
    capture_source_mode: Arc<AtomicU8>,
    overlay_pinned: Arc<AtomicBool>,
    /// 各频谱窗（`main` / `spectrum-*`）是否启用系统毛玻璃；未记录视为关闭。
    overlay_blur_by_label: Arc<Mutex<HashMap<String, bool>>>,
    /// 各图形窗（`main` / `spectrum-*`）整窗鼠标穿透是否开启；键存在且为 true 表示锁定。
    mouse_passthrough_by_label: Arc<Mutex<HashMap<String, bool>>>,
    /// 已为对应 `spectrum-*` 注册过「移动/缩放时重贴浮动解锁条」监听，避免重复绑定。
    spectrum_toolbar_follow_wired: Arc<Mutex<HashSet<String>>>,
    bucket_count: Arc<AtomicUsize>,
    bucket_mode: Arc<AtomicU8>,
    high_tilt_percent: Arc<AtomicUsize>,
    freq_min_hz: Arc<AtomicUsize>,
    freq_max_hz: Arc<AtomicUsize>,
    /// 静默 Peak 门限，固定小数 6 位（例：100 → 0.0001）。
    silence_peak_gate_micro: Arc<AtomicU32>,
    /// 静默 RMS 门限，固定小数 6 位（例：100 → 0.0001）。
    silence_rms_gate_micro: Arc<AtomicU32>,
    waveform_color_hex: Arc<Mutex<String>>,
    /// 波形线宽（逻辑像素），由前端用多条竖直偏移的 LINE_STRIP 模拟；WebGL 的 lineWidth 在浏览器中常无效。
    waveform_line_width_px: Arc<AtomicUsize>,
    /// 用于生成额外频谱窗口标签 `spectrum-{n}`（与主窗共用采集与 `waveform-frame` 广播）。
    spectrum_window_counter: Arc<AtomicU64>,
    /// 用于生成额外歌词窗口标签 `lyrics-{n}`。
    lyrics_window_counter: Arc<AtomicU64>,
    /// 用于生成额外封面窗口标签 `cover-{n}`。
    cover_window_counter: Arc<AtomicU64>,
    /// 用于生成额外歌曲信息窗口标签 `songinfo-{n}`。
    songinfo_window_counter: Arc<AtomicU64>,
    /// 额外频谱窗是否为浮层模式（可覆盖全屏应用）；false 为传统窗口（可正常全屏）。
    spectrum_overlay_by_label: Arc<Mutex<HashMap<String, bool>>>,
    /// 设置页当前编辑的频谱窗口 label（`main` 或 `spectrum-*`）；外观类事件只发往该窗。
    visual_settings_target: Arc<Mutex<String>>,
    /// 歌词设置页当前编辑的歌词窗 label（`lyrics-*`）。
    lyrics_settings_target: Arc<Mutex<String>>,
    /// 歌词加载信息页所关联的歌词窗 label（`lyrics-*`）。
    lyrics_search_target: Arc<Mutex<String>>,
    /// 封面设置页当前编辑的封面窗 label（`cover-*`）。
    cover_settings_target: Arc<Mutex<String>>,
    /// 歌曲信息设置页当前编辑的窗口 label（`songinfo-*`）。
    songinfo_settings_target: Arc<Mutex<String>>,
    /// 播放控制设置页所关联的窗口 label（`music-player`）。
    player_settings_target: Arc<Mutex<String>>,
    /// ESP32 外接屏串口推送（Type-C）。
    esp_display: Arc<esp_display::EspDisplayState>,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            capture_source_mode: Arc::new(AtomicU8::new(2)),
            overlay_pinned: Arc::new(AtomicBool::new(true)),
            overlay_blur_by_label: Arc::new(Mutex::new(HashMap::new())),
            mouse_passthrough_by_label: Arc::new(Mutex::new(HashMap::new())),
            spectrum_toolbar_follow_wired: Arc::new(Mutex::new(HashSet::new())),
            bucket_count: Arc::new(AtomicUsize::new(256)),
            bucket_mode: Arc::new(AtomicU8::new(1)),
            high_tilt_percent: Arc::new(AtomicUsize::new(35)),
            freq_min_hz: Arc::new(AtomicUsize::new(480)),
            freq_max_hz: Arc::new(AtomicUsize::new(7_600)),
            silence_peak_gate_micro: Arc::new(AtomicU32::new(gate_to_micro(
                wavedance::esp_display::protocol::DEFAULT_SILENCE_PEAK_GATE,
            ))),
            silence_rms_gate_micro: Arc::new(AtomicU32::new(gate_to_micro(
                wavedance::esp_display::protocol::DEFAULT_SILENCE_RMS_GATE,
            ))),
            waveform_color_hex: Arc::new(Mutex::new("#c4a574".to_string())),
            waveform_line_width_px: Arc::new(AtomicUsize::new(2)),
            spectrum_window_counter: Arc::new(AtomicU64::new(0)),
            lyrics_window_counter: Arc::new(AtomicU64::new(0)),
            cover_window_counter: Arc::new(AtomicU64::new(0)),
            songinfo_window_counter: Arc::new(AtomicU64::new(0)),
            spectrum_overlay_by_label: Arc::new(Mutex::new(HashMap::new())),
            visual_settings_target: Arc::new(Mutex::new("main".to_string())),
            lyrics_settings_target: Arc::new(Mutex::new(String::new())),
            lyrics_search_target: Arc::new(Mutex::new(String::new())),
            cover_settings_target: Arc::new(Mutex::new(String::new())),
            songinfo_settings_target: Arc::new(Mutex::new(String::new())),
            player_settings_target: Arc::new(Mutex::new(String::new())),
            esp_display: Arc::new(esp_display::EspDisplayState::default()),
        }
    }
}

const SPECTRUM_WINDOW_LABEL_PREFIX: &str = "spectrum-";
const LYRICS_WINDOW_LABEL_PREFIX: &str = "lyrics-";
const COVER_WINDOW_LABEL_PREFIX: &str = "cover-";
const SONGINFO_WINDOW_LABEL_PREFIX: &str = "songinfo-";
const WINDOW_MANAGER_LABEL: &str = "window-manager";
const ESP_DISPLAY_SETTINGS_LABEL: &str = "esp-display-settings";
#[cfg(target_os = "macos")]
const MUSIC_PLATFORM_LOGIN_LABEL: &str = music_platform::MUSIC_PLATFORM_LOGIN_LABEL;
#[cfg(target_os = "macos")]
const MUSIC_PLAYLIST_LABEL: &str = music_platform::MUSIC_PLAYLIST_LABEL;
const MUSIC_PLAYER_QUEUE_LABEL: &str = music_platform::MUSIC_PLAYER_QUEUE_LABEL;
const PLAYER_SETTINGS_LABEL: &str = "player-settings";
#[cfg(target_os = "macos")]
const MUSIC_PLAYER_LABEL: &str = music_platform::MUSIC_PLAYER_LABEL;
#[cfg(target_os = "macos")]
const QQ_MUSIC_LOGIN_LABEL: &str = music_platform::QQ_MUSIC_LOGIN_LABEL;
const PASSTHROUGH_TOOLBAR_LABEL_PREFIX: &str = "ptb-";

/// 浮层窗叠放层级：歌词 / 封面 / 歌曲信息须始终高于浮层频谱（`main` / `spectrum-*`）。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OverlayWindowStackTier {
    Spectrum,
    NowPlayingInfo,
    /// 频谱/歌词/封面/歌曲信息设置子窗及歌词加载窗
    Settings,
}

#[cfg(target_os = "macos")]
/// 置顶浮层基准层级：须低于 `NSPopUpMenuWindowLevel`（101），否则托盘下拉菜单会被遮挡。
const OVERLAY_PINNED_BASE_LEVEL: isize = NSStatusWindowLevel;
#[cfg(target_os = "macos")]
/// 未置顶时，歌词/封面/歌曲信息略高于普通浮层频谱，避免点击抢焦点后互相遮挡。
const OVERLAY_UNPINNED_NOW_PLAYING_LEVEL: isize = 3;
#[cfg(target_os = "macos")]
/// 置顶时，在基准层级之上再抬高，保证浮层频谱无法盖住信息窗。
const OVERLAY_NOW_PLAYING_ABOVE_SPECTRUM_LEVEL_OFFSET: isize = 10;
#[cfg(target_os = "macos")]
/// 置顶时，设置子窗高于歌词/封面/歌曲信息浮层，避免重排层级时被盖住。
const OVERLAY_SETTINGS_ABOVE_NOW_PLAYING_LEVEL_OFFSET: isize = 10;
#[cfg(target_os = "macos")]
/// 窗口管理始终高于设置子窗，便于在浮层之上操作窗口列表。
const WINDOW_MANAGER_ABOVE_SETTINGS_LEVEL_OFFSET: isize = 10;

fn is_settings_window_label(label: &str) -> bool {
    matches!(
        label,
        "settings" | "lyrics-settings" | "cover-settings" | "songinfo-settings" | "player-settings" | "lyrics-search"
    )
}

fn is_internal_auxiliary_window_label(label: &str) -> bool {
    label == WINDOW_MANAGER_LABEL
        || label == ESP_DISPLAY_SETTINGS_LABEL
        || label == "main-toolbar"
        || label.starts_with(PASSTHROUGH_TOOLBAR_LABEL_PREFIX)
        || {
            #[cfg(target_os = "macos")]
            {
                label == QQ_MUSIC_LOGIN_LABEL
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = label;
                false
            }
        }
}

fn suffix_number(label: &str, prefix: &str) -> u32 {
    label
        .strip_prefix(prefix)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn managed_window_sort_key(label: &str) -> (u8, u32, String) {
    if label == "main" {
        return (0, 0, String::new());
    }
    if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        return (
            1,
            suffix_number(label, SPECTRUM_WINDOW_LABEL_PREFIX),
            String::new(),
        );
    }
    if label.starts_with(LYRICS_WINDOW_LABEL_PREFIX) {
        return (
            2,
            suffix_number(label, LYRICS_WINDOW_LABEL_PREFIX),
            String::new(),
        );
    }
    if label.starts_with(COVER_WINDOW_LABEL_PREFIX) {
        return (
            3,
            suffix_number(label, COVER_WINDOW_LABEL_PREFIX),
            String::new(),
        );
    }
    if label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX) {
        return (
            4,
            suffix_number(label, SONGINFO_WINDOW_LABEL_PREFIX),
            String::new(),
        );
    }
    if label == "settings" {
        return (5, 0, String::new());
    }
    if label == "lyrics-settings" {
        return (5, 1, String::new());
    }
    if label == "cover-settings" {
        return (5, 2, String::new());
    }
    if label == "songinfo-settings" {
        return (5, 3, String::new());
    }
    if label == "player-settings" {
        return (5, 4, String::new());
    }
    if label == "lyrics-search" {
        return (5, 5, String::new());
    }
    (6, 0, label.to_string())
}

fn managed_window_display_name(state: &StreamState, label: &str) -> String {
    match label {
        "main" => "主频谱窗口".to_string(),
        "settings" => "频谱设置".to_string(),
        "lyrics-settings" => "歌词设置".to_string(),
        "cover-settings" => "封面设置".to_string(),
        "songinfo-settings" => "歌曲信息设置".to_string(),
        "player-settings" => "播放控制设置".to_string(),
        "lyrics-search" => "歌词加载".to_string(),
        l if l.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) => {
            let n = l.strip_prefix(SPECTRUM_WINDOW_LABEL_PREFIX).unwrap_or(l);
            if spectrum_is_overlay_mode(state, l) {
                format!("浮层频谱 · {n}")
            } else {
                format!("传统频谱 · {n}")
            }
        }
        l if l.starts_with(LYRICS_WINDOW_LABEL_PREFIX) => {
            let n = l.strip_prefix(LYRICS_WINDOW_LABEL_PREFIX).unwrap_or(l);
            format!("歌词 · {n}")
        }
        l if l.starts_with(COVER_WINDOW_LABEL_PREFIX) => {
            let n = l.strip_prefix(COVER_WINDOW_LABEL_PREFIX).unwrap_or(l);
            format!("封面 · {n}")
        }
        l if l.starts_with(SONGINFO_WINDOW_LABEL_PREFIX) => {
            let n = l.strip_prefix(SONGINFO_WINDOW_LABEL_PREFIX).unwrap_or(l);
            format!("歌曲信息 · {n}")
        }
        l if {
            #[cfg(target_os = "macos")]
            {
                l == MUSIC_PLAYLIST_LABEL || l == MUSIC_PLAYER_LABEL || l == MUSIC_PLAYER_QUEUE_LABEL
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = l;
                false
            }
        } => {
            #[cfg(target_os = "macos")]
            {
                if l == MUSIC_PLAYER_LABEL {
                    "播放控制".to_string()
                } else if l == MUSIC_PLAYER_QUEUE_LABEL {
                    "播放列表".to_string()
                } else {
                    "歌单".to_string()
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                l.to_string()
            }
        }
        other => other.to_string(),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedWindowInfo {
    label: String,
    title: String,
    visible: bool,
}

fn is_now_playing_overlay_label(label: &str) -> bool {
    label.starts_with(LYRICS_WINDOW_LABEL_PREFIX)
        || label.starts_with(COVER_WINDOW_LABEL_PREFIX)
        || label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX)
        || {
            #[cfg(target_os = "macos")]
            {
                is_music_overlay_label(label)
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = label;
                false
            }
        }
}

#[cfg(target_os = "macos")]
fn macos_overlay_window_level(tier: OverlayWindowStackTier, pinned: bool) -> isize {
    match (tier, pinned) {
        (OverlayWindowStackTier::Spectrum, true) => OVERLAY_PINNED_BASE_LEVEL,
        (OverlayWindowStackTier::Spectrum, false) => 0,
        (OverlayWindowStackTier::NowPlayingInfo, true) => {
            OVERLAY_PINNED_BASE_LEVEL + OVERLAY_NOW_PLAYING_ABOVE_SPECTRUM_LEVEL_OFFSET
        }
        (OverlayWindowStackTier::NowPlayingInfo, false) => OVERLAY_UNPINNED_NOW_PLAYING_LEVEL,
        (OverlayWindowStackTier::Settings, true) => {
            OVERLAY_PINNED_BASE_LEVEL
                + OVERLAY_NOW_PLAYING_ABOVE_SPECTRUM_LEVEL_OFFSET
                + OVERLAY_SETTINGS_ABOVE_NOW_PLAYING_LEVEL_OFFSET
        }
        (OverlayWindowStackTier::Settings, false) => 8,
    }
}

fn is_spectrum_overlay_label(app: &tauri::AppHandle, label: &str) -> bool {
    if label == "main" {
        return true;
    }
    if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        let state = app.state::<StreamState>();
        return spectrum_is_overlay_mode(&state, label);
    }
    false
}

fn overlay_tier_for_label(
    app: &tauri::AppHandle,
    label: &str,
) -> Option<OverlayWindowStackTier> {
    if is_spectrum_overlay_label(app, label) {
        Some(OverlayWindowStackTier::Spectrum)
    } else if is_now_playing_overlay_label(label) {
        Some(OverlayWindowStackTier::NowPlayingInfo)
    } else {
        None
    }
}

/// macOS：为浮层窗/设置子窗重设 NSWindow level（频谱 < 信息窗 < 设置窗）。
/// 不可对浮层窗调用 Tauri `set_always_on_top`，否则会改回 `NSFloatingWindowLevel` 导致拖动抢层。
#[cfg(target_os = "macos")]
fn apply_macos_overlay_window_level(
    window: &tauri::WebviewWindow,
    tier: OverlayWindowStackTier,
    pinned: bool,
) -> tauri::Result<()> {
    let level = macos_overlay_window_level(tier, pinned);
    let w = window.clone();
    window.run_on_main_thread(move || unsafe {
        let ns_window: &NSWindow = &*w
            .ns_window()
            .expect("无法获取 macOS 窗口句柄")
            .cast();
        ns_window.setLevel(level);
    })
}

#[cfg(target_os = "macos")]
fn configure_settings_window_level(
    window: &tauri::WebviewWindow,
    pinned: bool,
) -> tauri::Result<()> {
    apply_macos_overlay_window_level(window, OverlayWindowStackTier::Settings, pinned)
}

#[cfg(target_os = "macos")]
fn macos_window_manager_level() -> isize {
    macos_overlay_window_level(OverlayWindowStackTier::Settings, true)
        + WINDOW_MANAGER_ABOVE_SETTINGS_LEVEL_OFFSET
}

fn configure_window_manager_level(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let level = macos_window_manager_level();
        let w = window.clone();
        return window.run_on_main_thread(move || unsafe {
            let ns_window: &NSWindow = &*w
                .ns_window()
                .expect("无法获取 macOS 窗口句柄")
                .cast();
            ns_window.setLevel(level);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        window.set_always_on_top(true)
    }
}

fn raise_window_manager_if_visible(app: &tauri::AppHandle) -> tauri::Result<()> {
    let Some(win) = app.get_webview_window(WINDOW_MANAGER_LABEL) else {
        return Ok(());
    };
    if !win.is_visible().unwrap_or(false) {
        return Ok(());
    }
    configure_window_manager_level(&win)?;
    #[cfg(target_os = "macos")]
    {
        let w = win.clone();
        win.run_on_main_thread(move || unsafe {
            let ns_window: &NSWindow = &*w
                .ns_window()
                .expect("无法获取 macOS 窗口句柄")
                .cast();
            ns_window.orderFrontRegardless();
        })?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn raise_visible_settings_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);
    for (label, win) in app.webview_windows() {
        if !is_settings_window_label(&label) {
            continue;
        }
        if !win.is_visible().unwrap_or(false) {
            continue;
        }
        configure_settings_window_level(&win, pinned)?;
        let w = win.clone();
        win.run_on_main_thread(move || unsafe {
            let ns_window: &NSWindow = &*w
                .ns_window()
                .expect("无法获取 macOS 窗口句柄")
                .cast();
            ns_window.orderFrontRegardless();
        })?;
    }
    Ok(())
}

fn apply_settings_window_stack(
    settings: &tauri::WebviewWindow,
    pinned: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    configure_settings_window_level(settings, pinned).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    settings
        .set_always_on_top(pinned)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn show_settings_window(
    app: &tauri::AppHandle,
    settings: &tauri::WebviewWindow,
    pinned: bool,
) -> Result<(), String> {
    apply_settings_window_stack(settings, pinned)?;
    settings.show().map_err(|e| e.to_string())?;
    settings.set_focus().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    raise_visible_settings_windows(app).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn reassert_overlay_window_stack(app: &tauri::AppHandle) -> tauri::Result<()> {
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    for (label, win) in app.webview_windows() {
        if let Some(tier) = overlay_tier_for_label(app, &label) {
            apply_macos_overlay_window_level(&win, tier, pinned)?;
        } else if is_settings_window_label(&label) {
            configure_settings_window_level(&win, pinned)?;
        }
    }

    raise_visible_settings_windows(app)?;
    raise_window_manager_if_visible(app)
}

#[cfg(not(target_os = "macos"))]
fn reassert_overlay_window_stack(app: &tauri::AppHandle) -> tauri::Result<()> {
    for (label, win) in app.webview_windows() {
        if is_now_playing_overlay_label(&label) {
            win.show()?;
        }
    }
    Ok(())
}

/// 将歌词 / 封面 / 歌曲信息浮层窗叠到浮层频谱之上。
fn raise_now_playing_overlay_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    reassert_overlay_window_stack(app)
}
const COVER_MIN_SIDE_PX: i32 = 120;

/// 封面窗缩放后强制为正方形，并按拖拽锚边修正位置。
fn apply_cover_square_size(
    x: &mut i32,
    y: &mut i32,
    width: &mut i32,
    height: &mut i32,
    right: i32,
    bottom: i32,
    resize_west: bool,
    resize_north: bool,
) {
    let side = (*width).max(*height).max(COVER_MIN_SIDE_PX);
    if resize_west {
        *x = right - side;
    }
    if resize_north {
        *y = bottom - side;
    }
    *width = side;
    *height = side;
}

fn wire_cover_window_square_resize(win: tauri::WebviewWindow) {
    let win_for_handler = win.clone();
    let enforcing = Arc::new(AtomicBool::new(false));
    win.on_window_event(move |event| {
        if let WindowEvent::Resized(size) = event {
            if enforcing.load(Ordering::SeqCst) {
                return;
            }
            let w = size.width;
            let h = size.height;
            let side = w.max(h).max(COVER_MIN_SIDE_PX as u32);
            if w == side && h == side {
                return;
            }
            enforcing.store(true, Ordering::SeqCst);
            let _ = win_for_handler.set_size(Size::Physical(PhysicalSize::new(side, side)));
            enforcing.store(false, Ordering::SeqCst);
        }
    });
}

fn is_music_overlay_label(label: &str) -> bool {
    label == MUSIC_PLAYLIST_LABEL
        || label == MUSIC_PLAYER_LABEL
        || label == MUSIC_PLAYER_QUEUE_LABEL
}

fn is_passthrough_capable_label(label: &str) -> bool {
    label == "main"
        || label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX)
        || label.starts_with(LYRICS_WINDOW_LABEL_PREFIX)
        || label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX)
        || {
            #[cfg(target_os = "macos")]
            {
                is_music_overlay_label(label)
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = label;
                false
            }
        }
}

#[derive(Clone, serde::Serialize)]
struct MousePassthroughChangedPayload {
    label: String,
    locked: bool,
}

fn label_passthrough_locked(state: &StreamState, label: &str) -> bool {
    state
        .mouse_passthrough_by_label
        .lock()
        .ok()
        .map(|m| m.contains_key(label))
        .unwrap_or(false)
}

fn is_blur_capable_label(label: &str) -> bool {
    label == "main"
        || label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX)
        || label == MUSIC_PLAYER_LABEL
}

fn label_blur_enabled(state: &StreamState, label: &str) -> bool {
    state
        .overlay_blur_by_label
        .lock()
        .ok()
        .and_then(|m| m.get(label).copied())
        .unwrap_or(false)
}

/// 频谱窗 `spectrum-N` 对应的穿透解锁浮动子窗标签（与 `main-toolbar` 区分）。
fn toolbar_webview_label_for_spectrum(spectrum_label: &str) -> String {
    format!("ptb-{spectrum_label}")
}

fn spectrum_is_overlay_mode(state: &StreamState, label: &str) -> bool {
    state
        .spectrum_overlay_by_label
        .lock()
        .ok()
        .and_then(|m| m.get(label).copied())
        .unwrap_or(true)
}

/// 浮层歌词窗与浮层频谱窗：穿透锁定时隐藏浮动解锁条，仅边缘触发时临时显示。
fn overlay_uses_edge_reveal_unlock(state: &StreamState, label: &str) -> bool {
    label.starts_with(LYRICS_WINDOW_LABEL_PREFIX)
        || label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX)
        || {
            #[cfg(target_os = "macos")]
            {
                is_music_overlay_label(label)
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = label;
                false
            }
        }
        || (label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) && spectrum_is_overlay_mode(state, label))
}

fn app_has_open_traditional_spectrum_window(app: &tauri::AppHandle) -> bool {
    let state = app.state::<StreamState>();
    app.webview_windows().keys().any(|label| {
        label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX)
            && !spectrum_is_overlay_mode(&state, label)
    })
}

/// 传统频谱窗需要 Regular 激活策略，否则 macOS 只会放大窗口而不会进入独占 Space 全屏。
#[cfg(target_os = "macos")]
fn sync_app_activation_policy(app: &tauri::AppHandle) {
    let policy = if app_has_open_traditional_spectrum_window(app) {
        ActivationPolicy::Regular
    } else {
        ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
}

#[cfg(not(target_os = "macos"))]
fn sync_app_activation_policy(_app: &tauri::AppHandle) {}

fn wire_spectrum_window_activation_policy(app: &tauri::AppHandle, label: &str) {
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });
}

/// 额外频谱窗口：浮层窗跟随置顶/模糊；传统窗仅跟随模糊与**本窗**穿透状态。
fn refresh_spectrum_clone_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    for (label, win) in app.webview_windows() {
        if !label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
            continue;
        }
        let blur_enabled = label_blur_enabled(&state, &label);
        let locked = label_passthrough_locked(&state, &label);
        if spectrum_is_overlay_mode(&state, &label) {
            #[cfg(target_os = "macos")]
            configure_overlay_window(
                win,
                OverlayWindowStackTier::Spectrum,
                pinned,
                blur_enabled,
                locked,
            )?;
            #[cfg(not(target_os = "macos"))]
            {
                win.set_always_on_top(pinned)?;
                let _ = win.set_ignore_cursor_events(locked);
            }
        } else {
            #[cfg(target_os = "macos")]
            configure_traditional_window(win, blur_enabled, locked)?;
            #[cfg(not(target_os = "macos"))]
            {
                win.set_always_on_top(false)?;
                let _ = win.set_ignore_cursor_events(locked);
            }
        }
    }
    raise_now_playing_overlay_windows(app)?;
    Ok(())
}

/// 额外歌词浮层窗：跟随全局置顶/模糊与各自穿透状态。
fn refresh_lyrics_clone_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    for (label, win) in app.webview_windows() {
        if !label.starts_with(LYRICS_WINDOW_LABEL_PREFIX) {
            continue;
        }
        let blur_enabled = label_blur_enabled(&state, &label);
        let locked = label_passthrough_locked(&state, &label);
        #[cfg(target_os = "macos")]
        configure_overlay_window(
            win,
            OverlayWindowStackTier::NowPlayingInfo,
            pinned,
            blur_enabled,
            locked,
        )?;
        #[cfg(not(target_os = "macos"))]
        {
            win.set_always_on_top(pinned)?;
            let _ = win.set_ignore_cursor_events(locked);
        }
    }
    Ok(())
}

/// 歌单浮层窗：跟随全局置顶/模糊与穿透状态。
fn refresh_playlist_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let Some(win) = app.get_webview_window(MUSIC_PLAYLIST_LABEL) else {
            return Ok(());
        };
        let state = app.state::<StreamState>();
        let pinned = state.overlay_pinned.load(Ordering::SeqCst);
        let locked = label_passthrough_locked(&state, MUSIC_PLAYLIST_LABEL);
        configure_overlay_window(
            win,
            OverlayWindowStackTier::NowPlayingInfo,
            pinned,
            true,
            locked,
        )?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
    Ok(())
}

/// 额外封面浮层窗：跟随全局置顶/模糊。
fn refresh_cover_clone_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    for (label, win) in app.webview_windows() {
        if !label.starts_with(COVER_WINDOW_LABEL_PREFIX) {
            continue;
        }
        let blur_enabled = label_blur_enabled(&state, &label);
        #[cfg(target_os = "macos")]
        configure_cover_overlay_window(win, pinned, blur_enabled)?;
        #[cfg(not(target_os = "macos"))]
        {
            win.set_always_on_top(pinned)?;
            let _ = win.set_ignore_cursor_events(false);
        }
    }
    Ok(())
}

/// 额外歌曲信息浮层窗：跟随全局置顶/模糊与各自穿透状态。
fn refresh_songinfo_clone_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    for (label, win) in app.webview_windows() {
        if !label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX) {
            continue;
        }
        let blur_enabled = label_blur_enabled(&state, &label);
        let locked = label_passthrough_locked(&state, &label);
        #[cfg(target_os = "macos")]
        configure_overlay_window(
            win,
            OverlayWindowStackTier::NowPlayingInfo,
            pinned,
            blur_enabled,
            locked,
        )?;
        #[cfg(not(target_os = "macos"))]
        {
            win.set_always_on_top(pinned)?;
            let _ = win.set_ignore_cursor_events(locked);
        }
    }
    Ok(())
}

fn normalize_waveform_color_hex(input: &str) -> Result<String, String> {
    let s = input.trim();
    let body = s
        .strip_prefix('#')
        .ok_or_else(|| "颜色须为 #RRGGBB 十六进制格式".to_string())?;
    if body.len() != 6 || !body.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("颜色须为 #RRGGBB 十六进制格式".to_string());
    }
    Ok(format!("#{}", body.to_ascii_lowercase()))
}

fn rebucket_points(points: &[f32], bucket_count: usize) -> Vec<f32> {
    if points.is_empty() {
        return Vec::new();
    }
    let target = bucket_count.clamp(8, 500);
    if points.len() <= target {
        return points.to_vec();
    }

    let mut out = Vec::with_capacity(target);
    for i in 0..target {
        let start = i * points.len() / target;
        let end = ((i + 1) * points.len() / target).max(start + 1);
        let slice = &points[start..end];
        let avg = slice.iter().sum::<f32>() / slice.len() as f32;
        out.push(avg);
    }
    out
}

fn mono_from_interleaved(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    samples
        .chunks(channels)
        .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
        .collect()
}

fn compute_peak_rms(samples: &[f32]) -> (f32, f32) {
    if samples.is_empty() {
        return (0.0, 0.0);
    }
    let peak = samples.iter().fold(0.0_f32, |acc, v| acc.max(v.abs()));
    let rms = (samples.iter().map(|v| v * v).sum::<f32>() / samples.len() as f32).sqrt();
    (peak, rms)
}

fn spectrum_bands_from_frame(
    mono_samples: &[f32],
    sample_rate: u32,
    bucket_count: usize,
    fft_size: usize,
    log_mode: bool,
    high_tilt_percent: usize,
    freq_min_hz: usize,
    freq_max_hz: usize,
) -> Vec<f32> {
    if mono_samples.is_empty() {
        return Vec::new();
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    let mut buffer: Vec<Complex<f32>> = (0..fft_size)
        .map(|i| {
            let sample = *mono_samples.get(i).unwrap_or(&0.0);
            let w =
                0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (fft_size as f32 - 1.0)).cos();
            Complex::new(sample * w, 0.0)
        })
        .collect();

    fft.process(&mut buffer);

    let half = fft_size / 2;
    let magnitudes: Vec<f32> = buffer[..half].iter().map(|c| c.norm()).collect();
    let nyquist = sample_rate as f32 / 2.0;
    let target = bucket_count.clamp(8, 500);
    let min_freq = (freq_min_hz as f32).max(20.0).min(nyquist - 1.0);
    let max_freq = (freq_max_hz as f32).max(min_freq + 1.0).min(nyquist);

    // 可切换 log/linear 分桶；并支持高频补偿。
    let mut bands = Vec::with_capacity(target);
    for i in 0..target {
        let start_ratio = i as f32 / target as f32;
        let end_ratio = (i + 1) as f32 / target as f32;
        let (start_freq, end_freq) = if log_mode {
            (
                min_freq * (max_freq / min_freq).powf(start_ratio),
                min_freq * (max_freq / min_freq).powf(end_ratio),
            )
        } else {
            (
                min_freq + start_ratio * (max_freq - min_freq),
                min_freq + end_ratio * (max_freq - min_freq),
            )
        };
        let start_bin = ((start_freq / nyquist) * half as f32).floor() as usize;
        let end_bin = ((end_freq / nyquist) * half as f32).ceil() as usize;
        let s = start_bin.min(half.saturating_sub(1));
        let e = end_bin.max(s + 1).min(half);
        let slice = &magnitudes[s..e];
        let mut avg = slice.iter().sum::<f32>() / slice.len() as f32;
        let tilt = 1.0 + (high_tilt_percent as f32 / 100.0) * start_ratio;
        avg *= tilt;
        bands.push(avg.max(0.0));
    }

    let max_band = bands.iter().fold(0.0_f32, |acc, v| acc.max(*v));
    if max_band > 0.0 {
        bands.iter_mut().for_each(|v| *v /= max_band);
    }
    bands
}

const WAVEFORM_FFT_SIZE: usize = 2048;

struct WaveformSpectrumConfig {
    bucket: usize,
    log_mode: bool,
    tilt_percent: usize,
    min_hz: usize,
    max_hz: usize,
    silence_peak_gate: f32,
    silence_rms_gate: f32,
}

impl WaveformSpectrumConfig {
    fn from_state(state: &StreamState) -> Self {
        Self {
            bucket: state.bucket_count.load(Ordering::Relaxed),
            log_mode: state.bucket_mode.load(Ordering::Relaxed) == 0,
            tilt_percent: state.high_tilt_percent.load(Ordering::Relaxed),
            min_hz: state.freq_min_hz.load(Ordering::Relaxed),
            max_hz: state.freq_max_hz.load(Ordering::Relaxed),
            silence_peak_gate: micro_to_gate(
                state.silence_peak_gate_micro.load(Ordering::Relaxed),
            ),
            silence_rms_gate: micro_to_gate(state.silence_rms_gate_micro.load(Ordering::Relaxed)),
        }
    }
}

fn build_waveform_frame_from_mono(
    mono: &[f32],
    sample_rate: u32,
    config: &WaveformSpectrumConfig,
) -> WaveformFrame {
    let (peak, rms) = compute_peak_rms(mono);
    let bucket = config.bucket.clamp(8, 500);
    let is_silent = rms < config.silence_rms_gate && peak < config.silence_peak_gate;
    let spectrum = if is_silent {
        vec![0.0; bucket]
    } else {
        spectrum_bands_from_frame(
            mono,
            sample_rate,
            bucket,
            WAVEFORM_FFT_SIZE,
            config.log_mode,
            config.tilt_percent,
            config.min_hz,
            config.max_hz,
        )
    };
    let time_samples = if is_silent {
        vec![0.0; TIME_DOMAIN_SAMPLE_COUNT]
    } else {
        downsample_time_domain(mono, TIME_DOMAIN_SAMPLE_COUNT)
    };
    let mut waveform = WaveformFrame {
        peak,
        rms,
        points: spectrum,
        time_samples,
    };
    waveform.points = rebucket_points(&waveform.points, bucket);
    waveform
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerWaveformInput {
    /// mono 时域样本，长度建议为 2048（与 FFT 窗一致）。
    samples: Vec<f32>,
    sample_rate: u32,
}

#[tauri::command]
fn start_waveform_stream(app: tauri::AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let running = Arc::clone(&state.running);
    let capture_source_mode = Arc::clone(&state.capture_source_mode);
    let bucket_count = Arc::clone(&state.bucket_count);
    let bucket_mode = Arc::clone(&state.bucket_mode);
    let high_tilt_percent = Arc::clone(&state.high_tilt_percent);
    let freq_min_hz = Arc::clone(&state.freq_min_hz);
    let freq_max_hz = Arc::clone(&state.freq_max_hz);
    let esp_display = Arc::clone(&state.esp_display);
    let silence_peak_gate_micro = Arc::clone(&state.silence_peak_gate_micro);
    let silence_rms_gate_micro = Arc::clone(&state.silence_rms_gate_micro);
    thread::spawn(move || {
        let source_mode = capture_source_mode.load(Ordering::Relaxed);
        if source_mode == 2 {
            let _ = app.emit("waveform-status", "内部播放器采集已启动（由播放控制窗推送频谱）");
            while running.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(25));
            }
            let _ = app.emit("waveform-status", "内部播放器采集已停止");
            running.store(false, Ordering::SeqCst);
            return;
        }
        let preferred = if source_mode == 1 {
            None
        } else {
            Some("BlackHole".to_string())
        };
        let mut source = MacSystemAudioSource::new(preferred);

        if let Err(err) = source.start() {
            let _ = app.emit("waveform-error", format!("启动系统音频采集失败: {err}"));
            running.store(false, Ordering::SeqCst);
            return;
        }

        let _ = app.emit("waveform-status", "系统音频采集已启动");
        while running.load(Ordering::SeqCst) {
            match source.read_frame(WAVEFORM_FFT_SIZE) {
                Ok(frame) => {
                    let mono = mono_from_interleaved(&frame.samples, frame.channels as usize);
                    let config = WaveformSpectrumConfig {
                        bucket: bucket_count.load(Ordering::Relaxed),
                        log_mode: bucket_mode.load(Ordering::Relaxed) == 0,
                        tilt_percent: high_tilt_percent.load(Ordering::Relaxed),
                        min_hz: freq_min_hz.load(Ordering::Relaxed),
                        max_hz: freq_max_hz.load(Ordering::Relaxed),
                        silence_peak_gate: micro_to_gate(
                            silence_peak_gate_micro.load(Ordering::Relaxed),
                        ),
                        silence_rms_gate: micro_to_gate(
                            silence_rms_gate_micro.load(Ordering::Relaxed),
                        ),
                    };
                    let waveform =
                        build_waveform_frame_from_mono(&mono, frame.sample_rate, &config);
                    let _ = app.emit("waveform-frame", waveform.clone());
                    esp_display::maybe_send_frame(&app, &esp_display, &waveform);
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
fn set_capture_source_mode(state: State<'_, StreamState>, mode: String) -> Result<(), String> {
    let normalized = mode.trim().to_lowercase();
    let value = match normalized.as_str() {
        "blackhole" => 0_u8,
        "microphone" => 1_u8,
        "internal_player" | "internal-player" | "player" => 2_u8,
        _ => return Err("采集模式必须是 blackhole、microphone 或 internal_player".to_string()),
    };
    state.capture_source_mode.store(value, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_capture_source_mode(state: State<'_, StreamState>) -> String {
    match state.capture_source_mode.load(Ordering::SeqCst) {
        1 => "microphone".to_string(),
        2 => "internal_player".to_string(),
        _ => "blackhole".to_string(),
    }
}

#[tauri::command]
fn submit_player_waveform_frame(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    input: PlayerWaveformInput,
) -> Result<(), String> {
    if state.capture_source_mode.load(Ordering::SeqCst) != 2 {
        return Ok(());
    }
    if !state.running.load(Ordering::SeqCst) {
        return Ok(());
    }
    if input.samples.is_empty() {
        return Ok(());
    }
    let sample_rate = input.sample_rate.max(8_000);
    let mut mono = input.samples;
    if mono.len() > WAVEFORM_FFT_SIZE {
        mono.truncate(WAVEFORM_FFT_SIZE);
    } else if mono.len() < WAVEFORM_FFT_SIZE {
        mono.resize(WAVEFORM_FFT_SIZE, 0.0);
    }
    let config = WaveformSpectrumConfig::from_state(&state);
    let waveform = build_waveform_frame_from_mono(&mono, sample_rate, &config);
    let esp_display = Arc::clone(&state.esp_display);
    let _ = app.emit("waveform-frame", waveform.clone());
    esp_display::maybe_send_frame(&app, &esp_display, &waveform);
    Ok(())
}

#[tauri::command]
fn stop_waveform_stream(state: State<'_, StreamState>) {
    state.running.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn get_waveform_stream_running(state: State<'_, StreamState>) -> bool {
    state.running.load(Ordering::SeqCst)
}

#[tauri::command]
fn update_bucket_count(state: State<'_, StreamState>, bucket_count: usize) -> Result<(), String> {
    if !(8..=500).contains(&bucket_count) {
        return Err("桶数量必须在 8 到 500 之间".to_string());
    }
    state.bucket_count.store(bucket_count, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_bucket_count(state: State<'_, StreamState>) -> usize {
    state.bucket_count.load(Ordering::SeqCst)
}

#[tauri::command]
fn update_bucket_mode(state: State<'_, StreamState>, mode: String) -> Result<(), String> {
    let normalized = mode.trim().to_lowercase();
    match normalized.as_str() {
        "log" => state.bucket_mode.store(0, Ordering::SeqCst),
        "linear" => state.bucket_mode.store(1, Ordering::SeqCst),
        _ => return Err("分桶模式必须是 log 或 linear".to_string()),
    }
    Ok(())
}

#[tauri::command]
fn get_bucket_mode(state: State<'_, StreamState>) -> String {
    if state.bucket_mode.load(Ordering::SeqCst) == 0 {
        "log".to_string()
    } else {
        "linear".to_string()
    }
}

#[tauri::command]
fn update_high_tilt_percent(state: State<'_, StreamState>, percent: usize) -> Result<(), String> {
    if percent > 200 {
        return Err("高频补偿强度必须在 0 到 200 之间".to_string());
    }
    state.high_tilt_percent.store(percent, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_high_tilt_percent(state: State<'_, StreamState>) -> usize {
    state.high_tilt_percent.load(Ordering::SeqCst)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SilenceGateConfig {
    peak_gate: f32,
    rms_gate: f32,
}

#[tauri::command]
fn update_silence_gates(
    state: State<'_, StreamState>,
    peak_gate: f32,
    rms_gate: f32,
) -> Result<(), String> {
    if !(0.0..=0.05).contains(&peak_gate) || !(0.0..=0.05).contains(&rms_gate) {
        return Err("静默门限须在 0 到 0.05 之间".to_string());
    }
    let peak_micro = gate_to_micro(peak_gate);
    let rms_micro = gate_to_micro(rms_gate);
    state
        .silence_peak_gate_micro
        .store(peak_micro, Ordering::SeqCst);
    state.silence_rms_gate_micro.store(rms_micro, Ordering::SeqCst);
    if let Ok(mut bridge) = state.esp_display.bridge.lock() {
        bridge.set_silence_gates(peak_gate, rms_gate);
    }
    Ok(())
}

#[tauri::command]
fn get_silence_gates(state: State<'_, StreamState>) -> SilenceGateConfig {
    SilenceGateConfig {
        peak_gate: micro_to_gate(state.silence_peak_gate_micro.load(Ordering::SeqCst)),
        rms_gate: micro_to_gate(state.silence_rms_gate_micro.load(Ordering::SeqCst)),
    }
}

#[tauri::command]
fn update_frequency_range(
    state: State<'_, StreamState>,
    min_hz: usize,
    max_hz: usize,
) -> Result<(), String> {
    if min_hz < 20 || max_hz > 24_000 || min_hz + 20 >= max_hz {
        return Err("频率范围不合法，需满足 20<=min<max<=24000 且最小间距 20Hz".to_string());
    }
    state.freq_min_hz.store(min_hz, Ordering::SeqCst);
    state.freq_max_hz.store(max_hz, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_frequency_range(state: State<'_, StreamState>) -> (usize, usize) {
    (
        state.freq_min_hz.load(Ordering::SeqCst),
        state.freq_max_hz.load(Ordering::SeqCst),
    )
}

#[tauri::command]
fn set_waveform_color(
    _app: tauri::AppHandle,
    state: State<'_, StreamState>,
    color: String,
) -> Result<(), String> {
    let normalized = normalize_waveform_color_hex(&color)?;
    {
        let mut guard = state
            .waveform_color_hex
            .lock()
            .map_err(|_| "更新波形颜色失败".to_string())?;
        *guard = normalized.clone();
    }
    Ok(())
}

#[tauri::command]
fn get_waveform_color(state: State<'_, StreamState>) -> Result<String, String> {
    state
        .waveform_color_hex
        .lock()
        .map(|g| g.clone())
        .map_err(|_| "读取波形颜色失败".to_string())
}

#[tauri::command]
fn set_waveform_line_width(
    _app: tauri::AppHandle,
    state: State<'_, StreamState>,
    width_px: usize,
) -> Result<(), String> {
    let w = width_px.clamp(1, 12);
    state
        .waveform_line_width_px
        .store(w, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_waveform_line_width(state: State<'_, StreamState>) -> usize {
    state
        .waveform_line_width_px
        .load(Ordering::Relaxed)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// 关闭「当前设置所针对」的频谱图形窗（`main` 或 `spectrum-*`）。
/// 设置窗挂为该图形窗子窗，父窗关闭后设置面板一并消失；与窗口管理器共用 `close_managed_window`。
#[tauri::command]
fn close_settings_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    visual_target_label: Option<String>,
) -> Result<(), String> {
    let target = resolve_visual_settings_target_label(&state, visual_target_label.as_deref());
    close_managed_window(app, target)
}

#[tauri::command]
fn get_loopback_device_status() -> wavedance::platform::DeviceStatus {
    wavedance::platform::MacPlatformService::default().detect_audio_loopback_status()
}

/// 在应用资源目录中查找随包分发的 BlackHole `.pkg`（支持放在 `blackhole/` 下或其一层的子文件夹内）。
#[cfg(target_os = "macos")]
fn find_bundled_blackhole_pkg(resource_dir: &Path) -> Option<std::path::PathBuf> {
    let preferred = [
        resource_dir
            .join("blackhole")
            .join("BlackHole2ch-0.6.1.pkg"),
        resource_dir
            .join("resources")
            .join("blackhole")
            .join("BlackHole2ch-0.6.1.pkg"),
        resource_dir.join("blackhole").join("BlackHole2ch.pkg"),
        resource_dir
            .join("resources")
            .join("blackhole")
            .join("BlackHole2ch.pkg"),
        resource_dir.join("blackhole").join("BlackHole.pkg"),
        resource_dir
            .join("resources")
            .join("blackhole")
            .join("BlackHole.pkg"),
        resource_dir.join("BlackHole.pkg"),
    ];
    for p in &preferred {
        if p.is_file() {
            return Some(p.clone());
        }
    }

    let mut found: Vec<std::path::PathBuf> = Vec::new();
    let search_roots = [
        resource_dir.join("blackhole"),
        resource_dir.join("resources").join("blackhole"),
    ];
    for blackhole in search_roots {
        if !blackhole.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&blackhole) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().is_some_and(|e| e == "pkg") {
                    found.push(path);
                } else if path.is_dir() {
                    if let Ok(sub) = std::fs::read_dir(&path) {
                        for e in sub.flatten() {
                            let p = e.path();
                            if p.is_file() && p.extension().is_some_and(|e| e == "pkg") {
                                found.push(p);
                            }
                        }
                    }
                }
            }
        }
    }
    found.sort();
    found.into_iter().next()
}

#[cfg(target_os = "macos")]
fn find_dev_blackhole_pkg() -> Option<std::path::PathBuf> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let preferred = [
        manifest_dir
            .join("resources")
            .join("blackhole")
            .join("BlackHole2ch-0.6.1.pkg"),
        manifest_dir
            .join("resources")
            .join("blackhole")
            .join("BlackHole2ch.pkg"),
        manifest_dir
            .join("resources")
            .join("blackhole")
            .join("BlackHole.pkg"),
    ];
    preferred.into_iter().find(|p| p.is_file())
}

/// 打开随包分发的 BlackHole `.pkg`（若存在），否则打开官方发布页；由系统安装器处理密码与授权。
#[cfg(target_os = "macos")]
#[tauri::command]
fn open_blackhole_installer(app: tauri::AppHandle) -> Result<(), String> {
    const FALLBACK_URL: &str = "https://existential.audio/blackhole/";
    if let Some(pkg_path) = find_dev_blackhole_pkg() {
        let status = Command::new("open")
            .arg(&pkg_path)
            .status()
            .map_err(|e| format!("无法打开本地安装包: {e}"))?;
        return if status.success() {
            Ok(())
        } else {
            Err("本地安装包未能打开".to_string())
        };
    }

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    if let Some(pkg_path) = find_bundled_blackhole_pkg(&resource_dir) {
        let status = Command::new("open")
            .arg(&pkg_path)
            .status()
            .map_err(|e| format!("无法打开安装包: {e}"))?;
        return if status.success() {
            Ok(())
        } else {
            Err("安装包未能打开".to_string())
        };
    }
    let status = Command::new("open")
        .arg(FALLBACK_URL)
        .status()
        .map_err(|e| format!("无法打开下载页: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("打开下载页失败".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_blackhole_installer(_app: tauri::AppHandle) -> Result<(), String> {
    Err("BlackHole 仅适用于 macOS".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_audio_midi_setup() -> Result<(), String> {
    let status = Command::new("open")
        .arg("-a")
        .arg("Audio MIDI Setup")
        .status()
        .map_err(|e| format!("无法打开「音频 MIDI 设置」: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("打开「音频 MIDI 设置」失败".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_audio_midi_setup() -> Result<(), String> {
    Err("音频 MIDI 设置仅适用于 macOS".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_sound_settings() -> Result<(), String> {
    // 新版 macOS（System Settings）
    let new_settings = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.Sound-Settings.extension")
        .status();
    if let Ok(status) = new_settings {
        if status.success() {
            return Ok(());
        }
    }

    // 旧版 macOS（System Preferences）兜底
    let legacy = Command::new("open")
        .arg("/System/Library/PreferencePanes/Sound.prefPane")
        .status()
        .map_err(|e| format!("无法打开「声音设置」: {e}"))?;
    if legacy.success() {
        Ok(())
    } else {
        Err("打开「声音设置」失败".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_sound_settings() -> Result<(), String> {
    Err("声音设置仅适用于 macOS".to_string())
}

#[cfg(target_os = "macos")]
fn configure_overlay_window(
    window: tauri::WebviewWindow,
    tier: OverlayWindowStackTier,
    pinned: bool,
    blur_enabled: bool,
    main_ignores_mouse_events: bool,
) -> tauri::Result<()> {
    // macOS 置顶由 NSWindow level 控制；`set_always_on_top` 会异步改成 Floating 级别并破坏分层。
    window.set_shadow(false)?;
    apply_window_blur_effect(&window, blur_enabled)?;

    let overlay_window = window.clone();
    let level = macos_overlay_window_level(tier, pinned);
    let raise_info = tier == OverlayWindowStackTier::NowPlayingInfo && pinned;
    window.run_on_main_thread(move || unsafe {
        let ns_window: &NSWindow = &*overlay_window
            .ns_window()
            .expect("无法获取 macOS 窗口句柄")
            .cast();
        ns_window.setLevel(level);
        ns_window.setOpaque(false);
        ns_window.setHasShadow(false);
        ns_window.setHidesOnDeactivate(false);
        ns_window.setCanHide(false);
        ns_window.setMovableByWindowBackground(false);
        ns_window.setIgnoresMouseEvents(main_ignores_mouse_events);
        ns_window.setReleasedWhenClosed(false);

        let clear = NSColor::clearColor();
        ns_window.setBackgroundColor(Some(&clear));

        let behavior = if pinned {
            ns_window.collectionBehavior()
                | NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::CanJoinAllApplications
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::IgnoresCycle
        } else {
            ns_window.collectionBehavior()
                & !NSWindowCollectionBehavior::CanJoinAllSpaces
                & !NSWindowCollectionBehavior::CanJoinAllApplications
                & !NSWindowCollectionBehavior::FullScreenAuxiliary
        };
        ns_window.setCollectionBehavior(behavior);
        if raise_info {
            ns_window.orderFrontRegardless();
        }
    })
}

/// 封面浮层窗：在通用浮层配置基础上启用 macOS 原生边缘缩放（无需前端模拟手柄）。
#[cfg(target_os = "macos")]
fn configure_cover_overlay_window(
    window: tauri::WebviewWindow,
    pinned: bool,
    blur_enabled: bool,
) -> tauri::Result<()> {
    configure_overlay_window(
        window.clone(),
        OverlayWindowStackTier::NowPlayingInfo,
        pinned,
        blur_enabled,
        false,
    )?;
    let cover_window = window.clone();
    window.run_on_main_thread(move || unsafe {
        let ns_window: &NSWindow = &*cover_window
            .ns_window()
            .expect("无法获取 macOS 窗口句柄")
            .cast();
        let mut mask = ns_window.styleMask();
        mask |= NSWindowStyleMask::Resizable;
        ns_window.setStyleMask(mask);
    })
}

#[cfg(not(target_os = "macos"))]
fn configure_cover_overlay_window(
    window: tauri::WebviewWindow,
    pinned: bool,
    blur_enabled: bool,
) -> tauri::Result<()> {
    window.set_always_on_top(pinned)?;
    let _ = window.set_ignore_cursor_events(false);
    let _ = blur_enabled;
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_window_blur_effect(window: &tauri::WebviewWindow, blur_enabled: bool) -> tauri::Result<()> {
    const OVERLAY_EFFECT: Effect = Effect::HudWindow;
    const OVERLAY_BLUR_RADIUS: f64 = 14.0;
    let _ = window.set_effects(None);
    let _ = clear_vibrancy(window);
    if blur_enabled {
        window.set_effects(
            EffectsBuilder::new()
                .effect(OVERLAY_EFFECT)
                .state(EffectState::Active)
                .radius(OVERLAY_BLUR_RADIUS)
                .build(),
        )?;
    }
    Ok(())
}

/// 传统频谱窗：带系统标题栏，不参与全屏 Space 浮层，可像普通窗口一样全屏/切换 Space。
#[cfg(target_os = "macos")]
fn configure_traditional_window(
    window: tauri::WebviewWindow,
    _blur_enabled: bool,
    ignores_mouse_events: bool,
) -> tauri::Result<()> {
    window.set_always_on_top(false)?;
    window.set_shadow(true)?;
    let _ = window.set_effects(None);
    let _ = clear_vibrancy(&window);

    let traditional_window = window.clone();
    window.run_on_main_thread(move || unsafe {
        let ns_window: &NSWindow = &*traditional_window
            .ns_window()
            .expect("无法获取 macOS 窗口句柄")
            .cast();
        ns_window.setLevel(0);
        ns_window.setHasShadow(true);
        ns_window.setHidesOnDeactivate(false);
        ns_window.setCanHide(true);
        ns_window.setMovableByWindowBackground(false);
        ns_window.setIgnoresMouseEvents(ignores_mouse_events);
        ns_window.setReleasedWhenClosed(false);

        let behavior = ns_window.collectionBehavior()
            & !NSWindowCollectionBehavior::CanJoinAllSpaces
            & !NSWindowCollectionBehavior::CanJoinAllApplications
            & !NSWindowCollectionBehavior::Stationary
            & !NSWindowCollectionBehavior::FullScreenAuxiliary
            & !NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenPrimary;
        ns_window.setCollectionBehavior(behavior);
    })
}

#[cfg(not(target_os = "macos"))]
fn configure_traditional_window(
    window: tauri::WebviewWindow,
    _blur_enabled: bool,
    ignores_mouse_events: bool,
) -> tauri::Result<()> {
    window.set_always_on_top(false)?;
    window.set_shadow(true)?;
    window.set_ignore_cursor_events(ignores_mouse_events)
}

#[tauri::command]
fn get_spectrum_window_overlay_mode(state: State<'_, StreamState>, label: String) -> bool {
    spectrum_is_overlay_mode(&state, label.trim())
}

#[cfg(target_os = "macos")]
fn refresh_main_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let blur_enabled = label_blur_enabled(&state, "main");
    let ignore_mouse = label_passthrough_locked(&state, "main");
    configure_overlay_window(
        window,
        OverlayWindowStackTier::Spectrum,
        pinned,
        blur_enabled,
        ignore_mouse,
    )?;
    raise_now_playing_overlay_windows(app)
}

#[cfg(not(target_os = "macos"))]
fn refresh_main_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let ignore_mouse = label_passthrough_locked(&state, "main");
    window.set_always_on_top(pinned)?;
    window.set_ignore_cursor_events(ignore_mouse)?;
    raise_now_playing_overlay_windows(app)
}

/// 将浮动解锁条（`main-toolbar` / `ptb-spectrum-*`）贴到父图形窗 Web 视口右上。
///
/// 使用**逻辑坐标（点）**设置位置与尺寸：在 Retina / 4K 等多倍缩放下，子窗若用物理像素
/// `set_position`，部分环境下会与父窗 `inner_*` 的换算或子窗自身 DPI 不一致；与 CSS 中
/// `top/right` 语义一致，交给各窗口按当前屏 `scale_factor` 换算为物理像素。
fn position_floating_toolbar_near_parent(
    app: &tauri::AppHandle,
    parent_label: &str,
    toolbar_label: &str,
) -> tauri::Result<()> {
    let Some(toolbar) = app.get_webview_window(toolbar_label) else {
        return Ok(());
    };
    let Some(parent) = app.get_webview_window(parent_label) else {
        return Ok(());
    };
    let (pos, sz) = match (parent.inner_position(), parent.inner_size()) {
        (Ok(p), Ok(s)) => (p, s),
        _ => (parent.outer_position()?, parent.outer_size()?),
    };
    let scale = parent.scale_factor().unwrap_or(1.0);
    let pos_l: LogicalPosition<f64> = pos.to_logical(scale);
    let sz_l: LogicalSize<f64> = sz.to_logical(scale);

    const TOOLBAR_W_PT: f64 = 52.0;
    const TOOLBAR_H_PT: f64 = 58.0;
    const MARGIN_PT: f64 = 16.0;
    /// 相对锁定按钮上移若干**设备像素**（逻辑量 = px / scale），与主工具栏视觉对齐。
    const NUDGE_UP_DEVICE_PX: f64 = 4.0;

    let x = pos_l.x + sz_l.width - TOOLBAR_W_PT - MARGIN_PT;
    let y = pos_l.y + MARGIN_PT - NUDGE_UP_DEVICE_PX / scale;

    toolbar.set_position(Position::Logical(LogicalPosition::new(x, y)))?;
    toolbar.set_size(Size::Logical(LogicalSize::new(
        TOOLBAR_W_PT,
        TOOLBAR_H_PT,
    )))?;
    Ok(())
}

fn position_main_toolbar_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    position_floating_toolbar_near_parent(app, "main", "main-toolbar")
}

/// 主窗移动、缩放或跨显示器导致 DPI 变化时，将浮动工具栏重新贴到主窗视口右上。
fn reposition_main_toolbar_if_passthrough_locked(app: &tauri::AppHandle) {
    let state = app.state::<StreamState>();
    if !label_passthrough_locked(&state, "main") {
        return;
    }
    // macOS：跨屏瞬间 `inner_position` / scale 可能尚未与当前屏一致，放到主线程与系统布局对齐后再算。
    #[cfg(target_os = "macos")]
    if let Some(main) = app.get_webview_window("main") {
        let app_h = app.clone();
        let _ = main.run_on_main_thread(move || {
            let _ = position_main_toolbar_window(&app_h);
        });
        return;
    }
    let _ = position_main_toolbar_window(app);
}

fn reposition_spectrum_toolbar_if_locked(app: &tauri::AppHandle, spectrum_label: &str) {
    let state = app.state::<StreamState>();
    if !label_passthrough_locked(&state, spectrum_label) {
        return;
    }
    let tb_label = toolbar_webview_label_for_spectrum(spectrum_label);
    #[cfg(target_os = "macos")]
    if let Some(spec) = app.get_webview_window(spectrum_label) {
        let app_h = app.clone();
        let sl = spectrum_label.to_string();
        let tbl = tb_label.clone();
        let _ = spec.run_on_main_thread(move || {
            let _ = position_floating_toolbar_near_parent(&app_h, &sl, &tbl);
        });
        return;
    }
    let _ = position_floating_toolbar_near_parent(app, spectrum_label, &tb_label);
}

/// `main-toolbar`（toolbar.html）：仅当主窗开启鼠标穿透锁定时显示，并贴在主窗 Web 视口右上。
fn sync_main_toolbar_for_passthrough_locked(
    app: &tauri::AppHandle,
    locked: bool,
) -> tauri::Result<()> {
    if app.get_webview_window("main-toolbar").is_none() {
        return Ok(());
    }
    if !locked {
        if let Some(tb) = app.get_webview_window("main-toolbar") {
            tb.hide()?;
        }
        return Ok(());
    }

    // macOS：`refresh_main_overlay_window` 里对主窗 NSWindow 的修改通过 `run_on_main_thread` 投递；
    // 若在同一时刻同步 `toolbar.show()`，会与 `setIgnoresMouseEvents` / `orderFront` 竞态，子窗常不显。
    #[cfg(target_os = "macos")]
    {
        if let Some(main) = app.get_webview_window("main") {
            let app_handle = app.clone();
            main.run_on_main_thread(move || {
                let _ = position_main_toolbar_window(&app_handle);
                if let Some(tb) = app_handle.get_webview_window("main-toolbar") {
                    let _ = tb.show();
                }
            })?;
        } else {
            position_main_toolbar_window(app)?;
            if let Some(tb) = app.get_webview_window("main-toolbar") {
                tb.show()?;
            }
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        position_main_toolbar_window(app)?;
        if let Some(tb) = app.get_webview_window("main-toolbar") {
            tb.show()?;
        }
        Ok(())
    }
}

/// 频谱窗穿透开启时按需创建 `ptb-spectrum-*`，并注册父窗移动时重贴浮动条（仅注册一次）。
fn ensure_spectrum_pass_through_toolbar_created(
    app: &tauri::AppHandle,
    spectrum_label: &str,
) -> Result<(), String> {
    let tb_label = toolbar_webview_label_for_spectrum(spectrum_label);
    if app.get_webview_window(&tb_label).is_some() {
        wire_spectrum_toolbar_follow_if_needed(app, spectrum_label)?;
        return Ok(());
    }
    let parent = app
        .get_webview_window(spectrum_label)
        .ok_or_else(|| "频谱窗口不存在".to_string())?;
    let url_path = format!("toolbar.html#{spectrum_label}");
    let toolbar = WebviewWindowBuilder::new(app, &tb_label, WebviewUrl::App(url_path.into()))
        .parent(&parent)
        .map_err(|e| e.to_string())?
        .title("")
        .inner_size(52.0, 58.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    attach_toolbar_window_to_parent_space(&parent, &toolbar).map_err(|e| e.to_string())?;
    toolbar.hide().map_err(|e| e.to_string())?;
    let _ = position_floating_toolbar_near_parent(app, spectrum_label, &tb_label);
    wire_spectrum_toolbar_follow_if_needed(app, spectrum_label)?;
    Ok(())
}

fn wire_spectrum_toolbar_follow_if_needed(
    app: &tauri::AppHandle,
    spectrum_label: &str,
) -> Result<(), String> {
    let Some(spec) = app.get_webview_window(spectrum_label) else {
        return Ok(());
    };
    {
        let state = app.state::<StreamState>();
        let mut wired = state
            .spectrum_toolbar_follow_wired
            .lock()
            .map_err(|e| e.to_string())?;
        if wired.contains(spectrum_label) {
            return Ok(());
        }
        wired.insert(spectrum_label.to_string());
    }
    let h = app.clone();
    let sl = spectrum_label.to_string();
    spec.on_window_event(move |event| {
        match event {
            WindowEvent::Moved(_)
            | WindowEvent::Resized(_)
            | WindowEvent::ScaleFactorChanged { .. } => {
                reposition_spectrum_toolbar_if_locked(&h, &sl);
                let _ = reassert_overlay_window_stack(&h);
            }
            WindowEvent::Focused(true) => {
                let _ = reassert_overlay_window_stack(&h);
            }
            _ => {}
        }
    });
    Ok(())
}

/// `ptb-spectrum-*`（toolbar.html）：仅当对应频谱窗开启穿透时显示。
fn sync_spectrum_floating_toolbar(
    app: &tauri::AppHandle,
    spectrum_label: &str,
    locked: bool,
) -> Result<(), String> {
    let tb_label = toolbar_webview_label_for_spectrum(spectrum_label);
    if !locked {
        if let Some(tb) = app.get_webview_window(&tb_label) {
            tb.hide().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    ensure_spectrum_pass_through_toolbar_created(app, spectrum_label)?;
    let state = app.state::<StreamState>();
    let hide_until_edge_reveal = overlay_uses_edge_reveal_unlock(&state, spectrum_label);

    #[cfg(target_os = "macos")]
    {
        if let Some(spec) = app.get_webview_window(spectrum_label) {
            let app_handle = app.clone();
            let sl = spectrum_label.to_string();
            let tbl = tb_label.clone();
            spec.run_on_main_thread(move || {
                let _ = position_floating_toolbar_near_parent(&app_handle, &sl, &tbl);
                if let Some(tb) = app_handle.get_webview_window(&tbl) {
                    if hide_until_edge_reveal {
                        let _ = tb.hide();
                    } else {
                        let _ = tb.show();
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        } else {
            position_floating_toolbar_near_parent(app, spectrum_label, &tb_label)
                .map_err(|e| e.to_string())?;
            if let Some(tb) = app.get_webview_window(&tb_label) {
                if hide_until_edge_reveal {
                    tb.hide().map_err(|e| e.to_string())?;
                } else {
                    tb.show().map_err(|e| e.to_string())?;
                }
            }
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        position_floating_toolbar_near_parent(app, spectrum_label, &tb_label)
            .map_err(|e| e.to_string())?;
        if let Some(tb) = app.get_webview_window(&tb_label) {
            if hide_until_edge_reveal {
                tb.hide().map_err(|e| e.to_string())?;
            } else {
                tb.show().map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}

/// 按当前穿透状态同步主窗与所有频谱窗的浮动解锁条（置顶/模糊等路径也会调用）。
fn sync_floating_toolbar_window(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<StreamState>();
    let main_locked = label_passthrough_locked(&state, "main");
    sync_main_toolbar_for_passthrough_locked(app, main_locked).map_err(|e| e.to_string())?;
    for (label, _) in app.webview_windows() {
        if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX)
            || label.starts_with(LYRICS_WINDOW_LABEL_PREFIX)
            || label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX)
            || {
                #[cfg(target_os = "macos")]
                {
                    label == MUSIC_PLAYLIST_LABEL
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = label;
                    false
                }
            }
        {
            let locked = label_passthrough_locked(&state, &label);
            sync_spectrum_floating_toolbar(app, &label, locked)?;
        }
    }
    Ok(())
}

fn apply_mouse_passthrough_locked_change(
    app: &tauri::AppHandle,
    label: &str,
    locked: bool,
) -> Result<(), String> {
    let state = app.state::<StreamState>();
    {
        let mut m = state
            .mouse_passthrough_by_label
            .lock()
            .map_err(|e| format!("穿透状态锁异常: {e}"))?;
        if locked {
            m.insert(label.to_string(), true);
        } else {
            m.remove(label);
        }
    }
    let _ = app.emit(
        "mouse-passthrough-changed",
        MousePassthroughChangedPayload {
            label: label.to_string(),
            locked,
        },
    );
    refresh_main_overlay_window(app).map_err(|e| e.to_string())?;
    refresh_spectrum_clone_windows(app).map_err(|e| e.to_string())?;
    refresh_lyrics_clone_windows(app).map_err(|e| e.to_string())?;
    refresh_cover_clone_windows(app).map_err(|e| e.to_string())?;
    refresh_songinfo_clone_windows(app).map_err(|e| e.to_string())?;
    refresh_playlist_window(app).map_err(|e| e.to_string())?;
    sync_floating_toolbar_window(app).map_err(|e| e.to_string())?;
    Ok(())
}

fn wire_main_window_toolbar_follow(handle: tauri::AppHandle) {
    let Some(main) = handle.get_webview_window("main") else {
        return;
    };
    let h = handle.clone();
    main.on_window_event(move |event| {
        match event {
            WindowEvent::Moved(_)
            | WindowEvent::Resized(_)
            | WindowEvent::ScaleFactorChanged { .. } => {
                reposition_main_toolbar_if_passthrough_locked(&h);
                let _ = reassert_overlay_window_stack(&h);
            }
            WindowEvent::Focused(true) => {
                let _ = reassert_overlay_window_stack(&h);
            }
            _ => {}
        }
    });
}

fn create_main_toolbar_window(app: &tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())?;
    let toolbar = WebviewWindowBuilder::new(app, "main-toolbar", WebviewUrl::App("toolbar.html".into()))
        .parent(&main)
        .map_err(|e| e.to_string())?
        .title("")
        .inner_size(52.0, 58.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    attach_toolbar_window_to_parent_space(&main, &toolbar).map_err(|e| e.to_string())?;
    toolbar.hide().map_err(|e| e.to_string())?;
    let _ = position_main_toolbar_window(app);
    Ok(())
}

/// 将设置窗口挂到父图形窗子窗口链上，使其随父窗出现在同一 Space（解决多桌面残留问题）。
#[cfg(target_os = "macos")]
fn attach_settings_window_to_parent_space(
    parent_window: &tauri::WebviewWindow,
    settings_window: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    let parent_clone = parent_window.clone();
    let settings_clone = settings_window.clone();
    parent_window.run_on_main_thread(move || unsafe {
        let parent_ns = parent_clone
            .ns_window()
            .expect("无法获取父窗口 NSWindow 句柄")
            .cast::<NSWindow>();
        let settings_ns = settings_clone
            .ns_window()
            .expect("无法获取设置窗口 NSWindow 句柄")
            .cast::<NSWindow>();
        let parent_ref: &NSWindow = &*parent_ns;
        let settings_ref: &NSWindow = &*settings_ns;

        if let Some(old_parent) = settings_ref.parentWindow() {
            old_parent.removeChildWindow(settings_ref);
        }
        parent_ref.addChildWindow_ordered(settings_ref, NSWindowOrderingMode::Above);
    })
}

fn is_spectrum_graphic_window_label(label: &str) -> bool {
    label == "main" || label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX)
}

fn resolve_visual_settings_target_label(
    state: &StreamState,
    override_label: Option<&str>,
) -> String {
    if let Some(label) = override_label
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter(|s| is_spectrum_graphic_window_label(s))
    {
        if let Ok(mut g) = state.visual_settings_target.lock() {
            *g = label.to_string();
        }
        return label.to_string();
    }
    state
        .visual_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "main".to_string())
}

fn cleanup_after_spectrum_graphic_close(state: &StreamState, label: &str) {
    if !label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        return;
    }
    if let Ok(mut modes) = state.spectrum_overlay_by_label.lock() {
        modes.remove(label);
    }
    if let Ok(mut wired) = state.spectrum_toolbar_follow_wired.lock() {
        wired.remove(label);
    }
}

/// 解析设置窗应挂接的父图形窗：优先 `main`，否则任一 `spectrum-*`；`preferred` 存在且仍打开时优先用它。
fn resolve_settings_parent_window(
    app: &tauri::AppHandle,
    preferred: Option<&str>,
) -> Result<(String, tauri::WebviewWindow), String> {
    if let Some(label) = preferred.map(str::trim).filter(|s| !s.is_empty()) {
        if is_spectrum_graphic_window_label(label) {
            if let Some(w) = app.get_webview_window(label) {
                return Ok((label.to_string(), w));
            }
        }
    }
    for (label, w) in app.webview_windows() {
        if is_spectrum_graphic_window_label(&label) && w.is_focused().unwrap_or(false) {
            return Ok((label, w));
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        return Ok(("main".to_string(), main));
    }
    let spectrum: Vec<(String, tauri::WebviewWindow)> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX))
        .collect();
    if spectrum.is_empty() {
        return Err("没有可用的频谱窗口，请先新建窗口".to_string());
    }
    spectrum
        .into_iter()
        .next()
        .map(|(label, w)| (label, w))
        .ok_or_else(|| "没有可用的频谱窗口，请先新建窗口".to_string())
}

/// 将浮动解锁条挂到父图形窗子窗口链（与设置窗一致，避免多 Space 行为异常）。
#[cfg(target_os = "macos")]
fn attach_toolbar_window_to_parent_space(
    parent_window: &tauri::WebviewWindow,
    toolbar_window: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    let parent_clone = parent_window.clone();
    let toolbar_clone = toolbar_window.clone();
    parent_window.run_on_main_thread(move || unsafe {
        let parent_ns = parent_clone
            .ns_window()
            .expect("无法获取父窗口 NSWindow 句柄")
            .cast::<NSWindow>();
        let toolbar_ns = toolbar_clone
            .ns_window()
            .expect("无法获取工具栏 NSWindow 句柄")
            .cast::<NSWindow>();
        let parent_ref: &NSWindow = &*parent_ns;
        let toolbar_ref: &NSWindow = &*toolbar_ns;

        if let Some(old_parent) = toolbar_ref.parentWindow() {
            old_parent.removeChildWindow(toolbar_ref);
        }
        parent_ref.addChildWindow_ordered(toolbar_ref, NSWindowOrderingMode::Above);
        // 可见性由 Tauri hide/show 控制；此处不再 orderOut，避免部分环境下子窗 WebView 重显后不绘制内容
    })
}

fn recall_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
        refresh_main_overlay_window(app)?;
        let _ = sync_floating_toolbar_window(app);
    }
    for (label, w) in app.webview_windows() {
        if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX)
            || label.starts_with(LYRICS_WINDOW_LABEL_PREFIX)
            || label.starts_with(COVER_WINDOW_LABEL_PREFIX)
            || label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX)
            || {
                #[cfg(target_os = "macos")]
                {
                    label == MUSIC_PLAYLIST_LABEL
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = label;
                    false
                }
            }
        {
            w.show()?;
        }
    }
    raise_now_playing_overlay_windows(app)?;
    Ok(())
}

#[tauri::command]
fn set_overlay_pinned(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    pinned: bool,
) -> Result<(), String> {
    state.overlay_pinned.store(pinned, Ordering::SeqCst);
    refresh_main_overlay_window(&app).map_err(|e| e.to_string())?;
    refresh_spectrum_clone_windows(&app).map_err(|e| e.to_string())?;
    refresh_lyrics_clone_windows(&app).map_err(|e| e.to_string())?;
    refresh_cover_clone_windows(&app).map_err(|e| e.to_string())?;
    refresh_songinfo_clone_windows(&app).map_err(|e| e.to_string())?;
    refresh_playlist_window(&app).map_err(|e| e.to_string())?;
    sync_floating_toolbar_window(&app).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        for label in [
            "settings",
            "lyrics-settings",
            "cover-settings",
            "songinfo-settings",
            "player-settings",
            "lyrics-search",
        ] {
            if let Some(w) = app.get_webview_window(label) {
                configure_settings_window_level(&w, pinned).map_err(|e| e.to_string())?;
            }
        }
        raise_visible_settings_windows(&app).map_err(|e| e.to_string())?;
    }
    raise_window_manager_if_visible(&app).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        for label in [
            "settings",
            "lyrics-settings",
            "cover-settings",
            "songinfo-settings",
            "player-settings",
            "lyrics-search",
        ] {
            if let Some(w) = app.get_webview_window(label) {
                w.set_always_on_top(pinned).map_err(|e| e.to_string())?;
            }
        }
        if let Some(w) = app.get_webview_window(WINDOW_MANAGER_LABEL) {
            w.set_always_on_top(true).map_err(|e| e.to_string())?;
        }
        if let Some(w) = app.get_webview_window(ESP_DISPLAY_SETTINGS_LABEL) {
            w.set_always_on_top(true).map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "macos")]
        if let Some(w) = app.get_webview_window(MUSIC_PLATFORM_LOGIN_LABEL) {
            w.set_always_on_top(true).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn get_overlay_pinned(state: State<'_, StreamState>) -> bool {
    state.overlay_pinned.load(Ordering::SeqCst)
}

#[cfg(target_os = "macos")]
fn refresh_blur_for_label(app: &tauri::AppHandle, label: &str) -> tauri::Result<()> {
    if label == "main" {
        return refresh_main_overlay_window(app);
    }
    if label == MUSIC_PLAYER_LABEL {
        let Some(win) = app.get_webview_window(label) else {
            return Ok(());
        };
        let state = app.state::<StreamState>();
        let pinned = state.overlay_pinned.load(Ordering::SeqCst);
        let blur_enabled = label_blur_enabled(&state, label);
        configure_cover_overlay_window(win, pinned, blur_enabled)?;
        raise_now_playing_overlay_windows(app)?;
        return Ok(());
    }
    if !label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        return Ok(());
    }
    let Some(win) = app.get_webview_window(label) else {
        return Ok(());
    };
    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let blur_enabled = label_blur_enabled(&state, label);
    let locked = label_passthrough_locked(&state, label);
    if spectrum_is_overlay_mode(&state, label) {
        configure_overlay_window(
            win,
            OverlayWindowStackTier::Spectrum,
            pinned,
            blur_enabled,
            locked,
        )?;
        raise_now_playing_overlay_windows(app)?;
    } else {
        configure_traditional_window(win, blur_enabled, locked)?;
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn refresh_blur_for_label(_app: &tauri::AppHandle, _label: &str) -> tauri::Result<()> {
    Ok(())
}

#[tauri::command]
fn set_overlay_blur_enabled(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    label: String,
    enabled: bool,
) -> Result<(), String> {
    let label = label.trim().to_string();
    if !is_blur_capable_label(&label) {
        return Err("仅主窗口、频谱窗口与播放控制窗支持毛玻璃".to_string());
    }
    if app.get_webview_window(&label).is_none() {
        return Err("窗口不存在或已关闭".to_string());
    }
    {
        let mut m = state
            .overlay_blur_by_label
            .lock()
            .map_err(|e| format!("毛玻璃状态锁异常: {e}"))?;
        if enabled {
            m.insert(label.clone(), true);
        } else {
            m.remove(&label);
        }
    }
    #[cfg(target_os = "macos")]
    refresh_blur_for_label(&app, &label).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_overlay_blur_enabled(state: State<'_, StreamState>, label: String) -> bool {
    label_blur_enabled(&state, label.trim())
}

#[tauri::command]
fn set_mouse_passthrough_locked(
    app: tauri::AppHandle,
    label: String,
    locked: bool,
) -> Result<(), String> {
    let label = label.trim().to_string();
    if !is_passthrough_capable_label(&label) {
        return Err("仅主窗口、频谱窗口、歌词窗口、歌曲信息窗口与歌单窗口支持穿透锁定".to_string());
    }
    if locked && app.get_webview_window(&label).is_none() {
        return Err("窗口不存在或已关闭".to_string());
    }
    apply_mouse_passthrough_locked_change(&app, &label, locked)
}

#[tauri::command]
fn get_mouse_passthrough_locked(state: State<'_, StreamState>, label: String) -> bool {
    label_passthrough_locked(&state, label.trim())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn get_now_playing_snapshot(
    app: tauri::AppHandle,
    _monitor: State<'_, now_playing::NowPlayingMonitor>,
    _player: State<'_, music_platform::MusicPlayerState>,
) -> now_playing::NowPlayingPayload {
    current_now_playing_snapshot(&app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn sync_lyrics_for_now_playing(
    app: tauri::AppHandle,
    _monitor: State<'_, now_playing::NowPlayingMonitor>,
    fetcher: State<'_, lyrics::LyricsFetcher>,
) {
    let snap = current_now_playing_snapshot(&app);
    fetcher.notify_track(
        &app,
        &lyrics::LyricTrackQuery {
            active: snap.active,
            title: snap.title,
            artist: snap.artist,
            album: snap.album,
            duration: snap.duration,
        },
    );
}

/// 托盘「新建」或无锚点窗时：在光标所在显示器的工作区居中。
fn center_webview_on_cursor_monitor(
    app: &tauri::AppHandle,
    win: &WebviewWindow,
) -> Result<(), String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|e| e.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return win.center().map_err(|e| e.to_string());
    };

    let outer = win.outer_size().map_err(|e| e.to_string())?;
    let work = monitor.work_area();
    let px = work.position.x + (work.size.width as i32 - outer.width as i32) / 2;
    let py = work.position.y + (work.size.height as i32 - outer.height as i32) / 2;

    win.set_position(Position::Physical(PhysicalPosition::new(px, py)))
        .map_err(|e| e.to_string())
}

fn position_extra_overlay_window(
    app: &tauri::AppHandle,
    win: &WebviewWindow,
    anchor_opt: &Option<WebviewWindow>,
    beside_px: i32,
    beside_py: i32,
) -> Result<(), String> {
    if anchor_opt.is_some() {
        win.set_position(Position::Physical(PhysicalPosition::new(beside_px, beside_py)))
            .map_err(|e| e.to_string())
    } else {
        center_webview_on_cursor_monitor(app, win)
    }
}

fn open_extra_spectrum_window_impl(
    app: &tauri::AppHandle,
    anchor_label: Option<String>,
    overlay_mode: bool,
) -> Result<(), String> {
    let anchor_key = anchor_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    // 仅显式指定锚点时才贴边；托盘「新建」传 None 时不回退到 main
    let anchor_opt = anchor_key
        .as_ref()
        .and_then(|l| app.get_webview_window(l));

    let state = app.state::<StreamState>();
    let n = state
        .spectrum_window_counter
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    let label = format!("{SPECTRUM_WINDOW_LABEL_PREFIX}{n}");
    if let Ok(mut modes) = state.spectrum_overlay_by_label.lock() {
        modes.insert(label.clone(), overlay_mode);
    }
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let blur_enabled = label_blur_enabled(&state, &label);
    // 紧贴锚点窗口外侧：优先放在其右侧，小步错位避免完全重叠（物理像素，与 set_position 一致）
    const GAP: i32 = 10;
    const STEP: i32 = 6;
    let i = (n as i32).saturating_sub(1).rem_euclid(4);
    let (px, py) = if let Some(ref anchor) = anchor_opt {
        match (anchor.outer_position(), anchor.outer_size()) {
            (Ok(pos), Ok(sz)) => (
                pos.x + sz.width as i32 + GAP + i * STEP,
                pos.y + GAP + i * STEP,
            ),
            _ => (120 + i * STEP, 120 + i * STEP),
        }
    } else {
        (0, 0)
    };

    let win = {
        let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
            .title("WaveDance 频谱")
            .inner_size(1080.0, 680.0)
            .resizable(true);
        if overlay_mode {
            builder
                .transparent(true)
                .decorations(false)
                .shadow(false)
                .always_on_top(pinned)
                .build()
        } else {
            builder
                .decorations(true)
                .shadow(true)
                .always_on_top(false)
                .build()
        }
    }
    .map_err(|e| e.to_string())?;
    position_extra_overlay_window(app, &win, &anchor_opt, px, py)?;

    if overlay_mode {
        #[cfg(target_os = "macos")]
        configure_overlay_window(
            win.clone(),
            OverlayWindowStackTier::Spectrum,
            pinned,
            blur_enabled,
            false,
        )
        .map_err(|e| e.to_string())?;
        #[cfg(not(target_os = "macos"))]
        {
            win.set_always_on_top(pinned).map_err(|e| e.to_string())?;
            let _ = win.set_ignore_cursor_events(false);
        }
    } else {
        configure_traditional_window(win.clone(), blur_enabled, false).map_err(|e| e.to_string())?;
        wire_spectrum_window_activation_policy(app, &label);
        sync_app_activation_policy(app);
    }

    win.show().map_err(|e| e.to_string())?;
    if overlay_mode {
        let _ = wire_spectrum_toolbar_follow_if_needed(app, &label);
    } else {
        let _ = win.set_focus();
    }

    #[cfg(target_os = "macos")]
    {
        let payload = current_now_playing_snapshot(app);
        let _ = app.emit_to(&label, "now-playing-update", payload);
    }

    Ok(())
}

fn open_extra_lyrics_window_impl(
    app: &tauri::AppHandle,
    anchor_label: Option<String>,
) -> Result<(), String> {
    let anchor_key = anchor_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let anchor_opt = anchor_key
        .as_ref()
        .and_then(|l| app.get_webview_window(l));

    let state = app.state::<StreamState>();
    let n = state
        .lyrics_window_counter
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    let label = format!("{LYRICS_WINDOW_LABEL_PREFIX}{n}");
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let blur_enabled = label_blur_enabled(&state, &label);

    const GAP: i32 = 10;
    const STEP: i32 = 6;
    let i = (n as i32).saturating_sub(1).rem_euclid(4);
    let (px, py) = if let Some(ref anchor) = anchor_opt {
        match (anchor.outer_position(), anchor.outer_size()) {
            (Ok(pos), Ok(sz)) => (
                pos.x + sz.width as i32 + GAP + i * STEP,
                pos.y + GAP + i * STEP,
            ),
            _ => (160 + i * STEP, 160 + i * STEP),
        }
    } else {
        (0, 0)
    };

    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("lyrics.html".into()))
        .title("WaveDance 歌词")
        .inner_size(420.0, 200.0)
        .resizable(true)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(pinned)
        .build()
        .map_err(|e| e.to_string())?;

    position_extra_overlay_window(app, &win, &anchor_opt, px, py)?;

    #[cfg(target_os = "macos")]
    configure_overlay_window(
        win.clone(),
        OverlayWindowStackTier::NowPlayingInfo,
        pinned,
        blur_enabled,
        false,
    )
    .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        win.set_always_on_top(pinned).map_err(|e| e.to_string())?;
        let _ = win.set_ignore_cursor_events(false);
    }

    win.show().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let payload = current_now_playing_snapshot(app);
        let _ = app.emit_to(&label, "now-playing-update", payload);
    }

    Ok(())
}

fn open_extra_cover_window_impl(
    app: &tauri::AppHandle,
    anchor_label: Option<String>,
) -> Result<(), String> {
    let anchor_key = anchor_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let anchor_opt = anchor_key
        .as_ref()
        .and_then(|l| app.get_webview_window(l));

    let state = app.state::<StreamState>();
    let n = state
        .cover_window_counter
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    let label = format!("{COVER_WINDOW_LABEL_PREFIX}{n}");
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let blur_enabled = label_blur_enabled(&state, &label);

    const GAP: i32 = 10;
    const STEP: i32 = 6;
    let i = (n as i32).saturating_sub(1).rem_euclid(4);
    let (px, py) = if let Some(ref anchor) = anchor_opt {
        match (anchor.outer_position(), anchor.outer_size()) {
            (Ok(pos), Ok(sz)) => (
                pos.x + sz.width as i32 + GAP + i * STEP,
                pos.y + GAP + i * STEP,
            ),
            _ => (160 + i * STEP, 160 + i * STEP),
        }
    } else {
        (0, 0)
    };

    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("cover.html".into()))
        .title("WaveDance 封面")
        .inner_size(240.0, 240.0)
        .resizable(true)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(pinned)
        .build()
        .map_err(|e| e.to_string())?;

    position_extra_overlay_window(app, &win, &anchor_opt, px, py)?;

    configure_cover_overlay_window(win.clone(), pinned, blur_enabled).map_err(|e| e.to_string())?;

    wire_cover_window_square_resize(win.clone());

    win.show().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let payload = current_now_playing_snapshot(app);
        let _ = app.emit_to(&label, "now-playing-update", payload);
    }

    Ok(())
}

fn open_extra_songinfo_window_impl(
    app: &tauri::AppHandle,
    anchor_label: Option<String>,
) -> Result<(), String> {
    let anchor_key = anchor_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let anchor_opt = anchor_key
        .as_ref()
        .and_then(|l| app.get_webview_window(l));

    let state = app.state::<StreamState>();
    let n = state
        .songinfo_window_counter
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    let label = format!("{SONGINFO_WINDOW_LABEL_PREFIX}{n}");
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
    let blur_enabled = label_blur_enabled(&state, &label);

    const GAP: i32 = 10;
    const STEP: i32 = 6;
    let i = (n as i32).saturating_sub(1).rem_euclid(4);
    let (px, py) = if let Some(ref anchor) = anchor_opt {
        match (anchor.outer_position(), anchor.outer_size()) {
            (Ok(pos), Ok(sz)) => (
                pos.x + sz.width as i32 + GAP + i * STEP,
                pos.y + GAP + i * STEP,
            ),
            _ => (160 + i * STEP, 160 + i * STEP),
        }
    } else {
        (0, 0)
    };

    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("songinfo.html".into()))
        .title("WaveDance 歌曲信息")
        .inner_size(360.0, 160.0)
        .resizable(true)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(pinned)
        .build()
        .map_err(|e| e.to_string())?;

    position_extra_overlay_window(app, &win, &anchor_opt, px, py)?;

    #[cfg(target_os = "macos")]
    configure_overlay_window(
        win.clone(),
        OverlayWindowStackTier::NowPlayingInfo,
        pinned,
        blur_enabled,
        false,
    )
    .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        win.set_always_on_top(pinned).map_err(|e| e.to_string())?;
    }

    win.show().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let payload = current_now_playing_snapshot(app);
        let _ = app.emit_to(&label, "now-playing-update", payload);
    }

    Ok(())
}

#[tauri::command]
fn open_extra_lyrics_window(
    app: tauri::AppHandle,
    anchor_label: Option<String>,
) -> Result<(), String> {
    open_extra_lyrics_window_impl(&app, anchor_label)
}

#[tauri::command]
fn open_extra_cover_window(
    app: tauri::AppHandle,
    anchor_label: Option<String>,
) -> Result<(), String> {
    open_extra_cover_window_impl(&app, anchor_label)
}

#[tauri::command]
fn open_extra_songinfo_window(
    app: tauri::AppHandle,
    anchor_label: Option<String>,
) -> Result<(), String> {
    open_extra_songinfo_window_impl(&app, anchor_label)
}

#[tauri::command]
fn open_extra_spectrum_window(
    app: tauri::AppHandle,
    anchor_label: Option<String>,
    overlay_mode: Option<bool>,
) -> Result<(), String> {
    open_extra_spectrum_window_impl(&app, anchor_label, overlay_mode.unwrap_or(true))
}

fn notify_settings_visual_target(app: &tauri::AppHandle) {
    let label = app
        .state::<StreamState>()
        .visual_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "main".to_string());
    let _ = app.emit_to("settings", "visual-settings-target", label);
}

fn notify_lyrics_settings_target(app: &tauri::AppHandle) {
    let label = app
        .state::<StreamState>()
        .lyrics_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let _ = app.emit_to("lyrics-settings", "lyrics-settings-target", label);
}

/// 打开歌词设置子窗（挂到对应 `lyrics-*` 父窗，与频谱设置窗同一套窗口行为）。
fn open_lyrics_settings_window_impl(
    app: &tauri::AppHandle,
    lyrics_label: &str,
) -> Result<(), String> {
    let parent = app
        .get_webview_window(lyrics_label)
        .ok_or_else(|| "歌词窗口不存在或已关闭".to_string())?;
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window("lyrics-settings") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

        show_settings_window(app, &settings, pinned)?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        app,
        "lyrics-settings",
        WebviewUrl::App("lyrics-settings.html".into()),
    )
    .title("WaveDance 歌词设置")
    .inner_size(420.0, 520.0)
    .decorations(true)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

    show_settings_window(app, &settings, pinned)
}

#[tauri::command]
fn open_lyrics_settings_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let label = window.label().to_string();
    if !label.starts_with(LYRICS_WINDOW_LABEL_PREFIX) {
        return Err("仅歌词浮层窗可打开歌词设置".to_string());
    }
    if let Ok(mut g) = state.lyrics_settings_target.lock() {
        *g = label.clone();
    }
    open_lyrics_settings_window_impl(&app, &label)?;
    notify_lyrics_settings_target(&app);
    Ok(())
}

/// 关闭「当前设置所针对」的歌词浮层窗（`lyrics-*`），并隐藏歌词设置窗。
#[tauri::command]
fn close_lyrics_settings_window(app: tauri::AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    let target = state
        .lyrics_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();

    if let Some(settings) = app.get_webview_window("lyrics-settings") {
        let _ = settings.hide();
    }

    if target.starts_with(LYRICS_WINDOW_LABEL_PREFIX) {
        if let Some(w) = app.get_webview_window(&target) {
            w.close().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_lyrics_settings_target(state: State<'_, StreamState>) -> String {
    state
        .lyrics_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

fn notify_lyrics_search_target(app: &tauri::AppHandle) {
    let label = app
        .state::<StreamState>()
        .lyrics_search_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let _ = app.emit_to("lyrics-search", "lyrics-search-target", label);
}

/// 打开歌词加载信息子窗（挂到对应 `lyrics-*` 父窗）。
fn open_lyrics_search_window_impl(
    app: &tauri::AppHandle,
    lyrics_label: &str,
) -> Result<(), String> {
    let parent = app
        .get_webview_window(lyrics_label)
        .ok_or_else(|| "歌词窗口不存在或已关闭".to_string())?;
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(search) = app.get_webview_window("lyrics-search") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_parent_space(&parent, &search).map_err(|e| e.to_string())?;

        show_settings_window(app, &search, pinned)?;
        return Ok(());
    }

    let search = WebviewWindowBuilder::new(
        app,
        "lyrics-search",
        WebviewUrl::App("lyrics-search.html".into()),
    )
    .title("WaveDance 歌词加载")
    .inner_size(440.0, 560.0)
    .decorations(true)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    attach_settings_window_to_parent_space(&parent, &search).map_err(|e| e.to_string())?;

    show_settings_window(app, &search, pinned)
}

#[tauri::command]
fn open_lyrics_search_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let label = window.label().to_string();
    if !label.starts_with(LYRICS_WINDOW_LABEL_PREFIX) {
        return Err("仅歌词浮层窗可打开歌词加载信息".to_string());
    }
    if let Ok(mut g) = state.lyrics_search_target.lock() {
        *g = label.clone();
    }
    open_lyrics_search_window_impl(&app, &label)?;
    notify_lyrics_search_target(&app);
    #[cfg(target_os = "macos")]
    {
        let session = app.state::<lyrics::LyricsFetcher>().get_search_session();
        let _ = app.emit_to("lyrics-search", "lyrics-search-update", session);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn get_lyrics_search_session(
    fetcher: State<'_, lyrics::LyricsFetcher>,
) -> lyrics::LyricsSearchSessionPayload {
    fetcher.get_search_session()
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn select_lyrics_candidate(
    app: tauri::AppHandle,
    fetcher: State<'_, lyrics::LyricsFetcher>,
    candidate_id: String,
) -> Result<(), String> {
    fetcher.select_candidate(&app, &candidate_id)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn refresh_lyrics_search(
    app: tauri::AppHandle,
    monitor: State<'_, now_playing::NowPlayingMonitor>,
    fetcher: State<'_, lyrics::LyricsFetcher>,
) {
    let snap = monitor.snapshot();
    fetcher.refresh_search(
        &app,
        &lyrics::LyricTrackQuery {
            active: snap.active,
            title: snap.title,
            artist: snap.artist,
            album: snap.album,
            duration: snap.duration,
        },
    );
}

fn notify_cover_settings_target(app: &tauri::AppHandle) {
    let label = app
        .state::<StreamState>()
        .cover_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let _ = app.emit_to("cover-settings", "cover-settings-target", label);
}

/// 打开封面设置子窗（挂到对应 `cover-*` 父窗）。
fn open_cover_settings_window_impl(
    app: &tauri::AppHandle,
    cover_label: &str,
) -> Result<(), String> {
    let parent = app
        .get_webview_window(cover_label)
        .ok_or_else(|| "封面窗口不存在或已关闭".to_string())?;
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window("cover-settings") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

        show_settings_window(app, &settings, pinned)?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        app,
        "cover-settings",
        WebviewUrl::App("cover-settings.html".into()),
    )
    .title("WaveDance 封面设置")
    .inner_size(420.0, 560.0)
    .decorations(true)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

    show_settings_window(app, &settings, pinned)
}

#[tauri::command]
fn open_cover_settings_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let label = window.label().to_string();
    if !label.starts_with(COVER_WINDOW_LABEL_PREFIX) {
        return Err("仅封面浮层窗可打开封面设置".to_string());
    }
    if let Ok(mut g) = state.cover_settings_target.lock() {
        *g = label.clone();
    }
    open_cover_settings_window_impl(&app, &label)?;
    notify_cover_settings_target(&app);
    Ok(())
}

/// 关闭「当前设置所针对」的封面浮层窗（`cover-*`），并隐藏封面设置窗。
#[tauri::command]
fn close_cover_settings_window(app: tauri::AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    let target = state
        .cover_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();

    if let Some(settings) = app.get_webview_window("cover-settings") {
        let _ = settings.hide();
    }

    if target.starts_with(COVER_WINDOW_LABEL_PREFIX) {
        if let Some(w) = app.get_webview_window(&target) {
            w.close().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_cover_settings_target(state: State<'_, StreamState>) -> String {
    state
        .cover_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn open_player_settings_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    let parent = app
        .get_webview_window(MUSIC_PLAYER_LABEL)
        .ok_or_else(|| "播放控制窗口不存在或已关闭".to_string())?;
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window(PLAYER_SETTINGS_LABEL) {
        attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;
        show_settings_window(app, &settings, pinned)?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        app,
        PLAYER_SETTINGS_LABEL,
        WebviewUrl::App("player-settings.html".into()),
    )
    .title("WaveDance 播放控制设置")
    .inner_size(420.0, 360.0)
    .decorations(true)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;
    show_settings_window(app, &settings, pinned)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_player_settings_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    if window.label() != MUSIC_PLAYER_LABEL {
        return Err("仅播放控制窗可打开播放控制设置".to_string());
    }
    if let Ok(mut g) = state.player_settings_target.lock() {
        *g = MUSIC_PLAYER_LABEL.to_string();
    }
    open_player_settings_window_impl(&app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn close_player_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(settings) = app.get_webview_window(PLAYER_SETTINGS_LABEL) {
        let _ = settings.hide();
    }
    if let Some(w) = app.get_webview_window(MUSIC_PLAYER_LABEL) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn notify_songinfo_settings_target(app: &tauri::AppHandle) {
    let label = app
        .state::<StreamState>()
        .songinfo_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let _ = app.emit_to("songinfo-settings", "songinfo-settings-target", label);
}

/// 打开歌曲信息设置子窗（挂到对应 `songinfo-*` 父窗）。
fn open_songinfo_settings_window_impl(
    app: &tauri::AppHandle,
    songinfo_label: &str,
) -> Result<(), String> {
    let parent = app
        .get_webview_window(songinfo_label)
        .ok_or_else(|| "歌曲信息窗口不存在或已关闭".to_string())?;
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window("songinfo-settings") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

        show_settings_window(app, &settings, pinned)?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        app,
        "songinfo-settings",
        WebviewUrl::App("songinfo-settings.html".into()),
    )
    .title("WaveDance 歌曲信息设置")
    .inner_size(420.0, 640.0)
    .decorations(true)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

    show_settings_window(app, &settings, pinned)
}

#[tauri::command]
fn open_songinfo_settings_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let label = window.label().to_string();
    if !label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX) {
        return Err("仅歌曲信息浮层窗可打开歌曲信息设置".to_string());
    }
    if let Ok(mut g) = state.songinfo_settings_target.lock() {
        *g = label.clone();
    }
    open_songinfo_settings_window_impl(&app, &label)?;
    notify_songinfo_settings_target(&app);
    Ok(())
}

/// 关闭「当前设置所针对」的歌曲信息浮层窗（`songinfo-*`），并隐藏设置窗。
#[tauri::command]
fn close_songinfo_settings_window(app: tauri::AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    let target = state
        .songinfo_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();

    if let Some(settings) = app.get_webview_window("songinfo-settings") {
        let _ = settings.hide();
    }

    if target.starts_with(SONGINFO_WINDOW_LABEL_PREFIX) {
        if let Some(w) = app.get_webview_window(&target) {
            w.close().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_songinfo_settings_target(state: State<'_, StreamState>) -> String {
    state
        .songinfo_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// 菜单栏托盘「设置」与 `open_settings_window` 命令共用。
fn open_settings_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    let preferred = app
        .state::<StreamState>()
        .visual_settings_target
        .lock()
        .ok()
        .map(|g| g.clone());
    let (parent_label, parent) =
        resolve_settings_parent_window(app, preferred.as_deref())?;
    if preferred.as_deref() != Some(parent_label.as_str()) {
        if let Ok(mut g) = app.state::<StreamState>().visual_settings_target.lock() {
            *g = parent_label.clone();
        }
    }

    // 先激活父图形窗，确保当前 Space 一致，再挂接/显示设置窗（与歌词/封面设置同一套动态子窗逻辑）。
    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

        show_settings_window(app, &settings, pinned)?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("WaveDance 设置")
    .inner_size(620.0, 760.0)
    .decorations(true)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

    show_settings_window(app, &settings, pinned)
}

/// 托盘「设置」：父窗与视觉目标对齐到当前仍打开的图形窗（主窗或频谱窗）。
fn open_settings_window_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let (parent_label, _) = resolve_settings_parent_window(app, None)?;
    if let Ok(mut g) = app.state::<StreamState>().visual_settings_target.lock() {
        *g = parent_label;
    }
    open_settings_window_impl(app)?;
    notify_settings_visual_target(app);
    Ok(())
}

fn open_window_manager_impl(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(WINDOW_MANAGER_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().ok();
        configure_window_manager_level(&win).map_err(|e| e.to_string())?;
        raise_window_manager_if_visible(app).map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        app,
        WINDOW_MANAGER_LABEL,
        WebviewUrl::App("window-manager.html".into()),
    )
    .title("WaveDance 窗口管理")
    .inner_size(480.0, 520.0)
    .resizable(true)
    .decorations(true)
    .shadow(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });

    win.show().map_err(|e| e.to_string())?;
    configure_window_manager_level(&win).map_err(|e| e.to_string())?;
    raise_window_manager_if_visible(app).map_err(|e| e.to_string())?;
    sync_app_activation_policy(app);
    Ok(())
}

fn open_window_manager_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    open_window_manager_impl(app)
}

fn show_auxiliary_panel_window(label: &str, app: &tauri::AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window(label) else {
        return Ok(());
    };
    win.show().map_err(|e| e.to_string())?;
    win.unminimize().ok();
    configure_window_manager_level(&win).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let w = win.clone();
        win.run_on_main_thread(move || unsafe {
            let ns_window: &NSWindow = &*w
                .ns_window()
                .expect("无法获取 macOS 窗口句柄")
                .cast();
            ns_window.orderFrontRegardless();
        })
        .map_err(|e| e.to_string())?;
    }
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn open_esp_display_settings_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window(ESP_DISPLAY_SETTINGS_LABEL).is_some() {
        show_auxiliary_panel_window(ESP_DISPLAY_SETTINGS_LABEL, app)?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        app,
        ESP_DISPLAY_SETTINGS_LABEL,
        WebviewUrl::App("esp-display-settings.html".into()),
    )
    .title("WaveDance 外接屏设置")
    .inner_size(440.0, 560.0)
    .resizable(true)
    .decorations(true)
    .shadow(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });

    win.show().map_err(|e| e.to_string())?;
    configure_window_manager_level(&win).map_err(|e| e.to_string())?;
    sync_app_activation_policy(app);
    Ok(())
}

fn open_esp_display_settings_window_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    open_esp_display_settings_window_impl(app)
}

#[tauri::command]
fn open_esp_display_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    open_esp_display_settings_window_impl(&app)
}

const MUSIC_PLAYLIST_RELOAD_EVENT: &str = "music-playlist-should-reload";

fn notify_playlist_window_reload(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window(MUSIC_PLAYLIST_LABEL) {
        let _ = win.emit(MUSIC_PLAYLIST_RELOAD_EVENT, ());
    }
}

#[cfg(target_os = "macos")]
fn open_music_playlist_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(MUSIC_PLAYLIST_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().ok();
        win.set_focus().map_err(|e| e.to_string())?;
        refresh_playlist_window(app).map_err(|e| e.to_string())?;
        notify_playlist_window_reload(app);
        return Ok(());
    }

    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);

    let win = WebviewWindowBuilder::new(
        app,
        MUSIC_PLAYLIST_LABEL,
        WebviewUrl::App("music-playlist.html".into()),
    )
    .title("WaveDance 歌单")
    .inner_size(507.0, 520.0)
    .min_inner_size(427.0, 240.0)
    .resizable(true)
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(pinned)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });

    #[cfg(target_os = "macos")]
    configure_overlay_window(
        win.clone(),
        OverlayWindowStackTier::NowPlayingInfo,
        pinned,
        true,
        false,
    )
    .map_err(|e| e.to_string())?;

    win.show().map_err(|e| e.to_string())?;
    notify_playlist_window_reload(app);
    sync_app_activation_policy(app);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_music_playlist_window_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    open_music_playlist_window_impl(app)
}

#[cfg(target_os = "macos")]
fn open_music_player_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(MUSIC_PLAYER_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().ok();
        win.set_focus().map_err(|e| e.to_string())?;
        let snapshot = app.state::<music_platform::MusicPlayerState>().snapshot();
        let _ = win.emit(music_platform::MUSIC_PLAYER_STATE_EVENT, snapshot);
        return Ok(());
    }

    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);

    let win = WebviewWindowBuilder::new(
        app,
        MUSIC_PLAYER_LABEL,
        WebviewUrl::App("music-player.html".into()),
    )
    .title("WaveDance 播放控制")
    .inner_size(600.0, 168.0)
    .min_inner_size(520.0, 148.0)
    .resizable(true)
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(pinned)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });

    #[cfg(target_os = "macos")]
    {
        let blur_enabled = label_blur_enabled(&state, MUSIC_PLAYER_LABEL);
        configure_cover_overlay_window(win.clone(), pinned, blur_enabled).map_err(|e| e.to_string())?;
    }

    win.show().map_err(|e| e.to_string())?;

    let snapshot = app.state::<music_platform::MusicPlayerState>().snapshot();
    let _ = win.emit(music_platform::MUSIC_PLAYER_STATE_EVENT, snapshot);
    sync_app_activation_policy(app);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_music_player_queue_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(MUSIC_PLAYER_QUEUE_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().ok();
        win.set_focus().map_err(|e| e.to_string())?;
        let snapshot = app.state::<music_platform::MusicPlayerState>().snapshot();
        let _ = win.emit(music_platform::MUSIC_PLAYER_STATE_EVENT, snapshot);
        return Ok(());
    }

    let state = app.state::<StreamState>();
    let pinned = state.overlay_pinned.load(Ordering::SeqCst);

    let win = WebviewWindowBuilder::new(
        app,
        MUSIC_PLAYER_QUEUE_LABEL,
        WebviewUrl::App("music-player-queue.html".into()),
    )
    .title("WaveDance 播放列表")
    .inner_size(507.0, 520.0)
    .min_inner_size(427.0, 240.0)
    .resizable(true)
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(pinned)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });

    configure_overlay_window(
        win.clone(),
        OverlayWindowStackTier::NowPlayingInfo,
        pinned,
        true,
        false,
    )
    .map_err(|e| e.to_string())?;

    win.show().map_err(|e| e.to_string())?;
    let snapshot = app.state::<music_platform::MusicPlayerState>().snapshot();
    let _ = win.emit(music_platform::MUSIC_PLAYER_STATE_EVENT, snapshot);
    sync_app_activation_policy(app);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_music_player_queue_window_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    open_music_player_queue_window_impl(app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_music_player_queue_window(app: tauri::AppHandle) -> Result<(), String> {
    open_music_player_queue_window_impl(&app)
}

#[cfg(target_os = "macos")]
fn open_music_player_window_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    open_music_player_window_impl(app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_music_player_window(app: tauri::AppHandle) -> Result<(), String> {
    open_music_player_window_impl(&app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_music_playlist_window(app: tauri::AppHandle) -> Result<(), String> {
    open_music_playlist_window_impl(&app)
}

#[cfg(target_os = "macos")]
fn open_music_platform_login_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(MUSIC_PLATFORM_LOGIN_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().ok();
        configure_window_manager_level(&win).map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        app,
        MUSIC_PLATFORM_LOGIN_LABEL,
        WebviewUrl::App("music-platform-login.html".into()),
    )
    .title("WaveDance 音乐平台登录")
    .inner_size(520.0, 640.0)
    .resizable(true)
    .decorations(true)
    .shadow(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            sync_app_activation_policy(&handle);
        }
    });

    win.show().map_err(|e| e.to_string())?;
    configure_window_manager_level(&win).map_err(|e| e.to_string())?;
    sync_app_activation_policy(app);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_music_platform_login_window_from_tray(app: &tauri::AppHandle) -> Result<(), String> {
    open_music_platform_login_window_impl(app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_music_platform_login_window(app: tauri::AppHandle) -> Result<(), String> {
    open_music_platform_login_window_impl(&app)
}

fn supports_window_edge_reveal(app: &tauri::AppHandle, label: &str) -> bool {
    if label == "main" {
        return true;
    }
    if label.starts_with(LYRICS_WINDOW_LABEL_PREFIX)
        || label.starts_with(COVER_WINDOW_LABEL_PREFIX)
        || label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX)
        || {
            #[cfg(target_os = "macos")]
            {
                is_music_overlay_label(label)
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = label;
                false
            }
        }
    {
        return true;
    }
    if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        let state = app.state::<StreamState>();
        return spectrum_is_overlay_mode(&state, label);
    }
    false
}

fn reveal_window_edges_for_label(app: &tauri::AppHandle, label: &str) {
    if !supports_window_edge_reveal(app, label) {
        return;
    }
    for (other_label, _) in app.webview_windows() {
        if other_label == label || !supports_window_edge_reveal(app, &other_label) {
            continue;
        }
        let _ = app.emit_to(&other_label, "hide-window-edges", ());
    }
    let _ = app.emit_to(label, "reveal-window-edges", ());
}

#[tauri::command]
fn list_managed_windows(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
) -> Result<Vec<ManagedWindowInfo>, String> {
    let mut items: Vec<ManagedWindowInfo> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| !is_internal_auxiliary_window_label(label))
        .map(|(label, win)| ManagedWindowInfo {
            title: managed_window_display_name(&state, &label),
            visible: win.is_visible().unwrap_or(false),
            label,
        })
        .collect();
    items.sort_by(|a, b| {
        managed_window_sort_key(&a.label).cmp(&managed_window_sort_key(&b.label))
    });
    Ok(items)
}

#[tauri::command]
fn focus_managed_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let label = label.trim().to_string();
    if is_internal_auxiliary_window_label(&label) {
        return Err("无法聚焦该窗口".to_string());
    }
    let Some(win) = app.get_webview_window(&label) else {
        return Err("窗口已关闭".to_string());
    };

    if is_settings_window_label(&label) {
        let pinned = app
            .state::<StreamState>()
            .overlay_pinned
            .load(Ordering::SeqCst);
        show_settings_window(&app, &win, pinned)?;
        return Ok(());
    }

    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    if overlay_tier_for_label(&app, &label).is_some() {
        reassert_overlay_window_stack(&app).map_err(|e| e.to_string())?;
    }

    reveal_window_edges_for_label(&app, &label);
    Ok(())
}

#[tauri::command]
fn close_managed_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let label = label.trim().to_string();
    if is_internal_auxiliary_window_label(&label) {
        return Err("无法关闭该窗口".to_string());
    }
    if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        let tb_label = toolbar_webview_label_for_spectrum(&label);
        if let Some(tb) = app.get_webview_window(&tb_label) {
            let _ = tb.close();
        }
    }
    let Some(win) = app.get_webview_window(&label) else {
        return Ok(());
    };
    win.close().map_err(|e| e.to_string())?;
    let state = app.state::<StreamState>();
    cleanup_after_spectrum_graphic_close(&state, &label);
    sync_app_activation_policy(&app);
    Ok(())
}

#[tauri::command]
fn get_visual_settings_target(state: State<'_, StreamState>) -> String {
    state
        .visual_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "main".to_string())
}

#[tauri::command]
fn open_settings_window(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    visual_target_label: Option<String>,
) -> Result<(), String> {
    let label = visual_target_label
        .as_deref()
        .map(str::trim)
        .filter(|s| *s == "main" || s.starts_with("spectrum-"))
        .unwrap_or("main")
        .to_string();
    if let Ok(mut g) = state.visual_settings_target.lock() {
        *g = label;
    }
    open_settings_window_impl(&app)?;
    notify_settings_visual_target(&app);
    Ok(())
}

#[tauri::command]
fn start_window_dragging(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let label = window.label().to_string();
    let spectrum_overlay = is_spectrum_overlay_label(&app, &label);
    window.start_dragging().map_err(|e| e.to_string())?;
    if spectrum_overlay {
        reassert_overlay_window_stack(&app).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 浮层窗边缘提示：显示穿透解锁浮动条并通知其前端展示按钮（3s 后由 toolbar.js 自行隐藏）。
#[tauri::command]
fn reveal_overlay_unlock_toolbar(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let label = label.trim().to_string();
    let state = app.state::<StreamState>();
    if !overlay_uses_edge_reveal_unlock(&state, &label) {
        return Err("仅浮层歌词窗、歌曲信息窗与浮层频谱窗支持临时解锁条".to_string());
    }
    if !label_passthrough_locked(&state, &label) {
        return Ok(());
    }
    let tb_label = toolbar_webview_label_for_spectrum(&label);
    ensure_spectrum_pass_through_toolbar_created(&app, &label)?;

    #[cfg(target_os = "macos")]
    {
        let Some(parent) = app.get_webview_window(&label) else {
            return Err("浮层窗口不存在".to_string());
        };
        let app_h = app.clone();
        let pl = label.clone();
        let tbl = tb_label.clone();
        return parent
            .run_on_main_thread(move || {
                let _ = position_floating_toolbar_near_parent(&app_h, &pl, &tbl);
                if let Some(tb) = app_h.get_webview_window(&tbl) {
                    let _ = tb.show();
                    let _ = app_h.emit_to(&tbl, "overlay-unlock-toolbar-reveal", ());
                }
            })
            .map_err(|e| e.to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        position_floating_toolbar_near_parent(&app, &label, &tb_label)?;
        if let Some(tb) = app.get_webview_window(&tb_label) {
            tb.show().map_err(|e| e.to_string())?;
            let _ = app.emit_to(&tb_label, "overlay-unlock-toolbar-reveal", ());
        }
        Ok(())
    }
}

#[tauri::command]
fn resize_window_by_delta(
    window: tauri::WebviewWindow,
    direction: String,
    delta_x: i32,
    delta_y: i32,
) -> Result<(), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    let mut x = pos.x;
    let mut y = pos.y;
    let mut width = size.width as i32;
    let mut height = size.height as i32;
    let right = x + width;
    let bottom = y + height;

    let normalized = direction.to_lowercase();
    let resize_west = normalized.contains("west");
    let resize_east = normalized.contains("east");
    let resize_north = normalized.contains("north");
    let resize_south = normalized.contains("south");

    if resize_west {
        x += delta_x;
        width -= delta_x;
    }
    if resize_east {
        width += delta_x;
    }
    if resize_north {
        y += delta_y;
        height -= delta_y;
    }
    if resize_south {
        height += delta_y;
    }

    let label = window.label();
    let (min_width, min_height) = if label.starts_with(LYRICS_WINDOW_LABEL_PREFIX) {
        (260, 96)
    } else if label == "music-playlist" || label == MUSIC_PLAYER_QUEUE_LABEL {
        (427, 240)
    } else if label == "music-player" {
        (520, 148)
    } else if label.starts_with(SONGINFO_WINDOW_LABEL_PREFIX) {
        (220, 96)
    } else if label.starts_with(COVER_WINDOW_LABEL_PREFIX) {
        (COVER_MIN_SIDE_PX, COVER_MIN_SIDE_PX)
    } else {
        (640, 420)
    };

    if width < min_width {
        width = min_width;
        if resize_west {
            x = right - width;
        }
    }
    if height < min_height {
        height = min_height;
        if resize_north {
            y = bottom - height;
        }
    }

    if label.starts_with(COVER_WINDOW_LABEL_PREFIX) {
        apply_cover_square_size(
            &mut x,
            &mut y,
            &mut width,
            &mut height,
            right,
            bottom,
            resize_west,
            resize_north,
        );
    }

    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    window
        .set_size(Size::Physical(PhysicalSize::new(width as u32, height as u32)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    let recall_shortcut = Shortcut::new(
        Some(Modifiers::SUPER | Modifiers::SHIFT | Modifiers::ALT),
        Code::KeyW,
    );
    let passthrough_toggle_shortcut = Shortcut::new(
        Some(Modifiers::SUPER | Modifiers::SHIFT | Modifiers::ALT),
        Code::KeyL,
    );
    let recall_shortcut_for_handler = recall_shortcut.clone();
    let passthrough_shortcut_for_handler = passthrough_toggle_shortcut.clone();
    let recall_shortcut_for_setup = recall_shortcut.clone();
    let passthrough_shortcut_for_setup = passthrough_toggle_shortcut.clone();
    let stream_state = StreamState::default();
    let esp_display_state = Arc::clone(&stream_state.esp_display);
    let mut app_builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    {
        app_builder = app_builder.register_asynchronous_uri_scheme_protocol(
            "audio-proxy",
            |_ctx, request, responder| {
                music_platform::audio_proxy::handle_request(request, responder);
            },
        );
    }
    app_builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &recall_shortcut_for_handler {
                        let _ = recall_overlay_window(app);
                    } else if shortcut == &passthrough_shortcut_for_handler {
                        if app.get_webview_window("main").is_none() {
                            return;
                        }
                        let state = app.state::<StreamState>();
                        let cur = label_passthrough_locked(&state, "main");
                        let _ = apply_mouse_passthrough_locked_change(app, "main", !cur);
                    }
                })
                .build(),
        )
        .manage(stream_state)
        .manage(esp_display_state)
        .setup(move |app| -> Result<(), Box<dyn std::error::Error>> {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(ActivationPolicy::Accessory);
                refresh_main_overlay_window(app.handle())?;
            }
            create_main_toolbar_window(app.handle()).map_err(|e| -> Box<dyn std::error::Error> {
                e.into()
            })?;
            sync_floating_toolbar_window(app.handle()).map_err(|e| -> Box<dyn std::error::Error> {
                e.into()
            })?;
            wire_main_window_toolbar_follow(app.handle().clone());
            app.global_shortcut().register(recall_shortcut_for_setup)?;
            app.global_shortcut()
                .register(passthrough_shortcut_for_setup)?;

            #[cfg(target_os = "macos")]
            {
                const TRAY_MENU_SETTINGS: &str = "tray_settings";
                const TRAY_MENU_ESP_DISPLAY: &str = "tray_esp_display";
                const TRAY_MENU_WINDOW_MANAGER: &str = "tray_window_manager";
                const TRAY_MENU_MUSIC_LOGIN: &str = "tray_music_login";
                const TRAY_MENU_MUSIC_PLAYLIST: &str = "tray_music_playlist";
                const TRAY_MENU_MUSIC_PLAYER_QUEUE: &str = "tray_music_player_queue";
                const TRAY_MENU_MUSIC_PLAYER: &str = "tray_music_player";
                const TRAY_MENU_NEW_SPECTRUM: &str = "tray_new_spectrum";
                const TRAY_MENU_NEW_SPECTRUM_TRADITIONAL: &str = "tray_new_spectrum_traditional";
                const TRAY_MENU_NEW_LYRICS: &str = "tray_new_lyrics";
                const TRAY_MENU_NEW_COVER: &str = "tray_new_cover";
                const TRAY_MENU_NEW_SONGINFO: &str = "tray_new_songinfo";
                const TRAY_MENU_QUIT: &str = "tray_quit";

                let Some(icon) = app.default_window_icon().cloned() else {
                    return Err("缺少 bundle 图标，无法创建菜单栏托盘".into());
                };
                let menu = MenuBuilder::new(app.handle())
                    .text(TRAY_MENU_SETTINGS, "设置…")
                    .text(TRAY_MENU_ESP_DISPLAY, "外接屏设置…")
                    .text(TRAY_MENU_WINDOW_MANAGER, "窗口管理…")
                    .text(TRAY_MENU_MUSIC_LOGIN, "登录音乐平台…")
                    .text(TRAY_MENU_MUSIC_PLAYLIST, "查看歌单…")
                    .text(TRAY_MENU_MUSIC_PLAYER, "播放控制…")
                    .text(TRAY_MENU_MUSIC_PLAYER_QUEUE, "播放列表…")
                    .text(TRAY_MENU_NEW_SPECTRUM, "新建浮层频谱窗口")
                    .text(TRAY_MENU_NEW_SPECTRUM_TRADITIONAL, "新建传统频谱窗口")
                    .text(TRAY_MENU_NEW_LYRICS, "新建浮层歌词窗口")
                    .text(TRAY_MENU_NEW_COVER, "新建歌曲封面窗口")
                    .text(TRAY_MENU_NEW_SONGINFO, "新建歌曲信息窗口")
                    .separator()
                    .text(TRAY_MENU_QUIT, "退出 WaveDance")
                    .build()?;

                let _tray = TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("WaveDance")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| {
                        if event.id() == TRAY_MENU_SETTINGS {
                            let _ = open_settings_window_from_tray(app);
                        } else if event.id() == TRAY_MENU_ESP_DISPLAY {
                            let _ = open_esp_display_settings_window_from_tray(app);
                        } else if event.id() == TRAY_MENU_WINDOW_MANAGER {
                            let _ = open_window_manager_from_tray(app);
                        } else if event.id() == TRAY_MENU_MUSIC_LOGIN {
                            let _ = open_music_platform_login_window_from_tray(app);
                        } else if event.id() == TRAY_MENU_MUSIC_PLAYLIST {
                            let _ = open_music_playlist_window_from_tray(app);
                        } else if event.id() == TRAY_MENU_MUSIC_PLAYER {
                            let _ = open_music_player_window_from_tray(app);
                        } else if event.id() == TRAY_MENU_MUSIC_PLAYER_QUEUE {
                            let _ = open_music_player_queue_window_from_tray(app);
                        } else if event.id() == TRAY_MENU_NEW_SPECTRUM {
                            let _ = open_extra_spectrum_window_impl(app, None, true);
                        } else if event.id() == TRAY_MENU_NEW_SPECTRUM_TRADITIONAL {
                            let _ = open_extra_spectrum_window_impl(app, None, false);
                        } else if event.id() == TRAY_MENU_NEW_LYRICS {
                            let _ = open_extra_lyrics_window_impl(app, None);
                        } else if event.id() == TRAY_MENU_NEW_COVER {
                            let _ = open_extra_cover_window_impl(app, None);
                        } else if event.id() == TRAY_MENU_NEW_SONGINFO {
                            let _ = open_extra_songinfo_window_impl(app, None);
                        } else if event.id() == TRAY_MENU_QUIT {
                            app.exit(0);
                        }
                    })
                    .build(app.handle())?;
            }

            #[cfg(target_os = "macos")]
            {
                app.manage(std::sync::Arc::new(music_platform::QqLoginCoordinator::default()));
                app.manage(music_platform::MusicPlayerState::default());
                app.manage(music_platform::InternalPlayerNowPlayingBridge::default());
                app.manage(lyrics::LyricsFetcher::default());
                app.manage(now_playing::spawn_monitor(app.handle().clone()));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_waveform_stream,
            stop_waveform_stream,
            get_waveform_stream_running,
            esp_display::list_serial_ports,
            esp_display::get_esp_display_config,
            esp_display::set_esp_display_config,
            esp_display::test_esp_display_ping,
            set_capture_source_mode,
            get_capture_source_mode,
            submit_player_waveform_frame,
            update_bucket_count,
            get_bucket_count,
            update_bucket_mode,
            get_bucket_mode,
            update_high_tilt_percent,
            get_high_tilt_percent,
            update_silence_gates,
            get_silence_gates,
            update_frequency_range,
            get_frequency_range,
            set_waveform_color,
            get_waveform_color,
            set_waveform_line_width,
            get_waveform_line_width,
            get_loopback_device_status,
            open_blackhole_installer,
            open_audio_midi_setup,
            open_sound_settings,
            set_overlay_pinned,
            get_overlay_pinned,
            set_overlay_blur_enabled,
            get_overlay_blur_enabled,
            set_mouse_passthrough_locked,
            get_mouse_passthrough_locked,
            open_settings_window,
            open_esp_display_settings_window,
            list_managed_windows,
            focus_managed_window,
            close_managed_window,
            close_settings_window,
            get_visual_settings_target,
            open_extra_spectrum_window,
            open_extra_lyrics_window,
            open_extra_cover_window,
            open_extra_songinfo_window,
            open_lyrics_settings_window,
            close_lyrics_settings_window,
            get_lyrics_settings_target,
            open_lyrics_search_window,
            #[cfg(target_os = "macos")]
            get_lyrics_search_session,
            #[cfg(target_os = "macos")]
            select_lyrics_candidate,
            #[cfg(target_os = "macos")]
            refresh_lyrics_search,
            open_cover_settings_window,
            close_cover_settings_window,
            get_cover_settings_target,
            open_songinfo_settings_window,
            close_songinfo_settings_window,
            get_songinfo_settings_target,
            get_spectrum_window_overlay_mode,
            quit_app,
            start_window_dragging,
            reveal_overlay_unlock_toolbar,
            resize_window_by_delta,
            #[cfg(target_os = "macos")]
            get_now_playing_snapshot,
            #[cfg(target_os = "macos")]
            sync_lyrics_for_now_playing,
            #[cfg(target_os = "macos")]
            open_music_platform_login_window,
            #[cfg(target_os = "macos")]
            music_platform::music_platform_get_status,
            #[cfg(target_os = "macos")]
            music_platform::netease_qr_start,
            #[cfg(target_os = "macos")]
            music_platform::netease_qr_poll,
            #[cfg(target_os = "macos")]
            music_platform::netease_logout,
            #[cfg(target_os = "macos")]
            music_platform::qq_login_open_webview,
            #[cfg(target_os = "macos")]
            music_platform::qq_login_close_webview,
            #[cfg(target_os = "macos")]
            music_platform::qq_logout,
            #[cfg(target_os = "macos")]
            open_music_playlist_window,
            #[cfg(target_os = "macos")]
            open_music_player_window,
            #[cfg(target_os = "macos")]
            open_music_player_queue_window,
            #[cfg(target_os = "macos")]
            open_player_settings_window,
            #[cfg(target_os = "macos")]
            close_player_settings_window,
            #[cfg(target_os = "macos")]
            music_platform::music_playlist_get_context,
            #[cfg(target_os = "macos")]
            music_platform::music_playlist_list,
            #[cfg(target_os = "macos")]
            music_platform::music_playlist_tracks,
            #[cfg(target_os = "macos")]
            music_platform::music_song_url,
            #[cfg(target_os = "macos")]
            music_platform::audio_proxy::music_audio_playback_url,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_get_state,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_set_queue,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_toggle,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_pause,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_play,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_next,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_prev,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_set_loop_mode,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_set_quality,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_seek,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_report_progress,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_set_loading,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_set_error,
            #[cfg(target_os = "macos")]
            music_platform::player::music_player_play_index
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // 托盘常驻：仅菜单「退出」会带显式 exit code；误关窗口触发的退出请求一律拦截。
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
