#pragma once

#include <Arduino_GFX_Library.h>

bool display_init();
Arduino_GFX *display_gfx();
int display_width();
int display_height();
bool display_boot_pressed();
