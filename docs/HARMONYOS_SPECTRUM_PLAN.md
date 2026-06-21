# 鸿蒙手机 · 系统音乐频谱可视化 — 从零开发方案

> **文档类型**：新项目搭建指导（开发者 / Agent 跨会话接力用）  
> **创建日期**：2026-06-15  
> **状态**：方案设计阶段，待立项  
> **关联产品**：WaveDance（macOS 桌面版）同理念，**独立仓库、独立实现**  
> **目标平台**：HarmonyOS NEXT 手机（API 12+，建议 API 18 SDK 开发）

---

## 1. 目标与范围

### 1.1 产品目标

在鸿蒙手机上实现：**接收系统正在播放的音乐声音，实时绘制频谱**。

用户典型场景：

1. 打开 QQ 音乐 / 网易云 / 系统音乐等第三方 App 播放歌曲  
2. 打开本 App，授权后开始可视化  
3. 屏幕展示实时频谱（柱状图 / 折线图）  
4. 点击停止后结束采集

### 1.2 MVP 范围内

| 功能 | 说明 |
|------|------|
| 系统内录 | 通过 `AVScreenCapture` 捕获第三方 App 播放音频（PCM） |
| 频谱分析 | FFT 分桶，输出 32 / 64 可配置桶 |
| 频谱渲染 | Canvas 2D：柱状图 + 折线图（二选一或 Tab 切换） |
| 基础控制 | 开始 / 停止、分桶数、配色 |
| 权限引导 | 录屏/内录权限申请与说明页 |

### 1.3 MVP 范围外（后续迭代）

- Three.js / WebGL 高阶特效  
- Tauri / Rust 跨平台壳  
- ESP32 外接屏  
- 歌词 / Now Playing / 媒体会话集成  
- 透明悬浮窗覆盖其他 App（手机审核与权限复杂，首版不做）  
- 后台锁屏持续采集（首版仅前台稳定运行）  
- AppGallery 正式上架（Phase 3 再考虑）

### 1.4 与 WaveDance macOS 的关系

| 维度 | WaveDance macOS | 本项目（建议名：`WaveDance OH` 或 `SpectrumOH`） |
|------|-----------------|--------------------------------------------------|
| 音频来源 | BlackHole + cpal | AVScreenCapture 内录 |
| 技术栈 | Tauri + Rust + Web | ArkTS + ArkUI + Canvas |
| 代码复用 | 无直接复用 | **算法思路**可借鉴（FFT 分桶、归一化），需 ArkTS/C++ 重写 |
| 仓库 | `WaveDance` | **建议新建独立 Git 仓库** |

---

## 2. 技术选型

### 2.1 推荐栈

| 层级 | 选型 | 理由 |
|------|------|------|
| 语言 / UI | **ArkTS + ArkUI** | 官方主推，权限与窗口 API 最完整 |
| 音频采集 | **AVScreenCapture**（MediaKit） | API 12+ 唯一稳定的第三方 App 内录路径 |
| 频谱计算 | **TaskPool Worker + 纯 TS FFT** | 首版足够；性能不够再迁 C++ NAPI |
| 渲染 | **Canvas 2D** | 柱状/折线足够，无需 Three.js |
| 构建 | **DevEco Studio 5.x+** | HAP 打包、签名、真机调试 |
| 目标 SDK | **API 18+**（兼容 API 12 运行时） | USB 串口等后续扩展需更高 API；内录 API 12 已可用 |

### 2.2 不采用的方案

| 方案 | 不采用原因 |
|------|-----------|
| Tauri OpenHarmony 分支 | 手机场景过重，窗口/内录仍需原生 API |
| AudioCapturer + 麦克风 | 无法抓系统播放，只能录环境声 |
| PLAYBACK_CAPTURE 内录 | API 12 已废弃，会静音 |
| Web 组件 + 外部 JS 库 | ArkWeb 可用但增加复杂度，Canvas 原生更简单 |

---

## 3. 系统架构

### 3.1 总体数据流

