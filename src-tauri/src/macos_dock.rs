//! macOS 程序坞图标与右键菜单（与菜单栏托盘共用同一套菜单项与事件 ID）。

use std::ffi::CStr;
use std::mem;
use std::ptr;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::Once;

use muda::{ContextMenu, Menu, MenuItem, PredefinedMenuItem};
use objc2::ffi::class_addMethod;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::MainThreadMarker;
use objc2_app_kit::NSApplication;
use tauri::image::Image;
use tauri::{AppHandle, Runtime};

/// 菜单栏托盘图标：使用 bundle 默认窗口图标（32×32），与改动前行为一致。
pub fn load_tray_icon<R: Runtime>(app: &AppHandle<R>) -> Option<Image<'static>> {
    app.default_window_icon().map(|icon| icon.clone().to_owned())
}

pub const TRAY_MENU_SETTINGS: &str = "tray_settings";
pub const TRAY_MENU_ESP_DISPLAY: &str = "tray_esp_display";
pub const TRAY_MENU_WINDOW_MANAGER: &str = "tray_window_manager";
pub const TRAY_MENU_MUSIC_LOGIN: &str = "tray_music_login";
pub const TRAY_MENU_MUSIC_PLAYLIST: &str = "tray_music_playlist";
pub const TRAY_MENU_MUSIC_PLAYER_QUEUE: &str = "tray_music_player_queue";
pub const TRAY_MENU_MUSIC_PLAYER: &str = "tray_music_player";
pub const TRAY_MENU_NEW_SPECTRUM: &str = "tray_new_spectrum";
pub const TRAY_MENU_NEW_SPECTRUM_TRADITIONAL: &str = "tray_new_spectrum_traditional";
pub const TRAY_MENU_NEW_LYRICS: &str = "tray_new_lyrics";
pub const TRAY_MENU_NEW_COVER: &str = "tray_new_cover";
pub const TRAY_MENU_NEW_SONGINFO: &str = "tray_new_songinfo";
pub const TRAY_MENU_QUIT: &str = "tray_quit";

static DOCK_NS_MENU: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(ptr::null_mut());
static INSTALL_DOCK_DELEGATE: Once = Once::new();

/// 构建与菜单栏托盘一致的 muda 菜单，供程序坞右键使用。
pub fn build_dock_menu() -> muda::Result<Menu> {
    let settings = MenuItem::with_id(TRAY_MENU_SETTINGS, "设置…", true, None);
    let esp_display = MenuItem::with_id(TRAY_MENU_ESP_DISPLAY, "外接屏设置…", true, None);
    let window_manager = MenuItem::with_id(TRAY_MENU_WINDOW_MANAGER, "窗口管理…", true, None);
    let music_login = MenuItem::with_id(TRAY_MENU_MUSIC_LOGIN, "登录音乐平台…", true, None);
    let music_playlist = MenuItem::with_id(TRAY_MENU_MUSIC_PLAYLIST, "查看歌单…", true, None);
    let music_player = MenuItem::with_id(TRAY_MENU_MUSIC_PLAYER, "播放控制…", true, None);
    let music_player_queue =
        MenuItem::with_id(TRAY_MENU_MUSIC_PLAYER_QUEUE, "播放列表…", true, None);
    let new_spectrum = MenuItem::with_id(TRAY_MENU_NEW_SPECTRUM, "新建浮层频谱窗口", true, None);
    let new_spectrum_traditional = MenuItem::with_id(
        TRAY_MENU_NEW_SPECTRUM_TRADITIONAL,
        "新建传统频谱窗口",
        true,
        None,
    );
    let new_lyrics = MenuItem::with_id(TRAY_MENU_NEW_LYRICS, "新建浮层歌词窗口", true, None);
    let new_cover = MenuItem::with_id(TRAY_MENU_NEW_COVER, "新建歌曲封面窗口", true, None);
    let new_songinfo = MenuItem::with_id(TRAY_MENU_NEW_SONGINFO, "新建歌曲信息窗口", true, None);
    let separator = PredefinedMenuItem::separator();
    let quit = MenuItem::with_id(TRAY_MENU_QUIT, "退出 WaveDance", true, None);

    Menu::with_items(&[
        &settings,
        &esp_display,
        &window_manager,
        &music_login,
        &music_playlist,
        &music_player,
        &music_player_queue,
        &new_spectrum,
        &new_spectrum_traditional,
        &new_lyrics,
        &new_cover,
        &new_songinfo,
        &separator,
        &quit,
    ])
}

/// 在程序坞显示应用图标（不改变 Accessory 激活策略，避免干扰浮层行为）。
pub fn ensure_dock_icon_visible<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.set_dock_visibility(true);
}

/// 将菜单挂到程序坞图标的右键菜单。
pub fn attach_dock_menu(menu: Menu) {
    let ns_menu = menu.ns_menu();
    Box::leak(Box::new(menu));
    DOCK_NS_MENU.store(ns_menu, Ordering::Release);
    INSTALL_DOCK_DELEGATE.call_once(install_dock_menu_delegate);
}

unsafe extern "C-unwind" fn application_dock_menu(
    _this: *mut AnyObject,
    _sel: Sel,
    _sender: *mut AnyObject,
) -> *mut AnyObject {
    let _ = (_this, _sel, _sender);
    DOCK_NS_MENU.load(Ordering::Acquire) as *mut AnyObject
}

fn install_dock_menu_delegate() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let _app = NSApplication::sharedApplication(mtm);

    let Some(delegate_class) =
        AnyClass::get(CStr::from_bytes_with_nul(b"TaoAppDelegateParent\0").unwrap())
    else {
        return;
    };

    let sel = Sel::register(CStr::from_bytes_with_nul(b"applicationDockMenu:\0").unwrap());
    let types = CStr::from_bytes_with_nul(b"@24@0:8@16\0").unwrap();
    let cls = delegate_class as *const AnyClass as *mut AnyClass;
    let imp: Imp = unsafe { mem::transmute(application_dock_menu as *const ()) };
    let added = unsafe { class_addMethod(cls, sel, imp, types.as_ptr()) };
    if !added.as_bool() {
        // 方法已存在时忽略（重复安装）。
    }
}
