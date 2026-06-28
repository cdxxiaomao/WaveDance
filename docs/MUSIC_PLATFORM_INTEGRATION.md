# 网易云 / QQ 音乐平台集成技术文档

> 面向跨项目复用。说明如何对接**网易云音乐**与 **QQ 音乐**的登录、音源解析与歌词获取。  
> 文档自包含，不依赖任何特定仓库目录或源文件。  
> 更新日期：2026-06-28

---

## 1. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│  客户端（Web / Electron / 移动端壳）                          │
│  - 登录 UI / 播放队列 / 歌词展示                              │
│  - 按 provider（netease / qq）分流 API 调用                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP（建议 localhost BFF）
┌───────────────────────────▼─────────────────────────────────┐
│  本地 BFF 服务                                                │
│  - Cookie 持久化（网易 / QQ 各一份）                           │
│  - 封装 NeteaseCloudMusicApi + QQ 网页 / musicu 接口          │
│  - 音频代理接口（Referer + Range）                             │
└───────────────┬─────────────────────────┬─────────────────────┘
                │                         │
     NeteaseCloudMusicApi          QQ 官方网页接口
     (music.163.com)               (y.qq.com / c.y.qq.com / u.y.qq.com)
```

**设计要点：**

- 两个平台**独立 Cookie**，互不影响，可同时登录。
- 歌单 / 搜索只返回**元数据**；真正播放时再请求**音源 URL**。
- 客户端 `<audio>` 建议不直连 CDN，统一走 **音频代理接口**，解决 Referer / CORS / Range 问题。
- Electron 桌面端可通过内嵌浏览器获取 Cookie；纯 Web 环境可用手动粘贴 Cookie 或网易云 QR 接口。

**建议的本地 API 前缀：** `/api/`（网易）、`/api/qq/`（QQ）、`/api/audio`（代理）。下文均以此为例，可按项目自行调整路径。

---

## 2. Cookie 存储

| 平台 | 建议环境变量 | 建议存储位置 | 关键字段 |
|------|--------------|--------------|----------|
| 网易云 | `COOKIE_FILE` | 用户数据目录 `.cookie` | **`MUSIC_U`**（必须） |
| QQ 音乐 | `QQ_COOKIE_FILE` | 用户数据目录 `.qq-cookie` | **`uin`** + 登录票据 |

Electron 打包后 Cookie 建议存于 `app.getPath('userData')` 下。

### 2.1 网易云 Cookie 判定

```javascript
function parseCookieHeader(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach(part => {
    const raw = part.trim();
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  });
  return out;
}

function neteaseCookieHasLogin(cookieText) {
  return !!parseCookieHeader(cookieText).MUSIC_U;
}
```

登录窗口导出 Cookie 时，建议按优先级保留：`MUSIC_U`, `__csrf`, `NMTID`, `MUSIC_A`, `JSESSIONID-WYYY` 等。

### 2.2 QQ 音乐 Cookie 判定（两层）

QQ 存在**账号态**与**播放授权**两个层次：

| 层次 | 判定条件 | 可用 Cookie 字段 | 能力 |
|------|----------|------------------|------|
| 账号态 | 有 uin + 任一 musicKey | `qm_keyst`, `qqmusic_key`, `music_key`, **`p_skey`**, `skey`, 微信 token 等 | 资料、歌单、部分接口 |
| 播放授权 | 有 uin + 播放票据 | **`qm_keyst`**, **`qqmusic_key`**, **`music_key`**, `wxskey` | vkey 换链、正式曲目播放 |

> **重要**：仅有 `p_skey` 时歌单可读，但 vkey 常返回 `104003`。登录流程在拿到账号态后，应 warmup 跳转 `https://y.qq.com/n/ryqq/player` 等待播放票据写入。

**UIN 提取：**

```javascript
// login_type === 2 表示微信登录，优先 wxuin
const raw = Number(obj.login_type) === 2
  ? (obj.wxuin || obj.uin || obj.p_uin)
  : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin);
const uin = String(raw).replace(/\D/g, '').replace(/^0+/, '') || raw;
```

**musicKey（账号态）提取：**

```javascript
const musicKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
  obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
```

**playbackKey（播放授权）提取：**

```javascript
const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
```

**昵称 / 头像兜底（资料接口失败时）：**

- 昵称：从 `ptnick_<uin>` 等 Cookie 字段解码
- 头像：`https://q1.qlogo.cn/g?b=qq&nk=<uin>&s=100`

