// 2~4 stop 色带混合（供油彩大理石、星云等模式复制进 fragment shader）

vec3 mixColor2(vec3 c0, vec3 c1, float t) {
  return mix(c0, c1, clamp(t, 0.0, 1.0));
}

vec3 mixColor3(vec3 c0, vec3 c1, vec3 c2, float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return mix(c0, c1, t * 2.0);
  return mix(c1, c2, (t - 0.5) * 2.0);
}

vec3 mixColor4(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.333333) return mix(c0, c1, t * 3.0);
  if (t < 0.666667) return mix(c1, c2, (t - 0.333333) * 3.0);
  return mix(c2, c3, (t - 0.666667) * 3.0);
}

// count: 2~4；超出范围时 clamp 到有效 stop
vec3 mixColorStops(vec3 stops[4], int count, float t) {
  t = clamp(t, 0.0, 1.0);
  if (count <= 1) return stops[0];
  if (count == 2) return mixColor2(stops[0], stops[1], t);
  if (count == 3) return mixColor3(stops[0], stops[1], stops[2], t);
  return mixColor4(stops[0], stops[1], stops[2], stops[3], t);
}
