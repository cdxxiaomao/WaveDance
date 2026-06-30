import * as THREE from "three";
import { GLSL_NOISE_SIMPLEX_3D } from "../noiseGlsl.js";

const MAX_RIPPLES = 10;

const VERTEX_SHADER = /* glsl */ `
${GLSL_NOISE_SIMPLEX_3D}

#ifdef USE_INSTANCING
  attribute mat4 instanceMatrix;
#endif

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
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
varying float vHeightNorm;
varying float vElevation;
varying float vCenterDist;
varying float vRand;
varying float vRippleKick;
varying float vRippleSnare;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float rippleContribution(vec2 xz, vec4 ripple, out float kickAmt, out float snareAmt) {
  kickAmt = 0.0;
  snareAmt = 0.0;
  float signedStrength = ripple.w;
  float strength = abs(signedStrength);
  if (strength < 0.001) return 0.0;

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
  return total;
}

float computeElevation(vec3 instancePos, vec2 xz) {
  float centerDist = length(instancePos.xz) / max(uTerrainHalf, 0.001) * 25.0;
  vCenterDist = centerDist;

  float idleNoise = snoise(vec3(xz * 0.06, uTime * 0.22, 0.0)) * 0.35;
  float idleSin = sin(uTime * 0.55 + xz.x * 0.12 + xz.y * 0.09) * 0.22;
  float idleWave = (idleNoise + idleSin) * mix(1.0, 0.35, uEnergy * 1.6);
  float globalFalloff = 1.0 - smoothstep(18.0, 25.0, centerDist);

  float subBassLift = smoothstep(25.0, 0.0, centerDist) * uSubBass * 5.0;
  float bassCluster = snoise(vec3(xz * 0.18 + 4.0, uTime * 0.08, 0.0));
  bassCluster *= step(0.35, hash21(floor(xz * 0.35))) * 0.5 + 0.5;
  float bassLift = bassCluster * uBass * 4.0 * globalFalloff;
  float lowMidFlow = snoise(vec3(xz * 0.11, uTime * 0.05, 1.7)) * uLowMid * 2.5;
  float midRiver = sin((xz.x + xz.y) * 0.22 + uTime * 0.42) * uMid * 3.0;
  float outerMask = smoothstep(8.0, 22.0, centerDist);
  float highMidSpike = outerMask * step(0.82, hash21(floor(xz * 0.62))) * uHighMid * 2.5;
  float rnd = hash21(xz * 0.37 + floor(uTime * 8.0));
  float energySpike = step(0.99, rnd) * uEnergy * 2.2;

  float elevation = idleWave * mix(0.85, 0.25, uSmoothness);
  elevation += subBassLift + bassLift + lowMidFlow + midRiver + highMidSpike + energySpike;

  float kickRipple = 0.0;
  float snareRipple = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    float k = 0.0;
    float s = 0.0;
    elevation += rippleContribution(xz, uRipples[i], k, s);
    kickRipple += k;
    snareRipple += s;
  }
  vRippleKick = kickRipple;
  vRippleSnare = snareRipple;

  elevation = max(0.0, elevation - 0.2);
  elevation *= uAmplitude;
  return elevation;
}

void main() {
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
varying float vHeightNorm;
varying float vElevation;
varying float vCenterDist;
varying float vRand;
varying float vRippleKick;
varying float vRippleSnare;

void main() {
  bool isTop = vNormalW.y > 0.5;
  float warmMix = clamp(uWarmth + uBrightness * 0.25, 0.0, 1.0);
  vec3 coolCol = mix(uCoolCore, uCoolEdge, vHeightNorm);
  vec3 warmCol = mix(uWarmCore, uWarmEdge, vHeightNorm);
  vec3 base = mix(uBaseColor1, uBaseColor2, vHeightNorm);
  base = mix(base, mix(coolCol, warmCol, warmMix), 0.72);

  if (isTop) {
    float flash = step(0.92, vRand + uPresence * 0.35) * uPresence * 0.85;
    float edgeSpark = smoothstep(0.55, 1.0, vHeightNorm) * uBrilliance * 0.45;
    float twinkle = step(0.97, vRand + sin(uTime * 2.2 + vCenterDist) * 0.02) * uAir * 0.35;
    base += uWarmEdge * (flash + edgeSpark + twinkle) * uGlowIntensity;
    base += uRippleColor * vRippleKick * 0.22;
    base = mix(base, vec3(1.0), clamp(vRippleSnare * 0.65, 0.0, 0.85));
  } else {
    base *= 0.55 + vHeightNorm * 0.25;
  }

  base *= 0.65 + vElevation * 0.35 + uSharpness * 0.08;

  float dist = length(vWorldPos - uCameraPos);
  float fog = smoothstep(8.0, 28.0, dist);
  vec3 col = mix(base, uFogColor, fog * 0.82);
  float alpha = mix(0.52, 0.92, vHeightNorm) * (1.0 - fog * 0.35);
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
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
    uBaseColor1: { value: new THREE.Color("#3a3a42") },
    uBaseColor2: { value: new THREE.Color("#9a9aa8") },
    uFogColor: { value: new THREE.Color("#08080c") },
    uCoolCore: { value: new THREE.Color("#6a7080") },
    uCoolEdge: { value: new THREE.Color("#b8bcc8") },
    uWarmCore: { value: new THREE.Color("#888890") },
    uWarmEdge: { value: new THREE.Color("#d0d0d8") },
    uRippleColor: { value: new THREE.Color("#c8c8d8") },
    uGlowIntensity: { value: 0.55 },
    uCameraPos: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: true,
    toneMapped: false,
    defines: {
      USE_INSTANCING: "",
    },
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