---

## 3. 网易云音乐

### 3.1 依赖

```javascript
const {
  login_qr_key, login_qr_create, login_qr_check,
  login_status, user_account, logout,
  song_url, song_url_v1,
  lyric, lyric_new,
  search,
} = require('NeteaseCloudMusicApi');
```

所有受保护接口调用时传入 `cookie: userCookie`。

### 3.2 登录方式

#### 方式 A：扫码登录（API 三轮，适合无 Electron 环境）

| 步骤 | 本地 API | 上游调用 | 说明 |
|------|----------|----------|------|
| 1 | `GET /api/login/qr/key` | `login_qr_key()` | 获取 `unikey` |
| 2 | `GET /api/login/qr/create?key=<unikey>` | `login_qr_create({ key, qrimg: true })` | 返回 base64 二维码 `img`、`url` |
| 3 | 轮询 `GET /api/login/qr/check?key=<unikey>` | `login_qr_check({ key })` | 见状态码表 |

**扫码状态码：**

| code | 含义 |
|------|------|
| 801 | 等待扫码 |
| 802 | 已扫，待手机确认 |
| 803 | 授权成功 → 持久化 Cookie |
| 800 | 二维码过期 |

803 成功后响应建议包含：`loggedIn`, `nickname`, `avatar`, `hasCookie`。

**803 处理注意：** 首次 `login_qr_check` 可能带 `noCookie: true` 拿不到 Cookie，803 时应再请求一次不带 `noCookie` 的重试。

#### 方式 B：Electron 内嵌浏览器（推荐桌面端）

1. 使用独立 session partition（如 `persist:your-app-netease-login`）
2. 打开 `https://music.163.com/#/login`
3. 每 1～2 秒轮询读取 `.163.com` / `.music.163.com` 域 Cookie，拼成 `Cookie` 请求头
4. 客户端 `POST /api/login/cookie`，body: `{ "cookie": "<Cookie字符串>" }`
5. 服务端校验 `MUSIC_U` 存在后持久化

#### 方式 C：手动粘贴 Cookie

同方式 B 的第 4 步，跳过 Electron 窗口。

#### 登录态查询

- **API：** `GET /api/login/status`
- **上游：** 优先 `login_status({ cookie })`，失败降级 `user_account({ cookie })`
- **返回字段：** `loggedIn`, `userId`, `nickname`, `avatar`, `vipType`, `vipLevel`, `isVip`, `isSvip`

#### 登出

- **API：** `GET /api/logout`
- 调用官方 `logout({ cookie })` 并清空本地 Cookie 文件

### 3.3 获取音源 URL

**本地 API：** `GET /api/song/url?id=<songId>&quality=<level>`

**音质档位（从高到低尝试，失败则降级）：**

| quality 参数 | level | 比特率 br | 说明 |
|--------------|-------|-----------|------|
| jymaster | jymaster | 1999000 | 超清母带，需 SVIP |
| hires | hires | 1999000 | 高清臻音 |
| lossless | lossless | 1411000 | 无损 |
| exhigh | exhigh | 999000 | 极高 320k |
| standard | standard | 128000 | 标准 128k |

**请求逻辑：**

1. 按用户请求音质生成候选列表（仅 SVIP 含 jymaster）
2. 对每个档位：优先 `song_url_v1({ id, level, cookie })`，失败则 `song_url({ id, br, cookie })`
3. 有 `url` 且无 `freeTrialInfo` → 完整可播
4. 仅有试听 → 返回 `trial: true`（仍给 URL，但是片段）
5. 全部失败 → 返回 `playable: false` + `restriction` 分类

**成功响应示例：**

```json
{
  "url": "https://m7.music.126.net/...",
  "trial": false,
  "playable": true,
  "level": "lossless",
  "quality": "无损",
  "br": 1411000,
  "requestedQuality": "hires"
}
```

**音源本质：** 网易云 CDN（`*.music.126.net` 等），URL 由官方 API 按 Cookie + 版权动态签发。

### 3.4 获取歌词

**本地 API：** `GET /api/lyric?id=<songId>`

**上游逻辑：**

1. 优先 `lyric_new({ id, cookie })` — 可含 YRC 逐字歌词
2. 无有效内容则降级 `lyric({ id, cookie })`

**响应字段：**

