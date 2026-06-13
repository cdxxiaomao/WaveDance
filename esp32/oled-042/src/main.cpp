#include <Arduino.h>

#include "config.h"
#include "oled_renderer.h"
#include "serial_receiver.h"
#include "spectrum_state.h"

namespace {

SerialReceiver g_serial;
SpectrumState g_spectrum;
OledBarRenderer g_renderer;

constexpr size_t kReadChunk = 128;
uint8_t g_read_buf[kReadChunk];

uint32_t g_last_draw_ms = 0;
uint32_t g_draw_interval_ms = 1000 / DISPLAY_FPS;

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

void maybe_draw() {
  uint32_t now = millis();
  if (now - g_last_draw_ms < g_draw_interval_ms) {
    return;
  }
  g_last_draw_ms = now;

  g_spectrum.tick_fade(now);
  g_renderer.render(oled_display(), g_spectrum);
}

}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);

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
  g_renderer.render(oled_display(), g_spectrum);

  Serial.println("WaveDance ESP32-C3 0.42 OLED spectrum ready");
}

void loop() {
  read_serial_stream();
  maybe_draw();
}
