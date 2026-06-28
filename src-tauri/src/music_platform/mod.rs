mod cookie_store;
mod netease;
mod playlists;
mod qq;
mod qq_login;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub use qq_login::{QQ_MUSIC_LOGIN_LABEL, QqLoginCoordinator};

pub const MUSIC_PLATFORM_LOGIN_LABEL: &str = "music-platform-login";
pub const MUSIC_PLAYLIST_LABEL: &str = "music-playlist";

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlatformLoginStatus {
    pub logged_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playback_key_ready: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_unavailable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vip_type: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_vip: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlatformStatusResponse {
    pub netease: PlatformLoginStatus,
    pub qq: PlatformLoginStatus,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseLoginFinishedPayload {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}


#[tauri::command]
pub async fn music_platform_get_status(app: AppHandle) -> Result<MusicPlatformStatusResponse, String> {
    let netease = netease::netease_login_status(&app).await?;
    let qq = match cookie_store::read_qq(&app)? {
        Some(cookie) => qq::qq_login_status(&cookie).await,
        None => PlatformLoginStatus::default(),
    };
    Ok(MusicPlatformStatusResponse { netease, qq })
}

#[tauri::command]
pub async fn netease_qr_start() -> Result<netease::NeteaseQrStartResponse, String> {
    netease::netease_qr_start().await
}

#[tauri::command]
pub async fn netease_qr_poll(
    app: AppHandle,
    key: String,
) -> Result<netease::NeteaseQrPollResponse, String> {
    let result = netease::netease_qr_poll(&app, key.trim()).await?;
    if result.logged_in {
        let status = netease::netease_login_status(&app).await?;
        let _ = app.emit(
            "netease-login-finished",
            NeteaseLoginFinishedPayload {
                ok: true,
                nickname: status.nickname.clone(),
                avatar: status.avatar.clone(),
                error: None,
            },
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn netease_logout(app: AppHandle) -> Result<(), String> {
    netease::netease_logout(&app).await
}

#[tauri::command]
pub fn qq_login_open_webview(
    app: AppHandle,
    coordinator: tauri::State<'_, qq_login::SharedQqLoginCoordinator>,
) -> Result<(), String> {
    qq_login::open_qq_login_webview(&app, coordinator.inner())
}

#[tauri::command]
pub fn qq_login_close_webview(
    app: AppHandle,
    coordinator: tauri::State<'_, qq_login::SharedQqLoginCoordinator>,
) -> Result<(), String> {
    qq_login::close_qq_login_webview(&app, coordinator.inner())
}

#[tauri::command]
pub async fn qq_logout(app: AppHandle) -> Result<(), String> {
    cookie_store::clear_qq(&app)
}

#[tauri::command]
pub async fn music_playlist_get_context(app: AppHandle) -> Result<playlists::PlaylistViewContext, String> {
    playlists::playlist_view_context(&app).await
}

#[tauri::command]
pub async fn music_playlist_list(
    app: AppHandle,
    provider: String,
) -> Result<Vec<playlists::PlaylistItem>, String> {
    playlists::fetch_playlists(&app, provider.trim()).await
}

#[tauri::command]
pub async fn music_playlist_tracks(
    app: AppHandle,
    provider: String,
    playlist_id: String,
) -> Result<Vec<playlists::PlaylistTrackItem>, String> {
    playlists::fetch_tracks(&app, provider.trim(), playlist_id.trim()).await
}
