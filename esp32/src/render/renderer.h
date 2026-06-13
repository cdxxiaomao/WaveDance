#pragma once

#include <Arduino_GFX_Library.h>

#include "spectrum_state.h"

class BarRenderer {
 public:
  void render(Arduino_GFX *gfx, SpectrumState &state);

 private:
  static uint16_t bar_color(float norm, uint8_t idx, uint8_t count);
  static void update_eased(SpectrumState &state);
};
