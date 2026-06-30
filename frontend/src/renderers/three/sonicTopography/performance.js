/** @typedef {"eco"|"normal"|"high"} SonicGridPreset */

/** eco / normal / high 三档 DPR 上限（见 SONIC_TOPOGRAPHY_DEV.md §17） */
const PRESET_DPR_CAP = {
  eco: 1.25,
  normal: 1.5,
  high: 1.25,
};

const LOW_FPS_THRESHOLD = 24;
const FPS_SAMPLE_WINDOW_S = 3;
const FPS_WARN_COOLDOWN_S = 45;

/**
 * @param {string} preset
 * @param {number} [gridSize]
 */
export function resolveSonicDprCap(preset, gridSize = 128) {
  const key = preset === "eco" || preset === "high" ? preset : "normal";
  let cap = PRESET_DPR_CAP[key] ?? PRESET_DPR_CAP.normal;
  if (gridSize >= 160 && cap > 1.25) cap = 1.25;
  return cap;
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {number | null} savedPixelRatio
 * @param {string} preset
 * @param {number} gridSize
 * @returns {number | null}
 */
export function applySonicDprCap(renderer, savedPixelRatio, preset, gridSize) {
  const cap = resolveSonicDprCap(preset, gridSize);
  const next = Math.min(window.devicePixelRatio || 1, cap);
  if (savedPixelRatio == null) {
    savedPixelRatio = renderer.getPixelRatio();
  }
  renderer.setPixelRatio(next);
  return savedPixelRatio;
}

/** @returns {{ tick: (dt: number, gridPreset: string) => void, reset: () => void }} */
export function createFpsMonitor() {
  let sampleAccum = 0;
  let sampleFrames = 0;
  let lastWarnAt = -999;
  let warned = false;

  function tick(dt, gridPreset) {
    if (gridPreset !== "high") {
      sampleAccum = 0;
      sampleFrames = 0;
      warned = false;
      return;
    }

    const safeDt = dt > 0 ? dt : 1 / 60;
    sampleAccum += safeDt;
    sampleFrames += 1;

    if (sampleAccum < FPS_SAMPLE_WINDOW_S) return;

    const fps = sampleFrames / sampleAccum;
    sampleAccum = 0;
    sampleFrames = 0;

    const now = performance.now() / 1000;
    if (fps < LOW_FPS_THRESHOLD) {
      if (!warned && now - lastWarnAt >= FPS_WARN_COOLDOWN_S) {
        warned = true;
        lastWarnAt = now;
        console.warn(
          `[WaveDance] 音域回响 2 高画质档帧率约 ${fps.toFixed(0)}fps，建议在设置中将渲染精度调为「标准」或「节能」`,
        );
      }
    } else if (fps >= LOW_FPS_THRESHOLD + 4) {
      warned = false;
    }
  }

  function reset() {
    sampleAccum = 0;
    sampleFrames = 0;
    warned = false;
  }

  return { tick, reset };
}
