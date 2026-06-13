#pragma once

#include <stddef.h>
#include <stdint.h>

#include "config.h"
#include "protocol_decode.h"

#if WAVEDANCE_WIFI_UDP

// setup() 中调用一次，启动非阻塞 WiFi 连接
void udp_receiver_init();

// loop() 中周期调用：推进连接 / 断线重连 / UDP 收包
void udp_receiver_service();

bool udp_receiver_ready();
bool udp_receiver_connecting();

const char *udp_receiver_local_ip();

bool udp_receiver_poll_frame(WdfrFrame *out);

uint32_t udp_receiver_frames_ok();
uint32_t udp_receiver_frames_bad();
uint8_t udp_receiver_attempt_count();

#else

inline void udp_receiver_init() {}
inline void udp_receiver_service() {}
inline bool udp_receiver_ready() { return false; }
inline bool udp_receiver_connecting() { return false; }
inline const char *udp_receiver_local_ip() { return ""; }
inline bool udp_receiver_poll_frame(WdfrFrame *) { return false; }
inline uint32_t udp_receiver_frames_ok() { return 0; }
inline uint32_t udp_receiver_frames_bad() { return 0; }
inline uint8_t udp_receiver_attempt_count() { return 0; }

#endif