```
┌─────────────────────────────────────────────────────────────┐
│  第三方音乐 App（QQ音乐 / 网易云 / 系统音乐 …）              │
└───────────────────────────┬─────────────────────────────────┘
                            │ 系统音频混音输出
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AVScreenCapture（audioSource = INTERNAL / OH_ALL_PLAYBACK） │
│  → audioBufferAvailable 回调 PCM (S16LE / F32)              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AudioRingBuffer（主线程写入，Worker 读取）                  │
│  环形缓冲，容量约 2~4 帧 FFT 窗口                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SpectrumWorker（TaskPool）                                  │
│  加窗 → FFT → 幅值 → 对数分桶 → 归一化 points[]              │
└───────────────────────────┬─────────────────────────────────┘
                            │ 每帧 SpectrumFrame
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  UI 主线程（@State spectrumPoints）                          │
│  Canvas.onDraw → 柱状图 / 折线图                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 模块划分

```
entry/
├── entryability/EntryAbility.ets          # 应用入口
├── pages/
│   ├── Index.ets                          # 主界面（频谱 + 控制）
│   └── PermissionGuide.ets                # 权限说明（可选独立页）
├── services/
│   ├── ScreenCaptureService.ets           # AVScreenCapture 生命周期
│   ├── AudioBufferQueue.ets               # PCM 环形缓冲
│   └── SpectrumPipeline.ets               # Worker 调度与帧合并
├── workers/
│   └── SpectrumWorker.ets                 # FFT + 分桶（TaskPool）
├── dsp/
│   ├── FftRadix2.ets                        # 纯 TS FFT（首版）
│   ├── WindowFunctions.ets                # Hann / Hamming 窗
│   └── BucketMapper.ets                   # 线性 / 对数分桶
├── render/
│   ├── SpectrumBarRenderer.ets            # 柱状图绘制逻辑
│   └── SpectrumLineRenderer.ets           # 折线图绘制逻辑
├── model/
│   ├── SpectrumFrame.ets                  # 数据结构
│   └── AppSettings.ets                    # 分桶数、样式、Persist 持久化
└── common/
    ├── Constants.ets
    └── Logger.ets
```

### 3.3 核心数据结构

```typescript
// model/SpectrumFrame.ets
export interface SpectrumFrame {
  /** 时间戳 ms */
  timestamp: number;
  /** 全局峰值 0~1 */
  peak: number;
  /** 全局 RMS 0~1 */
  rms: number;
  /** 频谱桶，长度 = bucketCount，索引 0 = 低频 */
  points: number[];
}

