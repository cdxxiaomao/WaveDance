# Mineradio 3D 效果技术文档

## 1. 概述

Mineradio 的 3D 视觉系统运行在 Electron 渲染进程内，采用 **Three.js r128** 作为 3D 引擎，底层通过 **WebGL** 绘制。整个场景挂载在全屏透明 Canvas 上，与 HTML/CSS 界面层叠：UI 负责搜索、控制、设置等交互，Canvas 负责封面粒子、3D 歌词、3D 歌单架等空间化内容。

辅助依赖：

| 组件 | 用途 |
|------|------|
| Three.js r128 | 场景、相机、几何体、材质、渲染器 |
| GSAP | 歌单详情关闭、部分 UI 过渡动画 |
| Web Audio API | 频谱分析，驱动粒子律动与镜头节拍 |
| Canvas 2D | 歌单卡片、歌词文字、封面边缘/深度预处理 |

设计原则：**单一 Three.js 场景、多子系统分层**；UI 纹理走 Canvas → `CanvasTexture` → 平面 Mesh；动态视觉走 `BufferGeometry` + 自定义 GLSL Shader。

---

## 2. 场景架构

### 2.1 基础对象

```
Scene (透明背景)
├── WebGLRenderer (alpha: true, antialias: false)
├── PerspectiveCamera (FOV 45°, near 0.1, far 100)
├── 封面粒子层 (Points × 2: 主层 + Bloom 辉光层)
├── 浮空粒子层 (Points, 可选，当前默认关闭)
├── 背面封面层 (可选)
├── 安魂骷髅粒子层 (预设 6 专用)
├── 3D 歌词组 (Group: 文字 + 辉光 + 太阳溢光 + 火花)
└── 3D 歌单架组 (Group: 卡片 Mesh + 详情面板 + 歌曲行)
```

### 2.2 渲染层级 (renderOrder)

通过 `renderOrder` 控制透明物体绘制顺序，避免歌词与歌单架互相遮挡：

| 层级区间 | 内容 |
|----------|------|
| 0–1 | Bloom 辉光粒子、主封面粒子 |
| 24–38 | 3D 歌词（详情页打开时降至 24，平时约 38） |
| 30–70 | 歌单架卡片（常驻模式基础 30+，选中浮起可达 130+） |
| 232+ | 歌单详情面板、歌曲列表行 |

### 2.3 主循环

每帧 `requestAnimationFrame` 驱动，核心流程：

1. 自适应帧率门控（后台/大屏/交互_boost 分档）
2. 更新 `uTime` 等 Shader Uniform
3. Web Audio 频谱采样 → bass / mid / treble / beat
4. 更新相机（轨道、焦点、自由镜头、节拍镜头）
5. 更新各子系统（粒子、骷髅、歌词、歌单架）
6. `renderer.render(scene, camera)`

启动页覆盖主场景时，降频预热渲染（约 520ms 一次），避免 WebGL 上下文冷启动卡顿。

---

## 3. 渲染与性能

### 3.1 像素预算

根据 `performanceQuality`（eco / balanced / high / ultra）动态限制 `devicePixelRatio`：

- 上限 cap：0.95 ~ 1.75
- 下限 min：0.56 ~ 0.85
- 像素预算 budget：240 万 ~ 780 万

公式：`ratio = clamp(min(dpr, cap, sqrt(budget / cssPixels)), min, dpr)`。

深后台模式强制 DPR ≤ 0.30，帧率约 1fps。

### 3.2 帧率策略

- 默认跟随显示器 VSync（`RENDER_VISIBLE_VSYNC = true`）
- 交互后 900ms 内可提升帧率（`markRenderInteraction`）
- 按窗口像素量分三档 load tier，大屏可单独限帧

### 3.3 歌单架增量构建

卡片不会一次性全部实例化。可见窗口半径 `SHELF_VISIBLE_RADIUS = 5`，最多同时渲染 11 张卡。异步构建时每次 idle/RAF 最多建 2 张、耗时 < 7ms，避免主线程长阻塞。

---

## 4. 相机系统

### 4.1 轨道相机 (Orbit)

球坐标参数：

| 参数 | 含义 | 默认 |
|------|------|------|
| theta | 水平角 | 0 |
| phi | 俯仰角 | 0.08 |
| radius | 距离 | 6.6 |
| minRadius / maxRadius | 缩放范围 | 2.4 ~ 14.0 |

**双层偏移模型：**

- `userOrbit`：用户拖拽/滚轮产生的偏移，持久保留
- `cinemaOffset`：电影模式微偏移，叠加在 user 之上
- `focus`：歌单架/队列焦点跟拍，优先级最高

最终：`theta = userTheta + cineTheta`（focus 激活时改用 focus 目标）。

交互：

- 拖拽 Canvas：调整 userTheta / userPhi
- 滚轮：调整 userRadius
- 双击空白：回正 userOrbit
- 中心锁定模式：忽略 user 偏移，仅 cinema + baseline

### 4.2 焦点跟拍 (Focus Zone)

鼠标悬停歌单热区约 0.5s 后激活，类型包括：

