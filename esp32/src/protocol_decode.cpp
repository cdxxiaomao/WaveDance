#include "protocol_decode.h"

#include <string.h>

size_t wdfr_find_magic(const uint8_t *buf, size_t len) {
  if (len < 4) {
    return len;
  }
  for (size_t i = 0; i + 3 < len; ++i) {
    uint32_t v = (uint32_t)buf[i] | ((uint32_t)buf[i + 1] << 8) |
                 ((uint32_t)buf[i + 2] << 16) | ((uint32_t)buf[i + 3] << 24);
    if (v == WDFR_MAGIC) {
      return i;
    }
  }
  return len;
}

size_t wdfr_frame_total_len(uint16_t point_count, uint16_t time_count) {
  if (point_count == 0 || point_count > WDFR_MAX_POINTS) {
    return 0;
  }
  if (time_count > WDFR_MAX_TIME) {
    return 0;
  }
  return WDFR_HEADER_LEN + point_count + time_count;
}

static float read_f32_le(const uint8_t *p) {
  float v;
  memcpy(&v, p, sizeof(v));
  return v;
}

bool wdfr_decode_frame(const uint8_t *data, size_t frame_len, WdfrFrame *out) {
  if (out == nullptr || frame_len < WDFR_HEADER_LEN) {
    return false;
  }

  uint32_t magic =
      (uint32_t)data[0] | ((uint32_t)data[1] << 8) | ((uint32_t)data[2] << 16) |
      ((uint32_t)data[3] << 24);
  if (magic != WDFR_MAGIC) {
    return false;
  }

  uint8_t version = data[4];
  if (version != WDFR_VERSION) {
    return false;
  }

  uint16_t point_count = (uint16_t)(data[8] | (data[9] << 8));
  uint16_t time_count = (uint16_t)(data[10] | (data[11] << 8));
  size_t expected = wdfr_frame_total_len(point_count, time_count);
  if (expected == 0 || frame_len < expected) {
    return false;
  }

  out->seq = (uint16_t)(data[6] | (data[7] << 8));
  out->flags = data[5];
  out->point_count = (uint8_t)point_count;
  out->time_count = (uint8_t)time_count;
  out->peak = read_f32_le(&data[12]);
  out->rms = read_f32_le(&data[16]);

  memset(out->points, 0, sizeof(out->points));
  memset(out->time_samples, 0, sizeof(out->time_samples));

  memcpy(out->points, &data[WDFR_HEADER_LEN], point_count);
  if (time_count > 0) {
    memcpy(out->time_samples, &data[WDFR_HEADER_LEN + point_count], time_count);
  }
  return true;
}
