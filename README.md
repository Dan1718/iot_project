# Smart City Waste Monitoring and Alert System

--- Heavy ai usage alert, this was for a demo project
This repository contains a complete end-to-end smart waste monitoring platform built around an ESP32 smart bin, a city-scale simulator, a FastAPI backend, InfluxDB time-series storage, Grafana analytics, a worker web console, a browser-based demo control panel, and a mobile worker app.

The project started as a single smart dustbin demonstration and was extended into a city-scale platform that can model hundreds of bins across Hyderabad, detect patterns in waste accumulation, and support operational decisions such as collection timing, overload detection, and future bin placement.

## 1. What This Project Does

The system solves two related problems:

1. A **physical smart bin** can measure fill level and publish live telemetry.
2. A **city simulation layer** can mock many bins at once so analytics and dashboards are meaningful even with only one real device.

At runtime, the platform can:

- monitor the fill level of a dustbin
- detect people approaching the bin
- detect low light and switch a street lamp indicator
- show local LED status on the device
- allow a cleaner to reset the bin physically or remotely
- stream telemetry into a backend
- store time-series records in InfluxDB
- visualize patterns in Grafana
- let a worker operate the system from a web console or mobile app
- demonstrate a physical bin using a browser-based mock control panel

## 2. High-Level Architecture

The project has six layers:

1. **ESP32 firmware**
2. **MQTT broker**
3. **FastAPI backend**
4. **InfluxDB**
5. **Grafana**
6. **Operator interfaces**

### Runtime architecture

```text
ESP32 Smart Bin / Browser Mock Panel
        |
        | MQTT
        v
Mosquitto Broker
        |
        | subscribed by
        v
FastAPI Backend
        |
        | writes time-series
        v
InfluxDB
        |
        | queried by
        v
Grafana Dashboard

FastAPI Backend  ---> Worker Web Console (REST)
FastAPI Backend  ---> Worker Mobile App (REST polling)
```

### Important implementation detail

The physical demonstration bin is represented as:

- `bin_id = BIN_001`
- `zone = Demo Bin`

This lets one real bin appear in the same analytics ecosystem as the simulated city bins.

## 3. Core Concepts

### 3.1 Physical bin vs simulated bins

- `BIN_001` is the physical or demo bin.
- `HYD_001` to `HYD_100` are simulated Hyderabad bins.

The simulator intentionally skips publishing telemetry for `BIN_001`, so only the real ESP32 or the browser mock panel controls that bin.

### 3.2 Zone meaning

For the simulated city, a zone represents a neighborhood or area such as:

- Charminar
- Hitech City
- Ameerpet
- Koti
- Uppal

For the physical demo, one bin is treated as one zone:

- `Demo Bin`

### 3.3 Interfaces

This repository exposes three human-facing operator surfaces:

1. **Grafana dashboard**
2. **Worker web console**
3. **Worker mobile app**

It also exposes one demo/testing interface:

1. **Smart Bin Demo Control Panel**

## 4. Technology Stack

| Layer                 | Technology                               | Purpose                                                     |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Device firmware       | ESP32 + Arduino C++                      | Sensor reading, LEDs, MQTT publishing                       |
| Broker                | Mosquitto                                | Lightweight MQTT routing                                    |
| Backend               | FastAPI                                  | Stores latest state, exposes REST API, sends reset commands |
| Time-series DB        | InfluxDB 2.x                             | Stores telemetry and events                                 |
| Dashboard             | Grafana                                  | Analytics and alert visualization                           |
| City simulator        | Python                                   | Creates realistic historical and live bin traffic           |
| Web worker console    | React + Vite                             | Staff-facing browser console                                |
| Mobile worker console | Expo / React Native                      | Staff-facing mobile app                                     |
| Demo panel            | Static HTML/CSS/JS + MQTT over WebSocket | Simulated physical bin control                              |

## 5. Repository Structure

```text
iot_project/
├── backend/                      FastAPI backend and MQTT subscriber
├── firmware/smart_bin/           ESP32 firmware and wiring reference
├── grafana/                      Grafana dashboard and provisioning
├── mockpanel/                    Browser-based physical bin simulator
├── mosquitto/config/             Mosquitto broker configuration
├── simulator/                    Hyderabad city simulator and backfill
├── worker-console/               React worker web app
├── worker-mobile/                Expo worker mobile app
├── docker-compose.yml            Full stack orchestration
├── .env                          Local configuration
└── README.md                     This file
```

