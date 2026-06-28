use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::Luma;
use ncm_api_rs::{create_client, Query};
use qrcode::QrCode;
use serde::Serialize;

use super::cookie_store::{
    merge_set_cookie_strings, netease_cookie_has_login, read_netease, write_netease,
};
use super::PlatformLoginStatus;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseQrStartResponse {
    pub key: String,
    pub qr_img_base64: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseQrPollResponse {
    pub code: i64,
    pub message: String,
    pub logged_in: bool,
}

pub async fn netease_qr_start() -> Result<NeteaseQrStartResponse, String> {
    let client = create_client(None);
    let key_resp = client
        .login_qr_key(&Query::new())
        .await
        .map_err(|e| e.to_string())?;
    let unikey = key_resp.body["unikey"]
        .as_str()
        .ok_or_else(|| "未获取到 QR unikey".to_string())?
        .to_string();

    let create_resp = client
        .login_qr_create(&Query::new().param("key", &unikey))
        .await
        .map_err(|e| e.to_string())?;
    let qr_url = create_resp.body["data"]["qrurl"]
        .as_str()
        .ok_or_else(|| "未获取到 QR URL".to_string())?
        .to_string();

    let qr_img_base64 = render_qr_base64(&qr_url)?;

    Ok(NeteaseQrStartResponse {
        key: unikey,
        qr_img_base64,
        url: qr_url,
    })
}

fn render_qr_base64(url: &str) -> Result<String, String> {
    let code = QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let image = code
        .render::<Luma<u8>>()
        .quiet_zone(true)
        .min_dimensions(200, 200)
        .build();

    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    image::DynamicImage::ImageLuma8(image)
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(STANDARD.encode(buffer))
}

pub async fn netease_qr_poll(app: &tauri::AppHandle, key: &str) -> Result<NeteaseQrPollResponse, String> {
    let client = create_client(None);
    let mut resp = client
        .login_qr_check(&Query::new().param("key", key))
        .await
        .map_err(|e| e.to_string())?;

    let mut code = resp.body["code"].as_i64().unwrap_or(-1);
    let mut message = resp
        .body
        .get("message")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();

    if code == 803 && resp.cookie.is_empty() {
        resp = client
            .login_qr_check(&Query::new().param("key", key))
            .await
            .map_err(|e| e.to_string())?;
        code = resp.body["code"].as_i64().unwrap_or(code);
        message = resp
            .body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();
    }

    if code == 803 {
        let cookie_map = merge_set_cookie_strings(&resp.cookie);
        let cookie = cookie_map
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("; ");
        if netease_cookie_has_login(&cookie) {
            write_netease(app, &cookie)?;
            return Ok(NeteaseQrPollResponse {
                code,
                message: "登录成功".into(),
                logged_in: true,
            });
        }
        return Err("登录成功但未获取到 MUSIC_U Cookie".into());
    }

    let msg = match code {
        801 => "等待扫码",
        802 => "已扫码，请在手机上确认",
        800 => "二维码已过期",
        _ => message.as_str(),
    };

    Ok(NeteaseQrPollResponse {
        code,
        message: msg.to_string(),
        logged_in: false,
    })
}

pub async fn netease_login_status(app: &tauri::AppHandle) -> Result<PlatformLoginStatus, String> {
    let Some(cookie) = read_netease(app)? else {
        return Ok(PlatformLoginStatus::default());
    };

    if !netease_cookie_has_login(&cookie) {
        return Ok(PlatformLoginStatus::default());
    }

    let client = create_client(Some(cookie.clone()));
    let query = Query::new().cookie(&cookie);

    let profile = match client.login_status(&query).await {
        Ok(resp) => resp.body,
        Err(_) => client
            .user_account(&query)
            .await
            .map_err(|e| e.to_string())?
            .body,
    };

    let account = profile.get("account").or_else(|| profile.get("profile"));
    let user_id = account
        .and_then(|a| a.get("id"))
        .and_then(|v| v.as_i64())
        .map(|id| id.to_string());
    let nickname = account
        .and_then(|a| a.get("nickname"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let avatar = account
        .and_then(|a| a.get("avatarUrl"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let vip_type = account
        .and_then(|a| a.get("vipType"))
        .and_then(|v| v.as_i64());
    let is_vip = vip_type.is_some_and(|v| v > 0);

    Ok(PlatformLoginStatus {
        logged_in: true,
        user_id,
        nickname,
        avatar,
        playback_key_ready: None,
        profile_unavailable: None,
        vip_type,
        is_vip: Some(is_vip),
    })
}

pub async fn netease_logout(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(cookie) = read_netease(app)? {
        let client = create_client(Some(cookie.clone()));
        let _ = client
            .logout(&Query::new().cookie(&cookie))
            .await;
    }
    super::cookie_store::clear_netease(app)
}
