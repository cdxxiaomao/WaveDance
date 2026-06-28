use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, COOKIE, REFERER, USER_AGENT};
use serde_json::Value;

use super::cookie_store::{build_cookie_header, parse_cookie_header};
use super::PlatformLoginStatus;

pub(crate) const QQ_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const QQ_HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const QQ_HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) fn qq_http_client() -> Result<reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    Ok(CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .timeout(QQ_HTTP_TIMEOUT)
                .connect_timeout(QQ_HTTP_CONNECT_TIMEOUT)
                .build()
                .expect("创建 QQ HTTP 客户端失败")
        })
        .clone())
}

const QQ_COOKIE_KEY_ORDER: &[&str] = &[
    "uin",
    "qqmusic_uin",
    "wxuin",
    "login_type",
    "qm_keyst",
    "qqmusic_key",
    "music_key",
    "p_skey",
    "skey",
    "psrf_qqaccess_token",
    "psrf_qqrefresh_token",
    "wxrefresh_token",
    "wxskey",
    "p_uin",
    "ptcz",
    "RK",
];

pub fn qq_extract_uin(map: &HashMap<String, String>) -> Option<String> {
    let login_type = map.get("login_type").and_then(|v| v.parse::<i32>().ok());
    let raw = if login_type == Some(2) {
        map.get("wxuin")
            .or_else(|| map.get("uin"))
            .or_else(|| map.get("p_uin"))
    } else {
        map.get("uin")
            .or_else(|| map.get("qqmusic_uin"))
            .or_else(|| map.get("wxuin"))
            .or_else(|| map.get("p_uin"))
    }?;
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    let trimmed = digits.trim_start_matches('0');
    if trimmed.is_empty() && !digits.is_empty() {
        Some(digits)
    } else if trimmed.is_empty() {
        Some(raw.clone())
    } else {
        Some(trimmed.to_string())
    }
}

pub fn qq_extract_music_key(map: &HashMap<String, String>) -> Option<String> {
    [
        "qm_keyst",
        "qqmusic_key",
        "music_key",
        "p_skey",
        "skey",
        "psrf_qqaccess_token",
        "psrf_qqrefresh_token",
        "wxrefresh_token",
        "wxskey",
    ]
    .iter()
    .find_map(|k| map.get(*k).filter(|v| !v.is_empty()).cloned())
}

pub fn qq_extract_playback_key(map: &HashMap<String, String>) -> Option<String> {
    ["qm_keyst", "qqmusic_key", "music_key", "wxskey"]
        .iter()
        .find_map(|k| map.get(*k).filter(|v| !v.is_empty()).cloned())
}

pub fn qq_cookie_map_from_header(cookie_text: &str) -> HashMap<String, String> {
    parse_cookie_header(cookie_text)
}

pub fn qq_build_cookie_header(map: &HashMap<String, String>) -> String {
    build_cookie_header(map, QQ_COOKIE_KEY_ORDER)
}

pub fn qq_nickname_from_cookie(map: &HashMap<String, String>, uin: &str) -> Option<String> {
    let key = format!("ptnick_{uin}");
    map.get(&key).or_else(|| map.get("ptnick")).cloned()
}

pub fn qq_avatar_from_uin(uin: &str) -> String {
    format!("https://q1.qlogo.cn/g?b=qq&nk={uin}&s=100")
}

pub fn qq_g_tk(map: &HashMap<String, String>) -> u64 {
    let skey = map
        .get("p_skey")
        .or_else(|| map.get("skey"))
        .or_else(|| map.get("qqmusic_key"))
        .or_else(|| map.get("qm_keyst"))
        .map(|s| s.as_str())
        .unwrap_or("");
    let mut hash: i64 = 5381;
    for ch in skey.chars() {
        hash = hash.wrapping_add((hash << 5).wrapping_add(i64::from(ch as u32)));
    }
    (hash & 0x7fff_ffff) as u64
}