## 6. Services and Ports

When the stack is running, these are the important ports:

| Service            | URL / Port              | Purpose                                   |
| ------------------ | ----------------------- | ----------------------------------------- |
| FastAPI backend    | `http://localhost:8000` | REST API                                  |
| Mock panel         | `http://localhost:8080` | Demo control panel                        |
| Worker web console | `http://localhost:8081` | Browser worker app                        |
| Grafana            | `http://localhost:3000` | Dashboard                                 |
| InfluxDB           | `http://localhost:8086` | Time-series DB                            |
| MQTT TCP           | `localhost:1883`        | MQTT broker for ESP32, simulator, backend |
| MQTT WebSocket     | `ws://localhost:9001`   | MQTT for browser clients                  |

## 7. Authentication Model

The project currently uses a simple separation:

### Unauthenticated transport endpoints

The following are intentionally left unauthenticated for local development and demo simplicity:

- FastAPI API endpoints
- Mosquitto broker endpoints
- Grafana internal datasource/backend plumbing

### Passcode-gated UI entry points

The human-facing UIs require a passcode:

| UI                 | Passcode   |
| ------------------ | ---------- |
| Worker web console | `password` |
| Worker mobile app  | `password` |
| Demo control panel | `password` |

This means UI access is gated, but device/API traffic is not blocked by auth.

## 8. Sensors and Device Meaning

The physical smart bin is built around the following sensors and indicators:

| Component         | Role                                        |
| ----------------- | ------------------------------------------- |
| Ultrasonic sensor | Measures distance from lid to garbage level |
| IR sensor         | Detects a person approaching                |
| LDR               | Detects day/night conditions                |
| Capacitive touch  | Lets a cleaner reset the bin                |
| LEDs              | Show empty / half / full / lamp states      |

### Status logic

- Green LED: fill level below 40%
- Yellow LED: fill level between 40% and 79%
- Red LED: fill level 80% or above
- Lamp LED: turns on when LDR indicates low light

### Reset logic

A bin can be reset three ways:

1. Capacitive touch on the ESP32
2. Browser demo panel reset
3. Remote worker reset from the backend/worker console

## 9. Wiring Reference

Full wiring details are in `firmware/smart_bin/WIRING.md`.

### Main pin mapping

| Function        | ESP32 Pin     |
| --------------- | ------------- |
| Ultrasonic TRIG | `GPIO 5`      |
| Ultrasonic ECHO | `GPIO 18`     |
| IR sensor       | `GPIO 19`     |
| LDR             | `GPIO 34`     |
| Touch reset     | `GPIO 4 / T0` |
| Green LED       | `GPIO 25`     |
| Yellow LED      | `GPIO 26`     |
| Red LED         | `GPIO 27`     |
| Lamp LED        | `GPIO 32`     |

Important hardware note:

- HC-SR04 `ECHO` is 5V and must be level-shifted or reduced using a resistor divider before connecting to ESP32.

## 10. Firmware Behavior

The ESP32 firmware:

- connects to Wi-Fi
- connects to the MQTT broker
- reads the ultrasonic distance and converts it to fill percent
- publishes telemetry periodically
- publishes event messages for `FULL`, `APPROACH`, and `RESET`
- listens for remote `RESET` commands on MQTT

### Firmware configuration

Edit `firmware/smart_bin/smart_bin.ino` before flashing.

Key values:

```cpp
#define WIFI_SSID     "YourNetwork"
#define WIFI_PASSWORD "YourWifiPassword"
#define MQTT_BROKER   "192.168.x.x"
#define MQTT_PORT     1883
#define MQTT_USER     "smartcity"
#define MQTT_PASSWORD "password"
#define BIN_ID        "BIN_001"
```

### Meaning of important firmware constants

| Constant                | Meaning                              |
| ----------------------- | ------------------------------------ |
| `BIN_EMPTY_CM`          | Sensor-to-floor distance when empty  |
| `BIN_FULL_CM`           | Sensor distance considered “full”    |
| `FILL_HALF_PCT`         | Threshold for yellow LED             |
| `FILL_FULL_PCT`         | Threshold for red LED and full event |
| `LDR_DARK_THRESHOLD`    | ADC value below which lamp turns on  |
| `TELEMETRY_INTERVAL_MS` | How often telemetry is published     |

