/*
 * Smart City Waste Monitoring System
 * ESP32 Firmware
 *
 * Sensors:
 *   - HC-SR04 Ultrasonic  → garbage fill level
 *   - IR sensor           → person approaching bin
 *   - LDR                 → ambient light (street lamp control)
 *   - Capacitive touch    → cleaner reset (ESP32 T0 / GPIO4)
 *
 * Indicators:
 *   - LED_GREEN  → bin empty  (< 40%)
 *   - LED_YELLOW → bin half   (40–80%)
 *   - LED_RED    → bin full   (> 80%)
 *   - LED_LAMP   → street lamp (on when dark)
 *
 * MQTT topics (publish):
 *   city/bins/<BIN_ID>/telemetry   → fill_pct, ir_triggered, ldr_raw, lamp_on
 *   city/bins/<BIN_ID>/events      → "FULL" | "RESET" | "APPROACH"
 *
 * MQTT topics (subscribe):
 *   city/bins/<BIN_ID>/cmd         → "RESET" (remote reset from server)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ── WiFi credentials ────────────────────────────────────────────────────────
#define WIFI_SSID     "YOUR_SSID"
#define WIFI_PASSWORD "YOUR_PASSWORD"

// ── MQTT broker ─────────────────────────────────────────────────────────────
#define MQTT_BROKER   "iot.dan1718.dev"  // Production server
#define MQTT_PORT     1883
#define MQTT_USER     "smartcity"
#define MQTT_PASSWORD "password"

// ── Unique bin identifier ────────────────────────────────────────────────────
// Change per device before flashing, or derive from ESP32 MAC at runtime
#define BIN_ID        "BIN_001"

// ── Pin definitions ──────────────────────────────────────────────────────────
// Ultrasonic (HC-SR04)
#define PIN_TRIG      5
#define PIN_ECHO      18

// IR sensor (active LOW — LOW means object detected)
#define PIN_IR        19

// LDR (analog)
#define PIN_LDR       34    // ADC1_CH6 — use only ADC1 pins when WiFi is on

// Capacitive touch (ESP32 built-in, T0)
#define PIN_TOUCH     T0    // GPIO4

// LEDs
#define PIN_LED_GREEN  25
#define PIN_LED_YELLOW 26
#define PIN_LED_RED    27
#define PIN_LED_LAMP   32

// ── Physical bin dimensions ──────────────────────────────────────────────────
// Distance from sensor (mounted at lid) to empty bin floor, in cm
#define BIN_EMPTY_CM  30.0f
// Distance at which bin is considered completely full, in cm
#define BIN_FULL_CM    5.0f

// ── Thresholds ───────────────────────────────────────────────────────────────
#define FILL_HALF_PCT      40
#define FILL_FULL_PCT      80
#define LDR_DARK_THRESHOLD 1500   // ADC value below which it's considered dark
#define TOUCH_THRESHOLD    40     // capacitive touch sensitivity (lower = more sensitive)

// ── Timing ───────────────────────────────────────────────────────────────────
#define TELEMETRY_INTERVAL_MS  10000UL   // publish telemetry every 10 s
#define DEBOUNCE_MS             500UL

// ── MQTT topics ──────────────────────────────────────────────────────────────
char topicTelemetry[64];
char topicEvents[64];
char topicCmd[64];

// ── State ────────────────────────────────────────────────────────────────────
bool     binFull          = false;
bool     awaitingReset    = false;
uint8_t  lastFillPct      = 0;
uint32_t lastTelemetryMs  = 0;
uint32_t lastIrMs         = 0;
bool     lastIrState      = false;

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

float measureDistanceCm() {
  // Send 10µs pulse
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Measure echo duration; timeout = 30 ms (covers ~500 cm)
  long duration = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duration == 0) return BIN_EMPTY_CM;  // no echo → treat as empty

  float distCm = duration * 0.0343f / 2.0f;
  return constrain(distCm, 0.0f, BIN_EMPTY_CM);
}

uint8_t distanceToFillPct(float distCm) {
  // When distance is BIN_EMPTY_CM → 0%; when BIN_FULL_CM → 100%
  float pct = (BIN_EMPTY_CM - distCm) / (BIN_EMPTY_CM - BIN_FULL_CM) * 100.0f;
  return (uint8_t) constrain(pct, 0.0f, 100.0f);
}

void setStatusLEDs(uint8_t fillPct) {
  digitalWrite(PIN_LED_GREEN,  fillPct <  FILL_HALF_PCT ? HIGH : LOW);
  digitalWrite(PIN_LED_YELLOW, (fillPct >= FILL_HALF_PCT && fillPct < FILL_FULL_PCT) ? HIGH : LOW);
  digitalWrite(PIN_LED_RED,    fillPct >= FILL_FULL_PCT  ? HIGH : LOW);
}

// ────────────────────────────────────────────────────────────────────────────
// MQTT
// ────────────────────────────────────────────────────────────────────────────

void publishEvent(const char* event) {
  StaticJsonDocument<128> doc;
  doc["bin_id"]    = BIN_ID;
  doc["event"]     = event;
  doc["timestamp"] = millis();   // relative; server uses wall clock

  char buf[128];
  serializeJson(doc, buf);
  mqtt.publish(topicEvents, buf, /*retained=*/false);
  Serial.printf("[MQTT] Event → %s : %s\n", topicEvents, buf);
}

