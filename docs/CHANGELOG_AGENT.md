# WaveDance Agent 变更日志

> 文档类型：历史变更日志（按阶段追溯）  
> 维护目标：完整记录实现过程，不在此处维护“当前状态”。  
> 关联文档：`docs/QUICK_CONTEXT.md` | `PROJECT_CONTEXT.md` | `BUILD_MACOS.md`

> 说明：本文件用于保留历史实现轨迹与阶段性进度。`PROJECT_CONTEXT.md` 只保留当前执行上下文。

## 2026-04-14 ~ 2026-04-16

### 初始规划与架构

- 明确项目目标：macOS 系统音频回采、实时可视化、解耦、性能、可打包发布。
- 决策：
  - D1：`Tauri + Rust + 前端 Web`。
  - D2：系统音频优先 `BlackHole` 路线。
  - D3：渲染优先 `WebGL`。
  - D4：先保证实时性和稳定性，再追求视觉特效。

### 第 1 阶段：Rust 模块化骨架

- 落地模块：
  - `application`：主流程编排。
  - `audio_capture`：采集抽象与实现。
  - `audio_processing`：波形提取、峰值/RMS、历史缓存。
  - `visualization`：渲染抽象与控制台实现（早期占位）。
  - `platform`：macOS 设备/环境检查。
- 建立测试样例与可运行入口。

### 第 2 阶段：真实采集替换

- 引入 `cpal`，新增 `MacSystemAudioSource`。
- 优先匹配设备名含 `BlackHole`，未命中时回退系统默认输入。
- 采集失败时提供开发兜底（模拟音源）保证链路不中断。

### 第 3 阶段：Tauri + WebGL 前后端打通

- 初始化 `src-tauri` 与 `frontend`。
- 后端命令：
  - `start_waveform_stream`
  - `stop_waveform_stream`
- 事件推送：
  - `waveform-frame`
  - `waveform-status`
  - `waveform-error`
- 前端 WebGL 实时绘制接入。

### 第 4 阶段：可调参数与频谱化

- 新增运行中动态配置：
  - 分桶数量（8~256）。
  - 分桶模式（`log` / `linear`）。
  - 高频补偿（0~200%）。
  - 频率区间（下限/上限）。
- 从时域包络切换为频域 FFT 分析：
  - 横轴语义更新为左低频 -> 右高频。
  - 支持对数/线性频段映射。

### 第 5 阶段：低延迟优化

- 缓冲改短窗口保留（约 240ms）。
- 读取前主动丢弃积压旧数据，优先实时性。

### 第 6 阶段：打包与发布链路

- 修正 Tauri 打包配置：
  - `frontendDist`
  - `dmg/app` 目标
  - 应用图标
  - `identifier: com.wavedance.desktop`
- 新增：
  - `scripts/build-macos.sh`
  - `BUILD_MACOS.md`
- 解决生产构建问题（前端 top-level await 改为 `init()`）。
- 成功构建并验证 `.app` / `.dmg` 产物。

### 第 7 阶段：权限链路修复

- 增加 `Info.plist` 并配置：
  - `NSMicrophoneUsageDescription`
- 解决安装版不出现麦克风权限项的问题。

### 第 8 阶段：Snipaste 风格浮层增强

- 窗口形态：
  - 透明
  - 无边框
  - 置顶
  - `macOSPrivateApi`
- macOS 原生 `NSWindow` 强化：
  - 高层级（逐步提升到 `screen saver level`）
  - `CanJoinAllSpaces`
  - `FullScreenAuxiliary`
  - `CanJoinAllApplications`
  - `orderFrontRegardless`
- 激活策略切到 `Accessory`。
- 添加全局快捷键召回（当前：`Cmd+Shift+Option+W`）。
- `Info.plist` 增加 `LSUIElement`，贴近工具型应用。

### 第 9 阶段：交互与拖动修复

- 新增“置顶模式”开关（运行时切换钉住/普通模式）。
- 为拖动新增显式拖动条。
- 拖动最终改为后端原生命令触发：
  - `start_window_dragging`
- 解决在透明浮层下前端拖动 API 不稳定问题。

### 第 10 阶段：外观配置增强

- 新增 body 外观控制：
  - 背景颜色选择器
  - 背景透明度可调
  - 背景模糊度可调
- 所有外观参数实时生效。

## 2026-04-17 ~ 2026-04-18

### 第 11 阶段：鼠标穿透与浮动解锁条（多屏 / HiDPI）

