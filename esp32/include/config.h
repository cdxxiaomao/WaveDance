#pragma once

// 板型由 platformio build_flags 指定：
//   -DBOARD_ESP32_C3_OLED_042  → 0.42" SSD1306 OLED
//   默认（或未指定）           → 微雪 ESP32-C3-LCD-1.47

#if defined(BOARD_ESP32_C3_OLED_042)

#define DISPLAY_WIDTH 72
#define DISPLAY_HEIGHT 40
#define DISPLAY_DRIVER SSD1306
#define BACKLIGHT_TYPE NONE
#define USE_IO_EXPANDER 0
#define DEFAULT_MODE MODE_BAR
#define SPECTRUM_BUCKETS 16
#define STATUS_ROW_HEIGHT 8
#define BAR_AREA_HEIGHT 32
#define BAR_TOP_MARGIN 0
#define BAR_BOTTOM_MARGIN 0
#define BAR_GAP_PX 1

#else

#define BOARD_ESP32_C3_LCD_147
#define DISPLAY_WIDTH 172
#define DISPLAY_HEIGHT 320
#define DISPLAY_DRIVER ST7789
#define BACKLIGHT_TYPE WHITE_LED
#define USE_IO_EXPANDER 1
#define DEFAULT_MODE MODE_BAR
#define SPECTRUM_BUCKETS 32
#define BAR_AREA_HEIGHT 260
#define BAR_TOP_MARGIN 8
#define BAR_BOTTOM_MARGIN 4
#define BAR_GAP_PX 1

#endif

// USB CDC 串口（与 WaveDance 设置页默认一致）
#define SERIAL_BAUD 921600

// WiFi UDP（Phase 5 可选；编译时 -DWAVEDANCE_WIFI_UDP=1 启用）
#ifndef WAVEDANCE_WIFI_UDP
#define WAVEDANCE_WIFI_UDP 0
#endif

#define WDFR_UDP_PORT 47001

// 屏幕刷新上限（Hz）
#define DISPLAY_FPS 30

#if defined(BOARD_ESP32_C3_OLED_042)
#define BAR_ATTACK_K 0.55f
#define BAR_DECAY_K 0.32f
#else
#define BAR_ATTACK_K 0.45f
#define BAR_DECAY_K 0.28f
#endif

// WDFR 协议
#define WDFR_MAGIC 0x57444652u
#define WDFR_VERSION 1
#define WDFR_HEADER_LEN 20
#define WDFR_FLAG_SILENCE 0x01
#define WDFR_FLAG_HAS_TIME 0x02
#define WDFR_FLAG_FREQ_REVERSED 0x04
#define WDFR_MAX_POINTS 64
#define WDFR_MAX_TIME 256

// 无新帧超过此毫秒后开始渐隐
#define FRAME_STALE_MS 500
#define FADE_K 0.12f

enum DisplayMode : uint8_t {
  MODE_BAR = 0,
  MODE_VU = 1,
  MODE_SCOPE = 2,
  MODE_RADIAL = 3,
};
