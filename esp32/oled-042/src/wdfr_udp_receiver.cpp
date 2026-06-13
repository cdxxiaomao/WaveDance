// PlatformIO LDF 只扫描本目录 .cpp 的 #include，不会跟进 #include 的 .cpp。
// 须在顶层 include WiFi，LDF 才会加入 WiFi 库头文件路径。
#if WAVEDANCE_WIFI_UDP
#include <WiFi.h>
#include <WiFiUdp.h>
#endif

#include "../../src/udp_receiver.cpp"
