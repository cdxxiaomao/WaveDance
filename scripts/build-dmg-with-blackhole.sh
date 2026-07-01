#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/src-tauri"
BLACKHOLE_PKG="$TAURI_DIR/resources/blackhole/BlackHole2ch-0.6.1.pkg"
BLACKHOLE_README="$TAURI_DIR/resources/blackhole/BlackHole使用说明.txt"
APP_NAME="WaveDance"
VOLUME_NAME="WaveDance"

BUNDLE_DIR="$TAURI_DIR/target/release/bundle"
APP_PATH=""
DMG_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP_PATH="$2"
      shift 2
      ;;
    --output)
      DMG_PATH="$2"
      shift 2
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: $0 [--app /path/to/WaveDance.app] [--output /path/to/output.dmg]"
      exit 1
      ;;
  esac
done

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$BUNDLE_DIR/macos/$APP_NAME.app"
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "错误: 找不到应用包: $APP_PATH"
  echo "请先运行 cargo tauri build 构建 .app"
  exit 1
fi

if [[ ! -f "$BLACKHOLE_PKG" ]]; then
  echo "错误: 找不到 BlackHole 安装包: $BLACKHOLE_PKG"
  exit 1
fi

if [[ -z "$DMG_PATH" ]]; then
  VERSION="$(plutil -extract CFBundleShortVersionString raw -o - "$APP_PATH/Contents/Info.plist" 2>/dev/null || echo "0.2.1")"
  DMG_PATH="$BUNDLE_DIR/dmg/${APP_NAME}_${VERSION}_aarch64.dmg"
fi

OUTPUT_DIR="$(dirname "$DMG_PATH")"
mkdir -p "$OUTPUT_DIR"

DMG_TMP="/tmp/wavedance-dmg-build-$$.dmg"
TMP_CONTENT="/tmp/wavedance-dmg-content-$$"
MOUNT_POINT="/Volumes/$VOLUME_NAME"

cleanup() {
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  rm -rf "$TMP_CONTENT" "$DMG_TMP" 2>/dev/null || true
}
trap cleanup EXIT

# 确保没有同名卷已挂载
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true

echo "==> 准备临时内容目录..."
mkdir -p "$TMP_CONTENT"
ditto "$APP_PATH" "$TMP_CONTENT/$APP_NAME.app"
ditto "$BLACKHOLE_PKG" "$TMP_CONTENT/BlackHole2ch-0.6.1.pkg"
ditto "$BLACKHOLE_README" "$TMP_CONTENT/BlackHole使用说明.txt"
ln -sf /Applications "$TMP_CONTENT/Applications"

echo "==> 创建可写 DMG 镜像..."
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$TMP_CONTENT" \
  -fs HFS+ \
  -fsargs "-c c=64,a=16,e=16" \
  -format UDRW \
  "$DMG_TMP"

echo "==> 挂载镜像（读写模式）..."
hdiutil attach -readwrite -noverify -noautoopen "$DMG_TMP"
sleep 2

echo "==> 设置 DMG 窗口外观..."

WINDOW_X=200
WINDOW_Y=200
WINDOW_W=860
WINDOW_H=400

APP_X=140
APP_Y=150
APPS_X=280
APPS_Y=150
PKG_X=420
PKG_Y=150
README_X=560
README_Y=150

osascript <<EOF 2>/dev/null || echo "警告: AppleScript 设置窗口外观失败，但不影响 DMG 功能"
tell application "Finder"
  tell disk "$VOLUME_NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {${WINDOW_X}, ${WINDOW_Y}, ${WINDOW_X} + ${WINDOW_W}, ${WINDOW_Y} + ${WINDOW_H}}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 96
    set text size of viewOptions to 12
    set position of item "$APP_NAME.app" of container window to {${APP_X}, ${APP_Y}}
    set position of item "Applications" of container window to {${APPS_X}, ${APPS_Y}}
    set position of item "BlackHole2ch-0.6.1.pkg" of container window to {${PKG_X}, ${PKG_Y}}
    set position of item "BlackHole使用说明.txt" of container window to {${README_X}, ${README_Y}}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell
EOF

sleep 2

echo "==> 卸载镜像..."
hdiutil detach "$MOUNT_POINT" -quiet
sleep 1

echo "==> 压缩生成最终 DMG..."
rm -f "$DMG_PATH" 2>/dev/null || true
hdiutil convert "$DMG_TMP" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov \
  -o "$DMG_PATH"

rm -f "$DMG_TMP"

echo "==> 完成: $DMG_PATH"
echo ""
echo "DMG 内容:"
echo "  - $APP_NAME.app（主应用）"
echo "  - Applications（应用程序文件夹快捷方式）"
echo "  - BlackHole2ch-0.6.1.pkg（驱动安装包）"
echo "  - BlackHole使用说明.txt（驱动配置指南）"