export interface CaptureConfig {
  sampleRate: number;      // 44100 或 48000，与 AVScreenCapture 一致
  channels: number;        // 2
  fftSize: number;         // 2048（2 的幂）
  bucketCount: number;     // 32 | 64 | 128
  bucketMode: 'linear' | 'log';
  refreshFps: number;      // 30，UI 刷新上限
}
```

---

## 4. 音频采集方案（关键）

### 4.1 为什么必须用 AVScreenCapture

自 **API 12** 起，AudioKit 的 `PLAYBACK_CAPTURE` 内录已废弃，继续调用会得到**静音数据**。  
捕获第三方 App 播放音频，必须走 MediaKit 的 [AVScreenCapture](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/using-avscreencapture-arkts)。

### 4.2 配置要点

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `audioSource` | `AUDIO_SOURCE_INTERNAL` | 内部播放音频（系统混音） |
| `audioSampleRate` | `44100` | 与 FFT 配置一致 |
| `audioChannels` | `STEREO` | 双声道，FFT 前转 mono |
| 视频宽高 | `0 × 0` 或最小尺寸 | 只要音频；底层仍走录屏管线，功耗略高 |
| 麦克风 | **关闭** | 避免混入环境噪声 |

C/C++ 层等价：`OH_ALL_PLAYBACK`（见 OpenHarmony AVScreenCapture 文档）。

### 4.3 PCM 处理流程

1. 在 `audioBufferAvailable`（或 C API `AcquireAudioBuffer`）收到 buffer  
2. 若为 S16LE：转 `Float32Array`，范围 [-1, 1]  
3. 双声道 → mono：`L/R` 平均或只取左声道  
4. 写入 `AudioRingBuffer`  
5. Worker 每次取 `fftSize`（2048）样本做 FFT  

### 4.4 与 WaveDance 算法对齐（可选）

WaveDance 桌面端（`src/audio_processing/mod.rs`）使用：

- FFT 2048  
- 对数/线性分桶  
- `peak` / `rms` 归一化  
- 索引 0 = 低频  

首版可直接照搬语义，便于日后统一 ESP32 协议或跨端体验。

---

## 5. 频谱计算方案

### 5.1 FFT

鸿蒙 **无内置 FFT API**，首版在 Worker 中实现 Radix-2 Cooley-Tukey（`fftSize = 2048`）。

性能预估（手机 mid-range）：

- 2048 点 FFT @ 30fps：纯 TS 通常可接受  
- 若掉帧：迁 C++ NAPI，或降 `refreshFps` 到 24  

### 5.2 分桶

```typescript
// 伪代码
function computeSpectrum(pcm: Float32Array, config: CaptureConfig): SpectrumFrame {
  const windowed = applyHannWindow(pcm);           // 长度 fftSize
  const spectrum = fftMagnitude(windowed);         // 长度 fftSize/2
  const buckets = mapToBuckets(spectrum, config); // 长度 bucketCount
  const normalized = normalizeBuckets(buckets);    // 0~1
  return {
    timestamp: Date.now(),
    peak: Math.max(...normalized),
    rms: computeRms(pcm),
    points: normalized,
  };
}
```

### 5.3 线程模型

| 线程 | 职责 |
|------|------|
| 主线程 | UI、Canvas 绘制、接收 Worker 结果 |
| AVScreenCapture 回调线程 | 仅写 ring buffer，不做 FFT |
| TaskPool Worker | FFT + 分桶 |

**禁止**在 `audioBufferAvailable` 内直接做 FFT 或 Canvas 绘制。

---

## 6. UI / 渲染方案

### 6.1 主界面布局

```
┌──────────────────────────────────────┐
│  [状态] 正在可视化 / 已停止           │
├──────────────────────────────────────┤
│                                      │
│         Canvas 频谱区域               │
│         （柱状或折线）                 │
│                                      │
├──────────────────────────────────────┤
│  分桶: [32] [64] [128]               │
│  样式: [柱状] [折线]                  │
│  ┌──────────┐  ┌──────────┐          │
│  │   开始    │  │   停止    │          │
│  └──────────┘  └──────────┘          │
└──────────────────────────────────────┘
```

### 6.2 Canvas 绘制要点

- 使用 `CanvasRenderingContext2D`  
- 刷新：`requestAnimationFrame` 或定时器 **33ms（≈30fps）**  
- 柱状图：`fillRect(x, height - barH, barW, barH)`  
- 折线图：`moveTo` / `lineTo` + `stroke`  
- 颜色：首版 1 套主题色即可（如渐变蓝紫）  

参考社区实践：[Canvas 实时波形](https://ost.51cto.com/posts/39825)、[频谱绘制](https://bbs.itying.com/topic/684c3c214715aa008847be4f)。

### 6.3 刷新节流

Worker 可能 40~60 次/秒产出，UI 层节流：

```typescript
// 仅当距上次绘制 > 33ms 时更新 @State
if (now - lastDrawMs >= 33) {
  this.spectrumPoints = frame.points;
  lastDrawMs = now;
}
```

---

## 7. 权限与合规

### 7.1 module.json5 声明

```json5
{
  "module": {
    "requestPermissions": [
      {
        "name": "ohos.permission.CAPTURE_SCREEN",
        "reason": "$string:capture_screen_reason",
        "usedScene": {
          "abilities": ["EntryAbility"],
          "when": "inuse"
        }
      },
      {
        "name": "ohos.permission.MICROPHONE",
        "reason": "$string:microphone_reason",
        "usedScene": {
          "abilities": ["EntryAbility"],
          "when": "inuse"
        }
      }
    ],
    "abilities": [
      {
        "name": "EntryAbility",
        "backgroundModes": []
      }
    ]
  }
}
```

> **说明**：即使只录内部音频，系统仍可能要求 `MICROPHONE`；以真机申请结果为准。  
> 首版 **不声明** `KEEP_BACKGROUND_RUNNING`，避免审核与生命周期复杂度。

### 7.2 字符串资源（示例）

```json
{
  "capture_screen_reason": "需要捕获系统播放音频以生成实时频谱可视化",
  "microphone_reason": "系统音频采集链路需要此权限标识"
}
```

### 7.3 用户引导文案（必做）

首次点击「开始」前，弹窗说明：

1. 本功能需要**屏幕/音频捕获**权限  
2. 系统会显示**录制提示**（状态栏/系统 UI），属正常隐私保护  
3. 仅用于频谱展示，**不上传、不存储**音频（若确实不存储，需在隐私政策中写明）  
4. DRM 保护内容可能无法可视化  

### 7.4 系统约束（产品必须接受）

| 约束 | 影响 |
|------|------|
| 录屏隐私弹窗 | 手机无法像 macOS 那样「无感内录」 |
| DRM 内容 | 部分歌曲可能静音或无数据 |
| 前台优先 | 切后台 / 锁屏后采集可能暂停（首版不保证后台） |
| 功耗 | AVScreenCapture 即使用户不看画面也有额外开销 |

---

## 8. 生命周期与状态机

### 8.1 状态机

```
        ┌─────────┐
        │  IDLE   │  初始 / 停止后
        └────┬────┘
             │ 用户点击「开始」
             ▼
        ┌─────────┐
        │REQUESTING│  申请 CAPTURE_SCREEN 等权限
        └────┬────┘
             │ 授权成功
             ▼
        ┌─────────┐
        │ CAPTURING│  AVScreenCapture.start + Worker 运行
        └────┬────┘
             │ 用户点击「停止」/ onDestroy / 权限被收回
             ▼
        ┌─────────┐
        │ STOPPING │  release capture + 停 Worker
        └────┬────┘
             ▼
        ┌─────────┐
        │  IDLE   │
        └─────────┘
