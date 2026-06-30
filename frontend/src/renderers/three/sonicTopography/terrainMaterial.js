import * as THREE from "three";
import { GLSL_NOISE_SIMPLEX_3D } from "../noiseGlsl.js";

const MAX_RIPPLES = 10;

const VERTEX_SHADER = /* glsl */ `
${GLSL_NOISE_SIMPLEX_3D}

uniform float uTime;
uniform float uTerrainHalf;
uniform float uSubBass;
uniform float uBass;
uniform float uLowMid;
uniform float uMid;
uniform float uHighMid;
uniform float uPresence;
uniform float uBrilliance;
uniform float uAir;
uniform float uWarmth;
uniform float uBrightness;
uniform float uSharpness;
uniform float uSmoothness;
uniform float uDensity;
uniform float uSpectralCentroid;
uniform float uEnergy;
uniform float uAmplitude;
uniform float uTreble;
uniform vec4 uRipples[${MAX_RIPPLES}];

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;
varying float vHeightNorm;
varying float vElevation;
varying float vCenterDist;
varying float vRadialDist;
varying float vRand;
varying float vRippleKick;
varying float vRippleSnare;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 rippleContribution(vec2 xz, vec4 ripple) {
  float kickAmt = 0.0;
  float snareAmt = 0.0;
  float signedStrength = ripple.w;
  float strength = abs(signedStrength);
  if (strength < 0.001) return vec3(0.0);

  bool isSnare = signedStrength < 0.0;
  vec2 delta = xz - ripple.xy;
  float dist = length(delta);
  float age = max(0.0, uTime - ripple.z);
  float speed = isSnare ? 14.5 : 9.0;
  float ringWidth = isSnare ? 1.15 : 2.4;
  float radius = age * speed;
  float ring = exp(-pow((dist - radius) / ringWidth, 2.0)) * strength * exp(-age * (isSnare ? 1.85 : 1.35));
  float bulge = exp(-dist * (isSnare ? 0.12 : 0.08)) * strength * exp(-age * (isSnare ? 2.2 : 1.8)) * (isSnare ? 0.22 : 0.35);
  float total = ring + bulge;
  if (isSnare) snareAmt = total;
  else kickAmt = total;
  return vec3(total, kickAmt, snareAmt);
}

float computeElevation(vec3 instancePos, vec2 xz) {
  float radialDist = length(instancePos.xz);
  vRadialDist = radialDist;
  vCenterDist = radialDist;

  float globalFalloff = smoothstep(60.0, 30.0, radialDist);

  vec2 movingPos = xz * 0.05 + vec2(uTime * 0.1, uTime * 0.05);
  float baseNoise = snoise(vec3(movingPos, 0.0)) * 0.5 + 0.5;
  float wave = sin(xz.x * 0.15 + xz.y * 0.1 - uTime * 0.6) * 0.5 + 0.5;
  float idleWave = mix(baseNoise, wave, uSmoothness * 0.5 + 0.2) * 0.8 * globalFalloff;

  float subBassLift = smoothstep(25.0, 0.0, radialDist) * uSubBass * 5.0;
  float bassNoise = snoise(vec3(xz * 0.1 - vec2(0.0, uTime * 0.2), 0.0));
  float bassRegion = smoothstep(35.0, 5.0, radialDist + bassNoise * 5.0);
  float bassLift = uBass * bassRegion * (step(0.35, hash21(floor(xz * 0.35))) * 0.5 + 0.5) * 4.0;
  float lowMidFlow = snoise(vec3(xz * 0.05 + vec2(uTime * 0.1, 0.0), 0.0)) * 0.5 + 0.5;
  float lowMidLift = uLowMid * lowMidFlow * 2.5;
  float midRiver = max(0.0, sin(xz.x * 0.2 + xz.y * 0.2 + uTime * 2.0)) * uMid * 3.0;
  float highMidRegion = smoothstep(10.0, 45.0, radialDist);
  float highMidSpike = 0.0;
  if (hash21(xz * 0.19) > 0.82) {
    highMidSpike = uHighMid * highMidRegion * hash21(floor(xz * 0.62)) * 2.5;
  }
  float rnd = hash21(xz * 0.37);
  float energySpike = step(0.99, rnd) * uEnergy * 5.0;

  float elevation = idleWave;
  elevation += subBassLift + bassLift + lowMidLift + midRiver + highMidSpike + energySpike;
  elevation *= globalFalloff;

  float kickRipple = 0.0;
  float snareRipple = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 rippleVals = rippleContribution(xz, uRipples[i]);
    elevation += rippleVals.x;
    kickRipple += rippleVals.y;
    snareRipple += rippleVals.z;
  }
  vRippleKick = kickRipple;
  vRippleSnare = snareRipple;

  elevation = max(0.0, elevation - 0.2);
  elevation *= uAmplitude;
  return elevation;
}

void main() {
  vUv = uv;
  vec3 instancePos = vec3(0.0);
  #ifdef USE_INSTANCING
    instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #endif

  vec2 xz = instancePos.xz;
  vRand = hash21(xz * 0.19);
  float elevation = computeElevation(instancePos, xz);
  vElevation = elevation;

  float yNorm = position.y;
  vec3 transformed = vec3(position.x, yNorm * (1.0 + elevation), position.z);
  vHeightNorm = yNorm;

  vec4 worldPos4;
  #ifdef USE_INSTANCING
    worldPos4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    worldPos4 = modelMatrix * vec4(transformed, 1.0);
  #endif
  vWorldPos = worldPos4.xyz;

  vec3 upNormal = vec3(0.0, 1.0, 0.0);
  #ifdef USE_INSTANCING
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * upNormal);
  #else
    vNormalW = normalize(mat3(modelMatrix) * upNormal);
  #endif

  vec4 mvPosition = viewMatrix * worldPos4;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uWarmth;
uniform float uBrightness;
uniform float uSharpness;
uniform float uPresence;
uniform float uBrilliance;
uniform float uAir;
uniform float uGlowIntensity;
uniform vec3 uBaseColor1;
uniform vec3 uBaseColor2;
uniform vec3 uFogColor;
uniform vec3 uCoolCore;
uniform vec3 uCoolEdge;
uniform vec3 uWarmCore;
uniform vec3 uWarmEdge;
uniform vec3 uRippleColor;
uniform vec3 uCameraPos;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;
varying float vHeightNorm;
varying float vElevation;
varying float vCenterDist;
varying float vRadialDist;
varying float vRand;
varying float vRippleKick;
varying float vRippleSnare;

void main() {
  bool isTop = vNormalW.y > 0.5;
  float centerDist = vRadialDist;
  float distFade = 1.0 - smoothstep(40.0, 75.0, centerDist);
  float normElevation = clamp(vElevation / 8.0, 0.0, 1.0);

  float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist / 80.0));
  vec3 zoneCore = mix(uCoolCore, uWarmCore, warmBlend);
  vec3 zoneEdge = mix(uCoolEdge, uWarmEdge, warmBlend);
  vec3 targetGlow = mix(zoneCore, zoneEdge, fract(vRand * 11.0));

  vec3 brightCool = mix(uCoolCore, vec3(1.0), 0.24);
  targetGlow = mix(targetGlow, brightCool, uBrightness * 0.6);

  vec3 currentGlow = mix(uBaseColor2, targetGlow, normElevation) * uGlowIntensity * distFade;
  currentGlow = mix(currentGlow, uRippleColor, clamp(vRippleKick, 0.0, 1.0));
  currentGlow = mix(currentGlow, vec3(1.0), clamp(vRippleSnare, 0.0, 1.0));

  vec3 bodyColor = mix(uBaseColor1, uBaseColor2, vHeightNorm * distFade);
  vec3 col;

  if (isTop) {
    float topIntensity = smoothstep(0.0, 0.4, normElevation);
    float twinkleDistFalloff = smoothstep(60.0, 30.0, centerDist);
    float twinkleMultiplier = mix(twinkleDistFalloff, 1.0, smoothstep(0.01, 0.1, normElevation));

    if (fract(vRand * 31.0) > 0.95 && normElevation < 0.1) {
      topIntensity += uAir * 2.0 * twinkleMultiplier;
    }

    col = mix(uBaseColor2, currentGlow, topIntensity);

    float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
    float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
    float edge = min(edgeX + edgeY, 1.0);
    col += currentGlow * edge * 0.8 * (topIntensity + 0.3);

    float flashChance = smoothstep(0.3, 1.0, uPresence);
    if (fract(vRand * 53.0) > 0.98 - flashChance * 0.1) {
      float flashSync = sin(uTime * 40.0 + vRand * 100.0) * 0.5 + 0.5;
      col += mix(vec3(1.0), vec3(0.5, 1.0, 1.0), vRand) * flashSync * uPresence * (1.0 + uSharpness * 2.0) * twinkleMultiplier;
    }
    if (edge > 0.5 && fract(vRand * 89.0 + uTime * 2.0) > 0.98) {
      col += vec3(1.0) * uBrilliance * 3.0 * twinkleMultiplier;
    }
  } else {
    float verticalFalloff = mix(1.0, 3.0, uSharpness);
    float sideGlow = smoothstep(0.5 / verticalFalloff, 0.0, 1.0 - vHeightNorm) * normElevation;
    if (normElevation < 0.02) sideGlow = 0.0;
    col = mix(bodyColor, currentGlow, sideGlow * 1.5);
    float rimGlow = smoothstep(0.03, 0.0, 1.0 - vHeightNorm) * normElevation;
    col += currentGlow * rimGlow;
  }

  col += uRippleColor * clamp(vRippleKick, 0.0, 1.0) * 0.6;
  col += vec3(1.0) * clamp(vRippleSnare, 0.0, 1.0) * 1.2;

  float aerialFog = smoothstep(30.0, 65.0, centerDist);
  vec3 atmosphericColor = mix(uBaseColor1, uBaseColor2, 0.4);
  col = mix(col, atmosphericColor, aerialFog * 0.35);

  float alphaFade = 1.0 - smoothstep(55.0, 78.0, centerDist);
  float alphaBlend = 1.0 - alphaFade;
  col = mix(col, uFogColor, alphaBlend * 0.45);

  gl_FragColor = vec4(col, alphaFade);
}
`;

