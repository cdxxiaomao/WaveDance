#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{
    atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering},
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
    ActivationPolicy, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use wavedance::audio_capture::{AudioSource, MacSystemAudioSource};
use wavedance::audio_processing::WaveformFrame;

struct StreamState {
    running: Arc<AtomicBool>,
    overlay_pinned: Arc<AtomicBool>,
    overlay_blur_enabled: Arc<AtomicBool>,
    bucket_count: Arc<AtomicUsize>,
    bucket_mode: Arc<AtomicU8>,
    high_tilt_percent: Arc<AtomicUsize>,
    freq_min_hz: Arc<AtomicUsize>,
    freq_max_hz: Arc<AtomicUsize>,
    waveform_color_hex: Arc<Mutex<String>>,
    /// 波形线宽（逻辑像素），由前端用多条竖直偏移的 LINE_STRIP 模拟；WebGL 的 lineWidth 在浏览器中常无效。
    waveform_line_width_px: Arc<AtomicUsize>,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            overlay_pinned: Arc::new(AtomicBool::new(true)),
            overlay_blur_enabled: Arc::new(AtomicBool::new(false)),
            bucket_count: Arc::new(AtomicUsize::new(256)),
            bucket_mode: Arc::new(AtomicU8::new(1)),
            high_tilt_percent: Arc::new(AtomicUsize::new(35)),
            freq_min_hz: Arc::new(AtomicUsize::new(480)),
            freq_max_hz: Arc::new(AtomicUsize::new(7_600)),
            waveform_color_hex: Arc::new(Mutex::new("#c4a574".to_string())),
            waveform_line_width_px: Arc::new(AtomicUsize::new(2)),
        }
    }
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
    let target = bucket_count.clamp(8, 256);
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
    let target = bucket_count.clamp(8, 256);
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
    let bucket_count = Arc::clone(&state.bucket_count);
    let bucket_mode = Arc::clone(&state.bucket_mode);
    let high_tilt_percent = Arc::clone(&state.high_tilt_percent);
    let freq_min_hz = Arc::clone(&state.freq_min_hz);
    let freq_max_hz = Arc::clone(&state.freq_max_hz);
    thread::spawn(move || {
        const FFT_SIZE: usize = 2048;
        let mut source = MacSystemAudioSource::new(Some("BlackHole".to_string()));

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
                    let spectrum = spectrum_bands_from_frame(
                        &mono,
                        frame.sample_rate,
                        bucket,
                        FFT_SIZE,
                        log_mode,
                        tilt_percent,
                        min_hz,
                        max_hz,
                    );
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
fn stop_waveform_stream(state: State<'_, StreamState>) {
    state.running.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn get_waveform_stream_running(state: State<'_, StreamState>) -> bool {
    state.running.load(Ordering::SeqCst)
}

#[tauri::command]
fn update_bucket_count(state: State<'_, StreamState>, bucket_count: usize) -> Result<(), String> {
    if !(8..=256).contains(&bucket_count) {
        return Err("桶数量必须在 8 到 256 之间".to_string());
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
    app: tauri::AppHandle,
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
    let _ = app.emit("waveform-line-color", normalized);
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
    app: tauri::AppHandle,
    state: State<'_, StreamState>,
    width_px: usize,
) -> Result<(), String> {
    let w = width_px.clamp(1, 12);
    state
        .waveform_line_width_px
        .store(w, Ordering::SeqCst);
    let _ = app.emit("waveform-line-width", w);
    Ok(())
}

#[tauri::command]
fn get_waveform_line_width(state: State<'_, StreamState>) -> usize {
    state
        .waveform_line_width_px
        .load(Ordering::Relaxed)
}

#[cfg(target_os = "macos")]
fn configure_overlay_window(
    window: tauri::WebviewWindow,
    pinned: bool,
    blur_enabled: bool,
) -> tauri::Result<()> {
    const OVERLAY_EFFECT: Effect = Effect::HudWindow;
    const OVERLAY_BLUR_RADIUS: f64 = 14.0;
    window.set_always_on_top(pinned)?;
    window.set_shadow(false)?;
    // 先清理旧效果，再按当前开关重建，避免频繁切换时出现偶发状态残留。
    let _ = window.set_effects(None);
    let _ = clear_vibrancy(&window);
    if blur_enabled {
        window.set_effects(
            EffectsBuilder::new()
                .effect(OVERLAY_EFFECT)
                .state(EffectState::Active)
                .radius(OVERLAY_BLUR_RADIUS)
                .build(),
        )?;
    }

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
        ns_window.setIgnoresMouseEvents(false);
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

/// 将设置窗口挂到主窗口子窗口链上，使其随主窗口出现在同一 Space（解决多桌面残留问题）。
#[cfg(target_os = "macos")]
fn attach_settings_window_to_main_space(
    main_window: &tauri::WebviewWindow,
    settings_window: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    let main_clone = main_window.clone();
    let settings_clone = settings_window.clone();
    main_window.run_on_main_thread(move || unsafe {
        let main_ns = main_clone
            .ns_window()
            .expect("无法获取主窗口 NSWindow 句柄")
            .cast::<NSWindow>();
        let settings_ns = settings_clone
            .ns_window()
            .expect("无法获取设置窗口 NSWindow 句柄")
            .cast::<NSWindow>();
        let main_ref: &NSWindow = &*main_ns;
        let settings_ref: &NSWindow = &*settings_ns;

        if let Some(old_parent) = settings_ref.parentWindow() {
            old_parent.removeChildWindow(settings_ref);
        }
        main_ref.addChildWindow_ordered(settings_ref, NSWindowOrderingMode::Above);
    })
}

fn recall_overlay_window(app: &tauri::AppHandle, pinned: bool) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
        #[cfg(target_os = "macos")]
        {
            let blur_enabled = app
                .state::<StreamState>()
                .overlay_blur_enabled
                .load(Ordering::SeqCst);
            configure_overlay_window(window, pinned, blur_enabled)?;
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
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            let blur_enabled = state.overlay_blur_enabled.load(Ordering::SeqCst);
            configure_overlay_window(window, pinned, blur_enabled).map_err(|e| e.to_string())?;
        }
        #[cfg(not(target_os = "macos"))]
        window
            .set_always_on_top(pinned)
            .map_err(|e| e.to_string())?;
    }

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
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            let pinned = state.overlay_pinned.load(Ordering::SeqCst);
            configure_overlay_window(window, pinned, enabled).map_err(|e| e.to_string())?;
        }
    }
    state.overlay_blur_enabled.store(enabled, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_overlay_blur_enabled(state: State<'_, StreamState>) -> bool {
    state.overlay_blur_enabled.load(Ordering::SeqCst)
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let pinned = app
        .state::<StreamState>()
        .overlay_pinned
        .load(Ordering::SeqCst);

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())?;

    // 先激活主窗口，确保当前 Space 与主窗口一致，再挂接/显示设置窗。
    main.set_focus().map_err(|e| e.to_string())?;

    if let Some(settings) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        attach_settings_window_to_main_space(&main, &settings).map_err(|e| e.to_string())?;

        settings
            .set_always_on_top(pinned)
            .map_err(|e| e.to_string())?;
        settings.show().map_err(|e| e.to_string())?;
        settings.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let settings = WebviewWindowBuilder::new(
        &app,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("WaveDance 设置")
    .inner_size(620.0, 760.0)
    .parent(&main)
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
fn start_window_dragging(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_window_by_delta(
    app: tauri::AppHandle,
    direction: String,
    delta_x: i32,
    delta_y: i32,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
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
    }
    Ok(())
}

fn main() {
    let recall_shortcut = Shortcut::new(
        Some(Modifiers::SUPER | Modifiers::SHIFT | Modifiers::ALT),
        Code::KeyW,
    );
    let recall_shortcut_for_handler = recall_shortcut.clone();
    let recall_shortcut_for_setup = recall_shortcut.clone();
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &recall_shortcut_for_handler
                        && event.state() == ShortcutState::Pressed
                    {
                        let pinned = app
                            .state::<StreamState>()
                            .overlay_pinned
                            .load(Ordering::SeqCst);
                        let _ = recall_overlay_window(app, pinned);
                    }
                })
                .build(),
        )
        .manage(StreamState::default())
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(ActivationPolicy::Accessory);
                if let Some(window) = app.get_webview_window("main") {
                    let state = app.state::<StreamState>();
                    let pinned = state.overlay_pinned.load(Ordering::SeqCst);
                    let blur_enabled = state.overlay_blur_enabled.load(Ordering::SeqCst);
                    configure_overlay_window(window, pinned, blur_enabled)?;
                }
            }
            app.global_shortcut().register(recall_shortcut_for_setup)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_waveform_stream,
            stop_waveform_stream,
            get_waveform_stream_running,
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
            set_overlay_pinned,
            get_overlay_pinned,
            set_overlay_blur_enabled,
            get_overlay_blur_enabled,
            open_settings_window,
            start_window_dragging,
            resize_window_by_delta
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
