use ncm_api_rs::{create_client, Query};
use serde::Serialize;
use serde_json::Value;

use super::cookie_store::read_netease;
use super::netease;
use super::qq::{qq_cookie_map_from_header, qq_extract_music_key, qq_extract_uin, qq_get_fcg};
use tauri::AppHandle;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub id: String,
    pub name: String,
    pub cover: Option<String>,
    pub track_count: u32,
    pub creator: Option<String>,
    pub provider: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistTrackItem {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album: Option<String>,
    pub cover: Option<String>,
    pub duration_ms: Option<u64>,
    /// QQ 音乐文件级 MID，换 vkey 更准确
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_mid: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistViewContext {
    pub netease_logged_in: bool,
    pub qq_logged_in: bool,
    pub show_tabs: bool,
    pub default_tab: String,
}

pub async fn playlist_view_context(app: &AppHandle) -> Result<PlaylistViewContext, String> {
    let netease_logged_in = read_netease(app)?
        .is_some_and(|cookie| super::cookie_store::netease_cookie_has_login(&cookie));
    let qq_logged_in = super::cookie_store::read_qq(app)?
        .map(|cookie| {
            let map = qq_cookie_map_from_header(&cookie);
            qq_extract_uin(&map).is_some() && qq_extract_music_key(&map).is_some()
        })
        .unwrap_or(false);

    let default_tab = if qq_logged_in {
        "qq".into()
    } else if netease_logged_in {
        "netease".into()
    } else {
        "qq".into()
    };

    Ok(PlaylistViewContext {
        netease_logged_in,
        qq_logged_in,
        show_tabs: netease_logged_in && qq_logged_in,
        default_tab,
    })
}

pub async fn fetch_playlists(app: &AppHandle, provider: &str) -> Result<Vec<PlaylistItem>, String> {
    match provider {
        "qq" => {
            let cookie = super::cookie_store::read_qq(app)?
                .ok_or_else(|| "请先登录 QQ 音乐".to_string())?;
            fetch_qq_playlists(&cookie).await
        }
        "netease" => fetch_netease_playlists(app).await,
        other => Err(format!("未知平台: {other}")),
    }
}

pub async fn fetch_tracks(
    app: &AppHandle,
    provider: &str,
    playlist_id: &str,
) -> Result<Vec<PlaylistTrackItem>, String> {
    match provider {
        "qq" => {
            let cookie = super::cookie_store::read_qq(app)?
                .ok_or_else(|| "请先登录 QQ 音乐".to_string())?;
            fetch_qq_tracks(&cookie, playlist_id).await
        }
        "netease" => fetch_netease_tracks(app, playlist_id).await,
        other => Err(format!("未知平台: {other}")),
    }
}

async fn fetch_qq_playlists(cookie: &str) -> Result<Vec<PlaylistItem>, String> {
    let map = qq_cookie_map_from_header(cookie);
    let uin = qq_extract_uin(&map).ok_or_else(|| "QQ Cookie 无效".to_string())?;

    let (created, fav) = tokio::join!(
        qq_get_created_playlists(&uin, cookie),
        qq_get_fav_playlists(&uin, cookie)
    );

    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut errors = Vec::new();

    for result in [created, fav] {
        match result {
            Ok(items) => {
                for item in items {
                    if seen.insert(item.id.clone()) {
                        out.push(item);
                    }
                }
            }
            Err(err) => errors.push(err),
        }
    }

    if out.is_empty() && !errors.is_empty() {
        return Err(errors.join("；"));
    }
    Ok(out)
}

async fn qq_get_created_playlists(uin: &str, cookie: &str) -> Result<Vec<PlaylistItem>, String> {
    let body = qq_get_fcg(
        "https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss",
        &[
            ("hostuin", uin.to_string()),
            ("sin", "0".into()),
            ("size", "200".into()),
        ],
        cookie,
        "https://y.qq.com/portal/profile.html",
    )
    .await?;

    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
    if code != 0 {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("QQ 自建歌单接口错误 ({code}): {msg}"));
    }

    let list = body["data"]["disslist"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    Ok(list
        .iter()
        .filter_map(map_qq_playlist_item)
        .collect())
}

async fn qq_get_fav_playlists(uin: &str, cookie: &str) -> Result<Vec<PlaylistItem>, String> {
    let body = qq_get_fcg(
        "https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg",
        &[
            ("userid", uin.to_string()),
            ("reqtype", "3".into()),
            ("cid", "205360956".into()),
        ],
        cookie,
        "https://y.qq.com/portal/profile.html",
    )
    .await?;

    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
    if code != 0 {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("QQ 收藏歌单接口错误 ({code}): {msg}"));
    }

    let list = body["data"]["cdlist"]
        .as_array()
        .or_else(|| body["data"]["mydiss"].as_array())
        .cloned()
        .unwrap_or_default();
    Ok(list
        .iter()
        .filter_map(map_qq_playlist_item)
        .collect())
}