fn looks_like_binary(text: &str) -> bool {
    let sample: Vec<char> = text.chars().take(512).collect();
    if sample.is_empty() {
        return false;
    }
    let suspicious = sample
        .iter()
        .filter(|c| {
            **c == '\0'
                || ((**c as u32) < 32 && **c != '\n' && **c != '\r' && **c != '\t')
        })
        .count();
    suspicious * 4 > sample.len()
}

pub fn parse_json_text(text: &str) -> Result<Value, String> {
    let raw = text.trim();
    if raw.is_empty() {
        return Err("QQ 接口返回空响应".into());
    }
    if raw.starts_with('{') || raw.starts_with('[') {
        return serde_json::from_str(raw).map_err(|e| format!("JSON 解析失败: {e}"));
    }
    if let Some(start) = raw.find('(') {
        if let Some(end) = raw.rfind(')') {
            if end > start {
                let inner = raw[start + 1..end].trim();
                if inner.starts_with('{') || inner.starts_with('[') {
                    return serde_json::from_str(inner).map_err(|e| format!("JSONP 解析失败: {e}"));
                }
            }
        }
    }
    if looks_like_binary(raw) {
        return Err("QQ 接口返回非文本数据，可能是网络异常或响应未正确解压".into());
    }
    serde_json::from_str(raw).map_err(|e| {
        let preview: String = raw.chars().take(80).collect();
        format!("响应解析失败: {e}（内容前缀: {preview}）")
    })
}

pub fn qq_cookie_header(cookie_text: &str) -> String {
    let map = qq_cookie_map_from_header(cookie_text);
    qq_build_cookie_header(&map)
}

pub async fn qq_get_fcg(
    base_url: &str,
    extra_params: &[(&str, String)],
    cookie_text: &str,
    referer: &str,
) -> Result<Value, String> {
    let map = qq_cookie_map_from_header(cookie_text);
    let uin = qq_extract_uin(&map).ok_or_else(|| "QQ Cookie 无效".to_string())?;
    let g_tk = qq_g_tk(&map);
    let cookie = qq_build_cookie_header(&map);

    let mut params: Vec<(String, String)> = vec![
        ("loginUin".into(), uin.clone()),
        ("hostUin".into(), uin),
        ("format".into(), "json".into()),
        ("inCharset".into(), "utf8".into()),
        ("outCharset".into(), "utf-8".into()),
        ("notice".into(), "0".into()),
        ("platform".into(), "yqq.json".into()),
        ("needNewCode".into(), "0".into()),
        ("g_tk".into(), g_tk.to_string()),
        ("g_tk_new_20200303".into(), g_tk.to_string()),
    ];
    for (k, v) in extra_params {
        params.push(((*k).to_string(), v.clone()));
    }

    let query = params
        .iter()
        .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let url = format!("{base_url}?{query}");

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(QQ_USER_AGENT));
    headers.insert(
        REFERER,
        HeaderValue::from_str(referer).map_err(|e| e.to_string())?,
    );
    headers.insert(
        COOKIE,
        HeaderValue::from_str(&cookie).map_err(|e| format!("Cookie 头无效: {e}"))?,
    );

    let client = qq_http_client()?;
    let response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "QQ 接口请求超时，请检查网络后重试".to_string()
            } else {
                e.to_string()
            }
        })?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let preview: String = text.chars().take(80).collect();
        return Err(format!("QQ 接口 HTTP {}: {preview}", status.as_u16()));
    }
    parse_json_text(&text)
}

