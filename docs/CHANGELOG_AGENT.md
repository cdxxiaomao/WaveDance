# WaveDance Agent 变更日志

> 文档类型：历史变更日志（按阶段追溯）  
> 维护目标：完整记录实现过程，不在此处维护“当前状态”。  
> 关联文档：`docs/QUICK_CONTEXT.md` | `PROJECT_CONTEXT.md` | `BUILD_MACOS.md`

> 说明：本文件用于保留历史实现轨迹与阶段性进度。`PROJECT_CONTEXT.md` 只保留当前执行上下文。

## 2026-06-10（续）

### 可视化模式扩展 — Phase 26：呼吸光环 Three Breathing Rings（C）

- 新建 `frontend/src/renderers/three/breathingRingsRenderer.js`：多层同心 `TorusGeometry`，peak 驱动分层缩放脉冲 + 慢速自转，`MeshBasicMaterial` additive + 可选 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeBreathingRings` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-breathing-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 呼吸光环」、`#threeBreathingRingsConfigPanel`（光环颜色、层数、基础半径/层间距、呼吸强度、管径、自转、Bloom、形状四件套）。

## 2026-06-10（续）

### 可视化模式扩展 — Phase 25：极光飘带 Three Aurora Ribbon（C）

- 新建 `frontend/src/renderers/three/auroraRibbonRenderer.js`：`CatmullRomCurve3` + `TubeGeometry` 3D 飘带，控制点每帧 noise 偏移，各 ribbon 绑定不同频带 aggregate 驱动 hue 与摆动，`MeshBasicMaterial` additive + 可选 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeAuroraRibbon` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-aurora-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 极光飘带」、`#threeAuroraRibbonConfigPanel`（低/高能量色、飘带数量/宽度、波浪幅度/速度、低频带偏移、自转、Bloom、形状四件套）。

## 2026-06-10（续）

## 2026-06-10（续）

## 2026-06-10（续）

### 可视化模式扩展 — Phase 24：液态球体 Three Liquid Blob（C）

- 新建 `frontend/src/renderers/three/liquidBlobRenderer.js`：metaball SDF 全屏 raymarch 近似多 blob 融合，低频驱动体积脉动 + 可选 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeLiquidBlob` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-liquid-blob-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 液态球体」、`#threeLiquidBlobConfigPanel`（主/副色、球体数量、融合强度、摆动速度、低频驱动、Bloom、形状四件套）。

### 可视化模式扩展 — Phase 23：扫描网格 Three Scan Grid（B）

- 新建 `frontend/src/renderers/three/scanGridRenderer.js`：3D 线框网格 + 频谱驱动竖条高度 + `u_scanZ` 扫描光束高亮 + 可选 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeScanGrid` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-scan-grid-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 扫描网格」、`#threeScanGridConfigPanel`（网格/高亮/光束色、行列数、扫描速度、高亮强度、相机俯角、Bloom、形状四件套）。

### 可视化模式扩展 — Phase 22：磷光余辉 Three Phosphor Trail（B）

- 新建 `frontend/src/renderers/three/phosphorTrailRenderer.js`：全屏频谱线 shader + `EffectComposer`（自定义 `AfterimagePass` 磷光拖尾 + 可选 Bloom）；`registerModes.js` 注册。
- `postProcessing.js`：新增 `AfterimagePass`、`decayPercentToDamp`、`createPhosphorTrailComposer`；暗部快速衰减，透明背景友好。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threePhosphorTrail` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-phosphor-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 磷光余辉」、`#threePhosphorTrailConfigPanel`（线条/辉光色、线宽、余辉衰减、Bloom、镜像、形状四件套）。

### 可视化模式扩展 — Phase 21：故障频谱 Three Glitch Spectrum（B）

- 新建 `frontend/src/renderers/three/glitchSpectrumRenderer.js`：全屏频谱柱 shader 基底 + `EffectComposer`（`GlitchEffect` + `ScanlineEffect`），peak 超阈值触发 glitch 脉冲、RGB 分离与扫描线；`registerModes.js` 注册。
- `postProcessing.js`：新增 `createGlitchSpectrumComposer`（rgbSplitPx=0 时禁用 chromatic aberration）。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeGlitchSpectrum` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-glitch-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 故障频谱」、`#threeGlitchSpectrumConfigPanel`（基底色/故障强度/RGB 分离/扫描线/触发阈值/冷却/形状四件套）。

