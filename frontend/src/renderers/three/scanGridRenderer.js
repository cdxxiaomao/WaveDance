import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "./postProcessing.js";
import { DEFAULT_CONFIG } from "../../visualizationSchema.js";

const GRID_WORLD_W = 10;
const GRID_WORLD_D = 7;
const MAX_BAR_HEIGHT = 2.8;

const LINE_VERTEX = /* glsl */ `
attribute vec3 instanceColor;
varying vec3 vColor;
varying float vScanDist;
varying float vHeightNorm;

uniform float u_scanZ;

void main() {
  vColor = instanceColor;
  vScanDist = abs(position.z - u_scanZ);
  vHeightNorm = clamp(position.y / ${MAX_BAR_HEIGHT.toFixed(1)}, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LINE_FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3 u_gridColor;
uniform vec3 u_highlightColor;
uniform vec3 u_scanBeamColor;
uniform float u_highlightStrength;

varying vec3 vColor;
varying float vScanDist;
varying float vHeightNorm;

void main() {
  float scanGlow = exp(-vScanDist * 7.5);
  float beamCore = smoothstep(0.22, 0.0, vScanDist);
  float beamHalo = exp(-vScanDist * 3.2) * 0.45;

  vec3 base = mix(u_gridColor, vColor, 0.65 + vHeightNorm * 0.35);
  vec3 col = mix(base, u_highlightColor, scanGlow * u_highlightStrength * (0.35 + vHeightNorm * 0.65));
  col += u_scanBeamColor * (beamCore * 0.95 + beamHalo * 0.35);
  col *= 0.55 + vHeightNorm * 0.55 + scanGlow * 0.25;

  float alpha = clamp(0.42 + vHeightNorm * 0.38 + scanGlow * 0.35 + beamCore * 0.25, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/** @param {string} hex @param {string} fallback */
function hexToColor(hex, fallback) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
  return new THREE.Color(safe);
}

/**
 * @param {Float32Array | number[]} processed
 * @param {number} cols
 * @param {boolean} freqReversed
 */
function aggregateColumns(processed, cols, freqReversed) {
  const out = new Float32Array(cols);
  const len = processed.length;
  if (len === 0) return out;

  for (let c = 0; c < cols; c++) {
    const start = Math.floor((c * len) / cols);
    const end = Math.floor(((c + 1) * len) / cols);
    let peak = 0;
    for (let i = start; i < end; i++) {
      if (processed[i] > peak) peak = processed[i];
    }
    out[c] = peak;
  }

  if (freqReversed) out.reverse();
  return out;
}

/**
 * @param {number} cols
 * @param {number} rows
 */
function buildGridLineGeometry(cols, rows) {
  const positions = [];
  const colors = [];
  const barTopIndices = [];

  const colStep = GRID_WORLD_W / cols;
  const rowStep = GRID_WORLD_D / rows;
  const x0 = -GRID_WORLD_W * 0.5;
  const z0 = -GRID_WORLD_D * 0.5;

  const pushSeg = (x1, y1, z1, x2, y2, z2, r, g, b) => {
    positions.push(x1, y1, z1, x2, y2, z2);
    colors.push(r, g, b, r, g, b);
  };

  for (let r = 0; r <= rows; r++) {
    const z = z0 + r * rowStep;
    pushSeg(x0, 0, z, x0 + GRID_WORLD_W, 0, z, 0.35, 0.32, 0.55);
  }

  for (let c = 0; c <= cols; c++) {
    const x = x0 + c * colStep;
    pushSeg(x, 0, z0, x, 0, z0 + GRID_WORLD_D, 0.35, 0.32, 0.55);
  }

  for (let c = 0; c < cols; c++) {
    const x = x0 + (c + 0.5) * colStep;
    for (let r = 0; r <= rows; r++) {
      const z = z0 + r * rowStep;
      const baseIdx = positions.length / 3;
      pushSeg(x, 0, z, x, 0.01, z, 0.55, 0.48, 0.85);
      barTopIndices.push({ vertexIndex: baseIdx + 1, col: c });
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("instanceColor", new THREE.Float32BufferAttribute(colors, 3));
  return { geometry, barTopIndices, colStep, x0, z0, rowStep };
}

/**
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createScanGridRenderer(ctx) {
  const { renderer, scene, camera } = ctx;

  camera.near = 0.1;
  camera.far = 80;
  camera.fov = 52;

  let gridCols = DEFAULT_CONFIG.threeScanGrid.gridCols;
  let gridRows = DEFAULT_CONFIG.threeScanGrid.gridRows;
  let cameraPitchDeg = DEFAULT_CONFIG.threeScanGrid.cameraPitchDeg;

  /** @type {{ geometry: THREE.BufferGeometry, barTopIndices: { vertexIndex: number, col: number }[] } | null} */
  let gridBundle = null;

  const lineUniforms = {
    u_scanZ: { value: 0 },
    u_gridColor: {
      value: hexToColor(DEFAULT_CONFIG.threeScanGrid.gridColor, DEFAULT_CONFIG.threeScanGrid.gridColor),
    },
    u_highlightColor: {
      value: hexToColor(
        DEFAULT_CONFIG.threeScanGrid.highlightColor,
        DEFAULT_CONFIG.threeScanGrid.highlightColor,
      ),
    },
    u_scanBeamColor: {
      value: hexToColor(
        DEFAULT_CONFIG.threeScanGrid.scanBeamColor,
        DEFAULT_CONFIG.threeScanGrid.scanBeamColor,
      ),
    },
    u_highlightStrength: { value: DEFAULT_CONFIG.threeScanGrid.highlightStrength / 100 },
  };

  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: lineUniforms,
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  /** @type {THREE.LineSegments | null} */
  let gridLines = null;

  const scanBeamUniforms = {
    u_scanBeamColor: {
      value: hexToColor(
        DEFAULT_CONFIG.threeScanGrid.scanBeamColor,
        DEFAULT_CONFIG.threeScanGrid.scanBeamColor,
      ),
    },
    u_opacity: { value: 0.55 },
  };

  const scanBeamMaterial = new THREE.ShaderMaterial({
    uniforms: scanBeamUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 u_scanBeamColor;
      uniform float u_opacity;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float vert = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float alpha = edge * vert * u_opacity;
        gl_FragColor = vec4(u_scanBeamColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const scanBeam = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_WORLD_W * 1.05, MAX_BAR_HEIGHT * 1.15),
    scanBeamMaterial,
  );
  scanBeam.position.y = MAX_BAR_HEIGHT * 0.48;
  scene.add(scanBeam);

  let composer = null;
  let bloomEnabled = DEFAULT_CONFIG.threeScanGrid.bloomEnabled;
  let bloomStrength = DEFAULT_CONFIG.threeScanGrid.bloomStrength;
  let lastComposerKey = "";

  const clock = new THREE.Clock(true);
  let scanPhase = 0;

  function updateCamera() {
    const pitch = THREE.MathUtils.degToRad(cameraPitchDeg);
    const dist = 13.5;
    const y = dist * Math.sin(pitch);
    const z = dist * Math.cos(pitch) * 0.55;
    camera.position.set(0, y, z);
    camera.lookAt(0, MAX_BAR_HEIGHT * 0.22, 0);
    camera.updateProjectionMatrix();
  }

  function rebuildGrid() {
    if (gridLines) {
      scene.remove(gridLines);
      gridBundle?.geometry.dispose();
      gridLines.geometry.dispose();
    }

    gridBundle = buildGridLineGeometry(gridCols, gridRows);
    gridLines = new THREE.LineSegments(gridBundle.geometry, lineMaterial);
    scene.add(gridLines);
  }

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.08,
        luminanceSmoothing: 0.35,
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  rebuildGrid();
  updateCamera();
  rebuildComposer();

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  function updateBarHeights(columnHeights) {
    if (!gridBundle || !gridLines) return;
    const pos = gridLines.geometry.getAttribute("position");
    const col = gridLines.geometry.getAttribute("instanceColor");

    for (const { vertexIndex, col: colIdx } of gridBundle.barTopIndices) {
      const h = (columnHeights[colIdx] ?? 0) * MAX_BAR_HEIGHT;
      const safeH = Math.max(h, 0.02);
      pos.setY(vertexIndex, safeH);

      const norm = Math.min(1, columnHeights[colIdx] ?? 0);
      col.setXYZ(vertexIndex, 0.45 + norm * 0.55, 0.38 + norm * 0.35, 0.75 + norm * 0.25);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  function render(_points, _shapeConfig, styleConfig, _frameMeta, _spectrum, processed) {
    const style = styleConfig ?? {};
    const cfg = DEFAULT_CONFIG.threeScanGrid;

    const nextCols = clampInt(style.gridCols, 16, 64, cfg.gridCols);
    const nextRows = clampInt(style.gridRows, 12, 48, cfg.gridRows);
    const nextPitch = clampInt(style.cameraPitchDeg, 25, 75, cfg.cameraPitchDeg);

    if (nextCols !== gridCols || nextRows !== gridRows) {
      gridCols = nextCols;
      gridRows = nextRows;
      rebuildGrid();
    }
    if (nextPitch !== cameraPitchDeg) {
      cameraPitchDeg = nextPitch;
      updateCamera();
    }

    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : cfg.bloomEnabled;
    const nextBloomStrength = Number(style.bloomStrength) || cfg.bloomStrength;
    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    const safeDt = dt > 0 ? dt : 1 / 60;
    const scanSpeed = clampFloat(style.scanSpeed, 0.2, 3.0, cfg.scanSpeed);
    scanPhase = (scanPhase + safeDt * scanSpeed) % 1;
    const scanZ = -GRID_WORLD_D * 0.5 + scanPhase * GRID_WORLD_D;
    lineUniforms.u_scanZ.value = scanZ;
    scanBeam.position.z = scanZ;

    const highlightStrength = clampInt(style.highlightStrength, 0, 100, cfg.highlightStrength);
    lineUniforms.u_highlightStrength.value = highlightStrength / 100;
    scanBeamUniforms.u_opacity.value = 0.35 + (highlightStrength / 100) * 0.45;

    if (style.gridColor) {
      lineUniforms.u_gridColor.value.copy(hexToColor(style.gridColor, cfg.gridColor));
    }
    if (style.highlightColor) {
      lineUniforms.u_highlightColor.value.copy(hexToColor(style.highlightColor, cfg.highlightColor));
    }
    if (style.scanBeamColor) {
      const beam = hexToColor(style.scanBeamColor, cfg.scanBeamColor);
      lineUniforms.u_scanBeamColor.value.copy(beam);
      scanBeamUniforms.u_scanBeamColor.value.copy(beam);
    }

    const freqReversed = Boolean(style.freqReversed);
    const columnHeights = aggregateColumns(processed ?? [], gridCols, freqReversed);
    updateBarHeights(columnHeights);

    renderer.setClearColor(0x000000, 0);
    try {
      composer?.render();
    } catch (err) {
      console.warn("[WaveDance] 扫描网格后处理渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      rebuildComposer();
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    disposeComposer(composer);
    composer = null;
    if (gridLines) {
      scene.remove(gridLines);
      gridLines.geometry.dispose();
    }
    gridBundle?.geometry.dispose();
    lineMaterial.dispose();
    scanBeam.geometry.dispose();
    scanBeamMaterial.dispose();
    scene.remove(scanBeam);
    clock.stop();
  }

  return { render, dispose };
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