| 字段 | 格式 | 说明 |
|------|------|------|
| `lyric` | LRC `[mm:ss.xx]文本` | 标准歌词 |
| `tlyric` | LRC | 翻译歌词 |
| `yrc` | YRC 逐字 `[startMs,durMs](wordStart,wordDur,0)字...` | 卡拉 OK 级 |
| `source` | `lyric_new` / `lyric` | 实际使用的接口 |

**客户端解析建议：**

- LRC：正则匹配 `[分:秒.毫秒]` 时间戳
- YRC：解析行级 `[startMs,durMs]` 与字级 `(start,dur,0)字`
- 显示优先级：YRC 逐字 > YRC 行 > LRC > 歌名-歌手兜底

---

## 4. QQ 音乐

QQ 音乐**不使用**官方公开 SDK，直接调用网页版内部接口。分两类：

- **fcg-bin GET 接口**（歌单、资料、legacy 歌词）
- **musicu.fcg POST 接口**（vkey、歌词、歌曲详情、搜索补全）

**公共请求头：**

```javascript
const QQ_HEADERS = {
  Referer: 'https://y.qq.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
// 有 Cookie 时附加 Cookie 头
```

**musicu 入口：**

```text
POST https://u.y.qq.com/cgi-bin/musicu.fcg
Content-Type: application/json;charset=UTF-8

Body 示例:
{
  "comm": { "uin": "123456", "format": "json", "ct": 19, "cv": 0, "authst": "<musicKey>" },
  "req_0": {
    "module": "vkey.GetVkeyServer",
    "method": "CgiGetVkey",
    "param": { ... }
  }
}
```

响应可能是纯 JSON 或 `callback(...)` 包裹，需去壳：

```javascript
function parseJSONText(text) {
  const raw = String(text || '').trim();
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, '$1');
  return JSON.parse(json);
}
```

### 4.1 登录方式

#### 方式 A：Electron 内嵌浏览器（推荐）

1. 独立 session partition（如 `persist:your-app-qqmusic-login`）
2. 打开 `https://y.qq.com/n/ryqq/profile`
3. 每 1.2s 轮询 `.qq.com` 域 Cookie，按字段优先级拼 Header
4. **完整播放授权**：检测到 `qm_keyst` / `qqmusic_key` / `music_key` / `wxskey` → 关闭窗口，返回 Cookie
5. **仅账号态**：有 `p_skey` 等但无播放票据 → 跳转 `https://y.qq.com/n/ryqq/player` warmup，继续等待
6. 用户手动关窗但只有账号态 → 返回 `{ ok: true, cookie, partial: true }`

**Cookie 域过滤：** 接受 `qq.com`、`.qq.com`、`qqmusic.qq.com` 及其子域。

**Cookie 导出优先级（建议顺序）：**

`uin`, `qqmusic_uin`, `wxuin`, `login_type`, `qm_keyst`, `qqmusic_key`, `p_skey`, `skey`, 微信相关 token, `p_uin`, `ptcz`, `RK`

#### 方式 B：手动粘贴 Cookie

**API：** `POST /api/qq/login/cookie`

```json
{ "cookie": "uin=123456; qm_keyst=xxx; qqmusic_key=yyy; ..." }
```

校验：`uin` 与 `musicKey` 均非空，否则返回 400，`error: INVALID_QQ_COOKIE`。

#### 登录态查询

**API：** `GET /api/qq/login/status`

**上游：** `GET https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg`（带 Cookie）

参数示例：`cid=205360838`, `userid=<uin>`, `loginUin=<uin>`, `format=json`, `platform=yqq.json`

**注意：** 资料接口返回 `code:1000` 时**不要**直接判未登录，应从 Cookie 兜底昵称 / 头像。

**响应字段：**

| 字段 | 说明 |
|------|------|
| `loggedIn` | 有 uin + musicKey |
| `userId` | QQ uin |
| `nickname` / `avatar` | 资料接口或 Cookie 兜底 |
| **`playbackKeyReady`** | 是否有播放票据（`qm_keyst` 等） |
| `profileUnavailable` | 资料接口不可用但 Cookie 仍有效 |

#### 登出

**API：** `GET /api/qq/logout` → 清空 QQ Cookie 文件

### 4.2 获取音源 URL

**本地 API：** `GET /api/qq/song/url?mid=<songmid>&mediaMid=<media_mid>&quality=<level>`

**必需参数：**

| 参数 | 来源 | 说明 |
|------|------|------|
| `mid` / `songmid` | 歌单 / 搜索 | 歌曲 MID，如 `0039MnYb0AkGu8` |
| `mediaMid` | 曲目 `file.media_mid` / `strMediaMid` | 文件级 MID，换 vkey 更准确 |

