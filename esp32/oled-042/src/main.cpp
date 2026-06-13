#include <Arduino.h>

#include "config.h"
#include "oled_renderer.h"
#include "serial_receiver.h"
#include "spectrum_state.h"
#include "udp_receiver.h"

namespace {

constexpr uint8_t PIN_BOOT = 9;

SerialReceiver g_serial;
SpectrumState g_spectrum;
OledBarRenderer g_bar_renderer;
OledVuRenderer g_vu_renderer;

constexpr size_t kReadChunk = 128;
uint8_t g_read_buf[kReadChunk];

uint32_t g_last_draw_ms = 0;
uint32_t g_draw_interval_ms = 1000 / DISPLAY_FPS;
DisplayMode g_display_mode = DEFAULT_MODE;

bool g_boot_was_pressed = false;
uint32_t g_boot_press_ms = 0;

void cycle_display_mode() {
  g_display_mode = (g_display_mode == MODE_BAR) ? MODE_VU : MODE_BAR;
}

void poll_boot_button() {
  const bool pressed = digitalRead(PIN_BOOT) == LOW;
  const uint32_t now = millis();

  if (pressed && !g_boot_was_pressed) {
    g_boot_press_ms = now;
  }

  if (!pressed && g_boot_was_pressed && now - g_boot_press_ms >= 50) {
    cycle_display_mode();
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

void render_current_mode() {
  U8G2 &display = oled_display();
  if (g_display_mode == MODE_VU) {
    g_vu_renderer.render(display, g_spectrum, g_display_mode);
  } else {
    g_bar_renderer.render(display, g_spectrum, g_display_mode);
  }
}

void maybe_draw() {
  uint32_t now = millis();
  if (now - g_last_draw_ms < g_draw_interval_ms) {
    return;
  }
  g_last_draw_ms = now;

  g_spectrum.tick_fade(now);
  render_current_mode();
}

}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);

  pinMode(PIN_BOOT, INPUT_PULLUP);

  if (!oled_display_begin()) {
    Serial.println("OLED init failed");
    return;
  }

  g_spectrum.point_count = SPECTRUM_BUCKETS;
  g_spectrum.has_frame = false;
  g_spectrum.silence = true;
  memset(g_spectrum.eased, 0, sizeof(g_spectrum.eased));
  memset(g_spectrum.targets, 0, sizeof(g_spectrum.targets));

  g_draw_interval_ms = 1000 / DISPLAY_FPS;
  g_last_draw_ms = millis();

#if WAVEDANCE_WIFI_UDP
  {
    U8G2 &display = oled_display();
    display.clearBuffer();
    display.setFont(u8g2_font_4x6_tr);
    display.drawStr(0, 6, "WD WiFi...");
    display.drawStr(0, 18, "starting");
    display.sendBuffer();
  }

  udp_receiver_init();

  g_last_draw_ms = 0;
  render_current_mode();
#else
  render_current_mode();
#endif

  Serial.println("WaveDance ESP32-C3 0.42 OLED (72x40) ready");
}

void loop() {
  poll_boot_button();
#if WAVEDANCE_WIFI_UDP
  udp_receiver_service();
#endif
  poll_incoming_frames();
  maybe_draw();
}
