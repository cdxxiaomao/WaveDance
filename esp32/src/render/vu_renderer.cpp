#include "render/renderer.h"

#include <math.h>

#include "config.h"

namespace {

constexpr int kBarH = 18;
constexpr int kBarGap = 28;
constexpr int kMarginX = 16;

void draw_meter(Arduino_GFX *gfx, int x, int y, int w, int h, float level, uint16_t fill,
                uint16_t track) {
  gfx->fillRect(x, y, w, h, track);
  int fill_w = (int)(level * (float)w);
  if (fill_w < 0) {
    fill_w = 0;
  }
  if (fill_w > w) {
    fill_w = w;
  }
  if (fill_w > 0) {
    gfx->fillRect(x, y, fill_w, h, fill);
  }
}

}  // namespace

void VuRenderer::update_eased(SpectrumState &state) {
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

void VuRenderer::render(Arduino_GFX *gfx, SpectrumState &state, const char *mode_name) {
  if (gfx == nullptr) {
    return;
  }

  const int w = gfx->width();
  const int h = gfx->height();
  const int area_y = 24;
  const int area_h = h - area_y - 20;
  gfx->fillRect(0, area_y, w, area_h, RGB565_BLACK);

  const int bar_w = w - kMarginX * 2;
  const int cx = kMarginX;
  const int mid_y = area_y + area_h / 2;

  float peak_target = state.has_frame ? state.peak : 0.05f;
  float rms_target = state.has_frame ? state.rms : 0.03f;
  if (!state.has_frame) {
    float pulse = (sinf((float)millis() * 0.003f) + 1.0f) * 0.5f * 0.25f + 0.08f;
    peak_target = pulse;
    rms_target = pulse * 0.65f;
  }

  float k_up = BAR_ATTACK_K;
  float k_down = BAR_DECAY_K;
  eased_peak_ += (peak_target - eased_peak_) * (peak_target > eased_peak_ ? k_up : k_down);
  eased_rms_ += (rms_target - eased_rms_) * (rms_target > eased_rms_ ? k_up : k_down);

  if (state.has_frame) {
    update_eased(state);
  }

  const int peak_y = mid_y - kBarGap - kBarH;
  const int rms_y = mid_y + kBarGap;

  gfx->setTextSize(1);
  gfx->setTextColor(RGB565_DARKGREY);
  gfx->setCursor(cx, peak_y - 12);
  gfx->print("PEAK");
  gfx->setCursor(cx, rms_y - 12);
  gfx->print("RMS");

  draw_meter(gfx, cx, peak_y, bar_w, kBarH, eased_peak_, RGB565_CYAN, RGB565_DARKGREY);
  draw_meter(gfx, cx, rms_y, bar_w, kBarH, eased_rms_, RGB565_GREEN, RGB565_DARKGREY);

  if (state.has_frame) {
    int peak_x = cx + (int)(eased_peak_ * (float)bar_w);
    if (peak_x > cx + bar_w - 2) {
      peak_x = cx + bar_w - 2;
    }
    gfx->fillRect(peak_x, peak_y - 2, 2, kBarH + 4, RGB565_WHITE);
  }

  draw_status_bar(gfx, state, mode_name);
}
