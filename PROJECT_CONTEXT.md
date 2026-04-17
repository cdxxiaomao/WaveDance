# WaveDance 当前执行上下文（精简版）

> 文档类型：执行基线文档（当前状态唯一事实来源）  
> 维护目标：仅保留“当前目标、当前能力、当前默认参数、下一步任务”。  
> 关联文档：`docs/QUICK_CONTEXT.md` | `docs/CHANGELOG_AGENT.md` | `BUILD_MACOS.md`

## 当前目标

1. 维持 macOS 系统音频频谱可视化主链路稳定可用。
2. 保持“浮层置顶/全屏可见”能力可切换。
3. 将 UI 交互做成可配置、可拖动、可发布的实用工具形态。
4. 为后续签名与正式分发保留清晰发布路径。

## 当前架构快照

- 桌面壳：`Tauri v2`（`src-tauri`）。
- 后端核心：Rust（采集、FFT 分析、配置命令）。
- 前端：Vite + JS + WebGL（实时频谱绘制）。
- 音频来源：优先 `BlackHole` 回环，采集线程推送 `waveform-frame` 事件。
- 渲染语义：左低频 -> 右高频。

## 当前关键能力

- 频谱参数动态调节：
  - 分桶数量（8~256）
  - 分桶模式（`log` / `linear`）
  - 高频补偿（0~200%）
  - 频率下限/上限
- 浮层能力：
  - 透明、无边框、可置顶
  - 全屏辅助行为（macOS 原生窗口增强）
  - 全局快捷键召回（默认 `Cmd+Shift+Option+W`）
  - 置顶模式开关（运行中可切换）
- 交互能力：
  - 显式拖动条
  - 后端原生命令触发窗口拖动
  - body 背景颜色 / 透明度 / 模糊度实时可调
- 鼠标穿透（锁定）：
  - 主窗整窗忽略鼠标时，可点击区域迁至独立子窗 `main-toolbar`（`toolbar.html`）
  - 全局快捷键切换穿透：`Cmd+Shift+Option+L`（与召回 `W` 并列）
  - 子窗定位：逻辑坐标（点）适配 Retina / 4K / 多显示器；`Moved` / `Resized` / `ScaleFactorChanged` 时自动重贴主窗视口右上
  - macOS：主窗 `configure_overlay` 与 `toolbar.show()` 分主线程顺序，避免竞态导致子窗偶发不显

## 当前默认参数（可快速核对）

- 召回快捷键：`Cmd+Shift+Option+W`
- 鼠标穿透切换：`Cmd+Shift+Option+L`
- 置顶模式：默认开启
- 频谱默认：
  - 分桶：64
  - 模式：`log`
  - 高频补偿：35%
  - 频率范围：20Hz ~ 12000Hz

## 打包与运行入口

- 开发运行：`cargo tauri dev`
- 一键打包：`./scripts/build-macos.sh`
- 打包文档：`BUILD_MACOS.md`

## 当前已知注意点

- macOS 权限异常时优先检查麦克风授权与 `Info.plist` 配置。
- 安装版若无采集数据，优先做权限重置与旧版清理。
- 浮层覆盖在不同全屏应用上可能存在系统差异，优先使用快捷键召回。
- 多显示器、异 DPI（如 1920 外接 + 4K + 内建 Retina）下穿透解锁条依赖主窗 `scale_factor` 与逻辑定位；异常时先确认系统「显示器」缩放与主窗所在屏。

## 下一步候选任务（按优先级）

1. 外观参数持久化（重启后保留背景颜色/透明度/模糊度）。
2. 增加用户可配置快捷键（避免系统冲突；含穿透 `L` 与召回 `W`）。
3. 完善异常提示与自检（权限、设备、快捷键占用）。
4. 发布流程增强：签名 + notarization。

## 近期进度摘要（截至 2026-04-18）

- 已完成：穿透锁定链路、独立浮动解锁窗、多屏与 HiDPI 对齐、与主窗锁定按钮垂直微调对齐。
- 相关代码入口：`src-tauri/src/main.rs`（`position_main_toolbar_window`、`sync_main_toolbar_for_passthrough_locked`、`wire_main_window_toolbar_follow`）、`frontend/toolbar.html` / `toolbar.js`、`frontend/src/main.js`（主窗锁定与事件同步）。

## 历史追溯

- 历史实现轨迹：`docs/CHANGELOG_AGENT.md`

