import * as THREE from "three";

const GRADIENT_CACHE_KEY = "soundFieldBarGradientV1";

/**
 * 柱体垂直渐变：底暗、顶亮且更饱和，配合 InstancedMesh 实例色。
 * @returns {THREE.MeshBasicMaterial}
 */
export function createSoundFieldBarMaterial() {
  const material = new THREE.MeshBasicMaterial({
    toneMapped: false,
  });

  material.customProgramCacheKey = () => GRADIENT_CACHE_KEY;

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      "varying float vHeightNorm;\nvoid main() {",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "vHeightNorm = clamp(position.y, 0.0, 1.0);\n#include <project_vertex>",
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_pars_fragment>",
      "#include <color_pars_fragment>\nvarying float vHeightNorm;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
{
  float t = vHeightNorm;
  float tBright = pow(t, 0.58);
  float tColor = pow(t, 1.28);
  vec3 base = diffuseColor.rgb;

  vec3 foot = base * vec3(0.06, 0.05, 0.1);
  vec3 body = mix(foot, base, smoothstep(0.0, 0.42, tBright));
  vec3 vivid = base * (1.0 + tColor * 0.95);
  vivid += base * pow(t, 2.4) * 0.45;
  diffuseColor.rgb = mix(body, vivid, smoothstep(0.28, 1.0, tColor));
}`,
    );
  };

  return material;
}
