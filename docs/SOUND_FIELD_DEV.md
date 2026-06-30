# WaveDance 音域回响可视化 — 开发文档

> **文档类型**：实现指导手册（开发者 / Agent 跨会话接力用）  
> **创建日期**：2026-06-29  
> **状态**：Phase 3 已完成，Phase 4 待做  
> **姊妹模式**：Sonic Topography 风格重建见 `docs/SONIC_TOPOGRAPHY_DEV.md`（新模式 `threeSoundField2` / 设置页「音域回响 2」，与本模式并存，**不替换**本文档范围）
> **参考来源**：
> - Steam 创意工坊 [音域回响](https://steamcommunity.com/workshop/filedetails/?id=3747222633)（Wallpaper Engine 动态壁纸，**仅算法级参考，不复制源码**）
> - 项目内 `docs/COVER_PARTICLE_DEV.md`（Three 新模式集成约定）
> - 项目内 `docs/VISUALIZATION_MODES_PLAN.md`（Three 模式扩展约定）
> - 项目内 `frontend/src/renderers/three/scanGridRenderer.js`（网格 + 频谱列聚合参考）
> - 项目内 `frontend/src/renderers/three/coverParticle/rippleManager.js`（涟漪 CPU 管理参考）

---

## 1. 文档用途

本文档描述如何在 WaveDance **主可视化窗口**（`#waveCanvasThree`）中实现 **音域回响**（`threeSoundField`）展示模式。

每次开发会话只需：

1. 打开本文档，找到「当前进度」与下一个未勾选的 Phase；
2. 只完成该 Phase 范围内的任务，**不要跨 Phase 一次性全做**；
3. 完成后更新本文档底部的「进度追踪」勾选状态；
4. 在 `docs/CHANGELOG_AGENT.md` 追加一条简短变更记录（若项目有该文件）。

**原则**：每个 Phase 完成后应能 `cargo tauri dev` 正常运行、新模式可在设置页切换并实时渲染。

---

## 2. 概念澄清（必读）

### 2.1 什么是「音域回响」

本模式 **不是**：

- `coverParticle` 的 WALLPAPER（星河）preset —— 那是封面粒子 + 极光螺旋；
- `threeScanGrid`（扫描网格）—— 那是线框网格 + 扫描光束，无实心柱、无涟漪/流星；
- Wallpaper Engine 壁纸本体 —— 我们不移植 WE 的 `wallpaperRegisterAudioListener` 或 Media Integration API。

本模式 **是**：

```
系统音频 FFT 频谱
    ↓ processSpectrumPoints + buildSpectrumUniforms
N×N InstancedMesh 实心柱网（柱高随频段起伏）
    ↓ bass 触发地面涟漪 / treble 触发流星与粒子
Bloom 后处理 + 可选专辑封面 Plane
    ↓
主 Canvas 透明背景渲染（可叠在桌面之上）
```

视觉灵感来自 Wallpaper Engine 创意工坊「音域回响」，实现为 WaveDance 自研 Three.js renderer。

### 2.2 与现有模式的关系

| 模式 | 形态 | 封面 | 说明 |
|------|------|------|------|
| `threeScanGrid` | 线框网格 + 扫描光 | 否 | 列聚合频谱，无 2D 柱阵 |
| `terrain3d` | 滚动地形 mesh | 否 | WebGL1，历史缓冲 |
| `threeCoverParticle` preset 5 | 封面粒子星河 | 是 | 极光丝带，非柱网 |
| **`threeSoundField`（新增）** | **实心柱海 + 涟漪 + 流星** | **可选** | 本文档范围 |

### 2.3 不在本方案范围内

以下能力 **暂不移植**，避免 scope 膨胀：

- Wallpaper Engine 内嵌播放器 UI（毛玻璃卡片、三种尺寸预设）—— WaveDance 主窗已有 Now Playing；
- WE 专属音频监听 API 与桌面壁纸生命周期；
- 10 套主题一次性全做 —— MVP 先做 3 套，后续 Phase 扩展；
- 离线 beatmap / Web Worker 预解析 —— MVP 用 renderer 内 onset + peak 衰减；
- 点击触发流星（v14 闲置交互）—— 可选 Phase 6。

音频驱动 MVP 阶段使用现有 `spectrumUniforms.js`（bass/mid/treble + 8 band）+ `frameMeta.peak/rms` 即可。

---

## 3. 参考效果拆解（音域回响 · 算法级）

> 作者 CmzYa，技术栈为 React + R3F + Three.js。**WaveDance 使用原生 Three.js**，不引入 R3F。

| 子系统 | 外部效果描述 | WaveDance 对应实现 |
|--------|-------------|-------------------|
| 柱网 | 160×160 实例化网格随音乐起伏 | `InstancedMesh` + 频谱映射 + 高度平滑 |
| 频谱 | 8 频段 FFT + 音色指标 | `buildSpectrumUniforms().bandPeaks`（8 段） |
| 低频涟漪 | bass 触发地面扩散波 + 柱子弹起 | `soundFieldRippleManager.js` |
| 高频流星 | treble onset → 坠落 + 撞击粒子 | `soundFieldMeteorSystem.js` |
| 空闲波浪 | 无音乐时柱网呼吸微动 | `idleWave.js`（sin + 低 amplitude） |
| 封面 | 专辑图 + 切歌过渡 | 复用 `coverTextureLoader.js` |
| 主题 | 10 套配色 | `soundFieldThemes.js`（MVP 3 套） |
| 性能 | 渲染精度分级 | `gridPreset: eco/normal/high` + DPR cap |

---

## 4. WaveDance 现状与集成点

### 4.1 已有能力（直接复用）

| 模块 | 路径 | 用途 |
|------|------|------|
| Three 桥接 | `frontend/src/renderers/three/threeBridge.js` | 模式注册、切换、dispose、封面 tick |
| 模式注册 | `frontend/src/renderers/three/registerModes.js` | `registerThreeMode()` |
| 频谱 uniform | `frontend/src/renderers/three/spectrumUniforms.js` | bass/mid/treble + bandPeaks[8] + 频谱纹理 |
| Shape 预处理 | `frontend/src/renderers/shapePipeline.js` | gain/smooth/softClip/fallEase |
| Bloom 后处理 | `frontend/src/renderers/three/postProcessing.js` | `createBloomComposer` |
| 封面纹理 | `frontend/src/renderers/three/coverTextureLoader.js` | 切歌渐变 `colorMixT` |
| 封面数据源 | `main.js` → `coverArtState` | `frameMeta.cover` 已注入 threeBridge |
| 网格频谱参考 | `frontend/src/renderers/three/scanGridRenderer.js` | 列聚合、相机俯角、Bloom 模式 |
| 频段聚合 | `frontend/src/renderers/bandAggregate.js` | `aggregateBands(values, n)` |
| Simplex 噪声 | `frontend/src/renderers/three/noiseGlsl.js` | 空闲波浪 / 柱面色相微扰（可选） |

### 4.2 当前缺口

| 缺口 | 说明 |
|------|------|
| 无 `threeSoundField` renderer | 需新建 `soundField/` 子目录 |
| 无 InstancedMesh 柱网实现 | 项目内尚无 2D 柱阵实例化范例 |
| 无 bass 触地涟漪 | `rippleManager` 仅服务 SILK 鼠标交互 |
| 无流星/撞击粒子 | 需新建轻量 particle pool |
| 设置页 / schema / main.js | 需按 Phase 逐步接入 |

### 4.3 目标数据流（WaveDance）

```
Rust 音频采集
  → emit("waveform-frame", { points[], peak, rms })
  → main.js latestPoints / latestPeak / latestRms

Rust now_playing（可选封面）
  → emit("now-playing-update", { artworkPath, artworkRevision, ... })
  → main.js coverArtState
  → threeBridge.syncCoverTextures → coverTextureLoader

threeBridge.render(points, shape, style, frameMeta)
  → processSpectrumPoints → buildSpectrumUniforms
  → soundFieldRenderer.render(..., spectrum, processed)
       ├── 更新柱目标高度 + 实例矩阵
       ├── rippleManager.tick / meteorSystem.tick
       ├── idleWave 叠加（低 rms）
       └── composer.render()
  → WebGL 绘制到 #waveCanvasThree
```

### 4.4 硬性约束（继承 VISUALIZATION_MODES_PLAN）

- Three.js **仅用于新增 Three 模式**；Phase 0~14 vanilla renderer **禁止回改**
- 新代码放在 `frontend/src/renderers/three/soundField/`
- 共用 `#waveCanvasThree`；切换模式时 `threeBridge.setMode` dispose 旧 renderer
- `WebGLRenderer({ alpha: true })` + `setClearColor(0x000000, 0)`
- 仍走 `processSpectrumPoints` + `buildSpectrumUniforms` 预处理频谱
- **禁止**复制 Wallpaper Engine 创意工坊壁纸的源码或大段 Shader 字符串；算法思路自研

---

## 5. 新增模式标识

```js
// visualizationSchema.js
DISPLAY_MODES.threeSoundField = "threeSoundField"
```

设置页 `<optgroup label="Three 高阶">` 增加选项：**音域回响**。

同步更新：

- `THREE_DISPLAY_MODES` 数组
- `normalizeDisplayMode()` 分支
- `settings.js` 中 `MODE_CONFIG_PANELS` 映射
- `registerModes.js` 注册 factory

---

## 6. 配置 Schema

### 6.1 DEFAULT_CONFIG 结构

```js
threeSoundField: {
  // --- 网格 / 性能 ---
  gridPreset: "normal",           // "eco" | "normal" | "high"
  gridSizeEco: 64,                // eco 档 N×N（实例数 4096）
  gridSizeNormal: 96,             // normal 档（9216）
  gridSizeHigh: 128,              // high 档（16384）；不建议默认 160
  maxBarHeight: 2.6,              // 柱最大高度（世界单位）
  barFootprint: 0.085,            // 柱底面尺寸（spacing ≈ footprint × 1.08）
  worldWidth: 10,                 // 网格覆盖 X 宽度（与 scanGrid 同量级）
  worldDepth: 10,

  // --- 音频响应 ---
  responseStrength: 72,           // 0~100 → 柱高增益
  responseRange: 65,              // 0~100 → 频谱映射曲线（gamma）
  bassRippleEnabled: true,
  bassRippleStrength: 70,         // 0~100
  bassRippleSensitivity: 55,      // 0~100，bass 触发阈值反比
  meteorEnabled: true,
  meteorStrength: 60,             // 0~100
  meteorSensitivity: 50,          // treble onset 阈值
  idleWaveEnabled: true,
  idleWaveAmplitude: 18,          // 0~100
  idleWaveSpeed: 45,              // 0~100
  idleEnergyThreshold: 0.035,     // rms 低于此值视为「空闲」

  // --- 视觉 / 主题 ---
  themeId: "indigo",              // 见 soundFieldThemes.js
  colorLow: "#1a1a2e",            // 主题可覆盖
  colorMid: "#4a4580",
  colorHigh: "#8f7cff",
  groundColor: "#0a0a12",
  bloomEnabled: true,
  bloomStrength: 0.75,
  bloomThreshold: 0.08,

  // --- 相机 ---
  cameraPitchDeg: 52,
  cameraDistance: 14,
  cameraFovDeg: 50,
  autoRotateEnabled: true,
  autoRotateSpeedDeg: 2.5,

  // --- 封面（可选） ---
  coverEnabled: true,
  coverSize: 2.4,                 // Plane 边长（世界单位）
  coverHeight: 4.2,               // Y 偏移（浮在柱海上空）
  coverOpacity: 0.92,
  colorMixDurationMs: 1400,       // 切歌过渡（coverTextureLoader 已有）

  // --- shape 四件套 ---
  shape: {
    gainPercent: 62,
    smoothPercent: 18,
    softClipPercent: 12,
    fallEasePercent: 52,
  },
}
```

### 6.2 gridPreset → gridSize 映射

```js
function soundFieldGridSize(preset, cfg = DEFAULT_CONFIG.threeSoundField) {
  if (preset === "eco") return cfg.gridSizeEco;
  if (preset === "high") return cfg.gridSizeHigh;
  return cfg.gridSizeNormal;
}

// 实例数 = gridSize²；high 档 128² = 16384，集成显卡目标 ≥30fps
// 不建议默认 160² = 25600（音域回响原版精度，WaveDance 小窗易卡顿）
```

### 6.3 STORAGE_KEYS 命名

```js
threeSoundFieldGridPreset: "wavedance.threeSoundFieldGridPreset",
threeSoundFieldResponseStrength: "wavedance.threeSoundFieldResponseStrength",
threeSoundFieldResponseRange: "wavedance.threeSoundFieldResponseRange",
threeSoundFieldBassRipple: "wavedance.threeSoundFieldBassRippleEnabled",
threeSoundFieldBassRippleStrength: "wavedance.threeSoundFieldBassRippleStrength",
threeSoundFieldBassRippleSensitivity: "wavedance.threeSoundFieldBassRippleSensitivity",
threeSoundFieldMeteor: "wavedance.threeSoundFieldMeteorEnabled",
threeSoundFieldMeteorStrength: "wavedance.threeSoundFieldMeteorStrength",
threeSoundFieldMeteorSensitivity: "wavedance.threeSoundFieldMeteorSensitivity",
threeSoundFieldIdleWave: "wavedance.threeSoundFieldIdleWaveEnabled",
threeSoundFieldIdleWaveAmplitude: "wavedance.threeSoundFieldIdleWaveAmplitude",
threeSoundFieldIdleWaveSpeed: "wavedance.threeSoundFieldIdleWaveSpeed",
threeSoundFieldTheme: "wavedance.threeSoundFieldThemeId",
threeSoundFieldColorLow: "wavedance.threeSoundFieldColorLow",
threeSoundFieldColorMid: "wavedance.threeSoundFieldColorMid",
threeSoundFieldColorHigh: "wavedance.threeSoundFieldColorHigh",
threeSoundFieldGroundColor: "wavedance.threeSoundFieldGroundColor",
threeSoundFieldBloom: "wavedance.threeSoundFieldBloomEnabled",
threeSoundFieldBloomStrength: "wavedance.threeSoundFieldBloomStrength",
threeSoundFieldCameraPitch: "wavedance.threeSoundFieldCameraPitchDeg",
threeSoundFieldCameraDistance: "wavedance.threeSoundFieldCameraDistance",
threeSoundFieldAutoRotate: "wavedance.threeSoundFieldAutoRotateEnabled",
threeSoundFieldAutoRotateSpeed: "wavedance.threeSoundFieldAutoRotateSpeedDeg",
threeSoundFieldCover: "wavedance.threeSoundFieldCoverEnabled",
threeSoundFieldCoverSize: "wavedance.threeSoundFieldCoverSize",
threeSoundFieldShape: "wavedance.threeSoundFieldShapeConfig",
```

### 6.4 主题预设（MVP 3 套，Phase 5 扩至 10 套）

```js
// soundFieldThemes.js
export const SOUND_FIELD_THEMES = {
  indigo:  { colorLow: "#1a1a2e", colorMid: "#4a4580", colorHigh: "#8f7cff", groundColor: "#0a0a12" },
  ocean:   { colorLow: "#0c1929", colorMid: "#1e4d6b", colorHigh: "#38bdf8", groundColor: "#060d14" },
  ember:   { colorLow: "#1a0f0a", colorMid: "#7c2d12", colorHigh: "#fb923c", groundColor: "#0a0604" },
  // Phase 5+: jade, amber, coral, neon, mono ...
};
```

---

## 7. 目录结构

```
frontend/src/renderers/three/
├── soundField/
│   ├── soundFieldRenderer.js       # createSoundFieldRenderer(ctx) 主 factory
│   ├── soundFieldGrid.js           # buildInstancedGrid(N), updateInstanceHeights()
│   ├── soundFieldShaders.js        # 柱体 vertex/fragment GLSL
│   ├── soundFieldThemes.js         # 主题色表 + applyTheme()
│   ├── soundFieldRippleManager.js  # bass 触地涟漪（CPU，最多 8 条）
│   ├── soundFieldMeteorSystem.js   # 流星 + 撞击粒子 pool
│   ├── soundFieldIdleWave.js       # 低能量全局呼吸波
│   └── soundFieldSpectrumMap.js    # processed/bandPeaks → grid 高度场
├── coverTextureLoader.js           # 已有，封面 Plane 复用
└── registerModes.js                # +1 行注册
```

---

## 8. 核心模块规格

### 8.1 soundFieldRenderer.js

**职责**：场景组装、每帧调度、composer 管理。

```js
/**
 * @param {import('../threeContext.js').ThreeContext} ctx
 * @returns {{ render: Function, dispose: Function }}
 */
export function createSoundFieldRenderer(ctx) {
  // scene 子节点：
  // - groundPlane（可选，深色接收阴影/涟漪 tint）
  // - instancedBars（InstancedMesh）
  // - coverPlane（可选，MeshBasicMaterial + coverTex）
  // - meteorPoints（Points，Phase 3）
  //
  // render(points, shapeConfig, styleConfig, frameMeta, spectrum, processed):
  //   1. 读 style + DEFAULT_CONFIG
  //   2. spectrumMap → targetHeights[]
  //   3. heightSmoother.tick(target, dt) → currentHeights[]
  //   4. rippleManager.tick(bass, dt) → rippleOffsets[]
  //   5. idleWave.apply(current, rms, dt)（低 rms）
  //   6. grid.updateMatrices(current + ripple)
  //   7. meteorSystem.tick(treble, onset, dt)（Phase 3）
  //   8. coverPlane 材质贴图 ← frameMeta.coverTextures（Phase 4）
  //   9. composer.render()
}
```

**Renderer 接口**（与现有 Three 模式一致）：

```js
render(points, shapeConfig, styleConfig, frameMeta, spectrum, processed)
```

其中：

- `spectrum.bass / .mid / .treble` — 全局频段
- `spectrum.bandPeaks` — `Float32Array(8)`
- `frameMeta.peak / .rms` — 峰值与能量
- `frameMeta.coverTextures` — `{ coverTex, prevCoverTex, colorMixT, hasCover }`

### 8.2 soundFieldSpectrumMap.js

**职责**：将 1D 频谱映射到 N×N 高度场。

```js
/**
 * @param {Float32Array} processed
 * @param {Float32Array} bandPeaks  // length 8
 * @param {number} gridSize
 * @param {{ responseStrength: number, responseRange: number, freqReversed?: boolean }} opts
 * @returns {Float32Array}  // length gridSize * gridSize, 0~1
 */
export function mapSpectrumToHeightField(processed, bandPeaks, gridSize, opts) {}
```

**推荐映射策略（MVP）**：

1. 将 `gridSize²` 个 cell 按 `(ix, iz)` 计算 `t = (ix + iz * 0.37) / gridSize`（打破轴对称）；
2. 频谱索引 `specIdx = floor(t * processed.length)`，取 `processed[specIdx]`；
3. 叠加 `bandPeaks[ floor(t * 8) ] * 0.35` 增加频段色彩层次；
4. `height = pow(clamp01(spec * gain), gamma) * responseStrength`，`gamma = 1 + (1 - responseRange/100) * 0.8`；
5. 若 `freqReversed`，沿 X 轴镜像。

> Phase 2 可选：2D 分块 — 低频占网格中心环，高频占外圈（更接近「音域」语义）。

### 8.3 soundFieldGrid.js

**职责**：`InstancedMesh` 生命周期与矩阵更新。

```js
/**
 * @param {number} gridSize
 * @param {{ footprint, maxHeight, worldWidth, worldDepth }} opts
 */
export function createSoundFieldGrid(gridSize, opts) {
  // geometry: BoxGeometry(footprint, 1, footprint) — 单位高度 1，用 matrix 缩放 Y
  // material: ShaderMaterial from soundFieldShaders.js
  // mesh: InstancedMesh(geometry, material, gridSize * gridSize)
  //
  // 每个实例 (ix, iz):
  //   x = (ix + 0.5) / gridSize * worldWidth - worldWidth/2
  //   z = (iz + 0.5) / gridSize * worldDepth - worldDepth/2
  //   scaleY = max(0.02, height * maxHeight)
  //   posY = scaleY * 0.5  （底面落在 y=0）
}
```

**高度平滑**（每 cell 独立，避免 scanGrid 式硬跟随）：

```js
// 每帧：
const attack = 0.35;  // 上升快
const release = 0.12 + fallEase * 0.08;  // fallEase 来自 shapeConfig
if (target > current) current += (target - current) * attack;
else current += (target - current) * release;
```

`fallEasePercent` 来自 `shapeConfig`，与 `shapePipeline` 语义一致。

**DPR cap**（high 档或 gridSize ≥ 112）：

```js
const dprCap = gridSize >= 112 ? 1.25 : 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
```

参考 `particleGalaxyRenderer.js` 的 `HIGH_COUNT_THRESHOLD` 模式。

### 8.4 soundFieldShaders.js

**柱体 Vertex（要点）**：

```glsl
// attribute 仅 BoxGeometry 默认；实例变换由 InstancedMesh 提供
// uniform: uTime, uColorLow, uColorMid, uColorHigh, uMaxHeight
// varying: vHeightNorm, vWorldXZ

void main() {
  vHeightNorm = clamp(position.y + 0.5, 0.0, 1.0); // 柱顶更亮
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldXZ = worldPos.xz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
```

**柱体 Fragment（要点）**：

```glsl
// 高度渐变着色 + 距中心 faint vignette
// col = mix(uColorLow, uColorMid, vHeightNorm * 0.7);
// col = mix(col, uColorHigh, pow(vHeightNorm, 1.8));
// 可选：距 vWorldXZ 中心 ripple glow（由 uniform uRippleBoost 纹理或数组传入）
```

**性能提示**：MVP 阶段 ripple 可在 CPU 合并到 instance scaleY，Fragment 只做颜色，不做 per-pixel ripple 采样。

### 8.5 soundFieldRippleManager.js

**职责**：bass 超阈值时 spawn 环形波，CPU 合并到柱高。

```js
const MAX_RIPPLES = 8;
const RIPPLE_LIFETIME_S = 1.8;

// ripple: { x, z, age, strength, radius }

export function createSoundFieldRippleManager(worldWidth, worldDepth) {
  return {
    /** bass: 0~1, 超 sensitivity 阈值则 spawn 网格中心或随机点 */
    pushIfTriggered(bass, sensitivity) {},
    /** 返回 length gridSize² 的 rippleBoost[] */
    sampleGridOffsets(gridSize, ix, iz, dt) {},
    tick(dt) {},
    dispose() {},
  };
}
```

**单条涟漪对 cell `(x,z)` 的贡献**：

```
dist = distance(cellXZ, rippleXZ)
wave = strength * exp(-dist² / (radius²)) * sin(phase - dist * 8.0)
boost = max(0, wave) * (1 - age / RIPPLE_LIFETIME_S)
height += boost * rippleStrength
```

spawn 条件：`bass > (1 - sensitivity/100) * 0.55` 且距上次 spawn > 120ms（防抖）。

### 8.6 soundFieldMeteorSystem.js（Phase 3）

**职责**：treble onset 触发流星，撞击时局部粒子 burst。

```js
// 流星：最多 12 颗同时存在
// meteor: { x, z, y, vy, life, trailSeed }

// onset 检测（renderer 内联或本模块）：
// trebleFlux = max(0, treble - prevTreble) * 3.2 + treble * 0.1
// if (trebleFlux > threshold) spawnMeteor(randomXZ)

// 撞击：y <= barHeightAt(x,z) → spawnBurst(x,z) + 柱顶 flash（临时 +0.3 height，100ms 衰减）

export function createSoundFieldMeteorSystem(maxBarHeight) {
  return {
    tick(treble, trebleFlux, barHeightSampler, dt) {},
    getPointsGeometry() {},  // THREE.Points 用
    dispose() {},
  };
}
```

渲染：`THREE.Points` + `AdditiveBlending` + 共用 Bloom composer。

### 8.7 soundFieldIdleWave.js

```js
/**
 * @param {Float32Array} heights  // 原地修改，length N²
 * @param {number} rms
 * @param {number} dt
 * @param {{ amplitude, speed, threshold }} opts
 */
export function applyIdleWave(heights, gridSize, time, rms, opts) {
  if (rms > opts.threshold) return;
  for (let i = 0; i < heights.length; i++) {
    const ix = i % gridSize;
    const iz = Math.floor(i / gridSize);
    const wave = Math.sin(time * speed + ix * 0.31 + iz * 0.27) * amp;
    heights[i] = Math.max(heights[i], 0.08 + wave); // 保持最低可见呼吸
  }
}
```

---

## 9. 集成改动清单（按文件）

| 文件 | Phase | 改动 |
|------|-------|------|
| `visualizationSchema.js` | 1 | `DISPLAY_MODES`、`DEFAULT_CONFIG`、`STORAGE_KEYS`、`THREE_DISPLAY_MODES`、`normalizeDisplayMode` |
| `registerModes.js` | 1 | `registerThreeMode(DISPLAY_MODES.threeSoundField, createSoundFieldRenderer)` |
| `soundField/*.js` | 1~4 | 新目录 |
| `settings.html` | 1 | `<option value="threeSoundField">音域回响</option>` + `#threeSoundFieldConfigPanel` |
| `settings.js` | 1 | panel 映射、读写 localStorage、事件监听 |
| `main.js` | 1 | 状态变量 + `getStyleConfigForMode` + `getShapeConfigForMode` 分支 |
| `CHANGELOG_AGENT.md` | 每 Phase | 追加记录 |

### 9.1 main.js — getStyleConfigForMode 示例

```js
if (mode === DISPLAY_MODES.threeSoundField) {
  return {
    gridPreset: threeSoundFieldGridPreset,
    responseStrength: threeSoundFieldResponseStrength,
    responseRange: threeSoundFieldResponseRange,
    bassRippleEnabled: threeSoundFieldBassRippleEnabled,
    bassRippleStrength: threeSoundFieldBassRippleStrength,
    bassRippleSensitivity: threeSoundFieldBassRippleSensitivity,
    meteorEnabled: threeSoundFieldMeteorEnabled,
    meteorStrength: threeSoundFieldMeteorStrength,
    meteorSensitivity: threeSoundFieldMeteorSensitivity,
    idleWaveEnabled: threeSoundFieldIdleWaveEnabled,
    idleWaveAmplitude: threeSoundFieldIdleWaveAmplitude,
    idleWaveSpeed: threeSoundFieldIdleWaveSpeed,
    themeId: threeSoundFieldThemeId,
    colorLow: threeSoundFieldColorLowHex,
    colorMid: threeSoundFieldColorMidHex,
    colorHigh: threeSoundFieldColorHighHex,
    groundColor: threeSoundFieldGroundColorHex,
    bloomEnabled: threeSoundFieldBloomEnabled,
    bloomStrength: threeSoundFieldBloomStrength,
    cameraPitchDeg: threeSoundFieldCameraPitchDeg,
    cameraDistance: threeSoundFieldCameraDistance,
    autoRotateEnabled: threeSoundFieldAutoRotateEnabled,
    autoRotateSpeedDeg: threeSoundFieldAutoRotateSpeedDeg,
    coverEnabled: threeSoundFieldCoverEnabled,
    coverSize: threeSoundFieldCoverSize,
    cameraFovDeg: DEFAULT_CONFIG.threeSoundField.cameraFovDeg,
    freqReversed: globalFreqReversed, // 若项目有全局开关则透传
  };
}
```

### 9.2 settings.html — 配置面板（MVP 控件）

| 控件 | 类型 | 说明 |
|------|------|------|
| 渲染精度 | select | eco / normal / high |
| 响应强度 | range 0~100 | |
| 响应范围 | range 0~100 | |
| 主题 | select | indigo / ocean / ember |
| 低频涟漪 | checkbox + 强度 + 灵敏度 | Phase 2 后显示 |
| 流星 | checkbox + 强度 + 灵敏度 | Phase 3 后显示 |
| 空闲波浪 | checkbox + 幅度 + 速度 | Phase 1 即可 |
| 封面显示 | checkbox + 尺寸 | Phase 4 |
| Bloom | checkbox + 强度 | |
| 相机俯角 / 距离 | range | |
| 自动旋转 | checkbox + 速度 | |
| shape 四件套 | range | gain / smooth / softClip / fallEase |

---

## 10. 分 Phase 实施计划

### Phase 1：MVP 柱网 + Bloom + 空闲波浪（约 3~5 天）

- [x] 创建 `soundField/` 目录与 `soundFieldRenderer.js` 骨架
- [x] `soundFieldGrid.js`：`InstancedMesh` + 基础 Shader（高度渐变色）
- [x] `soundFieldSpectrumMap.js`：processed → 高度场
- [x] 高度 attack/release 平滑
- [x] `soundFieldIdleWave.js`：低 rms 呼吸
- [x] Bloom composer（复用 `postProcessing.js`）
- [x] `visualizationSchema.js` + `registerModes.js`
- [x] `settings.html` + `settings.js` + `main.js` 最小接入
- [x] 3 套主题色

**验收**：

- 设置页选「音域回响」→ 主窗显示实心柱海
- 播放音乐时柱体随频谱起伏，停止后 idle 呼吸
- normal 档（96²）1280×720 窗口 ≥30fps
- 切换其他 Three 模式再切回，无 WebGL 泄漏

---

### Phase 2：低频涟漪（约 1~2 天）

- [x] `soundFieldRippleManager.js`
- [x] bass 触发 spawn + 网格高度叠加
- [x] settings：涟漪开关 / 强度 / 灵敏度

**验收**：

- 鼓点/低频明显时地面有环形扩散，柱体同步弹起
- 连续 bass 不闪烁（120ms 防抖生效）

---

### Phase 3：流星 + 撞击粒子（约 2~3 天）

- [x] `soundFieldMeteorSystem.js`
- [x] treble flux onset 检测
- [x] Points 渲染 + Bloom
- [x] settings：流星开关 / 强度 / 灵敏度

**验收**：

- 高频密集段有流星坠落感
- 撞击点有短促粒子闪白，不持续遮挡柱网

---

### Phase 4：专辑封面 Plane（约 1~2 天）

- [ ] 场景内 `coverPlane` 复用 `frameMeta.coverTextures`
- [ ] 切歌 `colorMixT` 交叉淡化
- [ ] settings：封面开关 / 尺寸

**验收**：

- Now Playing 有封面时在柱海上空显示
- 切歌约 1.4s 渐变，无旧封面闪屏

---

### Phase 5：性能分级与打磨（约 1~2 天）

- [ ] eco/normal/high 三档联动 gridSize + DPR cap
- [ ] high 档可选限 30fps 更新柱矩阵（隔帧 updateInstances）
- [ ] 扩展主题至 6~10 套（可选）
- [ ] 响应衰减修复（快速静音时柱体 smooth 下落，不卡半高）

**验收**：

- eco 档在集成显卡小窗稳定 ≥30fps
- high 档视觉更密但可接受帧率，或自动提示降档

---

### Phase 6（可选）：交互与扩展

- [ ] 点击屏幕触发流星（需处理与主窗拖拽冲突，默认关）
- [ ] 2D 频域环布局（低频频域在中心）
- [ ] 导出 MP4 / 录制（非 MVP）

---

## 11. 验收标准（总览）

- [ ] 新模式 `threeSoundField` 在设置页可选
- [ ] 柱网随系统音频实时响应
- [ ] 空闲时有 breathing 波浪
- [ ] bass 涟漪 + treble 流星（Phase 2~3 后）
- [ ] 封面可选显示（Phase 4 后）
- [ ] eco/normal/high 性能分级（Phase 5 后）
- [ ] 配置持久化，重启后恢复
- [ ] 与 vanilla / 其他 Three 模式切换无 WebGL 上下文冲突
- [ ] `cargo tauri dev` 正常运行

---

## 12. 风险与注意事项

| 风险 | 对策 |
|------|------|
| 160×160 GPU 占用过高 | 默认 normal 96²；high 128²；160 不作为默认 |
| 小浮窗性能 | eco 64² + DPR cap 1.25 |
| 与 scanGrid 体验重叠 | 定位差异：实心柱海 + 涟漪流星 vs 线框扫描 |
| 节拍/onset 不准 | MVP 用 bass/treble 阈值 + flux；后续可接全局 beat 引擎 |
| 封面竞态 | 复用 `coverTextureLoader` track token 逻辑 |
| 授权 | 仅算法参考音域回响；代码与 Shader 自研 |
| main.js / settings.js 体积 | 严格按 Phase 增量提交，避免一次改数千行 |

---

## 13. 参考代码索引

### WaveDance 内

| 文件 | 参考内容 |
|------|----------|
| `frontend/src/renderers/three/scanGridRenderer.js` | 网格世界尺寸、列聚合、相机、Bloom |
| `frontend/src/renderers/three/particleGalaxyRenderer.js` | 高粒子数 DPR cap |
| `frontend/src/renderers/three/coverParticle/rippleManager.js` | CPU 涟漪队列管理 |
| `frontend/src/renderers/three/coverTextureLoader.js` | 封面加载与 colorMixT |
| `frontend/src/renderers/three/spectrumUniforms.js` | bass/mid/treble + 8 band |
| `frontend/src/renderers/shapePipeline.js` | shape 四件套 |
| `docs/COVER_PARTICLE_DEV.md` | Three 新模式集成流程 |

### 外部（只读参考）

| 来源 | 说明 |
|------|------|
| [Steam 音域回响](https://steamcommunity.com/workshop/filedetails/?id=3747222633) | 效果描述与 changelog |
| [WE 音频可视化指南](https://steamcommunity.com/sharedfiles/filedetails/?id=3556807313) | 64 段频谱监听概念（WaveDance 用自有 FFT） |

---

## 14. 进度追踪

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | MVP：柱网 + Bloom + idle + 注册/settings | ✅ 已完成 |
| Phase 2 | bass 涟漪 | ✅ 已完成 |
| Phase 3 | 流星 + 粒子 | ✅ 已完成 |
| Phase 4 | 封面 Plane | ⬜ 待做 |
| Phase 5 | 性能分级与打磨 | ⬜ 待做 |
| Phase 6 | 可选交互扩展 | ⬜ 待做 |

---

## 15. 附录：高度场 → InstancedMesh 更新伪代码

```js
const dummy = new THREE.Object3D();
const n = gridSize * gridSize;

for (let i = 0; i < n; i++) {
  const ix = i % gridSize;
  const iz = Math.floor(i / gridSize);

  const x = (ix + 0.5) / gridSize * worldWidth - worldWidth * 0.5;
  const z = (iz + 0.5) / gridSize * worldDepth - worldDepth * 0.5;
  const h = Math.max(0.02, currentHeights[i] * maxBarHeight);

  dummy.position.set(x, h * 0.5, z);
  dummy.scale.set(1, h, 1);
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
}
instancedMesh.instanceMatrix.needsUpdate = true;
```

---

## 16. 附录：treble onset（Phase 3 用）

```js
let prevTreble = 0;

function computeTrebleFlux(treble) {
  const flux = Math.max(0, treble - prevTreble);
  prevTreble = treble;
  return flux * 4.5 + treble * 0.08;
}

// trigger when flux > (1 - sensitivity/100) * 0.42
```

---

*文档结束 — 实施时从 Phase 1 开始，勿跳过验收标准。*
