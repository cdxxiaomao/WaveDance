#include <ESP32_C3_LCD_1in47.h>

static ESP32_C3_LCD_1in47 lcd;
static Arduino_GFX *gfx = nullptr;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Factory HelloWorld test (WaveDance BSP)");

  if (!lcd.begin()) {
    Serial.printf("lcd.begin failed: %s\r\n", esp_err_to_name(lcd.lastError()));
    return;
  }

  gfx = lcd.gfx();
  gfx->fillScreen(RGB565_BLACK);
  gfx->setCursor(10, 10);
  gfx->setTextColor(RGB565_RED);
  gfx->setTextSize(2);
  gfx->println("Hello World!");
  Serial.println("display OK - check screen for red Hello World!");
}

void loop() {
  if (gfx == nullptr) {
    delay(1000);
    return;
  }
  gfx->setCursor(random(gfx->width()), random(gfx->height()));
  gfx->setTextColor(random(0xffff), random(0xffff));
  gfx->setTextSize(random(6) + 1, random(6) + 1, random(2));
  gfx->println("Hello World!");
  delay(1000);
}
