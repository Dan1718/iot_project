"""
Hyderabad City Waste Bin Simulator
===================================
Simulates 100 smart bins across Hyderabad sending realistic MQTT data.

Each bin has:
  - A fill rate that varies by zone (commercial zones fill faster)
  - Time-of-day peaks (morning market rush, evening crowds)
  - Occasional approach events (IR sensor)
  - LDR values that follow a day/night cycle
  - Auto-reset after a random "collection window" when full

Topics published:
  city/bins/<BIN_ID>/telemetry  (every TELEMETRY_INTERVAL seconds)
  city/bins/<BIN_ID>/events     (FULL, APPROACH, RESET)
"""

import json
import logging
import math
import os
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "smartcity")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "password")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
TELEMETRY_INTERVAL = float(os.getenv("TELEMETRY_INTERVAL", "60"))  # seconds
APPROACH_CHANCE = 0.05  # 5% chance per telemetry tick of approach event
SIM_FILL_RATE_MULTIPLIER = 0.5

# Fill rates (% per minute) by zone type — commercial zones fill faster
ZONE_FILL_RATES = {
    "Charminar": 2.5,  # high tourist + market traffic
    "Banjara Hills": 1.2,
    "Jubilee Hills": 1.0,
    "Secunderabad": 1.8,
    "Hitech City": 1.5,  # office lunch crowds
    "Madhapur": 1.4,
    "Kukatpally": 1.6,
    "LB Nagar": 1.7,
    "Dilsukhnagar": 2.0,  # busy market
    "Ameerpet": 1.9,
    "Begumpet": 1.3,
    "Gachibowli": 1.1,
    "Kondapur": 1.2,
    "Tarnaka": 1.0,
    "Abids": 2.2,  # dense commercial
    "Nampally": 1.8,
    "Koti": 2.3,
    "SR Nagar": 1.1,
    "Miyapur": 0.9,
    "Uppal": 1.4,
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("simulator")


# ── Helpers ───────────────────────────────────────────────────────────────────


def time_of_day_multiplier() -> float:
    """
    Returns a fill-rate multiplier based on hour of day (IST).
    Peaks: morning (8–10), lunch (12–14), evening (17–20).
    Night: very slow.
    """
    hour = datetime.now(timezone.utc).hour + 5.5  # rough IST offset
    hour = hour % 24

    # Smooth peaks using a sum of Gaussians
    def gauss(h, mu, sigma):
        return math.exp(-0.5 * ((h - mu) / sigma) ** 2)

    multiplier = (
        0.3  # base (night)
        + 1.5 * gauss(hour, 9, 1.5)  # morning rush
        + 1.2 * gauss(hour, 13, 1.0)  # lunch
        + 1.8 * gauss(hour, 18, 1.5)  # evening peak
    )
    return max(0.1, multiplier)


def ldr_value() -> int:
    """Simulate LDR ADC reading (0–4095). Dark at night, bright during day."""
    hour = datetime.now(timezone.utc).hour + 5.5
    hour = hour % 24
    # Sine-based: noon = brightest (4000), midnight = darkest (200)
    brightness = 2100 + 1900 * math.sin(math.pi * (hour - 6) / 12)
    noise = random.randint(-100, 100)
    return int(max(0, min(4095, brightness + noise)))


# ── Bin dataclass ─────────────────────────────────────────────────────────────


@dataclass
class SimBin:
    bin_id: str
    zone: str
    lat: float
    lon: float

    fill_pct: float = field(default_factory=lambda: random.uniform(0, 30))
    awaiting_reset: bool = False
    full_since: Optional[float] = None  # time.time() when full was triggered
    collection_delay: float = field(
        default_factory=lambda: random.uniform(60, 300)
    )  # seconds

    @property
    def fill_rate_per_tick(self) -> float:
        """Fill increase per TELEMETRY_INTERVAL seconds."""
        base_rate = (
            ZONE_FILL_RATES.get(self.zone, 1.0) * SIM_FILL_RATE_MULTIPLIER
        )  # % per minute
        tod = time_of_day_multiplier()
        noise = random.uniform(0.7, 1.3)
        return (base_rate * tod * noise * TELEMETRY_INTERVAL) / 60.0

    def step(self, mqtt_client_obj) -> dict:
        """Advance simulation one tick. Returns telemetry dict."""
        ldr = ldr_value()
        lamp_on = ldr < 1500

        ir_triggered = False

        # ── Fill level ────────────────────────────────────────────────────────
        if not self.awaiting_reset:
            self.fill_pct = min(100.0, self.fill_pct + self.fill_rate_per_tick)

            if self.fill_pct >= 80.0 and not self.awaiting_reset:
                self.awaiting_reset = True
                self.full_since = time.time()
                logger.info("[%s] FULL at %.1f%%", self.bin_id, self.fill_pct)
                self._publish_event(mqtt_client_obj, "FULL")

        # ── Simulated collection (auto-reset after delay) ──────────────────
        elif (
            self.full_since and (time.time() - self.full_since) >= self.collection_delay
        ):
            logger.info("[%s] Collected — RESET", self.bin_id)
            self.fill_pct = random.uniform(0, 5)
            self.awaiting_reset = False
            self.full_since = None
            self.collection_delay = random.uniform(60, 300)
            self._publish_event(mqtt_client_obj, "RESET")

        # ── IR approach event ─────────────────────────────────────────────
        if random.random() < APPROACH_CHANCE:
            ir_triggered = True
            self._publish_event(mqtt_client_obj, "APPROACH")

        return {
            "bin_id": self.bin_id,
            "fill_pct": int(self.fill_pct),
            "ir_triggered": ir_triggered,
            "ldr_raw": ldr,
            "lamp_on": lamp_on,
            "awaiting_reset": self.awaiting_reset,
        }

    def _publish_event(self, client, event: str) -> None:
        topic = f"city/bins/{self.bin_id}/events"
        payload = json.dumps(
            {
                "bin_id": self.bin_id,
                "event": event,
                "timestamp": int(time.time()),
            }
        )
        client.publish(topic, payload)


# ── MQTT setup ────────────────────────────────────────────────────────────────


def build_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2, client_id="hyderabad_simulator"
    )

    def on_connect(c, userdata, flags, reason_code, properties):
        if reason_code == 0:
            logger.info(
                "Simulator connected to MQTT broker at %s:%s", MQTT_BROKER, MQTT_PORT
            )
        else:
            logger.error("MQTT connect failed: %s", reason_code)

    def on_disconnect(c, userdata, flags, reason_code, properties):
        logger.warning("MQTT disconnected (%s). Reconnecting...", reason_code)

    client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    return client


