#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, AtomicU8, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;

#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSColor, NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowOrderingMode,
};
#[cfg(target_os = "macos")]
use window_vibrancy::clear_vibrancy;
use rustfft::{num_complex::Complex, FftPlanner};
use tauri::{
    window::{Effect, EffectState, EffectsBuilder},
    ActivationPolicy, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    Position, Size, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(target_os = "macos")]
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use wavedance::audio_capture::{AudioSource, MacSystemAudioSource};
use wavedance::audio_processing::WaveformFrame;
use wavedance::platform::PlatformService;

struct StreamState {
    running: Arc<AtomicBool>,
    capture_source_mode: Arc<AtomicU8>,
    overlay_pinned: Arc<AtomicBool>,
    overlay_blur_enabled: Arc<AtomicBool>,
    /// 各图形窗（`main` / `spectrum-*`）整窗鼠标穿透是否开启；键存在且为 true 表示锁定。
    mouse_passthrough_by_label: Arc<Mutex<HashMap<String, bool>>>,
    /// 已为对应 `spectrum-*` 注册过「移动/缩放时重贴浮动解锁条」监听，避免重复绑定。
    spectrum_toolbar_follow_wired: Arc<Mutex<HashSet<String>>>,
    bucket_count: Arc<AtomicUsize>,
    bucket_mode: Arc<AtomicU8>,
    high_tilt_percent: Arc<AtomicUsize>,
    freq_min_hz: Arc<AtomicUsize>,
    freq_max_hz: Arc<AtomicUsize>,
    waveform_color_hex: Arc<Mutex<String>>,
    /// 波形线宽（逻辑像素），由前端用多条竖直偏移的 LINE_STRIP 模拟；WebGL 的 lineWidth 在浏览器中常无效。
    waveform_line_width_px: Arc<AtomicUsize>,
    /// 用于生成额外频谱窗口标签 `spectrum-{n}`（与主窗共用采集与 `waveform-frame` 广播）。
    spectrum_window_counter: Arc<AtomicU64>,
    /// 额外频谱窗是否为浮层模式（可覆盖全屏应用）；false 为传统窗口（可正常全屏）。
    spectrum_overlay_by_label: Arc<Mutex<HashMap<String, bool>>>,
    /// 设置页当前编辑的频谱窗口 label（`main` 或 `spectrum-*`）；外观类事件只发往该窗。
    visual_settings_target: Arc<Mutex<String>>,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            capture_source_mode: Arc::new(AtomicU8::new(0)),
            overlay_pinned: Arc::new(AtomicBool::new(true)),
            overlay_blur_enabled: Arc::new(AtomicBool::new(false)),
            mouse_passthrough_by_label: Arc::new(Mutex::new(HashMap::new())),
            spectrum_toolbar_follow_wired: Arc::new(Mutex::new(HashSet::new())),
            bucket_count: Arc::new(AtomicUsize::new(256)),
            bucket_mode: Arc::new(AtomicU8::new(1)),
            high_tilt_percent: Arc::new(AtomicUsize::new(35)),
            freq_min_hz: Arc::new(AtomicUsize::new(480)),
            freq_max_hz: Arc::new(AtomicUsize::new(7_600)),
            waveform_color_hex: Arc::new(Mutex::new("#c4a574".to_string())),
            waveform_line_width_px: Arc::new(AtomicUsize::new(2)),
            spectrum_window_counter: Arc::new(AtomicU64::new(0)),
            spectrum_overlay_by_label: Arc::new(Mutex::new(HashMap::new())),
            visual_settings_target: Arc::new(Mutex::new("main".to_string())),
        }
    }
}

