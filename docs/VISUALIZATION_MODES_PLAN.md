# WaveDance 可视化模式扩展 — 分阶段实现方案

> **文档类型**：实现指导手册（Agent / 开发者跨会话接力用）  
> **创建日期**：2026-06-09  
> **状态**：Phase 0~14 已全部完成；Phase 15~27 为 Three.js 高阶扩展（待实施）  
> **关联文档**：`PROJECT_CONTEXT.md` | `docs/QUICK_CONTEXT.md` | `frontend/src/visualizationSchema.js`

---

## 1. 文档用途

本方案将「扩展更多炫酷可视化类型」拆成**可独立交付的小阶段**。每次实现会话只需：

1. 打开本文档，找到「当前进度」与下一个未勾选的 Phase；
2. 只完成该 Phase 范围内的任务，**不要跨 Phase 一次性全做**；
3. 完成后更新本文档底部的「进度追踪」勾选状态；
4. 在 `docs/CHANGELOG_AGENT.md` 追加一条简短变更记录。

**原则**：每个 Phase 完成后应能 `cargo tauri dev` 正常运行、新模式可在设置页切换并实时渲染。

---

## 2. 现状基线（实施前必读）

### 2.1 数据流

```
Rust 采集线程 (src-tauri/src/main.rs)
  → FFT 分桶 → WaveformFrame { peak, rms, points[] }
  → emit("waveform-frame")
  → frontend main.js / settings.js 监听
  → WebGL renderer.render(latestPoints, shapeConfig, styleConfig)
```

- `points[]`：归一化频谱幅度，长度 = 分桶数（8~500，默认 64~256）
- `peak` / `rms`：全局能量，**主窗渲染器目前未使用**（settings 预览用）
- 频率语义：数组索引 0 = 低频，末尾 = 高频（可通过 `freqReversed` 反转显示）

### 2.2 现有渲染架构

| 文件 | 职责 |
|------|------|
| `frontend/src/renderers/common.js` | `clamp01`、`applyAdaptiveSmooth`、像素↔NDC 换算 |
| `frontend/src/renderers/lineRenderer.js` | 线状图，`LINE_STRIP` |
| `frontend/src/renderers/barRenderer.js` | 柱状图，`TRIANGLES` + 峰值保持线 |
| `frontend/src/renderers/areaRenderer.js` | 填充波形 |
| `frontend/src/renderers/gradientBarRenderer.js` | 渐变频谱柱 |
| `frontend/src/renderers/glowLineRenderer.js` | 霓虹发光线 |
| `frontend/src/renderers/glowCircleRenderer.js` | 霓虹圆形 |
| `frontend/src/renderers/radialRenderer.js` | 圆形频谱（`polar.js`） |
| `frontend/src/renderers/waterfallRenderer.js` | 瀑布频谱（历史纹理） |
| `frontend/src/renderers/dotRingRenderer.js` | 环形圆点 |
| `frontend/src/renderers/shapePipeline.js` | 共用频谱 shape 处理 |
| `frontend/src/renderers/shaderUtils.js` | shader 编译工具 |
| `frontend/src/renderers/polar.js` | 极坐标 / 宽高比 |
| `frontend/src/main.js` | 创建 renderer、`renderWaveform()` 分支、`listen` 事件 |
| `frontend/src/visualizationSchema.js` | `DISPLAY_MODES`、`DEFAULT_CONFIG`、`STORAGE_KEYS` |
| `frontend/settings.html` + `settings.js` | 展示模式选择与各模式配置面板 |
| `frontend/src/renderers/three/` | **Phase 15 起**：Three.js 高阶模式（与 vanilla 隔离） |

### 2.3 渲染器约定（新 renderer 必须遵守）

```js
/**
 * @param {WebGLRenderingContext} gl
 * @returns {{ render: Function }}
 */
export function createXxxRenderer(gl) {
  // 内部持有：program、buffer、easedState（缓落状态数组）
  const render = (points, shapeConfig, styleConfig) => {
    // points: number[]  原始频谱桶
    // shapeConfig: { gainPercent, smoothPercent, softClipPercent, fallEasePercent }
    // styleConfig: 模式专属样式 + 通用 freqReversed: boolean
  };
  return { render };
}
```

**shape 处理顺序**（与 line/bar 保持一致，便于用户习惯迁移）：

1. `raw = clamp01(points[i] * gain)`
2. 缓落：`followed = raw >= prev ? raw : prev + (raw - prev) * fallBlend`
3. 柔化：`Math.pow(followed, softGamma)`
4. `applyAdaptiveSmooth(samples, smoothPercent)`

### 2.4 设置页事件模式

- 设置页通过 `emitVisual(eventName, payload)` 推送到目标频谱窗（`main` 或 `spectrum-{n}`）
- 主窗在 `main.js` 用 `listen(eventName, handler, { target: thisWebviewTarget })` 接收
- 持久化：`writeWindowStorageString(localStorage, windowLabel, prop, value)`
- 展示模式切换事件：`visualization-display-mode`

---

## 3. 目标架构（Phase 0 完成后）

### 3.1 新增展示模式枚举

```js
// visualizationSchema.js — 目标终态
export const DISPLAY_MODES = {
  line: "line",
  bar: "bar",
  area: "area",           // Phase 1
  gradientBar: "gradientBar", // Phase 2
  glowLine: "glowLine",   // Phase 3
  radial: "radial",       // Phase 4
  waterfall: "waterfall", // Phase 5
  dotRing: "dotRing",     // Phase 6
  glowCircle: "glowCircle",
  // --- 3D / 2.5D 扩展 ---
  obliqueBar: "obliqueBar",           // Phase 9  斜透视频谱柱（2.5D）
  depthLayers: "depthLayers",         // Phase 10 多层景深（2.5D）
  isometricSkyline: "isometricSkyline", // Phase 11 等距天际线（2.5D）
  ring3d: "ring3d",                   // Phase 12 3D 旋转圆环（真 3D）
  terrain3d: "terrain3d",             // Phase 13 3D 频谱地形（真 3D）
  helix3d: "helix3d",                 // Phase 14 3D 螺旋（真 3D）
  // --- Three.js 高阶扩展（Phase 15~27，不改动上述 vanilla 模式）---
  // 方案 A / D：霓虹宇宙
  threePlasmaField: "threePlasmaField",         // Phase 16
  threeParticleGalaxy: "threeParticleGalaxy",   // Phase 17
  threeBloomTunnel: "threeBloomTunnel",         // Phase 18
  threeEnergySphere: "threeEnergySphere",       // Phase 19
  // 方案 B：赛博故障
  threeKaleidoscope: "threeKaleidoscope",       // Phase 20
  threeGlitchSpectrum: "threeGlitchSpectrum",   // Phase 21
  threePhosphorTrail: "threePhosphorTrail",     // Phase 22
  threeScanGrid: "threeScanGrid",               // Phase 23
  // 方案 C：有机流体
  threeLiquidBlob: "threeLiquidBlob",           // Phase 24
  threeAuroraRibbon: "threeAuroraRibbon",       // Phase 25
  threeBreathingRings: "threeBreathingRings",  // Phase 26
  threeNoiseLandscape: "threeNoiseLandscape",   // Phase 27
  // oscilloscope: "oscilloscope", // Phase 8（需后端）
};
```

### 3.2 main.js 渲染分发（目标形态）

```js
// renderWaveform() 内 switch 或 rendererMap
const RENDERERS = {
  line: lineRenderer,
  bar: barRenderer,
  area: areaRenderer,
  // ...
};

function renderWaveform() {
  resizeCanvas();
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const renderer = RENDERERS[displayMode] ?? lineRenderer;
  const shapeConfig = getShapeConfigForMode(displayMode);
  const styleConfig = getStyleConfigForMode(displayMode);
  renderer.render(latestPoints, shapeConfig, styleConfig);
  requestAnimationFrame(renderWaveform);
}
```

### 3.3 建议新增公共模块

| 新文件 | 用途 |
|--------|------|
| `frontend/src/renderers/shapePipeline.js` | 从 line/bar 抽离共用的 gain→缓落→gamma→smooth 逻辑 |
| `frontend/src/renderers/polar.js` | 极坐标辅助（Phase 4、6、12 共用） |
| `frontend/src/renderers/shaderUtils.js` | compileShader、createProgram 去重 |
| `frontend/src/renderers/gl3d.js` | **Phase 12 起**：mat4 透视/视图矩阵、简单 camera（真 3D 共用） |
| `frontend/src/renderers/isometric.js` | **Phase 11**：等距投影坐标换算（2.5D） |
| `frontend/src/renderers/bandAggregate.js` | 频谱桶聚合（小窗降密度，3D 模式建议 32~64 条） |

### 3.4 3D / 2.5D 扩展原则（Phase 9~14 必读）

| 类型 | 代表 Phase | 技术 | 透明浮层建议 |
|------|-----------|------|-------------|
| **2.5D 伪 3D** | 9、10、11 | 仍用 2D NDC + 透视缩放/明暗/层叠 | ⭐⭐⭐ 友好 |
| **轻量真 3D** | 12、13、14 | `gl3d.js` + mesh + 简单光照 | ⭐⭐ 优先线框/发光边，避免大面积半透明 solid |

- **数据**：六种模式均只需 `points[]`；可选 `peak`/`rms` 做整体缩放或呼吸（扩展 `render` 第四参数 `frameMeta`）。
- **密度**：小浮窗建议 UI 暴露「显示条数」或对 256+ 桶做 band 聚合，避免 3D 噪点。
- **自转**：真 3D 模式默认慢速绕 Y 轴旋转（3~10°/s），设置页提供开关与速度滑块。
- **后端**：无需改 Rust（与 Phase 8 示波器独立）。

