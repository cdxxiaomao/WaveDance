# WaveDance 快速上下文

> 文档类型：快速启动卡片（开工前 30 秒阅读）  
> 维护目标：只保留“当前能做什么 + 关键默认值 + 常用命令”。  
> 关联文档：`PROJECT_CONTEXT.md` | `docs/CHANGELOG_AGENT.md` | `BUILD_MACOS.md`

## 一句话

WaveDance 是一个 macOS 浮层频谱工具：采集系统音频并实时显示可调频谱。

## 现在能做什么

- 系统音频实时频谱（BlackHole 路线）
- 分桶 / 模式 / 高频补偿 / 频率区间动态调节
- **28 种展示模式**（设置页切换，每窗独立持久化），分两组：
  - **Vanilla WebGL（16）** — 自研 WebGL renderer，不含 Three.js
    - 2D：`line` · `bar` · `area` · `gradientBar` · `glowLine` · `glowCircle` · `radial` · `waterfall` · `dotRing` · `oscilloscope`
    - 2.5D / 3D：`obliqueBar` · `depthLayers` · `isometricSkyline` · `ring3d` · `terrain3d` · `helix3d`
  - **Three 高阶（12）** — `renderers/three/`，依赖 `three` + `postprocessing`
    - A：`threePlasmaField` · `threeParticleGalaxy` · `threeBloomTunnel` · `threeEnergySphere`
    - B：`threeKaleidoscope` · `threeGlitchSpectrum` · `threePhosphorTrail` · `threeScanGrid`
    - C：`threeLiquidBlob` · `threeAuroraRibbon` · `threeBreathingRings` · `threeNoiseLandscape`
- 透明无边框浮层 + 全屏可见（macOS 增强）
- 置顶模式开关 + 快捷键召回
- 鼠标穿透锁定：主窗穿透后主操作在子窗 `toolbar.html` 解锁；快捷键 `⌘⇧⌥L` 切换
- body 外观可调（背景色、透明度、模糊）

## 关键默认值

- 召回快捷键：`Cmd+Shift+Option+W`
- 穿透锁定切换：`Cmd+Shift+Option+L`
- 分桶：64
- 模式：`log`
- 高频补偿：35%
- 频率范围：20~12000Hz

## 常用命令

- 开发：`cargo tauri dev`
- 打包：`./scripts/build-macos.sh`

## 文档入口

- 当前执行上下文：`PROJECT_CONTEXT.md`
- 可视化模式扩展方案：`docs/VISUALIZATION_MODES_PLAN.md`
- 历史变更记录：`docs/CHANGELOG_AGENT.md`
- 打包说明：`BUILD_MACOS.md`
