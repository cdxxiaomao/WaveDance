# WaveDance

WaveDance 是一个面向 macOS 的实时音频可视化桌面应用。  
它通过 Tauri（Rust + Web）构建，捕获系统播放音频并在前端实时绘制频谱。

## 项目目标

- 采集系统播放音频（优先 BlackHole 回环方案）
- 实时可视化（低频到高频）
- 保持低延迟、较高帧率和稳定资源占用
- 具备可安装、可分发的 macOS 应用打包能力

## 当前功能（v0.1）

- 已打通 Tauri 端到端链路：Rust 采集 -> 事件推送 -> 前端渲染
- 前端实时频谱显示（WebGL）
- 频谱分桶数量动态调整（运行中即时生效）
- 分桶模式切换：`log` / `linear`
- 高频补偿强度调节（0~200%）
- 频率范围选择（下限/上限，下一帧即时生效）
- 低延迟队列策略（短窗口 + 积压丢弃）
- macOS 打包能力：`.app` + `.dmg`

## 技术栈

- 桌面壳：Tauri 2
- 后端：Rust（含音频采集/处理/命令）
- 前端：Vite + JavaScript
- 通信：Tauri Command + Event（`waveform-frame`）

## 目录结构

```text
WaveDance/
├── frontend/            # 前端工程（Vite）
├── src-tauri/           # Tauri 桌面壳与 Rust 后端入口
├── src/                 # Rust 核心模块（采集/处理/平台/应用编排）
├── tests/               # Rust 测试
├── scripts/             # 脚本（含 macOS 打包）
├── BUILD_MACOS.md       # macOS 打包说明
└── PROJECT_CONTEXT.md   # 项目背景与决策记录
```

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

## macOS 打包

推荐直接使用一键脚本：

```bash
./scripts/build-macos.sh
```

默认产物位置：

- `.app`：`src-tauri/target/release/bundle/macos/`
- `.dmg`：`src-tauri/target/release/bundle/dmg/`

更多说明见：`BUILD_MACOS.md`

## 音频采集说明（重要）

macOS 无通用“无配置直接读取系统播放音频”的能力。  
本项目默认路线是使用虚拟音频设备（如 BlackHole）作为系统输出回环源。

建议首次使用流程：

1. 安装 BlackHole（或已配置可用的系统回环设备）
2. 将系统输出切到对应回环设备
3. 启动 WaveDance，确认频谱随声音变化

## 权限与常见问题

- 已在打包配置中加入麦克风用途描述（用于系统音频输入链路授权）
- 若安装后无数据：
  - 先确认使用的是最新打包产物
  - 删除旧版本后重装
  - 可尝试重置权限缓存：

```bash
tccutil reset Microphone com.wavedance.desktop
```

## 里程碑状态

- M1（最小链路）：已完成
- M2（性能与稳定性）：进行中（持续优化采集与渲染链路）
- M3（发布能力）：已具备基础打包能力，后续可加签名与 notarization

## 后续规划

- 更完整的 CoreAudio 设备管理与异常恢复
- 频谱增强（FFT 参数化、平滑策略、更多视觉主题）
- 录制/导出能力（wav/png/mp4）
- 发布流程完善（签名、notarization、自动化构建）