## 11. MQTT Topic Design

MQTT is used as the event bus between devices and the backend.

### Topics

```text
city/bins/<BIN_ID>/telemetry
city/bins/<BIN_ID>/events
city/bins/<BIN_ID>/cmd
city/alerts
```

### Topic meaning

#### `city/bins/<BIN_ID>/telemetry`

Published by:

- real ESP32
- browser demo panel
- simulator

Contains fields like:

- `bin_id`
- `fill_pct`
- `ir_triggered`
- `ldr_raw`
- `lamp_on`
- `awaiting_reset`

#### `city/bins/<BIN_ID>/events`

Published by devices/simulator for state transitions:

- `FULL`
- `RESET`
- `APPROACH`

#### `city/bins/<BIN_ID>/cmd`

Published by backend when a worker performs a reset.

Current command used:

- `RESET`

#### `city/alerts`

Internal topic for alert forwarding to worker UIs.

## 12. Backend Responsibilities

The FastAPI backend does not just expose REST. It also maintains live operational state.

### What the backend does

- subscribes to all bin MQTT traffic
- keeps latest known state per bin in memory
- stores telemetry and events into InfluxDB
- exposes current status via REST
- publishes MQTT reset commands when a worker clicks reset
- auto-registers physical bins if needed
- accepts bin metadata registration from the simulator

### Backend REST endpoints

| Endpoint                 | Method | Meaning                            |
| ------------------------ | ------ | ---------------------------------- |
| `/health`                | GET    | Health check                       |
| `/bins`                  | GET    | Latest status of all bins          |
| `/bins/full`             | GET    | Bins currently awaiting collection |
| `/bins/{bin_id}`         | GET    | Status of one bin                  |
| `/bins/{bin_id}/reset`   | POST   | Send a reset command to a bin      |
| `/bins/register`         | POST   | Register static metadata for a bin |
| `/bins/physical`         | GET    | Physical bins only                 |
| `/webhook/grafana-alert` | POST   | Alert receiver for Grafana         |

### Example response from `/bins/BIN_001`

```json
{
  "bin_id": "BIN_001",
  "fill_pct": 30,
  "awaiting_reset": false,
  "last_seen": "2026-04-23T22:52:36.567038+00:00",
  "zone": "Demo Bin",
  "lat": 17.385,
  "lon": 78.4867
}
```

## 13. InfluxDB Data Model

InfluxDB stores two main measurements.

### `bin_telemetry`

Fields written include:

- `fill_pct`
- `ir_triggered`
- `ldr_raw`
- `lamp_on`
- `awaiting_reset`
- `lat`
- `lon`

Tags include:

- `bin_id`
- `zone`

### `bin_events`

Tags include:

- `bin_id`
- `zone`
- `event_type`

Field:

- `value = 1`

This lets Grafana easily aggregate event counts such as:

- resets by zone
- full events per hour
- approach counts over time

### Retention policy

The system is configured to keep **7 days** of history in `waste_monitoring`.

This was chosen to:

- keep recent analytics available
- avoid disk growth issues
- still provide enough pattern history for dashboards

## 14. Grafana Dashboard Meaning

The main dashboard is:

- **Smart City Waste Monitoring — Hyderabad**

It is provisioned automatically on startup.

### What the main panels mean

| Panel                               | Meaning                                   |
| ----------------------------------- | ----------------------------------------- |
| City-wide Average Fill Level        | Average current fill across the city bins |
| Bins Awaiting Collection            | Count of bins that are effectively full   |
| Approach Events                     | Footfall/interaction indicator            |
| Collections Today                   | Number of RESET events                    |
| Street Lamps On                     | Number of low-light bins                  |
| Average Fill Level by Zone          | Which zones are filling faster            |
| Fill Level Over Time — Avg per Zone | Per-zone trend lines over time            |
| Event Timeline                      | FULL / APPROACH / RESET event activity    |
| Top 10 Bins                         | Highest fill bins right now               |
| Collections by Zone                 | Where cleanup workload is concentrated    |
| Physical Bin section                | Dedicated monitoring for `BIN_001`        |

### Important dashboard cleanup logic

Older historical data once contained incorrect `zone` tags like `HYD_001` and `BIN_001`. The dashboard queries now explicitly filter those legacy tags out so charts group by proper zones only.