### 3.5 Three.js 高阶扩展原则（Phase 15~27 必读）

> **硬性约束**：Three.js **仅用于 Phase 15~27 新增模式**；Phase 0~14 已有 renderer **禁止回改**为 Three 实现。

| 项 | 约定 |
|----|------|
| **依赖** | `three` + `postprocessing`（按需 import pass，勿全量打包） |
| **目录** | `frontend/src/renderers/three/` 独立子目录 |
| **渲染分支** | `main.js`：`isThreeMode(displayMode)` → `threeBridge.render()`；否则走现有 vanilla |
| **Canvas** | Three 与 vanilla **共用** `#waveCanvas` 或独立 overlay canvas（优先共用，切换模式时 dispose 旧 context） |
| **透明** | `WebGLRenderer({ alpha: true, antialias: true })` + `setClearColor(0x000000, 0)` |
| **数据** | 仍用 `points[]` + 可选 `frameMeta: { peak, rms }`；经 `spectrumUniforms.js` 聚合 bass/mid/treble |
| **shape** | 各 Three 模式保留 shape 四件套（gain/smooth/softClip/fallEase），在 CPU 侧 `shapePipeline` 预处理后再传 uniform |
| **设置页** | `settings.html` 展示模式下拉增加 `<optgroup label="Three 高阶">` |
| **包体积** | 桌面 Tauri 可接受 +~500KB；vite 构建时对 three 做 side-effect 友好 import |

**Three renderer 约定**（与 vanilla 不同，允许 dispose）：

```js
/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 * @returns {{ render: Function, dispose: Function }}
 */
export function createThreeXxxRenderer(ctx) {
  const render = (points, shapeConfig, styleConfig, frameMeta) => { /* ctx.renderer.render(scene, camera) */ };
  const dispose = () => { /* geometry/material/composer.dispose */ };
  return { render, dispose };
}
```

**方案包对照**（12 个独立模式，方案 D 为 A 的子集）：

| 方案包 | 风格 | Phase | 模式 |
|--------|------|-------|------|
| **A 霓虹宇宙** | MV / 宇宙 | 16~19 | plasma、galaxy、tunnel、sphere |
| **B 赛博故障** | Glitch / Retro | 20~23 | kaleidoscope、glitch、phosphor、scanGrid |
| **C 有机流体** | 艺术 / 柔和 | 24~27 | liquidBlob、aurora、breathingRings、noiseLandscape |
| **D 精选三件套** | 均衡试水 | 16~18 | plasma、galaxy、tunnel（⊂ A，无独立 Phase） |

---

## 4. 分阶段任务详情

---

### Phase 0：公共基础重构（前置，约 0.5~1 天）

> **目标**：降低后续每个新 renderer 的重复代码；不改变用户可见行为。

#### 任务清单

- [x] **0.1** 新建 `shapePipeline.js`
  - 导出 `processSpectrumPoints(points, shapeConfig, easedStateRef)` → `Float32Array`
  - 从 `lineRenderer.js`、`barRenderer.js` 复制现有逻辑，行为保持一致
- [x] **0.2** 新建 `shaderUtils.js`
  - 导出 `compileShader(gl, type, source)`、`createProgram(gl, vs, fs)`
  - line/bar renderer 改用此工具（回归测试：线/柱视觉无变化）
- [x] **0.3** 重构 `main.js`
  - 引入 `rendererMap` 或等价结构，替换 `if (displayMode === "bar")` 硬分支
  - 预留 `getShapeConfigForMode` / `getStyleConfigForMode` 函数骨架
- [x] **0.4** 重构 `settings.js` 的 `applyDisplayModePanels`
  - 改为根据 `displayMode` 显示/隐藏对应 panel（目前仅 line/bar 两个 panel）
  - 预留 `MODE_PANEL_IDS` 映射表，方便后续加 panel
- [x] **0.5** 回归验证
  - 线/柱切换、颜色、峰值线、镜像、freqReversed 均正常
  - 多频谱窗（`spectrum-{n}`）独立配置仍有效

#### 验收标准

- 无新增可视化模式，但代码结构已为扩展就绪
- `cargo tauri dev` 无 console 报错

---

### Phase 1：填充波形 Area（约 1~2 天）

> **效果**：线型曲线 + 基线以下半透明填充，可选纵向渐变。

#### 1.1 配置 Schema

```js
// visualizationSchema.js 追加
area: {
  fillColor: "#c4a574",      // 填充主色
  fillAlphaPercent: 45,      // 填充透明度 0~100
  lineColor: "#c4a574",      // 顶边线颜色（可与填充同色）
  lineWidthPx: 2,
  mirrorEnabled: false,      // 中心对称填充
  gradientEnabled: true,     // 基线→峰值方向渐变
  shape: { gainPercent: 50, smoothPercent: 28, softClipPercent: 22, fallEasePercent: 68 },
}
```

Storage keys 追加：`areaColor`、`areaFillAlpha`、`areaLineWidth`、`areaMirror`、`areaGradient`、`areaShape`

#### 1.2 新建 `areaRenderer.js`

- [x] Vertex：与 line 相同计算 `ys[]`，额外生成 `TRIANGLE_STRIP` 或两个 `TRIANGLE` 组成填充区域
- [x] 基线：非镜像 `y = -1`；镜像 `y = 0` 上下各填一半
- [x] Fragment shader：
  - uniform `u_fillColor`、`u_fillAlpha`
  - optional：`v_height` varying 实现渐变（底部深、顶部浅）
- [x] 顶边线：复用 line 绘制逻辑或同 pass 后 draw `LINE_STRIP`
- [x] 支持 `freqReversed`

#### 1.3 集成改动

| 文件 | 改动 |
|------|------|
| `visualizationSchema.js` | `DISPLAY_MODES.area`、`DEFAULT_CONFIG.area`、storage keys |
| `main.js` | 注册 areaRenderer、listen 事件、load storage |
| `settings.html` | `<option value="area">填充波形</option>` + `#areaConfigPanel` |
| `settings.js` | panel 显隐、控件绑定、emit/sync |

#### 1.4 设置页控件（areaConfigPanel）

- 填充颜色、线条颜色、线条粗细
- 填充透明度滑块
- 镜像对称开关
- 渐变开关
- 增益 / 平滑 / 峰值柔化 / 下落缓动（与 line 相同四件套）

#### 1.5 事件命名

| 事件 | payload |
|------|---------|
| `waveform-area-color` | `#rrggbb` |
| `waveform-area-fill-alpha` | `0~100` number |
| `waveform-area-line-color` | `#rrggbb` |
| `waveform-area-line-width` | `1~12` |
| `waveform-area-mirror` | boolean |
| `waveform-area-gradient` | boolean |
| `waveform-area-shape-config` | shape object |

#### 1.6 验收标准

- [x] 设置页选「填充波形」后主窗实时切换
- [x] 透明背景下填充不遮挡桌面内容过多（alpha 可调）
- [x] 镜像模式视觉正确
- [x] 重启后配置保留

---

### Phase 2：渐变频谱柱 Gradient Bar（约 1~2 天）

> **效果**：柱状图 + 按频率索引渐变着色（低→高双色或彩虹）。

#### 2.1 配置 Schema

```js
gradientBar: {
  colorLow: "#3b82f6",       // 低频色
  colorHigh: "#ec4899",      // 高频色
  widthPercent: 76,
  gapPercent: 18,
  headroomPercent: 6,
  orientation: "horizontal",
  mirrorEnabled: false,
  peakHoldMode: "single",    // 可复用 bar 峰值线逻辑
  peakColor: "#ffffff",
  peakFallSpeed: 35,
  peakThickness: 2,
  shape: { gainPercent: 62, smoothPercent: 18, softClipPercent: 12, fallEasePercent: 52 },
}
```

#### 2.2 新建 `gradientBarRenderer.js`

- [x] 顶点布局：复用 `barRenderer` 的 rect 生成
- [x] 每个顶点 attribute `a_freqT`（0~1 归一化频率位置）
- [x] Fragment：`mix(u_colorLow, u_colorHigh, a_freqT)` 或 smoothstep 彩虹
- [x] 峰值保持线：可直接 import barRenderer 内相关函数，或抽成 `peakHold.js`

#### 2.3 集成与设置页

- 参考 Phase 1 集成表，模式 id = `gradientBar`
- 设置 panel：双色选择器 + 继承 bar 的柱宽/间距/方向/镜像/峰值线
- **实现技巧**：bar 与 gradientBar 的 settings panel 可共享部分 HTML（复制后改 id 前缀）

#### 2.4 验收标准

- [x] 渐变随频率变化，反转频率方向后渐变方向同步
- [x] 峰值线仍可用
- [x] 与原生 bar 模式可自由切换

---

### Phase 3：霓虹发光线 Glow Line（约 2 天）

> **效果**：核心亮线 + 多层外晕，透明浮层上氛围感强。

#### 3.1 配置 Schema

```js
glowLine: {
  coreColor: "#c4a574",
  glowColor: "#c4a574",      // 可与 core 相同
  lineWidthPx: 2,
  glowRadiusPx: 8,           // 外晕半径 2~24
  glowIntensityPercent: 70,  // 外晕强度 0~100
  glowPasses: 4,             // 外晕层数 2~6（内部用，可不暴露 UI）
  shape: { gainPercent: 50, smoothPercent: 28, softClipPercent: 22, fallEasePercent: 68 },
}
```

