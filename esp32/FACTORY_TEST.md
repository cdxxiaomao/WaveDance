# 原厂 HelloWorld 硬件验证

用于判断黑屏是 **硬件/IO 扩展器** 问题，还是 **WaveDance 固件** 问题。

## 预期结果

| 现象 | 含义 |
|------|------|
| 屏幕显示红色 **Hello World!**（随机位置刷新） | 硬件正常，可继续排查 WaveDance 固件 |
| 仍黑屏，串口 `lcd.begin failed` | IO 扩展器 CH32V003（I2C 0x24）异常，建议联系微雪售后 |
| 烧录失败 / 找不到端口 | 关闭 WaveDance，换 USB 线或直连 Mac |

---

## 方法一：Arduino IDE（推荐，与微雪文档一致）

### 1. 安装 Arduino IDE 2.x

https://www.arduino.cc/en/software

### 2. 安装 ESP32 开发板（需 3.x，含新 I2C 驱动）

1. **Arduino IDE → 设置 → 附加开发板管理器网址**，加入：
   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
2. **工具 → 开发板 → 开发板管理器**，搜索 `esp32`
3. 安装 **esp32 by Espressif Systems**，版本 **3.0.0 或更高**（不要用 2.x）

### 3. 安装 GFX 库

**工具 → 管理库**，搜索并安装：

- **GFX Library for Arduino**（作者 moononournation），版本 **1.5.9**

### 4. 安装微雪板级库（离线）

将本目录下官方库复制到 Arduino 库文件夹：

```bash
cp -R /Users/dengchen/Desktop/work/WaveDance/esp32/.ref-official/example/Arduino/libraries/ESP32_C3_LCD_1in47 \
  ~/Documents/Arduino/libraries/
```

（如 `~/Documents/Arduino` 不存在，可在 IDE **文件 → 首选项** 里查看「项目文件夹位置」。）

### 5. 打开示例并烧录

1. 打开：
   ```
   /Users/dengchen/Desktop/work/WaveDance/esp32/.ref-official/example/Arduino/examples/01_gfx_helloworld/01_gfx_helloworld.ino
   ```
2. **工具 → 开发板**：`ESP32C3 Dev Module` 或 `ESP32-C3-DevKitM-1`
3. **工具 → USB CDC On Boot**：`Enabled`
4. **工具 → 端口**：选 `/dev/cu.usbmodem101`（以你机器为准）
5. 点击 **上传**

### 6. 看串口（可选）

**工具 → 串口监视器**，波特率 **115200**。成功时会打印：

```
Arduino_GFX Hello World example
```

失败时会打印：

```
lcd.begin failed: ...
```

---

## 验证完成后：刷回 WaveDance 固件

```bash
cd /Users/dengchen/Desktop/work/WaveDance/esp32
./flash.sh /dev/cu.usbmodem101
```

烧录前请 **完全退出 WaveDance**（避免串口被占用）。

---

## 官方资料

- 仓库：https://github.com/waveshareteam/ESP32-C3-LCD-1.47
- 文档：https://docs.waveshare.com/ESP32-C3-LCD-1.47/Development-Environment-Setup-Arduino
