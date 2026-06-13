#pragma once

#include <stddef.h>
#include <stdint.h>

#include "config.h"
#include "protocol_decode.h"

// 流式串口组帧：从 USB CDC 字节流拼出完整 WDFR 帧。
class SerialReceiver {
 public:
  static constexpr size_t kBufSize = 512;

  SerialReceiver();

  void reset();
  void feed(const uint8_t *data, size_t len);

  // 若拼出完整帧则返回 true，并通过 out 返回解码结果。
  bool poll_frame(WdfrFrame *out);

  uint32_t frames_ok() const { return frames_ok_; }
  uint32_t frames_bad() const { return frames_bad_; }
  uint32_t magic_resyncs() const { return magic_resyncs_; }

 private:
  void compact();
  bool try_decode_at(size_t start, WdfrFrame *out);

  uint8_t buf_[kBufSize];
  size_t len_;
  uint32_t frames_ok_;
  uint32_t frames_bad_;
  uint32_t magic_resyncs_;
};
