# WaveDance 音乐平台登录 — 实现方案

> **文档类型**：实现指导手册（Agent / 开发者跨会话接力用）  
> **创建日期**：2026-06-28  
> **状态**：方案设计阶段  
> **平台范围**：macOS（托盘、WKWebView Cookie 读取均为 macOS 专属）  
> **关联文档**：`docs/MUSIC_PLATFORM_INTEGRATION.md`（音源 / 歌词 / BFF 通用约定） | `PROJECT_CONTEXT.md`

---

## 1. 目标与范围

### 1.1 目标

在 WaveDance **系统托盘**中增加「登录音乐平台」入口，打开**独立登录管理窗口**，支持：

| 平台 | 登录方式 | 说明 |
|------|----------|------|
| **QQ 音乐** | 内嵌 `WebviewUrl::External` + **macOS 原生读 Cookie** | 一次性完整实现（含播放器页 warmup、播放票据检测） |
| **网易云音乐** | 扫码登录（QR 三轮 API） | 在登录管理窗内展示二维码，无需内嵌浏览器 |

登录成功后 Cookie 持久化至用户数据目录；管理窗展示昵称、头像、登录态及 QQ `playbackKeyReady`。

### 1.2 范围内（本方案）

- 托盘菜单项与窗口打开逻辑（Rust）
- **全新独立**前端页面（不复用 `settings.html` 等现有 HTML）
- Rust 模块 `music_platform`：Cookie 读写、登录态查询、登出
- QQ：独立 External WebView 登录子窗 + Cookie 轮询 + warmup 跳转
- 网易：QR 创建 / 轮询 / 持久化
- Tauri Command 供前端调用

### 1.3 范围外（本方案不做，见 `MUSIC_PLATFORM_INTEGRATION.md`）

- 音源 URL、歌词、歌单、音频代理、跨平台换源
- Windows / Linux 登录（无 macOS Cookie API）
- QQ 手动粘贴 Cookie 兜底（若内嵌登录失败可后续追加，首版不做）

---

## 2. 总体架构

```text
┌─────────────────────────────────────────────────────────────────┐
│  macOS 系统托盘                                                   │
│  「登录音乐平台…」 ──► music-platform-login 窗口（App 本地 HTML）    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  网易 QR 区域            QQ「开始登录」按钮         双平台状态卡片
  invoke 轮询             打开 qq-music-login       invoke status / logout
        │                 External WebView                 │
        │                       │                          │
        ▼                       ▼                          ▼
┌───────────────────┐  ┌────────────────────────┐  ┌─────────────────┐
│ music_platform/   │  │ qq-music-login 子窗       │  │ app_data_dir/   │
│ netease_login.rs  │  │ y.qq.com 个人页 → 播放器   │  │ .cookie         │
│ (ncm-api-rs 或    │  │ macOS WKHTTPCookieStore  │  │ .qq-cookie      │
│  自研 HTTP)       │  │ 每 1.2s 轮询 + warmup    │  └─────────────────┘
└───────────────────┘  └────────────────────────┘
```

**设计原则：**

- 登录管理窗（`music-platform-login`）与 QQ 登录子窗（`qq-music-login`）**职责分离**：前者只做 UI 与状态，后者只负责网页登录与 Cookie 采集。
- 后端不引入独立 Node BFF 进程；Rust `music_platform` 模块 + Tauri Command 直连。
- Cookie 判定、字段优先级、`playbackKeyReady` 语义与 `MUSIC_PLATFORM_INTEGRATION.md` §2、§4.1 保持一致。

---

## 3. 新增文件清单（均为独立新建，禁止改复用现有 HTML）

### 3.1 前端

| 文件 | 说明 |
|------|------|
| `frontend/music-platform-login.html` | 登录管理窗入口页（唯一 HTML 入口） |
| `frontend/src/musicPlatformLogin.js` | 管理窗逻辑：状态刷新、网易 QR、触发 QQ 登录、登出 |
| `frontend/src/style.css` | 追加 `.music-platform-login-*` 样式块（或同文件内 scoped section） |

**禁止**：把登录 UI 塞进 `settings.html`、`window-manager.html` 或任何已有页面。

### 3.2 Rust

