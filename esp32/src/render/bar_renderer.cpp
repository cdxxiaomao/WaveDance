#include "render/renderer.h"

#include <math.h>

#include "config.h"

void BarRenderer::update_eased(SpectrumState &state) {
  uint8_t n = state.point_count;
  if (n == 0) {
    n = 1;
  }

  for (uint8_t i = 0; i < n; ++i) {
    float target = state.targets[i] / 255.0f;
    float current = state.eased[i];
    float k = target > current ? BAR_ATTACK_K : BAR_DECAY_K;
    state.eased[i] += (target - current) * k;
    if (state.eased[i] < 0.0f) {
      state.eased[i] = 0.0f;
    }
    if (state.eased[i] > 1.0f) {
      state.eased[i] = 1.0f;
    }
  }
}

uint16_t BarRenderer::bar_color(float norm, uint8_t idx, uint8_t count) {
  float hue = (count <= 1) ? 0.55f : ((float)idx / (float)(count - 1));
  float sat = 0.85f;
  float val = 0.35f + norm * 0.65f;

  float c = val * sat;
  float x = c * (1.0f - fabsf(fmodf(hue * 6.0f, 2.0f) - 1.0f));
  float m = val - c;

  float r = 0, g = 0, b = 0;
  int sector = (int)(hue * 6.0f);
  switch (sector) {
    case 0:
      r = c;
      g = x;
      break;
    case 1:
      r = x;
      g = c;
      break;
    case 2:
      g = c;
      b = x;
      break;
    case 3:
      g = x;
      b = c;
      break;
    case 4:
      r = x;
      b = c;
      break;
    default:
      r = c;
      b = x;
      break;
  }

  uint8_t ri = (uint8_t)((r + m) * 255.0f);
  uint8_t gi = (uint8_t)((g + m) * 255.0f);
  uint8_t bi = (uint8_t)((b + m) * 255.0f);
  return (uint16_t)((ri >> 3) << 11 | (gi >> 2) << 5 | (bi >> 3));
}

void BarRenderer::render(Arduino_GFX *gfx, SpectrumState &state) {
  if (gfx == nullptr) {
    return;
  }

  const int w = gfx->width();
  const int h = gfx->height();
  const int area_h = BAR_AREA_HEIGHT;
  const int area_y = h - area_h;
  const int inner_h = area_h - BAR_TOP_MARGIN - BAR_BOTTOM_MARGIN;
  const int baseline_y = h - BAR_BOTTOM_MARGIN - 1;

  gfx->fillRect(0, area_y, w, area_h, RGB565_BLACK);

  uint8_t n = state.point_count;
  if (n == 0) {
    n = SPECTRUM_BUCKETS;
  }

  int total_gap = BAR_GAP_PX * (int)(n + 1);
  int bar_w = (w - total_gap) / (int)n;
  if (bar_w < 1) {
    bar_w = 1;
  }

  if (!state.has_frame) {
    // 待机：底部呼吸柱，便于确认 WaveDance 固件已运行（与出厂 Demo 区分）
    const float pulse =
        (sinf((float)millis() * 0.004f) + 1.0f) * 0.5f * 0.35f + 0.05f;
    for (uint8_t i = 0; i < n; ++i) {
      float v = pulse * (0.6f + 0.4f * sinf((float)i * 0.45f + (float)millis() * 0.003f));
      int bar_h = (int)(v * (float)inner_h);
      if (bar_h < 2) {
        bar_h = 2;
      }
      int x = BAR_GAP_PX + (int)i * (bar_w + BAR_GAP_PX);
      int y = baseline_y - bar_h + 1;
      gfx->fillRect(x, y, bar_w, bar_h, RGB565_DARKGREEN);
    }
  } else {
    update_eased(state);
    for (uint8_t i = 0; i < n; ++i) {
      float v = state.eased[i];
      if (v <= 0.001f) {
        continue;
      }

      int bar_h = (int)(v * (float)inner_h);
      if (bar_h < 1) {
        bar_h = 1;
      }

      int x = BAR_GAP_PX + (int)i * (bar_w + BAR_GAP_PX);
      int y = baseline_y - bar_h + 1;
      uint16_t color = bar_color(v, i, n);
      gfx->fillRect(x, y, bar_w, bar_h, color);
    }
  }

  // 顶部状态条
  gfx->fillRect(0, 0, w, 18, RGB565_BLACK);
  uint16_t dot = state.has_frame && !state.silence ? RGB565_GREEN : RGB565_ORANGE;
  gfx->fillCircle(8, 9, 4, dot);
  gfx->setCursor(18, 6);
  gfx->setTextSize(1);
  gfx->setTextColor(RGB565_DARKGREY);
  gfx->print(state.has_frame ? "LINK" : "WAIT");
}
