#include "display_driver.h"

#include <ESP32_C3_LCD_1in47.h>

#include "config.h"

static ESP32_C3_LCD_1in47 s_lcd(4);
static Arduino_GFX *s_gfx = nullptr;

bool display_init() {
  if (!s_lcd.begin(100, 80000000)) {
    Serial.printf("display_init failed: %s (IO扩展器 0x24 无响应时屏幕无法点亮)\r\n",
                  esp_err_to_name(s_lcd.lastError()));
    return false;
  }
  s_gfx = s_lcd.gfx();
  if (s_gfx == nullptr) {
    return false;
  }
  s_gfx->fillScreen(RGB565_BLACK);
  return true;
}

Arduino_GFX *display_gfx() { return s_gfx; }

int display_width() {
  if (s_gfx == nullptr) {
    return DISPLAY_WIDTH;
  }
  return s_gfx->width();
}

int display_height() {
  if (s_gfx == nullptr) {
    return DISPLAY_HEIGHT;
  }
  return s_gfx->height();
}

bool display_boot_pressed() {
#if USE_IO_EXPANDER
  return s_lcd.bootPressed();
#else
  return false;
#endif
}