| 类型 | 场景 | 效果 |
|------|------|------|
| shelf-side | 侧栏歌单架 | 镜头推近右侧，lookAt 偏移到架体 |
| shelf-detail | 详情页打开 | 更近、lookAt 对准详情区域 |
| shelf-stage | 舞台模式 | 居中仰拍 |
| queue | 播放队列 | 微左移、抬升 |

静态镜头模式（`shelfCameraMode = static`）下，焦点跟拍被禁用；动态模式才启用。

不同视觉预设（星河、安魂）有独立的安全镜头参数，避免粒子壁纸或骷髅构图被镜头推坏。

### 4.3 自由镜头 (Free Camera)

独立第一人称模式：

- WASD / 方向键平移，鼠标拖拽 yaw/pitch
- 滚轮调整 FOV（26° ~ 72°）
- 状态持久化到 localStorage
- 支持平滑回正 tween（约 620ms）
- 与节拍镜头叠加：rollKick、radiusKick、punch 仍作用于 shake

### 4.4 节拍镜头 (Beat Camera)

节拍镜头是 **事件队列模型**，而非每帧直接读 bass。详见 **6.2 节拍检测与 Beatmap 调度**。

消费端摘要：

- `beatCam.punch` → FOV 收缩（`BASE_FOV - punch × 2.35`）
- `beatCam.radiusKick` → 沿视线前后微移（模拟 zoom punch）
- `beatCam.phiKick / thetaKick` → 轨道相机 pitch/yaw 抖动
- `beatCam.rollKick` → `camera.rotation.z` 微旋

强度由 `fx.cinemaShake`（0 ~ 1.8）统一缩放；`fx.cinema` 关闭时不入队任何 beat 事件。

---

## 5. 封面粒子系统

### 5.1 几何与纹理

- 平面网格：`GRID × GRID` 个粒子点（分辨率可调，典型 64~118 格）
- 每点属性：`position`、`aUv`（封面采样坐标）、`aRand`（随机种子）
- 平面尺寸 `PLANE_SIZE = 4.8` 世界单位

纹理输入：

| 纹理 | 通道 | 用途 |
|------|------|------|
| uCoverTex | RGB | 当前封面颜色 |
| uPrevCoverTex | RGB | 切歌过渡旧封面 |
| uEdgeTex | R=深度, G=边缘, B=前景掩码, A=亮度 | AI/算法深度、边缘增强 |
| uRippleTex | 1×12 RGBA Float | 鼠标涟漪 (x,y,age,str) |
| uDotTex | Alpha | 圆点粒子形状 |

切歌时 `uColorMixT` 从 0→1 混合新旧封面色。

### 5.2 七大视觉预设

顶点 Shader 内按 `uPreset` 分支，同一套几何走不同空间变换：

| 索引 | 名称 | 形态 | 要点 |
|------|------|------|------|
| 0 | 丝绸 (SILK) | XY 平面 + Z 涟漪 | Simplex 噪声位移；支持鼠标推开、扭曲、AI 深度 |
| 1 | 滚筒 (TUNNEL) | 圆柱隧道 | 绕 Z 自旋；UV 沿流动方向重映射；纵深衰减 |
| 2 | 星球 (ORBIT) | 球面 | 经纬映射； bass 膨胀 + treble 耀斑；缓慢 yaw 自转 |
| 3 | 虚空 (VOID) | 隐藏 | 粒子推到 z=-90，alpha=0，留给自定义背景 |
| 4 | 唱片 (VINYL) | 圆盘 | 中心封面 + 外圈沟槽；uVinylSpin 旋转；白边粒子环 |
| 5 | 星河 (WALLPAPER) | 全屏壁纸 | 分层：80% 极光丝带 + 20% 深度星尘；螺旋/带状布局 |
| 6 | 安魂 (SKULL) | 骷髅粒子 | 主粒子层弱化，独立骷髅 Points 层接管视觉 |

### 5.3 Shader Uniform 体系

核心 Uniform：

```
uTime, uBass, uMid, uTreble, uBeat, uEnergy
uPreset, uIntensity, uDepth, uPointScale, uSpeed, uTwist
uColorBoost, uScatter, uCoverRes, uBgFade
uBloomStrength, uBloomSize, uTintColor, uTintStrength
uMouseXY, uMouseActive, uHandXY, uHandActive, uGestureGrip
uAlpha, uParticleDim, uFloatAlpha, uLoading, uBurstAmt
```

- `uIntensity` 内部乘以 1.6 作为位移增益 K
- `uParticleDim`：覆盖层打开时只压暗粒子，不影响 3D 卡片
- `uBurstAmt`：预设切换脉冲

### 5.4 双层粒子渲染

1. **主层** (`NormalBlending`)：实体粒子，fragment 含可读性 rim、边缘 boost
2. **Bloom 层** (`AdditiveBlending`)：同几何体，点尺寸 × `uBloomSize`，alpha × `uBloomStrength`

两层同步 `rotation`，跟随封面旋转。

### 5.5 交互

- **鼠标涟漪**（仅 SILK）：距鼠标 < 1.0 单位时 Z 方向推开，写入 ripple 纹理
- **手势遮挡**：`uHandActive` 大半径 Z/Y 推开，支持 grip 收缩
- **封面旋转**：拖拽时 `particlePointerSpin` 累积 yaw/pitch
- **加载动画**：`uLoading` 驱动粒子聚成圆环再展开