fn map_qq_playlist_item(item: &Value) -> Option<PlaylistItem> {
    let id = item["tid"]
        .as_i64()
        .or_else(|| item["dissid"].as_i64())
        .or_else(|| item["disstid"].as_i64())
        .or_else(|| item["tid"].as_str()?.parse().ok())
        .or_else(|| item["dissid"].as_str()?.parse().ok())
        .or_else(|| item["disstid"].as_str()?.parse().ok())
        .map(|v| v.to_string())?;
    let name = item["diss_name"]
        .as_str()
        .or_else(|| item["dissname"].as_str())
        .or_else(|| item["title"].as_str())
        .unwrap_or("未命名歌单")
        .to_string();
    let cover = item["diss_cover"]
        .as_str()
        .or_else(|| item["logo"].as_str())
        .or_else(|| item["picurl"].as_str())
        .or_else(|| item["cover"].as_str())
        .map(str::to_string);
    let track_count = item["song_cnt"]
        .as_u64()
        .or_else(|| item["songnum"].as_u64())
        .or_else(|| item["song_cnt"].as_u64())
        .unwrap_or(0) as u32;
    let creator = item["nickname"]
        .as_str()
        .or_else(|| item["creator"]["name"].as_str())
        .or_else(|| item["creator"]["nick"].as_str())
        .map(str::to_string);
    Some(PlaylistItem {
        id,
        name,
        cover,
        track_count,
        creator,
        provider: "qq".into(),
    })
}