#### 3.2 新建 `glowLineRenderer.js`

- [x] **方案 A（推荐）**：多 pass 绘制同一 `LINE_STRIP`
  - 从外到内：逐 pass 增大 lineWidth（用 ndc offset 模拟）、降低 alpha
  - 需开启 `gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)`
- [x] **方案 B**：单 shader 距离场（实现复杂，暂不优先）
- [x] 最内层 pass 用 `u_lineColor` alpha=1
- [x] 注意 WebGL `gl.lineWidth` 在多数平台仅支持 1；**必须用顶点偏移模拟线宽**（lineRenderer 已有 passes 逻辑，可复用）

#### 3.3 集成与设置页

- panel 控件：核心色、光晕色、线宽、光晕半径、光晕强度
- 可选：光晕强度为 0 时退化为普通线

#### 3.4 验收标准

- [x] 透明背景上可见柔和外晕
- [x] 高 glowRadius 时不明显卡顿（256 分桶下 fps 可接受）
- [x] 静默时（points 全 0）画面干净

---

### Phase 4：圆形频谱 Radial（约 2~3 天）

> **效果**：频谱桶沿圆周辐射，经典环形可视化。

#### 4.1 新建 `polar.js`（可与 Phase 6 共用）

```js
/** @returns {{ x: number, y: number }} NDC 坐标 */
export function polarToNdc(angleRad, radiusNdc) { ... }

/** 将 slot index 映射到角度，支持 freqReversed、rotationOffsetDeg */
export function slotToAngle(slot, len, { freqReversed, rotationOffsetDeg, clockwise }) { ... }
```

#### 4.2 配置 Schema

```js
radial: {
  barColor: "#8f7cff",
  innerRadiusPercent: 25,    // 内径占 min(w,h) 比例 0~80
  outerRadiusPercent: 90,    // 最大半径
  barThicknessPercent: 70,   // 角向「柱宽」
  mirrorEnabled: false,      // 内外双圈
  rotationOffsetDeg: 0,      // 起始旋转 -180~180
  clockwise: true,
  shape: { gainPercent: 62, smoothPercent: 18, softClipPercent: 12, fallEasePercent: 52 },
}
```

#### 4.3 新建 `radialRenderer.js`

- [x] 每个 bucket → 一段扇形条（梯形近似：四个顶点）
- [x] 幅度映射：内径 + normalized * (外径 - 内径)
- [ ] 可选：用 `peak`/`rms` 做整体 scale 呼吸（styleConfig 传入 frameMeta）
- [ ] **main.js 改动**：若要用 peak/rms，在 render 时传入 `{ peak, rms }`（扩展 render 签名第三参数 optional）

#### 4.4 集成与设置页

- 内径/外径/柱厚/旋转/顺时针/镜像
- 形状四件套

#### 4.5 验收标准

- [x] 圆形窗口与宽条窗口均居中、不变形（取 min 维度算半径）
- [x] 256 分桶时环上条数清晰可辨
- [x] freqReversed 改变条在环上的排列顺序

---

### Phase 5：瀑布频谱 Waterfall（约 3~4 天）

> **效果**：滚动历史热力图，横轴频率、纵轴时间。

#### 5.1 配置 Schema

```js
waterfall: {
  colorLow: "#0a0a12",       // 低能量
  colorHigh: "#8f7cff",      // 高能量
  historyRows: 64,           // 历史行数 16~128
  scrollEveryNFrames: 1,     // 每 N 帧滚动一行
  rowGapPercent: 0,          // 行间距
  shape: { gainPercent: 55, smoothPercent: 12, softClipPercent: 10, fallEasePercent: 40 },
}
```

#### 5.2 新建 `waterfallRenderer.js`

- [x] 内部状态：`history: Float32Array[historyRows * bucketCount]` 环形缓冲
- [x] 每帧：processSpectrumPoints → 写入当前行 → 指针下移
- [x] 渲染：
  - **方案 A**：`gl.TEXTURE_2D` 动态纹理 + 单个 fullscreen quad，fragment 按 UV 查 history
  - **方案 B**：每行一个 narrow quad（行数少时可接受）
- [x] 颜色映射在 fragment shader：`mix(lowColor, highColor, amp)`

#### 5.3 性能注意

- bucketCount=500 × historyRows=128 时优先纹理方案
- 窗口 resize 时重建纹理尺寸
- bucket 数变化时重置 history

#### 5.4 集成与设置页

- 历史深度、滚动速度、双色
- 形状四件套（smooth 不宜过高，否则瀑布拖影过重）

#### 5.5 验收标准

- [x] 音乐播放时可见向下滚动
- [x] 停止后逐渐静止而非花屏
- [x] 切换分桶数量不 crash

---

### Phase 6：环形圆点 Dot Ring（约 2 天）

> **效果**：圆周上圆点，振幅驱动半径/大小/亮度。

#### 6.1 配置 Schema

```js
dotRing: {
  dotColor: "#8f7cff",
  ringRadiusPercent: 75,
  dotCount: 32,              // 显示点数（对 points 做 band 聚合）
  dotSizePx: 6,
  pulseEnabled: true,        // 强拍时缩放脉冲
  shape: { gainPercent: 62, smoothPercent: 22, softClipPercent: 12, fallEasePercent: 55 },
}
```

#### 6.2 新建 `dotRingRenderer.js`

- [x] 聚合：`aggregateBands(points, dotCount)` → 长度 dotCount 数组
- [x] 每点：小 square quad 或 `POINTS`（Mac WebGL 点大小有限制，**推荐 quad**）
- [x] 点中心位置：`polar.js`；点半径 = baseSize * (0.3 + 0.7 * amp)
- [x] 可选 alpha = amp

#### 6.3 集成与设置页

- 圆环半径、圆点数量、点大小、脉冲开关、颜色

#### 6.4 验收标准

- [x] dotCount 调小后仍跟音乐节奏
- [x] 与 radial 模式视觉差异明显（点 vs 条）

---

### Phase 7：文档与 README 更新（约 0.5 天）

> 全部模式完成后统一做，**每完成一个 Phase 也可先更新 CHANGELOG**。

- [x] `README.md` 效果预览说明补充新模式名称
- [x] `docs/QUICK_CONTEXT.md` 补充展示模式列表
- [x] `PROJECT_CONTEXT.md`「下一步候选任务」同步
- [ ] 可选：录制 GIF 放入 `docs/images/`

---

### Phase 8（可选）：示波器 Oscilloscope — 需后端（约 4~5 天）

> **依赖**：Rust 额外推送时域波形，**仅在前端 Phase 1~6 完成后再做**。

#### 8.1 后端改动 `src-tauri/src/main.rs`

- [x] 扩展 `WaveformFrame` 或新事件 `waveform-time-domain`：
  ```rust
  struct WaveformFrame {
      peak: f32,
      rms: f32,
      points: Vec<f32>,        // 频谱桶（现有）
      time_samples: Vec<f32>,  // 新增：mono 时域，例如 512 点，归一化到 [-1,1]
  }
  ```
- [x] 从已有 `mono` buffer 降采样取 512 点（不必重复 FFT）

#### 8.2 前端 `oscilloscopeRenderer.js`

- [x] 滚动波形：`LINE_STRIP`，x 均匀分布，y = sample
- [x] 可选 phosphor 拖尾（alpha fade buffer）

#### 8.3 配置 Schema

```js
oscilloscope: {
  lineColor: "#c4a574",
  lineWidthPx: 2,
  phosphorEnabled: false,
  phosphorDecayPercent: 60,
}
```

---

## 4B. 3D / 2.5D 可视化扩展（Phase 9~14）

> **讨论来源**：2026-06-09 3D 效果方案评审。  
> **实施策略**：六种模式独立交付，建议按 Phase 编号顺序逐个实现、逐个看效果后再做下一个。  
> **推荐首批**：Phase 9（斜透视）→ Phase 10（景深）→ Phase 12（3D 圆环）；Phase 13 地形最炫但工作量最大。

---

### Phase 9：斜透视频谱柱 Oblique Bar（2.5D，约 2~3 天）

> **效果**：经典 Winamp / 街机风格——频谱柱从「远处地面」排列到「近处观众」，越远越窄越暗，越高柱体越高。  
> **3D 感来源**：透视缩放 + 深度明暗 + 可选地面参考线。

#### 9.1 配置 Schema

```js
obliqueBar: {
  barColor: "#8f7cff",
  barColorFar: "#4a4580",      // 远处柱色（暗）
  widthPercent: 76,
  gapPercent: 18,
  headroomPercent: 8,
  tiltDeg: 55,                 // 透视倾角 30~70
  depthLayers: 1,              // 1=单层斜透视；2~3 可叠多层 parallax（可选后续）
  showGroundLine: true,        // 地面参考斜线
  mirrorEnabled: false,
  displayBarCount: 0,          // 0=跟随分桶；>0 时聚合到此数量（小窗推荐 32~64）
  shape: { gainPercent: 62, smoothPercent: 18, softClipPercent: 12, fallEasePercent: 52 },
}
```

Storage keys 前缀：`obliqueBar*`（如 `obliqueBarColor`、`obliqueBarTilt`、`obliqueBarShape`）

#### 9.2 新建 `obliqueBarRenderer.js`

- [x] 复用 `barRenderer` / `shapePipeline` 的柱体 rect 生成
- [x] 透视映射：slot index → 伪深度 `t∈[0,1]`（远=0 近=1）
  - `scale = mix(farScale, 1, t)`，`yBase = mix(farY, nearY, t)`，`alpha/brightness = mix(farBright, 1, t)`