### 5.6 浮空粒子与背面封面

- 浮空层：1300 点独立 BufferGeometry，sin/cos 长周期漂移；当前入口默认关闭
- 背面封面：可选第二组平面粒子，镜像当前封面，rotation 同步主粒子

### 5.7 顶点 Shader 公共管线

所有预设共享同一套 `main()` 骨架，按顺序执行：

```
采样封面/边缘 → 按 uPreset 分支计算 pos → 鼠标/手势/Scatter/Twist
→ 颜色/亮度/涟漪 varyings → uLoading 雾态混合 → gl_PointSize → gl_Position
```

**封面采样**

- `safeCoverUv()` 将 UV clamp 到 `[0.0012, 0.9988]`，避免边缘采样污染
- 切歌过渡：`coverColor = mix(prevCol, newCol, uColorMixT)`
- 默认渐变色（无封面时）：对角紫蓝渐变，由 `aUv` 插值

**Simplex 噪声**

- 内置 3D Simplex `snoise(vec3)`，用于 SILK / 星河 / 加载雾等位移
- 律动增益：`K = uIntensity × 1.6`，所有 preset 位移项均乘 K

**涟漪系统 (`rippleSumAt`)**

- CPU 每帧维护最多 12 条涟漪，写入 1×12 RGBA Float 纹理
- 每条含 `(x, y, age, strength)`；Shader 循环采样并叠加：
  - **bulge**：高斯凸起，宽度随 age 增大
  - **ring**：向外扩散的环形波
- 幅度约为 v7.0 的 2×，用于 SILK 的 Z 位移和 `vRipple` 亮度

**共享后处理（preset 分支之后）**

| 阶段 | 条件 | 效果 |
|------|------|------|
| 鼠标推开 | SILK 且 uMouseActive，距鼠标 < 1.0 | `pos.z += push² × 0.55` |
| 手势遮挡 | uHandActive > 0，距手 < 1.55 | Z 推高 + XY 外推 |
| 手势握持 | uGestureGrip | XY 收缩、Z 随 bass 呼吸 |
| Scatter | uScatter > 0 | 随机方向 XY 抖动 |
| Twist | SILK 且 uTwist > 0 | 随 Z 旋转 XY |

**点尺寸 (`gl_PointSize`)**

```
depthSize = 36 / max(0.5, -mvPos.z)
audioBoost = 1 + maxRippleAmp×0.7 + edgeBoost×0.55 + uBeat×0.30 + uBurstAmt×0.5
sz = clamp(depthSize × audioBoost, 1.05, 4.95)   // 默认 preset
```

- 唱片 preset：ringDrive 驱动，上限约 3.9
- 星河 preset：flowDrive 驱动，上限约 5.45
- 加载态：`sz × loadingMistSize`（1.26 ~ 2.2）

### 5.8 各预设数学模型详解

#### Preset 0 — 丝绸 (SILK)

保持原始 XY 平面，`pos = position`（±2.4 世界单位）。

```
pos.z = rippleZ×1.30 + midDisp + trebleJ + bassBreath + depthZ

midDisp  = snoise(双层) × uMid × 0.55 × midMask × K
trebleJ  = snoise(高频) × uTreble × 0.18 × K
bassBreath = snoise(低频) × uBass × 0.42 × K
depthZ   = (depthVal - 0.5) × uAiBoost × uDepth × 1.40 × uHasDepth
```

- `depthVal` 来自边缘纹理 R 通道（AI/算法深度）
- 唯一支持鼠标涟漪、Twist、AI 深度、背景 fade 的 preset
- `uBgFade` 通过 `fgMask` 压低背景粒子亮度

#### Preset 1 — 滚筒 (TUNNEL)

圆柱参数化，UV 映射到隧道：

```
angle = aUv.x × 2π + t×0.12          // 整管绕 Z 自旋
flow  = fract(aUv.y - t×0.08×(1 + uBass×0.55))
zPos  = (flow - 0.5) × 9.0
r     = 2.0 - uBass×0.28×K + ripG    // bass 收缩半径
pos   = (cos(angle)×r, sin(angle)×r, zPos)
```

- 封面 UV 重映射为 `(aUv.x, flow)`，颜色随流动方向采样
- 纵深衰减：`vColor *= 0.4 + depthFade×0.7`，`depthFade = smoothstep(-4.5, 4.5, zPos)`

#### Preset 2 — 星球 (ORBIT)

球面经纬映射：

```
theta = aUv.x × 2π
phi   = (aUv.y - 0.5) × π
r     = 2.2 × (1 + uBass×0.35×K) + trebFlare
pos   = 球坐标 (r, theta, phi)
pos.xz = rotateY(t×0.18) × pos.xz     // 缓慢自转
```

- `trebFlare = snoise × uTreble × 0.85 × K`，高频耀斑叠加在半径上

#### Preset 3 — 虚空 (VOID)

```
pos = (tiny_xy, z=-90)
vAlpha = 0, vColor = 0
```

粒子推到相机后方不可见，Canvas 仅显示自定义背景色/壁纸。

