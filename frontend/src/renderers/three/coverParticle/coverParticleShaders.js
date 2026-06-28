import { GLSL_NOISE_SIMPLEX_3D } from "../noiseGlsl.js";

const VERTEX_BODY = /* glsl */ `
attribute vec2 aUv;
attribute float aRand;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uEnergy;
uniform float uPreset;
uniform float uIntensity;
uniform float uDepth;
uniform float uPointScale;
uniform float uSpeed;
uniform float uTwist;
uniform float uScatter;
uniform float uCoverRes;
uniform float uVinylSpin;
uniform float uColorMixT;
uniform float uHasCover;
uniform float uHasDepth;
uniform float uAiBoost;
uniform float uIsBloomLayer;
uniform float uBloomSize;

uniform sampler2D uCoverTex;
uniform sampler2D uPrevCoverTex;
uniform sampler2D uEdgeTex;
uniform sampler2D uRippleTex;

uniform vec2 uMouseXY;
uniform float uMouseActive;

varying vec3 vColor;
varying float vBright;
varying float vAlpha;
varying float vRipple;

vec2 rippleSumAt(vec2 worldXY) {
  vec2 sum = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 r = texture2D(uRippleTex, vec2((float(i) + 0.5) / 12.0, 0.5));
    if (r.w < 0.001) continue;
    vec2 delta = worldXY - r.xy;
    float dist = length(delta);
    float age = r.z;
    float str = r.w;
    float width = 0.18 + age * 0.24;
    float bulge = exp(-(dist * dist) / (width * width)) * str * exp(-age * 1.75);
    float ringR = age * 1.35;
    float ring = exp(-pow((dist - ringR) / 0.085, 2.0)) * str * 0.55 * exp(-age * 1.15);
    sum.x += bulge + ring * 0.38;
    sum.y += max(bulge, ring * 0.52);
  }
  return sum;
}

vec2 safeCoverUv(vec2 uv) {
  return clamp(uv, vec2(0.0012), vec2(0.9988));
}

vec3 defaultCoverGradient(vec2 uv) {
  return mix(vec3(0.45, 0.28, 0.82), vec3(0.18, 0.42, 0.92), uv.x * 0.62 + uv.y * 0.38);
}

vec3 sampleCoverAt(vec2 uv) {
  if (uHasCover < 0.5) {
    return defaultCoverGradient(uv);
  }
  vec2 su = safeCoverUv(uv);
  vec3 newCol = texture2D(uCoverTex, su).rgb;
  vec3 prevCol = texture2D(uPrevCoverTex, su).rgb;
  return mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
}

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void applySilk(inout vec3 pos, vec2 uv, float K, float t, inout vec3 coverCol, inout float rippleAmp) {
  coverCol = sampleCoverAt(uv);
  vec2 rip = rippleSumAt(pos.xy);
  float rippleZ = rip.x;
  rippleAmp = rip.y;

  float midDisp = snoise(vec3(pos.xy * 0.85, t * 0.31 + aRand * 0.02)) * uMid * 0.55 * K;
  float trebleJ = snoise(vec3(pos.xy * 2.4 + 17.0, t * 0.72 + aRand)) * uTreble * 0.18 * K;
  float bassBreath = snoise(vec3(pos.xy * 0.42, t * 0.18)) * uBass * 0.42 * K;
  float depthVal = 0.0;
  if (uHasDepth > 0.5) {
    depthVal = texture2D(uEdgeTex, safeCoverUv(uv)).r;
  }
  float depthZ = (depthVal - 0.5) * uAiBoost * uDepth * 1.40 * uHasDepth;
  pos.z += rippleZ * 1.30 + midDisp + trebleJ + bassBreath + depthZ;

  if (uTwist > 0.001) {
    float twistAmt = uTwist * pos.z * 0.85;
    float cs = cos(twistAmt);
    float sn = sin(twistAmt);
    pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;
  }
}

void applyVinyl(inout vec3 pos, vec2 uv, float K, inout vec3 coverCol, inout float alpha) {
  vec2 p = (uv - 0.5) * 5.12;
  float cs = cos(uVinylSpin);
  float sn = sin(uVinylSpin);
  p = mat2(cs, -sn, sn, cs) * p;
  float d = length(p);
  float recordR = 2.46;
  float coverR = 1.18;
  float hiResGuard = smoothstep(1.08, 1.55, uCoverRes);
  float edgeGuard = mix(1.0, 0.38, hiResGuard);
  float grooveGuard = mix(1.0, 0.48, hiResGuard);
  float beatGuard = mix(1.0, 0.36, hiResGuard);

  if (d > recordR + 0.08) {
    pos.z = -12.0;
    alpha = 0.0;
    coverCol = vec3(0.0);
    return;
  }

  if (d < coverR) {
    vec2 coverUv = p / (coverR * 2.0) + 0.5;
    if (length(coverUv - 0.5) > 0.5) {
      alpha = 0.0;
      pos.z = -12.0;
      return;
    }
    coverCol = sampleCoverAt(coverUv);
    float border = exp(-pow((d - coverR) / 0.064, 2.0));
    coverCol += vec3(0.92) * border * 0.35;
    pos = vec3(p.x, p.y, 0.040 + border * 0.026 + uBeat * 0.018 * beatGuard);
    return;
  }

  float groove = sin((d - coverR) * 98.0) * 0.006 + sin((d - coverR) * 58.0) * 0.004;
  groove *= grooveGuard;
  float angle = atan(p.y, p.x);
  float tick = step(0.92, hash11(angle * 38.0 + d * 72.0 + uTime * 0.4)) * uTreble * 0.55;
  vec3 grooveCol = mix(vec3(0.05, 0.05, 0.06), sampleCoverAt(uv), 0.32);
  grooveCol += vec3(tick * 0.85);
  float rim = smoothstep(recordR - 0.05, recordR, d);
  grooveCol = mix(grooveCol, vec3(0.88), rim * 0.55);
  coverCol = grooveCol;
  pos = vec3(p.x, p.y, groove + uBass * 0.022 * K * edgeGuard);
}

void main() {
  vec3 pos = position;
  vec2 uv = aUv;
  float alpha = 1.0;
  vec3 coverCol = vec3(0.0);
  float K = uIntensity * 1.6;
  float t = uTime * (0.35 + uSpeed * 1.15);
  float rippleAmp = 0.0;

  if (uPreset < 0.5) {
    applySilk(pos, uv, K, t, coverCol, rippleAmp);
  } else if (uPreset > 3.5 && uPreset < 4.5) {
    applyVinyl(pos, uv, K, coverCol, alpha);
  } else {
    coverCol = sampleCoverAt(uv);
  }

  if (uScatter > 0.001) {
    vec2 jitter = vec2(
      hash11(aRand * 91.17 + uTime) - 0.5,
      hash11(aRand * 37.42 + uTime * 1.1) - 0.5
    );
    pos.xy += jitter * uScatter * 0.22;
  }

  if (uPreset < 0.5 && uMouseActive > 0.5) {
    vec2 md = pos.xy - uMouseXY;
    float mdLen = length(md);
    if (mdLen < 1.0) {
      float push = 1.0 - mdLen;
      pos.z += push * push * 0.55;
    }
  }

  vColor = coverCol;
  vRipple = rippleAmp;
  vAlpha = alpha;

  if (uPreset > 3.5 && uPreset < 4.5) {
    vBright = 0.94 + vRipple * 0.64 + uBeat * 0.16;
  } else {
    float edgeBoost = 0.0;
    if (uHasDepth > 0.5) {
      edgeBoost = texture2D(uEdgeTex, safeCoverUv(uv)).g * 0.35;
    }
    vBright = 0.82 + vRipple * 0.55 + uBass * 0.35 + uBeat * 0.12 + edgeBoost;
  }

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 36.0 / max(0.5, -mvPos.z) * (0.55 + uPointScale * 0.95);
  float edgeBoostSize = 0.0;
  if (uHasDepth > 0.5) {
    edgeBoostSize = texture2D(uEdgeTex, safeCoverUv(uv)).g * 0.22;
  }
  float audioBoost = 1.0 + vRipple * 0.70 + edgeBoostSize + uBeat * 0.30 + uEnergy * 0.08;
  float sz = clamp(depthSize * audioBoost, 1.05, 4.95);
  if (uIsBloomLayer > 0.5) {
    sz *= uBloomSize;
  }
  gl_PointSize = sz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const FRAGMENT_MAIN = /* glsl */ `
