#include "oled_renderer.h"

#include <math.h>

#if WAVEDANCE_WIFI_UDP
#include "udp_receiver.h"
#endif

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

const char *oled_mode_label(DisplayMode mode) {
  switch (mode) {
    case MODE_VU:
      return "VU";
    case MODE_BAR:
    default:
      return "BAR";
  }
}

void oled_draw_status(U8G2 &display, const SpectrumState &state, DisplayMode mode) {
  display.setFont(u8g2_font_4x6_tr);
  display.drawStr(0, 6, "WD");

  if (state.has_frame && !state.silence) {
    display.drawDisc(14, 2, 2);
    display.drawStr(20, 6, "LNK");
  } else if (state.has_frame) {
    display.drawCircle(14, 2, 2);
    display.drawStr(20, 6, "---");
  } else {
    display.drawCircle(14, 2, 2);
    display.drawStr(20, 6, "WAT");
  }

  display.drawStr(44, 6, oled_mode_label(mode));
}

#if WAVEDANCE_WIFI_UDP

bool oled_show_wifi_splash(const SpectrumState &state) {
  return !state.has_frame;
}

void oled_draw_ip_large(U8G2 &display, const char *ip) {
  if (ip == nullptr || ip[0] == '\0') {
    display.setFont(u8g2_font_5x8_tf);
    display.drawStr(0, 28, "no ip");
    return;
  }

  // 72px 宽：5x8 字体可完整显示 192.168.1.xxx
  display.setFont(u8g2_font_5x8_tf);
  const int w = display.getStrWidth(ip);
  int x = w < DISPLAY_WIDTH ? (DISPLAY_WIDTH - w) / 2 : 0;
  display.drawStr(x, 28, ip);
}

void oled_draw_wifi_waiting(U8G2 &display, DisplayMode mode) {
  display.clearBuffer();

  if (udp_receiver_ready()) {
    display.setFont(u8g2_font_4x6_tr);
    display.drawStr(0, 6, "WiFi OK");
    display.drawDisc(36, 2, 2);

    oled_draw_ip_large(display, udp_receiver_local_ip());

    display.setFont(u8g2_font_4x6_tr);
    char port_line[16];
    snprintf(port_line, sizeof(port_line), "UDP %u", (unsigned)WDFR_UDP_PORT);
    const int pw = display.getStrWidth(port_line);
    display.drawStr(pw < DISPLAY_WIDTH ? (DISPLAY_WIDTH - pw) / 2 : 0, 38,
                   port_line);
    (void)mode;
  } else {
    display.setFont(u8g2_font_4x6_tr);
    display.drawStr(0, 6, "WD");

    if (udp_receiver_connecting()) {
      display.drawCircle(14, 2, 2);
      display.drawStr(20, 6, "...");
      display.setFont(u8g2_font_5x8_tf);
      display.drawStr(0, 22, "WiFi");
      display.setFont(u8g2_font_4x6_tr);
      char attempt_line[16];
      snprintf(attempt_line, sizeof(attempt_line), "try %u",
               (unsigned)udp_receiver_attempt_count());
      display.drawStr(0, 36, attempt_line);
    } else {
      display.drawCircle(14, 2, 2);
      display.drawStr(20, 6, "...");
      display.setFont(u8g2_font_5x8_tf);
      display.drawStr(0, 22, "retry");
      display.setFont(u8g2_font_4x6_tr);
      display.drawStr(0, 36, "WiFi soon");
    }

    display.drawStr(44, 6, oled_mode_label(mode));
  }

  display.sendBuffer();
}

#endif

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

void OledBarRenderer::render(U8G2 &display, SpectrumState &state, DisplayMode mode) {
#if WAVEDANCE_WIFI_UDP
  if (oled_show_wifi_splash(state)) {
    oled_draw_wifi_waiting(display, mode);
    return;
  }
#endif

  display.clearBuffer();
  oled_draw_status(display, state, mode);

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

void OledVuRenderer::draw_meter(U8G2 &display, int x, int y, int w, int h,
                                float level) {
  display.drawFrame(x, y, w, h);
  int fill_w = (int)(level * (float)(w - 2));
  if (fill_w < 0) {
    fill_w = 0;
  }
  if (fill_w > w - 2) {
    fill_w = w - 2;
  }
  if (fill_w > 0) {
    display.drawBox(x + 1, y + 1, fill_w, h - 2);
  }
}

void OledVuRenderer::render(U8G2 &display, SpectrumState &state, DisplayMode mode) {
#if WAVEDANCE_WIFI_UDP
  if (oled_show_wifi_splash(state)) {
    oled_draw_wifi_waiting(display, mode);
    return;
  }
#endif

  display.clearBuffer();
  oled_draw_status(display, state, mode);

  constexpr int margin_x = 2;
  constexpr int bar_w = DISPLAY_WIDTH - margin_x * 2;
  constexpr int bar_h = 7;
  constexpr int peak_y = 12;
  constexpr int rms_y = 26;

  float peak_target = state.has_frame ? state.peak : 0.08f;
  float rms_target = state.has_frame ? state.rms : 0.05f;
  if (!state.has_frame) {
    float pulse = (sinf((float)millis() * 0.003f) + 1.0f) * 0.5f * 0.22f + 0.06f;
    peak_target = pulse;
    rms_target = pulse * 0.65f;
  }

  float k_up = BAR_ATTACK_K;
  float k_down = BAR_DECAY_K;
  eased_peak_ += (peak_target - eased_peak_) * (peak_target > eased_peak_ ? k_up : k_down);
  eased_rms_ += (rms_target - eased_rms_) * (rms_target > eased_rms_ ? k_up : k_down);

  display.setFont(u8g2_font_4x6_tr);
  display.drawStr(margin_x, peak_y - 2, "P");
  display.drawStr(margin_x, rms_y - 2, "R");
  draw_meter(display, margin_x + 8, peak_y, bar_w - 8, bar_h, eased_peak_);
  draw_meter(display, margin_x + 8, rms_y, bar_w - 8, bar_h, eased_rms_);

  display.sendBuffer();
}