### 可视化模式扩展 — Phase 20：万花筒 Three Kaleidoscope（B）

- 新建 `frontend/src/renderers/three/kaleidoscopeRenderer.js`：全屏 shader 极坐标万花筒镜像（`foldAngle` + 频谱 DataTexture 驱动径向条与 hue 染色）、旋转速度与 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeKaleidoscope`、`normalizeKaleidoscopeSegments` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-kaleidoscope-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 万花筒」、`#threeKaleidoscopeConfigPanel`（对称瓣数/低高能量色/旋转/频谱驱动/Bloom/形状四件套）。

### 可视化模式扩展 — Phase 19：能量球 Three Energy Sphere（A）

- 新建 `frontend/src/renderers/three/energySphereRenderer.js`：高分段二十面体 CPU 顶点形变（频谱 band 采样 + 噪声调制）、外层粒子光晕、peak 呼吸缩放、可选线框叠加与 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeEnergySphere` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-sphere-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 能量球」、`#threeEnergySphereConfigPanel`（核心/光晕色/形变/噪声/光晕粒子/自转/线框/Bloom/形状四件套）。

### 可视化模式扩展 — Phase 18：能量隧道 Three Bloom Tunnel（A/D）

- 新建 `frontend/src/renderers/three/bloomTunnelRenderer.js`：第一人称隧道（两侧频谱能量墙 Shader + DataTexture 历史滚动、中心脉冲核心球体、能量驱动减速/加速），可选 Bloom；`registerModes.js` 注册。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeBloomTunnel` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-tunnel-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 能量隧道」、`#threeBloomTunnelConfigPanel`（墙双色/核心色/速度/频段数/核心脉冲/FOV/Bloom/形状四件套）。

### 可视化模式扩展 — Phase 17：粒子银河 Three Particle Galaxy（A/D）

- 新建 `frontend/src/renderers/three/particleGalaxyRenderer.js`：盘状螺旋银河点云（bass 向心收拢、treble 噪声扩散），可选 Bloom；超 15000 粒子时降 DPR 并限 30fps 位置更新。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threeParticleGalaxy` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-galaxy-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 粒子银河」、`#threeParticleGalaxyConfigPanel`（颜色/数量/半径/旋臂/低频收拢/高频扩散/自转/Bloom/形状四件套）。

### 可视化模式扩展 — Phase 16：等离子场 Three Plasma Field（A/D）

- 新建 `frontend/src/renderers/three/plasmaFieldRenderer.js`：全屏 ShaderMaterial 等离子（simplex noise + bass/mid/treble 驱动），可选 Bloom 后处理；`registerModes.js` 注册至 `threeModeRegistry`。
- `visualizationSchema.js`：新增 `DEFAULT_CONFIG.threePlasmaField` 及 storage keys / `windowStorageKeys`。
- `main.js`：监听 `waveform-three-plasma-*` 事件，持久化加载，`getStyleConfigForMode` / `getShapeConfigForMode` 分支。
- `settings.html` / `settings.js`：展示模式「Three 高阶 → 等离子场」、`#threePlasmaFieldConfigPanel`（双色/速度/噪声/频谱驱动/Bloom/形状四件套）。

## 2026-06-10

### 可视化模式扩展 — Phase 15：Three.js 公共基础设施

- `frontend/package.json`：新增依赖 `three`、`postprocessing`（pnpm）。
- 新建 `frontend/src/renderers/three/`：`threeContext.js`（WebGLRenderer/Scene/Camera + resize/dispose）、`threeBridge.js`（init/setMode/render 桥接）、`spectrumUniforms.js`（bass/mid/treble + 256 宽 spectrum 纹理 + 8 band 峰值）、`postProcessing.js`（EffectComposer + Bloom 工厂）、`threeModeRegistry.js`（lazy 模式注册表）。
- `visualizationSchema.js`：注册 12 个 Three 模式 enum、`THREE_DISPLAY_MODES` 数组、`isThreeDisplayMode()`；`normalizeDisplayMode` 识别 Three 模式 id。
- `main.js`：vanilla/Three 互斥渲染分支（`syncRenderBackend`、`renderVanillaFrame` / `renderThreeFrame`）；切换模式时 lose/recreate WebGL context；vanilla renderer 可重建。
- `settings.html`：展示模式下拉预留 `<optgroup label="Three 高阶">`（Phase 16 起填 option）。

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