**步骤：**

1. 从 Cookie 读取 `uin`, `musicKey`, `playbackKey`
2. 按音质拼文件名候选（`mediaMid` 优先，其次 `songmid`）：

| quality | 文件名前缀 | 扩展名 | 说明 |
|---------|-----------|--------|------|
| hires | RS01 | .flac | Hi-Res |
| lossless | F000 | .flac | 无损 |
| exhigh | M800 | .mp3 | 320k |
| standard | M500 | .mp3 | 128k |
| aac | C400 | .m4a | AAC |

3. POST musicu，`CgiGetVkey` 请求体示例：

```javascript
{
  comm: {
    uin: '<uin>',
    format: 'json',
    ct: musicKey ? 19 : 24,
    cv: 0,
    authst: musicKey || undefined
  },
  req_0: {
    module: 'vkey.GetVkeyServer',
    method: 'CgiGetVkey',
    param: {
      guid: '<8位随机数>',
      songmid: ['<songmid>', ...],      // 与 filename 数组等长
      songtype: [0, ...],
      uin: '<uin>',
      loginflag: 1,
      platform: '20',
      filename: ['F000<mediaMid>.flac', 'M800<mediaMid>.mp3', ...]
    }
  }
}
```

4. 从 `req_0.data.midurlinfo` 找第一个有 `purl` 的项
5. 最终 URL = `data.sip[0]` + `purl`（默认 sip: `https://ws.stream.qqmusic.qq.com/`）

**成功响应：**

```json
{
  "provider": "qq",
  "url": "https://ws.stream.qqmusic.qq.com/<signed_path>",
  "playable": true,
  "trial": false,
  "level": "lossless",
  "quality": "无损 FLAC",
  "filename": "F000xxx.flac"
}
```

**失败响应关键字段：**

| 字段 | 说明 |
|------|------|
| `qqCode` | 如 `104003` — 版权 / 授权 / 会员 |
| `playbackKeyReady` | false 且 104003 → 应提示重新登录授权 |
| `reason` | `login_required` / `copyright_unavailable` / `paid_required` 等 |
| `tried` | 已尝试的文件名列表 |

**音源本质：** QQ 音乐流媒体 CDN（`ws.stream.qqmusic.qq.com` 等），带时效签名。

### 4.3 获取歌词

**本地 API：** `GET /api/qq/lyric?mid=<songmid>&id=<qqSongId>`

至少传 `mid` 或数字 `id` 之一。双通道 fallback：

#### 通道 1：musicu（主）

```javascript
POST https://u.y.qq.com/cgi-bin/musicu.fcg
{
  "comm": { "ct": 24, "cv": 0 },
  "lyric": {
    "module": "music.musichallSong.PlayLyricInfo",
    "method": "GetPlayLyricInfo",
    "param": { "songMID": "<mid>", "songID": <数字id，可选> }
  }
}
```

返回字段：`lyric`, `trans`（翻译）, `qrc`（QRC 逐字）, `roma`（罗马音）

#### 通道 2：legacy fcg（备用）

```text
GET https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg
  ?songmid=<mid>
  &songtype=0
  &format=json
  &nobase64=1
  &g_tk=5381
  &loginUin=<uin>
  &hostUin=0
  &platform=yqq.json
  &needNewCode=0
Referer: https://y.qq.com/portal/player.html
Cookie: <qq cookie>
```

musicu 无歌词时使用。响应字段：`lyric`, `trans` / `tlyric`

**文本解码：**

1. HTML 实体反转（`&apos;` → `'`, `&amp;` → `&` 等）
2. 若内容像 Base64 且不以 `[` 开头，尝试 Base64 解码为 UTF-8

**响应示例：**

```json
{
  "provider": "qq",
  "mid": "0039MnYb0AkGu8",
  "id": "123456789",
  "lyric": "[00:12.34]歌词行...",
  "tlyric": "翻译...",
  "qrc": "QRC逐字内容",
  "roma": "",
  "source": "qq-musicu"
}
```

客户端对 QQ 歌词通常先走 LRC 解析；`qrc` 可按需扩展逐字展示。

### 4.4 歌单（完整链路参考）

#### 用户歌单列表

**本地 API：** `GET /api/qq/user/playlists`

并行请求两个上游接口（均需 Cookie + `Referer: https://y.qq.com/portal/profile.html`）：

