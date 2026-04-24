# Smart Bin — ESP32 Wiring Reference

## Ultrasonic Sensor (HC-SR04)
| HC-SR04 Pin | ESP32 Pin |
|-------------|-----------|
| VCC         | 5V        |
| GND         | GND       |
| TRIG        | GPIO 5    |
| ECHO        | GPIO 18 (via 1kΩ + 2kΩ voltage divider → 3.3V) |

> HC-SR04 ECHO outputs 5V — use a voltage divider to protect the ESP32.

## IR Sensor (e.g. FC-51 or TCRT5000 module)
| IR Module Pin | ESP32 Pin |
|---------------|-----------|
| VCC           | 3.3V      |
| GND           | GND       |
| OUT           | GPIO 19   |

> Module output is active LOW (LOW = object detected).

## LDR (with 10kΩ pull-down voltage divider)
```
3.3V ── LDR ──┬── GPIO 34 (ADC)
              └── 10kΩ ── GND
```
> Higher ADC value = brighter. Threshold is 1500 (configurable).

## Capacitive Touch
| Function      | ESP32 Pin |
|---------------|-----------|
| Cleaner reset | T0 / GPIO 4 (touch pad, no extra hardware needed) |

## LEDs (with 220Ω series resistors)
| LED           | ESP32 Pin |
|---------------|-----------|
| Green (empty) | GPIO 25   |
| Yellow (half) | GPIO 26   |
| Red (full)    | GPIO 27   |
| Street lamp   | GPIO 32   |

## Power
- Power the ESP32 via USB or 3.3V regulator.
- HC-SR04 needs 5V; use USB 5V rail.

## Required Arduino Libraries
Install via Arduino Library Manager or PlatformIO:
- `PubSubClient` by Nick O'Leary (MQTT client)
- `ArduinoJson` by Benoit Blanchon (JSON serialization)
- WiFi — built into ESP32 Arduino core

## Configuration (in smart_bin.ino)
| Constant         | Description                        |
|------------------|------------------------------------|
| `WIFI_SSID`      | Your WiFi network name             |
| `WIFI_PASSWORD`  | Your WiFi password                 |
| `MQTT_BROKER`    | IP of your Mosquitto broker        |
| `BIN_ID`         | Unique ID per physical bin device  |
| `BIN_EMPTY_CM`   | Distance (cm) from sensor to floor |