#### Preset 4 — 唱片 (VINYL)

极坐标圆盘布局，平面缩放 5.12×：

```
p = rotate(uVinylSpin) × (aUv - 0.5) × 5.12
d = |p|
recordR = 2.46, coverR = 1.18
```

**封面区** (`d < coverR`)：

- UV = `p / (coverR×2) + 0.5`，圆形裁剪采样封面
- 高分辨率 guard：`hiResGuard = smoothstep(1.08, 1.55, uCoverRes)` 降低 edge/beat 幅度，并对封面做 4 点 soft blur
- 白边：`border = exp(-((d-coverR)/0.064)²)`
- Z 抬升：`0.040 + border×0.026 + uBeat×0.018`

**沟槽区** (`coverR ≤ d ≤ recordR`)：

- 粗/细 groove：`sin((d-coverR) × 98~58)` 叠加
- 随机 tick 闪白：`hash11(angle×38 + d×72)` × uTreble
- 沟槽色 `#0d0d0f` 系 + 封面色 32% 混合
- 外圈白 rim + bass 驱动 Z 起伏

**律动 guard**：高分辨率下 edge/groove/beat 强度分别降至 38%/48%/36%，防止超密网格时唱片纹路过亮。

#### Preset 5 — 星河 (WALLPAPER)

按 `aUv.y` 分两带：

**下 80% — 极光丝带**

```
band = floor(warpedLane/0.80 × 5.65 + noise)
flow = fract(aUv.x + t×drift + seed)
arc  = (flow-0.5) × π × (1.35 + bandN×0.72)
spiralRadius = 9.2 + bandN×11.8 + seed×6
pos.x = cos(arc×0.72) × spiralRadius + flow偏移
pos.y = bandN×13.2 + armCurve + broadWave + fineWave
pos.z = mix(-23.5, 15.5, bandN) + 波动
vAlpha = (0.18 + ridge×0.78 + pulse) × softMask
vColor = mix(coverColor, aurora色, 0.62+ridge×0.22)
```

**上 20% — 深度星尘**

- 随机 cluster 散布在 ±45×22 空间，Z 深度 -32 ~ 18
- `twinkle = pow(sin(...), 5)` 驱动闪烁
- `dust = smoothstep(0.22, 0.98, hash)` 控制可见比例

**切换脉冲**：`uBurstAmt > 0` 时 XY _burst 方向扩散 + noise 扰动 + 整体 scale×1.014。

#### Preset 6 — 安魂 (SKULL)

主封面粒子层在 CPU 侧 `visible = false`，Bloom 同步关闭。视觉由独立骷髅 Points 层承担（见第 10 章）。

### 5.9 片元 Shader 与 Bloom 差异

**主层 Fragment**

```
col = vColor × vBright
col += edgeBoost 增亮 + vRipple 脉冲增亮
readableRim：点边缘暗粒子压黑、亮粒子提白（防歌词可读性被亮斑破坏）
alpha = dotTex.a × uAlpha × uParticleDim × vAlpha
```

**vBright 分 preset 策略**

| Preset | 基础亮度 | 额外驱动 |
|--------|----------|----------|
| 0–2 | 0.82 + ripple + bass + edge + burst | 常规 |
| 4 唱片 | 0.94 + ripple×0.64 + uBeat×0.16 | 节拍环闪 |
| 5 星河 | 0.94 + 低 bass/energy | 抑制过曝 |

**Bloom Fragment**

- 同 varyings，但 `col × (0.55 + vBright×0.62)`
- `alpha = soft × uAlpha × uBloomStrength × uParticleDim × pulse × 0.55 × vAlpha × bloomKeep`
- `bloomKeep`：纯黑封面粒子 bloom 保留 8%，避免暗背景完全无辉光
- 顶点 Shader 与主层相同，仅 `gl_PointSize × uBloomSize`（默认约 2.65）

### 5.10 CPU → GPU 音频 Uniform 映射

主循环末尾写入 Shader：

```
uBass / uMid / uTreble ← smooth 包络 × fx.intensity
uBeat ← beatPulse（衰减中的节拍脉冲）
uEnergy ← max(smoothEnergy, beatPulse×0.30)
```

**Preset ≥ 4 特殊 remap**（唱片/星河）：

- 先做 ring 分离：`ringBass = smoothBass×1.58 + beatPulse×0.42 - mid/treb 泄漏`
- 再 `pow(clamp01(...), 0.72~0.84)` 压缩动态范围
- 星河额外 cap：bass≤0.46、mid≤0.40、treble≤0.36，beatPulse×0.34

**唱片旋转**：`uVinylSpin += dt × (0.40 + smoothBass×0.09) × fx.speed`

---

## 6. 音频驱动

### 6.1 频谱分段

FFT size 2048，采样率 44100Hz，bin 宽约 21.5Hz：

| 频段 | Bin 范围 | 用途 |
|------|----------|------|
| Kick | 0–7 (≈60–150Hz) | smoothBass，鼓点检测 |
| Vocal | 7–140 (≈200–3000Hz) | 人声，不参与鼓点 |
| Mid | 140–280 (≈3–6kHz) | 乐器 mid |
| Treble | 280+ (≈6kHz+) | 高频 sparkle |