| 文件 | 说明 |
|------|------|
| `src-tauri/src/music_platform/mod.rs` | 模块入口、Cookie 路径、公共类型 |
| `src-tauri/src/music_platform/cookie_store.rs` | 读写 `.cookie` / `.qq-cookie` |
| `src-tauri/src/music_platform/netease.rs` | 网易 QR / status / logout |
| `src-tauri/src/music_platform/qq.rs` | QQ status / logout / Cookie 解析 |
| `src-tauri/src/music_platform/qq_login.rs` | External WebView 生命周期 + macOS Cookie 轮询 |

### 3.3 配置改动

| 文件 | 改动 |
|------|------|
| `frontend/vite.config.js` | `rollupOptions.input` 增加 `musicPlatformLogin` 入口 |
| `src-tauri/capabilities/default.json` | `windows` 增加 `music-platform-login`、`qq-music-login` |
| `src-tauri/src/main.rs` | `mod music_platform`、托盘项、窗口打开、`invoke_handler` |
| `src-tauri/Cargo.toml` | 视选型增加 `ncm-api-rs` 或保留纯 `reqwest`；macOS 增加 `objc2-web-kit` 等 |

---

## 4. 系统托盘集成

### 4.1 菜单项

在 `src-tauri/src/main.rs` 托盘 `MenuBuilder` 中，于「窗口管理…」与「新建浮层频谱窗口」之间插入：

```text
.text(TRAY_MENU_MUSIC_LOGIN, "登录音乐平台…")
```

常量建议：

```rust
const TRAY_MENU_MUSIC_LOGIN: &str = "tray_music_login";
const MUSIC_PLATFORM_LOGIN_LABEL: &str = "music-platform-login";
const QQ_MUSIC_LOGIN_LABEL: &str = "qq-music-login";
```

### 4.2 打开登录管理窗

参照 `open_esp_display_settings_window_impl` / `open_window_manager_impl` 模式：

- 已存在则 `show` + `unminimize` + `set_focus`
- 不存在则 `WebviewWindowBuilder` 创建：
  - `label`: `music-platform-login`
  - `url`: `WebviewUrl::App("music-platform-login.html".into())`
  - `title`: `WaveDance 音乐平台登录`
  - `inner_size`: `(520.0, 640.0)`（可微调）
  - `decorations`: `true`，`center`: 隐式居中
- `on_window_event(Destroyed)` 时调用 `sync_app_activation_policy`
- macOS：`configure_window_manager_level` 或同等辅助窗层级（与普通设置窗一致）

### 4.3 托盘事件

```rust
} else if event.id() == TRAY_MENU_MUSIC_LOGIN {
    let _ = open_music_platform_login_window_from_tray(app);
}
```

---

## 5. 登录管理窗 UI（`music-platform-login.html`）

### 5.1 页面结构

```text
┌─ WaveDance 音乐平台登录 ─────────────────────────────┐
│  Header：标题 + 副标题「管理 QQ 音乐与网易云音乐账号」      │
├────────────────────────────────────────────────────────┤
│  【网易云音乐】                                          │
│    状态徽章：未登录 | 已登录 | 登录中                      │
│    [二维码 img]  或  「等待扫码…」占位                     │
│    昵称 / 头像（已登录时）                                │
│    [刷新二维码]  [登出]                                   │
├────────────────────────────────────────────────────────┤
│  【QQ 音乐】                                             │
│    状态徽章 + playbackKeyReady 提示                      │
│    「未就绪播放授权」时显示警告文案（见 §6.4）              │
│    昵称 / 头像（已登录时）                                │
│    [QQ 音乐登录]  [登出]                                  │
│    说明：将打开独立窗口，请在网页中完成 QQ / 微信登录        │
└────────────────────────────────────────────────────────┘
```

### 5.2 前端行为

| 动作 | 实现 |
|------|------|
| 页面加载 | `invoke('music_platform_get_status')` 拉取双平台状态 |
| 网易 QR | `invoke('netease_qr_start')` → 展示 base64 图；`setInterval` 调 `netease_qr_poll` |
| 网易 803 | 停止轮询，刷新状态，toast「登录成功」 |
| 网易 800 | 自动重新 `netease_qr_start` |
| QQ 登录 | `invoke('qq_login_open_webview')` → Rust 打开 External 子窗 |
| QQ 登录完成 | 监听事件 `qq-login-finished` 或轮询 `music_platform_get_status` |
| 登出 | `invoke('netease_logout')` / `invoke('qq_logout')` |

