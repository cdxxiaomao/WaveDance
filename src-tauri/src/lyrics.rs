//! 歌词检索：优先国内 LrcApi（lrc.cx），单源超过 5 秒切换下一源；LRCLIB 海外兜底。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

const LRCLIB_BASE: &str = "https://lrclib.net/api";
const LRC_CX_DEFAULT_BASE: &str = "https://api.lrc.cx";
const USER_AGENT: &str = "WaveDance/0.1.0 (https://github.com/wavedance)";
/// 单个歌词源检索超时；超时或失败则切换下一源（国内优先）。
const LYRICS_SOURCE_SEARCH_TIMEOUT: Duration = Duration::from_secs(5);

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

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsCandidatePayload {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_sec: Option<f64>,
    pub source: String,
    pub score: f64,
    pub selected: bool,
}

#[derive(Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSearchSessionPayload {
    pub track_key: String,
    pub query_title: String,
    pub query_artist: String,
    pub query_album: String,
    /// `idle` | `loading` | `success` | `failed`
    pub status: String,
    /// 与歌词展示一致：`idle` | `loading` | `hit` | `miss`
    pub result_status: String,
    pub active_source: Option<String>,
    pub selected_candidate_id: Option<String>,
    pub error_message: Option<String>,
    pub candidates: Vec<LyricsCandidatePayload>,
}

#[derive(Clone)]
struct StoredCandidate {
    meta: LyricsCandidatePayload,
    payload: LyricsUpdatePayload,
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

pub struct LyricsFetcher {
    last_requested_key: Arc<Mutex<String>>,
    cache: Arc<Mutex<HashMap<String, LyricsUpdatePayload>>>,
    manual_selection: Arc<Mutex<HashMap<String, String>>>,
    candidate_store: Arc<Mutex<HashMap<String, Vec<StoredCandidate>>>>,
    current_session: Arc<Mutex<LyricsSearchSessionPayload>>,
    last_track_query: Arc<Mutex<Option<LyricTrackQuery>>>,
}

impl Default for LyricsFetcher {
    fn default() -> Self {
        Self {
            last_requested_key: Arc::new(Mutex::new(String::new())),
            cache: Arc::new(Mutex::new(HashMap::new())),
            manual_selection: Arc::new(Mutex::new(HashMap::new())),
            candidate_store: Arc::new(Mutex::new(HashMap::new())),
            current_session: Arc::new(Mutex::new(LyricsSearchSessionPayload::default())),
            last_track_query: Arc::new(Mutex::new(None)),
        }
    }
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
    pub fn get_search_session(&self) -> LyricsSearchSessionPayload {
        self.current_session
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn select_candidate(
        &self,
        app: &AppHandle,
        candidate_id: &str,
    ) -> Result<(), String> {
        let id = candidate_id.trim();
        if id.is_empty() {
            return Err("无效的歌词候选".into());
        }
        let track_key = self
            .current_session
            .lock()
            .map(|g| g.track_key.clone())
            .unwrap_or_default();
        if track_key.is_empty() {
            return Err("当前没有正在检索的曲目".into());
        }
        let payload = {
            let store = self
                .candidate_store
                .lock()
                .map_err(|e| e.to_string())?;
            let list = store
                .get(&track_key)
                .ok_or_else(|| "暂无候选歌词".to_string())?;
            list.iter()
                .find(|c| c.meta.id == id)
                .map(|c| c.payload.clone())
                .ok_or_else(|| "未找到对应歌词候选".to_string())?
        };
        if let Ok(mut manual) = self.manual_selection.lock() {
            manual.insert(track_key.clone(), id.to_string());
        }
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(track_key.clone(), payload.clone());
        }
        let _ = app.emit("lyrics-update", payload.clone());
        self.emit_session_for_track(app, &track_key, "success", &payload, Some(id));
        Ok(())
    }

    pub fn refresh_search(&self, app: &AppHandle, track: &LyricTrackQuery) {
        if let Ok(mut last) = self.last_requested_key.lock() {
            last.clear();
        }
        self.notify_track_inner(app, track, true);
    }

    pub fn notify_track(&self, app: &AppHandle, track: &LyricTrackQuery) {
        self.notify_track_inner(app, track, false);
    }

