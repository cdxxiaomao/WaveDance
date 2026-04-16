# WaveDance

WaveDance 是一个面向 macOS 的实时音频可视化桌面应用。  
它通过 Tauri（Rust + Web）构建，采集系统播放音频并实时绘制频谱浮层。

## 文档导航

- 快速上下文：`docs/QUICK_CONTEXT.md`
- 当前执行上下文：`PROJECT_CONTEXT.md`
- 历史实现轨迹：`docs/CHANGELOG_AGENT.md`
- macOS 打包说明：`BUILD_MACOS.md`

## 当前能力（简述）

- 系统音频实时频谱可视化（WebGL）
- 频谱参数可调（分桶、模式、补偿、频率区间）
- 透明浮层窗口（支持置顶模式切换）
- macOS 打包产物（`.app` + `.dmg`）

## 运行环境

- macOS 12 及以上
- Rust 工具链（`cargo` 可用）
- Node.js + npm
- Xcode Command Line Tools

## 快速开始（开发模式）

在项目根目录执行：

```bash
cd frontend
npm install

cd ..
cargo tauri dev
```

启动后：

- Tauri 会自动拉起前端开发服务器（默认 `http://localhost:5173`）
- 桌面窗口会接收后端推送的 `waveform-frame` 并实时渲染

## 打包

推荐直接使用一键脚本：

```bash
./scripts/build-macos.sh
```

更多打包细节与问题排查见：`BUILD_MACOS.md`

## 音频采集说明（重要）

macOS 无通用“无配置直接读取系统播放音频”的能力。  
本项目默认路线是使用虚拟音频设备（如 BlackHole）作为系统输出回环源。

建议首次使用流程：

1. 安装 BlackHole（或已配置可用的系统回环设备）
2. 将系统输出切到对应回环设备
3. 启动 WaveDance，确认频谱随声音变化

## 权限与常见问题（简版）

- 已在打包配置中加入麦克风用途描述（用于系统音频输入链路授权）
- 若安装后无数据：
  - 先确认使用的是最新打包产物
  - 删除旧版本后重装
  - 可尝试重置权限缓存：

```bash
tccutil reset Microphone com.wavedance.desktop
```