### 5.3 样式约定

- `body` class：`settings-window music-platform-login-window`（复用 **CSS 变量与 card 组件类名**，但不复用 HTML 文件）
- 二维码区域固定宽高（如 200×200），居中
- QQ `playbackKeyReady === false` 时用 `.settings-hint--warn` 展示文档 §4.1 说明

---

## 6. QQ 音乐登录（内嵌 External + macOS 读 Cookie）

### 6.1 流程概览

```text
用户点击「QQ 音乐登录」
  → Rust 创建 qq-music-login 窗口（WebviewUrl::External）
  → 加载 https://y.qq.com/n/ryqq/profile
  → 启动后台轮询（1.2s）：WKHTTPCookieStore.getAllCookies
  → 过滤 qq.com 域，按优先级拼 Cookie 字符串
  → 判定：
       有 uin + playbackKey → 成功，关窗，持久化，emit qq-login-finished
       有 uin + musicKey 但无 playbackKey → 导航 warmup 至 player 页，继续轮询
       用户关窗且仅有账号态 → 持久化 partial，emit { partial: true }
```

### 6.2 External WebView 窗口参数

```rust
WebviewWindowBuilder::new(
    app,
    QQ_MUSIC_LOGIN_LABEL,
    WebviewUrl::External(
        "https://y.qq.com/n/ryqq/profile".parse().unwrap(),
    ),
)
.title("QQ 音乐登录")
.inner_size(960.0, 720.0)
.decorations(true)
.resizable(true)
.center()
.build()?;
```

**Session 隔离（必须）：**

- QQ 登录 Cookie **不得**写入主应用 WebView 的持久存储。
- 实现方式（择一，推荐 A）：
  - **A.** 为该窗口配置**独立** `data_directory`（Tauri 2 `WebviewWindowBuilder` 的 webview 数据目录），登录完成后可选清理该目录。
  - **B.** macOS 层创建 `WKWebsiteDataStore.nonPersistent()` 并绑定到该 WKWebView（需平台桥接，见 §6.3）。

### 6.3 macOS 原生读 Cookie

Tauri 未直接暴露 Cookie API，需在 `qq_login.rs` 中通过 **WKWebView → WKHTTPCookieStore** 读取。