pub async fn qq_login_status(cookie_text: &str) -> PlatformLoginStatus {
    let map = qq_cookie_map_from_header(cookie_text);
    let uin = qq_extract_uin(&map);
    let music_key = qq_extract_music_key(&map);
    let playback_key = qq_extract_playback_key(&map);

    let logged_in = uin.is_some() && music_key.is_some();
    let playback_key_ready = playback_key.is_some();

    if !logged_in {
        return PlatformLoginStatus {
            logged_in: false,
            user_id: None,
            nickname: None,
            avatar: None,
            playback_key_ready: Some(false),
            profile_unavailable: None,
            vip_type: None,
            is_vip: None,
        };
    }

    let uin = uin.unwrap();
    let mut nickname = qq_nickname_from_cookie(&map, &uin);
    let mut avatar = Some(qq_avatar_from_uin(&uin));
    let mut profile_unavailable = false;

    if let Ok(profile) = fetch_qq_profile(&uin, cookie_text).await {
        if profile.code == 1000 {
            profile_unavailable = true;
        } else if let Some(name) = profile.nickname {
            nickname = Some(name);
        }
        if let Some(url) = profile.avatar {
            avatar = Some(url);
        }
    } else {
        profile_unavailable = true;
    }

    PlatformLoginStatus {
        logged_in: true,
        user_id: Some(uin),
        nickname,
        avatar,
        playback_key_ready: Some(playback_key_ready),
        profile_unavailable: Some(profile_unavailable),
        vip_type: None,
        is_vip: None,
    }
}

struct QqProfileResult {
    code: i64,
    nickname: Option<String>,
    avatar: Option<String>,
}

async fn fetch_qq_profile(uin: &str, cookie_text: &str) -> Result<QqProfileResult, String> {
    let url = format!(
        "https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?cid=205360838&userid={uin}&loginUin={uin}&format=json&platform=yqq.json"
    );

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(QQ_USER_AGENT));
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://y.qq.com/portal/profile.html"),
    );
    headers.insert(
        COOKIE,
        HeaderValue::from_str(cookie_text).map_err(|e| e.to_string())?,
    );

    let client = qq_http_client()?;
    let text = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "QQ 资料接口请求超时".to_string()
            } else {
                e.to_string()
            }
        })?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let body = parse_json_text(&text)?;
    let code = body
        .get("code")
        .and_then(|c| c.as_i64())
        .unwrap_or(-1);

    let data = &body["data"];
    let nickname = data
        .get("creator")
        .and_then(|c| c.get("nick"))
        .and_then(|v| v.as_str())
        .or_else(|| data.get("nick").and_then(|v| v.as_str()))
        .map(str::to_string);

    let avatar = data
        .get("creator")
        .and_then(|c| c.get("headurl"))
        .and_then(|v| v.as_str())
        .or_else(|| data.get("headurl").and_then(|v| v.as_str()))
        .map(str::to_string);

    Ok(QqProfileResult {
        code,
        nickname,
        avatar,
    })
}

pub fn cookies_from_webview(cookies: &[tauri::webview::Cookie<'_>]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for cookie in cookies {
        let domain = cookie.domain().unwrap_or("");
        if !is_qq_domain(domain) {
            continue;
        }
        map.insert(cookie.name().to_string(), cookie.value().to_string());
    }
    map
}

pub fn is_qq_domain(domain: &str) -> bool {
    let d = domain.trim_start_matches('.');
    d == "qq.com" || d.ends_with(".qq.com") || d.contains("qqmusic")
}

#[cfg(test)]
mod tests {
    use super::parse_json_text;

    #[test]
    fn parse_jsonp_callback() {
        let body = parse_json_text(r#"jsonCallback({"code":0,"data":{}})"#).unwrap();
        assert_eq!(body["code"], 0);
    }

    #[test]
    fn parse_pure_json() {
        let body = parse_json_text(r#"{"code":0}"#).unwrap();
        assert_eq!(body["code"], 0);
    }

    #[test]
    fn parse_jsonp_does_not_panic_when_paren_order_invalid() {
        let mut garbage = "y".repeat(564);
        garbage.push(')');
        garbage.push_str(&"x".repeat(103));
        garbage.push('(');
        let err = parse_json_text(&garbage).unwrap_err();
        assert!(err.contains("响应解析失败") || err.contains("非文本数据"));
    }
}
