#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
TAURI_DIR="$ROOT_DIR/src-tauri"

NPM_MAJOR="$(npm -v | cut -d. -f1)"
if [[ "${NPM_MAJOR:-0}" -lt 7 ]]; then
  echo "需要 npm >= 7（当前版本过低，无法解析 link: 依赖）。"
  exit 1
fi

echo "==> 1) 安装前端依赖"
cd "$FRONTEND_DIR"
if [[ ! -d "node_modules" ]]; then
  echo "未检测到 node_modules，尝试安装依赖..."
  npm install
else
  echo "检测到 node_modules，跳过安装步骤。"
fi

echo "==> 2) 构建前端静态资源"
npm run build

echo "==> 3) 构建 macOS 安装包（app + 自定义 DMG）"
cd "$TAURI_DIR"
CI=false cargo tauri build --bundles app

echo "==> 4) 用自定义脚本生成带 BlackHole 驱动的 DMG"
"$ROOT_DIR/scripts/build-dmg-with-blackhole.sh"

echo "==> 完成，产物目录：$TAURI_DIR/target/release/bundle"
