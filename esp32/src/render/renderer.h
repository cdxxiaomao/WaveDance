#pragma once

#include <Arduino_GFX_Library.h>

#include "config.h"
#include "spectrum_state.h"

void draw_status_bar(Arduino_GFX *gfx, SpectrumState &state, const char *mode_name);

class BarRenderer {
 public:
  void render(Arduino_GFX *gfx, SpectrumState &state, const char *mode_name = "BAR");

 private:
  static uint16_t bar_color(float norm, uint8_t idx, uint8_t count);
  static void update_eased(SpectrumState &state);
};

class VuRenderer {
 public:
  void render(Arduino_GFX *gfx, SpectrumState &state, const char *mode_name = "VU");

 private:
  float eased_peak_ = 0.0f;
  float eased_rms_ = 0.0f;
  static void update_eased(SpectrumState &state);
};

class RadialRenderer {
 public:
  void render(Arduino_GFX *gfx, SpectrumState &state, const char *mode_name = "RAD");

 private:
  static uint16_t bar_color(float norm, uint8_t idx, uint8_t count);
  static void update_eased(SpectrumState &state);
};