precision highp float;

uniform sampler2D uDotTex;
uniform float uAlpha;
uniform float uParticleDim;
uniform float uColorBoost;

varying vec3 vColor;
varying float vBright;
varying float vAlpha;
varying float vRipple;

void main() {
  if (vAlpha < 0.001) discard;

  vec4 dotSample = texture2D(uDotTex, gl_PointCoord);
  if (dotSample.a < 0.02) discard;

  vec3 col = vColor * (vBright + uColorBoost * 0.18);
  col += vec3(vRipple * 0.35);

  float dist = length(gl_PointCoord - vec2(0.5));
  float rim = smoothstep(0.5, 0.08, dist);
  col *= 0.72 + rim * 0.38;

  float alpha = dotSample.a * uAlpha * uParticleDim * vAlpha;
  gl_FragColor = vec4(col, alpha);
}
`;

const FRAGMENT_BLOOM = /* glsl */ `
precision highp float;

uniform sampler2D uDotTex;
uniform float uAlpha;
uniform float uParticleDim;
uniform float uBloomStrength;
uniform float uColorBoost;

varying vec3 vColor;
varying float vBright;
varying float vAlpha;
varying float vRipple;

void main() {
  if (vAlpha < 0.001) discard;

  vec4 dotSample = texture2D(uDotTex, gl_PointCoord);
  if (dotSample.a < 0.02) discard;

  vec3 col = vColor * (0.55 + vBright * 0.62 + uColorBoost * 0.12);
  col += vec3(vRipple * 0.25);

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomKeep = mix(0.08, 1.0, smoothstep(0.02, 0.12, luma));
  float soft = dotSample.a;
  float alpha = soft * uAlpha * uBloomStrength * uParticleDim * vAlpha * 0.55 * bloomKeep;
  gl_FragColor = vec4(col, alpha);
}
`;

export const COVER_PARTICLE_VERTEX_SHADER = `${GLSL_NOISE_SIMPLEX_3D}\n${VERTEX_BODY}`;
export const COVER_PARTICLE_FRAGMENT_MAIN = FRAGMENT_MAIN;
export const COVER_PARTICLE_FRAGMENT_BLOOM = FRAGMENT_BLOOM;
