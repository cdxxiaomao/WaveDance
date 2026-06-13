#!/usr/bin/env bash
# 烧录 ESP32-C3 0.42" OLED 简易信息屏固件
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
PORT="${1:-}"

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

echo ">>> 烧录 0.42 OLED WaveDance 频谱固件 → ${PORT}"
echo ">>> 烧录后在 WaveDance 设置页启用 ESP 推送并测试连接"
"$VENV/bin/pio" run -d "$ROOT/oled-042" -e esp32-c3-oled-042 -t upload --upload-port "$PORT"
echo ""
echo ">>> 完成。待机: WD WAIT + 呼吸柱 | 连接后: WD LINK + 频谱"