- 主窗在「穿透锁定」下整窗忽略鼠标；可点击 UI 迁至子窗口 `main-toolbar`（`toolbar.html`），与主窗工具栏语义一致（图标 + 解锁文案）。
- 后端命令：`set_main_mouse_passthrough_locked` / `get_main_mouse_passthrough_locked`；事件 `mouse-passthrough-changed` 同步主窗与子窗。
- 全局快捷键：`Cmd+Shift+Option+L` 切换穿透状态（与召回 `W` 并存）。
- 子窗定位与尺寸改为**逻辑坐标（点）** `set_position` / `set_size`，解决 Retina、4K 外接与多显示器下物理像素与子窗 DPI 不一致导致的错位。
- 主窗 `Moved` / `Resized` / `ScaleFactorChanged` 时重算子窗位置；macOS 上主线程投递避免与 `configure_overlay_window`（`setIgnoresMouseEvents` 等）竞态导致子窗偶发不显示。
- 垂直方向按设备像素微调（`NUDGE_UP_DEVICE_PX`），与主窗锁定按钮视觉对齐。

## 2026-06-09

### 可视化模式扩展 — Phase 0：公共基础重构

- 新建 `frontend/src/renderers/shapePipeline.js`：抽取 gain→缓落→gamma→smooth 共用逻辑（line 保留 NDC 映射后再 smooth 的旧行为）。
- 新建 `frontend/src/renderers/shaderUtils.js`：`compileShader` / `createProgram` 去重。
- `lineRenderer.js`、`barRenderer.js` 改用上述公共模块，视觉行为不变。
- `main.js`：引入 `RENDERERS` 映射表及 `getShapeConfigForMode` / `getStyleConfigForMode`，替换 displayMode 硬分支。
- `settings.js`：`applyDisplayModePanels` 改为基于 `MODE_PANEL_IDS` 循环显隐面板，便于后续扩展。

### 可视化模式扩展 — Phase 1：填充波形 Area

- 新建 `frontend/src/renderers/areaRenderer.js`：`TRIANGLE_STRIP` 半透明填充 + 顶边线，支持镜像对称、纵向渐变、`freqReversed`。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.area`、`DEFAULT_CONFIG.area` 及 area 相关 storage keys；导出 `normalizeDisplayMode()`。
- `main.js`：注册 areaRenderer，监听 `waveform-area-*` 事件，加载持久化配置。
- `settings.html` / `settings.js`：展示模式增加「填充波形」、`#areaConfigPanel` 及全套控件。

### 可视化模式扩展 — Phase 2：渐变频谱柱 Gradient Bar

- 新建 `frontend/src/renderers/gradientBarRenderer.js`：复用柱状图几何布局，顶点 attribute `a_freqT` 驱动 `mix(colorLow, colorHigh)` 频率渐变；峰值保持线独立纯色 shader。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.gradientBar`、`DEFAULT_CONFIG.gradientBar` 及全套 storage keys；导出 `readGradientBarPeakHoldMode()`。
- `main.js`：注册 gradientBarRenderer，监听 `waveform-gradient-bar-*` 事件，加载持久化配置。
- `settings.html` / `settings.js`：展示模式增加「渐变频谱柱」、`#gradientBarConfigPanel`（双色选择器 + 柱宽/间距/方向/镜像/峰值线 + 形状四件套）。

### 可视化模式扩展 — Phase 3：霓虹发光线 Glow Line

- 新建 `frontend/src/renderers/glowLineRenderer.js`：多 pass `LINE_STRIP` 外晕（逐层加宽、递减 alpha）+ 核心亮线；静默时跳过绘制；光晕强度为 0 时退化为普通线。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.glowLine`、`DEFAULT_CONFIG.glowLine` 及 glowLine 相关 storage keys。
- `main.js`：注册 glowLineRenderer，监听 `waveform-glow-line-*` 事件，加载持久化配置。
- `settings.html` / `settings.js`：展示模式增加「霓虹发光线」、`#glowLineConfigPanel`（核心色/光晕色/线宽/光晕半径/光晕强度 + 形状四件套）。

### 可视化模式扩展 — Phase 4：圆形频谱 Radial

- 新建 `frontend/src/renderers/polar.js`：`polarToNdc`、`slotToAngle`、`slotAngleRange`、`getAspectScale`，按 min(w,h) 保持正圆。
- 新建 `frontend/src/renderers/radialRenderer.js`：频谱桶沿圆周扇形条（梯形 TRIANGLES），支持内/外径、角向柱宽、镜像对称、旋转、顺时针、`freqReversed`。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.radial`、`DEFAULT_CONFIG.radial` 及 radial 相关 storage keys。
- `main.js`：注册 radialRenderer，监听 `waveform-radial-*` 事件，加载持久化配置。
- `settings.html` / `settings.js`：展示模式增加「圆形频谱」、`#radialConfigPanel`（柱体色/内径/外径/柱宽/旋转/镜像/顺时针 + 形状四件套）。
