#include "io_extension.h"

#include <Wire.h>

namespace {

constexpr uint32_t TimeoutMs = 50;

uint8_t scalePwm(uint8_t value)
{
  if (value > 100) {
    value = 100;
  }

  return (uint8_t)(value * 255 / 100);
}

esp_err_t wire_result(uint8_t err)
{
  return (err == 0) ? ESP_OK : ESP_FAIL;
}

esp_err_t io_extension_write_reg(io_extension_obj_t *obj, uint8_t reg, uint8_t value)
{
  if (obj == nullptr) {
    return ESP_ERR_INVALID_STATE;
  }

  Wire.beginTransmission(IO_EXTENSION_ADDR);
  Wire.write(reg);
  Wire.write(value);
  obj->err = wire_result(Wire.endTransmission(true));
  return obj->err;
}

esp_err_t io_extension_read_reg(io_extension_obj_t *obj, uint8_t reg, uint8_t *value)
{
  if (obj == nullptr || value == nullptr) {
    return ESP_ERR_INVALID_STATE;
  }

  Wire.beginTransmission(IO_EXTENSION_ADDR);
  Wire.write(reg);
  obj->err = wire_result(Wire.endTransmission(false));
  if (obj->err != ESP_OK) {
    return obj->err;
  }

  if (Wire.requestFrom((int)IO_EXTENSION_ADDR, 1) < 1) {
    obj->err = ESP_FAIL;
    return obj->err;
  }

  *value = (uint8_t)Wire.read();
  obj->err = ESP_OK;
  return ESP_OK;
}

esp_err_t io_extension_read_word(io_extension_obj_t *obj, uint8_t reg, uint16_t *value)
{
  if (obj == nullptr || value == nullptr) {
    return ESP_ERR_INVALID_STATE;
  }

  Wire.beginTransmission(IO_EXTENSION_ADDR);
  Wire.write(reg);
  obj->err = wire_result(Wire.endTransmission(false));
  if (obj->err != ESP_OK) {
    return obj->err;
  }

  if (Wire.requestFrom((int)IO_EXTENSION_ADDR, 2) < 2) {
    obj->err = ESP_FAIL;
    return obj->err;
  }

  uint8_t lo = (uint8_t)Wire.read();
  uint8_t hi = (uint8_t)Wire.read();
  *value = (uint16_t)((hi << 8) | lo);
  obj->err = ESP_OK;
  return ESP_OK;
}

bool io_extension_begin_bus(io_extension_obj_t *obj, gpio_num_t sda, gpio_num_t scl, uint32_t hz)
{
  if (obj == nullptr) {
    return false;
  }

  if (!obj->wire_started) {
    pinMode((int)sda, INPUT_PULLUP);
    pinMode((int)scl, INPUT_PULLUP);
    Wire.begin((int)sda, (int)scl, hz);
    Wire.setClock(hz);
    Wire.setTimeOut(TimeoutMs);
    obj->wire_started = true;
    delay(10);
  }

  return true;
}

}  // namespace

bool IO_EXTENSION_Init(io_extension_obj_t *obj, gpio_num_t sda, gpio_num_t scl, i2c_port_t port, uint32_t hz)
{
  (void)port;

  if (obj == nullptr) {
    return false;
  }

  if (!io_extension_begin_bus(obj, sda, scl, hz)) {
    return false;
  }

  obj->output = 0xFF;
  obj->err = IO_EXTENSION_IO_Mode(obj, 0xFF);
  if (obj->err != ESP_OK) {
    return false;
  }

  obj->err = IO_EXTENSION_Output_Bits(obj, obj->output);
  return obj->err == ESP_OK;
}

esp_err_t IO_EXTENSION_IO_Mode(io_extension_obj_t *obj, uint8_t value)
{
  return io_extension_write_reg(obj, IO_EXTENSION_REG_MODE, value);
}

esp_err_t IO_EXTENSION_Output(io_extension_obj_t *obj, uint8_t pin, uint8_t value)
{
  if (obj == nullptr || pin >= 8) {
    return ESP_ERR_INVALID_ARG;
  }

  if (value) {
    obj->output |= (uint8_t)(1U << pin);
  } else {
    obj->output &= (uint8_t)~(1U << pin);
  }

  return IO_EXTENSION_Output_Bits(obj, obj->output);
}

esp_err_t IO_EXTENSION_Output_Bits(io_extension_obj_t *obj, uint8_t value)
{
  if (obj == nullptr) {
    return ESP_ERR_INVALID_ARG;
  }

  obj->output = value;
  return io_extension_write_reg(obj, IO_EXTENSION_REG_OUTPUT, value);
}

esp_err_t IO_EXTENSION_Pwm_Output(io_extension_obj_t *obj, uint8_t value)
{
  return io_extension_write_reg(obj, IO_EXTENSION_REG_PWM, scalePwm(value));
}

uint8_t IO_EXTENSION_Input(io_extension_obj_t *obj, uint8_t pin)
{
  uint8_t value = 0;

  if (pin >= 8) {
    return 0;
  }
  if (io_extension_read_reg(obj, IO_EXTENSION_REG_INPUT, &value) != ESP_OK) {
    return 0;
  }

  return (uint8_t)((value >> pin) & 0x01);
}

uint16_t IO_EXTENSION_Adc_Input(io_extension_obj_t *obj)
{
  uint16_t value = 0;

  if (io_extension_read_word(obj, IO_EXTENSION_REG_ADC, &value) != ESP_OK) {
    return 0;
  }

  return value;
}

uint8_t IO_EXTENSION_Rtc_Int_Read(io_extension_obj_t *obj)
{
  uint8_t value = 0;

  if (io_extension_read_reg(obj, IO_EXTENSION_REG_RTC_INT, &value) != ESP_OK) {
    return 0;
  }

  return value;
}

esp_err_t IO_EXTENSION_Last_Error(io_extension_obj_t *obj)
{
  if (obj == nullptr) {
    return ESP_ERR_INVALID_ARG;
  }

  return obj->err;
}
