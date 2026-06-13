# WaveDance → ESP32 外接屏显示 — 技术方案（方案 B）

> **文档类型**：实现指导手册（Agent / 开发者跨会话接力用）  
> **创建日期**：2026-06-12  
> **状态**：方案设计阶段；传输已定为 **USB Type-C 串口**（不用 WiFi）  
> **关联文档**：`PROJECT_CONTEXT.md` | `docs/VISUALIZATION_MODES_PLAN.md` | `src/audio_processing/mod.rs`

---

## 1. 目标与范围

### 1.1 目标

在 **ESP32-C3 + 自带屏幕** 开发板上，实时展示与 WaveDance 桌面端 **同源** 的音频可视化效果。  
Mac 负责音频采集与 FFT 分析；ESP32 **仅接收频谱帧并绘制**，不在板上重复做音频处理。

### 1.2 范围内

- WaveDance Rust 后端：在现有采集线程旁路推送频谱数据
- 传输层：**USB Type-C 串口**（用户确认不用 WiFi）；Mac 经 CDC 写二进制帧，ESP32 读串口
- ESP32 固件：串口接收、解码、2D 频谱绘制（柱状 / VU / 示波器 / 圆形）；**无需 WiFi 配网**
- 设置页：外接屏开关、**串口路径**、波特率、推送帧率、ESP 专用分桶数

### 1.3 范围外（首版不做）

- ESP32 本地麦克风采集与 FFT（方案 A）
- 在 ESP32 上复刻 Three.js 高阶模式（等离子、液态球等）
- 多块 ESP32 同步、OTA、WiFi 无线推送（用户选用有线；无线列为后续可选 Phase）
- Windows / Linux 桌面端适配（当前 WaveDance 主平台为 macOS）

---

## 2. 现状基线

### 2.1 WaveDance 数据流（已有）

```
Mac 音频采集 (BlackHole / 麦克风)
  → FFT 2048 + 对数/线性分桶
  → WaveformFrame { peak, rms, points[], time_samples[] }
  → app.emit("waveform-frame")   // Tauri 事件，仅本机 WebView
  → frontend WebGL / Three.js 渲染
```

`WaveformFrame` 定义（`src/audio_processing/mod.rs`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `peak` | `f32` | 全局峰值，约 0~1 |
| `rms` | `f32` | 全局 RMS，约 0~1 |
| `points` | `Vec<f32>` | 归一化频谱桶，长度 = 分桶数（8~500，默认 256） |
| `time_samples` | `Vec<f32>` | 时域波形，归一化 [-1,1]，长度 512 |

频率语义：**索引 0 = 低频，末尾 = 高频**（与前端 `freqReversed` 显示选项一致）。

采集线程在 `src-tauri/src/main.rs` 的 `start_waveform_stream` 中，每读完一帧音频即 `emit` 一次，典型帧率约 **30~60 fps**（取决于设备缓冲与 FFT 耗时）。

### 2.2 ESP32-C3 约束

| 资源 | 典型值 | 设计约束 |
|------|--------|----------|
| CPU | 160 MHz 单核 RISC-V | 不做 FFT；只做串口读 + 绘图 |
| RAM | ~320 KB SRAM | 避免大 JSON；不用 WiFi/LWIP 可省约 50 KB |
| Flash | 4 MB 常见 | PlatformIO + Arduino 框架足够 |
| USB | Type-C CDC / USB-Serial-JTAG | 与 Mac 有线通信 + 供电；见 §4.1 |
| 屏幕 | 因板型而异 | 用户板：**0.42″ OLED 72×40**（见 §2.3）；另有 1.47″ 172×320 参考 |

### 2.3 目标硬件

#### 用户板（已确认 · 2026-06-13）

| 项目 | 规格 |
|------|------|
| SoC | ESP32-C3FH4 |
| 屏幕 | **0.42″ OLED，72 × 40** |
| 驱动 | SSD1306（U8g2） |
| 接口 | I2C SDA=**GPIO5**，SCL=**GPIO6** |
| 固件 | `esp32/oled-042/`，烧录 `./flash-oled-042.sh` |
| 频谱桶 | Mac 端建议 **16** |
| 模式 | BOOT 键切换 **BAR / VU** |

