use tauri::http::header::{HeaderMap, HeaderValue, ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_TYPE, RANGE, REFERER, USER_AGENT};
use tauri::http::{self, Response, StatusCode};
use tauri::UriSchemeResponder;

use super::qq::QQ_USER_AGENT;

const SCHEME: &str = "audio-proxy";

pub fn playback_url(provider: &str, cdn_url: &str, mime_type: Option<&str>) -> String {
    let mut url = format!(
        "{SCHEME}://localhost/?provider={}&url={}",
        urlencoding::encode(provider),
        urlencoding::encode(cdn_url)
    );
    if let Some(mime) = mime_type.filter(|m| !m.is_empty()) {
        url.push_str("&mime=");
        url.push_str(&urlencoding::encode(mime));
    }
    url
}

fn query_param(raw_uri: &str, key: &str) -> Option<String> {
    let query = raw_uri.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next()?;
        if k != key {
            continue;
        }
        let v = parts.next().unwrap_or("");
        return urlencoding::decode(v)
            .ok()
            .map(|s| s.into_owned())
            .filter(|s| !s.is_empty());
    }
    None
}

fn referer_for_provider(provider: &str) -> &'static str {
    if provider == "qq" {
        "https://y.qq.com/"
    } else {
        "https://music.163.com/"
    }
}

fn guess_content_type_from_url(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".flac") {
        "audio/flac"
    } else if lower.contains(".m4a") || lower.contains(".aac") {
        "audio/mp4"
    } else if lower.contains(".ogg") {
        "audio/ogg"
    } else {
        "audio/mpeg"
    }
}

fn normalize_mime(mime: &str) -> String {
    let lower = mime.trim().to_ascii_lowercase();
    if lower.contains("flac") {
        return "audio/flac".into();
    }
    if lower.contains("mpeg") || lower.contains("mp3") {
        return "audio/mpeg".into();
    }
    if lower.contains("mp4") || lower.contains("m4a") || lower.contains("aac") {
        return "audio/mp4".into();
    }
    if lower.contains("ogg") {
        return "audio/ogg".into();
    }
    mime.trim().to_string()
}

fn sniff_content_type(bytes: &[u8], url: &str, mime_hint: Option<&str>) -> String {
    if bytes.len() >= 4 && &bytes[0..4] == b"fLaC" {
        return "audio/flac".into();
    }
    if bytes.len() >= 3 && (&bytes[0..3] == b"ID3" || (bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0)) {
        return "audio/mpeg".into();
    }
    if bytes.len() >= 8 {
        let head = &bytes[0..8.min(bytes.len())];
        if head[4..8.min(head.len())] == *b"ftyp" {
            return "audio/mp4".into();
        }
    }
    if bytes.len() >= 4 && &bytes[0..4] == b"OggS" {
        return "audio/ogg".into();
    }
    if let Some(hint) = mime_hint.filter(|m| !m.is_empty()) {
        return normalize_mime(hint);
    }
    guess_content_type_from_url(url).to_string()
}

fn looks_like_html(bytes: &[u8]) -> bool {
    let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]);
    let trimmed = preview.trim_start();
    trimmed.starts_with("<!")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<?xml")
        || trimmed.contains("<HTML")
}

fn cors_response_builder(status: StatusCode) -> http::response::Builder {
    Response::builder()
        .status(status)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        .header("Access-Control-Allow-Headers", "Range")
        .header("Accept-Ranges", "bytes")
}

pub fn handle_request(request: http::Request<Vec<u8>>, responder: UriSchemeResponder) {
    if request.method() == http::Method::OPTIONS {
        responder.respond(
            cors_response_builder(StatusCode::NO_CONTENT)
                .body(Vec::new())
                .unwrap_or_else(|_| Response::new(Vec::new())),
        );
        return;
    }

    let uri = request.uri().to_string();
    let headers = request.headers().clone();

    tauri::async_runtime::spawn(async move {
        let response = match proxy_fetch(&uri, &headers).await {
            Ok(resp) => resp,
            Err(err) => cors_response_builder(StatusCode::BAD_GATEWAY)
                .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                .body(format!("音频代理失败: {err}").into_bytes())
                .unwrap_or_else(|_| Response::new(format!("音频代理失败: {err}").into_bytes())),
        };
        responder.respond(response);
    });
}

async fn proxy_fetch(raw_uri: &str, req_headers: &HeaderMap) -> Result<Response<Vec<u8>>, String> {
    let provider = query_param(raw_uri, "provider").unwrap_or_else(|| "netease".into());
    let cdn_url = query_param(raw_uri, "url").ok_or_else(|| "缺少 url 参数".to_string())?;
    let mime_hint = query_param(raw_uri, "mime");

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(QQ_USER_AGENT));
    headers.insert(
        REFERER,
        HeaderValue::from_static(referer_for_provider(&provider)),
    );
    if let Some(range) = req_headers.get(RANGE) {
        headers.insert(RANGE, range.clone());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let upstream = client
        .get(&cdn_url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    if status != StatusCode::OK && status != StatusCode::PARTIAL_CONTENT {
        return Err(format!("上游 HTTP {}", status.as_u16()));
    }

    let upstream_ct = upstream
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let content_range = upstream
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let content_length = upstream
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let bytes = upstream.bytes().await.map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("上游返回空音频".into());
    }
    if looks_like_html(&bytes) {
        return Err("上游返回非音频内容（可能是登录或版权限制）".into());
    }

    let upstream_ct = upstream_ct.as_str();
    let content_type = if upstream_ct.contains("octet-stream")
        || upstream_ct.is_empty()
        || upstream_ct.contains("text/")
    {
        sniff_content_type(&bytes, &cdn_url, mime_hint.as_deref())
    } else {
        normalize_mime(upstream_ct.split(';').next().unwrap_or(upstream_ct))
    };

    let mut builder = cors_response_builder(status);
    builder = builder.header(CONTENT_TYPE, content_type.as_str());

    if let Some(val) = content_range {
        builder = builder.header("content-range", val.as_str());
    }
    if let Some(val) = content_length {
        builder = builder.header("content-length", val.as_str());
    }

    builder
        .body(bytes.to_vec())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn music_audio_playback_url(
    provider: String,
    cdn_url: String,
    mime_type: Option<String>,
) -> Result<String, String> {
    let url = cdn_url.trim();
    if url.is_empty() {
        return Err("音源 URL 为空".into());
    }
    Ok(playback_url(
        provider.trim(),
        url,
        mime_type.as_deref().filter(|m| !m.is_empty()),
    ))
}
