# WaveDance 封面粒子可视化 — 开发文档

> **文档类型**：实现指导手册（开发者 / Agent 跨会话接力用）  
> **创建日期**：2026-06-28  
> **状态**：待实施  
> **参考来源**：
> - 项目内 `docs/3D_EFFECTS_TECHNICAL.md`（Mineradio 3D 效果逆向笔记）
> - [Mineradio 开源仓库](https://github.com/XxHuberrr/Mineradio)（`public/index.html` 封面粒子实现）
> - 项目内 `docs/VISUALIZATION_MODES_PLAN.md`（Three 模式扩展约定）

---

## 1. 文档用途

本文档描述如何在 WaveDance **主可视化窗口**（`#waveCanvasThree`）中实现 **封面粒子**展示模式。

每次开发会话只需：

1. 打开本文档，找到「当前进度」与下一个未勾选的 Phase；
2. 只完成该 Phase 范围内的任务，**不要跨 Phase 一次性全做**；
3. 完成后更新本文档底部的「进度追踪」勾选状态；
4. 在 `docs/CHANGELOG_AGENT.md` 追加一条简短变更记录（若项目有该文件）。

**原则**：每个 Phase 完成后应能 `cargo tauri dev` 正常运行、新模式可在设置页切换并实时渲染。

---

## 2. 概念澄清（必读）

### 2.1 什么是「封面粒子」

封面粒子 **不是** WaveDance 的封面浮窗（`cover.html` / `coverWindow.js`）。

它是 Mineradio 风格的视觉效果：

```
当前播放专辑封面图（JPEG/PNG）
    ↓ 居中裁成正方形 Canvas
THREE.CanvasTexture（uCoverTex）
    ↓ 每个粒子按 aUv 采样封面颜色
GRID × GRID 点云 + 自定义 GLSL 空间变换
    ↓ 频谱 bass/mid/treble 驱动位移与亮度
主 Canvas 上渲染（透明背景，可叠在桌面之上）
```

### 2.2 与现有模式的关系

| 模式 | 是否采样封面 | 说明 |
|------|-------------|------|
| `threeParticleGalaxy` | 否 | 随机螺旋星系，纯频谱驱动 |
| **`threeCoverParticle`（新增）** | **是** | 封面 UV 采样 + preset 空间变换 |
| `cover.html` 浮窗 | 是（`<img>`） | 独立桌面挂件，与本模式无关 |

### 2.3 不在本方案范围内

以下 Mineradio 能力 **暂不移植**，避免 scope 膨胀：

- 3D 歌词组、3D 歌单架
- 轨道相机 / 焦点跟拍 / 自由镜头 / 节拍镜头
- 安魂骷髅粒子层（preset 6）
- 离线 beatmap / Web Worker 节拍预解析
- 手势遮挡（`uHandActive`）

音频驱动 MVP 阶段使用现有 `spectrumUniforms.js`（bass/mid/treble）+ `frameMeta.peak/rms` 即可。

---

## 3. 参考架构（Mineradio）

Mineradio 实现集中在 [`public/index.html`](https://github.com/XxHuberrr/Mineradio/blob/main/public/index.html)，关键符号：

| 符号 | 作用 |
|------|------|
| `buildCoverParticleGeometry(grid)` | 构建 GRID×GRID BufferGeometry（position + aUv + aRand） |
| `makeDotTexture()` | Canvas 2D 径向渐变 → 圆点 alpha 纹理 |
| `applyCoverCanvas(cv)` | 封面 Canvas → `coverTex`，切歌时保留 `prevCoverTex` |
| `buildEdgeAndDepth(cv)` | 边缘/深度预处理 → `coverEdgeTex` |
| `particles` + `bloomParticles` | 双层 `THREE.Points`，共享 geometry |
| `uniforms.uPreset` | 顶点 Shader 内 preset 分支（0~6） |

数据流：

```
封面 URL / dataUrl / 用户上传
  → Image.onload
  → makeSquareCoverCanvas(img, size)     // size: 256/384/512
  → applyCoverCanvas(cv)
       ├── coverTex.image = cv
       ├── prevCoverTex（切歌渐变）
       └── buildEdgeAndDepth(cv) → coverEdgeTex
  → Shader 每帧采样 uCoverTex(aUv) 着色
  → preset 分支变换 position
  → uBass/uMid/uTreble/uBeat 驱动 Z 位移与 gl_PointSize
```

详细 Shader 数学见 `docs/3D_EFFECTS_TECHNICAL.md` 第 5 章。

---

## 4. WaveDance 现状与集成点

### 4.1 已有能力（直接复用）

| 模块 | 路径 | 用途 |
|------|------|------|
| Three 桥接 | `frontend/src/renderers/three/threeBridge.js` | 模式注册、切换、dispose |
| 模式注册 | `frontend/src/renderers/three/registerModes.js` | `registerThreeMode()` |
| 频谱 uniform | `frontend/src/renderers/three/spectrumUniforms.js` | bass/mid/treble + 频谱纹理 |
| Simplex GLSL | `frontend/src/renderers/three/noiseGlsl.js` | SILK / 星河噪声 |
| Bloom 后处理 | `frontend/src/renderers/three/postProcessing.js` | Bloom 层 composer |
| Shape 预处理 | `frontend/src/renderers/shapePipeline.js` | gain/smooth/softClip/fallEase |
| 封面 JPEG 源 | `src-tauri/src/now_playing.rs` | `artworkPath` + `artworkRevision` |
| 封面加载范例 | `frontend/src/coverWindow.js` | `convertFileSrc` + revision 缓存破除 |

### 4.2 当前缺口

| 缺口 | 说明 |
|------|------|
| 主窗未订阅封面事件 | `main.js` 只消费 `waveform-frame`，未监听 `now-playing-update` |
| 无封面纹理 loader | 缺少 `Image → Canvas → THREE.Texture` 模块 |
| 无封面粒子 renderer | 需新建 `coverParticle/` 子目录 |
| 无 preset Shader | 需移植 Mineradio 顶点/片元 Shader 骨架 |

### 4.3 目标数据流（WaveDance）

```
Rust now_playing.rs
  → emit("now-playing-update", { artworkPath, artworkRevision, ... })
  → main.js 监听，更新 coverArtState
  → coverTextureLoader 异步加载 → THREE.CanvasTexture

Rust 音频采集
  → emit("waveform-frame", { points[], peak, rms })
  → threeBridge.render(points, shape, style, frameMeta)
  → coverParticleRenderer.render(..., spectrum, coverTextures)
  → WebGL 绘制到 #waveCanvasThree
```

### 4.4 硬性约束（继承 VISUALIZATION_MODES_PLAN）

- Three.js **仅用于新增 Three 模式**；Phase 0~14 vanilla renderer **禁止回改**
- 新代码放在 `frontend/src/renderers/three/coverParticle/`
- 共用 `#waveCanvasThree`；切换模式时 `threeBridge.setMode` dispose 旧 renderer
- `WebGLRenderer({ alpha: true })` + `setClearColor(0x000000, 0)`
- 仍走 `processSpectrumPoints` + `buildSpectrumUniforms` 预处理频谱

---

## 5. 新增模式标识

```js
// visualizationSchema.js
DISPLAY_MODES.threeCoverParticle = "threeCoverParticle"
```

设置页 `<optgroup label="Three 高阶">` 增加选项：**封面粒子**。

---

## 6. 配置 Schema

### 6.1 DEFAULT_CONFIG 结构

```js
threeCoverParticle: {
  // --- 视觉 preset ---
  preset: 0,                    // 0=丝绸 1=滚筒 2=星球 4=唱片 5=星河（3=虚空暂不提供 UI）
  coverResolution: 1.0,         // 0.75~1.55，映射 grid 88~183（奇数）
  intensity: 55,                // 0~100 → uIntensity
  depth: 50,                    // 0~100 → uDepth（SILK 深度位移）
  pointScale: 100,              // 0~100 → uPointScale
  speed: 50,                    // 0~100 → uSpeed
  twist: 0,                     // 0~100 → uTwist（仅 SILK）
  scatter: 0,                     // 0~100 → uScatter
  colorBoost: 50,               // 0~100 → uColorBoost
  bloomEnabled: true,
  bloomStrength: 0.85,
  bloomSize: 2.65,              // Bloom 层 gl_PointSize 倍率
  // --- 相机 / 交互 ---
  cameraDistance: 6.6,          // 对应 Mineradio orbit radius 量级（可调）
  cameraFovDeg: 45,
  autoRotateEnabled: true,
  autoRotateSpeedDeg: 3,
  pointerInteractionEnabled: true,  // 拖拽旋转 + SILK 鼠标涟漪
  // --- 切歌过渡 ---
  colorMixDurationMs: 1400,
  // --- shape 四件套 ---
  shape: {
    gainPercent: 55,
    smoothPercent: 24,
    softClipPercent: 14,
    fallEasePercent: 58,
  },
}
```

### 6.2 STORAGE_KEYS 命名

前缀与其他 Three 模式一致，例如：

```js
threeCoverPreset: "wavedance.threeCoverParticlePreset",
threeCoverResolution: "wavedance.threeCoverParticleResolution",
threeCoverIntensity: "wavedance.threeCoverParticleIntensity",
// ... 其余字段类推
threeCoverShape: "wavedance.threeCoverParticleShapeConfig",
```

### 6.3 coverResolution → grid 映射

移植 Mineradio 逻辑：

```js
function coverParticleGridForResolution(v) {
  const normalized = clamp(v, 0.75, 1.55);
  let grid = Math.round(118 * normalized);
  grid = clamp(grid, 88, 183);
  return grid % 2 ? grid : grid + 1;  // 强制奇数，避免 UV 中心缝
}

function coverTextureSizeForResolution(v) {
  if (v >= 1.32) return 512;
  if (v >= 1.10) return 384;
  return 256;
}
```

---

## 7. 目录结构

```
frontend/src/renderers/three/
├── coverParticle/
│   ├── coverParticleRenderer.js    # createCoverParticleRenderer(ctx) 主 factory
│   ├── coverParticleShaders.js     # vertex/fragment GLSL 字符串（主层 + Bloom 层）
│   ├── coverParticlePresets.js     # preset 常量、uniform 默认值
│   ├── coverGridGeometry.js        # buildCoverParticleGeometry(grid)
│   ├── coverDotTexture.js          # makeDotTexture()
│   ├── rippleManager.js            # 最多 12 条鼠标涟漪 → 1×12 RGBA Float 纹理
│   └── coverEdgeProcessor.js       # buildEdgeAndDepth(cv) Canvas 2D 预处理
├── coverTextureLoader.js           # 封面加载/切歌过渡/dispose（跨 renderer 共用）
└── registerModes.js                # +1 行注册
```

---

## 8. 核心模块规格

### 8.1 coverTextureLoader.js

**职责**：管理封面纹理生命周期，与 renderer 解耦。

```js
/**
 * @typedef {Object} CoverArtState
 * @property {boolean} active
 * @property {string} artworkPath
 * @property {number} artworkRevision
 * @property {string} [artworkDataUrl]
 */

/**
 * @returns {{
 *   update: (state: CoverArtState, resolution: number) => void,
 *   getTextures: () => { coverTex, prevCoverTex, edgeTex, colorMixT, hasCover },
 *   tick: (dt: number) => void,   // 更新 colorMixT 渐变
 *   dispose: () => void,
 * }}
 */
export function createCoverTextureLoader() {}
```

**加载流程**：

1. 从 `artworkPath` 构建 URL：`convertFileSrc(path) + "?v=" + revision`（参考 `coverWindow.js`）
2. 失败时 fallback 到 `artworkDataUrl`（data URL）
3. `Image.onload` → 居中裁正方形 → `Canvas` → `THREE.CanvasTexture`
4. 切歌时：当前 `coverTex` 复制到 `prevCoverTex`，重置 `colorMixT = 0`， tween 到 1
5. 无封面：`hasCover = false`，Shader 内走默认紫蓝对角渐变

**track 防竞态**：切歌时用递增 token，异步回调中校验 token 仍有效再写纹理（移植 Mineradio `coverApplyStillCurrent`）。

### 8.2 coverGridGeometry.js

```js
const PLANE_SIZE = 4.8;

/**
 * @param {number} grid 奇数，88~183
 * @returns {THREE.BufferGeometry}
 */
export function buildCoverParticleGeometry(grid) {
  const count = grid * grid;
  const positions = new Float32Array(count * 3);
  const aUv = new Float32Array(count * 2);
  const aRand = new Float32Array(count);
  const texelStep = 1 / grid;

  for (let i = 0; i < count; i++) {
    const gx = i % grid;
    const gy = Math.floor(i / grid);
    const u = (gx + 0.5) * texelStep;
    const v = (gy + 0.5) * texelStep;
    const px = gx / (grid - 1);
    const py = gy / (grid - 1);

    positions[i * 3]     = (px - 0.5) * PLANE_SIZE;
    positions[i * 3 + 1] = (py - 0.5) * PLANE_SIZE;
    positions[i * 3 + 2] = 0;
    aUv[i * 2]     = u;
    aUv[i * 2 + 1] = v;
    aRand[i]       = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aUv", new THREE.BufferAttribute(aUv, 2));
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
  geo.userData = { grid, count };
  return geo;
}
```

### 8.3 双层 Points 渲染

与 Mineradio 一致，共享 geometry：

| 层 | blending | renderOrder | gl_PointSize |
|----|----------|-------------|--------------|
| `bloomParticles` | `AdditiveBlending` | 0 | `× uBloomSize` |
| `particles`（主层） | `NormalBlending` | 1 | 默认 |

共同 uniform 包：`uTime, uBass, uMid, uTreble, uBeat, uPreset, uCoverTex, uPrevCoverTex, uColorMixT, uDotTex, ...`

### 8.4 Shader Uniform 清单（MVP）

```
// 时间 / 音频
uTime, uBass, uMid, uTreble, uBeat, uEnergy

// 视觉控制
uPreset, uIntensity, uDepth, uPointScale, uSpeed, uTwist
uColorBoost, uScatter, uCoverRes, uAlpha, uParticleDim
uBloomStrength, uBloomSize

// 纹理
uCoverTex, uPrevCoverTex, uEdgeTex, uRippleTex, uDotTex
uColorMixT, uHasCover, uHasDepth, uAiBoost

// 交互
uMouseXY, uMouseActive
uLoading, uBurstAmt
```

**音频映射（MVP，不移植 beatmap）**：

```js
const K = (intensity / 100) * 1.6;

uBass.value   = spectrum.bass;
uMid.value    = spectrum.mid;
uTreble.value = spectrum.treble;
uBeat.value   = beatPulse;  // peak 超阈值时触发衰减脉冲
uEnergy.value = Math.max(frameMeta.rms, beatPulse * 0.3);
uIntensity.value = intensity / 100;
```

简易 `beatPulse` 实现：

```js
let beatPulse = 0;
if (frameMeta.peak > silencePeakGate * 8) {
  beatPulse = Math.min(1, frameMeta.peak * 1.2);
}
beatPulse *= 0.88;  // 每帧衰减
```

### 8.5 Preset 分期实现

| Phase | Preset | 索引 | 要点 |
|-------|--------|------|------|
| **P1 MVP** | 丝绸 SILK | 0 | XY 平面 + Simplex Z 位移 + bass/mid/treble + 鼠标涟漪 |
| **P1 MVP** | 唱片 VINYL | 4 | 极坐标圆盘 + 沟槽 + uVinylSpin 自转 |
| P2 | 滚筒 TUNNEL | 1 | 圆柱参数化，参考 `bloomTunnelRenderer.js` |
| P2 | 星球 ORBIT | 2 | 球面映射，参考 `energySphereRenderer.js` |
| P3 | 星河 WALLPAPER | 5 | 极光丝带 + 星尘，无封面时也好看 |
| 跳过 | 虚空 VOID | 3 | alpha=0，留给自定义背景，MVP 不提供 |
| 跳过 | 安魂 SKULL | 6 | 需独立骷髅资源 |

各 preset 数学公式详见 `docs/3D_EFFECTS_TECHNICAL.md` §5.8。

### 8.6 coverEdgeProcessor.js（Phase 3）

Canvas 2D 轻量预处理，输出 RGBA 纹理：

| 通道 | 内容 | MVP |
|------|------|-----|
| R | 深度（亮度近似或 Sobel 梯度） | 可用亮度 `0.299R+0.587G+0.114B` 近似 |
| G | 边缘（Sobel） | Phase 3 |
| B | 前景掩码 | 可选 |
| A | 亮度 | 可选 |

SILK preset 的 `depthZ` 依赖 R 通道；MVP 无 edge 时 `uHasDepth = 0`，仍可用噪声位移。

### 8.7 rippleManager.js（Phase 2）

- CPU 维护最多 12 条涟漪：`{ x, y, age, strength }`
- 写入 `1×12` `RGBA Float` DataTexture
- Shader 内 `rippleSumAt(uv)` 叠加 bulge + ring
- 仅 `uPreset < 0.5`（SILK）时启用鼠标写入

---

## 9. main.js 集成改动清单

### 9.1 订阅封面事件

```js
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

let coverArtState = { active: false, artworkPath: "", artworkRevision: 0, artworkDataUrl: "" };

await listen("now-playing-update", (event) => {
  const p = event.payload ?? {};
  coverArtState = {
    active: Boolean(p.active),
    artworkPath: typeof p.artworkPath === "string" ? p.artworkPath.trim() : "",
    artworkRevision: Number(p.artworkRevision) || 0,
    artworkDataUrl: typeof p.artworkDataUrl === "string" ? p.artworkDataUrl : "",
  };
});

// 启动时拉快照
try {
  const snap = await invoke("get_now_playing_snapshot");
  // 同上赋值 coverArtState
} catch { /* ignore */ }
```

### 9.2 扩展 frameMeta

```js
const frameMeta = {
  peak: latestPeak,
  rms: latestRms,
  cover: coverArtState,
};
threeBridge.render(points, shape, style, frameMeta);
```

### 9.3 模式状态变量

参照 `threeGalaxy*` 变量块，在 `main.js` 增加 `threeCover*` 系列：

- `threeCoverPreset`, `threeCoverResolution`, `threeCoverIntensity`, ...
- `getShapeConfigForMode` / `getStyleConfigForMode` 增加 `DISPLAY_MODES.threeCoverParticle` 分支
- 监听 `waveform-three-cover-*` 设置事件（命名与现有 Three 模式一致）

### 9.4 指针交互（Phase 2）

在 `#waveCanvasThree` 上：

- `pointerdown/move/up`：SILK 涟漪 + 累积 `particleGroup.rotation`
- 坐标转换：屏幕 → NDC → 世界 XY（与 Mineradio 鼠标推开逻辑一致）

---

## 10. settings 集成改动清单

### 10.1 settings.html

- 展示模式下拉：`<option value="threeCoverParticle">封面粒子</option>`
- 新配置面板 `#threeCoverParticleConfigPanel`：
  - preset 下拉（丝绸 / 唱片 / …）
  - 封面清晰度 slider（映射 coverResolution 0.75~1.55，显示 grid 如 `119×119`）
  - 强度 / 深度 / 速度 / Bloom 开关与强度
  - 自转开关与速度
  - shape 四件套（复用现有控件模式）

### 10.2 settings.js

- 切换模式时显示/隐藏 `#threeCoverParticleConfigPanel`
- emit 事件：`waveform-three-cover-preset`、`waveform-three-cover-resolution` 等
- 持久化到 localStorage（`STORAGE_KEYS`）

---

## 11. 分阶段实施计划

### Phase 1：封面纹理桥接（约 1 天）

**目标**：主窗能异步加载当前播放封面为 `THREE.Texture`。

- [ ] 新建 `frontend/src/renderers/three/coverTextureLoader.js`
- [ ] `main.js` 订阅 `now-playing-update` + 启动快照
- [ ] `frameMeta.cover` 传入 threeBridge
- [ ] 单元验证：控制台 log 封面加载成功 / fallback / 无封面

**验收**：

- 播放音乐时 `coverTextureLoader.getTextures().hasCover === true`
- 切歌时 `prevCoverTex` 保留旧图，`colorMixT` 从 0→1
- 停止播放时 fallback 到默认渐变（hasCover=false）

---

### Phase 2：封面粒子 MVP — SILK + VINYL（约 3~4 天）

**目标**：可切换的 `threeCoverParticle` 模式，两个 preset 可用。

- [ ] 新建 `coverParticle/` 子目录（geometry、dotTexture、shaders、renderer）
- [ ] 实现 SILK（preset 0）顶点/片元 Shader
- [ ] 实现 VINYL（preset 4）顶点/片元 Shader
- [ ] 双层 Points + Bloom composer
- [ ] `visualizationSchema.js`：DISPLAY_MODES、DEFAULT_CONFIG、STORAGE_KEYS、normalizeDisplayMode
- [ ] `registerModes.js` 注册
- [ ] `main.js`：状态变量、getStyleConfigForMode、事件监听
- [ ] `settings.html` + `settings.js`：模式选项 + 基础配置面板

**验收**：

- 设置页选「封面粒子」→ 主窗显示封面点云
- SILK：低频时封面「呼吸」起伏
- VINYL：圆盘布局 + 缓慢自转
- 切歌颜色渐变约 1.4s
- 无封面时显示默认渐变粒子场
- 切换至其他 Three 模式再切回，无 WebGL 泄漏

---

### Phase 3：边缘纹理 + 鼠标涟漪（约 1~2 天）

- [ ] `coverEdgeProcessor.js`：Canvas 2D 亮度深度 + Sobel 边缘
- [ ] SILK 启用 `uHasDepth`，前景/背景 Z 分离
- [ ] `rippleManager.js` + 指针交互
- [ ] preset=0 时鼠标划过 Z 方向涟漪

**验收**：

- SILK 模式下封面主体比背景更「立体」
- 鼠标划过有可见涟漪推开效果

---

### Phase 4：扩展 Preset（约 2~3 天 / preset）

- [ ] TUNNEL（preset 1）
- [ ] ORBIT（preset 2）
- [ ] WALLPAPER（preset 5）— 无封面时也应有良好默认视觉

**验收**：各 preset 在设置页可切换，视觉与文档描述一致。

---

### Phase 5：性能与打磨（约 1~2 天）

- [ ] `coverResolution` 联动 DPR cap（参考 `particleGalaxyRenderer` 高粒子数降 DPR）
- [ ] 小浮窗默认 grid 88~119（eco），大屏可手动拉高
- [ ] 切歌 `uLoading` 加载动画（粒子聚环再展开，可选）
- [ ] preset 切换 `uBurstAmt` 脉冲（可选）

**验收**：

- 1280×720 窗口 grid=119 稳定 ≥30fps
- grid=183 时 DPR 自动降低，无明显卡死

---

## 12. 验收标准（总览）

- [ ] 新模式 `threeCoverParticle` 在设置页可选
- [ ] 封面来自系统 Now Playing，**不依赖** cover 浮窗
- [ ] 至少 SILK + VINYL 两个 preset 可用
- [ ] 双层渲染（主层 + Bloom）正常
- [ ] 切歌封面渐变过渡
- [ ] 无封面时有合理默认视觉
- [ ] 与 vanilla / 其他 Three 模式切换无 WebGL 上下文冲突
- [ ] 配置持久化，重启后恢复
- [ ] `cargo tauri dev` 正常运行

---

## 13. 风险与注意事项

| 风险 | 对策 |
|------|------|
| WebGL2（Three）与 WebGL1（vanilla）互斥 | 切换模式走 `threeBridge.setMode` + dispose |
| 封面加载竞态（快速切歌） | track token + `coverApplyStillCurrent` |
| 小浮窗性能 | 默认 grid≤119，DPR cap，高 grid 降帧更新 |
| Mineradio Shader 体量 | 分 preset 分支逐步实现，MVP 仅 2 个 |
| GPL-3.0 授权 | Mineradio 为 GPL-3.0；**参考算法/doc 自研实现**，不要直接复制大段源码；必要时注明灵感来源 |
| 封面浮窗混淆 | 本文档已明确：两者独立，封面粒子读同一 `artworkPath` 但渲染在主 Canvas |

---

## 14. 参考代码索引

### WaveDance 内

| 文件 | 参考内容 |
|------|----------|
| `frontend/src/renderers/three/particleGalaxyRenderer.js` | Points + Bloom + 频谱驱动 + DPR cap |
| `frontend/src/renderers/three/bloomTunnelRenderer.js` | 自定义 ShaderMaterial 写法 |
| `frontend/src/renderers/three/noiseGlsl.js` | Simplex 3D 拼入 vertex shader |
| `frontend/src/coverWindow.js` | `convertFileSrc` + artworkRevision |
| `docs/3D_EFFECTS_TECHNICAL.md` | Shader 数学、uniform 体系 |

### Mineradio 内（只读参考）

| 位置 | 关键词 |
|------|--------|
| `public/index.html` ~5700 | `buildCoverParticleGeometry`, `makeDotTexture` |
| `public/index.html` ~5810 | `uniforms`, vertex/fragment shader 字符串 |
| `public/index.html` ~9870 | `applyCoverCanvas`, `buildEdgeAndDepth` |
| `public/index.html` ~7510 | `coverParticleGridForResolution` |

---

## 15. 进度追踪

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 封面纹理桥接 | ⬜ 待做 |
| Phase 2 | MVP：SILK + VINYL + 注册/settings | ⬜ 待做 |
| Phase 3 | 边缘纹理 + 鼠标涟漪 | ⬜ 待做 |
| Phase 4 | TUNNEL / ORBIT / WALLPAPER | ⬜ 待做 |
| Phase 5 | 性能与打磨 | ⬜ 待做 |

---

## 16. 附录：SILK Preset  Shader 要点速查

> 完整公式见 `docs/3D_EFFECTS_TECHNICAL.md` §5.8

```
pos = 原始 XY 平面 (±2.4)

pos.z = rippleZ×1.30 + midDisp + trebleJ + bassBreath + depthZ

midDisp    = snoise(双层) × uMid × 0.55 × K
trebleJ    = snoise(高频) × uTreble × 0.18 × K
bassBreath = snoise(低频) × uBass × 0.42 × K
depthZ     = (depthVal - 0.5) × uAiBoost × uDepth × 1.40 × uHasDepth

K = uIntensity × 1.6

gl_PointSize = clamp(depthSize × audioBoost, 1.05, 4.95)
```

## 17. 附录：VINYL Preset 要点速查

```
p = rotate(uVinylSpin) × (aUv - 0.5) × 5.12
d = |p|
封面区 d < coverR：圆形 UV 采样封面
沟槽区 coverR ≤ d ≤ recordR：sin groove + treble tick
uVinylSpin += dt × (0.40 + smoothBass×0.09) × speed
```

---

*文档维护：每完成一个 Phase，更新 §15 进度追踪勾选状态。*
