#include "spectrum_state.h"

#include <string.h>

void SpectrumState::apply_frame(const WdfrFrame &frame, uint32_t now_ms) {
  peak = frame.peak;
  rms = frame.rms;
  flags = frame.flags;
  seq = frame.seq;
  silence = (frame.flags & WDFR_FLAG_SILENCE) != 0;
  point_count = frame.point_count;
  if (point_count == 0) {
    point_count = 1;
  }
  if (point_count > WDFR_MAX_POINTS) {
    point_count = WDFR_MAX_POINTS;
  }

  for (uint8_t i = 0; i < point_count; ++i) {
    uint8_t src_idx = i;
    if ((frame.flags & WDFR_FLAG_FREQ_REVERSED) != 0) {
      src_idx = point_count - 1 - i;
    }
    targets[i] = frame.points[src_idx];
  }

  has_frame = true;
  last_frame_ms = now_ms;
}

void SpectrumState::tick_fade(uint32_t now_ms) {
  if (!has_frame) {
    return;
  }
  if (now_ms - last_frame_ms <= FRAME_STALE_MS) {
    return;
  }

  bool any = false;
  for (uint8_t i = 0; i < point_count; ++i) {
    eased[i] *= (1.0f - FADE_K);
    if (eased[i] > 0.002f) {
      any = true;
    } else {
      eased[i] = 0.0f;
    }
    targets[i] = 0;
  }

  peak *= (1.0f - FADE_K);
  rms *= (1.0f - FADE_K);
  if (!any && peak < 0.002f && rms < 0.002f) {
    has_frame = false;
    silence = true;
  }
}