### 可视化模式扩展 — Phase 5：瀑布频谱 Waterfall

- 新建 `frontend/src/renderers/waterfallRenderer.js`：`Float32Array` 环形历史缓冲 + `gl.TEXTURE_2D` 动态纹理 + 全屏 quad；fragment shader 按幅度 `mix(colorLow, colorHigh)` 着色；支持历史深度、滚动速度、行间距、`freqReversed`；分桶数变化时自动重置 history。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.waterfall`、`DEFAULT_CONFIG.waterfall` 及 waterfall 相关 storage keys。
- `main.js`：注册 waterfallRenderer，监听 `waveform-waterfall-*` 事件，加载持久化配置。
- `settings.html` / `settings.js`：展示模式增加「瀑布频谱」、`#waterfallConfigPanel`（低/高能量色/历史深度/滚动速度/行间距 + 形状四件套）。

### 可视化模式扩展 — Phase 6：环形圆点 Dot Ring

- 新建 `frontend/src/renderers/dotRingRenderer.js`：`aggregateBands` 频段聚合 + 屏幕对齐 square quad；复用 `polar.js` 定位圆环；点大小 `baseSize * (0.3 + 0.7 * amp)`、alpha 随幅度；强拍脉冲全局缩放。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.dotRing`、`DEFAULT_CONFIG.dotRing` 及 dotRing 相关 storage keys。
- `main.js`：注册 dotRingRenderer，监听 `waveform-dot-ring-*` 事件，加载持久化配置。
- `settings.html` / `settings.js`：展示模式增加「环形圆点」、`#dotRingConfigPanel`（圆点色/圆环半径/圆点数量/点大小/强拍脉冲 + 形状四件套）。

## 2026-06-09（续）

### 可视化模式扩展 — Phase 14：3D 螺旋频谱 Helix3D（真 3D）

- 新建 `frontend/src/renderers/helix3dRenderer.js`：频谱 band 聚合后沿 3D 螺旋分布，幅度驱动径向/高度挤出；线框小立方体作点、可选螺旋链 `LINE_STRIP`；复用 `gl3d.js` 相机与 Y 轴自转。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.helix3d`、`DEFAULT_CONFIG.helix3d`、`normalizeHelix3dExtrudeMode` 及 storage keys。
- `main.js`：注册 helix3dRenderer，监听 `waveform-helix3d-*` 事件，持久化加载。
- `settings.html` / `settings.js`：展示模式增加「3D 螺旋频谱」、`#helix3dConfigPanel`（点色/半径/螺距/圈数/点数/挤出模式/点大小/螺旋链/自转/相机、形状四件套）。

### 可视化模式扩展 — Phase 13：3D 频谱地形 Terrain3D（真 3D）

- 新建 `frontend/src/renderers/terrain3dRenderer.js`：环形历史 buffer + band 聚合，生成 3D 网格地形；线框/填充双模式，俯视相机，Z 轴向观众滚动；复用 `gl3d.js` 矩阵与线框 program。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.terrain3d`、`DEFAULT_CONFIG.terrain3d` 及 storage keys。
- `main.js`：注册 terrain3dRenderer，监听 `waveform-terrain3d-*` 事件，持久化加载。
- `settings.html` / `settings.js`：展示模式增加「3D 频谱地形」、`#terrain3dConfigPanel`（双色/线框色、格点密度、历史深度、滚动、线框/填充、地形高度、相机俯角/距离、自动滚动、形状四件套）。

### 可视化模式扩展 — Phase 12：3D 旋转圆环 Ring3D（真 3D）

- 新建 `frontend/src/renderers/gl3d.js`：轻量 mat4（perspective/lookAt/rotateY/multiply）、`createCamera` 自动旋转、`createWireframeProgram` / `createBasicLitProgram`。
- 新建 `frontend/src/renderers/ring3dRenderer.js`：频谱聚合为环上 3D 柱体，线框/实心双模式，Y 轴自转 + peak 呼吸缩放；复用 `polar.slotToAngle`。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.ring3d`、`DEFAULT_CONFIG.ring3d` 及 storage keys。
- `main.js`：注册 ring3dRenderer，扩展 `render(..., frameMeta)` 传入 `{ peak, rms }`，监听 `waveform-ring3d-*` 事件，持久化加载。
- `settings.html` / `settings.js`：展示模式增加「3D 旋转圆环」、`#ring3dConfigPanel`（柱色/内外径/柱高/柱数/线框/填充/自转/相机/峰值呼吸、形状四件套）。

