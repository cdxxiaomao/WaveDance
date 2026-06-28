use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::time::{sleep, Duration};
use url::Url;

use super::cookie_store::write_qq;
use super::qq::{
    cookies_from_webview, qq_build_cookie_header, qq_extract_music_key, qq_extract_playback_key,
    qq_extract_uin, qq_login_status,
};

pub const QQ_MUSIC_LOGIN_LABEL: &str = "qq-music-login";

const QQ_PROFILE_URL: &str = "https://y.qq.com/n/ryqq/profile";
const QQ_PLAYER_URL: &str = "https://y.qq.com/n/ryqq/player";
const POLL_INTERVAL_MS: u64 = 1200;
const LOGIN_TIMEOUT_SECS: u64 = 600;

#[derive(Default)]
pub struct QqLoginCoordinator {
    stop: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    finished: Arc<AtomicBool>,
    last_cookie: Arc<Mutex<Option<String>>>,
}

impl QqLoginCoordinator {
    pub fn request_stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    fn reset_stop(&self) {
        self.stop.store(false, Ordering::SeqCst);
        self.finished.store(false, Ordering::SeqCst);
        if let Ok(mut last) = self.last_cookie.lock() {
            *last = None;
        }
    }

    fn mark_finished(&self) -> bool {
        self.finished
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QqLoginFinishedPayload {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partial: Option<bool>,
    pub playback_key_ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

pub fn open_qq_login_webview(app: &AppHandle, coordinator: &QqLoginCoordinator) -> Result<(), String> {
    if app.get_webview_window(QQ_MUSIC_LOGIN_LABEL).is_some() {
        if let Some(win) = app.get_webview_window(QQ_MUSIC_LOGIN_LABEL) {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    if coordinator.running.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    coordinator.reset_stop();

    let url = Url::parse(QQ_PROFILE_URL).map_err(|e| e.to_string())?;
    let win = WebviewWindowBuilder::new(app, QQ_MUSIC_LOGIN_LABEL, WebviewUrl::External(url))
        .title("QQ 音乐登录")
        .inner_size(960.0, 720.0)
        .decorations(true)
        .resizable(true)
        .incognito(true)
        .center()
        .build()
        .map_err(|e| {
            coordinator.running.store(false, Ordering::SeqCst);
            e.to_string()
        })?;

    let app_poll = app.clone();
    let stop_flag = Arc::clone(&coordinator.stop);
    let running_flag = Arc::clone(&coordinator.running);
    let warmup_done = Arc::new(AtomicBool::new(false));
    let warmup_done_poll = Arc::clone(&warmup_done);
    let last_cookie_poll = Arc::clone(&coordinator.last_cookie);

    let app_destroy = app.clone();
    let stop_destroy = Arc::clone(&coordinator.stop);
    let running_destroy = Arc::clone(&coordinator.running);
    let last_cookie_destroy = Arc::clone(&coordinator.last_cookie);
    let coordinator_destroy = Arc::new(QqLoginCoordinator {
        stop: Arc::clone(&coordinator.stop),
        running: Arc::clone(&coordinator.running),
        finished: Arc::clone(&coordinator.finished),
        last_cookie: Arc::clone(&coordinator.last_cookie),
    });
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            stop_destroy.store(true, Ordering::SeqCst);
            let app = app_destroy.clone();
            let running = Arc::clone(&running_destroy);
            let coord = Arc::clone(&coordinator_destroy);
            let last_cookie = Arc::clone(&last_cookie_destroy);
            tauri::async_runtime::spawn(async move {
                if !coord.mark_finished() {
                    running.store(false, Ordering::SeqCst);
                    return;
                }
                let cookie_header = last_cookie
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .or_else(|| read_qq_cookies_from_window(&app));
                if let Some(cookie_header) = cookie_header {
                    let map = super::qq::qq_cookie_map_from_header(&cookie_header);
                    if qq_extract_uin(&map).is_some() && qq_extract_music_key(&map).is_some() {
                        let _ = write_qq(&app, &cookie_header);
                        let status = qq_login_status(&cookie_header).await;
                        let playback_ready = qq_extract_playback_key(&map).is_some();
                        let _ = app.emit(
                            "qq-login-finished",
                            QqLoginFinishedPayload {
                                ok: true,
                                partial: Some(!playback_ready),
                                playback_key_ready: playback_ready,
                                nickname: status.nickname,
                                avatar: status.avatar,
                                error: None,
                                reason: None,
                            },
                        );
                    }
                }
                running.store(false, Ordering::SeqCst);
            });
        }
    });

    let finished_flag = Arc::clone(&coordinator.finished);
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        loop {
            if stop_flag.load(Ordering::SeqCst) {
                break;
            }
            if started.elapsed().as_secs() >= LOGIN_TIMEOUT_SECS {
                let _ = app_poll.emit(
                    "qq-login-finished",
                    QqLoginFinishedPayload {
                        ok: false,
                        partial: None,
                        playback_key_ready: false,
                        nickname: None,
                        avatar: None,
                        error: Some("登录超时，请重试".into()),
                        reason: Some("timeout".into()),
                    },
                );
                if let Some(win) = app_poll.get_webview_window(QQ_MUSIC_LOGIN_LABEL) {
                    let _ = win.close();
                }
                break;
            }

            if let Some(cookie_header) = read_qq_cookies_from_window(&app_poll) {
                if let Ok(mut last) = last_cookie_poll.lock() {
                    *last = Some(cookie_header.clone());
                }
                let map = super::qq::qq_cookie_map_from_header(&cookie_header);
                let uin = qq_extract_uin(&map);
                let music_key = qq_extract_music_key(&map);
                let playback_key = qq_extract_playback_key(&map);

                if uin.is_some() && music_key.is_some() {
                    if playback_key.is_some() {
                        if finished_flag
                            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                            .is_err()
                        {
                            stop_flag.store(true, Ordering::SeqCst);
                            break;
                        }
                        let _ = write_qq(&app_poll, &cookie_header);
                        let status = qq_login_status(&cookie_header).await;
                        let _ = app_poll.emit(
                            "qq-login-finished",
                            QqLoginFinishedPayload {
                                ok: true,
                                partial: Some(false),
                                playback_key_ready: true,
                                nickname: status.nickname,
                                avatar: status.avatar,
                                error: None,
                                reason: None,
                            },
                        );
                        stop_flag.store(true, Ordering::SeqCst);
                        if let Some(win) = app_poll.get_webview_window(QQ_MUSIC_LOGIN_LABEL) {
                            let _ = win.close();
                        }
                        break;
                    }

                    if !warmup_done_poll.swap(true, Ordering::SeqCst) {
                        if let Some(win) = app_poll.get_webview_window(QQ_MUSIC_LOGIN_LABEL) {
                            if let Ok(player_url) = Url::parse(QQ_PLAYER_URL) {
                                let _ = win.navigate(player_url);
                            }
                        }
                    }
                }
            }

            sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        }
        running_flag.store(false, Ordering::SeqCst);
    });

    win.show().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn close_qq_login_webview(app: &AppHandle, coordinator: &QqLoginCoordinator) -> Result<(), String> {
    coordinator.request_stop();
    if let Some(win) = app.get_webview_window(QQ_MUSIC_LOGIN_LABEL) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn read_qq_cookies_from_window(app: &AppHandle) -> Option<String> {
    let win = app.get_webview_window(QQ_MUSIC_LOGIN_LABEL)?;
    let cookies = win.cookies().ok()?;
    let map = cookies_from_webview(&cookies);
    if map.is_empty() {
        return None;
    }
    Some(qq_build_cookie_header(&map))
}

pub type SharedQqLoginCoordinator = Arc<QqLoginCoordinator>;