- [x] 柱高：`normalized[i] * maxHeight * scale`
- [x] 绘制顺序：**远 → 近**（先画远的，避免遮挡错误）
- [x] 可选地面线：一条 `LINE_STRIP` 斜线
- [x] `freqReversed` 改变左右/远近对应关系
- [x] 若 `displayBarCount > 0`：聚合后再透视（可抽 `bandAggregate.js`）

#### 9.3 集成与设置页

| 文件 | 改动 |
|------|------|
| `visualizationSchema.js` | `DISPLAY_MODES.obliqueBar`、`DEFAULT_CONFIG.obliqueBar`、storage keys |
| `main.js` | 注册 renderer、listen、load storage |
| `settings.html` | `<option value="obliqueBar">斜透视频谱柱</option>` + `#obliqueBarConfigPanel` |
| `settings.js` | panel 显隐、控件绑定、emit/sync |

设置控件：柱色、远色、柱宽/间距、倾角、地面线开关、显示条数、镜像、形状四件套。

#### 9.4 事件命名

| 事件 | payload |
|------|---------|
| `waveform-oblique-bar-color` | `#rrggbb` |
| `waveform-oblique-bar-color-far` | `#rrggbb` |
| `waveform-oblique-bar-tilt` | `30~70` number |
| `waveform-oblique-bar-display-count` | `0~128` number |
| `waveform-oblique-bar-ground-line` | boolean |
| `waveform-oblique-bar-mirror` | boolean |
| `waveform-oblique-bar-shape-config` | shape object |
| （柱宽/间距/headroom 可复用 bar 事件命名或独立前缀） | |

#### 9.5 验收标准

- [x] 小窗口（宽条浮层）下透视关系清晰，不糊成一片
- [x] 音乐停止后柱体缓落到底，无残留
- [x] 与 2D `bar` 模式可自由切换，配置独立持久化

---

### Phase 10：多层景深频谱 Depth Layers（2.5D，约 1~2 天）

> **效果**：同一频谱复制 3~5 层，每层不同伪深度——缩放、Y 偏移、透明度递减，形成舞台景深。  
> **3D 感来源**：视差（parallax）；可选低频层靠前、高频层靠后。

#### 10.1 配置 Schema

```js
depthLayers: {
  layerCount: 4,               // 层数 2~6
  color: "#8f7cff",
  colorFar: "#3d3866",         // 最远层色调
  layerSpacingPx: 6,           // 层间 Y 偏移（像素）
  farScalePercent: 72,         // 最远层缩放 50~90
  farAlphaPercent: 25,         // 最远层透明度
  bassFrontEnabled: true,      // true=低频层在前；false=高频在前
  lineWidthPx: 2,              // 每层绘制 line 或细 bar
  renderStyle: "line",         // "line" | "bar"
  shape: { gainPercent: 55, smoothPercent: 24, softClipPercent: 14, fallEasePercent: 58 },
}
```

#### 10.2 新建 `depthLayersRenderer.js`

- [x] `processSpectrumPoints` 一次，多层共用同一份 normalized 数据
- [x] 第 `layer` 层（0=最远）：`scale = mix(farScale, 1, layer/(N-1))`，`alpha = mix(farAlpha, 1, …)`，`yOffset = layer * spacingNdc`
- [x] `bassFrontEnabled`：可对 points 做 band 分群，每层 emphasis 不同频段（远层偏高频、近层偏低频）
- [x] 绘制顺序：远 → 近；开启 `gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`
- [x] `renderStyle=line` 复用 glowLine 的 stroke mesh 思路；`bar` 复用窄 rect

#### 10.3 集成与设置页

- panel：层数、层间距、远层缩放/透明度、低频靠前开关、线宽、颜色、形状四件套

#### 10.4 事件命名

| 事件 | payload |
|------|---------|
| `waveform-depth-layers-count` | `2~6` |
| `waveform-depth-layers-spacing` | px number |
| `waveform-depth-layers-far-scale` | `50~90` |
| `waveform-depth-layers-far-alpha` | `0~100` |
| `waveform-depth-layers-bass-front` | boolean |
| `waveform-depth-layers-color` | `#rrggbb` |
| `waveform-depth-layers-render-style` | `"line"` \| `"bar"` |
| `waveform-depth-layers-shape-config` | shape object |

#### 10.5 验收标准

- [x] 层间视差随音乐明显，但不遮挡桌面过多（远层足够淡）
- [x] layerCount=2 与 layerCount=6 均稳定
- [x] 静默时各层归零干净

---

### Phase 11：等距城市天际线 Isometric Skyline（2.5D，约 2~3 天）

> **效果**：每个频谱桶对应一栋「建筑」，30° 等距投影；高低随幅度变化，三面明暗不同。  
> **风格**：复古 / synthwave 城市轮廓，透明背景友好。

#### 11.1 新建 `isometric.js`

```js
/** 等距：屏幕 (x,y) 来自 世界 (wx, wy, wz) */
export function isoProject(wx, wy, wz) { ... }  // 返回 NDC 或中间坐标

/** 建筑 box 六个可见面的顶点（仅绘制 top + left + right 三面） */
export function buildIsoBuilding(wx, wz, height, width) { ... }
```

#### 11.2 配置 Schema

```js
isometricSkyline: {
  faceTopColor: "#8f7cff",
  faceLeftColor: "#6b5fd4",    // 暗面
  faceRightColor: "#a898ff",   // 亮面
  buildingWidthPx: 8,
  buildingGapPx: 2,
  skylineBaselinePercent: 15,  // 地平线位置
  displayBuildingCount: 48,    // 聚合建筑数 16~96
  showGroundPlane: true,
  shape: { gainPercent: 60, smoothPercent: 16, softClipPercent: 10, fallEasePercent: 50 },
}
```

#### 11.3 新建 `isometricSkylineRenderer.js`

- [x] `aggregateBands(points, displayBuildingCount)` → 每栋高度
- [x] 每栋建筑：三个 quad（顶面菱形 + 左侧面 + 右侧面），`TRIANGLES` 绘制
- [x] 绘制顺序：按 `wx+ wz` 排序（画家算法，远建筑先画）
- [x] 地面：可选一个浅色等距平行四边形
- [x] 不支持 mirror；`freqReversed` 反转建筑左右排列

#### 11.4 集成与设置页

- panel：三面颜色、建筑宽/间距、建筑数量、地平线、地面开关、形状四件套

#### 11.5 验收标准

- [x] 宽窗口下天际线连续，窄窗口聚合后仍可读
- [x] 三面明暗有体积感，不像 flat bar
- [x] 停止音乐后建筑高度缓落

---

### Phase 12：3D 旋转圆环 Ring3D（真 3D，约 3~4 天）

> **效果**：频谱条变为 3D 扇形柱体，排列成圆环，绕 Y 轴慢速自转。  
> **依赖**：本 Phase **首次引入** `gl3d.js`，供 Phase 13、14 复用。

#### 12.0 新建 `gl3d.js`（本 Phase 必做）

- [x] 轻量 mat4：`perspective(fov, aspect, near, far)`、`lookAt(eye, center, up)`、`rotateY(rad)`、`multiply`
- [x] 导出 `createCamera({ distance, fovDeg, autoRotateSpeedDeg })`，每帧 `autoRotateSpeedDeg * deltaTime` 更新
- [x] Vertex shader 统一：`uniform mat4 u_mvp`；不传 Three.js，保持零依赖
- [x] 可选：`createBasicLitProgram(gl)` — 简单 directional light（`u_normal`、`u_lightDir`）

#### 12.1 配置 Schema

```js
ring3d: {
  barColor: "#8f7cff",
  innerRadius: 0.35,           // 世界单位 0.1~0.8
  outerRadius: 0.95,
  barHeightScale: 0.8,         // 幅度 → 柱高上限
  barThicknessDeg: 4,          // 每根柱角宽（聚合后）
  displayBarCount: 48,
  wireframeEnabled: true,      // 透明浮层默认线框
  fillEnabled: false,          // 实心面（与线框二选一或叠加）
  autoRotateEnabled: true,
  autoRotateSpeedDeg: 6,       // 1~20
  cameraDistance: 2.2,
  cameraFovDeg: 45,
  breatheWithPeak: true,       // 用 peak 做整体 scale
  shape: { gainPercent: 62, smoothPercent: 18, softClipPercent: 12, fallEasePercent: 52 },
}
```

#### 12.2 新建 `ring3dRenderer.js`

- [x] 聚合 `points` → `displayBarCount` 根柱
- [x] 每柱：环上位置 `(angle, innerR)` → 挤出到 `height` 的 box 或 quad 条（8 顶点 × 柱数）
- [x] MVP = projection × view × model（model 含 `rotateY`）
- [x] **main.js**：render 时传入 `frameMeta: { peak, rms }`（扩展 renderer 签名，旧 renderer 忽略即可）
- [x] 线框模式：`gl.drawElements(LINES, …)` 或 `TRIANGLES` + 仅 edge 色
- [x] 复用 `polar.js` 的 `slotToAngle` 算环上角度

#### 12.3 集成与设置页

- panel：内外径、柱高、柱数、线框/实心、自转开关与速度、相机距离、peak 呼吸、形状四件套

#### 12.4 验收标准

- [x] 圆环在正方形/宽条窗口均居中，aspect 正确
- [x] 自转关闭时静止，开启时速度可调
- [x] 256 分桶 + displayBarCount=48 时 fps 可接受