```

### 8.2 资源释放（必做）

在以下时机 **必须** 调用 `stop` + `release`：

- 用户点击停止  
- `aboutToDisappear` / `onDestroy`  
- 权限被系统收回  
- App 进入后台（首版策略：自动停止采集，避免 `ILLEGAL_AUDIO_CAPTURER_BY_SUSPEND`）

---

## 9. 开发环境与工程创建

### 9.1 环境清单

| 工具 | 版本建议 |
|------|----------|
| DevEco Studio | 5.0.5+ |
| HarmonyOS SDK | API 18 Public SDK（min API 12） |
| 真机 | HarmonyOS NEXT 手机（API 12+） |
| 华为开发者账号 | 调试签名用（Phase 2 上架必需） |

### 9.2 新建工程步骤

1. DevEco Studio → **Create Project**  
2. 模板：**Empty Ability**  
3. 语言：**ArkTS**  
4. 包名建议：`com.wavedance.spectrum`（或与新产品名一致）  
5. `compileSdkVersion`：18；`compatibleSdkVersion`：12  
6. 按 §3.2 创建目录结构  

### 9.3 建议 Git 仓库结构

```
spectrum-oh/                    # 新仓库根目录
├── AppScope/
├── entry/
├── docs/
│   └── DEVLOG.md               # 开发日志
├── README.md
└── oh-package.json5
```

与 `WaveDance` 主仓库 **分离**，本方案文档可复制到新仓库 `docs/PLAN.md`。

---

## 10. 分阶段实施计划

### Phase 0 — 可行性验证（3~5 天）

**目标**：证明「第三方音乐 → PCM 非零 → Canvas 有反应」

| 步骤 | 验收标准 |
|------|----------|
| 创建空工程 | 真机可安装运行 |
| 集成 AVScreenCapture | 播放 QQ 音乐时 callback 收到 buffer |
| 打印 RMS | 日志中 RMS > 0.01（非静音） |
| Canvas 画静态柱 | 用随机数验证绘制链路 |
| RMS 驱动单柱高度 | 音量变化时柱高变化 |

**Phase 0 不做 FFT**，降低变量。

### Phase 1 — MVP 核心（1~2 周）

| 步骤 | 验收标准 |
|------|----------|
| Worker + FFT | 2048 点 FFT 稳定 30fps |
| 分桶 32/64 | 切换后频谱形状合理 |
| 柱状 + 折线 | 两种样式可切换 |
| 开始/停止 | 无泄漏，重复启动正常 |
| 权限引导页 | 拒绝权限时有明确提示 |

### Phase 2 — 体验打磨（1 周）

| 步骤 | 验收标准 |
|------|----------|
| 设置持久化 | Preferences 保存分桶/样式 |
| 峰值保持线（可选） | 柱状图顶部的 decay 线 |
| 多音乐 App 测试 | 至少 3 款 App 可用 |
| 异常处理 | DRM / 无权限 / 采集中断有 UI 提示 |
| 性能 | 连续 10 分钟无明显发热掉帧 |

### Phase 3 — 发布准备（可选，1~2 周）

| 步骤 | 说明 |
|------|------|
| 隐私政策页 | 说明不存储音频 |
| 应用图标 / 截图 | AppGallery 素材 |
| 签名与 HAP 打包 | Release 证书 |
| AppGallery Connect 上架 | 审核录屏权限用途 |

---

## 11. 测试计划

### 11.1 功能测试

| 用例 | 步骤 | 期望 |
|------|------|------|
| T1 内录基础 | 网易云播放 → 本 App 开始 | 频谱随音乐跳动 |
| T2 停止释放 | 点击停止 | 系统录制指示消失，CPU 下降 |
| T3 权限拒绝 | 拒绝 CAPTURE_SCREEN | 提示用户，不崩溃 |
| T4 无声场景 | 系统静音 | 频谱接近零线 |
| T5 切后台 | 开始后按 Home | 首版：自动停止或频谱冻结（需统一策略） |
| T6 重复启动 | 开始→停止×10 | 无内存泄漏、无 duplicate capture |

### 11.2 兼容性测试

- 音乐 App：QQ 音乐、网易云、华为音乐（各测 1 首）  
- 音频类型：普通 MP3、在线流媒体  
- DRM：若有会员专属曲目，记录是否静音  

### 11.3 性能指标

| 指标 | 目标 |
|------|------|
| UI 帧率 | ≥ 24 fps |
| FFT 延迟 | < 50 ms |
| 内存增量 | 相对 idle < 80 MB |
| 10 分钟温升 | 可接受（主观 + 无降频） |

---

## 12. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 用户不接受录屏权限 | 高 | 转化低 | 清晰说明用途；考虑「仅本 App 播放时可视化」备选模式（AVPlayer） |
| DRM 静音 | 中 | 部分歌曲无效 | UI 提示；文档说明限制 |
| 后台采集被杀 | 高 | 无法后台听 | 首版只做前台；后续再评估长时任务 |
| TS FFT 性能不足 | 中 | 掉帧 | NAPI C++ FFT 或降帧率 |
| 审核质疑录屏权限 | 中 | 上架延迟 | 隐私政策 + 不存不传的代码审计 |

### 12.1 备选产品模式（降风险）

若内录权限转化率太低，可增加 **「本地播放器模式」**：

- App 内用 `AVPlayer` 播放用户选择的音频文件  
- 用 `AudioCapturer` 或播放器回调拿 PCM  
- **无需 CAPTURE_SCREEN**  
- 牺牲「配第三方 App 使用」，换取更低权限门槛  

可作为 v1.1 并行功能。

---

## 13. 关键代码骨架（参考）

> 以下为结构示意，非完整可编译代码；立项后按 DevEco 模板与官方 API 版本微调。

### 13.1 ScreenCaptureService

```typescript
import { media } from '@kit.MediaKit';