## 15. Alerts and Their Meaning

The project includes Grafana alert rules.

### Demo bin alerts

| Alert                 | Meaning                                                 |
| --------------------- | ------------------------------------------------------- |
| `DemoBinFull`         | `BIN_001` reached or exceeded 80%                       |
| `DemoBinNoCollection` | `BIN_001` remained full for the demo collection timeout |

### City alerts

| Alert                 | Meaning                                                |
| --------------------- | ------------------------------------------------------ |
| `BinFullNoCollection` | One or more simulated bins stayed full too long        |
| `ZoneOverload`        | A zone has multiple full bins simultaneously           |
| `CityFillSpike`       | City-wide average fill level is unusually high         |
| `NoCollectionsInZone` | A simulated zone had no reset events for a long period |

## 16. City Simulator

The simulator models a realistic city, not random noise.

### What it simulates

- 100 Hyderabad bins
- per-zone fill rates
- time-of-day usage peaks
- event generation
- automatic truck collection behavior
- night/day lighting patterns

### Current important behavior

- `BIN_001` is marked as physical and is **not simulated**
- the simulator still registers its metadata so it exists in the system
- simulated bins are `HYD_001` ... `HYD_100`

### Metadata source

Bin metadata is stored in:

- `simulator/bin_locations.json`

## 17. Historical Backfill

The backfill script populates InfluxDB with realistic historical data so Grafana is useful immediately after startup.

### Current backfill settings

- time window: **7 days**
- interval: **120 seconds**
- total points: roughly half a million

### Why it exists

Without backfill, dashboards only start filling after live traffic arrives. Backfill makes the dashboard immediately demonstrate trends, collections, and fill patterns.

## 18. Worker Web Console

The worker web console is served at:

- `http://localhost:8081`

### Purpose

It is the browser UI for sanitation staff or an operator demo.

### Current behavior

- light mode
- minimal UI
- passcode gated
- shows summary counts
- shows bins in a simple table-like list
- `BIN_001` pinned to the top
- reset button for full bins
- notifications drawer
- event list

### Passcode

- `password`

## 19. Worker Mobile App

The mobile app lives in:

- `worker-mobile/`

### Important current behavior

The mobile app originally used MQTT directly, but Expo Go proved unreliable for that transport path. It now uses **HTTP polling only**.

That means the mobile app currently depends on:

- `GET /bins`
- `GET /bins/full`
- `POST /bins/{bin_id}/reset`

### Why this matters

If mobile debugging fails, the problem is now almost always:

- wrong server IP
- phone not on same Wi-Fi
- firewall blocking port `8000`
- backend unavailable

### Mobile passcode

- `password`

### Running the mobile app

```bash
cd worker-mobile
npm start
```

Then open Expo Go and enter your server LAN IP.

## 20. Demo Control Panel

The browser demo control panel is served at:

- `http://localhost:8080`

### Purpose

It acts like a browser-based substitute for the physical ESP32. It is useful when:

- the real device is not connected
- you want to drive the dashboard live during a presentation
- you want to test reset behavior from the worker console

### Current behavior

- passcode-gated access
- can set fill level manually
- can control LDR value
- can simulate IR state
- can fire `FULL`, `RESET`, and `APPROACH` events
- auto-publishes telemetry
- subscribes to `city/bins/BIN_001/cmd`
- reacts to worker-console reset commands by dropping fill to `0%`

### Demo panel passcode

- `password`

## 21. How Reset Flow Works End-to-End

This is one of the most important system behaviors.

### Worker reset flow

1. Worker presses reset in web console or mobile app
2. App calls `POST /bins/BIN_001/reset`
3. Backend publishes `RESET` on `city/bins/BIN_001/cmd`
4. Device or demo panel receives the command
5. Device/demo panel publishes:
   - a `RESET` event
   - fresh telemetry with fill back at `0%`
6. Backend updates in-memory state
7. InfluxDB stores the event and telemetry
8. Grafana reflects the new state

## 22. How to Run Everything

### Full stack

```bash
cd /home/dan/Documents/Code/iot_project
docker compose up --build
```

### Main URLs

```text
Backend:         http://localhost:8000
Grafana:         http://localhost:3000
Mock Panel:      http://localhost:8080
Worker Console:  http://localhost:8081
```

### Grafana login

- username: `admin`
- password: `admin`

