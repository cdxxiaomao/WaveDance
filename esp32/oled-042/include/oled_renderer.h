#pragma once

#include <U8g2lib.h>

#include "config.h"
#include "spectrum_state.h"

constexpr int OLED_I2C_SDA = 5;
constexpr int OLED_I2C_SCL = 6;

bool oled_display_begin();
U8G2 &oled_display();

void oled_draw_status(U8G2 &display, const SpectrumState &state, DisplayMode mode);

#if WAVEDANCE_WIFI_UDP
// 等待 Mac 推送时显示 WiFi / IP（仅 WiFi 版固件）
void oled_draw_wifi_waiting(U8G2 &display, DisplayMode mode);
bool oled_show_wifi_splash(const SpectrumState &state);
#endif

class OledBarRenderer {
 public:
  void render(U8G2 &display, SpectrumState &state, DisplayMode mode = MODE_BAR);

 private:
  static void update_eased(SpectrumState &state);
  static float bucket_value(const SpectrumState &state, uint8_t col, uint8_t cols,
                            bool live);
  static void draw_bars(U8G2 &display, SpectrumState &state, bool live);
};

class OledVuRenderer {
 public:
  void render(U8G2 &display, SpectrumState &state, DisplayMode mode = MODE_VU);

 private:
  float eased_peak_ = 0.0f;
  float eased_rms_ = 0.0f;
  static void draw_meter(U8G2 &display, int x, int y, int w, int h, float level);
};
