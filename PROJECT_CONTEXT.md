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
- 展示模式（WebGL，设置页切换，多频谱窗独立配置）：
  - `line` 线状图 · `bar` 柱状图 · `area` 填充波形
  - `gradientBar` 渐变频谱柱 · `glowLine` 霓虹发光线 · `glowCircle` 霓虹圆形
  - `radial` 圆形频谱 · `waterfall` 瀑布频谱 · `dotRing` 环形圆点
  - 渲染器位于 `frontend/src/renderers/`；Schema 见 `frontend/src/visualizationSchema.js`
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

1. **可视化 3D / 2.5D 扩展**（Phase 9~14，见 `docs/VISUALIZATION_MODES_PLAN.md`）：
   - 首批推荐：斜透视频谱柱（Phase 9）→ 多层景深（Phase 10）→ 3D 旋转圆环（Phase 12，需 `gl3d.js`）
2. **示波器模式**（Phase 8，可选）：需 Rust 后端推送时域波形 `time_samples`。
3. 外观参数持久化（重启后保留背景颜色/透明度/模糊度）。
4. 增加用户可配置快捷键（避免系统冲突；含穿透 `L` 与召回 `W`）。
5. 完善异常提示与自检（权限、设备、快捷键占用）。
6. 发布流程增强：签名 + notarization。

## 近期进度摘要（截至 2026-06-09）

### 已完成（最近一个实现阶段）

- **2D 可视化模式扩展 Phase 0~6 已全部交付**（详见 `docs/VISUALIZATION_MODES_PLAN.md`）：
  - 公共基础：`shapePipeline.js`、`shaderUtils.js`、`rendererMap` 分发
  - 9 种展示模式：线/柱/填充波形/渐变频谱柱/霓虹发光线/霓虹圆形/圆形频谱/瀑布频谱/环形圆点
  - 各模式设置页 panel、事件推送、localStorage 持久化、多频谱窗独立配置
- **Phase 7 文档同步**：`README.md`、`QUICK_CONTEXT.md`、`PROJECT_CONTEXT.md` 已补充展示模式说明。

### 代码影响范围（便于快速定位）

- 可视化 Schema：`frontend/src/visualizationSchema.js`
- 渲染器目录：`frontend/src/renderers/`（`lineRenderer`、`barRenderer`、`areaRenderer`、`gradientBarRenderer`、`glowLineRenderer`、`glowCircleRenderer`、`radialRenderer`、`waterfallRenderer`、`dotRingRenderer` 及 `polar.js`、`shapePipeline.js`）
- 主窗分发与事件：`frontend/src/main.js`
- 设置页：`frontend/settings.html`、`frontend/settings.js`

### 当前验证结论

- 设置页切换展示模式后主窗实时渲染，重启后配置保留。
- 线/柱原有行为无回归；`freqReversed`、镜像、峰值线等模式专属选项可用。
- 瀑布模式分桶数变化不 crash；静默时画面干净。

### 下一步建议（与当前进度衔接）

1. 启动 Phase 9 斜透视频谱柱（2.5D 首个模式），或按需先做 Phase 8 示波器（需后端）。
2. 完成外观参数持久化（背景颜色 / 透明度 / 模糊度重启可恢复）。
3. 提供快捷键自定义（重点覆盖召回 `W` 与穿透 `L`，减少系统冲突）。

## 历史追溯

- 历史实现轨迹：`docs/CHANGELOG_AGENT.md`

