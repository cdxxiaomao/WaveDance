#include "udp_receiver.h"

#if WAVEDANCE_WIFI_UDP

#include <WiFi.h>
#include <WiFiUdp.h>
#include <esp_wifi.h>

#include <string.h>

#include "wifi_config.h"

namespace {

enum class Phase : uint8_t {
  kBootWait,
  kNeedStart,
  kConnecting,
  kReady,
  kCooldown,
};

struct ApCandidate {
  int8_t rssi;
  uint8_t channel;
  uint8_t bssid[6];
  wifi_auth_mode_t auth;
};

constexpr int kMaxApCandidates = 6;
constexpr int kSimpleAttemptsBeforeScan = 8;

WiFiUDP g_udp;
Phase g_phase = Phase::kBootWait;
ApCandidate g_ap_candidates[kMaxApCandidates];
int g_ap_candidate_count = 0;
bool g_wifi_ready = false;
bool g_logged_ready = false;
bool g_got_ip = false;
bool g_events_registered = false;
bool g_mac_logged = false;
uint32_t g_boot_ms = 0;
uint32_t g_phase_started_ms = 0;
uint32_t g_next_retry_ms = 0;
uint32_t g_frames_ok = 0;
uint32_t g_frames_bad = 0;
uint8_t g_attempt = 0;
int g_last_disconnect_reason = 0;

constexpr size_t kMaxPacket = 512;
constexpr uint32_t kBootDelayMs = 2500;
constexpr uint32_t kConnectTimeoutMs = 45000;
constexpr uint32_t kRetryIntervalMs = 5000;
constexpr uint32_t kAuthFailCooldownMs = 20000;
constexpr uint32_t kRadioWarmupMs = 400;

const char *wifi_status_name(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS:
      return "IDLE";
    case WL_NO_SSID_AVAIL:
      return "NO_SSID";
    case WL_SCAN_COMPLETED:
      return "SCAN_DONE";
    case WL_CONNECTED:
      return "CONNECTED";
    case WL_CONNECT_FAILED:
      return "CONNECT_FAIL";
    case WL_CONNECTION_LOST:
      return "LOST";
    case WL_DISCONNECTED:
      return "DISCONNECTED";
    default:
      return "UNKNOWN";
  }
}

const char *auth_mode_name(wifi_auth_mode_t auth) {
  switch (auth) {
    case WIFI_AUTH_OPEN:
      return "OPEN";
    case WIFI_AUTH_WEP:
      return "WEP";
    case WIFI_AUTH_WPA_PSK:
      return "WPA";
    case WIFI_AUTH_WPA2_PSK:
      return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:
      return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE:
      return "WPA2-ENT";
    case WIFI_AUTH_WPA3_PSK:
      return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK:
      return "WPA2/WPA3";
    default:
      return "OTHER";
  }
}

void on_wifi_got_ip(WiFiEvent_t, WiFiEventInfo_t info) {
  (void)info;
  g_got_ip = true;
  Serial.print("WiFi got IP: ");
  Serial.println(WiFi.localIP());
}

void on_wifi_disconnected(WiFiEvent_t, WiFiEventInfo_t info) {
  g_got_ip = false;
  g_last_disconnect_reason = info.wifi_sta_disconnected.reason;
  Serial.print("WiFi disconnected, reason=");
  Serial.println(g_last_disconnect_reason);
}