---

### Phase 13：3D 频谱地形 Terrain3D（真 3D，约 4~5 天）

> **效果**：网格地毯在 perspective 相机前展开，X=频率、Z=时间历史、Y=幅度，音乐驱动地形起伏并向观众滚动。  
> **关联**：历史 buffer 逻辑可复用 `waterfallRenderer` 思路。

#### 13.1 配置 Schema

```js
terrain3d: {
  colorLow: "#1a1a2e",
  colorHigh: "#8f7cff",
  wireframeColor: "#c4b5fd",
  gridCols: 64,                // 频率方向格点（聚合后）
  gridRows: 48,                // 时间历史行数
  scrollEveryNFrames: 1,
  wireframeEnabled: true,      // 透明浮层强烈推荐默认开
  fillEnabled: false,
  terrainHeightScale: 0.35,
  cameraPitchDeg: 55,            // 俯视角度 30~75
  cameraDistance: 2.8,
  autoScrollEnabled: true,
  shape: { gainPercent: 55, smoothPercent: 12, softClipPercent: 10, fallEasePercent: 40 },
}
```

#### 13.2 新建 `terrain3dRenderer.js`

- [x] 环形历史 buffer：`gridRows × gridCols`（同 waterfall）
- [x] 每帧写入最新一行频谱（聚合到 gridCols）→ 滚动 Z
- [x] 生成 `(gridCols × gridRows)` mesh 顶点 + 索引；Y = amp × heightScale
- [x] 线框：绘制 grid lines；填充：按高度 gradient 着色 fragment
- [x] 相机固定轻微俯视，网格向 -Z 滚动（`textureOffset` 或顶点 Z 偏移）
- [x] resize / bucket 变化时 reset buffer

#### 13.3 集成与设置页

- panel：格点密度、历史深度、线框/填充、双色、地形高度、相机俯角、形状四件套

#### 13.4 验收标准

- [x] 播放时地形明显「扑面而来」滚动
- [x] 停止后历史逐渐平息，不花屏
- [x] 线框模式在透明桌面上清晰可辨

---

### Phase 14：3D 螺旋频谱 Helix3D（真 3D，约 4~5 天）

> **效果**：频谱点沿 3D 螺旋线分布，幅度驱动径向挤出或 Z 向拉伸；整根螺旋慢速旋转。  
> **注意**：小窗口易糊，务必做 band 聚合（推荐 24~48 点）。

#### 14.1 配置 Schema

```js
helix3d: {
  dotColor: "#8f7cff",
  helixRadius: 0.5,
  helixPitch: 0.35,            // 每圈螺距（世界单位）
  helixTurns: 2.5,             // 可见圈数 1~4
  displayPointCount: 32,
  extrudeMode: "radial",       // "radial" | "height" — 幅度映射方式
  pointSizePx: 8,
  wireframeEnabled: true,      // 点间连线成螺旋链
  autoRotateEnabled: true,
  autoRotateSpeedDeg: 8,
  cameraDistance: 2.5,
  shape: { gainPercent: 62, smoothPercent: 20, softClipPercent: 12, fallEasePercent: 55 },
}
```

#### 14.2 新建 `helix3dRenderer.js`

- [x] 聚合 points → `displayPointCount`
- [x] 第 i 点：角度 `θ = i/N * turns * 2π`，位置 `(R*cosθ, i/N*pitch*2 - pitch, R*sinθ)`，extrude 加幅度
- [x] 渲染：每点一个小 billboard quad（始终近似面向相机）或 3D 小球 mesh
- [x] 可选：相邻点 `LINE_STRIP` 连接成螺旋链（线框 glow 色）
- [x] 复用 `gl3d.js` camera + autoRotate

#### 14.3 集成与设置页

- panel：螺旋半径/螺距/圈数、点数、挤出模式、点大小、连线开关、自转、形状四件套

#### 14.4 验收标准

- [x] displayPointCount≤48 时小窗仍可辨认螺旋结构
- [x] 强节奏时径向/高度挤出明显
- [x] 与 ring3d 视觉差异清晰（螺旋 vs 平面圆环）

---

## 4C. Three.js 高阶可视化扩展（Phase 15~27）

> **讨论来源**：2026-06-09 Three.js 方案评审（方案 A/B/C/D 全部纳入）。  
> **实施策略**：Phase 15 公共层必须先做；之后按 Phase 编号逐个实现，**每个 Phase 只做一个模式**。  
> **推荐首批（方案 D）**：Phase 15 → 16 → 17 → 18，最快看到 Three 管线价值。  
> **npm 依赖**（仅前端）：`three`、`postprocessing`。

---

### Phase 15：Three.js 公共基础设施（约 1~2 天）

> **目标**：搭建 Three 渲染桥接层；**不新增用户可见模式**，完成后 vanilla 模式行为不变。

#### 15.1 安装依赖

```bash
cd frontend && npm install three postprocessing
```

#### 15.2 新建文件

| 文件 | 职责 |
|------|------|
| `renderers/three/threeContext.js` | 创建/销毁 `WebGLRenderer`、`Scene`、`PerspectiveCamera`；`resize(w,h)`；`dispose()` |
| `renderers/three/threeBridge.js` | 对外入口：`init(canvas)`、`setMode(modeId)`、`render(points, shape, style, frameMeta)` |
| `renderers/three/spectrumUniforms.js` | `points[]` → `{ bass, mid, treble, spectrumTexture, bandPeaks[8] }` |
| `renderers/three/postProcessing.js` | 封装 `EffectComposer` + `RenderPass` + 可选 `BloomEffect` 工厂 |
| `renderers/three/threeModeRegistry.js` | modeId → lazy `createThreeXxxRenderer` 映射 |

#### 15.3 任务清单

- [ ] **15.3.1** `package.json` 加入 `three`、`postprocessing`
- [ ] **15.3.2** `threeContext.js`：alpha 透明、pixelRatio 限制 `Math.min(devicePixelRatio, 2)`
- [ ] **15.3.3** `threeBridge.js`：切换 displayMode 时 `dispose()` 旧 Three renderer，vanilla 模式不初始化 Three
- [ ] **15.3.4** `main.js`：增加 `isThreeMode()`、`renderThreeFrame()` 分支；vanilla 与 Three **互斥**（同帧只走一条路径）
- [ ] **15.3.5** `visualizationSchema.js`：增加 `THREE_DISPLAY_MODES` 常量数组 + `isThreeDisplayMode(mode)`  helper（先注册 enum，无具体 panel）
- [ ] **15.3.6** `settings.html`：展示模式下拉预留 `<optgroup label="Three 高阶">`（Phase 16 起逐步填 option）
- [ ] **15.3.7** 回归：任意 vanilla 模式渲染与 Phase 15 前一致

#### 15.4 验收标准

- [ ] `cargo tauri dev` 启动无报错；现有模式全部正常
- [ ] 切换到未实现的 Three 模式时有 graceful fallback（console warn + 保持上一帧或 line 模式）
- [ ] resize / 多频谱窗独立切换模式不 leak（dispose 后 GPU 内存不持续增长）

---

### Phase 16：等离子场 Three Plasma Field（方案 A/D，约 2~3 天）

> **效果**：全屏 Shadertoy 风格噪声等离子，频谱驱动 hue 与扰动强度；小窗也好看。  
> **Three 价值**：`ShaderMaterial` + fullscreen quad，验证 Three 管线最快。

#### 16.1 配置 Schema

```js
threePlasmaField: {
  colorLow: "#1a0533",
  colorHigh: "#8f7cff",
  speed: 1.0,                  // 动画速度 0.2~3
  noiseScale: 2.5,             // 噪声频率 0.5~6
  reactiveness: 70,            // 频谱驱动强度 0~100
  bloomEnabled: true,
  bloomStrength: 0.8,          // 0~2
  shape: { gainPercent: 55, smoothPercent: 16, softClipPercent: 10, fallEasePercent: 50 },
}
```

设置页中文名：**等离子场**

#### 16.2 新建 `renderers/three/plasmaFieldRenderer.js`

- [ ] fullscreen `PlaneGeometry` + 自定义 fragment shader（simplex noise + 频谱 uniform）
- [ ] uniform：`u_time`、`u_bass`、`u_mid`、`u_treble`、`u_colorLow`、`u_colorHigh`
- [ ] 可选 Bloom：`postProcessing.js` 包裹
- [ ] `dispose()`：geometry、material、composer

#### 16.3 集成

- [ ] `DISPLAY_MODES.threePlasmaField`、`DEFAULT_CONFIG`、`STORAGE_KEYS`、`windowStorageKeys`
- [ ] `settings.html`：`#threePlasmaFieldConfigPanel` + optgroup option
- [ ] `settings.js`：panel 显隐、emit/sync
- [ ] 事件前缀：`waveform-three-plasma-*`

#### 16.4 验收标准

- [ ] 透明桌面背景上 plasma 流动，不填黑底
- [ ] 播放音乐时配色/扰动明显随频谱变化
- [ ] bloom 可关；关闭后仍可见

---

### Phase 17：粒子银河 Three Particle Galaxy（方案 A/D，约 3~4 天）

> **效果**：5000~20000 粒子成盘状银河，bass 收拢、treble 扩散，Bloom 辉光。  
> **与 ring3d 差异**：点云 + 粒子动力学，非几何柱体。

#### 17.1 配置 Schema

