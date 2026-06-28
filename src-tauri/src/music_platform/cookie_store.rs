use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri::Manager;

const NETEASE_COOKIE_FILE: &str = ".cookie";
const QQ_COOKIE_FILE: &str = ".qq-cookie";

pub fn cookie_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn netease_path(dir: &Path) -> PathBuf {
    dir.join(NETEASE_COOKIE_FILE)
}

fn qq_path(dir: &Path) -> PathBuf {
    dir.join(QQ_COOKIE_FILE)
}

pub fn read_netease(app: &AppHandle) -> Result<Option<String>, String> {
    let path = netease_path(&cookie_dir(app)?);
    read_cookie_file(&path)
}

pub fn write_netease(app: &AppHandle, cookie: &str) -> Result<(), String> {
    let dir = cookie_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(netease_path(&dir), cookie.trim()).map_err(|e| e.to_string())
}

pub fn clear_netease(app: &AppHandle) -> Result<(), String> {
    let path = netease_path(&cookie_dir(app)?);
    remove_if_exists(&path)
}

pub fn read_qq(app: &AppHandle) -> Result<Option<String>, String> {
    let path = qq_path(&cookie_dir(app)?);
    read_cookie_file(&path)
}

pub fn write_qq(app: &AppHandle, cookie: &str) -> Result<(), String> {
    let dir = cookie_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(qq_path(&dir), cookie.trim()).map_err(|e| e.to_string())
}

pub fn clear_qq(app: &AppHandle) -> Result<(), String> {
    let path = qq_path(&cookie_dir(app)?);
    remove_if_exists(&path)
}

fn read_cookie_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn parse_cookie_header(cookie_text: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for part in cookie_text.split(';') {
        let raw = part.trim();
        if raw.is_empty() {
            continue;
        }
        let Some(idx) = raw.find('=') else { continue };
        let key = raw[..idx].trim();
        let value = raw[idx + 1..].trim();
        if !key.is_empty() {
            out.insert(key.to_string(), value.to_string());
        }
    }
    out
}

pub fn netease_cookie_has_login(cookie_text: &str) -> bool {
    parse_cookie_header(cookie_text)
        .get("MUSIC_U")
        .is_some_and(|v| !v.is_empty())
}

pub fn build_cookie_header(map: &HashMap<String, String>, key_order: &[&str]) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut parts = Vec::new();
    for key in key_order {
        if seen.contains(*key) {
            continue;
        }
        if let Some(value) = map.get(*key).filter(|v| !v.is_empty()) {
            parts.push(format!("{key}={value}"));
            seen.insert(*key);
        }
    }
    for (key, value) in map {
        if seen.contains(key.as_str()) || value.is_empty() {
            continue;
        }
        parts.push(format!("{key}={value}"));
    }
    parts.join("; ")
}

pub fn merge_set_cookie_strings(chunks: &[String]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for chunk in chunks {
        for part in chunk.split(';') {
            let raw = part.trim();
            if raw.is_empty() {
                continue;
            }
            let Some(idx) = raw.find('=') else { continue };
            let key = raw[..idx].trim();
            let value = raw[idx + 1..].trim();
            if !key.is_empty() {
                map.insert(key.to_string(), value.to_string());
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn netease_login_requires_music_u() {
        assert!(!netease_cookie_has_login("foo=bar"));
        assert!(netease_cookie_has_login("MUSIC_U=abc123"));
    }
}
