import * as THREE from "three";
import { aggregateBands } from "../bandAggregate.js";

const SPECTRUM_TEXTURE_WIDTH = 256;

let cachedTexture = null;
let cachedTextureData = null;

function ensureSpectrumTexture(len) {
  const width = Math.max(len, SPECTRUM_TEXTURE_WIDTH);
  if (!cachedTexture || cachedTextureData.length !== width) {
    cachedTextureData = new Float32Array(width);
    cachedTexture = new THREE.DataTexture(
      cachedTextureData,
      width,
      1,
      THREE.RedFormat,
      THREE.FloatType,
    );
    cachedTexture.minFilter = THREE.LinearFilter;
    cachedTexture.magFilter = THREE.LinearFilter;
    cachedTexture.wrapS = THREE.ClampToEdgeWrapping;
    cachedTexture.wrapT = THREE.ClampToEdgeWrapping;
    cachedTexture.needsUpdate = true;
  }
  return { texture: cachedTexture, data: cachedTextureData, width };
}

function bandPeak(values, start, end) {
  let peak = 0;
  for (let i = start; i < end; i++) {
    if (values[i] > peak) peak = values[i];
  }
  return peak;
}

/**
 * 将 shapePipeline 处理后的频谱转为 Three shader 常用 uniform 包。
 * @param {Float32Array | number[]} processedPoints
 * @returns {{ bass: number, mid: number, treble: number, spectrumTexture: THREE.DataTexture, bandPeaks: Float32Array }}
 */
export function buildSpectrumUniforms(processedPoints) {
  const len = processedPoints.length;
  const third = Math.max(1, Math.floor(len / 3));

  const bass = bandPeak(processedPoints, 0, third);
  const mid = bandPeak(processedPoints, third, third * 2);
  const treble = bandPeak(processedPoints, third * 2, len);

  const bandPeaks = aggregateBands(processedPoints, 8);

  const { texture, data, width } = ensureSpectrumTexture(len);
  data.fill(0);
  for (let i = 0; i < len; i++) {
    data[i] = processedPoints[i];
  }
  texture.needsUpdate = true;

  return {
    bass,
    mid,
    treble,
    spectrumTexture: texture,
    bandPeaks,
    spectrumLength: len,
    textureWidth: width,
  };
}

/** 释放模块级缓存纹理（threeBridge dispose 时调用）。 */
export function disposeSpectrumUniformsCache() {
  cachedTexture?.dispose();
  cachedTexture = null;
  cachedTextureData = null;
}