/** @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, { value: unknown }> }} */
export function createTerrainMaterial() {
  /** @type {THREE.Vector4[]} */
  const rippleArray = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0));

  const uniforms = {
    uTime: { value: 0 },
    uTerrainHalf: { value: 84 },
    uSubBass: { value: 0 },
    uBass: { value: 0 },
    uLowMid: { value: 0 },
    uMid: { value: 0 },
    uHighMid: { value: 0 },
    uPresence: { value: 0 },
    uBrilliance: { value: 0 },
    uAir: { value: 0 },
    uWarmth: { value: 0 },
    uBrightness: { value: 0 },
    uSharpness: { value: 0 },
    uSmoothness: { value: 0.7 },
    uDensity: { value: 0 },
    uSpectralCentroid: { value: 0 },
    uEnergy: { value: 0 },
    uAmplitude: { value: 1 },
    uTreble: { value: 0 },
    uRipples: { value: rippleArray },
    uBaseColor1: { value: new THREE.Color(0.02, 0.02, 0.02) },
    uBaseColor2: { value: new THREE.Color(0.06, 0.06, 0.06) },
    uFogColor: { value: new THREE.Color(0.02, 0.02, 0.02) },
    uCoolCore: { value: new THREE.Color(0.9, 0.9, 0.9) },
    uCoolEdge: { value: new THREE.Color(0.4, 0.4, 0.4) },
    uWarmCore: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uWarmEdge: { value: new THREE.Color(0.7, 0.7, 0.7) },
    uRippleColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uGlowIntensity: { value: 0.8 },
    uCameraPos: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  return { material, uniforms };
}

