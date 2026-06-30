/**
 * Mineradio 风格桌面歌词：鼓点 / 低频驱动的舞台震动与辉光。
 * 优先消费外部 beatMap；无 map 时由 waveform-frame 实时 onset 补位。
 */

/** @typedef {{ time: number, strength?: number, confidence?: number, impact?: number, primary?: boolean, low?: number, body?: number, snap?: number, mass?: number, sharpness?: number, combo?: string, dj?: boolean, step?: number }} BeatEvent */

/** @typedef {{ cameraBeats?: BeatEvent[], pulseBeats?: BeatEvent[], beats?: BeatEvent[], kicks?: BeatEvent[], partialUntilSec?: number }} BeatMapPayload */

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function beatEaseInOut(t) {
  t = clamp(t, 0, 1, 0);
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** @param {BeatEvent} ev */
function beatEventTime(ev) {
  return Number(ev?.time);
}

/** @param {BeatEvent[]} list */
function sortBeatEvents(list) {
  return [...list].sort((a, b) => beatEventTime(a) - beatEventTime(b));
}

/** @param {unknown} packed */
function normalizeBeatMapPayload(packed) {
  if (!packed || typeof packed !== "object") return null;
  const o = /** @type {BeatMapPayload} */ (packed);
  const camera = sortBeatEvents(o.cameraBeats || o.beats || o.kicks || []);
  const pulse = sortBeatEvents(
    o.pulseBeats?.length ? o.pulseBeats : camera.filter((b) => b.pulse !== false),
  );
  if (!camera.length && !pulse.length) return null;
  return {
    cameraBeats: camera,
    pulseBeats: pulse.length ? pulse : camera,
    partialUntilSec: o.partialUntilSec,
  };
}

/**
 * 从 LRC 行时间生成弱视觉脉冲（无离线 beatMap 时的补位）。
 * @param {{ timeMs: number, text: string }[]} lines
 * @returns {ReturnType<typeof normalizeBeatMapPayload>}
 */
export function buildBeatMapFromLyricLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  /** @type {BeatEvent[]} */
  const pulseBeats = [];
  for (const line of lines) {
    const t = Number(line?.timeMs);
    if (!Number.isFinite(t) || t < 0) continue;
    const text = String(line?.text ?? "").trim();
    if (!text) continue;
    pulseBeats.push({
      time: t / 1000,
      strength: 0.42,
      confidence: 0.55,
      impact: 0.38,
      primary: false,
      low: 0.48,
      body: 0.22,
      combo: "accent",
      pulse: true,
    });
  }
  if (!pulseBeats.length) return null;
  return normalizeBeatMapPayload({ pulseBeats, cameraBeats: [] });
}