```js
threeParticleGalaxy: {
  particleColor: "#c4b5fd",
  particleCount: 12000,        // 2000~20000，默认按性能档
  galaxyRadius: 1.2,
  spiralArms: 2,             // 1~4
  bassPullStrength: 65,      // 0~100
  trebleSpreadStrength: 55,
  bloomEnabled: true,
  bloomStrength: 1.2,
  autoRotateSpeedDeg: 4,
  shape: { gainPercent: 60, smoothPercent: 20, softClipPercent: 12, fallEasePercent: 55 },
}
```

设置页中文名：**粒子银河**

#### 17.2 新建 `renderers/three/particleGalaxyRenderer.js`

- [ ] `THREE.Points` + `BufferGeometry`（position、初始 angle/radius attribute）
- [ ] 每帧 CPU 或 shader 更新：bass → 向心、treble → 噪声扩散
- [ ] `PointsMaterial`：`size`、`transparent`、`blending: AdditiveBlending`
- [ ] 性能：`particleCount` 超 15000 时降 DPR 或限 30fps 更新

#### 17.3 验收标准

- [ ] 强 bass 时粒子明显向中心聚拢
- [ ] 256 分桶 + 12000 粒子 macOS 浮窗 fps ≥ 30
- [ ] 与 dotRing / ring3d 视觉完全不同

---

### Phase 18：能量隧道 Three Bloom Tunnel（方案 A/D，约 3~4 天）

> **效果**：相机沿 Z 前进，两侧频谱能量墙，中心脉冲核心，隧道感 + Bloom。  
> **与 terrain3d / waterfall 差异**：第一人称飞行，非俯视地形/热力图。

#### 18.1 配置 Schema

```js
threeBloomTunnel: {
  wallColorLow: "#1a1a2e",
  wallColorHigh: "#8f7cff",
  coreColor: "#ffffff",
  tunnelSpeed: 1.0,            // 0.2~3
  wallSegments: 48,            // 频率聚合段数
  corePulseStrength: 70,
  bloomEnabled: true,
  bloomStrength: 1.0,
  fovDeg: 60,
  shape: { gainPercent: 58, smoothPercent: 14, softClipPercent: 10, fallEasePercent: 45 },
}
```

设置页中文名：**能量隧道**

#### 18.2 新建 `renderers/three/bloomTunnelRenderer.js`

- [ ] 两侧 `PlaneGeometry` 或 `CylinderGeometry`（半开）UV 滚动
- [ ] 频谱采样 → 墙顶高度/ emissive 贴图（动态 `DataTexture`）
- [ ] 中心 core：`MeshBasicMaterial` 球体，scale ∝ peak
- [ ] 相机 `position.z` 每帧递增 mod 隧道长度（无限循环）

#### 18.3 验收标准

- [ ] 前进感连续，无明显跳帧接缝
- [ ] 窄条浮窗下仍可见两侧能量墙
- [ ] 停止音乐后墙高缓落、隧道减速

---

### Phase 19：能量球 Three Energy Sphere（方案 A，约 3~4 天）

> **效果**：二十面体/球体顶点随频谱噪声形变，外圈 particle halo，整体 Bloom。  
> **与 threeParticleGalaxy 差异**：单一核心 mesh 形变 + 外晕，非全盘粒子。

#### 19.1 配置 Schema

```js
threeEnergySphere: {
  coreColor: "#8f7cff",
  haloColor: "#c4b5fd",
  deformStrength: 75,          // 顶点噪声幅度 0~100
  noiseSpeed: 1.2,
  haloParticleCount: 800,
  wireframeOverlay: false,
  bloomEnabled: true,
  bloomStrength: 1.0,
  autoRotateSpeedDeg: 6,
  shape: { gainPercent: 62, smoothPercent: 18, softClipPercent: 12, fallEasePercent: 52 },
}
```

设置页中文名：**能量球**

#### 19.2 新建 `renderers/three/energySphereRenderer.js`

- [ ] `IcosahedronGeometry` 高分段；vertex shader 或 CPU 每帧更新 position（simplex noise × spectrum band）
- [ ] 外层 `Points` halo 环绕
- [ ] 整体 scale 轻量随 `peak` 呼吸

#### 19.3 验收标准

- [ ] 形变随音乐节奏，非随机抖动
- [ ] wireframe 开关有效
- [ ] **方案 A（霓虹宇宙）四模式全部可切换**

---

### Phase 20：万花筒 Three Kaleidoscope（方案 B，约 2~3 天）

> **效果**：6/8 瓣镜像对称频谱图样，迷幻几何染色。  
> **与 radial 差异**：全屏 shader 对称，非圆环柱体。

#### 20.1 配置 Schema

```js
threeKaleidoscope: {
  segments: 8,                 // 4~12 偶数
  colorLow: "#3b82f6",
  colorHigh: "#ec4899",
  rotationSpeedDeg: 8,
  reactiveness: 75,
  bloomEnabled: true,
  bloomStrength: 0.6,
  shape: { gainPercent: 55, smoothPercent: 20, softClipPercent: 12, fallEasePercent: 55 },
}
```

设置页中文名：**万花筒**

#### 20.2 新建 `renderers/three/kaleidoscopeRenderer.js`

- [ ] fullscreen quad fragment：极坐标 + `mod(angle, 2π/segments)` 镜像
- [ ] 频谱 → 半径方向亮度或 hue

#### 20.3 验收标准

- [ ] segments 4/6/8/12 切换对称瓣数正确
- [ ] freqReversed 影响染色方向（若适用）

---

### Phase 21：故障频谱 Three Glitch Spectrum（方案 B，约 2~3 天）

> **效果**：强拍触发 RGB 分离、扫描线、块错位。  
> **Three 价值**：`postprocessing` GlitchPass / 自定义 RGB shift pass。

#### 21.1 配置 Schema

```js
threeGlitchSpectrum: {
  baseColor: "#8f7cff",
  glitchIntensity: 60,       // 0~100
  rgbSplitPx: 4,               // 0~12
  scanlineOpacity: 25,         // 0~100
  triggerThreshold: 55,      // peak 超阈值触发 glitch burst
  cooldownMs: 120,
  shape: { gainPercent: 60, smoothPercent: 12, softClipPercent: 8, fallEasePercent: 40 },
}
```

设置页中文名：**故障频谱**

#### 21.2 新建 `renderers/three/glitchSpectrumRenderer.js`

- [ ] 基底：频谱柱状 mesh 或 2D shader 条
- [ ] `EffectComposer`：RenderPass → GlitchPass（或自定义）→ 可选 Bloom
- [ ] peak 触发：`frameMeta.peak` 超阈值时 glitch 强度脉冲

#### 21.3 验收标准

- [ ] 强拍时 glitch 明显，弱段恢复干净
- [ ] rgbSplit=0 时无分离伪影
- [ ] 长时间运行无 composer leak

---

### Phase 22：磷光余辉 Three Phosphor Trail（方案 B，约 2~3 天）

> **效果**：频谱线长拖尾、霓虹残影，模拟 CRT 磷光。  
> **与 waterfall 差异**：发光残影而非热力历史图。

#### 22.1 配置 Schema

```js
threePhosphorTrail: {
  lineColor: "#c4a574",
  lineWidthPx: 3,
  decayPercent: 55,            // 余辉衰减 10~90（低=长拖尾）
  glowColor: "#8f7cff",
  bloomEnabled: true,
  bloomStrength: 0.9,
  mirrorEnabled: false,
  shape: { gainPercent: 50, smoothPercent: 22, softClipPercent: 14, fallEasePercent: 60 },
}
```

设置页中文名：**磷光余辉**

#### 22.2 新建 `renderers/three/phosphorTrailRenderer.js`

- [ ] `EffectComposer` + `AfterimagePass`（damp = f(decayPercent)）
- [ ] 每帧绘制当前频谱线（`Line` 或 ribbon mesh）到 composer
- [ ] 透明背景：Afterimage 仅累积亮部，暗部快速衰减

#### 22.3 验收标准

- [ ] decay 低时长拖尾，高时短促
- [ ] 静默后画面在 2s 内清干净
- [ ] 与 glowLine 并存不冲突（不同 displayMode）

---

### Phase 23：扫描网格 Three Scan Grid（方案 B，约 2~3 天）

> **效果**：3D 线框网格 + 扫描光束扫过，幅度驱动高亮行。  
> **风格**：Tron / 全息 HUD。

#### 23.1 配置 Schema

```js
threeScanGrid: {
  gridColor: "#4a4580",
  highlightColor: "#8f7cff",
  scanBeamColor: "#ffffff",
  gridRows: 32,
  gridCols: 48,
  scanSpeed: 1.0,
  highlightStrength: 70,
  bloomEnabled: true,
  bloomStrength: 0.7,
  cameraPitchDeg: 50,
  shape: { gainPercent: 58, smoothPercent: 14, softClipPercent: 10, fallEasePercent: 48 },
}
```

设置页中文名：**扫描网格**

#### 23.2 新建 `renderers/three/scanGridRenderer.js`

- [ ] `GridHelper` 或 custom `LineSegments` 地面网格
- [ ] 竖条高度 = 频谱聚合；扫描线 uniform `u_scanY` 循环
- [ ] 经过扫描线的格点 emissive 提高

#### 23.3 验收标准

- [ ] 扫描光束连续循环
- [ ] 频谱变化时格点高度实时更新
- [ ] **方案 B（赛博故障）四模式全部可切换**

---

### Phase 24：液态球体 Three Liquid Blob（方案 C，约 4~5 天）

> **效果**：多 blob 近似融合，低频驱动体积脉动。  
> **Three 价值**：vertex noise / 多 sphere 叠加 / marching 近似。

