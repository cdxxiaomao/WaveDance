import * as THREE from "three";

/** @param {number} [size=64] */
export function makeDotTexture(size = 64) {
  const s = Math.max(8, Math.floor(size));
  const cv = document.createElement("canvas");
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.32, "rgba(255,255,255,0.88)");
    g.addColorStop(0.72, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** @returns {THREE.DataTexture} */
export function makeFallbackCoverTexture() {
  const data = new Uint8Array([120, 90, 200, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
