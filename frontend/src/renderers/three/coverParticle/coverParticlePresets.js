import * as THREE from "three";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";

export const COVER_PRESET_SILK = 0;
export const COVER_PRESET_VINYL = 4;

/** @param {number} v 0.75~1.55 */
export function coverParticleGridForResolution(v) {
  const normalized = clamp(Number(v) || 1, 0.75, 1.55);
  let grid = Math.round(118 * normalized);
  grid = clamp(grid, 88, 183);
  return grid % 2 ? grid : grid + 1;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * @param {THREE.Texture} dotTex
 * @param {THREE.Texture} fallbackCoverTex
 */
export function createCoverParticleUniforms(dotTex, fallbackCoverTex) {
  const cfg = DEFAULT_CONFIG.threeCoverParticle;
  return {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uBeat: { value: 0 },
    uEnergy: { value: 0 },
    uPreset: { value: cfg.preset },
    uIntensity: { value: cfg.intensity / 100 },
    uDepth: { value: cfg.depth / 100 },
    uPointScale: { value: cfg.pointScale / 100 },
    uSpeed: { value: cfg.speed / 100 },
    uTwist: { value: cfg.twist / 100 },
    uColorBoost: { value: cfg.colorBoost / 100 },
    uScatter: { value: cfg.scatter / 100 },
    uCoverRes: { value: cfg.coverResolution },
    uAlpha: { value: 1 },
    uParticleDim: { value: 1 },
    uBloomStrength: { value: cfg.bloomStrength },
    uBloomSize: { value: cfg.bloomSize },
    uCoverTex: { value: fallbackCoverTex },
    uPrevCoverTex: { value: fallbackCoverTex },
    uEdgeTex: { value: fallbackCoverTex },
    uDotTex: { value: dotTex },
    uColorMixT: { value: 1 },
    uHasCover: { value: 0 },
    uHasDepth: { value: 0 },
    uAiBoost: { value: 1 },
    uVinylSpin: { value: 0 },
    uIsBloomLayer: { value: 0 },
    uRippleTex: { value: null },
    uMouseXY: { value: new THREE.Vector2(0, 0) },
    uMouseActive: { value: 0 },
  };
}