### 可视化模式扩展 — Phase 11：等距天际线 Isometric Skyline（2.5D）

- 新建 `frontend/src/renderers/isometric.js`：等距投影 `isoProject`、建筑三面几何 `buildIsoBuilding`。
- 新建 `frontend/src/renderers/isometricSkylineRenderer.js`：频谱聚合为建筑高度，三面明暗 + 画家算法排序，可选地面平行四边形；支持 `freqReversed`。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.isometricSkyline`、`DEFAULT_CONFIG.isometricSkyline` 及 storage keys。
- `main.js`：注册 isometricSkylineRenderer，监听 `waveform-isometric-skyline-*` 事件，持久化加载。
- `settings.html` / `settings.js`：展示模式增加「等距天际线」、`#isometricSkylineConfigPanel`（三面颜色、建筑宽/间距/数量、地平线、地面开关、形状四件套）。

### 可视化模式扩展 — Phase 10：多层景深 Depth Layers（2.5D）

- 新建 `frontend/src/renderers/depthLayersRenderer.js`：多层视差（缩放/Y 偏移/透明度递减），支持低频靠前频段强调、`line`/`bar` 两种绘制样式，远→近绘制顺序。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.depthLayers`、`DEFAULT_CONFIG.depthLayers`、`normalizeDepthLayersRenderStyle` 及 storage keys。
- `main.js`：注册 depthLayersRenderer，监听 `waveform-depth-layers-*` 事件，持久化加载。
- `settings.html` / `settings.js`：展示模式增加「多层景深」、`#depthLayersConfigPanel`（层数/间距/远层缩放与透明度、低频靠前、近远层颜色、绘制样式、线宽、形状四件套）。

### 可视化模式扩展 — Phase 9：斜透视频谱柱 Oblique Bar（2.5D）

- 新建 `frontend/src/renderers/bandAggregate.js`：频谱桶 band 聚合（`dotRingRenderer` 改为复用）。
- 新建 `frontend/src/renderers/obliqueBarRenderer.js`：透视缩放 + 深度明暗 + 可选地面参考线；支持 `displayBarCount` 聚合与 `freqReversed`。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.obliqueBar`、`DEFAULT_CONFIG.obliqueBar` 及 storage keys。
- `main.js`：注册 obliqueBarRenderer，监听 `waveform-oblique-bar-*` 事件，持久化加载。
- `settings.html` / `settings.js`：展示模式增加「斜透视频谱柱」、`#obliqueBarConfigPanel`（近/远柱色、柱宽/间距、倾角、显示条数、地面线、镜像、形状四件套）。

### 可视化模式扩展 — Phase 8：示波器 Oscilloscope

- `src/audio_processing/mod.rs`：`WaveformFrame` 新增 `time_samples` 字段；导出 `TIME_DOMAIN_SAMPLE_COUNT`（512）与 `downsample_time_domain`。
- `src-tauri/src/main.rs`：采集线程从 mono 缓冲降采样 512 点时域波形，随 `waveform-frame` 一并推送。
- 新建 `frontend/src/renderers/oscilloscopeRenderer.js`：`LINE_STRIP` 时域波形 + 可选磷光拖尾（衰减混合缓冲）。
- `visualizationSchema.js`：新增 `DISPLAY_MODES.oscilloscope`、`DEFAULT_CONFIG.oscilloscope` 及 storage keys。
- `main.js`：注册 oscilloscopeRenderer，监听 `waveform-oscilloscope-*` 事件，oscilloscope 模式使用 `time_samples` 渲染。
- `settings.html` / `settings.js`：展示模式增加「示波器」、`#oscilloscopeConfigPanel`（波形色/线宽/磷光拖尾/衰减）。

### 可视化模式扩展 — Phase 7：文档与 README 更新

- `README.md`：效果预览章节补充 9 种展示模式说明表，项目特性注明多模式可切换。
- `docs/QUICK_CONTEXT.md`：「现在能做什么」补充展示模式列表，文档入口增加 `VISUALIZATION_MODES_PLAN.md`。
- `PROJECT_CONTEXT.md`：关键能力补充 9 种展示模式；下一步候选任务同步为 Phase 8/9~14；近期进度摘要更新至 2026-06-09。