export class ScreenCaptureService {
  private capture: media.AVScreenCapture | null = null;

  async start(onPcm: (buffer: ArrayBuffer) => void): Promise<void> {
    const config: media.AVScreenCaptureConfig = {
      audioInfo: {
        audioSampleRate: media.AudioSampleRate.SAMPLE_RATE_44100,
        audioChannels: media.AudioChannel.CHANNEL_STEREO,
        audioSource: media.AudioSourceType.AUDIO_SOURCE_TYPE_INTERNAL,
      },
      videoInfo: {
        videoFrameWidth: 0,
        videoFrameHeight: 0,
      },
    };
    this.capture = await media.createAVScreenCapture(config);
    this.capture.on('audioBufferAvailable', (buf: ArrayBuffer) => {
      onPcm(buf);
    });
    await this.capture.prepare();
    await this.capture.start();
  }

  async stop(): Promise<void> {
    await this.capture?.stop();
    await this.capture?.release();
    this.capture = null;
  }
}
```

> **注意**：具体枚举名、事件名以当前 SDK 的 `@kit.MediaKit` 声明为准；不同 API 版本可能有差异，以 [官方 AVScreenCapture 指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/using-avscreencapture-arkts) 为准。

### 13.2 Index 页面骨架

```typescript
@Entry
@Component
struct Index {
  @State spectrumPoints: number[] = [];
  @State isCapturing: boolean = false;
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private canvasCtx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private pipeline: SpectrumPipeline = new SpectrumPipeline();