/**
 * @param {Record<string, { value: unknown }>} uniforms
 * @param {Record<string, number>} audio
 */
export function updateTerrainAudioUniforms(uniforms, audio) {
  uniforms.uSubBass.value = audio.subBass ?? 0;
  uniforms.uBass.value = audio.bass ?? 0;
  uniforms.uLowMid.value = audio.lowMid ?? 0;
  uniforms.uMid.value = audio.mid ?? 0;
  uniforms.uHighMid.value = audio.highMid ?? 0;
  uniforms.uPresence.value = audio.presence ?? 0;
  uniforms.uBrilliance.value = audio.brilliance ?? 0;
  uniforms.uAir.value = audio.air ?? 0;
  uniforms.uWarmth.value = audio.warmth ?? 0;
  uniforms.uBrightness.value = audio.brightness ?? 0;
  uniforms.uSharpness.value = audio.sharpness ?? 0;
  uniforms.uSmoothness.value = audio.smoothness ?? 0.7;
  uniforms.uDensity.value = audio.density ?? 0;
  uniforms.uSpectralCentroid.value = audio.spectralCentroid ?? 0;
  uniforms.uEnergy.value = audio.energy ?? 0;
  uniforms.uTreble.value = audio.treble ?? 0;
}

export { MAX_RIPPLES };
