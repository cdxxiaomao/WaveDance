#pragma once

#include <stddef.h>
#include <stdint.h>

#include "config.h"

struct WdfrFrame {
  uint16_t seq;
  uint8_t flags;
  uint8_t point_count;
  uint8_t time_count;
  float peak;
  float rms;
  uint8_t points[WDFR_MAX_POINTS];
  int8_t time_samples[WDFR_MAX_TIME];
};

// 从完整帧缓冲解码；frame_len 须已包含整帧。成功返回 true。
bool wdfr_decode_frame(const uint8_t *data, size_t frame_len, WdfrFrame *out);

// 根据帧头字段计算期望帧长（不含 magic 对齐前的脏字节）
size_t wdfr_frame_total_len(uint16_t point_count, uint16_t time_count);

// 在 buf[0..len) 中查找下一帧 magic 起始偏移；未找到返回 len
size_t wdfr_find_magic(const uint8_t *buf, size_t len);
