#pragma once

#include <U8g2lib.h>

#include "spectrum_state.h"

constexpr int OLED_I2C_SDA = 5;
constexpr int OLED_I2C_SCL = 6;

bool oled_display_begin();
U8G2 &oled_display();

class OledBarRenderer {
 public:
  void render(U8G2 &display, SpectrumState &state);

 private:
  static void update_eased(SpectrumState &state);
  static float bucket_value(const SpectrumState &state, uint8_t col, uint8_t cols,
                            bool live);
  static void draw_status(U8G2 &display, const SpectrumState &state);
  static void draw_bars(U8G2 &display, SpectrumState &state, bool live);
};
