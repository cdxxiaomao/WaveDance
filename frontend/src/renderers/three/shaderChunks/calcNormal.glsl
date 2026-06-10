// 有限差分法线（需同 shader 内已定义 mapScene(vec3)）

vec3 calcNormal(vec3 p) {
  const float e = 0.0015;
  vec2 ev = vec2(e, 0.0);
  return normalize(vec3(
    mapScene(p + ev.xyy) - mapScene(p - ev.xyy),
    mapScene(p + ev.yxy) - mapScene(p - ev.yxy),
    mapScene(p + ev.yyx) - mapScene(p - ev.yyx)
  ));
}
