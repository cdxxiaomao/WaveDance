#include "render/renderer.h"

#include <math.h>

#include "config.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

void RadialRenderer::update_eased(SpectrumState &state) {
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

uint16_t RadialRenderer::bar_color(float norm, uint8_t idx, uint8_t count) {
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

void RadialRenderer::render(Arduino_GFX *gfx, SpectrumState &state, const char *mode_name) {
  if (gfx == nullptr) {
    return;
  }

  const int w = gfx->width();
  const int h = gfx->height();
  const int area_y = 24;
  const int area_h = h - area_y - 20;
  gfx->fillRect(0, area_y, w, area_h, RGB565_BLACK);

  const int cx = w / 2;
  const int cy = area_y + area_h / 2 + 8;
  const int inner_r = 18;
  const int outer_max = (w < area_h ? w : area_h) / 2 - 24;
  if (outer_max <= inner_r + 4) {
    draw_status_bar(gfx, state, mode_name);
    return;
  }

  uint8_t n = state.point_count;
  if (n == 0) {
    n = SPECTRUM_BUCKETS;
  }

  if (!state.has_frame) {
    const float pulse =
        (sinf((float)millis() * 0.004f) + 1.0f) * 0.5f * 0.35f + 0.05f;
    for (uint8_t i = 0; i < n; ++i) {
      float v = pulse * (0.6f + 0.4f * sinf((float)i * 0.45f + (float)millis() * 0.003f));
      float angle = ((float)i / (float)n) * 2.0f * (float)M_PI - (float)M_PI / 2.0f;
      int r2 = inner_r + (int)(v * (float)(outer_max - inner_r));
      int x1 = cx + (int)(cosf(angle) * (float)inner_r);
      int y1 = cy + (int)(sinf(angle) * (float)inner_r);
      int x2 = cx + (int)(cosf(angle) * (float)r2);
      int y2 = cy + (int)(sinf(angle) * (float)r2);
      gfx->drawLine(x1, y1, x2, y2, RGB565_DARKGREEN);
    }
  } else {
    update_eased(state);
    for (uint8_t i = 0; i < n; ++i) {
      float v = state.eased[i];
      if (v <= 0.001f) {
        continue;
      }
      float angle = ((float)i / (float)n) * 2.0f * (float)M_PI - (float)M_PI / 2.0f;
      int r2 = inner_r + (int)(v * (float)(outer_max - inner_r));
      int x1 = cx + (int)(cosf(angle) * (float)inner_r);
      int y1 = cy + (int)(sinf(angle) * (float)inner_r);
      int x2 = cx + (int)(cosf(angle) * (float)r2);
      int y2 = cy + (int)(sinf(angle) * (float)r2);
      uint16_t color = bar_color(v, i, n);
      gfx->drawLine(x1, y1, x2, y2, color);
      gfx->drawLine(x1, y1 + 1, x2, y2 + 1, color);
    }
  }

  gfx->drawCircle(cx, cy, inner_r - 2, RGB565_DARKGREY);
  draw_status_bar(gfx, state, mode_name);
}