void register_wifi_events() {
  if (g_events_registered) {
    return;
  }
  WiFi.onEvent(on_wifi_got_ip, ARDUINO_EVENT_WIFI_STA_GOT_IP);
  WiFi.onEvent(on_wifi_disconnected, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  g_events_registered = true;
}

void apply_wifi_tuning() {
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
#if defined(WIFI_AUTH_WPA_PSK)
  WiFi.setMinSecurity(WIFI_AUTH_WPA_PSK);
#endif
  esp_wifi_set_ps(WIFI_PS_NONE);

  wifi_country_t country = {};
  strncpy(country.cc, "CN", sizeof(country.cc));
  country.schan = 1;
  country.nchan = 13;
  country.policy = WIFI_COUNTRY_POLICY_AUTO;
  esp_wifi_set_country(&country);
}

void log_mac_once() {
  if (g_mac_logged) {
    return;
  }
  g_mac_logged = true;
  Serial.print("ESP MAC (for router whitelist): ");
  Serial.println(WiFi.macAddress());
}

void log_creds_meta() {
  Serial.print("  creds ssid_len=");
  Serial.print(strlen(WAVEDANCE_WIFI_SSID));
  Serial.print(" pass_len=");
  Serial.println(strlen(WAVEDANCE_WIFI_PASS));
}

void reset_wifi_radio_full() {
  apply_wifi_tuning();
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  delay(kRadioWarmupMs);
  WiFi.mode(WIFI_STA);
  delay(200);
  apply_wifi_tuning();
  log_mac_once();
}

void insert_ap_candidate(int8_t rssi, uint8_t channel, const uint8_t *bssid,
                         wifi_auth_mode_t auth) {
  if (g_ap_candidate_count >= kMaxApCandidates) {
    return;
  }

  int insert_at = g_ap_candidate_count;
  for (int i = 0; i < g_ap_candidate_count; ++i) {
    if (rssi > g_ap_candidates[i].rssi) {
      insert_at = i;
      break;
    }
  }

  for (int i = g_ap_candidate_count; i > insert_at; --i) {
    g_ap_candidates[i] = g_ap_candidates[i - 1];
  }

  g_ap_candidates[insert_at].rssi = rssi;
  g_ap_candidates[insert_at].channel = channel;
  g_ap_candidates[insert_at].auth = auth;
  memcpy(g_ap_candidates[insert_at].bssid, bssid, 6);
  ++g_ap_candidate_count;
}

bool collect_ap_candidates() {
  g_ap_candidate_count = 0;

  Serial.print("Scanning for \"");
  Serial.print(WAVEDANCE_WIFI_SSID);
  Serial.println("\"...");

  const int count = WiFi.scanNetworks(false, false);
  Serial.print("WiFi scan found ");
  Serial.print(count);
  Serial.println(" networks");

  for (int i = 0; i < count; ++i) {
    if (WiFi.SSID(i) != WAVEDANCE_WIFI_SSID) {
      continue;
    }
    insert_ap_candidate((int8_t)WiFi.RSSI(i), (uint8_t)WiFi.channel(i),
                        WiFi.BSSID(i), WiFi.encryptionType(i));
  }

  if (g_ap_candidate_count == 0) {
    Serial.println("SSID not found. Use 2.4GHz WiFi and check wifi_config.h");
    return false;
  }

  Serial.print("Matched ");
  Serial.print(g_ap_candidate_count);
  Serial.println(" AP(s):");
  for (int i = 0; i < g_ap_candidate_count; ++i) {
    const ApCandidate &ap = g_ap_candidates[i];
    Serial.print("  #");
    Serial.print(i + 1);
    Serial.print(" ch=");
    Serial.print(ap.channel);
    Serial.print(" RSSI=");
    Serial.print(ap.rssi);
    Serial.print(" ");
    Serial.println(auth_mode_name(ap.auth));
  }
  return true;
}

bool begin_simple() {
  Serial.println("Mode: simple WiFi.begin (mesh / auto AP pick)");
  log_creds_meta();
  WiFi.disconnect(false);
  delay(200);
  WiFi.begin(WAVEDANCE_WIFI_SSID, WAVEDANCE_WIFI_PASS);
  return true;
}

bool begin_with_candidate(int rank) {
  if (rank < 0 || rank >= g_ap_candidate_count) {
    return false;
  }
  const ApCandidate &ap = g_ap_candidates[rank];
  Serial.print("Mode: locked AP #");
  Serial.print(rank + 1);
  Serial.print(" ch=");
  Serial.print(ap.channel);
  Serial.print(" RSSI=");
  Serial.print(ap.rssi);
  Serial.print(" ");
  Serial.println(auth_mode_name(ap.auth));
  log_creds_meta();

  WiFi.disconnect(false);
  delay(200);
  WiFi.begin(WAVEDANCE_WIFI_SSID, WAVEDANCE_WIFI_PASS, ap.channel, ap.bssid);
  return true;
}

bool start_wifi_connect() {
  // mesh 环境：前几次只用 WiFi.begin，不锁 BSSID（成功率更高）
  if (g_attempt <= kSimpleAttemptsBeforeScan) {
    return begin_simple();
  }

  if (!collect_ap_candidates()) {
    return begin_simple();
  }

  const int rank = (g_attempt - kSimpleAttemptsBeforeScan - 1) % g_ap_candidate_count;
  return begin_with_candidate(rank);
}

void schedule_retry() {
  g_udp.stop();
  g_wifi_ready = false;
  g_logged_ready = false;
  g_got_ip = false;
  WiFi.disconnect(false);

  uint32_t cooldown = kRetryIntervalMs;
  if (g_last_disconnect_reason == 2 || g_last_disconnect_reason == 15 ||
      g_last_disconnect_reason == 39 || g_last_disconnect_reason == 202) {
    cooldown = kAuthFailCooldownMs;
    Serial.println("Retry cooldown extended (auth/assoc issue or router limit)");
  }

  g_phase = Phase::kCooldown;
  g_next_retry_ms = millis() + cooldown;
}

void start_connect_attempt() {
  register_wifi_events();
  g_got_ip = false;
  ++g_attempt;

  Serial.print("WiFi connect attempt ");
  Serial.println(g_attempt);

  if (g_attempt == 1) {
    reset_wifi_radio_full();
  } else {
    apply_wifi_tuning();
  }

  if (!start_wifi_connect()) {
    schedule_retry();
    return;
  }

  g_phase = Phase::kConnecting;
  g_phase_started_ms = millis();
}

void try_bind_udp() {
  if (!g_udp.begin(WDFR_UDP_PORT)) {
    Serial.println("UDP bind failed");
    schedule_retry();
    return;
  }
  g_wifi_ready = true;
  g_phase = Phase::kReady;
  if (!g_logged_ready) {
    g_logged_ready = true;
    Serial.print("WiFi UDP ready on ");
    Serial.print(WiFi.localIP());
    Serial.print(":");
    Serial.println(WDFR_UDP_PORT);
  }
}

void log_connect_timeout() {
  Serial.print("WiFi connect timeout, attempt ");
  Serial.println(g_attempt);
  Serial.print("  status=");
  Serial.println(wifi_status_name(WiFi.status()));
  if (g_last_disconnect_reason != 0) {
    Serial.print("  last_reason=");
    Serial.println(g_last_disconnect_reason);
  }
  Serial.println("  hints: 2=bad pass/auth, 39=assoc timeout, 202=bad password");
}

}  // namespace

