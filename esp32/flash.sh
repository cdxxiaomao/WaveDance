#!/usr/bin/env bash
# macOS 上勿用 pip3 install --user（PEP 668 会拒绝）；本脚本自动创建 venv 并烧录。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
PORT="${1:-}"

if [[ ! -x "$VENV/bin/pio" ]]; then
  echo ">>> 首次运行：创建 Python 虚拟环境并安装 PlatformIO（约 1~3 分钟）..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -U pip
  "$VENV/bin/pip" install platformio
fi

if [[ -z "$PORT" ]]; then
  PORT="$(ls /dev/cu.usbmodem* 2>/dev/null | head -1 || true)"
fi

if [[ -z "$PORT" ]]; then
  echo "错误：未找到 /dev/cu.usbmodem*，请插好开发板 Type-C 线。"
  exit 1
fi

echo ">>> 烧录到 ${PORT} (请先关闭 WaveDance 外接屏推送，避免串口被占用)"
"$VENV/bin/pio" run -d "$ROOT" -t upload --upload-port "$PORT"