async fn fetch_qq_tracks(cookie: &str, disstid: &str) -> Result<Vec<PlaylistTrackItem>, String> {
    let body = qq_get_fcg(
        "https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg",
        &[
            ("type", "1".into()),
            ("json", "1".into()),
            ("utf8", "1".into()),
            ("onlysong", "0".into()),
            ("disstid", disstid.to_string()),
        ],
        cookie,
        "https://y.qq.com/n/yqq/playlist",
    )
    .await?;
    let songs = body["cdlist"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|cd| cd["songlist"].as_array())
        .cloned()
        .unwrap_or_default();

    Ok(songs
        .iter()
        .filter_map(|song| {
            let name = song["songname"]
                .as_str()
                .or_else(|| song["title"].as_str())?
                .to_string();
            let artist = song["singer"]
                .as_array()
                .and_then(|s| s.first())
                .and_then(|s| s["name"].as_str())
                .or_else(|| song["singername"].as_str())
                .unwrap_or("未知歌手")
                .to_string();
            let id = song["songmid"]
                .as_str()
                .or_else(|| song["mid"].as_str())
                .unwrap_or("")
                .to_string();
            let album = song["albumname"]
                .as_str()
                .or_else(|| song["album"]["name"].as_str())
                .map(str::to_string);
            let cover = song["albummid"]
                .as_str()
                .map(|mid| format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{mid}.jpg"));
            let duration_ms = song["interval"]
                .as_u64()
                .map(|sec| sec * 1000)
                .or_else(|| song["duration"].as_u64());
            let media_mid = song["file"]["media_mid"]
                .as_str()
                .or_else(|| song["strMediaMid"].as_str())
                .or_else(|| song["media_mid"].as_str())
                .map(str::to_string);
            Some(PlaylistTrackItem {
                id,
                name,
                artist,
                album,
                cover,
                duration_ms,
                media_mid,
            })
        })
        .collect())
}

async fn fetch_netease_playlists(app: &AppHandle) -> Result<Vec<PlaylistItem>, String> {
    let cookie = read_netease(app)?.ok_or_else(|| "请先登录网易云音乐".to_string())?;
    let status = netease::netease_login_status(app).await?;
    let uid = status
        .user_id
        .ok_or_else(|| "无法获取网易云用户 ID".to_string())?;

    let client = create_client(Some(cookie.clone()));
    let resp = client
        .user_playlist(
            &Query::new()
                .cookie(&cookie)
                .param("uid", &uid)
                .param("limit", "1000")
                .param("offset", "0"),
        )
        .await
        .map_err(|e| e.to_string())?;

    let list = resp.body["playlist"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    Ok(list
        .iter()
        .filter_map(|item| {
            let id = item["id"].as_i64()?.to_string();
            let name = item["name"].as_str().unwrap_or("未命名歌单").to_string();
            let cover = item["coverImgUrl"].as_str().map(str::to_string);
            let track_count = item["trackCount"].as_u64().unwrap_or(0) as u32;
            let creator = item["creator"]["nickname"]
                .as_str()
                .map(str::to_string);
            Some(PlaylistItem {
                id,
                name,
                cover,
                track_count,
                creator,
                provider: "netease".into(),
            })
        })
        .collect())
}

async fn fetch_netease_tracks(app: &AppHandle, playlist_id: &str) -> Result<Vec<PlaylistTrackItem>, String> {
    let cookie = read_netease(app)?.ok_or_else(|| "请先登录网易云音乐".to_string())?;
    let client = create_client(Some(cookie.clone()));
    let resp = client
        .playlist_detail(
            &Query::new()
                .cookie(&cookie)
                .param("id", playlist_id),
        )
        .await
        .map_err(|e| e.to_string())?;

    let tracks = resp.body["playlist"]["tracks"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    Ok(tracks
        .iter()
        .filter_map(|track| {
            let id = track["id"].as_i64()?.to_string();
            let name = track["name"].as_str()?.to_string();
            let artist = track["ar"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|a| a["name"].as_str())
                .unwrap_or("未知歌手")
                .to_string();
            let album = track["al"]["name"].as_str().map(str::to_string);
            let cover = track["al"]["picUrl"].as_str().map(str::to_string);
            let duration_ms = track["dt"].as_u64();
            Some(PlaylistTrackItem {
                id,
                name,
                artist,
                album,
                cover,
                duration_ms,
                media_mid: None,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_qq_item_basic() {
        let json: Value = serde_json::json!({
            "tid": 123,
            "diss_name": "测试歌单",
            "diss_cover": "https://example.com/a.jpg",
            "song_cnt": 10
        });
        let item = map_qq_playlist_item(&json).unwrap();
        assert_eq!(item.id, "123");
        assert_eq!(item.name, "测试歌单");
        assert_eq!(item.track_count, 10);
    }

    #[test]
    fn map_qq_item_legacy_fields() {
        let json: Value = serde_json::json!({
            "dissid": 456,
            "dissname": "旧字段歌单",
            "logo": "https://example.com/b.jpg",
            "songnum": 5
        });
        let item = map_qq_playlist_item(&json).unwrap();
        assert_eq!(item.id, "456");
        assert_eq!(item.name, "旧字段歌单");
        assert_eq!(item.track_count, 5);
    }
}
