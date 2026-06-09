# WaveDance 可视化模式扩展 — 分阶段实现方案

> **文档类型**：实现指导手册（Agent / 开发者跨会话接力用）  
> **创建日期**：2026-06-09  
> **状态**：Phase 3 已完成，Phase 4 待实施  
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
| `frontend/src/main.js` | 创建 renderer、`renderWaveform()` 分支、`listen` 事件 |
| `frontend/src/visualizationSchema.js` | `DISPLAY_MODES`、`DEFAULT_CONFIG`、`STORAGE_KEYS` |
| `frontend/settings.html` + `settings.js` | 展示模式选择与各模式配置面板 |

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
| `frontend/src/renderers/polar.js` | 极坐标辅助（Phase 4、6 共用） |
| `frontend/src/renderers/shaderUtils.js` | compileShader、createProgram 去重 |

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

- [ ] 每个 bucket → 一段扇形条（梯形近似：四个顶点）
- [ ] 幅度映射：内径 + normalized * (外径 - 内径)
- [ ] 可选：用 `peak`/`rms` 做整体 scale 呼吸（styleConfig 传入 frameMeta）
- [ ] **main.js 改动**：若要用 peak/rms，在 render 时传入 `{ peak, rms }`（扩展 render 签名第三参数 optional）

#### 4.4 集成与设置页

- 内径/外径/柱厚/旋转/顺时针/镜像
- 形状四件套

#### 4.5 验收标准

- [ ] 圆形窗口与宽条窗口均居中、不变形（取 min 维度算半径）
- [ ] 256 分桶时环上条数清晰可辨
- [ ] freqReversed 改变条在环上的排列顺序

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

- [ ] 内部状态：`history: Float32Array[historyRows * bucketCount]` 环形缓冲
- [ ] 每帧：processSpectrumPoints → 写入当前行 → 指针下移
- [ ] 渲染：
  - **方案 A**：`gl.TEXTURE_2D` 动态纹理 + 单个 fullscreen quad，fragment 按 UV 查 history
  - **方案 B**：每行一个 narrow quad（行数少时可接受）
- [ ] 颜色映射在 fragment shader：`mix(lowColor, highColor, amp)`

#### 5.3 性能注意

- bucketCount=500 × historyRows=128 时优先纹理方案
- 窗口 resize 时重建纹理尺寸
- bucket 数变化时重置 history

#### 5.4 集成与设置页

- 历史深度、滚动速度、双色
- 形状四件套（smooth 不宜过高，否则瀑布拖影过重）

#### 5.5 验收标准

- [ ] 音乐播放时可见向下滚动
- [ ] 停止后逐渐静止而非花屏
- [ ] 切换分桶数量不 crash

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

- [ ] 聚合：`aggregateBands(points, dotCount)` → 长度 dotCount 数组
- [ ] 每点：小 square quad 或 `POINTS`（Mac WebGL 点大小有限制，**推荐 quad**）
- [ ] 点中心位置：`polar.js`；点半径 = baseSize * (0.3 + 0.7 * amp)
- [ ] 可选 alpha = amp

#### 6.3 集成与设置页

- 圆环半径、圆点数量、点大小、脉冲开关、颜色

#### 6.4 验收标准

- [ ] dotCount 调小后仍跟音乐节奏
- [ ] 与 radial 模式视觉差异明显（点 vs 条）

---

### Phase 7：文档与 README 更新（约 0.5 天）

> 全部模式完成后统一做，**每完成一个 Phase 也可先更新 CHANGELOG**。

- [ ] `README.md` 效果预览说明补充新模式名称
- [ ] `docs/QUICK_CONTEXT.md` 补充展示模式列表
- [ ] `PROJECT_CONTEXT.md`「下一步候选任务」同步
- [ ] 可选：录制 GIF 放入 `docs/images/`

---

### Phase 8（可选）：示波器 Oscilloscope — 需后端（约 4~5 天）

> **依赖**：Rust 额外推送时域波形，**仅在前端 Phase 1~6 完成后再做**。

#### 8.1 后端改动 `src-tauri/src/main.rs`

- [ ] 扩展 `WaveformFrame` 或新事件 `waveform-time-domain`：
  ```rust
  struct WaveformFrame {
      peak: f32,
      rms: f32,
      points: Vec<f32>,        // 频谱桶（现有）
      time_samples: Vec<f32>,  // 新增：mono 时域，例如 512 点，归一化到 [-1,1]
  }
  ```
- [ ] 从已有 `mono` buffer 降采样取 512 点（不必重复 FFT）

#### 8.2 前端 `oscilloscopeRenderer.js`

- [ ] 滚动波形：`LINE_STRIP`，x 均匀分布，y = sample
- [ ] 可选 phosphor 拖尾（alpha fade buffer）

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

## 5. 每个 Phase 标准实施步骤（复制粘贴用）

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

---

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
| 8 | **Phase 7 文档** | 收尾 |
| 9 | **Phase 8 示波器** | 可选，独立后端链路 |

---

## 8. 风险与规避

| 风险 | 规避 |
|------|------|
| WebGL lineWidth 仅支持 1 | 一律用顶点偏移或多 pass 模拟线宽 |
| 500 分桶性能 | waterfall 用纹理；particle 类暂不做 |
| settings.js 膨胀 | 每模式独立 panel section，考虑后续抽 `settings/visualModes/` |
| 旧 storage 迁移 | 新 key 用 `readWindowStorageString` 回退默认值，勿破坏 line/bar |
| 多窗配置 | 所有新 key 加入 `windowStorageKeys()` |

---

## 9. 进度追踪

> 实施完成后将 `[ ]` 改为 `[x]` 并填写完成日期。

| Phase | 内容 | 状态 | 完成日期 |
|-------|------|------|----------|
| 0 | 公共基础重构 | `[x]` 已完成 | 2026-06-09 |
| 1 | 填充波形 Area | `[x]` 已完成 | 2026-06-09 |
| 2 | 渐变频谱柱 Gradient Bar | `[x]` 已完成 | 2026-06-09 |
| 3 | 霓虹发光线 Glow Line | `[x]` 已完成 | 2026-06-09 |
| 4 | 圆形频谱 Radial | `[ ]` 未开始 | |
| 5 | 瀑布频谱 Waterfall | `[ ]` 未开始 | |
| 6 | 环形圆点 Dot Ring | `[ ]` 未开始 | |
| 7 | 文档与 README | `[ ]` 未开始 | |
| 8 | 示波器 Oscilloscope（可选） | `[ ]` 未开始 | |

**当前建议下一步**：Phase 4（圆形频谱 Radial）

---

## 10. Agent 接力提示词（下次会话可直接粘贴）

```
请阅读 docs/VISUALIZATION_MODES_PLAN.md，查看「进度追踪」表，
从第一个未完成的 Phase 开始实施。 strictly 只完成一个 Phase，
完成后更新该文档进度表和 docs/CHANGELOG_AGENT.md。
不要跳过 Phase 0（若未完成）。提交描述用中文。
```

---

*本文档随实现进度更新；各 Phase 细节若有偏离，以实际代码为准，但须回写本文件。*
