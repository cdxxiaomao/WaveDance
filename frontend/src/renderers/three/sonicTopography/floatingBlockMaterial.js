import * as THREE from "three";

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uEnergy;
uniform float uTreble;

varying vec2 vUv;
varying vec3 vNormalW;
varying float vElevation;
varying float vRadialDist;
varying vec2 vRippleAnim;
varying float vHeightNorm;
varying float vSeed;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vUv = uv;

  vec3 instancePos = vec3(0.0);
  #ifdef USE_INSTANCING
    instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #endif

  vRadialDist = length(instancePos.xz);
  float seed = hash21(instancePos.xz * 0.17);
  vSeed = seed;

  float pulse = uIntensity * (0.35 + uEnergy * 0.65 + uTreble * 0.25);
  vRippleAnim = vec2(clamp(pulse * 0.8, 0.0, 1.0), clamp(pulse * 0.3, 0.0, 1.0));
  vElevation = pulse * 20.0;

  float speedNorm = uSpeed * 0.01;
  float bob = sin(uTime * speedNorm + seed * 6.283) * 0.35;
  bob += sin(uTime * speedNorm * 1.7 + seed * 12.0) * 0.12;
  float audioLift = (uEnergy * 0.6 + uTreble * 0.4) * seed * 0.9;
  float sizeT = mix(uMinSize, uMaxSize, seed) * 0.01;
  float scale = sizeT * mix(0.35, 1.0, uIntensity);

  vec3 transformed = position * scale;
  transformed.y += bob + audioLift;
  vHeightNorm = clamp(position.y + 0.5, 0.0, 1.0);

  vec4 worldPos4;
  #ifdef USE_INSTANCING
    worldPos4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    worldPos4 = modelMatrix * vec4(transformed, 1.0);
  #endif

  vec3 upNormal = vec3(0.0, 1.0, 0.0);
  #ifdef USE_INSTANCING
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * upNormal);
  #else
    vNormalW = normalize(mat3(modelMatrix) * upNormal);
  #endif

  gl_Position = projectionMatrix * viewMatrix * worldPos4;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uPresence;
uniform float uBrilliance;
uniform float uAir;
uniform float uWarmth;
uniform float uBrightness;
uniform float uSharpness;
uniform float uGlowIntensity;
uniform vec3 uBaseColor1;
uniform vec3 uBaseColor2;
uniform vec3 uFogColor;
uniform vec3 uCoolCore;
uniform vec3 uCoolEdge;
uniform vec3 uWarmCore;
uniform vec3 uWarmEdge;
uniform vec3 uRippleColor;

varying vec2 vUv;
varying float vElevation;
varying float vRadialDist;
varying vec2 vRippleAnim;
varying float vHeightNorm;
varying float vSeed;

void main() {
  float centerDist = vRadialDist;
  float normElevation = clamp(vElevation / 8.0, 0.0, 1.0);

  float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist / 80.0));
  vec3 zoneCore = mix(uCoolCore, uWarmCore, warmBlend);
  vec3 zoneEdge = mix(uCoolEdge, uWarmEdge, warmBlend);
  vec3 targetGlow = mix(zoneCore, zoneEdge, fract(vSeed * 11.0));

  float distFade = 1.0 - smoothstep(40.0, 75.0, centerDist);
  vec3 brightCool = mix(uCoolCore, vec3(1.0), 0.24);
  targetGlow = mix(targetGlow, brightCool, uBrightness * 0.6);

  vec3 currentGlow = mix(uBaseColor2, targetGlow, normElevation) * uGlowIntensity * distFade;
  currentGlow = mix(currentGlow, uRippleColor, vRippleAnim.x);
  currentGlow = mix(currentGlow, vec3(1.0), vRippleAnim.y);

  float topIntensity = smoothstep(0.0, 0.4, normElevation);
  float twinkleDistFalloff = smoothstep(60.0, 30.0, centerDist);
  float twinkleMultiplier = mix(twinkleDistFalloff, 1.0, smoothstep(0.01, 0.1, normElevation));

  vec3 col = mix(uBaseColor2, currentGlow, topIntensity);

  float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
  float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
  float edge = min(edgeX + edgeY, 1.0);
  col += currentGlow * edge * 0.8 * (topIntensity + 0.3);

  float flashChance = smoothstep(0.3, 1.0, uPresence);
  if (fract(vSeed * 53.0) > 0.98 - flashChance * 0.1) {
    float flashSync = sin(uTime * 40.0 + vSeed * 100.0) * 0.5 + 0.5;
    col += mix(vec3(1.0), vec3(0.5, 1.0, 1.0), vSeed) * flashSync * uPresence * (1.0 + uSharpness * 2.0) * twinkleMultiplier;
  }
  if (edge > 0.5 && fract(vSeed * 89.0 + uTime * 2.0) > 0.98) {
    col += vec3(1.0) * uBrilliance * 3.0 * twinkleMultiplier;
  }

  col += uRippleColor * vRippleAnim.x * 0.6;
  col += vec3(1.0) * vRippleAnim.y * 1.2;

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
export function createFloatingBlockMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0.55 },
    uSpeed: { value: 77 },
    uMinSize: { value: 9 },
    uMaxSize: { value: 26 },
    uEnergy: { value: 0 },
    uTreble: { value: 0 },
    uPresence: { value: 0 },
    uBrilliance: { value: 0 },
    uAir: { value: 0 },
    uWarmth: { value: 0 },
    uBrightness: { value: 0 },
    uSharpness: { value: 0 },
    uGlowIntensity: { value: 0.8 },
    uBaseColor1: { value: new THREE.Color(0.02, 0.02, 0.02) },
    uBaseColor2: { value: new THREE.Color(0.06, 0.06, 0.06) },
    uFogColor: { value: new THREE.Color(0.02, 0.02, 0.02) },
    uCoolCore: { value: new THREE.Color(0.9, 0.9, 0.9) },
    uCoolEdge: { value: new THREE.Color(0.4, 0.4, 0.4) },
    uWarmCore: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uWarmEdge: { value: new THREE.Color(0.7, 0.7, 0.7) },
    uRippleColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
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
export function updateFloatingBlockAudioUniforms(uniforms, audio) {
  uniforms.uEnergy.value = audio.energy ?? 0;
  uniforms.uTreble.value = audio.treble ?? 0;
  uniforms.uWarmth.value = audio.warmth ?? 0;
  uniforms.uBrightness.value = audio.brightness ?? 0;
  uniforms.uPresence.value = audio.presence ?? 0;
  uniforms.uBrilliance.value = audio.brilliance ?? 0;
  uniforms.uAir.value = audio.air ?? 0;
  uniforms.uSharpness.value = audio.sharpness ?? 0;
}
