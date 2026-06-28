use ncm_api_rs::{create_client, Query};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, REFERER, USER_AGENT};
use serde::Serialize;
use serde_json::json;

use super::cookie_store::{read_netease, read_qq};
use super::netease;
use super::qq::{
    parse_json_text, qq_cookie_map_from_header, qq_extract_music_key, qq_extract_playback_key,
    qq_extract_uin, qq_http_client, QQ_USER_AGENT,
};
use tauri::AppHandle;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongUrlResponse {
    pub provider: String,
    pub url: String,
    pub playable: bool,
    pub trial: bool,
    pub level: String,
    pub quality: String,
    /// 供播放代理设置 Content-Type（如 audio/flac、audio/mpeg）
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub br: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restriction: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

fn mime_for_qq_level(level_key: &str) -> &'static str {
    match level_key {
        "hires" | "lossless" => "audio/flac",
        "aac" => "audio/mp4",
        _ => "audio/mpeg",
    }
}

fn mime_from_netease_item(level_key: &str, url: &str, item: &serde_json::Value) -> String {
    if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
        let lower = t.to_ascii_lowercase();
        if lower.contains("flac") {
            return "audio/flac".into();
        }
        if lower.contains("mp3") {
            return "audio/mpeg".into();
        }
        if lower.contains("m4a") || lower.contains("aac") {
            return "audio/mp4".into();
        }
    }
    if url.to_ascii_lowercase().contains(".flac")
        || matches!(level_key, "jymaster" | "hires" | "lossless")
    {
        return "audio/flac".into();
    }
    if url.to_ascii_lowercase().contains(".m4a") {
        return "audio/mp4".into();
    }
    "audio/mpeg".into()
}

fn build_netease_response(
    level_key: &str,
    label: &str,
    url: &str,
    trial: bool,
    br: Option<i64>,
    item: &serde_json::Value,
) -> SongUrlResponse {
    SongUrlResponse {
        provider: "netease".into(),
        url: url.to_string(),
        playable: !trial,
        trial,
        level: level_key.to_string(),
        quality: label.to_string(),
        mime_type: mime_from_netease_item(level_key, url, item),
        br,
        restriction: None,
        reason: None,
    }
}

const NETEASE_LEVELS: &[(&str, &str, i64, &str)] = &[
    ("jymaster", "jymaster", 1_999_000, "超清母带"),
    ("hires", "hires", 1_999_000, "高清臻音"),
    ("lossless", "lossless", 1_411_000, "无损"),
    ("exhigh", "exhigh", 999_000, "极高"),
    ("standard", "standard", 128_000, "标准"),
];

const QQ_LEVELS: &[(&str, &str, &str, &str)] = &[
    ("hires", "RS01", ".flac", "Hi-Res"),
    ("lossless", "F000", ".flac", "无损"),
    ("exhigh", "M800", ".mp3", "320k"),
    ("standard", "M500", ".mp3", "128k"),
    ("aac", "C400", ".m4a", "AAC"),
];

fn netease_quality_candidates(requested: &str, is_svip: bool) -> Vec<(&'static str, &'static str, i64, &'static str)> {
    let start = NETEASE_LEVELS
        .iter()
        .position(|(k, _, _, _)| *k == requested)
        .unwrap_or(3);
    NETEASE_LEVELS
        .iter()
        .skip(start)
        .filter(|(k, _, _, _)| is_svip || *k != "jymaster")
        .map(|&(k, l, b, q)| (k, l, b, q))
        .collect()
}

pub async fn fetch_song_url(
    app: &AppHandle,
    provider: &str,
    id: &str,
    media_mid: Option<&str>,
    quality: &str,
) -> Result<SongUrlResponse, String> {
    match provider {
        "netease" => fetch_netease_url(app, id, quality).await,
        "qq" => fetch_qq_url(app, id, media_mid, quality).await,
        other => Err(format!("未知平台: {other}")),
    }
}

async fn fetch_netease_url(app: &AppHandle, id: &str, quality: &str) -> Result<SongUrlResponse, String> {
    let cookie = read_netease(app)?.ok_or_else(|| "请先登录网易云音乐".to_string())?;
    let status = netease::netease_login_status(app).await?;
    let is_svip = status.is_vip.unwrap_or(false) && status.vip_type.unwrap_or(0) >= 11;
    let candidates = netease_quality_candidates(quality, is_svip);
    let client = create_client(Some(cookie.clone()));

    for (level_key, level, br, label) in candidates {
        if let Ok(resp) = client
            .song_url_v1(
                &Query::new()
                    .cookie(&cookie)
                    .param("id", id)
                    .param("level", level),
            )
            .await
        {
            if let Some(item) = resp.body["data"].as_array().and_then(|a| a.first()) {
                let url = item["url"].as_str().unwrap_or("").trim();
                let trial = item.get("freeTrialInfo").is_some_and(|v| !v.is_null());
                if !url.is_empty() {
                    return Ok(build_netease_response(
                        level_key,
                        label,
                        url,
                        trial,
                        item["br"].as_i64().or(Some(br)),
                        item,
                    ));
                }
            }
        }

        if let Ok(resp) = client
            .song_url(
                &Query::new()
                    .cookie(&cookie)
                    .param("id", id)
                    .param("br", &br.to_string()),
            )
            .await
        {
            if let Some(item) = resp.body["data"].as_array().and_then(|a| a.first()) {
                let url = item["url"].as_str().unwrap_or("").trim();
                let trial = item.get("freeTrialInfo").is_some_and(|v| !v.is_null());
                if !url.is_empty() {
                    return Ok(build_netease_response(
                        level_key,
                        label,
                        url,
                        trial,
                        item["br"].as_i64().or(Some(br)),
                        item,
                    ));
                }
            }
        }
    }

    Err("无法获取网易云音源，可能是版权限制或未登录".into())
}