void publishTelemetry(uint8_t fillPct, bool irTriggered, int ldrRaw, bool lampOn) {
  StaticJsonDocument<256> doc;
  doc["bin_id"]      = BIN_ID;
  doc["fill_pct"]    = fillPct;
  doc["ir_triggered"]= irTriggered;
  doc["ldr_raw"]     = ldrRaw;
  doc["lamp_on"]     = lampOn;
  doc["awaiting_reset"] = awaitingReset;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(topicTelemetry, buf, /*retained=*/true);
  Serial.printf("[MQTT] Telemetry → fill=%d%% ir=%d ldr=%d lamp=%d\n",
                fillPct, irTriggered, ldrRaw, lampOn);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[64] = {0};
  memcpy(msg, payload, min((unsigned int)63, length));

  Serial.printf("[MQTT] Received on %s: %s\n", topic, msg);

  if (strcmp(msg, "RESET") == 0) {
    Serial.println("[CMD] Remote reset received.");
    awaitingReset = false;
    binFull       = false;
    publishEvent("RESET");
  }
}

bool connectMQTT() {
  uint8_t attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    Serial.printf("[MQTT] Connecting as %s...\n", BIN_ID);
    bool ok = (strlen(MQTT_USER) > 0)
      ? mqtt.connect(BIN_ID, MQTT_USER, MQTT_PASSWORD)
      : mqtt.connect(BIN_ID);

    if (ok) {
      Serial.println("[MQTT] Connected.");
      mqtt.subscribe(topicCmd);
      return true;
    }
    Serial.printf("[MQTT] Failed (rc=%d), retry in 2s\n", mqtt.state());
    delay(2000);
    attempts++;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n[BOOT] Smart Bin " BIN_ID);

  // Pin modes
  pinMode(PIN_TRIG,       OUTPUT);
  pinMode(PIN_ECHO,       INPUT);
  pinMode(PIN_IR,         INPUT);
  pinMode(PIN_LDR,        INPUT);
  pinMode(PIN_LED_GREEN,  OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED,    OUTPUT);
  pinMode(PIN_LED_LAMP,   OUTPUT);

  // Startup LED test — all on briefly
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_YELLOW, HIGH);
  digitalWrite(PIN_LED_RED, HIGH);
  digitalWrite(PIN_LED_LAMP, HIGH);
  delay(800);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_LED_LAMP, LOW);

  // Build MQTT topic strings
  snprintf(topicTelemetry, sizeof(topicTelemetry), "city/bins/%s/telemetry", BIN_ID);
  snprintf(topicEvents,    sizeof(topicEvents),    "city/bins/%s/events",    BIN_ID);
  snprintf(topicCmd,       sizeof(topicCmd),       "city/bins/%s/cmd",       BIN_ID);

  // WiFi
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());

  // MQTT
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  connectMQTT();
}

// ────────────────────────────────────────────────────────────────────────────
// Loop
// ────────────────────────────────────────────────────────────────────────────

void loop() {
  // Maintain MQTT connection
  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();

  uint32_t now = millis();

  // ── 1. Read sensors ───────────────────────────────────────────────────────

  float    distCm   = measureDistanceCm();
  uint8_t  fillPct  = distanceToFillPct(distCm);
  bool     irNow    = (digitalRead(PIN_IR) == LOW);   // active LOW
  int      ldrRaw   = analogRead(PIN_LDR);
  bool     lampOn   = (ldrRaw < LDR_DARK_THRESHOLD);
  bool     touched  = (touchRead(PIN_TOUCH) < TOUCH_THRESHOLD);

  // ── 2. Street lamp control ────────────────────────────────────────────────
  digitalWrite(PIN_LED_LAMP, lampOn ? HIGH : LOW);

  // ── 3. Status LEDs ────────────────────────────────────────────────────────
  setStatusLEDs(fillPct);

  // ── 4. IR approach detection (debounced) ──────────────────────────────────
  if (irNow && !lastIrState && (now - lastIrMs > DEBOUNCE_MS)) {
    lastIrMs = now;
    Serial.println("[IR] Person approaching.");
    publishEvent("APPROACH");
  }
  lastIrState = irNow;

  // ── 5. Full bin detection ─────────────────────────────────────────────────
  if (fillPct >= FILL_FULL_PCT && !binFull) {
    binFull       = true;
    awaitingReset = true;
    Serial.printf("[BIN] FULL detected at %d%%\n", fillPct);
    publishEvent("FULL");
  }

  // ── 6. Capacitive touch reset (physical) ─────────────────────────────────
  if (touched && awaitingReset) {
    Serial.println("[TOUCH] Cleaner reset triggered.");
    awaitingReset = false;
    binFull       = false;
    publishEvent("RESET");
    delay(DEBOUNCE_MS);   // prevent double-fire
  }

  // ── 7. Periodic telemetry ─────────────────────────────────────────────────
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    publishTelemetry(fillPct, irNow, ldrRaw, lampOn);
  }

  delay(100);   // 10 Hz sensor polling
}
