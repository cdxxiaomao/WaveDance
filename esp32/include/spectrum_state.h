#pragma once

#include <stdint.h>

#include "config.h"
#include "protocol_decode.h"

struct SpectrumState {
  float peak;
  float rms;
  float eased[WDFR_MAX_POINTS];
  uint8_t targets[WDFR_MAX_POINTS];
  uint8_t point_count;
  uint8_t flags;
  uint16_t seq;
  uint32_t last_frame_ms;
  bool has_frame;
  bool silence;

  void apply_frame(const WdfrFrame &frame, uint32_t now_ms);
  void tick_fade(uint32_t now_ms);
};