**依赖建议（macOS target）：**

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2-web-kit = "0.3"
objc2-foundation = "0.3"
```

**核心步骤：**

1. 从 `qq-music-login` 窗口取得底层 `WKWebView`（通过 `wry` / Tauri 平台扩展或 `with_webview` 类 API；若 Tauri 2 无公开接口，在 `qq_login.rs` 用 `objc2` 从 `NSWindow.contentView` 向下查找 `WKWebView`）。
2. 调用 `webView.configuration.websiteDataStore.httpCookieStore.getAllCookies(completionHandler:)`。
3. 在 completion 中过滤：
   - 域：`qq.com`、`.qq.com`、`y.qq.com`、`qqmusic.qq.com` 及其子域
4. 按 `MUSIC_PLATFORM_INTEGRATION.md` §4.1 优先级拼 Header 字符串：

```text
uin, qqmusic_uin, wxuin, login_type, qm_keyst, qqmusic_key,
p_skey, skey, 微信 token 相关, p_uin, ptcz, RK
```

5. 解析字段（与文档 §2.2 一致）：

```rust
// uin：login_type == 2 时优先 wxuin
// musicKey：qm_keyst || qqmusic_key || music_key || p_skey || skey || ...
// playbackKey：qm_keyst || qqmusic_key || music_key || wxskey
```

**轮询：**

- 间隔：**1200ms**（与文档一致）
- 使用 `tauri::async_runtime` 或专用 thread + `AppHandle` 发事件
- 窗口 `Destroyed` / 用户点关闭时停止轮询

### 6.4 Warmup（播放票据）

当检测到 **账号态**（`uin` + `musicKey`）但 **无** `playbackKey`：

1. 在同一 External WebView 内执行导航：

```text
https://y.qq.com/n/ryqq/player
```

2. 继续 Cookie 轮询，直至出现 `qm_keyst` / `qqmusic_key` / `music_key` / `wxskey` 之一。
3. 管理窗 UI 在未就绪时显示：

```text
账号已同步，完整播放授权未就绪。请保持在播放器页稍候，或重新登录。
```

### 6.5 登录结束

| 场景 | 行为 |
|------|------|
| 完整授权 | 写 `.qq-cookie`，关 `qq-music-login`，`emit("qq-login-finished", { ok: true, playbackKeyReady: true })` |
| 仅账号态（用户关窗） | 写 Cookie，`emit(..., { ok: true, partial: true, playbackKeyReady: false })` |
| 超时（可选 10min） | 关窗，`emit(..., { ok: false, reason: "timeout" })` |

持久化后调用 `qq_login_status` 校验；资料接口 `code:1000` 时**不得**判未登录，昵称 / 头像从 Cookie 兜底（文档 §4.1）。

### 6.6 登出

- `GET` 逻辑：`qq_logout` Command → 删除 `.qq-cookie` → 可选清除 QQ 登录 WebView 数据目录
- 不调用 QQ 官方登出 HTTP（与文档一致，本地清空即可）

---

## 7. 网易云音乐登录（扫码）

### 7.1 依赖选型

推荐 `ncm-api-rs`（纯 Rust，含 QR 与 `login_status`）：

```toml
ncm-api-rs = "0.1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "time"] }
```

若暂不引入 crate，可按 `MUSIC_PLATFORM_INTEGRATION.md` §3.2 用 `reqwest` 直连三轮 QR 接口（工作量大，不推荐）。

### 7.2 Tauri Command 流程

| Command | 说明 |
|---------|------|
| `netease_qr_start` | `login_qr_key` + `login_qr_create(qrimg: true)` → 返回 `{ key, qrImgBase64, url }` |
| `netease_qr_poll` | `login_qr_check({ key })` → 返回 `{ code, message, ... }` |
| `netease_qr_finish` | code=803 时：若首次无 Cookie 则**不带 noCookie 重试一次**（文档 §3.2），写 `.cookie` |

**扫码状态码：** 801 等待 / 802 已扫待确认 / 803 成功 / 800 过期。

### 7.3 登录态

- `netease_login_status`：优先 `login_status({ cookie })`，失败降级 `user_account`
- 判定：`MUSIC_U` 存在即已登录（文档 §2.1）
- 返回：`loggedIn`, `userId`, `nickname`, `avatar`, `vipType`, `isVip`, `isSvip`

### 7.4 登出

- 调用官方 `logout({ cookie })`（可选），**必须**删除本地 `.cookie`

---

## 8. Cookie 存储

| 平台 | 文件名 | 目录 |
|------|--------|------|
| 网易云 | `.cookie` | `app.path().app_data_dir()?` |
| QQ 音乐 | `.qq-cookie` | 同上 |

**安全：**

- 禁止写入日志、禁止上传
- 文件权限跟随系统用户目录（无需 chmod 特殊处理）

**解析工具函数**（Rust，与文档 §2 一致）：

- `parse_cookie_header(&str) -> HashMap<String, String>`
- `netease_cookie_has_login(&str) -> bool`
- `qq_extract_uin / qq_extract_music_key / qq_extract_playback_key`

---

## 9. Tauri Command 一览

| Command | 参数 | 返回 | 平台 |
|---------|------|------|------|
| `open_music_platform_login_window` | 无 | `()` | macOS |
| `music_platform_get_status` | 无 | `{ netease: Status, qq: Status }` | macOS |
| `netease_qr_start` | 无 | `{ key, qrImgBase64 }` | macOS |
| `netease_qr_poll` | `{ key }` | `{ code, ... }` | macOS |
| `netease_logout` | 无 | `()` | macOS |
| `qq_login_open_webview` | 无 | `()` | macOS |
| `qq_login_close_webview` | 无 | `()` | macOS |
| `qq_logout` | 无 | `()` | macOS |

**事件（前端 `listen`）：**

| 事件名 | Payload |
|--------|---------|
| `qq-login-finished` | `{ ok, partial?, playbackKeyReady, nickname?, avatar?, error? }` |
| `netease-login-finished` | `{ ok, nickname?, avatar?, error? }` |

`invoke_handler` 中上述 Command 建议加 `#[cfg(target_os = "macos")]`。