## 23. How to Connect a Real ESP32 Bin

Open `firmware/smart_bin/smart_bin.ino` and set:

```cpp
#define WIFI_SSID     "YourNetwork"
#define WIFI_PASSWORD "YourWifiPassword"
#define MQTT_BROKER   "192.168.x.x"
#define MQTT_PORT     1883
#define MQTT_USER     "smartcity"
#define MQTT_PASSWORD "password"
#define BIN_ID        "BIN_001"
```

Then flash the ESP32.

### Expected result

The real bin should appear as:

- `bin_id = BIN_001`
- `zone = Demo Bin`

in:

- backend REST
- worker web console
- worker mobile app
- Grafana physical-bin panels

## 24. Local Debugging Guide

### Check service health

```bash
docker ps --filter name=smartcity
curl http://localhost:8000/health
```

### Check backend sees the demo bin

```bash
curl http://localhost:8000/bins/BIN_001
```

### Check InfluxDB has recent demo-bin points

```bash
docker exec smartcity_influxdb influx query \
  'from(bucket: "waste_monitoring")
    |> range(start: -10m)
    |> filter(fn: (r) => r._measurement == "bin_telemetry" and r.bin_id == "BIN_001" and r._field == "fill_pct")
    |> sort(columns:["_time"], desc:true)
    |> limit(n:3)' \
  --token smartcity-super-secret-token
```

### Check mobile reachability from the phone

Open in the phone browser:

```text
http://<YOUR_PC_IP>:8000/health
```

If this does not work, the mobile app will not work either.

## 25. Common Problems and What They Mean

### Problem: mobile app says disconnected

Usually means one of:

- wrong LAN IP entered
- phone not on same Wi-Fi
- backend unavailable
- firewall blocking port `8000`

### Problem: dashboard does not update

Check these in order:

1. backend `/bins/BIN_001`
2. recent InfluxDB points for `BIN_001`
3. Grafana dashboard time range
4. legacy tag filters

### Problem: demo panel does not respond to reset

Usually:

- old browser cache
- demo panel page not refreshed after a JS change

Fix:

- hard refresh the page
- reopen `http://localhost:8080`

### Problem: InfluxDB fills disk

This happened during development when long historical windows accumulated too much data.

Current mitigation:

- backfill reduced to 7 days
- bucket retention set to 7 days

## 26. Current Known Design Choices

These are intentional current choices, not bugs.

1. APIs are open for local demo simplicity.
2. UI passcode gating exists only at the front end.
3. Mobile uses HTTP polling, not MQTT.
4. `BIN_001` is treated as the physical demo bin.
5. Simulator excludes telemetry generation for the physical bin.
6. Grafana filters out legacy bad zone tags.

## 27. Files Worth Knowing

### Device and wiring

- `firmware/smart_bin/smart_bin.ino`
- `firmware/smart_bin/WIRING.md`

### Backend

- `backend/main.py`
- `backend/mqtt_client.py`
- `backend/influx_client.py`
- `backend/bin_registry.py`

### Simulator and backfill

- `simulator/city_simulator.py`
- `simulator/backfill.py`
- `simulator/bin_locations.json`

### Dashboards and broker

- `grafana/dashboards/waste_monitoring.json`
- `grafana/provisioning/`
- `mosquitto/config/mosquitto.conf`

### Operator interfaces

- `mockpanel/index.html`
- `worker-console/`
- `worker-mobile/`

## 28. Recommended Demo Flow

If you are presenting this project live, this is the cleanest flow:

1. Open Grafana dashboard
2. Open worker web console
3. Open mock panel
4. Unlock mock panel with passcode `password`
5. Increase `BIN_001` fill above 80%
6. Show backend `/bins/BIN_001` changing
7. Show Grafana physical-bin panel updating
8. Trigger reset from worker console
9. Show demo panel dropping to `0%`
10. Show backend and dashboard reflecting the reset

## 29. Summary

This repository is not just a sensor demo. It is a complete local smart-city waste monitoring stack with:

- a real ESP32 firmware path
- a city-scale simulator
- operational worker interfaces
- time-series analytics
- alert logic
- a browser demo mode
- mobile support

The most important identity in the system for the demonstration is:

- `BIN_001`
- zone: `Demo Bin`

That is the object that ties together the physical bin, the browser demo panel, the worker console, the backend, InfluxDB, and Grafana.