动态峰值跟踪 + attack/release 包络，输出 `bass / mid / treble / energy`，再乘 `fx.intensity`。

### 6.2 节拍检测与 Beatmap 调度

系统采用 **三路并行、互为补位** 的节拍架构：

```
                    ┌─────────────────┐
  离线分析 ────────►│  beatMapCache   │──► currentBeatMap
  (Web Worker)      └────────┬────────┘         │
                             │                  ▼
                    tickBeatMap() ──────► scheduleBeatCamera(map)
                             │                  │
  实时引擎 ──► processRealtimeBeatEngine()       │
       │              │                         │
       └──────── scheduleBeatCamera(live) ◄─────┘
                             │
                             ▼
                    beatCam.events[] ──► updateBeatCamera()
                             │                  │
                             ├─► punch / radiusKick / phiKick …
                             └─► scheduledBeatPulse → uBeat
```

#### 6.2.1 主循环频谱（视觉 Uniform 用）

AnalyserNode FFT 2048，与实时引擎 **分离**（后者用独立 `beatAnalyser`）。

输出经峰值归一化 + attack/release 包络：

- `smoothBass`：主要由 kick bin 驱动，release 慢（0.075）
- `smoothMid`：3–6kHz 乐器，避免人声污染
- `beatPulse`：衰减脉冲，合并 scheduledBeatPulse 与实时 onset

#### 6.2.2 实时 Beat 引擎

Dedicated analyser，按 **Hz 频段** 而非 bin 索引分带：

| 频段 | Hz 范围 | 用途 |
|------|---------|------|
| sub | 38–74 | 超低频辅助 |
| kick/low | 52–165 | 鼓点主体 |
| body | 165–420 | 乐器 body |
| vocal | 420–2600 | 人声（用于 mask） |
| snap | 1800–9200 | 瞬态高频 |

**Onset 计算**

```
drumOnset = subRise×0.88 + subFlux×0.66 + lowRise×1.62 + lowFlux×1.34
musicalOnset = body/vocal/snap rise+flux 加权 + rmsFlux×0.20
onset = drumOnset + musicalOnset×(DJ?0.07:0.16)
score = (onset - floor) / (onsetPeak - floor)   // 0~1
```

**人声 Mask（防假鼓点）**

当 vocal 能量高且 lowDominance 不足时，`voiceMask=true`，拒绝 drumGate。

**Tempo 锁定**

- 命中后更新 `rtBeat.tempoGap`（0.42~0.88s 合理区间）
- `tempoConfidence` 随连续命中累积
- `tempoAssist`：在预期 beat 窗口内弱 onset 也可触发
- `rhythmAccept`：首拍需强 transient；有 tempo 锁时允许 1beat/2beat 容差

**输出结构**

```javascript
{ hit, time, strength, confidence, low, body, snap, mass, sharpness,
  tempoAssist, combo, lowDominance, dj }
```

`combo` 按 beatCount%4 循环：`downbeat → push → drop → rebound`，强拍可升为 `accent`。

**与离线 map 的关系**

- beatmap 未就绪（前 18 秒或分析中）：实时引擎 `preview` 模式补位镜头
- beatmap 就绪且 `realtimeHasLock`：tickBeatMap **让位** 给离线调度，避免双重触发
- `gridTimingLocked`（music-tempo 网格）：即使无实时锁也强制走 map

#### 6.2.3 离线 Beatmap 生成

切歌后异步分析整轨 AudioBuffer（Web Worker + 本地算法），结果缓存于 `beatMapCache[songId]`。

**分析流水线**

1. 10ms 帧能量：low / body / vocal / snap 四轨 + onset 曲线
2. 候选峰检测 → 打分 `score`，归一化得 `strength / confidence`
3. 强鼓点时间序列 → 中位 gap → `gridStep`
4. 可选 **网格补点**（ghost beat）：对齐 grid 但本地无峰时，按频段合成弱 beat
5. **music-tempo Worker** 并行算 BPM/beat 时间轴
6. 相位校正 `estimateTempoPhaseOffset` 对齐本地峰
7. 合成 `cameraBeats`（镜头用）与 `pulseBeats`（纯视觉脉冲用）

**Beat 对象字段**

| 字段 | 含义 |
|------|------|
| time | 秒 |
| strength / confidence | 0~1 |
| primary | 是否主鼓点（稀疏镜头只取 primary） |
| camera | 是否触发 scheduleBeatCamera |
| pulse | 是否触发 triggerScheduledBeat |
| impact | 视觉冲击度（镜头 amplitude 加权） |
| low / body / snap | 频段 tone 占比 |
| mass / sharpness | 镜头 deep/snap 模式选择 |
| combo | downbeat/push/drop/rebound/accent |
| tone | deep / body / snap / mixed / grid |
| ghost | 网格补点标记 |

**tempoSource**

- `music-tempo`：≥4 个 tempo beat 时，cameraBeats 以 tempo 网格为准，`gridTimingLocked=true`
- `local`：仅本地 onset 网格

分析完成后调用 `applyCinemaProfileFromBeatMap()` 更新 `cinemaTrackProfile.scale`（曲目动态强度）。