async fn fetch_qq_url(
    app: &AppHandle,
    songmid: &str,
    media_mid: Option<&str>,
    quality: &str,
) -> Result<SongUrlResponse, String> {
    let cookie = read_qq(app)?.ok_or_else(|| "请先登录 QQ 音乐".to_string())?;
    let map = qq_cookie_map_from_header(&cookie);
    let uin = qq_extract_uin(&map).ok_or_else(|| "QQ Cookie 无效".to_string())?;
    let music_key = qq_extract_music_key(&map).ok_or_else(|| "QQ 登录态无效".to_string())?;
    let playback_ready = qq_extract_playback_key(&map).is_some();

    let mid_for_file = media_mid.filter(|s| !s.is_empty()).unwrap_or(songmid);
    let start = QQ_LEVELS
        .iter()
        .position(|(k, _, _, _)| *k == quality)
        .unwrap_or(2);
    let levels: Vec<_> = QQ_LEVELS.iter().skip(start).collect();

    let mut tried = Vec::new();
    for (level_key, prefix, ext, label) in levels {
        let filename = format!("{prefix}{mid_for_file}{ext}");
        tried.push(filename.clone());
        match qq_get_vkey(&uin, &music_key, songmid, &filename, &cookie).await {
            Ok(url) => {
                return Ok(SongUrlResponse {
                    provider: "qq".into(),
                    url,
                    playable: true,
                    trial: false,
                    level: (*level_key).to_string(),
                    quality: (*label).to_string(),
                    mime_type: mime_for_qq_level(level_key).to_string(),
                    br: None,
                    restriction: None,
                    reason: None,
                });
            }
            Err(err) if err.contains("104003") && !playback_ready => {
                return Err("QQ 播放授权不完整，请重新登录并等待播放器页授权".into());
            }
            Err(_) => continue,
        }
    }

    let _ = tried;
    Err("无法获取 QQ 音乐音源，可能是版权限制或需要会员".into())
}

async fn qq_get_vkey(
    uin: &str,
    music_key: &str,
    songmid: &str,
    filename: &str,
    cookie_text: &str,
) -> Result<String, String> {
    let guid = format!("{:08}", simple_hash(uin) % 100_000_000);
    let body = json!({
        "comm": {
            "uin": uin,
            "format": "json",
            "ct": 19,
            "cv": 0,
            "authst": music_key
        },
        "req_0": {
            "module": "vkey.GetVkeyServer",
            "method": "CgiGetVkey",
            "param": {
                "guid": guid,
                "songmid": [songmid],
                "songtype": [0],
                "uin": uin,
                "loginflag": 1,
                "platform": "20",
                "filename": [filename]
            }
        }
    });

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(QQ_USER_AGENT));
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://y.qq.com/n/ryqq/player"),
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json;charset=UTF-8"),
    );
    headers.insert(
        COOKIE,
        HeaderValue::from_str(cookie_text).map_err(|e| e.to_string())?,
    );

    let client = qq_http_client()?;
    let text = client
        .post("https://u.y.qq.com/cgi-bin/musicu.fcg")
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let parsed = parse_json_text(&text)?;
    let code = parsed["req_0"]["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return Err(format!("QQ vkey 错误 ({code})"));
    }

    let data = &parsed["req_0"]["data"];
    let sip = data["sip"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("https://ws.stream.qqmusic.qq.com/");
    let midurlinfo = data["midurlinfo"].as_array().cloned().unwrap_or_default();
    for item in midurlinfo {
        let purl = item["purl"].as_str().unwrap_or("").trim();
        if !purl.is_empty() {
            return Ok(format!("{sip}{purl}"));
        }
        let qq_code = item["code"].as_i64().unwrap_or(0);
        if qq_code == 104003 {
            return Err("QQ vkey 104003".into());
        }
    }

    Err("QQ vkey 无可用链接".into())
}

fn simple_hash(s: &str) -> u64 {
    s.bytes().fold(5381_u64, |acc, b| acc.wrapping_mul(33).wrapping_add(u64::from(b)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn netease_candidates_skip_jymaster_for_non_svip() {
        let c = netease_quality_candidates("hires", false);
        assert!(!c.iter().any(|(k, _, _, _)| *k == "jymaster"));
        assert_eq!(c.first().map(|(k, _, _, _)| *k), Some("hires"));
    }
}
