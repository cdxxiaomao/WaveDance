#include "serial_receiver.h"

#include <string.h>

SerialReceiver::SerialReceiver()
    : len_(0), frames_ok_(0), frames_bad_(0), magic_resyncs_(0) {
  memset(buf_, 0, sizeof(buf_));
}

void SerialReceiver::reset() {
  len_ = 0;
}

void SerialReceiver::compact() {
  if (len_ == 0) {
    return;
  }
  size_t keep = 64;
  if (len_ <= keep) {
    return;
  }
  memmove(buf_, buf_ + len_ - keep, keep);
  len_ = keep;
}

void SerialReceiver::feed(const uint8_t *data, size_t len) {
  if (data == nullptr || len == 0) {
    return;
  }

  while (len > 0) {
    size_t space = kBufSize - len_;
    if (space == 0) {
      compact();
      space = kBufSize - len_;
      if (space == 0) {
        len_ = 0;
        space = kBufSize;
      }
    }

    size_t chunk = len < space ? len : space;
    memcpy(buf_ + len_, data, chunk);
    len_ += chunk;
    data += chunk;
    len -= chunk;
  }
}

bool SerialReceiver::try_decode_at(size_t start, WdfrFrame *out) {
  if (start + WDFR_HEADER_LEN > len_) {
    return false;
  }

  uint16_t point_count =
      (uint16_t)(buf_[start + 8] | (buf_[start + 9] << 8));
  uint16_t time_count =
      (uint16_t)(buf_[start + 10] | (buf_[start + 11] << 8));
  size_t total = wdfr_frame_total_len(point_count, time_count);
  if (total == 0) {
    return false;
  }
  if (start + total > len_) {
    return false;
  }

  if (!wdfr_decode_frame(buf_ + start, total, out)) {
    return false;
  }

  size_t remain = len_ - (start + total);
  if (remain > 0) {
    memmove(buf_, buf_ + start + total, remain);
  }
  len_ = remain;
  return true;
}

bool SerialReceiver::poll_frame(WdfrFrame *out) {
  while (true) {
    if (len_ < WDFR_HEADER_LEN) {
      return false;
    }

    size_t magic_at = wdfr_find_magic(buf_, len_);
    if (magic_at >= len_) {
      len_ = 0;
      return false;
    }

    if (magic_at > 0) {
      memmove(buf_, buf_ + magic_at, len_ - magic_at);
      len_ -= magic_at;
      ++magic_resyncs_;
    }

    if (try_decode_at(0, out)) {
      ++frames_ok_;
      return true;
    }

    // 非法头：丢弃当前 magic 首字节，继续搜索
    if (len_ > 1) {
      memmove(buf_, buf_ + 1, len_ - 1);
      --len_;
    } else {
      len_ = 0;
    }
    ++frames_bad_;
  }
}