    fn notify_track_inner(&self, app: &AppHandle, track: &LyricTrackQuery, force: bool) {
        if let Ok(mut last_track) = self.last_track_query.lock() {
            *last_track = Some(track.clone());
        }

        if !track.active {
            if let Ok(mut last) = self.last_requested_key.lock() {
                last.clear();
            }
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
            self.emit_idle_session(app);
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

        if let Ok(manual) = self.manual_selection.lock() {
            if let Some(cid) = manual.get(&key) {
                let payload = self
                    .candidate_store
                    .lock()
                    .ok()
                    .and_then(|store| store.get(&key).cloned())
                    .and_then(|list| {
                        list.iter()
                            .find(|c| c.meta.id == *cid)
                            .map(|c| c.payload.clone())
                    });
                if let Some(payload) = payload {
                    let _ = app.emit("lyrics-update", payload.clone());
                    self.emit_session_for_track(app, &key, "success", &payload, Some(cid));
                    return;
                }
            }
        }

        if !force {
            if let Ok(cache) = self.cache.lock() {
                if let Some(hit) = cache.get(&key) {
                    let _ = app.emit("lyrics-update", hit.clone());
                    let selected = self
                        .manual_selection
                        .lock()
                        .ok()
                        .and_then(|g| g.get(&key).cloned());
                    self.emit_session_for_track(
                        app,
                        &key,
                        if hit.status == "hit" {
                            "success"
                        } else {
                            "failed"
                        },
                        hit,
                        selected.as_deref(),
                    );
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
        let _ = app.emit("lyrics-update", loading.clone());
        self.emit_loading_session(app, track, &key);

        let artist = track.artist.clone().unwrap_or_default();
        let album = track.album.clone().unwrap_or_default();
        let duration = track.duration;
        let title_owned = title;
        let app_clone = app.clone();
        let cache = Arc::clone(&self.cache);
        let last_key = Arc::clone(&self.last_requested_key);
        let candidate_store = Arc::clone(&self.candidate_store);
        let current_session = Arc::clone(&self.current_session);

        tauri::async_runtime::spawn(async move {
            let (candidates, best_id, best_payload) =
                search_all_candidates(&title_owned, &artist, &album, duration, &key).await;

            let still_current = last_key
                .lock()
                .map(|g| g.as_str() == key)
                .unwrap_or(false);
            if !still_current {
                return;
            }

            if let Ok(mut store) = candidate_store.lock() {
                store.insert(key.clone(), candidates.clone());
            }

            let payload = match best_payload {
                Some(p) => {
                    if let Ok(mut cache) = cache.lock() {
                        cache.insert(key.clone(), p.clone());
                    }
                    p
                }
                None => LyricsUpdatePayload {
                    track_key: key.clone(),
                    status: "miss".into(),
                    instrumental: false,
                    lines: vec![],
                    plain_lyrics: None,
                    lyrics_source: None,
                },
            };

            let session_status = if payload.status == "hit" {
                "success"
            } else {
                "failed"
            };
            let selected_id = best_id.as_deref();
            let session = build_search_session(
                &key,
                &title_owned,
                &artist,
                &album,
                session_status,
                &payload.status,
                payload.lyrics_source.as_deref(),
                selected_id,
                if payload.status == "hit" {
                    None
                } else {
                    Some("未找到匹配的歌词")
                },
                &candidates,
                selected_id,
            );
            if let Ok(mut cur) = current_session.lock() {
                *cur = session.clone();
            }
            let _ = app_clone.emit("lyrics-search-update", session);
            let _ = app_clone.emit("lyrics-update", payload);
        });
    }

    fn emit_idle_session(&self, app: &AppHandle) {
        let session = LyricsSearchSessionPayload {
            status: "idle".into(),
            result_status: "idle".into(),
            ..Default::default()
        };
        if let Ok(mut cur) = self.current_session.lock() {
            *cur = session.clone();
        }
        let _ = app.emit("lyrics-search-update", session);
    }

    fn emit_loading_session(&self, app: &AppHandle, track: &LyricTrackQuery, track_key: &str) {
        let session = build_search_session(
            track_key,
            track.title.as_deref().unwrap_or(""),
            track.artist.as_deref().unwrap_or(""),
            track.album.as_deref().unwrap_or(""),
            "loading",
            "loading",
            None,
            None,
            None,
            &[],
            None,
        );
        if let Ok(mut cur) = self.current_session.lock() {
            *cur = session.clone();
        }
        let _ = app.emit("lyrics-search-update", session);
    }

    fn emit_session_for_track(
        &self,
        app: &AppHandle,
        track_key: &str,
        status: &str,
        payload: &LyricsUpdatePayload,
        selected_id: Option<&str>,
    ) {
        let (query_title, query_artist, query_album) = self
            .last_track_query
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .map(|t| {
                (
                    t.title.unwrap_or_default(),
                    t.artist.unwrap_or_default(),
                    t.album.unwrap_or_default(),
                )
            })
            .unwrap_or_default();
        let candidates = self
            .candidate_store
            .lock()
            .ok()
            .and_then(|g| g.get(track_key).cloned())
            .unwrap_or_default();
        let session = build_search_session(
            track_key,
            &query_title,
            &query_artist,
            &query_album,
            status,
            &payload.status,
            payload.lyrics_source.as_deref(),
            selected_id,
            if payload.status == "miss" {
                Some("未找到匹配的歌词")
            } else {
                None
            },
            &candidates,
            selected_id,
        );
        if let Ok(mut cur) = self.current_session.lock() {
            *cur = session.clone();
        }
        let _ = app.emit("lyrics-search-update", session);
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
    build_http_client_with_timeout(LYRICS_SOURCE_SEARCH_TIMEOUT)
}

fn build_http_client_with_timeout(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())
}

/// 尝试单个歌词源；整源超过 5 秒或失败则返回 `None`，由调用方切换下一源。
async fn try_lyrics_source<T>(
    future: impl std::future::Future<Output = Result<T, String>>,
) -> Option<T> {
    match tokio::time::timeout(LYRICS_SOURCE_SEARCH_TIMEOUT, future).await {
        Ok(Ok(value)) => Some(value),
        Ok(Err(_)) | Err(_) => None,
    }
}

fn apply_auth(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    if let Some(token) = lrc_cx_auth_header() {
        req.header("Authorization", token)
    } else {
        req
    }
}

fn build_search_session(
    track_key: &str,
    query_title: &str,
    query_artist: &str,
    query_album: &str,
    status: &str,
    result_status: &str,
    active_source: Option<&str>,
    selected_candidate_id: Option<&str>,
    error_message: Option<&str>,
    candidates: &[StoredCandidate],
    selected_id: Option<&str>,
) -> LyricsSearchSessionPayload {
    LyricsSearchSessionPayload {
        track_key: track_key.to_string(),
        query_title: query_title.to_string(),
        query_artist: query_artist.to_string(),
        query_album: query_album.to_string(),
        status: status.to_string(),
        result_status: result_status.to_string(),
        active_source: active_source.map(str::to_string),
        selected_candidate_id: selected_candidate_id.map(str::to_string),
        error_message: error_message.map(str::to_string),
        candidates: candidates
            .iter()
            .map(|c| {
                let mut meta = c.meta.clone();
                meta.selected = selected_id.map(|id| id == meta.id).unwrap_or(false);
                meta
            })
            .collect(),
    }
}

async fn search_all_candidates(
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
    track_key: &str,
) -> (Vec<StoredCandidate>, Option<String>, Option<LyricsUpdatePayload>) {
    let title_l = title.to_lowercase();
    let artist_l = artist.to_lowercase();
    let album_l = album.to_lowercase();
    let target_dur = duration_secs.filter(|d| *d >= 1.0);
    let mut candidates = Vec::new();

    // 国内 1/2：lrc.cx jsonapi 多候选（酷狗/网易等聚合）
    if let Some(list) =
        try_lyrics_source(fetch_lrc_cx_jsonapi_list(title, artist, album)).await
    {
        for (i, item) in list.iter().enumerate() {
            if let Some(candidate) = lrc_cx_item_to_candidate(
                item,
                i,
                track_key,
                &title_l,
                &artist_l,
                &album_l,
                target_dur,
            ) {
                candidates.push(candidate);
            }
        }
    }

    // 国内 2/2：lrc.cx `/lyrics` 直链
    if let Some(mut payload) =
        try_lyrics_source(fetch_lrc_cx_lyrics(title, artist, album, target_dur)).await
    {
        payload.track_key = track_key.to_string();
        candidates.push(StoredCandidate {
            meta: LyricsCandidatePayload {
                id: "lrc.cx:direct".into(),
                title: title.to_string(),
                artist: artist.to_string(),
                album: album.to_string(),
                duration_sec: target_dur,
                source: "lrc.cx".into(),
                score: 1000.0,
                selected: false,
            },
            payload,
        });
    }

    // 海外兜底：LRCLIB（仅在前序国内源超时/无结果后继续）
    if let Some(list) = try_lyrics_source(search_lrclib_list(
        title,
        artist,
        album,
        duration_secs,
    ))
    .await
    {
        for (i, rec) in list.iter().enumerate() {
            if let Some(candidate) = lrclib_record_to_candidate(
                rec,
                i,
                track_key,
                &title_l,
                &artist_l,
                &album_l,
                target_dur,
            ) {
                candidates.push(candidate);
            }
        }
    }

    candidates.sort_by(|a, b| {
        b.meta
            .score
            .partial_cmp(&a.meta.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let best = candidates.first().cloned();
    let best_id = best.as_ref().map(|c| c.meta.id.clone());
    let best_payload = best.map(|c| c.payload);
    (candidates, best_id, best_payload)
}

fn lrc_cx_item_to_candidate(
    item: &LrcCxJsonItem,
    index: usize,
    track_key: &str,
    title_l: &str,
    artist_l: &str,
    album_l: &str,
    target_dur: Option<f64>,
) -> Option<StoredCandidate> {
    let lrc = item.lrc.as_deref()?.trim();
    if lrc.is_empty() {
        return None;
    }
    let mut payload = lrc_text_to_payload(lrc, "lrc.cx").ok()?;
    payload.track_key = track_key.to_string();
    let score = score_lrc_cx_item(item, title_l, artist_l, album_l, target_dur);
    Some(StoredCandidate {
        meta: LyricsCandidatePayload {
            id: format!("lrc.cx:{index}"),
            title: item.title.clone().unwrap_or_default(),
            artist: item.artist.clone().unwrap_or_default(),
            album: item.album.clone().unwrap_or_default(),
            duration_sec: item.duration.or_else(|| Some(lrc_end_time_secs(lrc)).flatten()),
            source: "lrc.cx".into(),
            score,
            selected: false,
        },
        payload,
    })
}

fn lrclib_record_to_candidate(
    rec: &LrclibRecord,
    index: usize,
    track_key: &str,
    title_l: &str,
    artist_l: &str,
    album_l: &str,
    target_dur: Option<f64>,
) -> Option<StoredCandidate> {
    if !has_usable_lyrics(rec) {
        return None;
    }
    let payload = record_to_payload(track_key, rec.clone()).ok()?;
    let score = score_lrclib_record(rec, title_l, artist_l, album_l, target_dur);
    Some(StoredCandidate {
        meta: LyricsCandidatePayload {
            id: format!("lrclib:{index}"),
            title: rec.track_name.clone().unwrap_or_default(),
            artist: rec.artist_name.clone().unwrap_or_default(),
            album: rec.album_name.clone().unwrap_or_default(),
            duration_sec: rec
                .duration
                .or_else(|| rec.synced_lyrics.as_deref().and_then(lrc_end_time_secs)),
            source: "lrclib".into(),
            score,
            selected: false,
        },
        payload,
    })
}

async fn fetch_lrc_cx_jsonapi_list(
    title: &str,
    artist: &str,
    album: &str,
) -> Result<Vec<LrcCxJsonItem>, String> {
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
    resp.json::<Vec<LrcCxJsonItem>>().await.map_err(|e| e.to_string())
}

async fn search_lrclib_list(
    title: &str,
    artist: &str,
    album: &str,
    duration_secs: Option<f64>,
) -> Result<Vec<LrclibRecord>, String> {
    let client = build_http_client()?;
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
        return Ok(vec![]);
    }
    let list: Vec<LrclibRecord> = resp.json().await.map_err(|e| e.to_string())?;
    let title_l = title.to_lowercase();
    let artist_l = artist.to_lowercase();
    let album_l = album.to_lowercase();
    let target_dur = duration_secs.filter(|d| *d >= 1.0);
    let mut filtered: Vec<LrclibRecord> = list
        .into_iter()
        .filter(|rec| has_usable_lyrics(rec))
        .collect();
    filtered.sort_by(|a, b| {
        let sa = score_lrclib_record(a, &title_l, &artist_l, &album_l, target_dur);
        let sb = score_lrclib_record(b, &title_l, &artist_l, &album_l, target_dur);
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(filtered)
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
    fn score_lrc_cx_item_prefers_duration_match() {
        let wrong = LrcCxJsonItem {
            title: Some("Song".into()),
            artist: Some("Artist".into()),
            album: None,
            duration: Some(180.0),
            lrc: Some("[00:01.00] wrong version\n".into()),
            score: Some(80.0),
        };
        let right = LrcCxJsonItem {
            title: Some("Song".into()),
            artist: Some("Artist".into()),
            album: None,
            duration: Some(240.0),
            lrc: Some("[00:01.00] right version\n".into()),
            score: Some(80.0),
        };
        let target = Some(241.0);
        let wrong_score = score_lrc_cx_item(&wrong, "song", "artist", "", target);
        let right_score = score_lrc_cx_item(&right, "song", "artist", "", target);
        assert!(right_score > wrong_score);
    }
}
