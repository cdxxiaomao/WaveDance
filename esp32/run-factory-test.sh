#!/usr/bin/env bash
# 一键原厂 HelloWorld 硬件验证（PlatformIO，无需 Arduino IDE）
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
  echo "错误：未找到 /dev/cu.usbmodem*，请插好 Type-C 线。"
  exit 1
fi

echo ">>> 烧录 HelloWorld 硬件验证固件 → ${PORT}"
echo ">>> （请先完全退出 WaveDance，避免串口被占用）"
"$VENV/bin/pio" run -d "$ROOT/factory-test" -e factory-helloworld -t upload --upload-port "$PORT"

echo ""
echo ">>> 读取串口 5 秒（115200）..."
sleep 1
"$VENV/bin/pip" install pyserial -q 2>/dev/null || true
"$VENV/bin/python" - <<PY
import serial, time
ser = serial.Serial("${PORT}", 115200, timeout=0.5)
ser.dtr = False; time.sleep(0.05); ser.dtr = True
time.sleep(3)
print(ser.read(4096).decode('utf-8', errors='replace'))
ser.close()
PY

echo ""
echo "请看屏幕：应出现红色 Hello World!"
echo "测完刷回 WaveDance: cd $ROOT && ./flash.sh ${PORT}"
