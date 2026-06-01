//! 歌词检索：优先 LrcApi（中文友好），LRCLIB 兜底。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

const LRCLIB_BASE: &str = "https://lrclib.net/api";
const LRC_CX_DEFAULT_BASE: &str = "https://api.lrc.cx";
const USER_AGENT: &str = "WaveDance/0.1.0 (https://github.com/wavedance)";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLinePayload {
    pub time_ms: u64,
    pub text: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsUpdatePayload {
    pub track_key: String,
    pub status: String,
    pub instrumental: bool,
    pub lines: Vec<LyricLinePayload>,
    pub plain_lyrics: Option<String>,
    /// 命中来源：`lrc.cx` / `lrclib`
    pub lyrics_source: Option<String>,
}

/// 从正在播放元数据提取的查询参数（避免与 now_playing 模块循环依赖）。
#[derive(Clone)]
pub struct LyricTrackQuery {
    pub active: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
}

#[derive(Default)]
pub struct LyricsFetcher {
    last_requested_key: Arc<Mutex<String>>,
    cache: Arc<Mutex<HashMap<String, LyricsUpdatePayload>>>,
}

#[derive(Debug, Clone, Deserialize)]
struct LrclibRecord {
    #[serde(rename = "trackName")]
    track_name: Option<String>,
    #[serde(rename = "artistName")]
    artist_name: Option<String>,
    #[serde(rename = "albumName")]
    album_name: Option<String>,
    duration: Option<f64>,
    instrumental: Option<bool>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LrcCxJsonItem {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    lrc: Option<String>,
    score: Option<f64>,
}

impl LyricsFetcher {
    pub fn notify_track(&self, app: &AppHandle, track: &LyricTrackQuery) {
        if !track.active {
            let _ = app.emit(
                "lyrics-update",
                LyricsUpdatePayload {
                    track_key: String::new(),
                    status: "idle".into(),
                    instrumental: false,
                    lines: vec![],
                    plain_lyrics: None,
                    lyrics_source: None,
                },
            );
            return;
        }

        let title = track
            .title
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string();
        if title.is_empty() {
            return;
        }

        let key = lyrics_track_key(track);

        if let Ok(cache) = self.cache.lock() {
            if let Some(hit) = cache.get(&key) {
                let _ = app.emit("lyrics-update", hit.clone());
                return;
            }
        }

        let skip = self
            .last_requested_key
            .lock()
            .map(|g| g.as_str() == key)
            .unwrap_or(false);
        if skip {
            return;
        }
        if let Ok(mut last) = self.last_requested_key.lock() {
            *last = key.clone();
        }

        let loading = LyricsUpdatePayload {
            track_key: key.clone(),
            status: "loading".into(),
            instrumental: false,
            lines: vec![],
            plain_lyrics: None,
            lyrics_source: None,
        };
        let _ = app.emit("lyrics-update", loading);

        let artist = track.artist.clone().unwrap_or_default();
        let album = track.album.clone().unwrap_or_default();
        let duration = track.duration;
        let title_owned = title;
        let app_clone = app.clone();
        let cache = Arc::clone(&self.cache);
        let last_key = Arc::clone(&self.last_requested_key);

        tauri::async_runtime::spawn(async move {
            let result = fetch_lyrics_multi_source(&title_owned, &artist, &album, duration).await;
            let payload = match result {
                Ok(p) => p,
                Err(_) => LyricsUpdatePayload {
                    track_key: key.clone(),
                    status: "miss".into(),
                    instrumental: false,
                    lines: vec![],
                    plain_lyrics: None,
                    lyrics_source: None,
                },
            };
            let still_current = last_key
                .lock()
                .map(|g| g.as_str() == key)
                .unwrap_or(false);
            if !still_current {
                return;
            }
            if payload.status == "hit" {
                if let Ok(mut cache) = cache.lock() {
                    cache.insert(key.clone(), payload.clone());
                }
            }
            let _ = app_clone.emit("lyrics-update", payload);
        });
    }
}

pub fn lyrics_track_key(track: &LyricTrackQuery) -> String {
    format!(
        "{}|{}|{}|{}",
        track.title.as_deref().unwrap_or(""),
        track.artist.as_deref().unwrap_or(""),
        track.album.as_deref().unwrap_or(""),
        track
            .duration
            .map(|d| d.round() as i64)
            .unwrap_or(0),
    )
}

fn lrc_cx_base() -> String {
    std::env::var("WAVEDANCE_LRC_API_BASE")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| LRC_CX_DEFAULT_BASE.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn lrc_cx_auth_header() -> Option<String> {
    std::env::var("WAVEDANCE_LRC_API_AUTH")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(28))
        .build()
        .map_err(|e| e.to_string())
}

fn apply_auth(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    if let Some(token) = lrc_cx_auth_header() {
        req.header("Authorization", token)
    } else {
        req
    }
}

async fn fetch_lyrics_multi_source(
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
) -> Result<LyricsUpdatePayload, String> {
    let key = format!(
        "{title}|{artist}|{album}|{}",
        duration_secs.unwrap_or(0.0).round() as i64
    );
    let target_dur = duration_secs.filter(|d| *d >= 1.0);

    // 已知时长时优先走 jsonapi 多结果 + 时长评分，避免 `/lyrics` 单条误命中。
    if target_dur.is_some() {
        if let Ok(payload) = fetch_lrc_cx_jsonapi(title, artist, album, duration_secs, &key).await {
            return Ok(payload);
        }
    }

    if let Ok(payload) = fetch_lrc_cx_lyrics(title, artist, album, target_dur).await {
        return Ok(payload);
    }

    if target_dur.is_none() {
        if let Ok(payload) = fetch_lrc_cx_jsonapi(title, artist, album, duration_secs, &key).await {
            return Ok(payload);
        }
    }

    fetch_lrclib(title, artist, album, duration_secs, &key).await
}

/// LrcApi 公开 `/lyrics`：直接返回 LRC 文本（酷狗/网易等聚合）。
async fn fetch_lrc_cx_lyrics(
    title: &str,
    artist: &str,
    album: &str,
    target_dur: Option<f64>,
) -> Result<LyricsUpdatePayload, String> {
    let base = lrc_cx_base();
    let url = format!(
        "{base}/lyrics?title={}&artist={}&album={}",
        urlencoding::encode(title),
        urlencoding::encode(artist),
        urlencoding::encode(album),
    );
    let client = build_http_client()?;
    let resp = apply_auth(client.get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("lrc.cx lyrics http error".into());
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if let Some(td) = target_dur {
        if !lrc_duration_compatible(&body, td) {
            return Err("lrc.cx lyrics duration mismatch".into());
        }
    }
    lrc_text_to_payload(&body, "lrc.cx")
}

/// LrcApi `/jsonapi`：搜索多条结果，取最匹配且带 `lrc` 字段的一条。
async fn fetch_lrc_cx_jsonapi(
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
    track_key: &str,
) -> Result<LyricsUpdatePayload, String> {
    let base = lrc_cx_base();
    let url = format!(
        "{base}/jsonapi?title={}&artist={}&album={}",
        urlencoding::encode(title),
        urlencoding::encode(artist),
        urlencoding::encode(album),
    );
    let client = build_http_client()?;
    let resp = apply_auth(client.get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("lrc.cx jsonapi http error".into());
    }
    let list: Vec<LrcCxJsonItem> = resp.json().await.map_err(|e| e.to_string())?;
    let best = pick_best_lrc_cx_item(&list, title, artist, album, duration_secs);
    let Some(item) = best else {
        return Err("lrc.cx jsonapi no match".into());
    };
    let lrc = item.lrc.as_deref().unwrap_or("").trim();
    if lrc.is_empty() {
        return Err("lrc.cx jsonapi empty lrc".into());
    }
    let mut payload = lrc_text_to_payload(lrc, "lrc.cx")?;
    payload.track_key = track_key.to_string();
    Ok(payload)
}

fn pick_best_lrc_cx_item<'a>(
    list: &'a [LrcCxJsonItem],
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
) -> Option<&'a LrcCxJsonItem> {
    let title_l = title.to_lowercase();
    let artist_l = artist.to_lowercase();
    let album_l = album.to_lowercase();
    let target_dur = duration_secs.filter(|d| *d >= 1.0);

    list.iter()
        .filter(|i| i.lrc.as_ref().is_some_and(|s| !s.trim().is_empty()))
        .max_by(|a, b| {
            let sa = score_lrc_cx_item(a, &title_l, &artist_l, &album_l, target_dur);
            let sb = score_lrc_cx_item(b, &title_l, &artist_l, &album_l, target_dur);
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        })
}

fn score_lrc_cx_item(
    item: &LrcCxJsonItem,
    title_l: &str,
    artist_l: &str,
    album_l: &str,
    target_dur: Option<f64>,
) -> f64 {
    let mut score = item.score.unwrap_or(0.0);
    if let Some(t) = item.title.as_deref() {
        let tl = t.to_lowercase();
        if tl == title_l {
            score += 30.0;
        } else if tl.contains(title_l) || title_l.contains(&tl) {
            score += 10.0;
        }
    }
    if !artist_l.is_empty() {
        if let Some(a) = item.artist.as_deref() {
            let al = a.to_lowercase();
            if al == artist_l {
                score += 25.0;
            } else if al.contains(artist_l) || artist_l.contains(&al) {
                score += 12.0;
            }
        }
    }
    if !album_l.is_empty() {
        if let Some(a) = item.album.as_deref() {
            let al = a.to_lowercase();
            if al == album_l {
                score += 15.0;
            } else if al.contains(album_l) || album_l.contains(&al) {
                score += 6.0;
            }
        }
    }
    if let Some(td) = target_dur {
        let candidate = item
            .duration
            .or_else(|| item.lrc.as_deref().and_then(lrc_end_time_secs));
        if let Some(d) = candidate {
            score += duration_match_score(td, d);
        }
    }
    score
}

/// 根据时长差给候选歌词打分；LRCLIB 建议 ±2s 内视为同一版本。
fn duration_match_score(target_secs: f64, candidate_secs: f64) -> f64 {
    let diff = (target_secs - candidate_secs).abs();
    if diff <= 2.0 {
        50.0
    } else if diff <= 5.0 {
        35.0
    } else if diff <= 8.0 {
        20.0
    } else if diff <= 15.0 {
        5.0
    } else if diff <= 30.0 {
        -15.0
    } else {
        -40.0
    }
}

fn lrc_end_time_secs(lrc: &str) -> Option<f64> {
    let lines = parse_lrc(lrc);
    lines
        .last()
        .map(|l| l.time_ms as f64 / 1000.0)
        .filter(|d| *d >= 1.0)
}

fn lrc_duration_compatible(lrc: &str, target_secs: f64) -> bool {
    lrc_end_time_secs(lrc)
        .map(|end| (target_secs - end).abs() <= 30.0)
        .unwrap_or(true)
}

fn lrc_text_to_payload(lrc: &str, source: &str) -> Result<LyricsUpdatePayload, String> {
    let trimmed = lrc.trim();
    if trimmed.is_empty() {
        return Err("empty lrc".into());
    }

    let instrumental = trimmed.contains("纯音乐") || trimmed.contains("純音樂");
    let mut lines = parse_lrc(trimmed);
    let plain = if lines.is_empty() && !trimmed.starts_with('[') {
        Some(trimmed.to_string())
    } else {
        None
    };

    if lines.is_empty() {
        if let Some(ref plain_text) = plain {
            lines = plain_to_unsynced_lines(plain_text);
        }
    }

    if lines.is_empty() && plain.is_none() {
        return Err("no parseable lyrics".into());
    }

    Ok(LyricsUpdatePayload {
        track_key: String::new(),
        status: "hit".into(),
        instrumental,
        lines,
        plain_lyrics: plain,
        lyrics_source: Some(source.to_string()),
    })
}

async fn fetch_lrclib(
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
    track_key: &str,
) -> Result<LyricsUpdatePayload, String> {
    let client = build_http_client()?;

    if let Some(dur) = duration_secs.filter(|d| *d >= 1.0) {
        let duration = dur.round() as u64;
        if let Some(rec) = get_lrclib(&client, title, artist, album, duration, true).await? {
            return record_to_payload(track_key, rec);
        }
        if let Some(rec) = get_lrclib(&client, title, artist, album, duration, false).await? {
            return record_to_payload(track_key, rec);
        }
    }

    if let Some(rec) = search_lrclib(&client, title, artist, album, duration_secs).await? {
        return record_to_payload(track_key, rec);
    }

    Err("lrclib not found".into())
}

async fn get_lrclib(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
    album: &str,
    duration: u64,
    cached_only: bool,
) -> Result<Option<LrclibRecord>, String> {
    let path = if cached_only { "get-cached" } else { "get" };
    let url = format!(
        "{LRCLIB_BASE}/{path}?track_name={}&artist_name={}&album_name={}&duration={duration}",
        urlencoding::encode(title),
        urlencoding::encode(artist),
        urlencoding::encode(album),
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Ok(None);
    }
    resp.json::<LrclibRecord>().await.map(Some).map_err(|e| e.to_string())
}

async fn search_lrclib(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
) -> Result<Option<LrclibRecord>, String> {
    let mut url = format!(
        "{LRCLIB_BASE}/search?track_name={}",
        urlencoding::encode(title),
    );
    if !artist.is_empty() {
        url.push_str(&format!("&artist_name={}", urlencoding::encode(artist)));
    }
    if !album.is_empty() {
        url.push_str(&format!("&album_name={}", urlencoding::encode(album)));
    }
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let list: Vec<LrclibRecord> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(pick_best_lrclib_record(&list, title, artist, album, duration_secs))
}

fn pick_best_lrclib_record(
    list: &[LrclibRecord],
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
) -> Option<LrclibRecord> {
    let title_l = title.to_lowercase();
    let artist_l = artist.to_lowercase();
    let album_l = album.to_lowercase();
    let target_dur = duration_secs.filter(|d| *d >= 1.0);

    list.iter()
        .filter(|rec| has_usable_lyrics(rec))
        .max_by(|a, b| {
            let sa = score_lrclib_record(a, &title_l, &artist_l, &album_l, target_dur);
            let sb = score_lrclib_record(b, &title_l, &artist_l, &album_l, target_dur);
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn has_usable_lyrics(rec: &LrclibRecord) -> bool {
    rec.synced_lyrics
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
        || rec
            .plain_lyrics
            .as_ref()
            .is_some_and(|s| !s.trim().is_empty())
}

fn score_lrclib_record(
    rec: &LrclibRecord,
    title_l: &str,
    artist_l: &str,
    album_l: &str,
    target_dur: Option<f64>,
) -> f64 {
    let mut score = 0.0;
    if let Some(t) = rec.track_name.as_deref() {
        let tl = t.to_lowercase();
        if tl == title_l {
            score += 30.0;
        } else if tl.contains(title_l) || title_l.contains(&tl) {
            score += 10.0;
        }
    }
    if !artist_l.is_empty() {
        if let Some(a) = rec.artist_name.as_deref() {
            let al = a.to_lowercase();
            if al == artist_l {
                score += 25.0;
            } else if al.contains(artist_l) || artist_l.contains(&al) {
                score += 12.0;
            }
        }
    }
    if !album_l.is_empty() {
        if let Some(a) = rec.album_name.as_deref() {
            let al = a.to_lowercase();
            if al == album_l {
                score += 15.0;
            } else if al.contains(album_l) || album_l.contains(&al) {
                score += 6.0;
            }
        }
    }
    if rec.synced_lyrics.as_ref().is_some_and(|s| !s.trim().is_empty()) {
        score += 8.0;
    }
    if let Some(td) = target_dur {
        let candidate = rec
            .duration
            .or_else(|| rec.synced_lyrics.as_deref().and_then(lrc_end_time_secs));
        if let Some(d) = candidate {
            score += duration_match_score(td, d);
        }
    }
    score
}

fn record_to_payload(track_key: &str, rec: LrclibRecord) -> Result<LyricsUpdatePayload, String> {
    let instrumental = rec.instrumental.unwrap_or(false);
    let plain = rec
        .plain_lyrics
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut lines = rec
        .synced_lyrics
        .as_deref()
        .map(parse_lrc)
        .unwrap_or_default();

    if lines.is_empty() {
        if let Some(ref plain_text) = plain {
            lines = plain_to_unsynced_lines(plain_text);
        }
    }

    if lines.is_empty() && plain.is_none() {
        return Err("empty lyrics".into());
    }

    Ok(LyricsUpdatePayload {
        track_key: track_key.to_string(),
        status: "hit".into(),
        instrumental,
        lines,
        plain_lyrics: plain,
        lyrics_source: Some("lrclib".into()),
    })
}

fn plain_to_unsynced_lines(plain: &str) -> Vec<LyricLinePayload> {
    plain
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .enumerate()
        .map(|(i, text)| LyricLinePayload {
            time_ms: (i as u64).saturating_mul(4000),
            text: text.to_string(),
        })
        .collect()
}

fn parse_lrc(synced: &str) -> Vec<LyricLinePayload> {
    let mut lines = Vec::new();
    for raw in synced.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((time_ms, text)) = parse_lrc_line(trimmed) {
            if !text.is_empty() {
                lines.push(LyricLinePayload { time_ms, text });
            }
        }
    }
    lines.sort_by_key(|l| l.time_ms);
    lines
}

fn parse_lrc_line(line: &str) -> Option<(u64, String)> {
    let start = line.find('[')?;
    let end = line[start..].find(']')? + start;
    let tag = &line[start + 1..end];
    let text = line[end + 1..].trim().to_string();
    let (min_str, sec_str) = tag.split_once(':')?;
    let min: u64 = min_str.trim().parse().ok()?;
    let sec_str = sec_str.trim();
    let (sec, frac_ms) = if let Some((s, frac)) = sec_str.split_once('.') {
        (s.parse::<u64>().ok()?, fractional_to_ms(frac))
    } else {
        (sec_str.parse::<u64>().ok()?, 0)
    };
    let time_ms = min.saturating_mul(60_000) + sec.saturating_mul(1000) + frac_ms;
    Some((time_ms, text))
}

/// LRC 小数部分：2 位按百分秒，3 位按毫秒（LrcApi/网易常见）。
fn fractional_to_ms(frac: &str) -> u64 {
    if frac.is_empty() {
        return 0;
    }
    let val: u64 = frac.parse().unwrap_or(0);
    match frac.len() {
        1 => val.saturating_mul(100),
        2 => val.saturating_mul(10),
        3 => val,
        n => {
            let pow = 10u64.saturating_pow(n.saturating_sub(3) as u32);
            val.saturating_mul(pow)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_match_score_prefers_close_match() {
        assert!(duration_match_score(240.0, 241.0) > duration_match_score(240.0, 260.0));
        assert!(duration_match_score(240.0, 260.0) > duration_match_score(240.0, 300.0));
    }

    #[test]
    fn lrc_end_time_reads_last_timestamp() {
        let lrc = "[00:10.00] first\n[03:52.50] last line\n";
        assert!((lrc_end_time_secs(lrc).unwrap() - 232.5).abs() < 0.01);
    }

    #[test]
    fn lrc_duration_compatible_allows_reasonable_drift() {
        let lrc = "[00:10.00] line\n[03:58.00] end\n";
        assert!(lrc_duration_compatible(lrc, 240.0));
        assert!(!lrc_duration_compatible(lrc, 120.0));
    }

    #[test]
    fn pick_best_lrc_cx_item_uses_duration() {
        let list = vec![
            LrcCxJsonItem {
                title: Some("Song".into()),
                artist: Some("Artist".into()),
                album: None,
                duration: Some(180.0),
                lrc: Some("[00:01.00] wrong version\n".into()),
                score: Some(80.0),
            },
            LrcCxJsonItem {
                title: Some("Song".into()),
                artist: Some("Artist".into()),
                album: None,
                duration: Some(240.0),
                lrc: Some("[00:01.00] right version\n".into()),
                score: Some(80.0),
            },
        ];
        let best = pick_best_lrc_cx_item(&list, "Song", "Artist", "", Some(241.0));
        assert_eq!(best.and_then(|i| i.duration), Some(240.0));
    }
}
