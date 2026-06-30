/**
 * Pulse (Kick) / Snare / Meteor 触发评估（参考 sonic AudioEngine.evaluateTrigger）
 */

/** @typedef {Object} TriggerConfig
 * @property {boolean} enabled
 * @property {number} sensitivity 0~1
 * @property {number} cooldown 帧数
 * @property {number} bandStart 归一化频率 0~1
 * @property {number} bandEnd
 */

/** @typedef {Object} TriggerCallbacks
 * @property {(strength: number) => void} [onPulse]
 * @property {(strength: number) => void} [onSnare]
 * @property {(strength: number) => void} [onMeteor]
 */

/**
 * @param {Float32Array | number[]} processed
 * @param {Float32Array | null} prevProcessed
 * @param {number} t0
 * @param {number} t1
 */
export function computeBandFlux(processed, prevProcessed, t0, t1) {
  const len = processed?.length ?? 0;
  if (len <= 0 || !prevProcessed || prevProcessed.length !== len) return 0;

  const i0 = len <= 1 ? 0 : Math.floor(t0 * (len - 1));
  const i1 = len <= 1 ? 0 : Math.max(i0, Math.floor(t1 * (len - 1)));

  let sum = 0;
  let count = 0;
  for (let i = i0; i <= i1; i++) {
    const delta = Number(processed[i] ?? 0) - prevProcessed[i];
    if (delta > 0) sum += delta;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * @param {{
 *   pulseEnabled?: boolean,
 *   pulseSensitivity?: number,
 *   pulseCooldown?: number,
 *   snareEnabled?: boolean,
 *   snareSensitivity?: number,
 *   snareCooldown?: number,
 *   meteorEnabled?: boolean,
 *   meteorSensitivity?: number,
 *   meteorCooldown?: number,
 * }} cfg
 */
export function createTriggerEngine(cfg = {}) {
  /** @type {Record<string, TriggerConfig & { cooldownRemaining: number }>} */
  const triggers = {
    pulse: {
      enabled: cfg.pulseEnabled !== false,
      sensitivity: Number(cfg.pulseSensitivity) || 0.85,
      cooldown: Math.max(1, Math.round(Number(cfg.pulseCooldown) || 15)),
      bandStart: 0.02,
      bandEnd: 0.06,
      cooldownRemaining: 0,
    },
    snare: {
      enabled: cfg.snareEnabled !== false,
      sensitivity: Number(cfg.snareSensitivity) || 0.6,
      cooldown: Math.max(1, Math.round(Number(cfg.snareCooldown) || 30)),
      bandStart: 0.12,
      bandEnd: 0.48,
      cooldownRemaining: 0,
    },
    meteor: {
      enabled: cfg.meteorEnabled !== false,
      sensitivity: Number(cfg.meteorSensitivity) || 0.45,
      cooldown: Math.max(1, Math.round(Number(cfg.meteorCooldown) || 241)),
      bandStart: 0.62,
      bandEnd: 1.0,
      cooldownRemaining: 0,
    },
  };

  /**
   * @param {keyof typeof triggers} name
   * @param {Partial<TriggerConfig>} next
   */
  function updateTrigger(name, next) {
    const t = triggers[name];
    if (!t || !next) return;
    if (next.enabled !== undefined) t.enabled = Boolean(next.enabled);
    if (next.sensitivity !== undefined) t.sensitivity = Number(next.sensitivity) || t.sensitivity;
    if (next.cooldown !== undefined) t.cooldown = Math.max(1, Math.round(Number(next.cooldown) || t.cooldown));
  }

  function syncFromStyle(style, defaults) {
    updateTrigger("pulse", {
      enabled: style.pulseEnabled ?? defaults.pulseEnabled,
      sensitivity: style.pulseSensitivity ?? defaults.pulseSensitivity,
      cooldown: style.pulseCooldown ?? defaults.pulseCooldown,
    });
    updateTrigger("snare", {
      enabled: style.snareEnabled ?? defaults.snareEnabled,
      sensitivity: style.snareSensitivity ?? defaults.snareSensitivity,
      cooldown: style.snareCooldown ?? defaults.snareCooldown,
    });
    updateTrigger("meteor", {
      enabled: style.meteorEnabled ?? defaults.meteorEnabled,
      sensitivity: style.meteorSensitivity ?? defaults.meteorSensitivity,
      cooldown: style.meteorCooldown ?? defaults.meteorCooldown,
    });
  }

  /**
   * @param {Float32Array | number[]} processed
   * @param {Float32Array | null} prevProcessed
   * @param {TriggerCallbacks} callbacks
   */
  function evaluate(processed, prevProcessed, callbacks = {}) {
    for (const key of ["pulse", "snare", "meteor"]) {
      const t = triggers[key];
      if (t.cooldownRemaining > 0) {
        t.cooldownRemaining -= 1;
      }
      if (!t.enabled || t.cooldownRemaining > 0) continue;

      const flux = computeBandFlux(processed, prevProcessed, t.bandStart, t.bandEnd);
      const threshold = Math.max(0.02, t.sensitivity * 0.12);
      if (flux <= threshold) continue;

      const strength = Math.min(1, flux / threshold - 1);
      t.cooldownRemaining = t.cooldown;

      if (key === "pulse") callbacks.onPulse?.(strength);
      else if (key === "snare") callbacks.onSnare?.(strength);
      else if (key === "meteor") callbacks.onMeteor?.(strength);
    }
  }

  function dispose() {}

  return { evaluate, syncFromStyle, updateTrigger, dispose };
}