export function createMineradioBeatMotion() {
  /** @type {ReturnType<typeof normalizeBeatMapPayload>} */
  let beatMap = null;
  let beatMapKey = "";

  let cameraIdx = 0;
  let pulseIdx = 0;
  let prevMapTime = -1;
  /** @type {Array<{ start: number, hit: number, amp: number, attack: number, hold: number, release: number, low: number, body: number }>} */
  let cameraEvents = [];
  let lastCameraTriggerAt = -1;

  let pulseDrive = 0;
  let glowDrive = 0;
  let bassDrive = 0;

  let smoothBass = 0;
  let beatPulse = 0;
  let lastPeak = 0;
  let lastRms = 0;

  const live = { solar: 0, beat: 0, bass: 0, scale: 1, lift: 0 };

  let cinemaEnabled = true;
  let glowStrength = 0.35;
  let beatGlowEnabled = true;

  let lastFrameAt = 0;

  function clearBeatMap(key = "") {
    beatMapKey = key;
    beatMap = null;
    cameraIdx = 0;
    pulseIdx = 0;
    prevMapTime = -1;
    cameraEvents = [];
    pulseDrive = 0;
    glowDrive = 0;
    bassDrive = 0;
  }

  /** @param {number} t @param {boolean} [preserveEvents] */
  function syncBeatCursor(t, preserveEvents = false) {
    if (!beatMap) {
      cameraIdx = 0;
      pulseIdx = 0;
      if (!preserveEvents) cameraEvents = [];
      return;
    }
    const camera = beatMap.cameraBeats;
    const pulse = beatMap.pulseBeats;
    while (cameraIdx < camera.length && beatEventTime(camera[cameraIdx]) <= t) cameraIdx++;
    while (pulseIdx < pulse.length && beatEventTime(pulse[pulseIdx]) <= t) pulseIdx++;
    if (!preserveEvents) cameraEvents = [];
    prevMapTime = t;
  }

  /**
   * @param {unknown} payload
   * @param {string} [key]
   */
  function setBeatMap(payload, key = "") {
    const nextKey = key || beatMapKey;
    const normalized = normalizeBeatMapPayload(payload);
    if (!normalized) {
      if (key !== beatMapKey) clearBeatMap(nextKey);
      return;
    }
    beatMapKey = nextKey;
    beatMap = normalized;
    syncBeatCursor(0, false);
  }

  /** @param {{ timeMs: number, text: string }[]} lines @param {string} trackKey */
  function setLyricLineBeatMap(lines, trackKey) {
    const key = `lyrics:${trackKey || ""}`;
    if (key === beatMapKey && beatMap) return;
    const fromLyrics = buildBeatMapFromLyricLines(lines);
    if (fromLyrics) {
      setBeatMap(fromLyrics, key);
    } else if (beatMapKey.startsWith("lyrics:")) {
      clearBeatMap("");
    }
  }

  function configure(options = {}) {
    if (options.cinemaEnabled != null) cinemaEnabled = Boolean(options.cinemaEnabled);
    if (options.glowStrength != null) {
      glowStrength = clamp(options.glowStrength, 0, 0.85, 0.35);
    }
    if (options.beatGlowEnabled != null) beatGlowEnabled = Boolean(options.beatGlowEnabled);
  }

  /**
   * @param {{ points?: number[], peak?: number, rms?: number }} frame
   */
  function feedWaveformFrame(frame) {
    const peak = clamp(frame?.peak, 0, 1.5, 0);
    const rms = clamp(frame?.rms, 0, 1.5, 0);
    const points = Array.isArray(frame?.points) ? frame.points : [];

    let bass = 0;
    if (points.length > 0) {
      const third = Math.max(1, Math.floor(points.length / 3));
      for (let i = 0; i < third; i++) {
        bass = Math.max(bass, Number(points[i]) || 0);
      }
    } else {
      bass = peak * 0.72;
    }

    smoothBass += (bass - smoothBass) * 0.22;
    lastRms = rms;

    const onset = Math.max(0, peak - lastPeak * 0.88);
    if (peak > 0.34 && onset > 0.08) {
      beatPulse = Math.max(beatPulse, Math.min(1, peak * 1.15 + onset * 0.55));
    }
    lastPeak = peak * 0.92 + peak * 0.08;
    beatPulse *= 0.88;
  }

  /** @param {BeatEvent} ev */
  function scheduleCameraBeat(ev) {
    const time = beatEventTime(ev);
    if (!Number.isFinite(time)) return;
    const strength = clamp(ev.strength ?? 0.72, 0, 1, 0.72);
    const confidence = clamp(ev.confidence ?? 0.72, 0, 1, 0.72);
    const impact = clamp(ev.impact ?? strength, 0, 1, strength);
    if (ev.primary === false && impact < 0.64) return;
    if (impact < 0.16 && strength < 0.52) return;
    if (confidence < 0.25 && strength < 0.66) return;

    const low = clamp(ev.low ?? 0.62, 0, 1.4, 0.62);
    const body = clamp(ev.body ?? 0.22, 0, 1.2, 0.22);
    const snap = clamp(ev.snap ?? 0.16, 0, 1.2, 0.16);
    const mass = clamp(ev.mass ?? low * 0.72 + body * 0.34 + strength * 0.18, 0, 1, 0.62);
    const sharpness = clamp(ev.sharpness ?? snap, 0, 1, snap);

    const minGap = 0.385;
    if (time - lastCameraTriggerAt < minGap && strength < 0.88) return;
    lastCameraTriggerAt = time;

    let amp = clamp(0.13 + strength * 0.34 + confidence * 0.06 + mass * 0.15 + snap * 0.04, 0.08, 0.88);
    amp *= 0.72 + impact * 0.48;
    const combo = ev.combo;
    if (combo === "downbeat") amp *= 1.12;
    else if (combo === "push") amp *= 0.84;
    else if (combo === "drop") amp *= 0.98;
    else if (combo === "rebound") amp *= 0.74;
    else if (combo === "accent") amp *= 1.08;

    const attack = clamp(0.028 * (1.18 - sharpness * 0.55), 0.014, 0.038);
    const hold = clamp(0.03 * (0.62 + low * 0.55 + body * 0.25), 0.014, 0.052);
    const release = clamp(0.185 * (0.76 + mass * 0.56 + body * 0.18 - sharpness * 0.18), 0.11, 0.255);

    cameraEvents.push({
      start: time - attack,
      hit: time,
      amp: Math.min(1, amp),
      attack,
      hold,
      release,
      low,
      body,
      mass,
    });
    if (cameraEvents.length > 10) cameraEvents.splice(0, cameraEvents.length - 10);
  }

  /** @param {BeatEvent} ev */
  function triggerPulse(ev) {
    const strength = clamp(ev.strength ?? 0.42, 0, 1, 0.42);
    const impact = clamp(ev.impact ?? strength, 0, 1, strength);
    const low = clamp(ev.low ?? 0.62, 0, 1.4, 0.62);
    const body = clamp(ev.body ?? 0.22, 0, 1.2, 0.22);
    const combo = ev.combo;
    const lift = combo === "downbeat" ? 0.08 : combo === "drop" ? 0.04 : 0;
    const pulse = 0.14 + strength * 0.46 + impact * 0.18 + body * 0.08 + lift;
    pulseDrive = Math.max(pulseDrive, Math.min(0.82, pulse));
    glowDrive = Math.max(glowDrive, Math.min(1.16, 0.18 + impact * 0.52 + strength * 0.28));
    bassDrive = Math.max(bassDrive, Math.min(1.08, low * (0.4 + impact * 0.42) + body * 0.12));
  }

  /**
   * @param {number} t sec
   * @param {number} dt sec
   * @param {boolean} playing
   */
  function tickBeatMap(t, dt, playing) {
    const hasMap = Boolean(beatMap && (beatMap.cameraBeats.length || beatMap.pulseBeats.length));
    if (!hasMap || !playing || !cinemaEnabled) {
      pulseDrive *= 0.08 ** dt;
      glowDrive *= 0.1 ** dt;
      bassDrive *= 0.14 ** dt;
      if (!playing) cameraEvents = [];
      return { active: hasMap, beat: pulseDrive, glow: glowDrive, bass: bassDrive };
    }

    if (prevMapTime >= 0 && Math.abs(t - prevMapTime) > 0.55) syncBeatCursor(t, false);
    prevMapTime = t;

    const lookahead = 0.075;
    while (cameraIdx < beatMap.cameraBeats.length) {
      const cam = beatMap.cameraBeats[cameraIdx];
      if (beatEventTime(cam) > t + lookahead) break;
      scheduleCameraBeat(cam);
      cameraIdx++;
    }
    while (pulseIdx < beatMap.pulseBeats.length) {
      const pulse = beatMap.pulseBeats[pulseIdx];
      if (beatEventTime(pulse) > t + 0.018) break;
      triggerPulse(pulse);
      pulseIdx++;
    }

    let beat = pulseDrive;
    let glow = glowDrive;
    let bass = bassDrive;
    const keep = [];
    for (const ev of cameraEvents) {
      const local = t - ev.start;
      const end = ev.attack + ev.hold + ev.release;
      if (local < -lookahead || local > end + 0.06) continue;
      keep.push(ev);
      if (local < 0) continue;
      let val = 0;
      if (local < ev.attack) val = beatEaseInOut(local / ev.attack);
      else if (local < ev.attack + ev.hold) val = 1;
      else {
        val = (1 - clamp((local - ev.attack - ev.hold) / ev.release, 0, 1, 1)) ** 1.72;
      }
      beat = Math.max(beat, ev.amp * val * 1.38);
      glow = Math.max(glow, (0.18 + ev.amp * 0.92 + ev.mass * 0.12) * val);
      bass = Math.max(bass, (ev.low * 0.62 + ev.body * 0.18 + ev.amp * 0.18) * val);
    }
    cameraEvents = keep;
    pulseDrive *= 0.08 ** dt;
    glowDrive *= 0.1 ** dt;
    bassDrive *= 0.14 ** dt;
    return {
      active: true,
      beat: clamp(beat, 0, 1.35, 0),
      glow: clamp(glow, 0, 1.45, 0),
      bass: clamp(bass, 0, 1.2, 0),
    };
  }

  /**
   * @param {number} nowSec
   * @param {number} dt
   * @param {boolean} playing
   */
  function updateMotion(nowSec, dt, playing) {
    const mapMotion = tickBeatMap(nowSec, dt, playing);
    const glowDriveNorm = glowStrength > 0 ? Math.min(1.7, glowStrength / 0.5) : 0;

    const beatSource =
      cinemaEnabled && beatGlowEnabled
        ? Math.max(beatPulse, mapMotion.beat * 0.86)
        : mapMotion.beat * 0.72;
    const offlineBeat = cinemaEnabled ? mapMotion.beat : 0;
    const offlineGlow = cinemaEnabled ? mapMotion.glow : 0;
    const offlineBass = cinemaEnabled ? mapMotion.bass : 0;

    const localBeat =
      playing && cinemaEnabled ? Math.sin(nowSec * 2.35) ** 8 * (mapMotion.active ? 0.1 : 0.44) : 0;
    const bassInput = Math.max(smoothBass, offlineBass, lastRms * 0.55);

    const fallbackSolar =
      glowStrength > 0
        ? (0.18 +
            (0.5 + 0.5 * Math.sin(nowSec * 1.05)) * 0.16 +
            Math.max(bassInput * 0.32, beatSource * 0.12) +
            beatSource * 1.18 +
            offlineGlow * 0.22) *
          glowDriveNorm
        : 0;

    const solarTarget =
      glowStrength > 0
        ? Math.min(1.45, Math.max(offlineGlow, fallbackSolar * 0.56 + localBeat * 0.18))
        : localBeat * 0.12;
    const beatTarget = cinemaEnabled
      ? Math.min(1.35, Math.max(beatGlowEnabled ? beatSource : offlineBeat * 0.72, localBeat))
      : 0;

    live.solar += (solarTarget - live.solar) * (solarTarget > live.solar ? 0.36 : 0.1);
    live.beat += (beatTarget - live.beat) * (beatTarget > live.beat ? 0.62 : 0.18);
    live.bass += (bassInput - live.bass) * 0.22;

    return { glowStrength, glowDrive: glowDriveNorm, mapMotion };
  }

  /**
   * @param {number} nowSec
   * @param {number} dt
   * @param {boolean} playing
   */
  function tick(nowSec, dt, playing) {
    const motion = updateMotion(nowSec, dt, playing);
    const cinemaBinding = cinemaEnabled;
    const motionBeat = cinemaBinding ? live.beat : 0;
    const motionSolar = cinemaBinding ? live.solar : 0;
    const motionBass = cinemaBinding ? live.bass : 0;

    const targetLift = cinemaBinding
      ? Math.min(22, motionBeat * 18 + motionSolar * 5.2 + motionBass * 4.4)
      : 0;
    live.lift += (targetLift - live.lift) * (targetLift > live.lift ? 0.46 : 0.16);

    const floatY = Math.sin(nowSec * 1.08) * -9.8 + Math.sin(nowSec * 2.1 + 0.7) * 3.1;
    const floatX = Math.sin(nowSec * 0.7 + 0.4) * 6.2 + Math.sin(nowSec * 1.18 + 1.1) * 2.6;
    const bobY = floatY - live.lift;
    const bobX = floatX + Math.sin(nowSec * 1.55) * motionBeat * 3.4;
    const rotX = Math.sin(nowSec * 0.86 + 0.2) * 3.25 - motionBeat * 0.92;
    const rotY = Math.sin(nowSec * 0.74 + 1.3) * -2.75 + motionBeat * 0.34;
    const scale = 1 + motionBeat * 0.115 + motionSolar * 0.034 + motionBass * 0.026;
    live.scale += (scale - live.scale) * (scale > live.scale ? 0.46 : 0.16);

    const beatGlowPx =
      glowStrength > 0 ? clamp(motionBeat * 8 + motionSolar * 3, 0, 12, 0) : 0;
    const brightness = 1.04 + motionBeat * 0.12 + motionSolar * 0.05;
    const saturate = 1.08 + motionBeat * 0.1;

    return {
      transform: `translate3d(${bobX.toFixed(2)}px,${bobY.toFixed(2)}px,0) rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg) scale(${live.scale.toFixed(4)})`,
      brightness,
      saturate,
      beatGlowPx,
      motionBeat,
      motionSolar,
    };
  }

  /** @param {number} elapsedSec */
  function syncPlaybackTime(elapsedSec) {
    if (prevMapTime >= 0 && Math.abs(elapsedSec - prevMapTime) > 0.55) {
      syncBeatCursor(elapsedSec, false);
    }
  }

  function reset() {
    clearBeatMap("");
    smoothBass = 0;
    beatPulse = 0;
    lastPeak = 0;
    lastRms = 0;
    live.solar = 0;
    live.beat = 0;
    live.bass = 0;
    live.scale = 1;
    live.lift = 0;
    lastFrameAt = 0;
  }

  return {
    setBeatMap,
    setLyricLineBeatMap,
    configure,
    feedWaveformFrame,
    tick,
    syncPlaybackTime,
    reset,
  };
}

/** @type {ReturnType<typeof createMineradioBeatMotion> | null} */
let sharedMotion = null;

export function getMineradioBeatMotion() {
  if (!sharedMotion) sharedMotion = createMineradioBeatMotion();
  return sharedMotion;
}

export function resetMineradioBeatMotion() {
  sharedMotion?.reset();
  sharedMotion = null;
}
