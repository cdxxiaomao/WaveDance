# WaveDance ESP32 外接屏固件

> **你的屏幕是 72×40 OLED？** 请用 [`./flash-oled-042.sh`](#esp32-c3-042-oled-小屏72×40) 烧录，不要用 `./flash.sh`（后者面向 172×320 微雪 LCD）。

ESP32 外接屏固件经 **USB Type-C 串口** 接收 WaveDance 推送的 **WDFR v1** 二进制帧并绘制频谱。

## 选哪套固件？

| 屏幕 | 分辨率 | 烧录命令 | 工程目录 |
|------|--------|----------|----------|
| **0.42″ OLED（用户板）** | **72×40** | `./flash-oled-042.sh` | `oled-042/` |
| 微雪 1.47″ LCD | 172×320 | `./flash.sh` | `src/` |

---

## ESP32-C3 0.42" OLED 小屏（72×40）

适用于 **0.42 寸 SSD1306 OLED** 开发板（I2C **SDA=GPIO5, SCL=GPIO6**），分辨率 **72×40**。

```bash
cd esp32
./flash-oled-042.sh
```

| 屏幕 | 含义 |
|------|------|
| 顶栏 **WD WAT** + 底部细柱呼吸 | 固件就绪，等待 Mac 推送 |
| 顶栏 **WD LNK** + 柱随音乐跳动 | 推送正常 |
| 顶栏右侧 **BAR** / **VU** | 当前显示模式；**BOOT** 键切换 |

Mac 端设置：

1. 串口 `/dev/cu.usbmodem*`
2. 波特率 **921600**
3. 频谱桶数建议 **16**（与固件一致）
4. 开启「启用推送」→「测试连接」

工程目录：`esp32/oled-042/`

---

## ESP32-C3-LCD-1.47（172×320，微雪）

172×320 ST7789 彩色竖屏固件（非 72×40 OLED 用户请忽略本节）。

## 依赖

- [PlatformIO](https://platformio.org/)
- Arduino 框架 + `GFX Library for Arduino` 1.5.9（由 `platformio.ini` 自动拉取）

## 烧录

**macOS 不要用** `pip3 install platformio --user`（会报 `externally-managed-environment`）。

在 `esp32` 目录执行（首次会自动创建 `.venv` 并安装 PlatformIO）：

```bash
cd esp32
chmod +x flash.sh
./flash.sh
```

指定串口（可选）：

```bash
./flash.sh /dev/cu.usbmodem101
```

或手动激活虚拟环境：

```bash
cd esp32
python3 -m venv .venv
source .venv/bin/activate
pip install platformio
pio run -t upload --upload-port /dev/cu.usbmodem101
```

也可使用 Homebrew：`brew install pipx && pipx install platformio`

## ESP32-C3 0.42" OLED 小屏（WaveDance 频谱）

（已移至文档顶部「72×40」章节。）

---

## 1.47″ LCD 硬件

| 项目 | 说明 |
|------|------|
| 开发板 | [Waveshare ESP32-C3-LCD-1.47](https://www.waveshare.com/esp32-c3-lcd-1.47.htm) |
| 屏幕 | 172×320 ST7789，经 CH32V003 IO 扩展器控制 |
| 连接 | Type-C 数据线接 Mac（供电 + USB CDC 串口） |
| 官方 BSP | 本工程 `lib/ESP32_C3_LCD_1in47/` |

首次烧录后，板子进入 **串口接收模式**。在 WaveDance 设置页：

1. 选择对应 `/dev/cu.usbmodem*` 串口
2. 波特率 **921600**（须与 `include/config.h` 中 `SERIAL_BAUD` 一致）
3. 开启「启用推送」

> 运行中请勿同时打开 Arduino Serial Monitor，否则会占用串口。

## 调试构建

需要串口日志时：

```bash
pio run -e esp32-c3-lcd-147-debug -t upload
pio device monitor -b 921600
```

发布版默认关闭 `printf`/日志，避免与二进制 WDFR 流混流。

## 工程结构

```
esp32/
  platformio.ini
  include/config.h           # 波特率、协议常量、渲染参数
  src/
    main.cpp                 # 主循环：读串口 + 30fps 绘制
    protocol_decode.cpp      # WDFR v1 解码
    serial_receiver.cpp      # 流式组帧
    spectrum_state.cpp       # 频谱状态 + 断连渐隐
    display/waveshare_c3_lcd147.cpp
    render/bar_renderer.cpp  # 柱状频谱
    render/vu_renderer.cpp   # VU 双电平条
    render/radial_renderer.cpp # 圆形频谱
  lib/ESP32_C3_LCD_1in47/    # 微雪板级 BSP
```

## 显示模式（BOOT 键）

短按板载 **BOOT** 键循环切换（Phase 3）：

| 模式 | 顶栏标识 | 说明 |
|------|----------|------|
| 柱状 | `LINK BAR` | 默认，底对齐竖柱 |
| VU | `LINK VU` | 中部 peak / rms 双横条 |
| 圆形 | `LINK RAD` | 放射状频谱线 |

示波器模式（`scope`）需 Mac 端开启「携带时域波形」，Phase 4 实现。

## 协议

与 Mac 端 `src/esp_display/protocol.rs` 一致：

- 魔数 `0x57444652`（"WDFR"）
- 默认 32 桶、无 `time_samples` → 52 字节/帧
- 静默帧带 `SILENCE` 标志

## 如何判断固件是否正确

| 屏幕内容 | 含义 |
|----------|------|
| **ESP32-C3** 等出厂界面，蓝灯约 4 秒闪 | 仍是微雪出厂 Demo，**尚未烧录 WaveDance 固件** |
| **WaveDance** 大字 + 底部暗绿呼吸柱 + 顶栏 **WAIT** | WaveDance 固件已运行，等待 Mac 推送 |
| 顶栏 **LINK** + 彩色频谱柱随音乐变化 | 推送正常 |

## 常见问题

### 屏无变化 / 一直显示 ESP32-C3

1. 按上文表格确认是否已烧录 WaveDance 固件（出厂 Demo 不会响应 Mac 推送）
2. WaveDance 设置页关闭「启用推送」或退出应用，再执行 `pio run -t upload`（串口被占用会烧录失败）
3. 烧录完成后按 **RESET**，应看到 **WaveDance** 与底部呼吸柱

### 已显示 WaveDance 但频谱不动

1. 设置页串口选 `/dev/cu.usbmodem*`（与 `ls /dev/cu.*` 一致）
2. 波特率 **921600**，开启「启用推送」
3. 点击「测试连接」→ 小屏应变彩色柱
4. 主窗需有音频输入（BlackHole/麦克风）并在播放音乐

### 烧录时 `Resource busy`

WaveDance 已占用串口。先关闭外接屏推送或退出 WaveDance，再烧录。

## WiFi UDP 无线推送（Phase 5，可选）

默认固件仍走 **USB 串口**。若需无线摆放 ESP32，可烧录 WiFi 版固件，Mac 端在设置页选择 **WiFi UDP** 或 **串口 + UDP**。

### 1. 配置 ESP WiFi

```bash
cp esp32/include/wifi_config.example.h esp32/include/wifi_config.h
# 编辑 wifi_config.h，填入 SSID 与密码（该文件已 gitignore）
```

### 2. 烧录 WiFi 版固件

**0.42″ OLED：**

```bash
cd esp32
chmod +x flash-oled-042-wifi.sh
./flash-oled-042-wifi.sh
```

**1.47″ LCD：**

```bash
cd esp32
source .venv/bin/activate   # 或 ./flash.sh 同款 venv
pio run -e esp32-c3-lcd-147-wifi -t upload --upload-port /dev/cu.usbmodem*
```

烧录完成后，串口监视器（921600）会打印 `WiFi UDP ready on 192.168.x.x:47001`。  
**小屏也会显示**：顶栏 `WD WiF` + 中间 IP + `UDP 47001`（收到 Mac 推送后切换为频谱）。

> **注意**：打开串口监视器时，部分工具会通过 USB 复位开发板（等于重新上电）。已在 `platformio.ini` 设置 `monitor_dtr=0` 减轻此问题。  
> 冷启动 WiFi 可能需要 **30 秒～2 分钟**（会自动重试）；若日志出现 `SSID not found` 请确认路由器 **2.4GHz** 与 `wifi_config.h` 中的名称一致。

### 3. Mac 端设置

1. 外接屏设置 → **传输方式** 选「WiFi UDP」或「串口 + UDP」
2. **ESP IP** 填上一步打印的地址，端口默认 **47001**
3. 开启推送 → 测试连接

Mac 与 ESP 须在同一局域网；UDP 每包一帧 WDFR，与串口协议相同。

---

- 方案文档：`docs/ESP32_DISPLAY_PLAN.md`
- 微雪 Demo 仓库：https://github.com/waveshareteam/ESP32-C3-LCD-1.47
