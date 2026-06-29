import * as THREE from "three";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";

/** @typedef {{ worldWidth: number, worldDepth: number, horizonRadius: number, horizonCurvature: number, horizonEdgeStart: number }} SoundFieldHorizonOptions */

const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _scratchNormal = new THREE.Vector3(0, 1, 0);

/**
 * @param {Partial<SoundFieldHorizonOptions>} [overrides]
 * @param {typeof DEFAULT_CONFIG.threeSoundField} [cfg]
 */
export function resolveSoundFieldHorizonOptions(overrides = {}, cfg = DEFAULT_CONFIG.threeSoundField) {
  return {
    worldWidth: overrides.worldWidth ?? cfg.worldWidth,
    worldDepth: overrides.worldDepth ?? cfg.worldDepth,
    horizonRadius: overrides.horizonRadius ?? cfg.horizonRadius,
    horizonCurvature: overrides.horizonCurvature ?? cfg.horizonCurvature,
    horizonEdgeStart: overrides.horizonEdgeStart ?? cfg.horizonEdgeStart,
  };
}

/**
 * 大球面 cap：中心平、边缘下沉，形成天际线弧度。
 * @param {number} x
 * @param {number} z
 * @param {SoundFieldHorizonOptions} opts
 */
export function sampleHorizonSurface(x, z, opts) {
  const r = Math.hypot(x, z);
  const R = opts.horizonRadius;
  const curv = opts.horizonCurvature;
  const lift = Math.sqrt(Math.max(0, R * R - r * r));
  const yBase = curv * (lift - R);

  const halfLimit = Math.min(opts.worldWidth, opts.worldDepth) * 0.5;
  const edgeT = halfLimit > 0 ? r / halfLimit : 0;
  const fadeStart = opts.horizonEdgeStart;
  let horizonMask = 1;
  if (edgeT > fadeStart) {
    const t = (edgeT - fadeStart) / Math.max(0.001, 1 - fadeStart);
    horizonMask = Math.max(0, 1 - t * t * (3 - 2 * t));
  }

  _scratchNormal.set(0, 1, 0);
  if (r >= 1e-5) _scratchNormal.set(x, lift, z).normalize();

  return { yBase, normal: _scratchNormal, horizonMask, edgeT };
}

/**
 * 柱体贴合弧面并沿法线生长。
 * @param {THREE.Object3D} dummy
 * @param {number} x
 * @param {number} z
 * @param {number} barHeight
 * @param {SoundFieldHorizonOptions} opts
 * @returns {number} horizonMask
 */
export function applyBarTransformOnHorizon(dummy, x, z, barHeight, opts) {
  const { yBase, normal, horizonMask } = sampleHorizonSurface(x, z, opts);
  if (horizonMask <= 0.001 || barHeight <= 0.001) {
    dummy.position.set(x, yBase, z);
    dummy.quaternion.identity();
    dummy.scale.set(0, 0, 0);
    return horizonMask;
  }

  _quat.setFromUnitVectors(_up, normal);
  dummy.quaternion.copy(_quat);
  const halfH = barHeight * 0.5;
  dummy.position.set(
    x + normal.x * halfH,
    yBase + normal.y * halfH,
    z + normal.z * halfH,
  );
  dummy.scale.set(1, barHeight, 1);
  return horizonMask;
}

/**
 * 黑色弧面底，随天际线弯曲。
 * @param {SoundFieldHorizonOptions} opts
 * @param {number} [segments=96]
 */
export function createSoundFieldCurvedGround(opts, segments = 96) {
  const halfW = opts.worldWidth * 0.5;
  const halfD = opts.worldDepth * 0.5;
  const geo = new THREE.PlaneGeometry(opts.worldWidth * 1.04, opts.worldDepth * 1.04, segments, segments);
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position;
  const halfLimit = Math.min(halfW, halfD);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const edgeT = halfLimit > 0 ? r / halfLimit : 0;
    if (edgeT > 1.02) {
      pos.setY(i, -80);
      continue;
    }
    const { yBase, horizonMask } = sampleHorizonSurface(x, z, opts);
    pos.setY(i, yBase - 0.025 * horizonMask);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -3;
  return mesh;
}

/**
 * 纯黑穹顶，与弧面地平线衔接。
 * @param {SoundFieldHorizonOptions} opts
 */
export function createSoundFieldHorizonSky(opts) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
    toneMapped: false,
  });
  const radius = opts.horizonRadius * 1.55;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.56),
    mat,
  );
  mesh.position.y = -opts.horizonRadius * opts.horizonCurvature * 0.98;
  mesh.renderOrder = -4;
  return mesh;
}
