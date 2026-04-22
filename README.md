# WaveDance

WaveDance 是一个面向 macOS 的实时音频可视化桌面应用。  
项目基于 Tauri（Rust + Web）构建，采集系统播放音频并实时绘制频谱浮层。

## 产品图标

![WaveDance 产品图标](src-tauri/icons/icon.png)

## 效果预览

![WaveDance 预览图](docs/images/wavedance-preview.png)

## 项目特性

- 系统音频实时频谱可视化（WebGL 渲染）
- 可调节频谱参数（分桶、模式、补偿、频率区间）
- 透明浮层窗口，支持置顶模式切换
- 支持输出 macOS 安装产物（`.app`、`.dmg`）

## 运行环境

- macOS 12 及以上
- Rust 工具链（`cargo` 可用）
- Node.js 与 npm
- Xcode Command Line Tools

## 快速开始

### 1) 安装前端依赖

在项目根目录执行：

```bash
cd frontend
npm install
```

### 2) 启动开发模式

回到项目根目录执行：

```bash
cd ..
cargo tauri dev
```

启动后：

- Tauri 会自动拉起前端开发服务器（默认 `http://localhost:5173`）
- 桌面窗口会接收后端推送的 `waveform-frame` 并实时渲染

## 打包发布

推荐使用一键脚本：

```bash
./scripts/build-macos.sh
```

打包细节与常见问题排查见 `BUILD_MACOS.md`。

## 音频回环说明（重要）

macOS 不支持在无额外配置下直接读取系统播放音频。  
WaveDance 在 `blackhole` 模式下会优先匹配虚拟音频设备（如 BlackHole）作为系统输出回环源；若未匹配到，则会回退到系统默认输入设备（可能是麦克风）。

建议首次使用流程：

1. 安装 BlackHole（或其他可用回环设备）
2. 将系统输出切换到该回环设备
3. 启动 WaveDance，确认频谱随声音变化

## 权限与排障

- 打包配置已包含麦克风用途描述（用于系统音频输入链路授权）
- 若安装后无频谱数据，建议按顺序排查：
  1. 确认使用最新打包产物
  2. 删除旧版本后重新安装
  3. 重置麦克风权限缓存

```bash
tccutil reset Microphone com.wavedance.desktop
```

## 相关文档

- [最终用户安装说明](docs/INSTALL.md)
- [macOS 打包说明](BUILD_MACOS.md)
- [快速上下文](docs/QUICK_CONTEXT.md)
- [当前执行上下文](PROJECT_CONTEXT.md)
- [历史实现轨迹](docs/CHANGELOG_AGENT.md)
