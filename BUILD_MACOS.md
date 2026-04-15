# WaveDance macOS 打包说明

## 前置条件

- 已安装 Rust 工具链（含 `cargo`）
- 已安装 Node.js 与 npm（建议 npm >= 7）
- 已安装 Xcode Command Line Tools

## 一键打包

在项目根目录执行：

```bash
./scripts/build-macos.sh
```

默认会产出：

- `.app`：`src-tauri/target/release/bundle/macos/`
- `.dmg`：`src-tauri/target/release/bundle/dmg/`

若你按我当前流程执行成功，也会在项目目录看到一份归档：

- `dist/macos/WaveDance.app`
- `dist/macos/WaveDance_0.1.0_aarch64.dmg`

## 手动分步打包

```bash
cd frontend
npm install
npm run build

cd ../src-tauri
cargo tauri build
```

## 常见问题

- 若提示 `cargo tauri` 不存在：
  - 执行 `cargo install tauri-cli --version "^2.0.0"`
- 若 `dmg` 能生成但打开提示来源不明：
  - 正常开发阶段现象，正式发布前需做 Apple 签名与 notarization。
- 若安装后采集不到数据，且“系统设置 -> 隐私与安全性 -> 麦克风”里没有 WaveDance：
  - 先确认你使用的是最新重打包产物（已包含 `NSMicrophoneUsageDescription`）。
  - 删除旧版 WaveDance 后重新安装并首次启动。
  - 重置权限缓存后再打开应用：
    - `tccutil reset Microphone com.wavedance.desktop`