void udp_receiver_init() {
  g_phase = Phase::kBootWait;
  g_boot_ms = millis();
  g_wifi_ready = false;
  g_logged_ready = false;
  g_got_ip = false;
  g_mac_logged = false;
  g_attempt = 0;
  g_ap_candidate_count = 0;
  g_frames_ok = 0;
  g_frames_bad = 0;
  g_last_disconnect_reason = 0;
}

void udp_receiver_service() {
  const uint32_t now = millis();

  switch (g_phase) {
    case Phase::kBootWait:
      if (now - g_boot_ms >= kBootDelayMs) {
        g_phase = Phase::kNeedStart;
      }
      break;

    case Phase::kNeedStart:
      start_connect_attempt();
      break;

    case Phase::kConnecting:
      if (g_got_ip || WiFi.status() == WL_CONNECTED) {
        try_bind_udp();
      } else if (now - g_phase_started_ms >= kConnectTimeoutMs) {
        log_connect_timeout();
        schedule_retry();
      }
      break;

    case Phase::kReady:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi lost while ready, retrying...");
        schedule_retry();
      }
      break;

    case Phase::kCooldown:
      if (now >= g_next_retry_ms) {
        g_phase = Phase::kNeedStart;
      }
      break;
  }
}

bool udp_receiver_connecting() {
  return g_phase == Phase::kBootWait || g_phase == Phase::kNeedStart ||
         g_phase == Phase::kConnecting || g_phase == Phase::kCooldown;
}

bool udp_receiver_ready() {
  return g_phase == Phase::kReady && g_wifi_ready && WiFi.status() == WL_CONNECTED;
}

uint8_t udp_receiver_attempt_count() { return g_attempt; }

const char *udp_receiver_local_ip() {
  static char ip_buf[16];
  if (!udp_receiver_ready()) {
    ip_buf[0] = '\0';
    return ip_buf;
  }
  snprintf(ip_buf, sizeof(ip_buf), "%s", WiFi.localIP().toString().c_str());
  return ip_buf;
}

bool udp_receiver_poll_frame(WdfrFrame *out) {
  if (out == nullptr || !udp_receiver_ready()) {
    return false;
  }

  const int packet_size = g_udp.parsePacket();
  if (packet_size <= 0) {
    return false;
  }

  if (packet_size > (int)kMaxPacket) {
    while (g_udp.available() > 0) {
      g_udp.read();
    }
    ++g_frames_bad;
    return false;
  }

  uint8_t buf[kMaxPacket];
  const int n = g_udp.read(buf, packet_size);
  if (n <= 0) {
    return false;
  }

  if (wdfr_decode_frame(buf, (size_t)n, out)) {
    ++g_frames_ok;
    return true;
  }

  ++g_frames_bad;
  return false;
}

uint32_t udp_receiver_frames_ok() { return g_frames_ok; }

uint32_t udp_receiver_frames_bad() { return g_frames_bad; }

#endif