---

## 10. `music_platform` Rust 模块结构

```text
music_platform/
├── mod.rs           # pub fn cookie_dir(app) -> PathBuf
├── cookie_store.rs  # read_netease / write_netease / read_qq / write_qq / clear_*
├── netease.rs       # qr_*, login_status, logout
├── qq.rs            # login_status (fcg_get_profile_homepage), logout, cookie 解析
└── qq_login.rs      # open_external_login_window, poll_cookies_macos, warmup_navigate
```

**状态结构体（Serialize，供前端）：**

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformLoginStatus {
    pub logged_in: bool,
    pub user_id: Option<String>,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    /// 仅 QQ
    pub playback_key_ready: Option<bool>,
    pub profile_unavailable: Option<bool>,
}
```

---

## 11. 实现顺序（推荐）

| 步骤 | 内容 | 验收 |
|------|------|------|
| 1 | `cookie_store.rs` + 路径单元测试 | 读写 `.cookie` / `.qq-cookie` |
| 2 | `music-platform-login.html` + JS 骨架 + vite 入口 | 托盘可打开空管理窗 |
| 3 | 网易 QR 全流程 + status / logout | 扫码后管理窗显示昵称 |
| 4 | QQ `qq.rs` status（读 Cookie 文件 + 资料接口） | 手动写入测试 Cookie 可显示状态 |
| 5 | QQ External WebView + macOS Cookie 轮询 | 网页登录后自动关窗并持久化 |
| 6 | Warmup 跳转 + `playbackKeyReady` UI | 正式曲目前 vkey 可用（后续音源阶段验证） |
| 7 | 事件推送、错误提示、重复打开去重 | 体验 polish |

---

## 12. 测试计划

### 12.1 手动测试

1. 托盘 →「登录音乐平台…」→ 管理窗出现且为独立 URL（`music-platform-login.html`）。
2. 网易：二维码展示 → 手机扫码 → 803 → 昵称显示 → 登出 → 状态未登录。
3. QQ：点登录 → External 窗打开 y.qq.com → QQ / 微信登录 → 自动关窗 → 管理窗显示已登录。
4. QQ：登录后检查 `.qq-cookie` 含 `uin` 与 `qm_keyst`（或等效 playbackKey）；`playbackKeyReady: true`。
5. QQ：仅完成账号态即关窗 → `partial: true`，UI 警告文案出现。
6. 重启 App → 两平台登录态仍保留。

### 12.2 调试命令（登录完成后）

```bash
# 在实现 status Command 后，可用日志或临时 CLI 验证 Cookie 文件非空
ls -la ~/Library/Application\ Support/com.wavedance.desktop/
```

音源 / vkey 联调见 `MUSIC_PLATFORM_INTEGRATION.md` §11。

---

## 13. 风险与对策

| 风险 | 对策 |
|------|------|
| Tauri 无公开 WKWebView Cookie API | macOS `objc2-web-kit` 桥接；封装为 `qq_login.rs` 单点，便于替换 |
| QQ 仅 `p_skey` 无播放票据 | warmup 播放器页；UI 明确 `playbackKeyReady` |
| QQ 资料接口 code:1000 | 不判掉线；Cookie 兜底昵称 / 头像 |
| 非官方接口变更 | 登录逻辑与 UI 解耦；Cookie 格式变更只改 `qq.rs` |
| External 窗误用主 Session | 必须独立 `data_directory` 或非持久 DataStore |
| 网易 QR 803 首次无 Cookie | 文档要求：803 时无 noCookie 重试 |

---

## 14. 与后续音源阶段的衔接

本方案仅交付**登录 + Cookie 持久化 + 状态展示**。后续在 `music_platform` 中扩展（见 `MUSIC_PLATFORM_INTEGRATION.md`）：

- `GET /api/song/url`、`GET /api/qq/song/url` → 对应 Tauri Command 或内嵌 Axum
- 歌词源接入 `LyricsFetcher` 作为可选 provider
- `/api/audio` 代理 → Rust `reqwest` 流式转发

登录窗与上述能力**无 UI 耦合**；Cookie 文件路径与字段约定保持不变。

---

## 15. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-28 | 初版：托盘独立登录窗、QQ External+macOS Cookie 一次性方案、网易 QR |