#### 6.2.4 播放时调度 — tickBeatMap

每帧（有 currentBeatMap 且非 DJ 模式）：

```javascript
t = audio.currentTime
lookahead = 0.075s

// 镜头事件
while beatCam.nextIdx < cameraBeats.length:
  if beat.time > t + lookahead: break
  if gridTimingLocked || !realtimeHasLock:
    scheduleBeatCamera(beat, 'map')
  nextIdx++

// 视觉脉冲（不移动镜头，只抬 uBeat）
while pulseBeats[idx].time <= t:
  if gridTimingLocked || !realtimeHasLock:
    triggerScheduledBeat(pulse)
  idx++
```

`realtimeHasLock = (t - rtBeat.lastHitAt) < max(0.50, tempoGap×1.18)`

**seek / 跳播**：`|Δt| > 0.55s` 时 `syncBeatCameraToTime(t)` 重对齐 `beatCam.nextIdx` 与 `beatMapNextIdx`，清空在途 events。

#### 6.2.5 scheduleBeatCamera — 事件入队

前置过滤（`fx.cinema` 关闭则直接 return）：

| 来源 | 过滤条件 |
|------|----------|
| map | 非 primary 跳过；impact<0.18 且 strength<0.56 跳过 |
| map | confidence<0.30 且 strength<0.68 跳过 |
| live | 曲目 scale 低时提高 strength 门槛 |
| live | 距上次 live 触发 < realtimeMinInterval 且 strength 不足 → 丢弃或 merge |

**Tone 模式**（决定 amplitude 曲线）

- `deep`：low 主导 → 大 zoomAmp、小 phiAmp
- `body`：中频主导 → phi 摆动加大
- `snap`：高频瞬态 → roll 加大、attack 更短

**Combo 修饰**（以 DJ 模式为例）

| combo | amp | zoom | phi | 语义 |
|-------|-----|------|-----|------|
| downbeat | ×1.12 | ×1.28 | ×0.76 | 强拍下沉 |
| push | ×0.76 | ×0.62 | — | 推进 |
| drop | ×0.82 | ×0.50 | ×1.38 | 下沉反弹 |
| rebound | ×0.62 | ×0.40 | ×0.70 | 回弹 |
| accent | ×0.78~0.94 | 变化 | roll×1.58 | 重音 |

**来源 amplitude 缩放**

- map：`× (0.68 + impact×0.46)`
- live：`× 0.92`（preview 时 ×0.78）
- fallback：`× 0.74`

**实时 merge**：live beat 若与已有 event 相距 < `realtimeMergeWindow`(0.135s)，合并 amplitude 而非新建；否则删除尚未触发的 map 预排 event。

**入队 event 结构**

```
{ start, hit, amp, attack, hold, release,
  zoomAmp, thetaAmp, phiAmp, rollAmp,
  mode, combo, phase, low, body, snap, mass, source, dj }
```

队列上限 8（DJ 12），超出则 splice 旧事件。

#### 6.2.6 updateBeatCamera — 事件消费

对每个 event 按播放时间计算包络：

```
local = t - ev.start
val = attack 段: ease(smoothstep 曲线)
    | hold 段: 1
    | release 段: 1 - ease(r)
    | 否则: 移除 event
```

取 `leadEvent`（最大 evPunch）映射到 kick 分量：

| combo | radiusKick | phiKick |
|-------|------------|---------|
| downbeat | punch × zoomAmp | -punch × 0.0032 |
| push | ×0.72 | 较小 |
| drop | ×0.46 | +punch × phiAmp × 0.92 |
| rebound | ×0.30 | 反向 phi |
| accent | ×0.90 | +rollKick |

最终经 smooth 追值写入 `beatCam.punch / thetaKick / phiKick / radiusKick / rollKick`，在 `updateCamera()` 中：

- FOV -= punch × cinemaShake
- rotation.z += rollKick × cinemaShake
- 自由镜头下 pitch/yaw 同样叠加 kick

#### 6.2.7 triggerScheduledBeat — 纯视觉脉冲

不进入 beatCam 队列，直接抬高：

```
scheduledBeatPulse = max(old, (0.14 + strength×0.46 + impact×0.18 + comboLift) × dynScale)
scheduledBeatFlag = true
```

主循环合并：`beatPulse = max(beatPulse, scheduledBeatPulse)`，再写入 `uBeat`。用于 grid 上弱拍仍要有粒子反馈但镜头不动。

#### 6.2.8 DJ / 播客模式

`djMode.active` 时：

- 禁用普通 `tickBeatMap`，改用 `currentDjBeatMap` + `tickPodcastDjBeatMap`
- 实时引擎阈值整体放宽，drumOnset 权重更高
- `scheduleBeatCamera` 的 attack/hold/release 更短促
- section 能量 `djMode.sectionEnergy/Low/Change` 调制 offline map 的 amplitude

### 6.3 歌词阳光 (Lyric Sun)

独立于单点鼓点，跟踪持续能量 + 人声 + 中高频，经 gate/hold 平滑得到 `lyricSunEnergy`，用于 3D 歌词 solar bloom。

---