| 类型 | 上游 URL | 关键参数 | 响应列表字段 |
|------|----------|----------|--------------|
| 自建歌单 | `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss` | `hostuin`, `loginUin`, `sin=0`, `size=200` | `data.disslist` |
| 收藏歌单 | `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg` | `userid`, `reqtype=3`, `cid=205360956` | `data.cdlist` |

合并去重后映射为统一结构：`id`（dissid）, `name`, `cover`, `trackCount`, `creator`

#### 歌单曲目

**本地 API：** `GET /api/qq/playlist/tracks?id=<disstid>`

**上游：**

```text
GET https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg
  ?type=1&utf8=1&disstid=<id>&loginUin=<uin>&format=json&platform=yqq.json
Referer: https://y.qq.com/n/yqq/playlist
```

曲目在 `cdlist[0].songlist`，映射后需保留：

| 字段 | 用途 |
|------|------|
| `mid` / `songmid` | 音源、歌词 |
| `mediaMid` | 音源（vkey 文件名） |
| `qqId` | 歌词 numeric id |
| `name`, `artist`, `album`, `cover`, `duration` | 展示 |

---

## 5. 音频代理（两平台共用）

**本地 API：** `GET /api/audio?url=<encoded_cdn_url>`

**作用：**

- 附加正确 Referer（QQ → `https://y.qq.com/`，网易 → `https://music.163.com/`）
- 转发客户端 `Range` 头，支持进度拖动
- 设置 `Access-Control-Allow-Origin: *`（若需 Web Audio 分析）
- 按 URL 后缀推断 `Content-Type`（flac / mp3 / m4a 等）

**客户端播放：**

```javascript
audio.src = '/api/audio?url=' + encodeURIComponent(cdnUrl);
```

---

## 6. 播放失败与换源策略

**建议的容错链：**

```text
请求音源 URL
  ├─ QQ：降音质重试 (hires → lossless → exhigh → standard)
  ├─ 跨平台换源：在另一平台搜「同名 + 同歌手」→ 替换当前曲目重播
  └─ 仍失败：展示 restriction.message；login_required 时引导重新登录
```

**restriction.category 对照：**

| category | 含义 | 建议动作 |
|----------|------|----------|
| `login_required` | 未登录或 QQ 缺播放票据 | 重新登录 |
| `trial_only` | 仅试听（网易） | 提示 VIP |
| `vip_required` / `paid_required` | 会员 / 付费 | 提示升级或换源 |
| `copyright_unavailable` | 版权限制 | 换源或跳过 |
| `url_unavailable` | 无 URL | 换源或跳过 |

**跨平台换源逻辑：**

1. 判定当前 `provider`（`qq` 或 `netease`）
2. 在另一平台搜索：`歌名 + 歌手`
3. 匹配规则：歌名规范化后相同，且歌手名有交集
4. 找到则替换当前曲目元数据，用新 provider 重新请求音源

---

## 7. 本地 API 速查表

### 网易云

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/login/qr/key` | 二维码 unikey |
| GET | `/api/login/qr/create?key=` | 二维码图片 |
| GET | `/api/login/qr/check?key=` | 扫码轮询 |
| POST | `/api/login/cookie` | 保存 Cookie `{ cookie }` |
| GET | `/api/login/status` | 登录态 |
| GET | `/api/logout` | 登出 |
| GET | `/api/song/url?id=&quality=` | 音源 URL |
| GET | `/api/lyric?id=` | 歌词 |
| GET | `/api/search?keywords=&limit=` | 搜索 |
| GET | `/api/audio?url=` | 音频代理 |

### QQ 音乐

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/qq/login/cookie` | 保存 Cookie `{ cookie }` |
| GET | `/api/qq/login/status` | 登录态 + playbackKeyReady |
| GET | `/api/qq/logout` | 登出 |
| GET | `/api/qq/song/url?mid=&mediaMid=&quality=` | 音源 URL |
| GET | `/api/qq/lyric?mid=&id=` | 歌词 |
| GET | `/api/qq/search?keywords=&limit=` | 搜索 |
| GET | `/api/qq/user/playlists` | 用户歌单 |
| GET | `/api/qq/playlist/tracks?id=` | 歌单曲目 |
| GET | `/api/audio?url=` | 音频代理（共用） |

---

## 8. 实现清单

### 8.1 最小可用（播放单曲）

