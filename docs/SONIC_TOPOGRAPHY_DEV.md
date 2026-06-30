# WaveDance Sonic Topography 可视化 — 技术规划文档

> **文档类型**：实现指导手册（开发者 / Agent 跨会话接力用）  
> **创建日期**：2026-06-30  
> **状态**：Phase 6 已完成（MVP 收尾）；Phase 7 为可选扩展  
> **目标**：在 WaveDance 主可视化窗口中**完整复刻** [sonic-topography](https://github.com/yin-yizhen/sonic-topography) 的 3D 棋盘海浪展示效果  
> **策略**：**新增独立展示模式**，完整保留现有「音域回响」（`threeSoundField` / `soundField/`）；新效果以 **`threeSoundField2`（音域回响 2）** 注册，与旧模式并存  
> **关联文档**：`docs/SOUND_FIELD_DEV.md`（旧音域回响，继续维护）| `docs/VISUALIZATION_MODES_PLAN.md`

---

## 1. 文档用途

本文档描述如何在 WaveDance **主可视化窗口**（`#waveCanvasThree`）中，**新增**展示模式 **音域回响 2**（`threeSoundField2`），复刻 [sonic-topography](https://github.com/yin-yizhen/sonic-topography) 的 Sonic Topography 风格 3D 音频地形。现有 **音域回响**（`threeSoundField`）**不做任何删改**。

每次开发会话只需：

1. 打开本文档，找到「当前进度」与下一个未勾选的 Phase；
2. **只完成该 Phase 范围内的任务**，不要跨 Phase 一次性全做；
3. 完成后更新本文档底部的「进度追踪」勾选状态；
4. 在 `docs/CHANGELOG_AGENT.md` 追加一条简短变更记录。

**原则**：每个 Phase 完成后应能 `cargo tauri dev` 正常运行、设置页可选「音域回响 2」并实时渲染，观感逐步逼近 sonic-topography 主界面；切换回「音域回响」时旧效果不受影响。

---

## 2. 模式命名与并存关系

### 2.0 双模式对照（必读）

| 项目 | 音域回响（保留） | 音域回响 2（本方案新建） |
|------|-----------------|------------------------|
| 模式 id | `threeSoundField` | **`threeSoundField2`** |
| 设置页显示名 | 音域回响 | **音域回响 2** |
| 实现目录 | `renderers/three/soundField/` | **`renderers/three/sonicTopography/`** |
| 注册 factory | `createSoundFieldRenderer` | **`createSonicTopographyRenderer`** |
| 配置面板 id | `#threeSoundFieldConfigPanel` | **`#threeSoundField2ConfigPanel`** |
| Schema 键前缀 | `threeSoundField*` | **`threeSoundField2*`** |
| DEFAULT_CONFIG | `DEFAULT_CONFIG.threeSoundField` | **`DEFAULT_CONFIG.threeSoundField2`** |
| 开发文档 | `docs/SOUND_FIELD_DEV.md` | **本文档** |

设置页 `<optgroup label="Three 高阶">` 中两项相邻排列：

```html
<option value="threeSoundField">音域回响</option>
<option value="threeSoundField2">音域回响 2</option>
```

---

## 3. 目标效果定义

### 3.1 必须实现的视觉特征

| 特征 | sonic-topography 行为 | WaveDance 验收标准 |
|------|----------------------|-------------------|
| 棋盘柱网 | N×N `InstancedMesh`，柱体在 Shader 内随音频位移 | 有音乐时地形明显起伏，静音时有 ocean-like idle 波 |
| 8 频段空间语义 | 中心 sub-bass 大丘；外围 high-mid 随机尖峰；mid 对角流 | 低频鼓点抬中心，高频段外围有尖刺感 |
| GPU 涟漪 | 最多 10 条，Kick 彩色波 / Snare 白色 sharp 波 | 鼓点可见环形扩散，军鼓/ clap 为更锐的白波 |
| 触发器 | Pulse / Meteor / Snare 三套 Auto Beat | 与 sonic 默认灵敏度下节奏响应相近 |
| Kick deform | 低频脉冲叠加 sub-bass/bass uniform | 大鼓时中心「整块弹起」 |
| Fragment 着色 | warmth 冷暖、presence/brilliance/air 顶面闪、距离雾 | 柱顶有闪烁/边缘微光，远处淡出 |
| 地面 EQ | 8 推子控制各频段对地形影响（视觉混音台） | 设置页调推子可明显改变地形性格 |
| 浮动块 | 外围 ~80 个 InstancedMesh 漂浮柱 | 网格外围有独立漂浮几何 |
| Bloom | 地形 + 粒子共用后处理 | 高亮区域有霓虹晕 |
| 主题 | ink-wash / nocturnal / neon-tokyo 等 | 至少内置 5 套，可切换 |
| 封面 Plane | 柱海上空专辑图，切歌 crossfade | Now Playing 有封面时显示（Phase 5） |

### 3.2 明确不在本方案范围内

以下 sonic-topography 能力 **不移植**（WaveDance 已有独立模块或与本目标无关）：

| 能力 | 原因 |
|------|------|
| Electron 桌面壳 / Windows EXE 打包 | WaveDance 使用 Tauri |
| 内置播放器 UI / 本地文件上传 / Demo 曲目 | WaveDance 有 `musicPlayerWindow` 等 |
| 网易云 / QQ 登录、搜索、歌单 | WaveDance 有 `musicPlatformAuth.js` 等 |
| 3D 空间歌词 `SpatialLyrics3D` | WaveDance 有独立歌词窗；可选 Phase 7 |
| 番茄钟 / 时间显示 | 非可视化核心 |
| 预设导入导出 JSON | 可选 Phase 7，非 MVP |
| OrbitControls 自由拖拽（默认开） | 与透明浮层窗口拖拽冲突；Phase 7 可选 |
| React Three Fiber | WaveDance 使用原生 Three.js，**禁止引入 R3F** |

### 3.3 与现有 WaveDance 模式的关系

| 模式 | 差异 |
|------|------|
| **`threeSoundField`（保留）** | CPU 高度场柱网 + bass 涟漪 + treble 流星；见 `SOUND_FIELD_DEV.md` |
| `threeScanGrid` | 线框网格 + 扫描光，无实心 Shader 地形 |
| `terrain3d` | WebGL1 滚动 mesh，非 Instanced 柱网 |
| `threeNoiseLandscape` | Simplex 噪声地貌，非 8 段分区柱海 |
| **`threeSoundField2`（本方案）** | **Sonic Topography 棋盘 Shader 地形 + 地面 EQ + 浮动块** |

---

## 4. 参考源码索引（sonic-topography · 只读）

> 仓库 MIT 许可，**仅算法级参考**；GLSL 与 TS 逻辑在 WaveDance 内自研重写，禁止整段复制 Shader 字符串。

| sonic 文件 | 职责 | WaveDance 对应（待建） |
|-----------|------|----------------------|
| `src/components/AudioVisualizer/MapScene.tsx` | 场景组装、每帧 uniform、涟漪/流星/浮动块 | `sonicTopographyRenderer.js` |
| `src/components/AudioVisualizer/CustomShaderMaterial.ts` | 地形 + 浮动块 + 封面 Shader | `terrainMaterial.js` / `floatingBlockMaterial.js` / `coverPlane.js` |
| `src/lib/AudioEngine.ts` | 512 bin 分析、8 段、触发器、音色指标 | `audioAnalysis.js` + `triggerEngine.js` |
| `src/lib/groundEqSettings.ts` | 地面 EQ、地形密度、浮动块参数 | `groundEq.js` |
| `src/lib/terrainResponse.ts` | Kick deform 脉冲 | `terrainResponse.js` |
| `src/lib/triggerSettings.ts` | Pulse / Meteor 持久化 | schema + settings |
| `src/lib/themes.ts` | 内置主题 + 自定义主题 | `themes.js` |
| `src/types.ts` | `AudioData` 结构 | `audioAnalysis.js` JSDoc typedef |

---

## 5. WaveDance 集成架构

### 5.1 保留不动的壳层

```
Rust 音频采集 (src-tauri)
  → emit("waveform-frame", { points[], peak, rms })
  → main.js latestPoints / latestPeak / latestRms

Rust now_playing（可选）
  → emit("now-playing-update", { artworkPath, ... })
  → threeBridge.syncCoverTextures

threeBridge.render(points, shape, style, frameMeta)
  → processSpectrumPoints → buildSpectrumUniforms（粗粒度，Phase 1 后扩展）
  → sonicTopographyRenderer.render(...)
  → Bloom composer → #waveCanvasThree
```

| 模块 | 路径 | 用途 |
|------|------|------|
| Three 桥接 | `frontend/src/renderers/three/threeBridge.js` | 模式切换、dispose、封面 tick |
| 模式注册 | `frontend/src/renderers/three/registerModes.js` | **追加** `threeSoundField2` 注册；**保留** `threeSoundField` |
| Shape 预处理 | `frontend/src/renderers/shapePipeline.js` | gain/smooth/softClip/fallEase |
| Bloom | `frontend/src/renderers/three/postProcessing.js` | `createBloomComposer` |
| 封面纹理 | `frontend/src/renderers/three/coverTextureLoader.js` | 切歌 `colorMixT` |
| Simplex 噪声 | `frontend/src/renderers/three/noiseGlsl.js` | 可复用 snoise 片段 |

### 5.2 不得改动的现有实现

以下文件/目录在本方案全周期内 **禁止修改**（除非修复 crash 类 bug）：

```
frontend/src/renderers/three/soundField/     ← 音域回响 v1，完整保留
docs/SOUND_FIELD_DEV.md                      ← 旧模式开发文档，继续有效
```

`visualizationSchema.js` 中的 `threeSoundField`、`STORAGE_KEYS.threeSoundField*`、`DEFAULT_CONFIG.threeSoundField` **保持原样**；本方案仅 **新增** `threeSoundField2` 平行条目。

### 5.3 新目录结构

```
frontend/src/renderers/three/sonicTopography/
├── sonicTopographyRenderer.js    # createSonicTopographyRenderer(ctx) 主 factory
├── terrainMaterial.js            # 地形 ShaderMaterial（vertex 位移 + fragment 着色）
├── floatingBlockMaterial.js      # 浮动块 Shader（可与地形共用 fragment 逻辑）
├── floatingBlocks.js             # 外围 InstancedMesh 布局与每帧矩阵
├── audioAnalysis.js              # 8 段 + 音色指标 + 帧间 flux
├── groundEq.js                   # EQ 推子 → uniform 增益映射
├── terrainResponse.js            # Kick deform（参考 sonic terrainResponse.ts）
├── triggerEngine.js              # Pulse / Meteor / Snare 触发评估
├── rippleBuffer.js               # 10 条 GPU ripple 环形缓冲
├── meteorSystem.js               # 流星 InstancedMesh + 粒子 pool
├── themes.js                     # 内置主题 resolveTheme()
├── coverPlane.js                 # 封面 Plane Shader
└── gridSettings.js               # terrainDensity → gridSize/spacing
```

### 5.4 Renderer 接口约定

与现有 Three 模式一致：

```js
/**
 * @param {import('../threeContext.js').ThreeContext} ctx
 * @returns {{ render: Function, dispose: Function }}
 */
export function createSonicTopographyRenderer(ctx) {
  const render = (points, shapeConfig, styleConfig, frameMeta, spectrum, processed) => {
    // processed: shapePipeline 后的 Float32Array
    // frameMeta: { peak, rms, coverTextures, ... }
    // spectrum: buildSpectrumUniforms 输出（Phase 1 起扩展为 sonicAudio）
  };
  return { render, dispose };
}
```

### 5.5 硬性约束

- Three.js **仅用于新增模式**；禁止回改 Phase 0~14 vanilla renderer，**禁止回改** `soundField/` 与 `threeSoundField` 集成代码
- `WebGLRenderer({ alpha: true })` + `setClearColor(0x000000, 0)`
- **禁止**引入 `@react-three/fiber`、`@react-three/drei`
- **禁止**整段复制 sonic-topography 的 Shader 字符串；按算法自研等效 GLSL
- 新模式 id 固定为 **`threeSoundField2`**；localStorage 使用独立 `threeSoundField2*` 前缀，与 v1 零冲突

---

## 6. 音频分析层规格

### 6.1 输入与输出

**输入**：`processSpectrumPoints()` 后的 `processed`（长度 = 用户分桶数，通常 64~256）。

**输出** `SonicAudioFrame`（每帧计算，参考 sonic `types.ts`）：

```js
/**
 * @typedef {Object} SonicAudioFrame
 * @property {number} subBass    // ~20-60Hz 等效
 * @property {number} bass
 * @property {number} lowMid
 * @property {number} mid
 * @property {number} highMid
 * @property {number} presence
 * @property {number} brilliance
 * @property {number} air
 * @property {number} bass legacy bass（sub+bass+lowMid 聚合，兼容）
 * @property {number} mid
 * @property {number} treble
 * @property {number} energy
 * @property {number} warmth
 * @property {number} brightness
 * @property {number} sharpness
 * @property {number} smoothness
 * @property {number} density
 * @property {number} spectralCentroid
 */
```

### 6.2 频段映射策略

sonic 使用 Web Audio 512 bin FFT；WaveDance 桶数可变，需 **按归一化频率索引** 切分：

```js
// 伪代码：将 processed[i] 按 t = i / (len - 1) 映射到 8 段
// 段边界（归一化 0~1，可调）：
const BAND_EDGES = [0, 0.02, 0.06, 0.12, 0.28, 0.48, 0.65, 0.82, 1.0];
// 对应：subBass, bass, lowMid, mid, highMid, presence, brilliance, air
```

每段取段内 **峰值**（与 sonic 一致），再除以段内 bin 数做平均归一化。

### 6.3 音色指标公式（与 sonic AudioEngine 对齐）

| 指标 | 公式 |
|------|------|
| warmth | `(subBass+bass+lowMid+mid) / energySum` |
| brightness | `(presence+brilliance+air) / energySum` |
| sharpness | `max(0, brightness - prevBrightness) * 10` |
| smoothness | `max(0, 1 - meanAbsDelta * 2)` |
| density | `activeBands / 8`（超过 `energy * 1.5` 的段数） |
| spectralCentroid | `Σ(i * val) / Σ(val)`（i 为桶索引） |
| energy | 全桶均值 |

### 6.4 帧间状态与平滑

- 维护 `prevProcessed[]` 用于 flux 计算
- 对 8 段 uniform 做指数平滑，blend 系数由 **地面 EQ 起伏速度** `motionSpeed` 驱动：

```js
const responseRate = lerp(2.2, 60, motionSpeed / 100);
const responseBlend = 1 - Math.exp(-responseRate * dt);
smoothed.subBass = lerp(smoothed.subBass, target.subBass, responseBlend);
```

- 静音衰减：当 `rms < threshold` 时，用较慢 decay（参考 sonic `visualRelease`），避免地形突然拍平

### 6.5 触发器 flux（triggerEngine.js）

三套触发器，默认 band 映射到 **归一化频谱索引**（非 512 bin，按 processed 长度缩放）：

| 触发器 | 默认频段语义 | 触发效果 |
|--------|-------------|----------|
| Pulse (Kick) | 最低 ~2%–6% | 彩色 ripple + kickDeform |
| Snare | ~12%–48% | 白色 sharp ripple |
| Meteor | 最高 ~62%–100% | spawn 流星 |

评估逻辑（参考 sonic `AudioEngine.evaluateTrigger`）：

- 计算 band 内正 flux 均值
- 与 `sensitivity` 阈值比较
- `cooldown` 帧防抖（Pulse 默认 ~15 帧，Meteor ~241 帧）

---

## 7. 地形 Shader 规格

### 7.1 InstancedMesh 布局

参考 sonic `deriveTerrainGridSettings`：

```js
// gridSettings.js
const TERRAIN_BASE_SIZE = 168;  // 世界单位覆盖宽度（与 sonic 对齐）
const TERRAIN_MIN_GRID = 96;
const TERRAIN_MAX_GRID = 224;
const TERRAIN_DEFAULT_GRID = 160;

function deriveGridSettings(densityPercent) {
  const gridSize = round(MIN + (MAX - MIN) * density / 100);
  const spacing = TERRAIN_BASE_SIZE / gridSize;
  return { gridSize, spacing, boxWidth: spacing * (0.9 / 1.05), instanceCount: gridSize ** 2 };
}
```

WaveDance 性能档（设置页）：

| 档位 | gridSize | 说明 |
|------|----------|------|
| eco | 96 | 集成显卡 / 小窗 |
| normal | 128 | 默认 |
| high | 160 | 接近 sonic 默认 |

> 不建议默认 224²（50176 实例），除非 Phase 6 实测 macOS 稳定 ≥30fps。

### 7.2 Vertex Shader 要点

每个实例 `(x, z)` 在 Shader 内计算 `elevation`：

1. **Idle**：simplex noise + sin 波，`uSmoothness` 混合，`globalFalloff` 距中心衰减
2. **Sub-bass**：`smoothstep(25, 0, centerDist) * uSubBass * 5.0`
3. **Bass**：cluster noise + random gate * `uBass * 4.0`
4. **Low-mid**：slow snoise * `uLowMid * 2.5`
5. **Mid**：diagonal river flow * `uMid * 3.0`
6. **High-mid**：外围 + random spike * `uHighMid * 2.5`
7. **Energy spike**：`rnd > 0.99` 时叠加 `uEnergy`
8. **Noise gate**：`max(0, elevation - 0.2)` 防止底噪抬升
9. **Amplitude**：整体 * `uAmplitude`（来自地面 EQ 幅度推子，0~100 映射 0~15×）
10. **Ripples**：循环 10 条 `uRipples[i]`，Kick/Snare 不同 speed/width

柱体局部 Y：`pos.y = -0.5 + yNorm * (1.0 + elevation)`（底面锚定 y=0）

### 7.3 Fragment Shader 要点

- 顶面 / 侧面分支（`vNormal.y > 0.5`）
- warmth → cool/warm 色混合
- presence → 随机 flash；brilliance → 边缘 micro-spark；air → 低柱 idle twinkle
- 距离雾 + alpha 淡出（透明浮层友好）
- ripple 颜色 override（`uRippleColor` / 白色 Snare 波）

### 7.4 Uniform 清单

| Uniform | 来源 |
|---------|------|
| uTime | clock |
| uSubBass ~ uAir | groundEq × audioAnalysis × kickDeform |
| uWarmth, uBrightness, uSharpness, uSmoothness, uDensity, uSpectralCentroid, uEnergy, uAmplitude | audioAnalysis + groundEq |
| uRipples[10] | rippleBuffer |
| uBaseColor1/2, uFogColor, uCoolCore/Edge, uWarmCore/Edge, uRippleColor, uGlowIntensity | themes.js |
| uTreble | legacy，Meteor 强度参考 |

---

## 8. 地面 EQ 规格

### 8.1 8 推子语义（与 sonic README 一致）

| 索引 | ID | 界面标签 | 视觉性格 |
|------|-----|---------|----------|
| 0 | subBass | 中心抬升 | 低频集中推动地面中心 |
| 1 | bass | 低频重量 | 厚重感 |
| 2 | lowMid | 慢波流动 | 缓慢波动 |
| 3 | mid | 方向流 | 方向性起伏 |
| 4 | highMid | 尖峰 | 节奏凸起 |
| 5 | presence | 闪光触发 | 局部高亮 |
| 6 | brilliance | 边缘微闪 | 细碎边缘闪烁 |
| 7 | air | 空气颗粒 | 高频颗粒感 |

### 8.2 推子 → 增益公式

参考 sonic `applyGroundEqBandValue`：

```js
const delta = (eqValue - 50) / 50;
if (delta >= 0) return clamp(raw * (1 + delta * 1.8), 0, 1);
const dullness = Math.abs(delta);
return clamp(max(0, raw - dullness * 0.35) * (1 - dullness * 0.35), 0, 1);
```

### 8.3 全局参数

| 参数 | 范围 | 作用 |
|------|------|------|
| motionSpeed | 0~100 | 8 段 uniform 平滑速度 |
| amplitude | 0~100 | 地形整体幅度（≤50 线性缩，>50 指数放大至 15×） |
| terrainDensity | 0~100 | gridSize 96~224 插值 |
| enabledBands[8] | boolean | 逐段开关 |

---

## 9. 涟漪 / 流星 / 浮动块

### 9.1 rippleBuffer.js

```js
const MAX_RIPPLES = 10;

// ripple: { pos: Vector2, time, strength, isActive, rippleType }
// rippleType: 0 = Kick 彩色, 1 = Snare 白色

export function createRippleBuffer() {
  return {
    spawn(x, z, strength, isWhite) {},
    tick(elapsedTime) {},  // 过期 isActive → 0
    toUniformArray() {},   // 传给 Shader
    dispose() {},
  };
}
```

spawn 由 `triggerEngine` 回调触发；Kick 偏向中心（dist < 20），Snare 分布更广。

### 9.2 meteorSystem.js

- 最多 20 颗流星（InstancedMesh 或 Points）
- 最多 200 颗粒子 trail
- spawn：Meteor 触发 + cooldown
- 撞击：局部 burst 粒子

### 9.3 floatingBlocks.js

- 默认 80 个实例，环形分布在外围（radius 14~76）
- 独立 `FloatingBlockShaderMaterial`，共享主题 uniform
- `floatingBlockIntensity / speed / minSize / maxSize` 控制可见性与动画

### 9.4 terrainResponse.js

直接移植 sonic 算法（纯数学，可几乎 1:1）：

- `applyKickImpulse(target, strength)`
- `stepKickDeform({ current, target, delta })`
- `mixKickIntoLowBands({ subBass, bass, kickDeform })`

---

## 10. 主题系统

### 10.1 MVP 内置主题（Phase 4）

| id | 名称 |
|----|------|
| ink-wash | 水墨 |
| nocturnal | 夜行 |
| neon-tokyo | 霓虹东京 |
| cyber-forest | 赛博森林 |
| minimal-monochrome | 极简单色（默认） |

每套主题输出：

```js
{
  uBaseColor1, uBaseColor2, uFogColor,
  uCoolCore, uCoolEdge, uWarmCore, uWarmEdge,
  uRippleColor, uGlowIntensity
}
```

### 10.2 切主题

- 颜色 uniform 每帧 `lerp` 过渡（`lerpSpeed = 1 - exp(-3 * dt)`）
- Phase 7 可选：自定义主题、主题自动轮换

---

## 11. 配置 Schema

### 11.1 DEFAULT_CONFIG.threeSoundField2（新建）

```js
threeSoundField2: {
  // --- 地形 / 性能 ---
  gridPreset: "normal",           // "eco" | "normal" | "high"
  terrainDensity: 46,             // 0~100，与 gridPreset 联动或替代
  terrainBaseSize: 168,

  // --- 地面 EQ ---
  groundEqBands: [50, 50, 50, 50, 50, 50, 50, 48],
  groundEqEnabledBands: [true, true, true, true, true, true, true, true],
  groundEqMotionSpeed: 50,
  groundEqAmplitude: 50,

  // --- 触发器 ---
  pulseEnabled: true,
  pulseSensitivity: 0.85,
  pulseCooldown: 15,
  snareEnabled: true,
  snareSensitivity: 0.6,
  snareCooldown: 30,
  meteorEnabled: true,
  meteorSensitivity: 0.45,
  meteorCooldown: 241,

  // --- 浮动块 ---
  floatingBlocksEnabled: true,
  floatingBlockIntensity: 55,
  floatingBlockMinSize: 9,
  floatingBlockMaxSize: 26,
  floatingBlockSpeed: 77,
  floatingBlockCount: 80,

  // --- 视觉 ---
  themeId: "minimal-monochrome",
  bloomEnabled: true,
  bloomStrength: 0.75,
  bloomThreshold: 0.08,

  // --- 相机 ---
  cameraPitchDeg: 52,
  cameraDistance: 14,
  cameraFovDeg: 50,
  autoRotateEnabled: true,
  autoRotateSpeedDeg: 2.5,

  // --- 封面 ---
  coverEnabled: true,
  coverSize: 2.4,
  coverHeight: 4.2,
  coverOpacity: 0.92,

  // --- shape 四件套（保留 WaveDance 习惯） ---
  shape: {
    gainPercent: 62,
    smoothPercent: 18,
    softClipPercent: 12,
    fallEasePercent: 52,
  },
}
```

> `DEFAULT_CONFIG.threeSoundField` **不得修改**；上表为 v2 独立默认配置。

### 11.2 DISPLAY_MODES 与 THREE_DISPLAY_MODES

```js
// visualizationSchema.js — 追加
DISPLAY_MODES.threeSoundField2 = "threeSoundField2";

// THREE_DISPLAY_MODES 数组中，紧接 threeSoundField 之后插入：
DISPLAY_MODES.threeSoundField2,

// normalizeDisplayMode() 增加分支：
if (s === DISPLAY_MODES.threeSoundField2) return DISPLAY_MODES.threeSoundField2;
```

### 11.3 STORAGE_KEYS 命名（独立前缀）

使用 **`threeSoundField2*`** 前缀，与 v1 完全隔离：

```js
threeSoundField2GridPreset: "wavedance.threeSoundField2GridPreset",
threeSoundField2TerrainDensity: "wavedance.threeSoundField2TerrainDensity",
threeSoundField2GroundEqBands: "wavedance.threeSoundField2GroundEqBands",
threeSoundField2GroundEqMotionSpeed: "wavedance.threeSoundField2GroundEqMotionSpeed",
threeSoundField2GroundEqAmplitude: "wavedance.threeSoundField2GroundEqAmplitude",
threeSoundField2Theme: "wavedance.threeSoundField2ThemeId",
threeSoundField2PulseEnabled: "wavedance.threeSoundField2PulseEnabled",
threeSoundField2MeteorEnabled: "wavedance.threeSoundField2MeteorEnabled",
threeSoundField2FloatingBlocks: "wavedance.threeSoundField2FloatingBlocksEnabled",
threeSoundField2Bloom: "wavedance.threeSoundField2BloomEnabled",
threeSoundField2BloomStrength: "wavedance.threeSoundField2BloomStrength",
threeSoundField2CameraPitch: "wavedance.threeSoundField2CameraPitchDeg",
threeSoundField2CameraDistance: "wavedance.threeSoundField2CameraDistance",
threeSoundField2AutoRotate: "wavedance.threeSoundField2AutoRotateEnabled",
threeSoundField2AutoRotateSpeed: "wavedance.threeSoundField2AutoRotateSpeedDeg",
threeSoundField2Cover: "wavedance.threeSoundField2CoverEnabled",
threeSoundField2CoverSize: "wavedance.threeSoundField2CoverSize",
threeSoundField2Shape: "wavedance.threeSoundField2ShapeConfig",
// ... 触发器灵敏度、浮动块参数、Snare 开关等同理
```

`buildPerWindowStorageKeys()` 中为 spectrum 子窗同步生成 `${pre}.threeSoundField2*` 映射。

### 11.4 settings.js 面板映射

```js
// MODE_CONFIG_PANELS 追加：
[DISPLAY_MODES.threeSoundField2]: "threeSoundField2ConfigPanel",
```

---

## 12. 集成改动清单（按文件）

| 文件 | Phase | 改动 |
|------|-------|------|
| `sonicTopography/*.js` | 1~5 | **新建**目录 |
| `soundField/` | — | **不改动** |
| `registerModes.js` | 0 | **追加** `registerThreeMode(DISPLAY_MODES.threeSoundField2, createSonicTopographyRenderer)` |
| `visualizationSchema.js` | 0~1 | **追加** `threeSoundField2` 枚举、`DEFAULT_CONFIG`、`STORAGE_KEYS`、`normalizeDisplayMode` |
| `settings.html` | 1~4 | **新增** `<option value="threeSoundField2">音域回响 2</option>` + `#threeSoundField2ConfigPanel` |
| `settings.js` | 1~4 | 新增 panel 映射、localStorage、emit 事件（DOM id 用 `threeSoundField2*`） |
| `main.js` | 1 | **追加** v2 状态变量 + `getStyleConfigForMode` / `getShapeConfigForMode` 分支 |
| `README.md` | 6 | 展示模式表增加「音域回响 2」一行 |
| `docs/SOUND_FIELD_DEV.md` | — | **不改动**（v1 文档继续有效） |
| `CHANGELOG_AGENT.md` | 每 Phase | 追加记录 |

---

## 13. 设置页 UI 规划

### 13.1 面板分区（`#threeSoundField2ConfigPanel`）

| 区块 | 控件 |
|------|------|
| 地形 | 渲染精度 eco/normal/high；地形密度 slider |
| 地面 EQ | 8 垂直推子 + 逐段启用 checkbox；起伏速度；幅度 |
| 特效 | 脉冲(Pulse) / 流星 / 军鼓(Snare) 开关 + 灵敏度 |
| 浮动块 | 开关 + 强度 + 速度 + 数量 |
| 主题 | 下拉 5 套内置 |
| 封面 | 开关 + 尺寸 |
| 相机 | 俯角 / 距离 / 自动旋转 |
| Bloom | 开关 + 强度 |
| 形状 | gain / smooth / softClip / fallEase |

### 13.2 地面 EQ 面板布局参考

可参考 sonic 截图 `public/screenshots/ground-eq.png`：8 推子横排，上方全局「起伏速度」「幅度」。

---

## 14. 分 Phase 实施计划

### Phase 0：注册与骨架（约 0.5~1 天）

- [x] 新建 `sonicTopography/` 目录与 `sonicTopographyRenderer.js` 空壳
- [x] `registerModes.js` **追加** `threeSoundField2` 注册（保留 `threeSoundField`）
- [x] `visualizationSchema.js` **追加** `DISPLAY_MODES.threeSoundField2`、`DEFAULT_CONFIG.threeSoundField2`、`STORAGE_KEYS`
- [x] `settings.html` 新增 `<option value="threeSoundField2">音域回响 2</option>` + `#threeSoundField2ConfigPanel` 占位
- [x] `settings.js` / `main.js` 最小分支（切换不 crash）
- [x] **确认** `soundField/` 与 `#threeSoundFieldConfigPanel` 未被改动

**验收**：`cargo tauri dev` 可启动；「音域回响」与「音域回响 2」均可切换；v1 效果不变；v2 可清屏占位。

---

### Phase 1：Shader 地形 + 8 段音频（约 4~6 天）

- [x] `audioAnalysis.js`：8 段 + 音色指标 + 平滑
- [x] `terrainMaterial.js`：vertex 位移 + fragment 着色（自研 GLSL）
- [x] `gridSettings.js` + InstancedMesh 初始化
- [x] `groundEq.js`：推子增益（先用默认 50 也可）
- [x] Bloom composer
- [x] 相机 + 自动旋转
- [x] `themes.js`：先 1 套 minimal-monochrome
- [x] settings / main.js 最小接入（主题 + Bloom + 相机）

**验收**：

- 播放音乐 → 棋盘地形随频段起伏，中心低频、外围尖峰可辨
- 静音 → idle 海浪
- normal 档 128²，1280×720 ≥30fps

---

### Phase 2：触发器 + GPU 涟漪 + Kick deform（约 2~3 天）

- [x] `triggerEngine.js`：Pulse / Snare / Meteor
- [x] `rippleBuffer.js` + Shader uniform 绑定
- [x] `terrainResponse.js`：kick deform
- [x] settings：脉冲 / 军鼓 / 流星开关与灵敏度

**验收**：

- 鼓点 → 中心彩色扩散波 + 中心抬升
- 军鼓/clap → 白色锐波
- 高频段 → 流星（Phase 2 末或 Phase 3 初）

---

### Phase 3：流星 + 粒子（约 2 天）

- [x] `meteorSystem.js`：InstancedMesh + 粒子 pool
- [x] 与 Bloom 共用

**验收**：高频密集段可见流星与撞击粒子，不遮挡地形。

---

### Phase 4：地面 EQ UI + 浮动块 + 全主题（约 3~4 天）

- [x] settings.html 8 推子面板 + 起伏速度/幅度
- [x] `floatingBlocks.js` + `floatingBlockMaterial.js`
- [x] `themes.js` 5 套内置 + 设置页切换

**验收**：

- 调 EQ 推子明显改变地形
- 外围浮动块可见
- 5 主题可切换且颜色 lerp 过渡

---

### Phase 5：封面 + 性能打磨（约 2 天）

- [x] `coverPlane.js` + `frameMeta.coverTextures`
- [x] eco/normal/high DPR cap
- [x] 静音 decay 优化
- [x] high 档帧率实测与降级提示

**验收**：

- Now Playing 封面显示于地形上方，切歌 crossfade
- eco 档集成显卡 ≥30fps

---

### Phase 6：文档收尾（约 0.5 天）

- [x] 更新 `README.md`：Three 高阶分组增加「音域回响 2」说明
- [x] 本文档进度追踪勾选完成项
- [x] 确认 v1/v2 切换与 localStorage 互不干扰

**v1/v2 隔离核查（2026-06-30）**：

| 项 | 结果 |
|----|------|
| `STORAGE_KEYS` 值 | `threeSoundField*` 与 `threeSoundField2*` localStorage 路径无重叠 |
| `buildPerWindowStorageKeys()` | v1/v2 键均独立映射 `${pre}.threeSoundField*` / `threeSoundField2*` |
| `settings.html` DOM id | `#threeSoundField*` 与 `#threeSoundField2*` 无交叉 |
| `registerModes.js` | `threeSoundField` → `soundField/`；`threeSoundField2` → `sonicTopography/` 独立 factory |
| 配置面板 | `#threeSoundFieldConfigPanel` / `#threeSoundField2ConfigPanel` 各自 `hidden` 切换 |

---

### Phase 7（可选）：扩展

- [ ] 自定义主题色
- [ ] 主题自动轮换
- [ ] OrbitControls（默认关，设置页可开）
- [ ] 点击触发流星
- [ ] 3D 空间歌词 overlay
- [ ] 预设导入导出

---

## 15. 验收标准（总览）

- [x] 设置页同时存在「音域回响」与「音域回响 2」，互不覆盖
- [x] `threeSoundField2` 展示 sonic-topography 级棋盘 Shader 地形
- [x] `threeSoundField`（v1）行为与改前一致
- [x] 8 频段空间语义 + 地面 EQ 8 推子（v2）
- [x] Kick 彩色涟漪 + Snare 白波 + Meteor（v2）
- [x] 浮动块 + 5 主题 + Bloom（v2）
- [x] 封面 Plane（Phase 5，v2）
- [x] v2 配置持久化（`threeSoundField2*` keys），重启恢复
- [x] v1 / v2 / 其他 Three 模式切换无 WebGL 泄漏（`threeBridge.setMode` dispose 旧 renderer）
- [x] `cargo tauri dev` 正常；macOS 透明浮层 alpha 正确

---

## 16. 风险与对策

| 风险 | 对策 |
|------|------|
| 160²+ Shader 位移 GPU 压力大 | 默认 normal 128²；eco 96²；DPR cap 1.25~1.5 |
| FFT 桶数少（64）导致高频段粗糙 | audioAnalysis 段内插值 + 相邻桶 smooth |
| 与浮层拖拽冲突 | 默认固定相机；Orbit 仅 Phase 7 可选 |
| Shader 编译失败 | onCompile 错误 log + fallback 纯色地形 |
| v1/v2 设置页 DOM id 混淆 | 严格 `threeSoundField2*` 前缀；code review 禁止改 v1 选择器 |
| settings.js / main.js 体积膨胀 | v2 分支独立区块；按 Phase 增量提交 |
| 授权合规 | MIT 参考算法；GLSL 自研；不复制大段源码 |

---

## 17. 性能预算

| 档位 | gridSize | 实例数 | DPR cap | 目标 fps |
|------|----------|--------|---------|----------|
| eco | 96 | 9,216 | 1.25 | ≥30 |
| normal | 128 | 16,384 | 1.5 | ≥30 |
| high | 160 | 25,600 | 1.25 | ≥24（或提示降档） |

浮动块 + 流星粒子计入 draw call，high 档若低于 24fps 应自动建议 eco。

---

## 18. 进度追踪

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 0 | 注册 threeSoundField2 + 新骨架 | ✅ 完成 |
| Phase 1 | Shader 地形 + 8 段音频 | ✅ 完成 |
| Phase 2 | 触发器 + GPU 涟漪 + Kick deform | ✅ 完成 |
| Phase 3 | 流星 + 粒子 | ✅ 完成 |
| Phase 4 | 地面 EQ UI + 浮动块 + 主题 | ✅ 完成 |
| Phase 5 | 封面 + 性能打磨 | ✅ 完成 |
| Phase 6 | 文档收尾 | ✅ 完成 |
| Phase 7 | 可选扩展 | ⬜ 待做 |

---

## 19. 附录 A：sonicTopographyRenderer 主循环伪代码

```js
function render(points, shapeConfig, styleConfig, frameMeta, spectrum, processed) {
  const dt = clock.getDelta();
  const style = resolveStyle(styleConfig);
  const theme = resolveTheme(style.themeId);

  // 1. 音频分析
  const raw = analyzeSpectrum(processed, prevProcessed);
  const eq = applyGroundEq(raw, style.groundEqBands, style.groundEqEnabledBands);
  smoothAudioUniforms(eq, style.groundEqMotionSpeed, dt);

  // 2. 触发器
  triggerEngine.evaluate(raw.flux, dt, {
    onPulse: (s) => { ripples.spawn(..., false); kickTarget = applyKickImpulse(kickTarget, s); },
    onSnare: (s) => ripples.spawn(..., true),
    onMeteor: (s) => meteors.spawn(s),
  });

  // 3. Kick deform
  const kick = stepKickDeform({ current: kickCurrent, target: kickTarget, delta: dt });
  const lows = mixKickIntoLowBands({ subBass: eq.subBass, bass: eq.bass, kickDeform: kick.current });

  // 4. 更新 Shader uniforms
  terrainMat.uTime = elapsed;
  terrainMat.uSubBass = lows.subBass;
  // ... uBass ~ uAir, timbral, uRipples, theme colors (lerp)

  // 5. 浮动块
  floatingBlocks.update(dt, eq, theme);

  // 6. 封面
  coverPlane.update(frameMeta.coverTextures, style);

  // 7. 相机旋转
  if (style.autoRotateEnabled) fieldGroup.rotation.y += speed * dt;

  // 8. 渲染
  composer.render();
}
```

---

## 20. 附录 B：音域回响 v1 与 v2 差异摘要

| 项目 | 音域回响 v1（`threeSoundField`） | 音域回响 2（`threeSoundField2`） |
|------|--------------------------------|----------------------------------|
| 状态 | **保留，继续维护** | **本方案新建** |
| 高度计算 | CPU `mapSpectrumToHeightField` | GPU Vertex Shader |
| 涟漪 | CPU 改柱高 | GPU uniform 10 条波 |
| 着色 | MeshBasicMaterial 渐变 | 自定义 Fragment Shader |
| 频段 | bass/mid/treble + 8 band 映射 | 8 段 Ground EQ + 音色指标 |
| 触发 | bass/treble flux 简化 | Pulse / Snare / Meteor 三套 |
| 布局 | scatter / ring / linear | sonic 中心距离语义 |
| 浮动块 | 无 | 有 |
| 配置存储 | `threeSoundField*` | `threeSoundField2*`（独立） |

---

*文档结束 — 实施时从 Phase 0 开始，按 Phase 验收，勿跳过；v1 代码勿动。*