#### 24.1 配置 Schema

```js
threeLiquidBlob: {
  blobColor: "#8f7cff",
  blobColorSecondary: "#ec4899",
  blobCount: 3,                // 2~5
  mergeStrength: 65,           // 融合感 0~100
  wobbleSpeed: 1.0,
  bassDrive: 75,
  bloomEnabled: true,
  bloomStrength: 0.8,
  shape: { gainPercent: 62, smoothPercent: 22, softClipPercent: 14, fallEasePercent: 55 },
}
```

设置页中文名：**液态球体**

#### 24.2 新建 `renderers/three/liquidBlobRenderer.js`

- [ ] **方案**：3~5 个 `SphereGeometry` mesh + metaball 近似（fragment 内距离场混合）渲染到 fullscreen quad；或高分 sphere + vertex noise
- [ ] bass → 整体 scale + blob 间距
- [ ] 注意性能：blobCount>3 时降低 sphere 分段

#### 24.3 验收标准

- [ ] 低频段 blob 明显胀大
- [ ] 透明背景上边缘柔和，非硬边圆
- [ ] 本 Phase 为方案 C 最难项，可先 deliver 近似版再迭代

---

### Phase 25：极光飘带 Three Aurora Ribbon（方案 C，约 3~4 天）

> **效果**：3~5 条 3D 曲线飘带，频带分驱 hue 与摆动。  
> **与 helix3d 差异**：柔曲 ribbon，非螺旋点链。

#### 25.1 配置 Schema

```js
threeAuroraRibbon: {
  ribbonCount: 4,              // 2~6
  colorLow: "#3b82f6",
  colorHigh: "#a855f7",
  ribbonWidth: 0.08,
  waveAmplitude: 0.35,
  waveSpeed: 1.0,
  bassBandIndex: 0,            // 哪条带偏低频（内部映射）
  bloomEnabled: true,
  bloomStrength: 1.0,
  autoRotateSpeedDeg: 3,
  shape: { gainPercent: 58, smoothPercent: 24, softClipPercent: 14, fallEasePercent: 58 },
}
```

设置页中文名：**极光飘带**

#### 25.2 新建 `renderers/three/auroraRibbonRenderer.js`

- [ ] `CatmullRomCurve3` + `TubeGeometry` 或 custom strip mesh
- [ ] 控制点每帧 noise 偏移；不同 ribbon 绑定不同频带 aggregate
- [ ] `MeshBasicMaterial` transparent + additive

#### 25.3 验收标准

- [ ] 飘带柔和连续，无断裂
- [ ] 各 ribbon 颜色/摆动可区分

---

### Phase 26：呼吸光环 Three Breathing Rings（方案 C，约 2~3 天）

> **效果**：多层同心 Torus，peak 驱动缩放脉冲，慢速自转。  
> **与 ring3d 差异**：光滑圆环面，非频谱柱体。

#### 26.1 配置 Schema

```js
threeBreathingRings: {
  ringColor: "#8f7cff",
  ringCount: 5,                // 2~8
  baseRadius: 0.4,
  radiusStep: 0.15,
  pulseStrength: 70,           // peak 驱动 0~100
  tubeRadius: 0.02,
  bloomEnabled: true,
  bloomStrength: 0.9,
  autoRotateSpeedDeg: 5,
  shape: { gainPercent: 55, smoothPercent: 20, softClipPercent: 12, fallEasePercent: 52 },
}
```

设置页中文名：**呼吸光环**

#### 26.2 新建 `renderers/three/breathingRingsRenderer.js`

- [ ] 多个 `TorusGeometry` 同心嵌套
- [ ] `scale.setScalar(1 + pulseStrength * peak * layerFactor)` 分层差异化
- [ ] `MeshBasicMaterial` + Bloom

#### 26.3 验收标准

- [ ] 强拍时整体「呼吸」可见
- [ ] ringCount 增减即时生效

---

### Phase 27：噪声地貌 Three Noise Landscape（方案 C，约 3~4 天）

> **效果**：simplex 噪声基础地貌 + 频谱调制高度，比 terrain3d 更有机。  
> **与 terrain3d 差异**：噪声驱动 + 平滑曲面，非矩形历史网格。

#### 27.1 配置 Schema

```js
threeNoiseLandscape: {
  colorLow: "#1a1a2e",
  colorHigh: "#8f7cff",
  gridSize: 64,                // 32~96
  heightScale: 0.4,
  noiseScale: 1.8,
  scrollSpeed: 0.6,            // UV 滚动模拟前进
  wireframeOverlay: true,
  bloomEnabled: false,
  cameraPitchDeg: 55,
  shape: { gainPercent: 55, smoothPercent: 16, softClipPercent: 10, fallEasePercent: 45 },
}
```

设置页中文名：**噪声地貌**

#### 27.2 新建 `renderers/three/noiseLandscapeRenderer.js`

- [ ] `PlaneGeometry(gridSize, gridSize)` 顶点 Y = noise(x,z,t) + spectrumMod(x)
- [ ] 顶点色或 fragment 按高度 gradient
- [ ] 可选 wireframe overlay：`WireframeGeometry` 第二 pass

#### 27.3 验收标准

- [ ] 地貌连续滚动，无裂缝
- [ ] 频谱变化时局部隆起明显
- [ ] **方案 C（有机流体）四模式全部可切换**

---

### Phase 28（可选）：Three 模式文档与 README 更新（约 0.5 天）

> Phase 15~27 全部完成后执行（或每完成一个方案包更新 CHANGELOG）。

- [ ] `README.md` 补充 Three 高阶模式列表与依赖说明
- [ ] `docs/QUICK_CONTEXT.md` 展示模式分组（vanilla / Three）
- [ ] `docs/INSTALL.md` 第三方组件增加 `three`、`postprocessing`
- [ ] 可选：各模式 GIF 预览 `docs/images/three-*.gif`

---

## 5. 每个 Phase 标准实施步骤（复制粘贴用）

### 5.1 Vanilla 模式（Phase 0~14）

每次新会话实现某 Phase 时，按此顺序执行：

```
1. 读本文档对应 Phase 章节 + 第 2 节基线
2. git 确认工作区干净或知晓未提交改动
3. 新建 renderer 文件，先写最小可渲染版本（硬编码颜色）
4. 注册到 visualizationSchema.js → main.js → settings.html → settings.js
5. 实现 shapePipeline 接入
6. 补齐 settings 控件与 localStorage
7. 手动测试：切换模式、调参、重启持久化、freqReversed
8. 更新本文档「进度追踪」勾选
9. 更新 docs/CHANGELOG_AGENT.md
```

### 5.2 Three.js 模式（Phase 15~27）

```
1. 读 §3.5 + 对应 Phase 章节；若 Phase 15 未完成，必须先做 Phase 15
2. cd frontend && npm install（确认 three、postprocessing 已安装）
3. 在 renderers/three/ 新建 xxxRenderer.js，先 hardcode 最小 scene 验证出图
4. 注册到 threeModeRegistry.js + visualizationSchema.js + settings
5. spectrumUniforms + shapePipeline 预处理 points
6. 实现 dispose()；切换离开 Three 模式时 threeBridge 必须 dispose
7. 手动测试：透明背景、Bloom 开关、vanilla 模式不受影响、重启持久化
8. 更新进度追踪 + CHANGELOG
```

**禁止**：为 Three 模式去改 `lineRenderer.js` 等已有 vanilla 文件（除 main.js 分发分支与 schema 注册外）。

---

## 6. 文件改动矩阵（速查）

| Phase | 新建文件 | 必改文件 |
|-------|----------|----------|
| 0 | `shapePipeline.js`, `shaderUtils.js` | `lineRenderer.js`, `barRenderer.js`, `main.js`, `settings.js` |
| 1 | `areaRenderer.js` | `visualizationSchema.js`, `main.js`, `settings.html`, `settings.js` |
| 2 | `gradientBarRenderer.js` | 同上 |
| 3 | `glowLineRenderer.js` | 同上 |
| 4 | `polar.js`, `radialRenderer.js` | 同上 + `main.js` 可选传 peak/rms |
| 5 | `waterfallRenderer.js` | 同上 |
| 6 | `dotRingRenderer.js` | 同上（复用 `polar.js`） |
| 8 | `oscilloscopeRenderer.js` | `src-tauri/src/main.rs`, `wavedance` crate 若需改 struct |
| 9 | `obliqueBarRenderer.js`,（可选）`bandAggregate.js` | `visualizationSchema.js`, `main.js`, `settings.html`, `settings.js` |
| 10 | `depthLayersRenderer.js` | 同上 |
| 11 | `isometric.js`, `isometricSkylineRenderer.js` | 同上 |
| 12 | `gl3d.js`, `ring3dRenderer.js` | 同上 + `main.js` 传 `frameMeta` |
| 13 | `terrain3dRenderer.js` | 同上（复用 `gl3d.js`、历史 buffer 模式） |
| 14 | `helix3dRenderer.js` | 同上（复用 `gl3d.js`） |
| 15 | `renderers/three/*`（见 Phase 15.2 表） | `package.json`, `main.js`, `visualizationSchema.js`, `settings.html`, `settings.js` |
| 16 | `three/plasmaFieldRenderer.js` | 同上 + `threeModeRegistry.js` |
| 17 | `three/particleGalaxyRenderer.js` | 同上 |
| 18 | `three/bloomTunnelRenderer.js` | 同上 |
| 19 | `three/energySphereRenderer.js` | 同上 |
| 20 | `three/kaleidoscopeRenderer.js` | 同上 |
| 21 | `three/glitchSpectrumRenderer.js` | 同上 |
| 22 | `three/phosphorTrailRenderer.js` | 同上 |
| 23 | `three/scanGridRenderer.js` | 同上 |
| 24 | `three/liquidBlobRenderer.js` | 同上 |
| 25 | `three/auroraRibbonRenderer.js` | 同上 |
| 26 | `three/breathingRingsRenderer.js` | 同上 |
| 27 | `three/noiseLandscapeRenderer.js` | 同上 |
| 28 | — | `README.md`, `docs/QUICK_CONTEXT.md`, `docs/INSTALL.md` |

