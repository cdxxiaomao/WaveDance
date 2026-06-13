#include "oled_renderer.h"

#include <math.h>

#include "config.h"

static U8G2_SSD1306_72X40_ER_F_HW_I2C s_display(
    U8G2_R0, U8X8_PIN_NONE, OLED_I2C_SCL, OLED_I2C_SDA);

bool oled_display_begin() {
  if (!s_display.begin()) {
    return false;
  }
  s_display.setContrast(255);
  return true;
}

U8G2 &oled_display() { return s_display; }

void OledBarRenderer::update_eased(SpectrumState &state) {
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

float OledBarRenderer::bucket_value(const SpectrumState &state, uint8_t col,
                                    uint8_t cols, bool live) {
  uint8_t n = state.point_count;
  if (n == 0) {
    n = 1;
  }

  uint8_t start = (uint8_t)((uint16_t)col * n / cols);
  uint8_t end = (uint8_t)((uint16_t)(col + 1) * n / cols);
  if (end <= start) {
    end = (uint8_t)(start + 1);
  }

  float peak = 0.0f;
  for (uint8_t i = start; i < end && i < n; ++i) {
    float v = live ? state.eased[i]
                   : (0.25f + 0.75f * sinf((float)i * 0.7f + (float)millis() * 0.004f));
    if (v > peak) {
      peak = v;
    }
  }
  return peak;
}

void OledBarRenderer::draw_status(U8G2 &display, const SpectrumState &state) {
  display.setFont(u8g2_font_4x6_tr);
  display.drawStr(0, 6, "WD");

  if (state.has_frame && !state.silence) {
    display.drawDisc(16, 2, 2);
    display.drawStr(22, 6, "LINK");
  } else if (state.has_frame) {
    display.drawCircle(16, 2, 2);
    display.drawStr(22, 6, "----");
  } else {
    display.drawCircle(16, 2, 2);
    display.drawStr(22, 6, "WAIT");
  }
}

void OledBarRenderer::draw_bars(U8G2 &display, SpectrumState &state, bool live) {
  constexpr int area_y = STATUS_ROW_HEIGHT;
  constexpr int area_h = BAR_AREA_HEIGHT;
  constexpr int baseline = area_y + area_h - 1;
  constexpr uint8_t cols = SPECTRUM_BUCKETS;

  int total_gap = BAR_GAP_PX * (int)(cols + 1);
  int bar_w = (DISPLAY_WIDTH - total_gap) / (int)cols;
  if (bar_w < 1) {
    bar_w = 1;
  }

  if (live) {
    update_eased(state);
  }

  for (uint8_t i = 0; i < cols; ++i) {
    float v = bucket_value(state, i, cols, live);
    if (v <= 0.02f) {
      continue;
    }

    int bar_h = (int)(v * (float)(area_h - 2));
    if (bar_h < 1) {
      bar_h = 1;
    }
    if (bar_h > area_h - 2) {
      bar_h = area_h - 2;
    }

    int x = BAR_GAP_PX + (int)i * (bar_w + BAR_GAP_PX);
    int y = baseline - bar_h + 1;
    display.drawBox(x, y, bar_w, bar_h);
  }
}

void OledBarRenderer::render(U8G2 &display, SpectrumState &state) {
  display.clearBuffer();
  draw_status(display, state);

  if (!state.has_frame) {
    const float pulse =
        (sinf((float)millis() * 0.004f) + 1.0f) * 0.5f * 0.25f + 0.08f;
    for (uint8_t i = 0; i < SPECTRUM_BUCKETS; ++i) {
      float v = pulse * (0.55f + 0.45f * sinf((float)i * 0.55f + (float)millis() * 0.003f));
      int bar_h = (int)(v * (float)(BAR_AREA_HEIGHT - 2));
      if (bar_h < 1) {
        bar_h = 1;
      }
      int total_gap = BAR_GAP_PX * (int)(SPECTRUM_BUCKETS + 1);
      int bar_w = (DISPLAY_WIDTH - total_gap) / (int)SPECTRUM_BUCKETS;
      if (bar_w < 1) {
        bar_w = 1;
      }
      int x = BAR_GAP_PX + (int)i * (bar_w + BAR_GAP_PX);
      int y = STATUS_ROW_HEIGHT + BAR_AREA_HEIGHT - 1 - bar_h + 1;
      display.drawBox(x, y, bar_w, bar_h);
    }
  } else {
    draw_bars(display, state, true);
  }

  display.sendBuffer();
}
