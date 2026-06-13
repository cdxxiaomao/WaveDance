#!/usr/bin/env bash
# 烧录 ESP32-C3 0.42" OLED 72×40 频谱固件（WaveDance WDFR v1）
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

echo ">>> 烧录 72×40 OLED WaveDance 固件 → ${PORT}"
echo ">>> Mac 设置：波特率 921600，频谱桶数建议 16，BOOT 键切换 BAR/VU"
"$VENV/bin/pio" run -d "$ROOT/oled-042" -e esp32-c3-oled-042 -t upload --upload-port "$PORT"
echo ""
echo ">>> 完成。待机: WD WAT + 呼吸柱 | 连接: WD LNK + 频谱 | BOOT: BAR↔VU"
