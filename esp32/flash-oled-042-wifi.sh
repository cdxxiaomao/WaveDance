#!/usr/bin/env bash
# 烧录 ESP32-C3 0.42" OLED WiFi UDP 版固件（需先配置 include/wifi_config.h）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
PORT="${1:-}"
WIFI_CFG="$ROOT/include/wifi_config.h"

if [[ ! -f "$WIFI_CFG" ]]; then
  echo "错误：未找到 $WIFI_CFG"
  echo "请先复制 include/wifi_config.example.h → include/wifi_config.h 并填入 WiFi 凭据"
  exit 1
fi

if [[ ! -x "$VENV/bin/pio" ]]; then
  echo ">>> 首次运行：安装 PlatformIO..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -U pip platformio
fi

if [[ -z "$PORT" ]]; then
  PORT="$(ls /dev/cu.usbmodem* 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PORT" ]]; then
  echo "错误：未找到 /dev/cu.usbmodem*"
  exit 1
fi

echo ">>> 烧录 72×40 OLED WiFi UDP 固件 → ${PORT}"
echo ">>> 烧录后串口监视器会打印 ESP IP；Mac 设置页选「WiFi UDP」并填写该 IP"
"$VENV/bin/pio" run -d "$ROOT/oled-042" -e esp32-c3-oled-042-wifi -t upload --upload-port "$PORT"
echo ""
echo ">>> 完成。监听 UDP 端口 47001；串口与 UDP 可并存接收"