#### 参考板型：微雪 ESP32-C3-LCD-1.47（172×320，非本用户板）

用户购买链接（CapCut 种草/带货视频，常见为同款开发板开箱或 **SD 卡 GIF/图片播放** Demo）：

- [CapCut 分享](https://www.capcut.cn/view/7648198156656165401?t=1&id=7648213874436669976&channel=1)

该视频通常展示的是 **ESP32-C3 + 1.47″ 172×320 屏 + TF 卡槽** 套件（与微雪 [ESP32-C3-LCD-1.47](https://www.waveshare.com/esp32-c3-lcd-1.47.htm) / [SpotPear 同款](https://spotpear.com/wiki/ESP32-C3-LCD-1.47-inch-LCD-Screen-172x320-SD-Display.html) 一致）。**WaveDance 不走 SD 卡读图**；频谱由 Mac 经 **Type-C 串口** 推送；板载 SD 槽首版不用。

**官方资料（烧录与 BSP 以之为准）**：

| 资源 | 链接 |
|------|------|
| 微雪商品页 | https://www.waveshare.com/esp32-c3-lcd-1.47.htm |
| SpotPear Wiki / 用户指南 | https://spotpear.com/wiki/ESP32-C3-LCD-1.47-inch-LCD-Screen-172x320-SD-Display.html |
| 固件环境 | ESP-IDF **≥ 5.5.0** 或 Arduino + `GFX_Library_for_Arduino` |

#### 丝印 / 批次

```
ESP32-C3  382025  fh4p4j1050  je04mcj086
```

| 标识 | 解读 |
|------|------|
| `ESP32-C3` | 乐鑫 RISC-V Wi-Fi + BLE SoC |
| `fh4`（`fh4p4j1050`） | 芯片 **ESP32-C3FH4**：叠封 **4 MB Flash** |
| `382025` / `je04mcj086` | 生产周期码 / 工厂批次，非商品型号 |

#### 屏幕外形（用户确认）

**矩形屏 · 16 针 · 白光背光** → 锁定 **ESP32-C3-LCD-1.47 标准版**（微雪 / SpotPear 同款贴牌）。

| 项目 | 规格 |
|------|------|
| 参考 SKU | **ESP32-C3-LCD-1.47**（非 `-M` 带壳版、非 S3 的 RGB 背光 `-B` 版） |
| 尺寸 | 1.47″ 矩形 IPS，圆角竖屏 |
| 分辨率 | **172 × 320**（竖屏：宽 172、高 320） |
| 驱动 IC | **ST7789** 系列（厂商 Demo 亦见 ST7798 命名，以 BSP 为准） |
| 背光 | **白光 LED**（固定色温背光；背光经 IO 扩展器开关，非 RGB 彩灯） |
| 接口 | 4-wire SPI（屏体经板载走线至 CH32V003，非外接排线） |
| 主控 | ESP32-C3FH4，160 MHz，4 MB Flash |
| USB | Type-C（供电 + 串口下载） |
| 扩展排针 | 板边 **2.54 mm 双排排针**；用户称 **16 针**，厂商资料常标 **18PIN**（含多路 GND/3V3 或贴牌少标 2 路电源针，**不影响开发**） |
| 板载扩展 | CH32V003 IO 扩展、QMI8658 IMU、TF 卡槽（首版可视化不用） |

**与 RGB 版的区别**：ESP32-S3-LCD-1.47**B** 等型号带 acrylic RGB 灯；用户板为 **C3 + 白光屏**，无炫彩背光，频谱配色在软件里用 ST7789 像素色实现即可。

**16 针含义（便于对板）**：

| 常见说法 | 实际 |
|----------|------|
| 用户：16 针 | 板边一侧双排母座/排针，约 **2×8**，引出 ESP32-C3 GPIO 扩展 |
| 厂商：18PIN header | 同上物理座，计数含 **3V3 / GND** 等电源脚 |
| 屏体 FPC | 已焊死在 PCB 上，开发者 **无需** 单独接 8 线 SPI 屏排线 |

若板子上还有 **SD 卡槽 + BOOT/RESET 按键 + Type-C**，即与上表一致，可 100% 按 ESP32-C3-LCD-1.47 烧录厂商 Demo 验证。

#### 传输方式（用户确认）

**不使用 WiFi**；Mac 与开发板 **Type-C 数据线直连**，频谱数据走 **USB 串口（CDC）**。ESP 固件无需配网，RAM 占用更低；板子需通过 Type-C 供电并保持在 Mac 旁。

#### 重要：LCD 不经直连 GPIO

ESP32-C3-LCD-1.47 的屏幕、背光、部分按键由 **CH32V003 IO 扩展器** 控制，**不能像普通 SPI 屏那样自行填 TFT_eSPI 引脚表**。

固件显示层须：

1. **优先**：复用微雪/SpotPear 官方 BSP——`IO_EXTENSION_Init()` + `LCD_Init()`（ESP-IDF Demo）或 Arduino `GFX_Library_for_Arduino` + `lcd.begin()`  
2. 在 BSP 提供的 `gfx` 绘图接口上实现频谱（`fillRect` / `drawFastVLine` 等），**首版不上 LVGL 全屏 UI**  
3. ESP-IDF 版本要求：**V5.5.0+**（厂商文档约定）

#### 对可视化的布局建议（172×320 竖屏）

| 模式 | 布局 | 说明 |
|------|------|------|
| **bar**（默认） | 底边对齐竖柱，宽 172 | 约 32 桶 × 5 px，经典频谱 |
| **vu** | 中部双横条 | peak / rms 电平条 |
| **scope** | 全宽时域折线 | 高 320 方向为幅度 |
| **radial** | 可选 | 矩形屏次选；BOOT 键仍可切换 |

频谱桶默认 **32**（宽 172 下每柱约 5 px，含间隙）。

#### RAM 约束（较圆屏更紧）

全屏 RGB565 帧缓冲 = 172 × 320 × 2 ≈ **108 KB**，接近 C3 可用 SRAM 上限。

**首版策略**：

- **禁止**全屏双缓冲  
- 使用 BSP 直绘或 **逐柱 `fillRect`**，不维护整屏缓冲  
- 每帧仅重绘频谱区域（如底部 240 px 高），顶部可固定标题/状态栏  
- 桶数上限 **48**；示波器时域点 **128**

#### 其他候选（非本用户板，仅作兼容预留）

| 候选 | 屏幕 | 驱动 | 分辨率 |
|------|------|------|--------|
| A | 0.71″ 圆 | GC9D01 | 160×160 |
| C | 0.42″ OLED | SSD1306 类 | 72×40 等 |

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│  macOS · WaveDance (Tauri)                                  │
│                                                             │
│  采集线程 ──► WaveformFrame                                 │
│       │                                                     │
│       ├──► emit("waveform-frame")  → 本机 WebView（已有）   │
│       │                                                     │
│       └──► EspDisplayBridge（新增）                         │
│              · 节流 / 专用分桶 / 可选裁剪 time_samples      │
│              · USB 串口写入 WDFR 二进制帧                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ USB Type-C 数据线
                           │ /dev/cu.usbmodem*（CDC）
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ESP32-C3 固件 (esp32/)                                     │
│                                                             │
│  USB Serial 读 ──► 流式组帧 ──► 帧解码 ──► 渲染器           │
│                              │                              │
│                              ├── barRenderer（默认）        │
│                              ├── vuRenderer                 │
│                              ├── scopeRenderer              │
│                              └── radialRenderer             │
│                                         │                   │
│                                         ▼                   │
│                              TFT (ST7789 / 其他驱动)        │
└─────────────────────────────────────────────────────────────┘
```

**设计原则**：

1. **单写多读**：采集线程产出帧后，桥接层与 Tauri emit **共用同一份 `WaveformFrame`**，避免重复 FFT。
2. **ESP 专用通道参数**：外接屏使用独立分桶数（建议默认 **32**），与桌面 256 桶解耦，降低带宽与 ESP 算力。
3. **有损可接受**：首版可不传 `time_samples`（示波器模式开启时才传）；静默时发零帧或降频。

---

## 4. 通信协议设计

### 4.1 传输方式选型

| 方式 | 优点 | 缺点 | 本方案 |
|------|------|------|--------|
| **USB Type-C 串口** | 免配网、低延迟、带宽够、不占 WiFi | 需数据线；距 Mac 近 | **用户选用 · 默认** |
| UDP / WiFi | 可无线摆放 | 需同网段、配 IP、占 ESP RAM | 后续可选 Phase |
| WebSocket | 双向控制 | 实现更重 | 不做 |

**用户决策**：不使用 WiFi，**Type-C 直连 Mac**。

#### 4.1.1 USB 物理层（ESP32-C3-LCD-1.47）

| 项目 | 说明 |
|------|------|
| 接口 | 板载 Type-C，集成 **USB 全速串口**（ESP32-C3 **USB Serial/JTAG**） |
| Mac 设备名 | 常见 `/dev/cu.usbmodem*` 或 `/dev/cu.usbserial*`（以系统「串口」或 `ls /dev/cu.*` 为准） |
| 供电 | 由 Mac USB 供电；推送时板子需一直插着线 |
| 波特率 | 协议层建议 **921600**（115200 也够用）；原生 USB CDC 下波特率常为「名义值」，两端一致即可 |
| 带宽 | 默认 56 B × 30 fps ≈ **1.7 KB/s**；921600 bps 远超需求 |

#### 4.1.2 串口流式组帧（相对 UDP 的额外约定）

UDP 以包为界；串口是**字节流**，沿用 §4.2 的 WDFR 帧格式，ESP 侧按下列步骤解帧：

1. 在缓冲中查找魔数 `0x57444652`（对齐到帧头）  
2. 读满 **20 字节头**，解析 `point_count`（N）、`time_count`（M）  
3. 帧总长 `L = 20 + N + M`（`HAS_TIME` 时含 M 字节时域）  
4. 缓冲凑满 L 字节 → 校验 version → 交付渲染；不足则等待下一批 `read`  
5. 脏数据：丢弃至下一个魔数

**无需**额外 COBS/SLIP 封装（帧头含长度语义且帧很短）；若实测粘包异常，可在帧尾加可选 `0x0A` 换行作弱分隔（Phase 4 再定）。

#### 4.1.3 使用注意

- **烧录 vs 运行**：烧录完成后固件进入「串口接收模式」；WaveDance 打开**同一串口**写数据。运行中不宜再开 Arduino Serial Monitor（会抢占端口）。  
- **端口占用**：WaveDance 打开串口期间，其他程序无法同时使用；关闭推送或退出 WaveDance 后释放。  
- **日志**：ESP 固件首版 `printf` 关闭或极低频，避免与二进制流混流（调试阶段可单独编译 `DEBUG_LOG` 版）。

### 4.2 帧格式（二进制，小端）

采用 **定长头 + 变长体**，避免 JSON 在 ESP 上的堆分配与解析开销。

#### 魔数与版本

```
magic   : u32  = 0x57444652  // "WDFR" (WaveDance Frame)
version : u8   = 1
```

#### 帧头（固定 20 字节）

| 偏移 | 字段 | 类型 | 说明 |
|------|------|------|------|
| 0 | magic | u32 | 0x57444652 |
| 4 | version | u8 | 协议版本 |
| 5 | flags | u8 | 位标志（见下） |
| 6 | seq | u16 | 序号，用于检测丢包 |
| 8 | point_count | u16 | 频谱桶数量 N |
| 10 | time_count | u16 | 时域点数 M（0 表示未携带） |
| 12 | peak | f32 | 同 WaveformFrame |
| 16 | rms | f32 | 同 WaveformFrame |

**flags 位定义**：

| 位 | 含义 |
|----|------|
| 0 | `SILENCE`：静默帧，points 可全 0 |
| 1 | `HAS_TIME`：载荷含 time_samples |
| 2 | `FREQ_REVERSED`：显示时反转频率轴（与桌面设置同步，可选） |

#### 载荷

```
points[N]      : N × u8   // 频谱 0~255，由 f32 [0,1] 量化
time_samples[M]: M × i8   // 时域 -128~127，由 f32 [-1,1] 量化（仅 HAS_TIME）
```

**默认配置**：`N = 32`，`M = 0` → 每帧 **20 + 32 = 52 字节**。  
30 fps 时约 **1.6 KB/s**；USB 串口带宽充裕。

示波器模式：`N = 32`，`M = 128` → 20 + 32 + 128 = **180 字节/帧**。

#### 序号与丢包

- `seq` 递增；ESP 侧 `(seq - last_seq) > 1` 可统计丢包，**不请求重传**（下一帧即覆盖）。
- 可视化场景允许丢帧；渲染器用缓落（fall ease）平滑突变。

### 4.3 控制通道（Phase 3，首版可省略）

反向经 **串口** 或后续 WiFi 由 ESP 发往 Mac：

- 切换显示模式 `bar | vu | scope | radial`
- 切换配色预设
- 心跳 / 在线状态

首版可在 ESP 上通过 **BOOT 键循环切换模式**，减少双向协议复杂度。

### 4.4 安全

- 有线串口仅本机物理连接，不暴露到网络。
- 可选 **简单令牌**：帧头扩展 4 字节 `token`（设置页生成，ESP NVS 存储）。

---

## 5. WaveDance 后端改造

### 5.1 新增模块

建议路径：

```
src-tauri/src/esp_display/
  mod.rs          // EspDisplayBridge、配置、节流
  protocol.rs     // 帧编码 encode_frame()
```

或在 `wavedance` 库中增加 `esp_display` 模块，供 Tauri 调用（便于单元测试）。

### 5.2 桥接逻辑

在 `start_waveform_stream` 循环内，`emit` 之后（或之前）调用：

```rust
if esp_bridge.enabled() {
    esp_bridge.maybe_send(&waveform);
}
```

`EspDisplayBridge` 职责：

| 职责 | 说明 |
|------|------|
| 节流 | `max_fps` 默认 30 |
| 分桶 | 将 `points` rebucket 到 `esp_bucket_count`（默认 32） |
| 静默 | `rms/peak` 低于门限时设 `SILENCE` 标志，可选跳过发送 |
| 裁剪 | `include_time_samples == false` 时不编码 M |
| 编码 | `protocol::encode_frame()` → `Vec<u8>` |
| 发送 | 打开 `serial_port`，`write_all` 整帧；失败时标记断开、不阻塞采集 |
| 重连 | 串口不存在时周期性尝试重开（如每 2 s），或仅设置页「连接」时打开 |

### 5.3 配置与持久化

扩展 `StreamState` 或独立 `EspDisplayState`：

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `enabled` | false | 是否推送 |
| `serial_path` | "" | Mac 串口路径，如 `/dev/cu.usbmodem1101` |
| `baud_rate` | 921600 | 与固件一致 |
| `max_fps` | 30 | 推送上限 |
| `bucket_count` | 32 | ESP 频谱桶数（8~64） |
| `include_time_samples` | false | 示波器模式时 true |
| `time_sample_count` | 128 | 时域降采样点数（64~256） |

持久化：与现有频谱参数一致，经 **Tauri command + localStorage / 配置文件** 同步（实现时对齐 `settings.js` 惯例）。

### 5.4 新增 Tauri Commands（草案）

```
list_serial_ports()           // 枚举 /dev/cu.* 供下拉选择
get_esp_display_config()
set_esp_display_config(config)
test_esp_display_ping()       // 发一帧测试包，设置页「测试连接」
```

### 5.5 依赖

- 新增 **`serialport`**（或 `tokio-serial`）crate：打开串口、`write_all`、枚举端口。  
- macOS 无需额外驱动；ESP32-C3 USB 插拔后设备名可能变化，设置页提供刷新列表。

### 5.6 线程模型

- **方案 1（推荐）**：采集线程内同步 `write_all`（56~200 字节，耗时 < 1 ms）。  
- 串口 `open` 在启用推送时一次持有 `Mutex<SerialPort>`；写失败则 `close` 并置 disconnected。  
- **方案 2**：无锁队列 + 独立发送线程（仅当实测抖动时采用）。

---

## 6. 前端 / 设置页改造

### 6.1 UI 位置

`frontend/settings.html` 新增分组：**「外接屏 (ESP32)」**，与「频谱参数」相邻。

### 6.2 控件

| 控件 | 类型 | 说明 |
|------|------|------|
| 启用推送 | switch | 打开串口并开始写帧 |
| 串口 | select + 刷新 | `list_serial_ports()`；显示 `cu.usbmodem*` |
| 波特率 | select | 921600（默认）/ 115200 |
| 推送帧率 | select | 15 / 30 / 60 |
| 频谱桶数 | select | 16 / 32 / 48 |
| 携带波形 | switch | 示波器模式需要 |
| 测试连接 | button | 触发 `test_esp_display_ping` |
| 状态 | text | 最近发送时间 / 错误信息（事件 `esp-display-status`） |

### 6.3 事件

后端可选 `emit("esp-display-status", { ok, message, last_sent_at })` 供设置页展示，**不影响**主窗 `waveform-frame` 链路。

---

## 7. ESP32 固件设计

### 7.1 工程结构

```
esp32/
  platformio.ini
  src/
    main.cpp
    serial_receiver.cpp   // USB CDC 读 + 流式组帧
    protocol_decode.cpp
    render/
      renderer.h
      bar_renderer.cpp
      vu_renderer.cpp
      scope_renderer.cpp
      radial_renderer.cpp
    display/
      display_driver.h      // 抽象层（gfx 直绘接口）
      waveshare_c3_lcd147.cpp // 首版：ESP32-C3-LCD-1.47 BSP 封装
      gc9d01_160x160.cpp    // 预留：0.71″ 圆屏
  include/
    config.h                // 波特率、默认显示模式
  README.md                 // 烧录、Type-C 连接说明
```

### 7.2 运行流程

```
1. 初始化显示 + USB Serial（`Serial.begin(921600)` 或 ESP-IDF USB CDC）
2. `serial_receiver` 从 CDC 读字节流，组 WDFR 完整帧
3. 解码帧 → 更新全局 SpectrumState（peak, rms, points[], time[])
4. loop：
     - 若有新帧 → 标记 dirty
     - 按 display_fps（如 30）刷新屏幕
     - 渲染器读取 SpectrumState + 本地 fall_ease 状态 → 绘图
5. BOOT 键：循环 display_mode
```

### 7.3 显示模式（首版 4 种）

| 模式 | 数据需求 | 说明 |
|------|----------|------|
| `bar` | points | 竖直频谱柱，默认 |
| `vu` | peak, rms | 双电平条 + 峰值点，最省算力 |
| `scope` | time_samples | 时域折线，需 Mac 开启携带波形 |
| `radial` | points | 圆形频谱（矩形屏可选，非默认） |

**缓落**：与 `frontend/src/renderers/common.js` 中 `applyAdaptiveSmooth` 类似，ESP 侧每桶维护 `eased[i]`，`eased += (target - eased) * k`（k 约 0.25~0.4）。

### 7.4 显示驱动抽象

`include/config.h` 首版默认 **BOARD_ESP32_C3_LCD_147**：

```c
// 默认：Waveshare ESP32-C3-LCD-1.47（用户确认矩形屏）
#define BOARD_ESP32_C3_LCD_147

#ifdef BOARD_ESP32_C3_LCD_147
#define DISPLAY_WIDTH    172
#define DISPLAY_HEIGHT   320
#define DISPLAY_DRIVER   ST7789      // Demo 兼容 ST7798 初始化
#define BACKLIGHT_TYPE   WHITE_LED  // 白光背光，经 IO 扩展控制
#define EXPANSION_HEADER 16         // 用户板 16 针；厂商文档或写 18PIN
#define DISPLAY_ROUND    0
#define USE_IO_EXPANDER  1          // CH32V003
#define DEFAULT_MODE     MODE_BAR
#define SPECTRUM_BUCKETS 32
#endif
```

初始化顺序（与厂商 Demo 一致）：

```c
IO_EXTENSION_Init();
LCD_Init();           // 或 Arduino: lcd.begin()
// 之后通过 gfx->fillRect / drawLine 绘图
```

不同板型仅替换 `display/` 与宏；渲染器使用逻辑坐标 **0..W, 0..H**（竖屏：x∈[0,172]，y∈[0,320]，原点左上）。

### 7.5 配置方式（首版）

- **无需 WiFi / 配网**；Type-C 插 Mac 即可通信 + 供电  
- 波特率在 `config.h` 与 WaveDance 设置页保持一致（默认 921600）

### 7.6 资源预算（估算）

| 项目 | 占用 |
|------|------|
| WiFi + LWIP | **0**（不用无线栈） |
| 全屏缓冲（172×320 RGB565） | **108 KB**（首版 **不使用**） |
| BSP / gfx 内部缓冲 | 由厂商库决定，需实测 |
| 频谱状态 48 桶 + 128 时域 | < 1 KB |
| 栈与堆 | 需实测；**直绘 + 局部区域刷新** |

172×320 竖屏 RAM 更紧：禁止全屏双缓冲；优先 **bar 直绘**、桶数 ≤ 32、无渐变填充。

---

## 8. 分阶段实施计划

每个 Phase 完成后应可独立验证；**不要跨 Phase 一次做完**。

### Phase 0 — 协议与文档冻结

- [x] 确认二进制帧格式 v1（本文档）
- [x] 用户板标识解析：ESP32-C3FH4（§2.3）
- [x] 屏幕外形：矩形 16 针白光 → **ESP32-C3-LCD-1.47**
- [x] 用户购买：CapCut 同款（1.47″ + SD 卡槽 C3 开发板）
- [x] 在 `esp32/README.md` 记录烧录步骤（引用微雪 Demo / ESP-IDF 5.5+）

**验收**：协议与硬件基线冻结；固件以厂商 BSP 初始化 LCD，不手写 SPI 引脚。

---

### Phase 1 — Rust 编码 + 串口推送

- [x] `wavedance/esp_display/protocol.rs`：`encode_frame()` / 单元测试
- [x] `EspDisplayBridge`：节流、rebucket、串口 `write_all`
- [x] 采集线程挂接 `maybe_send_frame`
- [x] Tauri commands：`list_serial_ports`、`get/set_esp_display_config`、`test_esp_display_ping`
- [x] 设置页 UI（Phase 3）

**验收**：Mac 播放音乐时，串口 sniffer 或 ESP 侧能持续收到合法 WDFR 帧；静默时 `SILENCE` 正确。

---

### Phase 2 — ESP 最小接收 + 柱状图

- [x] PlatformIO 工程、`serial_receiver`、`protocol_decode`
- [x] USB Serial 初始化（**不用 WiFi**）
- [x] 集成 Waveshare BSP：`IO_EXTENSION_Init` + `LCD_Init`（或 Arduino `lcd.begin`）
- [x] `bar_renderer`：32 柱竖屏底对齐实时绘制（172 宽）

**验收**：Type-C 连接、设置页选串口并开启推送后，小屏柱状频谱随 Mac 音乐变化；延迟主观 < 50 ms。

---

### Phase 3 — 设置页 + 状态反馈

- [x] `settings.html` + `espDisplaySettings.js` 外接屏分组（主设置页快捷入口 + 独立设置窗）
- [x] 配置 `localStorage` 持久化 + 启动时同步到后端（主窗 / 设置页 init）
- [x] `test_esp_display_ping` + `esp-display-status` 事件展示（含连接态颜色与最近发送时间）
- [x] BOOT 键切换 bar / vu / radial（ESP 固件）

**验收**：重启 WaveDance 后配置保留；测试连接有明确成功/失败提示。

---

### Phase 4 — 示波器与打磨

- [ ] Mac 侧 `include_time_samples` + 128 点降采样
- [ ] ESP `scope_renderer`
- [ ] 丢包统计（日志）；静默降频发送
- [ ] `esp32/README.md` 完整用户说明

**验收**：示波器模式波形与桌面示波器形态一致（不要求像素级一致）；长时间运行无崩溃 / 内存泄漏。

---

### Phase 5（可选）— 增强

- [ ] WiFi UDP 无线推送（与串口二选一或并存）
- [ ] 多设备、OTA
- [ ] 与 `now-playing` 元数据同屏（曲名滚动，独立小包）
- [ ] 串口反向通道（ESP → Mac 状态/模式切换）

---

## 9. 测试计划

### 9.1 协议测试

| 用例 | 期望 |
|------|------|
| 空载 points | N=32 全 0，SILENCE=1 |
| 满幅正弦 | 能量集中在中间频桶 |
| seq 连续 | 无乱序 |
| 错误 magic | ESP 丢弃，不崩溃 |
| 超大 N | 编码端拒绝 N>64 |

### 9.2 串口测试

| 用例 | 期望 |
|------|------|
| 未插 USB | 设置页显示未连接；采集线程不阻塞 |
| 拔线 | 写失败 → 状态断开；插回后重选端口可恢复 |
| 端口被占用 | 打开失败提示「串口已被占用」 |
| 波特率不一致 | 解帧失败；日志统计 magic 对齐失败率 |

### 9.3 端到端

1. BlackHole 路由系统音频 → WaveDance 主窗正常
2. 同时开启 ESP 推送 → 小屏与主窗 **节奏一致**
3. 调整桌面分桶 256 → ESP 仍为 32 桶，**无需**改 ESP 配置
4. 关闭推送 → ESP 保持最后一帧或渐隐至黑（实现可选）

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 采集线程串口写阻塞 | 小包 + 短超时；失败即断开不重试阻塞 |
| USB 拔插设备名变化 | `list_serial_ports` + 用户重选或按 VID/PID 提示 |
| ESP RAM 不足（172×320） | 禁止全屏缓冲；直绘 + 局部刷新；桶数 ≤ 32 |
| CH32V003 IO 扩展 | 必须用厂商 BSP，禁止裸 TFT_eSPI 猜引脚 |
| 屏幕驱动各异 | `display_driver` 抽象；文档列出已测板型 |
| 二进制与日志混流 | 发布固件关闭 `printf`；调试单独构建 |
| 与桌面帧率双倍发送 | 桥接层 `max_fps` 节流，默认 30 |
| 协议演进 | `version` 字段；v1 稳定后再加 v2 |

---

## 11. 与现有代码的挂接点（实现时快速定位）

| 位置 | 改动 |
|------|------|
| `src-tauri/src/main.rs` | `start_waveform_stream` 内调用 bridge；注册 commands |
| `src/audio_processing/mod.rs` | 可选：导出 rebucket 工具函数供 bridge 复用 |
| `frontend/settings.html` | 外接屏 UI |
| `frontend/settings.js` | 配置读写与状态展示 |
| `docs/CHANGELOG_AGENT.md` | 每 Phase 完成后追加记录 |
| `PROJECT_CONTEXT.md` | Phase 2 完成后更新「当前能力」 |

---

## 12. 进度追踪

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | 协议与文档冻结 | ✅ ESP32-C3-LCD-1.47 已锁定 |
| 1 | Rust 编码 + 串口推送 | ✅ 后端已完成，待设置页 |
| 2 | ESP 接收 + 柱状图 | ✅ 固件已实现（`esp32/`） |
| 3 | 设置页 + 状态反馈 | ✅ 已完成（含 ESP 多模式切换） |
| 4 | 示波器与打磨 | ⬜ 待开始 |
| 5 | 可选增强 | ⬜ 待定 |

---

## 13. 待用户确认项

| 项 | 状态 | 说明 |
|----|------|------|
| 芯片型号 | ✅ | ESP32-C3**FH4**，4 MB Flash |
| 屏幕外形 | ✅ | **0.42″ OLED 72×40**（SSD1306，I2C）；非 1.47″ 172×320 |
| 固件路径 | ✅ | `esp32/oled-042/` + `./flash-oled-042.sh` |
| 传输方式 | ✅ | **Type-C USB 串口**，不用 WiFi |
| 断连时行为 | ✅ | ESP 侧 **渐隐到黑** |
| 首版默认模式 | ✅ | 柱状 **bar**，16 桶；BOOT 切换 bar / vu |

可从 **Phase 1（Mac 串口推送）** 与 **Phase 2（ESP 读串口 + bar）** 并行开发。
