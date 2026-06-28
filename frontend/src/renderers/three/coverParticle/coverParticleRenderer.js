import * as THREE from "three";
import { createBloomComposer, createBasicComposer, disposeComposer } from "../postProcessing.js";
import { DEFAULT_CONFIG } from "../../../visualizationSchema.js";
import { buildCoverParticleGeometry } from "./coverGridGeometry.js";
import { makeDotTexture, makeFallbackCoverTexture } from "./coverDotTexture.js";
import {
  COVER_PRESET_SILK,
  COVER_PRESET_VINYL,
  coverParticleGridForResolution,
  createCoverParticleUniforms,
} from "./coverParticlePresets.js";
import { createRippleManager } from "./rippleManager.js";
import {
  COVER_PARTICLE_VERTEX_SHADER,
  COVER_PARTICLE_FRAGMENT_MAIN,
  COVER_PARTICLE_FRAGMENT_BLOOM,
} from "./coverParticleShaders.js";

/**
 * @param {import('../threeContext.js').ThreeContext} ctx
 */
export function createCoverParticleRenderer(ctx) {
  const { renderer, scene, camera } = ctx;
  const cfg = DEFAULT_CONFIG.threeCoverParticle;
  const canvas = renderer.domElement;
  const rippleManager = createRippleManager();

  const prevPointerEvents = canvas.style.pointerEvents;
  let pointerListenersBound = false;

  camera.position.set(0, 0, cfg.cameraDistance);
  camera.near = 0.1;
  camera.far = 80;
  camera.fov = cfg.cameraFovDeg;
  camera.updateProjectionMatrix();

  const particleGroup = new THREE.Group();
  scene.add(particleGroup);

  const dotTex = makeDotTexture(64);
  const fallbackCoverTex = makeFallbackCoverTexture();

  const sharedUniforms = createCoverParticleUniforms(dotTex, fallbackCoverTex);
  const bloomUniforms = createCoverParticleUniforms(dotTex, fallbackCoverTex);
  bloomUniforms.uIsBloomLayer.value = 1;
  sharedUniforms.uRippleTex.value = rippleManager.texture;
  bloomUniforms.uRippleTex.value = rippleManager.texture;

  const mainMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: COVER_PARTICLE_VERTEX_SHADER,
    fragmentShader: COVER_PARTICLE_FRAGMENT_MAIN,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const bloomMaterial = new THREE.ShaderMaterial({
    uniforms: bloomUniforms,
    vertexShader: COVER_PARTICLE_VERTEX_SHADER,
    fragmentShader: COVER_PARTICLE_FRAGMENT_BLOOM,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  let geometry = null;
  /** @type {THREE.Points | null} */
  let bloomParticles = null;
  /** @type {THREE.Points | null} */
  let mainParticles = null;
  let currentGrid = coverParticleGridForResolution(cfg.coverResolution);

  function rebuildGeometry(grid) {
    if (bloomParticles) {
      particleGroup.remove(bloomParticles);
      particleGroup.remove(mainParticles);
      geometry?.dispose();
    }

    currentGrid = grid;
    geometry = buildCoverParticleGeometry(grid);
    bloomParticles = new THREE.Points(geometry, bloomMaterial);
    bloomParticles.renderOrder = 0;
    mainParticles = new THREE.Points(geometry, mainMaterial);
    mainParticles.renderOrder = 1;
    particleGroup.add(bloomParticles);
    particleGroup.add(mainParticles);
  }

  rebuildGeometry(currentGrid);

  let composer = null;
  let bloomEnabled = cfg.bloomEnabled;
  let bloomStrength = cfg.bloomStrength;
  let lastComposerKey = "";
  const clock = new THREE.Clock(true);
  let elapsed = 0;
  let vinylSpin = 0;
  let beatPulse = 0;
  let autoRotateYaw = 0;
  let mouseActive = false;
  let mouseX = 0;
  let mouseY = 0;
  let lastRippleAt = 0;
  let pointerInteractionEnabled = cfg.pointerInteractionEnabled;

  function pointerToLocalXY(event) {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    const dist = Math.max(0.1, camera.position.z);
    const planeH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist;
    const planeW = planeH * camera.aspect;
    let x = ndcX * (planeW * 0.5);
    let y = ndcY * (planeH * 0.5);
    const yaw = particleGroup.rotation.y;
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (event.button !== 0 || !pointerInteractionEnabled) return;
    mouseActive = true;
    const p = pointerToLocalXY(event);
    mouseX = p.x;
    mouseY = p.y;
    rippleManager.addRipple(p.x, p.y, 1);
    lastRippleAt = performance.now();
  }

  /** @param {PointerEvent} event */
  function onPointerMove(event) {
    if (!mouseActive || !pointerInteractionEnabled) return;
    const p = pointerToLocalXY(event);
    mouseX = p.x;
    mouseY = p.y;
    const now = performance.now();
    if (now - lastRippleAt > 28) {
      lastRippleAt = now;
      rippleManager.addRipple(p.x, p.y, 0.85);
    }
  }

  function onPointerUp() {
    mouseActive = false;
  }

  function bindPointerListeners() {
    if (pointerListenersBound) return;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    pointerListenersBound = true;
  }

  function unbindPointerListeners() {
    if (!pointerListenersBound) return;
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    pointerListenersBound = false;
  }

  function syncPointerCapture(enabled) {
    if (enabled) {
      canvas.style.pointerEvents = "auto";
      canvas.setAttribute("data-no-drag", "");
      bindPointerListeners();
      return;
    }
    mouseActive = false;
    canvas.style.pointerEvents = prevPointerEvents || "none";
    canvas.removeAttribute("data-no-drag");
    unbindPointerListeners();
  }

  syncPointerCapture(pointerInteractionEnabled);

  function rebuildComposer() {
    const key = `${bloomEnabled}:${bloomStrength.toFixed(2)}`;
    if (key === lastComposerKey && composer) return;
    disposeComposer(composer);
    composer = null;
    lastComposerKey = key;

    if (bloomEnabled) {
      composer = createBloomComposer(renderer, scene, camera, {
        intensity: bloomStrength,
        luminanceThreshold: 0.06,
        luminanceSmoothing: 0.35,
        mipmapBlur: true,
      });
    } else {
      composer = createBasicComposer(renderer, scene, camera);
    }

    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  rebuildComposer();

  function syncComposerSize() {
    if (!composer) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer.setSize(size.x, size.y);
  }

  /** @param {Record<string, { value: unknown }>} target @param {Record<string, { value: unknown }>} source */
  function copyUniformValues(target, source) {
    for (const key of Object.keys(source)) {
      if (target[key]) {
        target[key].value = source[key].value;
      }
    }
  }

  function syncCoverUniforms(uniforms, coverTextures) {
    const tex = coverTextures ?? {};
    uniforms.uCoverTex.value = tex.coverTex ?? fallbackCoverTex;
    uniforms.uPrevCoverTex.value = tex.prevCoverTex ?? tex.coverTex ?? fallbackCoverTex;
    uniforms.uEdgeTex.value = tex.edgeTex ?? fallbackCoverTex;
    uniforms.uColorMixT.value = tex.colorMixT ?? 1;
    uniforms.uHasCover.value = tex.hasCover ? 1 : 0;
    uniforms.uHasDepth.value = tex.hasDepth ? 1 : 0;
  }

  function render(_points, _shapeConfig, styleConfig, frameMeta, spectrum) {
    const style = styleConfig ?? {};
    const coverResolution = clampFloat(
      Number(style.coverResolution),
      0.75,
      1.55,
      cfg.coverResolution,
    );
    const nextGrid = coverParticleGridForResolution(coverResolution);
    if (nextGrid !== currentGrid) {
      rebuildGeometry(nextGrid);
    }

    const preset = clampInt(Number(style.preset), 0, 5, cfg.preset);
    const intensity = clampInt(Number(style.intensity), 0, 100, cfg.intensity);
    const depth = clampInt(Number(style.depth), 0, 100, cfg.depth);
    const pointScale = clampInt(Number(style.pointScale), 0, 100, cfg.pointScale);
    const speed = clampInt(Number(style.speed), 0, 100, cfg.speed);
    const twist = clampInt(Number(style.twist), 0, 100, cfg.twist);
    const scatter = clampInt(Number(style.scatter), 0, 100, cfg.scatter);
    const colorBoost = clampInt(Number(style.colorBoost), 0, 100, cfg.colorBoost);
    const cameraDistance = clampFloat(
      Number(style.cameraDistance),
      3,
      14,
      cfg.cameraDistance,
    );
    const cameraFovDeg = clampFloat(Number(style.cameraFovDeg), 30, 75, cfg.cameraFovDeg);
    const autoRotateEnabled =
      style.autoRotateEnabled !== undefined
        ? Boolean(style.autoRotateEnabled)
        : cfg.autoRotateEnabled;
    const autoRotateSpeedDeg = clampFloat(
      Number(style.autoRotateSpeedDeg),
      0,
      12,
      cfg.autoRotateSpeedDeg,
    );
    const nextBloomEnabled =
      style.bloomEnabled !== undefined ? Boolean(style.bloomEnabled) : cfg.bloomEnabled;
    const nextBloomStrength = clampFloat(
      Number(style.bloomStrength),
      0,
      2,
      cfg.bloomStrength,
    );
    const bloomSize = clampFloat(Number(style.bloomSize), 1, 4.5, cfg.bloomSize);
    const nextPointerInteractionEnabled =
      style.pointerInteractionEnabled !== undefined
        ? Boolean(style.pointerInteractionEnabled)
        : cfg.pointerInteractionEnabled;
    if (nextPointerInteractionEnabled !== pointerInteractionEnabled) {
      pointerInteractionEnabled = nextPointerInteractionEnabled;
      syncPointerCapture(pointerInteractionEnabled);
    }

    if (nextBloomEnabled !== bloomEnabled || Math.abs(nextBloomStrength - bloomStrength) > 0.01) {
      bloomEnabled = nextBloomEnabled;
      bloomStrength = nextBloomStrength;
      lastComposerKey = "";
      rebuildComposer();
    }

    syncComposerSize();

    const dt = clock.getDelta();
    const safeDt = dt > 0 ? dt : 1 / 60;
    elapsed += safeDt;
    rippleManager.tick(safeDt);

    const peak = frameMeta?.peak ? Number(frameMeta.peak) : 0;
    const rms = frameMeta?.rms ? Number(frameMeta.rms) : 0;
    const silenceGate = DEFAULT_CONFIG.silencePeakGate * 8;
    if (peak > silenceGate) {
      beatPulse = Math.min(1, peak * 1.2);
    }
    beatPulse *= 0.88;

    const bass = spectrum?.bass ?? 0;
    const mid = spectrum?.mid ?? 0;
    const treble = spectrum?.treble ?? 0;
    const K = (intensity / 100) * 1.6;

    let uBass = bass;
    let uMid = mid;
    let uTreble = treble;
    if (preset === COVER_PRESET_VINYL) {
      uBass = Math.pow(clamp01(bass * 1.58 + beatPulse * 0.42), 0.72);
      uMid = Math.pow(clamp01(mid * 0.85), 0.78);
      uTreble = Math.pow(clamp01(treble * 0.9), 0.84);
    }

    const uniformValues = {
      uTime: elapsed,
      uBass,
      uMid,
      uTreble,
      uBeat: beatPulse,
      uEnergy: Math.max(rms, beatPulse * 0.3),
      uPreset: preset,
      uIntensity: intensity / 100,
      uDepth: depth / 100,
      uPointScale: pointScale / 100,
      uSpeed: speed / 100,
      uTwist: twist / 100,
      uScatter: scatter / 100,
      uCoverRes: coverResolution,
      uColorBoost: colorBoost / 100,
      uBloomStrength: bloomStrength,
      uBloomSize: bloomSize,
    };

    for (const [key, value] of Object.entries(uniformValues)) {
      if (sharedUniforms[key]) sharedUniforms[key].value = value;
      if (bloomUniforms[key]) bloomUniforms[key].value = value;
    }

    syncCoverUniforms(sharedUniforms, frameMeta?.coverTextures);
    syncCoverUniforms(bloomUniforms, frameMeta?.coverTextures);
    copyUniformValues(bloomUniforms, sharedUniforms);
    bloomUniforms.uIsBloomLayer.value = 1;

    const silkPointer =
      preset === COVER_PRESET_SILK && pointerInteractionEnabled && mouseActive ? 1 : 0;
    sharedUniforms.uMouseActive.value = silkPointer;
    bloomUniforms.uMouseActive.value = silkPointer;
    sharedUniforms.uMouseXY.value.set(mouseX, mouseY);
    bloomUniforms.uMouseXY.value.set(mouseX, mouseY);
    sharedUniforms.uRippleTex.value = rippleManager.texture;
    bloomUniforms.uRippleTex.value = rippleManager.texture;

    if (preset === COVER_PRESET_VINYL) {
      const speedFactor = 0.35 + speed / 100;
      vinylSpin += safeDt * (0.4 + uBass * 0.09) * speedFactor;
      sharedUniforms.uVinylSpin.value = vinylSpin;
      bloomUniforms.uVinylSpin.value = vinylSpin;
    }

    if (Math.abs(camera.position.z - cameraDistance) > 0.01) {
      camera.position.z = cameraDistance;
    }
    if (Math.abs(camera.fov - cameraFovDeg) > 0.01) {
      camera.fov = cameraFovDeg;
      camera.updateProjectionMatrix();
    }

    if (autoRotateEnabled) {
      autoRotateYaw += safeDt * THREE.MathUtils.degToRad(autoRotateSpeedDeg);
      particleGroup.rotation.y = autoRotateYaw;
    }

    renderer.setClearColor(0x000000, 0);
    try {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn("[WaveDance] 封面粒子 Bloom 渲染失败，回退直绘", err);
      disposeComposer(composer);
      composer = null;
      lastComposerKey = "";
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    unbindPointerListeners();
    canvas.removeAttribute("data-no-drag");
    canvas.style.pointerEvents = prevPointerEvents;
    rippleManager.dispose();

    disposeComposer(composer);
    composer = null;
    if (bloomParticles) {
      particleGroup.remove(bloomParticles);
      particleGroup.remove(mainParticles);
    }
    scene.remove(particleGroup);
    geometry?.dispose();
    mainMaterial.dispose();
    bloomMaterial.dispose();
    dotTex.dispose();
    fallbackCoverTex.dispose();
    clock.stop();
  }

  return { render, dispose };
}

/** @param {number} v */
function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** @param {number} value @param {number} min @param {number} max @param {number} fallback */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {number} value @param {number} min @param {number} max @param {number} fallback */
function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