const SPECTRUM_WINDOW_LABEL_PREFIX: &str = "spectrum-";

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
    let blur_enabled = state.overlay_blur_enabled.load(Ordering::SeqCst);
    for (label, win) in app.webview_windows() {
        if !label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
            continue;
        }
        let locked = label_passthrough_locked(&state, &label);
        if spectrum_is_overlay_mode(&state, &label) {
            #[cfg(target_os = "macos")]
            configure_overlay_window(win, pinned, blur_enabled, locked)?;
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
    thread::spawn(move || {
        const FFT_SIZE: usize = 2048;
        const SILENCE_RMS_GATE: f32 = 0.001;
        const SILENCE_PEAK_GATE: f32 = 0.003;
        let source_mode = capture_source_mode.load(Ordering::Relaxed);
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
            match source.read_frame(FFT_SIZE) {
                Ok(frame) => {
                    let mono = mono_from_interleaved(&frame.samples, frame.channels as usize);
                    let (peak, rms) = compute_peak_rms(&mono);
                    let bucket = bucket_count.load(Ordering::Relaxed);
                    let log_mode = bucket_mode.load(Ordering::Relaxed) == 0;
                    let tilt_percent = high_tilt_percent.load(Ordering::Relaxed);
                    let min_hz = freq_min_hz.load(Ordering::Relaxed);
                    let max_hz = freq_max_hz.load(Ordering::Relaxed);
                    let spectrum = if rms < SILENCE_RMS_GATE && peak < SILENCE_PEAK_GATE {
                        vec![0.0; bucket.clamp(8, 500)]
                    } else {
                        spectrum_bands_from_frame(
                            &mono,
                            frame.sample_rate,
                            bucket,
                            FFT_SIZE,
                            log_mode,
                            tilt_percent,
                            min_hz,
                            max_hz,
                        )
                    };
                    let mut waveform = WaveformFrame {
                        peak,
                        rms,
                        points: spectrum,
                    };
                    waveform.points = rebucket_points(&waveform.points, bucket);
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
fn set_capture_source_mode(state: State<'_, StreamState>, mode: String) -> Result<(), String> {
    let normalized = mode.trim().to_lowercase();
    let value = match normalized.as_str() {
        "blackhole" => 0_u8,
        "microphone" => 1_u8,
        _ => return Err("采集模式必须是 blackhole 或 microphone".to_string()),
    };
    state.capture_source_mode.store(value, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_capture_source_mode(state: State<'_, StreamState>) -> String {
    if state.capture_source_mode.load(Ordering::SeqCst) == 1 {
        "microphone".to_string()
    } else {
        "blackhole".to_string()
    }
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

/// 关闭「当前设置所针对」的频谱图形窗（`main` 或 `spectrum-*`），并隐藏设置窗。
/// 先隐藏设置：在 macOS 上设置窗挂为主窗子窗，若先关主窗会导致子窗一并销毁。
#[tauri::command]
fn close_settings_window(app: tauri::AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    let target = state
        .visual_settings_target
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "main".to_string());

    if let Some(settings) = app.get_webview_window("settings") {
        let _ = settings.hide();
    }

    if target == "main" {
        if let Some(w) = app.get_webview_window("main") {
            w.close().map_err(|e| e.to_string())?;
        }
    } else if target.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        if let Some(w) = app.get_webview_window(&target) {
            w.close().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
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
    pinned: bool,
    blur_enabled: bool,
    main_ignores_mouse_events: bool,
) -> tauri::Result<()> {
    window.set_always_on_top(pinned)?;
    window.set_shadow(false)?;
    apply_window_blur_effect(&window, blur_enabled)?;

    let overlay_window = window.clone();
    window.run_on_main_thread(move || unsafe {
        let ns_window: &NSWindow = &*overlay_window
            .ns_window()
            .expect("无法获取 macOS 窗口句柄")
            .cast();
        if pinned {
            ns_window.setLevel(NSScreenSaverWindowLevel);
        } else {
            ns_window.setLevel(0);
        }
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
        if pinned {
            ns_window.makeKeyAndOrderFront(None);
            ns_window.orderFrontRegardless();
        }
    })
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
    let blur_enabled = state.overlay_blur_enabled.load(Ordering::SeqCst);
    let ignore_mouse = label_passthrough_locked(&state, "main");
    configure_overlay_window(window, pinned, blur_enabled, ignore_mouse)
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
    Ok(())
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
        if matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        ) {
            reposition_spectrum_toolbar_if_locked(&h, &sl);
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

    #[cfg(target_os = "macos")]
    {
        if let Some(spec) = app.get_webview_window(spectrum_label) {
            let app_handle = app.clone();
            let sl = spectrum_label.to_string();
            let tbl = tb_label.clone();
            spec.run_on_main_thread(move || {
                let _ = position_floating_toolbar_near_parent(&app_handle, &sl, &tbl);
                if let Some(tb) = app_handle.get_webview_window(&tbl) {
                    let _ = tb.show();
                }
            })
            .map_err(|e| e.to_string())?;
        } else {
            position_floating_toolbar_near_parent(app, spectrum_label, &tb_label)
                .map_err(|e| e.to_string())?;
            if let Some(tb) = app.get_webview_window(&tb_label) {
                tb.show().map_err(|e| e.to_string())?;
            }
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        position_floating_toolbar_near_parent(app, spectrum_label, &tb_label)
            .map_err(|e| e.to_string())?;
        if let Some(tb) = app.get_webview_window(&tb_label) {
            tb.show().map_err(|e| e.to_string())?;
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
        if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
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
    sync_floating_toolbar_window(app).map_err(|e| e.to_string())?;
    Ok(())
}

fn wire_main_window_toolbar_follow(handle: tauri::AppHandle) {
    let Some(main) = handle.get_webview_window("main") else {
        return;
    };
    let h = handle.clone();
    main.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        ) {
            reposition_main_toolbar_if_passthrough_locked(&h);
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

/// 解析设置窗应挂接的父图形窗：优先 `main`，否则任一 `spectrum-*`；`preferred` 存在且仍打开时优先用它。
fn resolve_settings_parent_window(
    app: &tauri::AppHandle,
    preferred: Option<&str>,
) -> Result<(String, tauri::WebviewWindow), String> {
    if let Some(label) = preferred.map(str::trim).filter(|s| !s.is_empty()) {
        if label == "main" || label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
            if let Some(w) = app.get_webview_window(label) {
                return Ok((label.to_string(), w));
            }
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
    if let Some((_, w)) = spectrum
        .iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
    {
        let label = w.label().to_string();
        return Ok((label, w.clone()));
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
        if label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
            w.show()?;
        }
    }
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
    sync_floating_toolbar_window(&app).map_err(|e| e.to_string())?;

    if let Some(settings_window) = app.get_webview_window("settings") {
        settings_window
            .set_always_on_top(pinned)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_overlay_pinned(state: State<'_, StreamState>) -> bool {
    state.overlay_pinned.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_overlay_blur_enabled(
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    enabled: bool,
) -> Result<(), String> {
    state.overlay_blur_enabled.store(enabled, Ordering::SeqCst);
    #[cfg(target_os = "macos")]
    {
        refresh_main_overlay_window(&app).map_err(|e| e.to_string())?;
        refresh_spectrum_clone_windows(&app).map_err(|e| e.to_string())?;
        sync_floating_toolbar_window(&app).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_overlay_blur_enabled(state: State<'_, StreamState>) -> bool {
    state.overlay_blur_enabled.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_mouse_passthrough_locked(
    app: tauri::AppHandle,
    label: String,
    locked: bool,
) -> Result<(), String> {
    let label = label.trim().to_string();
    if label != "main" && !label.starts_with(SPECTRUM_WINDOW_LABEL_PREFIX) {
        return Err("仅主窗口与频谱窗口支持穿透锁定".to_string());
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
    let anchor_opt = anchor_key
        .as_ref()
        .and_then(|l| app.get_webview_window(l))
        .or_else(|| app.get_webview_window("main"));

    // 托盘「新建」或无任何锚点窗时：在当前工作区/主屏居中（与锚点相邻的逻辑见下分支）
    let use_center = anchor_opt.is_none();

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
    let blur_enabled = state.overlay_blur_enabled.load(Ordering::SeqCst);

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
    if use_center {
        win.center().map_err(|e| e.to_string())?;
    } else {
        win.set_position(Position::Physical(PhysicalPosition::new(px, py)))
            .map_err(|e| e.to_string())?;
    }

    if overlay_mode {
        #[cfg(target_os = "macos")]
        configure_overlay_window(win.clone(), pinned, blur_enabled, false)
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
    if !overlay_mode {
        let _ = win.set_focus();
    }
    Ok(())
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

    // 先激活父图形窗，确保当前 Space 一致，再挂接/显示设置窗。
    parent.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_parent_space(&parent, &settings).map_err(|e| e.to_string())?;

        settings
            .set_always_on_top(pinned)
            .map_err(|e| e.to_string())?;
        settings.show().map_err(|e| e.to_string())?;
        settings.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("WaveDance 设置")
    .inner_size(620.0, 760.0)
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .always_on_top(pinned)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    settings.show().map_err(|e| e.to_string())?;
    settings.set_focus().map_err(|e| e.to_string())?;
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
fn start_window_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
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

    const MIN_WIDTH: i32 = 640;
    const MIN_HEIGHT: i32 = 420;

    if width < MIN_WIDTH {
        width = MIN_WIDTH;
        if resize_west {
            x = right - width;
        }
    }
    if height < MIN_HEIGHT {
        height = MIN_HEIGHT;
        if resize_north {
            y = bottom - height;
        }
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
    tauri::Builder::default()
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
        .manage(StreamState::default())
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
                const TRAY_MENU_NEW_SPECTRUM: &str = "tray_new_spectrum";
                const TRAY_MENU_NEW_SPECTRUM_TRADITIONAL: &str = "tray_new_spectrum_traditional";
                const TRAY_MENU_QUIT: &str = "tray_quit";

                let Some(icon) = app.default_window_icon().cloned() else {
                    return Err("缺少 bundle 图标，无法创建菜单栏托盘".into());
                };
                let menu = MenuBuilder::new(app.handle())
                    .text(TRAY_MENU_SETTINGS, "设置…")
                    .text(TRAY_MENU_NEW_SPECTRUM, "新建浮层频谱窗口")
                    .text(TRAY_MENU_NEW_SPECTRUM_TRADITIONAL, "新建传统频谱窗口")
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
                        } else if event.id() == TRAY_MENU_NEW_SPECTRUM {
                            let _ = open_extra_spectrum_window_impl(app, None, true);
                        } else if event.id() == TRAY_MENU_NEW_SPECTRUM_TRADITIONAL {
                            let _ = open_extra_spectrum_window_impl(app, None, false);
                        } else if event.id() == TRAY_MENU_QUIT {
                            app.exit(0);
                        }
                    })
                    .build(app.handle())?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_waveform_stream,
            stop_waveform_stream,
            get_waveform_stream_running,
            set_capture_source_mode,
            get_capture_source_mode,
            update_bucket_count,
            get_bucket_count,
            update_bucket_mode,
            get_bucket_mode,
            update_high_tilt_percent,
            get_high_tilt_percent,
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
            close_settings_window,
            get_visual_settings_target,
            open_extra_spectrum_window,
            get_spectrum_window_overlay_mode,
            quit_app,
            start_window_dragging,
            resize_window_by_delta
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