  build() {
    Column() {
      Canvas(this.canvasCtx)
        .width('100%')
        .height('60%')
        .onReady(() => this.startDrawLoop());

      Row() {
        Button(this.isCapturing ? '停止' : '开始')
          .onClick(() => this.toggleCapture());
      }
    }
  }

  private async toggleCapture(): Promise<void> {
    if (this.isCapturing) {
      await this.pipeline.stop();
      this.isCapturing = false;
    } else {
      await this.pipeline.start((frame) => {
        this.spectrumPoints = frame.points;
      });
      this.isCapturing = true;
    }
  }

  private startDrawLoop(): void {
    const draw = () => {
      SpectrumBarRenderer.draw(this.canvasCtx, this.spectrumPoints);
      requestAnimationFrame(draw);
    };
    draw();
  }
}
```

---

## 14. 参考文档

| 主题 | 链接 |
|------|------|
| AVScreenCapture 使用指南 | https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/using-avscreencapture-arkts |
| AVScreenCapture API 参考 | https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-avscreencapture |
| 音频流类型（PLAYBACK_CAPTURE 废弃说明） | https://www.seaxiang.com/blog/yoEs9t |
| 媒体接口变更（API 12 内录迁移） | https://m.seaxiang.com/blog/uKtVcX |
| Canvas 实时波形实战 | https://ost.51cto.com/posts/39825 |
| 后台长时任务 | https://bbs.huaweicloud.com/blogs/449752 |
| Rust OpenHarmony 目标（后续 NAPI 扩展用） | https://doc.rust-lang.org/rustc/platform-support/openharmony.html |

---

## 15. 新项目启动 Checklist

立项当天按顺序勾选：

- [ ] 注册华为开发者账号，配置调试签名  
- [ ] 安装 DevEco Studio + API 18 SDK  
- [ ] 创建独立仓库 `spectrum-oh`（或自定名称）  
- [ ] 复制本方案至新仓库 `docs/PLAN.md`  
- [ ] 创建 Empty Ability 工程，包名确定  
- [ ] 添加 `CAPTURE_SCREEN` / `MICROPHONE` 权限与 reason 文案  
- [ ] 实现 Phase 0：AVScreenCapture + RMS 日志  
- [ ] 真机 + QQ 音乐验证 PCM 非零  
- [ ] 进入 Phase 1 MVP 开发  

---

## 16. 版本记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-06-15 | v1.0 | 初版：鸿蒙手机系统音乐频谱 MVP 从零方案 |

---

**下一步建议**：新开仓库后，先只做 Phase 0（3~5 天）。Phase 0 通过再提交 MVP 代码；避免一上来搭完整架构却卡在「内录拿不到数据」上。