def register_bins_with_backend(bins: list[SimBin], physical_ids: set) -> None:
    """POST each bin's metadata to the backend so it can enrich InfluxDB writes."""
    url = f"{BACKEND_URL}/bins/register"
    for b in bins:
        try:
            resp = requests.post(
                url,
                json={
                    "bin_id": b.bin_id,
                    "zone": b.zone,
                    "lat": b.lat,
                    "lon": b.lon,
                    "physical": b.bin_id in physical_ids,
                },
                timeout=5,
            )
            if resp.status_code != 201:
                logger.warning("Register %s failed: %s", b.bin_id, resp.text)
        except requests.RequestException as exc:
            logger.warning("Could not register %s: %s", b.bin_id, exc)


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    # Load bin locations
    import pathlib

    locations_path = pathlib.Path(__file__).parent / "bin_locations.json"
    with open(locations_path) as f:
        locations = json.load(f)

    bins = [
        SimBin(**{k: v for k, v in loc.items() if k != "physical"}) for loc in locations
    ]
    physical_ids = {loc["bin_id"] for loc in locations if loc.get("physical")}
    logger.info(
        "Loaded %d bins (%d physical, will not simulate).", len(bins), len(physical_ids)
    )

    # Connect MQTT
    client = build_mqtt_client()
    retry = 0
    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            break
        except Exception as exc:
            retry += 1
            wait = min(30, 2**retry)
            logger.warning("MQTT connect failed (%s). Retry in %ds...", exc, wait)
            time.sleep(wait)

    client.loop_start()

    # Give backend time to start, then register bins
    time.sleep(5)
    register_bins_with_backend(bins, physical_ids)

    logger.info("Simulation started. Publishing every %ss.", TELEMETRY_INTERVAL)

    while True:
        tick_start = time.time()

        for bin_ in bins:
            if bin_.bin_id in physical_ids:
                continue  # physical bins publish their own data (ESP32 / mock panel)
            telemetry = bin_.step(client)
            topic = f"city/bins/{bin_.bin_id}/telemetry"
            client.publish(topic, json.dumps(telemetry), retain=True)

        elapsed = time.time() - tick_start
        sleep_for = max(0, TELEMETRY_INTERVAL - elapsed)
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()