## 7. 推荐实施顺序与理由

| 顺序 | Phase | 理由 |
|------|-------|------|
| 1 | **Phase 0** | 不做好会指数级增加后续复制粘贴 |
| 2 | **Phase 1 Area** | 最简单的新模式，验证全流程 |
| 3 | **Phase 2 Gradient Bar** | 验证 shader 渐变 + 复用 bar 几何 |
| 4 | **Phase 3 Glow Line** | 验证 multi-pass / alpha blend |
| 5 | **Phase 4 Radial** | 引入极坐标，后续 dotRing 依赖 |
| 6 | **Phase 6 Dot Ring** | 比 waterfall 简单，复用 polar |
| 7 | **Phase 5 Waterfall** | 最复杂前端状态，放后面降低风险 |
| 8 | **Phase 7 文档** | 2D 模式收尾 |
| 9 | **Phase 8 示波器** | 可选，独立后端链路 |
| 10 | **Phase 9 Oblique Bar** | 3D 入门：2.5D、无 gl3d、小窗友好 |
| 11 | **Phase 10 Depth Layers** | 最轻 3D 感，验证多层 alpha blend |
| 12 | **Phase 11 Isometric** | 风格化 2.5D，引入等距工具 |
| 13 | **Phase 12 Ring3D** | 首次 gl3d + 复用 polar，真 3D 里程碑 |
| 14 | **Phase 13 Terrain3D** | 复用 waterfall 历史 + gl3d，最炫真 3D |
| 15 | **Phase 14 Helix3D** | 螺旋收尾，依赖 gl3d 已稳定 |

**3D 扩展可选快捷路径**（若只想先试效果）：Phase 9 → Phase 10 → Phase 12，跳过 11/13/14 后再补。

**Three.js 扩展推荐顺序**：

| 顺序 | Phase | 理由 |
|------|-------|------|
| 1 | **Phase 15 Three 公共层** | 必做前置；不动 vanilla |
| 2 | **Phase 16 Plasma** | 最快出图，验证 shader + Bloom |
| 3 | **Phase 17 Particle Galaxy** | 验证粒子 + 性能档 |
| 4 | **Phase 18 Bloom Tunnel** | 方案 D 收尾；验证动态纹理 |
| 5 | **Phase 19 Energy Sphere** | 方案 A 收尾 |
| 6~9 | **Phase 20~23** | 方案 B 赛博故障（可整包或逐个） |
| 10~13 | **Phase 24~27** | 方案 C 有机流体（liquidBlob 可放 C 包最后） |
| 14 | **Phase 28 文档** | Three 模式 README / 第三方说明 |

**按方案包整包实施**：D(15→16→17→18) → A(+19) → B(20→23) → C(24→27) → 28

---

## 8. 风险与规避

| 风险 | 规避 |
|------|------|
| WebGL lineWidth 仅支持 1 | 一律用顶点偏移或多 pass 模拟线宽 |
| 500 分桶性能 | waterfall 用纹理；particle 类暂不做 |
| settings.js 膨胀 | 每模式独立 panel section，考虑后续抽 `settings/visualModes/` |
| 旧 storage 迁移 | 新 key 用 `readWindowStorageString` 回退默认值，勿破坏 line/bar |
| 多窗配置 | 所有新 key 加入 `windowStorageKeys()` |
| 3D 半透明 mesh 深度排序 | 透明浮层默认 **线框** 或 **不透明 solid + 发光边**；慎用大面积 alpha solid |
| 小窗 3D 可读性 | 暴露 `displayBarCount` / `displayBuildingCount`，默认聚合到 32~64 |
| gl3d 重复实现 | Phase 12 建 `gl3d.js` 后，13/14 禁止再复制 mat4 |
| 真 3D 性能 | gridCols×gridRows ≤ 64×48；helix 点数 ≤ 48；必要时降帧更新 history |
| Three 与 vanilla WebGL 冲突 | 同 canvas 切换时 dispose Three renderer；vanilla 模式不创建 ThreeRenderer |
| Three Bloom 透明 halos | 调低 bloomStrength；composer 输出 alpha；避免 fullscreen 不透明 clear |
| Three 包体积 | vite 按需 import；`import { BloomEffect } from 'postprocessing'` 勿整库 |
| Three 多窗 GPU | 每频谱窗独立 threeBridge；particleCount 超 15000 时警告或自动降级 |
| Three composer 内存 leak | 每 renderer 实现 dispose；切换模式 / 窗口关闭时调用 |
| liquidBlob 性能 | 优先 fullscreen SDF 近似，真 marching cubes 不做 |

---

## 9. 进度追踪

> 实施完成后将 `[ ]` 改为 `[x]` 并填写完成日期。

| Phase | 内容 | 状态 | 完成日期 |
|-------|------|------|----------|
| 0 | 公共基础重构 | `[x]` 已完成 | 2026-06-09 |
| 1 | 填充波形 Area | `[x]` 已完成 | 2026-06-09 |
| 2 | 渐变频谱柱 Gradient Bar | `[x]` 已完成 | 2026-06-09 |
| 3 | 霓虹发光线 Glow Line | `[x]` 已完成 | 2026-06-09 |
| 4 | 圆形频谱 Radial | `[x]` 已完成 | 2026-06-09 |
| 5 | 瀑布频谱 Waterfall | `[x]` 已完成 | 2026-06-09 |
| 6 | 环形圆点 Dot Ring | `[x]` 已完成 | 2026-06-09 |
| 7 | 文档与 README | `[x]` 已完成 | 2026-06-09 |
| 8 | 示波器 Oscilloscope（可选） | `[x]` 已完成 | 2026-06-09 |
| 9 | 斜透视频谱柱 Oblique Bar（2.5D） | `[x]` 已完成 | 2026-06-09 |
| 10 | 多层景深 Depth Layers（2.5D） | `[x]` 已完成 | 2026-06-09 |
| 11 | 等距天际线 Isometric Skyline（2.5D） | `[x]` 已完成 | 2026-06-09 |
| 12 | 3D 旋转圆环 Ring3D（真 3D + gl3d.js） | `[x]` 已完成 | 2026-06-09 |
| 13 | 3D 频谱地形 Terrain3D（真 3D） | `[x]` 已完成 | 2026-06-09 |
| 14 | 3D 螺旋 Helix3D（真 3D） | `[x]` 已完成 | 2026-06-09 |
| 15 | Three.js 公共基础设施 | `[ ]` 未开始 | |
| 16 | 等离子场 Three Plasma Field（A/D） | `[ ]` 未开始 | |
| 17 | 粒子银河 Three Particle Galaxy（A/D） | `[ ]` 未开始 | |
| 18 | 能量隧道 Three Bloom Tunnel（A/D） | `[ ]` 未开始 | |
| 19 | 能量球 Three Energy Sphere（A） | `[ ]` 未开始 | |
| 20 | 万花筒 Three Kaleidoscope（B） | `[ ]` 未开始 | |
| 21 | 故障频谱 Three Glitch Spectrum（B） | `[ ]` 未开始 | |
| 22 | 磷光余辉 Three Phosphor Trail（B） | `[ ]` 未开始 | |
| 23 | 扫描网格 Three Scan Grid（B） | `[ ]` 未开始 | |
| 24 | 液态球体 Three Liquid Blob（C） | `[ ]` 未开始 | |
| 25 | 极光飘带 Three Aurora Ribbon（C） | `[ ]` 未开始 | |
| 26 | 呼吸光环 Three Breathing Rings（C） | `[ ]` 未开始 | |
| 27 | 噪声地貌 Three Noise Landscape（C） | `[ ]` 未开始 | |
| 28 | Three 模式文档与 README（可选） | `[ ]` 未开始 | |

**当前建议下一步**：Phase 15（Three.js 公共基础设施）→ Phase 16（等离子场，方案 D 首个效果）

---

## 10. Agent 接力提示词（下次会话可直接粘贴）

```
请阅读 docs/VISUALIZATION_MODES_PLAN.md，查看「进度追踪」表，
从第一个未完成的 Phase 开始实施。strictly 只完成一个 Phase，
完成后更新该文档进度表和 docs/CHANGELOG_AGENT.md。
不要跳过 Phase 0（若未完成）。提交描述用中文。

3D vanilla 扩展（Phase 9~14）：Phase 12 须先完成 gl3d.js 再写 ring3dRenderer。

Three.js 扩展（Phase 15~27）：
- 必须先完成 Phase 15 公共层，再 implement 具体 Three 模式。
- 禁止修改已有 vanilla renderer（line/bar/ring3d 等），只在 renderers/three/ 新增。
- 依赖：three + postprocessing（npm install 在 frontend 目录）。
- 推荐首批：Phase 15 → 16（等离子场）→ 17 → 18（方案 D）。
```

---

*本文档随实现进度更新；各 Phase 细节若有偏离，以实际代码为准，但须回写本文件。*
