#include <Arduino.h>

#include "config.h"
#include "display_driver.h"
#include "serial_receiver.h"
#include "spectrum_state.h"
#include "udp_receiver.h"
#include "render/renderer.h"

namespace {

SerialReceiver g_serial;
SpectrumState g_spectrum;
BarRenderer g_bar_renderer;
VuRenderer g_vu_renderer;
RadialRenderer g_radial_renderer;

constexpr size_t kReadChunk = 128;
uint8_t g_read_buf[kReadChunk];

uint32_t g_last_draw_ms = 0;
uint32_t g_draw_interval_ms = 1000 / DISPLAY_FPS;
bool g_display_ready = false;
uint32_t g_last_init_attempt_ms = 0;
DisplayMode g_display_mode = DEFAULT_MODE;

bool g_boot_was_pressed = false;
uint32_t g_boot_press_ms = 0;

const char *mode_label(DisplayMode mode) {
  switch (mode) {
    case MODE_BAR:
      return "BAR";
    case MODE_VU:
      return "VU";
    case MODE_RADIAL:
      return "RAD";
    default:
      return "?";
  }
}

void cycle_display_mode() {
  switch (g_display_mode) {
    case MODE_BAR:
      g_display_mode = MODE_VU;
      break;
    case MODE_VU:
      g_display_mode = MODE_RADIAL;
      break;
    default:
      g_display_mode = MODE_BAR;
      break;
  }
}

void poll_boot_button() {
  const bool pressed = display_boot_pressed();
  const uint32_t now = millis();

  if (pressed && !g_boot_was_pressed) {
    g_boot_press_ms = now;
  }

  if (!pressed && g_boot_was_pressed) {
    if (now - g_boot_press_ms >= 50) {
      cycle_display_mode();
    }
  }

  g_boot_was_pressed = pressed;
}

void read_serial_stream() {
  while (Serial.available() > 0) {
    int n = Serial.readBytes(
        (char *)g_read_buf,
        Serial.available() > (int)kReadChunk ? (int)kReadChunk : Serial.available());
    if (n <= 0) {
      break;
    }
    g_serial.feed(g_read_buf, (size_t)n);

    WdfrFrame frame;
    while (g_serial.poll_frame(&frame)) {
      g_spectrum.apply_frame(frame, millis());
    }
  }
}

void read_udp_stream() {
#if WAVEDANCE_WIFI_UDP
  WdfrFrame frame;
  while (udp_receiver_poll_frame(&frame)) {
    g_spectrum.apply_frame(frame, millis());
  }
#endif
}

void poll_incoming_frames() {
  read_serial_stream();
  read_udp_stream();
}

void show_boot_splash() {
  Arduino_GFX *gfx = display_gfx();
  if (gfx == nullptr) {
    return;
  }
  gfx->fillScreen(RGB565_BLACK);
  gfx->setTextSize(2);
  gfx->setTextColor(RGB565_CYAN);
  gfx->setCursor(16, 120);
  gfx->println("WaveDance");
  gfx->setTextSize(1);
  gfx->setTextColor(RGB565_DARKGREY);
  gfx->setCursor(16, 148);
  gfx->println("Waiting for Mac...");
  gfx->setCursor(16, 164);
  gfx->println("Enable ESP push in settings");
  gfx->setCursor(16, 180);
  gfx->println("BOOT: switch display mode");
#if WAVEDANCE_WIFI_UDP
  if (udp_receiver_ready()) {
    gfx->setCursor(16, 196);
    gfx->setTextColor(RGB565_GREEN);
    gfx->print("UDP ");
    gfx->print(udp_receiver_local_ip());
    gfx->print(":");
    gfx->print(WDFR_UDP_PORT);
  }
#endif
}

void render_current_mode(Arduino_GFX *gfx) {
  const char *label = mode_label(g_display_mode);
  switch (g_display_mode) {
    case MODE_VU:
      g_vu_renderer.render(gfx, g_spectrum, label);
      break;
    case MODE_RADIAL:
      g_radial_renderer.render(gfx, g_spectrum, label);
      break;
    case MODE_BAR:
    default:
      g_bar_renderer.render(gfx, g_spectrum, label);
      break;
  }
}

void maybe_draw() {
  uint32_t now = millis();
  if (now - g_last_draw_ms < g_draw_interval_ms) {
    return;
  }
  g_last_draw_ms = now;

  g_spectrum.tick_fade(now);

  Arduino_GFX *gfx = display_gfx();
  if (gfx == nullptr) {
    return;
  }

  render_current_mode(gfx);
}

bool try_init_display() {
  g_last_init_attempt_ms = millis();
  if (!display_init()) {
    return false;
  }

  g_spectrum.point_count = SPECTRUM_BUCKETS;
  g_spectrum.has_frame = false;
  g_spectrum.silence = true;
  memset(g_spectrum.eased, 0, sizeof(g_spectrum.eased));
  memset(g_spectrum.targets, 0, sizeof(g_spectrum.targets));
  g_display_mode = DEFAULT_MODE;
  show_boot_splash();
  g_last_draw_ms = millis();
  return true;
}

}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(500);

#ifdef DEBUG_LOG
  Serial.println("WaveDance ESP32-C3-LCD-1.47 Phase3");
#endif

  g_draw_interval_ms = 1000 / DISPLAY_FPS;
  g_display_ready = try_init_display();

#if WAVEDANCE_WIFI_UDP
  udp_receiver_init();
#endif
}

void loop() {
  if (!g_display_ready) {
    uint32_t now = millis();
    if (now - g_last_init_attempt_ms >= 1500) {
      g_display_ready = try_init_display();
    }
    delay(10);
    return;
  }

  poll_boot_button();
#if WAVEDANCE_WIFI_UDP
  udp_receiver_service();
#endif
  poll_incoming_frames();
  maybe_draw();
}