- [ ] 本地 HTTP BFF + JSON API
- [ ] 双平台 Cookie 文件读写
- [ ] 网易：`song_url_v1` → `/api/song/url`
- [ ] QQ：`CgiGetVkey` → `/api/qq/song/url`
- [ ] `/api/audio` 代理
- [ ] 客户端按 `provider` 分流

### 8.2 登录

- [ ] 网易：QR 三轮 **或** Electron 内嵌页 + `/api/login/cookie`
- [ ] QQ：Electron 内嵌页 + 播放器页 warmup **或** 手动 Cookie
- [ ] QQ 响应中带 `playbackKeyReady`，UI 区分「账号已同步」与「可完整播放」

### 8.3 歌词

- [ ] 网易：`lyric_new` → `lyric` fallback
- [ ] QQ：`GetPlayLyricInfo` → `fcg_query_lyric_new` fallback
- [ ] LRC 解析器；可选 YRC / QRC 逐字

### 8.4 建议一并实现

- [ ] 音质参数 + 自动降级
- [ ] `restriction` 错误分类与用户提示
- [ ] 跨平台换源
- [ ] QQ 登录态定时刷新（建议 45s 轮询 status）

---

## 9. QQ 音乐排障要点

| 症状 | 根因 | 处理 |
|------|------|------|
| 顶部显示 QQ 账号但很快变未登录 | 资料接口 `code:1000`，误判掉线 | 有 Cookie 昵称 / 头像时不应判 stale |
| 歌单可读但正式歌曲播不了 | 只有 `p_skey`，缺播放票据 | 重新跑登录 + warmup 播放器页 |
| vkey 返回 `104003` 且无 `purl` | 缺 `qm_keyst` 等 **或** 版权 / 会员限制 | 先看 `playbackKeyReady`，false 则重新授权 |
| 部分非正式曲可播、正式曲不可播 | 播放授权不完整 | 同上 |
| `/api/qq/song/url` 对部分曲有效 | `mediaMid` 与 `songmid` 应用不同 filename | 两个参数都应尝试 |

**排障顺序：**

1. 检查本地 QQ Cookie 文件是否含 `qm_keyst` / `qqmusic_key` / `music_key` / `wxskey`
2. 调 `/api/qq/login/status`，确认 `loggedIn`、`playbackKeyReady`、昵称、头像
3. 调 `/api/qq/song/url?mid=...&mediaMid=...&quality=highest`，看 `qqCode`、`reason`、`playbackKeyReady`
4. `playbackKeyReady=false` 且 `qqCode=104003` → 优先重新登录，不要先改播放器逻辑
5. `playbackKeyReady=true` 仍大量 104003 → 再判断版权、会员、换源策略

---

## 10. 注意事项

1. **非官方 SDK**：QQ 接口来自网页版，可能随官方改版失效；需预留 fallback 与监控。
2. **Cookie 安全**：Cookie 等同账号凭证，勿上传公网、勿写入日志。
3. **版权与会员**：接口只负责按登录态取链；能否播放取决于平台版权策略。
4. **User-Agent / Referer**：QQ 请求必须带 `Referer: https://y.qq.com/`，否则易空响应。
5. **Electron**：内嵌登录依赖 `session.fromPartition` 隔离 Cookie；纯 Node / Web 改用手动 Cookie 或网易 QR。
6. **npm 依赖**：网易侧推荐 [`NeteaseCloudMusicApi`](https://www.npmjs.com/package/NeteaseCloudMusicApi)；QQ 侧自行封装 HTTP 即可。

---

## 11. 调试示例

将 `BASE` 替换为本地 BFF 地址（如 `http://127.0.0.1:3000`）。

```bash
# 网易登录态
curl "$BASE/api/login/status"

# QQ 登录态（关注 playbackKeyReady）
curl "$BASE/api/qq/login/status"

# 网易音源
curl "$BASE/api/song/url?id=SONG_ID&quality=hires"

# QQ 音源
curl "$BASE/api/qq/song/url?mid=SONGMID&mediaMid=MEDIAMID&quality=hires"

# 网易歌词
curl "$BASE/api/lyric?id=SONG_ID"

# QQ 歌词
curl "$BASE/api/qq/lyric?mid=SONGMID&id=QQ_NUMERIC_ID"

# QQ 歌单列表（需已登录）
curl "$BASE/api/qq/user/playlists"

# QQ 歌单曲目
curl "$BASE/api/qq/playlist/tracks?id=DISSTID"
```