## 7. 3D 歌单架

### 7.1 模式

| 模式 | 说明 |
|------|------|
| off | 关闭，group 不挂载 |
| side | 右侧 PSP 式纵向滚动，默认模式 |
| stage | 底部弧形舞台排列，带连接粒子与地板倒影 |

### 7.2 数据结构

管理器维护：

- `allItems[]`：完整歌单/播客/队列项
- `cards[]`：当前可见窗口内的卡片实例
- `centerIdx / centerTarget / centerSmooth`：PSP 滚动中心
- `shelfPane`：mine | fav（我的歌单 / 收藏，可合并）
- `shelfVisibility`：自动隐藏透明度 0~1

卡片对象：`{ canvas, ctx, texture, mesh, item, index, floatMix, fxPulse, dofBlur }`

### 7.3 卡片渲染管线

1. 离屏 Canvas 720×360，2D 绘制玻璃质感 UI（圆角、渐变、封面、标题、BPM 条）
2. `THREE.CanvasTexture` 贴到 `PlaneGeometry(2.05, 1.025)`
3. `MeshBasicMaterial`，transparent，depthWrite/depthTest 关闭
4. `drawCard()` 按需重绘，`texture.needsUpdate = true`
5. 景深：`abs(delta) > 0.45` 时叠加暗角模糊 overlay

### 7.4 侧栏布局 (placeCard)

以 `centerSmooth` 为基准计算每张卡的 delta：

- **位置**：X 随距离递增形成斜切深度；Y 按 delta 堆叠；Z 递减形成前后层次
- **缩放**：中心卡 1.12×，远端最低 0.55×
- **旋转**：sideRotY 整体面向 + delta 微调 sideRotX
- **浮起**：选中时 `floatMix` 0→1，卡片前移/上移/放大，renderOrder 提升
- **常驻模式**：默认 renderOrder 较低（歌词后方），仅 hover/选中才浮到前景
- **自动隐藏**：opacity × shelfVisibility，右侧热区触发渐显

特殊预设：

- **星河**：卡片更大、旋转更平，镜头走 wallpaper safe pose
- **安魂**：卡片 quaternion 跟随相机，保持可读

### 7.5 交互

| 操作 | 行为 |
|------|------|
| 滚轮 | 切换 centerIdx；到底可切 pane 或合并列表 |
| 点击中心卡 | 打开详情 / 直接播放队列 |
| 点击侧卡 | 滚到该卡 |
| Raycaster | 优先 3D 拾取；fallback 屏幕坐标 pick |
| ESC | 关闭详情 |

热区：右侧 strip（click / preview / wheel 宽度可配），自动隐藏时未 ready 不接管输入。

### 7.6 可见性策略 (shelfPresence)

- **auto**：默认隐藏，鼠标进入热区渐显
- **always**：常驻实卡，仍保持层级规则

### 7.7 舞台模式附加

- `connectorParticles`：卡片间 80 点穿梭粒子（自定义 Shader）
- `floorMirror`：地板反射 mesh
- 水平 stageXStep 展开，中心卡呼吸缩放

---

## 8. 歌单详情 (二级 PSP 列表)

打开某张歌单卡后，`contentList` 管理器接管：

- **面板**：Canvas 900×1024 → Plane 2.62×3.02，显示标题、曲数、封面、扫光条
- **歌曲行**：Canvas 800×104 → Plane 2.50×0.36，PSP 纵向滚动
- 可见半径 5，最多 11 行，同步窗口增量渲染
- 点击行：整单导入队列并从该行起播，随后关闭详情
- 关闭动画：GSAP 缩放/淡出 group

详情布局参数随竖屏/窄屏/安魂预设自适应 (`detailLayout`)。

---

## 9. 3D 舞台歌词

### 9.1 组成

每条歌词为一个 Group，含：

- 文字 Mesh（Canvas 纹理 + 自定义 text Shader：uOpacity、uSolar）
- readability 半透明底
- glow 辉光层
- sun 太阳溢光
- sparks 火花粒子

### 9.2 定位模式

| 模式 | 条件 | 行为 |
|------|------|------|
| 封面跟随 | 默认 | 位置/旋转绑定封面粒子 group 世界矩阵 |
| 相机锁定 | lyricCameraLock | 固定在相机前方 lockDistance，面向相机 |
| 骷髅口型 | 安魂预设 | 锚定 skullLyricMouthLocal 世界坐标，quaternion 对齐骷髅 |

布局参数：`lyricScale / lyricOffsetX/Y/Z / lyricTiltX/Y`，均可 DIY 控制台调节。

### 9.3 与歌单架共存

详情页打开时：

- `renderOrder` 降低，opacity 降至约 0.38（普通）/ 0.30（安魂）
- bloom/glow 单独削弱，退场词乘 outgoing 系数
- 歌词偏移/缩放避让详情面板中心

### 9.4 辉光与节拍

- `lyricGlowStrength` 控制 glow/sun/sparks 强度
- `lyricGlowBeat` 开启时，beatCam kick 驱动 glowFollowX/Y/Roll
- `highBloom` 平滑跟踪 solarBloom，副歌段 SUN 溢光更明显

---

## 10. 安魂预设 — 骷髅粒子层

