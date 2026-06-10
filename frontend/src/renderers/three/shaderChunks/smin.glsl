// smooth-min 融合（从 liquidBlobRenderer 复制，供 Phase 30~37 新 renderer 粘贴进 shader）
// 注意：请勿 import 回 liquidBlobRenderer；母版保持不变。

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
