import * as THREE from "three";

const VERTEX_SHADER = /* glsl */ `
#ifdef USE_INSTANCING
  attribute mat4 instanceMatrix;
#endif

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uEnergy;
uniform float uTreble;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vHeightNorm;
varying float vSeed;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 instancePos = vec3(0.0);
  #ifdef USE_INSTANCING
    instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #endif

  float seed = hash21(instancePos.xz * 0.17);
  vSeed = seed;

  float speedNorm = uSpeed * 0.01;
  float bob = sin(uTime * speedNorm + seed * 6.283) * 0.35;
  bob += sin(uTime * speedNorm * 1.7 + seed * 12.0) * 0.12;
  float audioLift = (uEnergy * 0.6 + uTreble * 0.4) * seed * 0.9;
  float sizeT = mix(uMinSize, uMaxSize, seed) * 0.01;
  float scale = sizeT * mix(0.35, 1.0, uIntensity);

  vec3 transformed = position * scale;
  transformed.y += bob + audioLift;

  vec4 worldPos4;
  #ifdef USE_INSTANCING
    worldPos4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    worldPos4 = modelMatrix * vec4(transformed, 1.0);
  #endif
  vWorldPos = worldPos4.xyz;
  vHeightNorm = clamp(position.y + 0.5, 0.0, 1.0);

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
uniform float uWarmth;
uniform float uBrightness;
uniform float uGlowIntensity;
uniform vec3 uBaseColor1;
uniform vec3 uBaseColor2;
uniform vec3 uFogColor;
uniform vec3 uCoolCore;
uniform vec3 uCoolEdge;
uniform vec3 uWarmCore;
uniform vec3 uWarmEdge;
uniform vec3 uCameraPos;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vHeightNorm;
varying float vSeed;

void main() {
  bool isTop = vNormalW.y > 0.5;
  float warmMix = clamp(uWarmth + uBrightness * 0.2, 0.0, 1.0);
  vec3 coolCol = mix(uCoolCore, uCoolEdge, vHeightNorm);
  vec3 warmCol = mix(uWarmCore, uWarmEdge, vHeightNorm);
  vec3 base = mix(uBaseColor1, uBaseColor2, vHeightNorm);
  base = mix(base, mix(coolCol, warmCol, warmMix), 0.68);

  if (isTop) {
    float twinkle = step(0.94, vSeed + sin(uTime * 2.5 + vSeed * 8.0) * 0.03) * uGlowIntensity * 0.4;
    base += uWarmEdge * twinkle;
  } else {
    base *= 0.5 + vHeightNorm * 0.2;
  }

  float dist = length(vWorldPos - uCameraPos);
  float fog = smoothstep(10.0, 32.0, dist);
  vec3 col = mix(base, uFogColor, fog * 0.78);
  float alpha = mix(0.38, 0.82, vHeightNorm) * mix(0.45, 1.0, uGlowIntensity) * (1.0 - fog * 0.3);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
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
    uWarmth: { value: 0 },
    uBrightness: { value: 0 },
    uGlowIntensity: { value: 0.55 },
    uBaseColor1: { value: new THREE.Color("#3a3a42") },
    uBaseColor2: { value: new THREE.Color("#9a9aa8") },
    uFogColor: { value: new THREE.Color("#08080c") },
    uCoolCore: { value: new THREE.Color("#6a7080") },
    uCoolEdge: { value: new THREE.Color("#b8bcc8") },
    uWarmCore: { value: new THREE.Color("#888890") },
    uWarmEdge: { value: new THREE.Color("#d0d0d8") },
    uCameraPos: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
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
export function updateFloatingBlockAudioUniforms(uniforms, audio) {
  uniforms.uEnergy.value = audio.energy ?? 0;
  uniforms.uTreble.value = audio.treble ?? 0;
  uniforms.uWarmth.value = audio.warmth ?? 0;
  uniforms.uBrightness.value = audio.brightness ?? 0;
}