预设索引 6，独立于封面粒子：

### 10.1 资产

- 预烘焙二进制点云：`Float32Array`，每点 5  float (x,y,z,kind,seed)
- 运行时 fetch 加载，失败则标记 failed

### 10.2 渲染

- `THREE.Points` + 专用 ShaderMaterial
- Uniform：uColorA/B、uShadow、uLight、uBass、uBeat、uTime 等
- 颜色随封面调色板 / visualTint 混合 bone 色系

### 10.3 动画

- `skullJawOpen`：下颌开合（歌词/节拍驱动）
- `skullBeatFlash`：强拍闪白
- `skullAmpPulse`：整体 scale 脉冲
- `skullWheelZoom`：滚轮缩放构图
- `skullCameraBlend`：镜头在 base / shelf 构图间混合

### 10.4 镜头

独立 `setSkullCameraTargetVectors` 计算 position/lookAt，竖屏与歌单架共存时使用 shelf 安全构图。自由镜头回正时读取骷髅默认 pose。

---

## 11. 拾取与输入总线

### 11.1 Raycaster

NDC 坐标：`mx = (clientX/width)*2-1`, `my = -(clientY/height)*2+1`

用于：歌单卡 hit、粒子指针（可选）、双击回正判定。

### 11.2 指针视差

`pointerParallax` 平滑跟踪鼠标，影响歌单卡 micro-offset 与部分 UI。

### 11.3 焦点区与输入优先级

`isPointerOverUi` 为 true 时不接管 Canvas 拖拽。歌单自动隐藏时 `shelfAutoHiddenInputReady()` 门槛控制 focus/hover/wheel 是否生效。

---

## 12. 可配置参数 (fx 对象)

与 3D 直接相关的主要字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| preset | 0–6 | 视觉预设 |
| intensity / depth / point / speed / twist / color / scatter | number | 粒子形态与律动 |
| coverResolution | enum | 粒子网格密度 |
| bloom / bloomStrength | bool/number | 辉光层 |
| edge / aiDepth | bool | 边缘/AI 深度 |
| floatLayer / backCover | bool | 附加粒子层 |
| cinema / cinemaShake | bool/number | 电影模式/镜头抖动 |
| particleLyrics | bool | 3D 歌词开关 |
| lyricScale/Offset/Tilt/CameraLock/Glow* | number/bool | 歌词布局与辉光 |
| shelf | off/side/stage | 歌单架模式 |
| shelfCameraMode | dynamic/static | 动态/静态镜头 |
| shelfPresence | auto/always | 自动隐藏/常驻 |
| shelfSize/Offset/Angle/Opacity/BgOpacity/AccentColor | number/color | 架体布局与主题 |
| shelfShowPodcasts / shelfMergeCollections | bool | 内容组织 |
| performanceQuality / performanceBackground | enum | 渲染质量与后台策略 |
| visualTintMode / visualTintColor | enum/color | 粒子/骷髅染色 |

参数持久化到 localStorage，视觉控制台与 DIY 存档可导入导出。

---

## 13. 生命周期与资源管理

### 13.1 创建

- 场景初始化时建立粒子、bloom、相机、渲染器
- 歌单架 `rebuild()` 时创建 group，按需 async 建卡
- 预设切换：`uBurstAmt` 脉冲 + 可能重建几何/浮层/骷髅

### 13.2 销毁

- `disposeRenderedCards()`：dispose geometry/material/texture
- 详情关闭：GSAP 动画结束后 dispose panel/rows
- 分辨率变更：`oldGeo.dispose()` 后重建 BufferGeometry

### 13.3 内存控制

- 歌单封面 LRU 缓存
- 运行时 `maybeTrimRuntimeCaches` 定期清理
- 深后台降低 DPR 与帧率

---

## 14. 架构小结

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Renderer                       │
├─────────────────────────────────────────────────────────┤
│  HTML/CSS UI          │  WebGL Canvas (Three.js)        │
│  搜索/控制/控制台      │  ┌─────────────────────────┐  │
│                       │  │ 相机 ← 轨道/焦点/自由/节拍 │  │
│                       │  ├─────────────────────────┤  │
│                       │  │ 封面粒子 (7 preset shader) │  │
│                       │  │  + Bloom + 可选浮层/背面   │  │
│                       │  ├─────────────────────────┤  │
│                       │  │ 安魂骷髅层 (preset 6)      │  │
│                       │  ├─────────────────────────┤  │
│                       │  │ 3D 歌词 (Canvas→Mesh)     │  │
│                       │  ├─────────────────────────┤  │
│                       │  │ 3D 歌单架 + 详情 PSP 列表  │  │
│                       │  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Web Audio → Analyser → bass/mid/treble/beat → Uniform  │
└─────────────────────────────────────────────────────────┘
```

**关键技术选型**：WebGL 粒子 + Canvas 纹理 UI 的混合架构，在单场景内用 renderOrder 与透明度策略解决层级冲突，用增量渲染与像素预算保障 Electron 桌面端长期稳定运行。

---

*文档版本：v1.1.0 代码基线 · 2026-06-28（含 GLSL 预设详解 / Beatmap 调度详解）*
