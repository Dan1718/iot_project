"""
Historical Backfill Script
===========================
Generates 7 days of realistic bin telemetry + events and writes them
directly to InfluxDB in batched bulk writes (bypasses MQTT).

Run once after `docker compose up`:
    docker compose run --rm simulator python backfill.py

Panels this feeds:
  - City-wide Average Fill Level      (bin_telemetry / fill_pct)
  - Bins Awaiting Collection          (bin_telemetry / awaiting_reset)
  - Total Approach Events             (bin_events    / event_type=APPROACH)
  - Total Collections                 (bin_events    / event_type=RESET)
  - Street Lamps Currently On         (bin_telemetry / lamp_on)
  - Average Fill Level by Zone        (bin_telemetry / fill_pct grouped by zone)
  - Fill Level Over Time              (bin_telemetry / fill_pct time-series)
  - Event Timeline                    (bin_events    / all types)
  - Top 10 Bins by Fill Level         (bin_telemetry / fill_pct per bin_id)
  - Collection Frequency by Zone      (bin_events    / RESET grouped by zone)
"""

import json
import logging
import math
import os
import pathlib
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("backfill")

# ── Config ────────────────────────────────────────────────────────────────────
INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://influxdb:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN", "smartcity-super-secret-token")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "smartcity")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "waste_monitoring")

DAYS_BACK = 6
TELEMETRY_INTERVAL = 120  # seconds between telemetry points (2 min resolution)
BATCH_SIZE = 10_000  # points per InfluxDB write call
SIM_FILL_RATE_MULTIPLIER = 0.5

# Fill rates (%/min at base load) — determines how quickly bins fill
ZONE_FILL_RATES = {
    "Charminar": 1.4,
    "Banjara Hills": 0.7,
    "Jubilee Hills": 0.6,
    "Secunderabad": 1.0,
    "Hitech City": 0.9,
    "Madhapur": 0.8,
    "Kukatpally": 0.9,
    "LB Nagar": 1.0,
    "Dilsukhnagar": 1.1,
    "Ameerpet": 1.1,
    "Begumpet": 0.7,
    "Gachibowli": 0.6,
    "Kondapur": 0.7,
    "Tarnaka": 0.6,
    "Abids": 1.2,
    "Nampally": 1.0,
    "Koti": 1.3,
    "SR Nagar": 0.6,
    "Miyapur": 0.5,
    "Uppal": 0.8,
}

# Weekend multipliers — market zones busier Sat/Sun, offices quieter
WEEKEND_MULT = {
    "Charminar": 1.5,
    "Abids": 1.4,
    "Koti": 1.4,
    "Dilsukhnagar": 1.3,
    "Nampally": 1.2,
    "Ameerpet": 1.1,
    "Secunderabad": 1.2,
    "Banjara Hills": 1.3,
    "Jubilee Hills": 1.2,
    "Hitech City": 0.5,
    "Gachibowli": 0.5,
    "Madhapur": 0.5,
}

# Collection delay after bin goes full (seconds) — realistic truck response time
COLLECTION_DELAY_MIN = 1800  # 30 min
COLLECTION_DELAY_MAX = 7200  # 2 hr


# ── Helpers ───────────────────────────────────────────────────────────────────


def tod_multiplier(hour_float: float) -> float:
    """Fill-rate multiplier based on hour of day (0–24)."""

    def gauss(h, mu, sigma):
        return math.exp(-0.5 * ((h - mu) / sigma) ** 2)

    return max(
        0.05,
        0.2
        + 1.6 * gauss(hour_float, 9, 1.5)  # morning rush
        + 1.1 * gauss(hour_float, 13, 1.0)  # lunch
        + 1.9 * gauss(hour_float, 18, 1.5),  # evening peak
    )


def ldr_value(hour_float: float) -> int:
    """Simulate LDR ADC value (0–4095). Dark = low value, bright = high."""
    brightness = 2100 + 1900 * math.sin(math.pi * (hour_float - 6) / 12)
    return int(max(0, min(4095, brightness + random.randint(-150, 150))))


def is_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5


# ── Bin state ─────────────────────────────────────────────────────────────────


@dataclass
class BackfillBin:
    bin_id: str
    zone: str
    lat: float
    lon: float

    # Stagger initial fill so bins aren't all at 0% at the same moment
    fill_pct: float = field(default_factory=lambda: random.uniform(5, 60))
    awaiting_reset: bool = False
    full_since_ts: Optional[float] = None
    collection_delay: float = field(
        default_factory=lambda: random.uniform(
            COLLECTION_DELAY_MIN, COLLECTION_DELAY_MAX
        )
    )

    def step(self, utc_dt: datetime, interval_s: float):
        """
        Advance one time step.
        utc_dt  : current timestamp in UTC (naive or aware).
        Returns (telemetry_Point, list[event_Point])
        """
        # Convert to IST for time-of-day logic
        ist_dt = utc_dt + timedelta(hours=5, minutes=30)
        hour_float = ist_dt.hour + ist_dt.minute / 60.0

        ldr = ldr_value(hour_float)
        lamp_on = ldr < 1500
        events = []
        ir_triggered = False

        # ── Fill logic ────────────────────────────────────────────────────────
        if not self.awaiting_reset:
            base = ZONE_FILL_RATES.get(self.zone, 1.0) * SIM_FILL_RATE_MULTIPLIER
            tod = tod_multiplier(hour_float)
            wknd = WEEKEND_MULT.get(self.zone, 1.0) if is_weekend(ist_dt) else 1.0
            noise = random.uniform(0.85, 1.15)
            delta = base * tod * wknd * noise * interval_s / 60.0

            self.fill_pct = min(100.0, self.fill_pct + delta)

            if self.fill_pct >= 80.0:
                self.awaiting_reset = True
                self.full_since_ts = utc_dt.timestamp()
                events.append(self._event_point("FULL", utc_dt))

        else:
            # Bin is full — wait for truck
            if (
                self.full_since_ts is not None
                and utc_dt.timestamp() - self.full_since_ts >= self.collection_delay
            ):
                self.fill_pct = random.uniform(0, 5)
                self.awaiting_reset = False
                self.full_since_ts = None
                self.collection_delay = random.uniform(
                    COLLECTION_DELAY_MIN, COLLECTION_DELAY_MAX
                )
                events.append(self._event_point("RESET", utc_dt))

        # ── Approach events ───────────────────────────────────────────────────
        # Probability scales with time-of-day foot traffic
        approach_prob = (
            0.04 * tod_multiplier(hour_float) * (1.3 if is_weekend(ist_dt) else 1.0)
        )
        if random.random() < approach_prob:
            ir_triggered = True
            events.append(self._event_point("APPROACH", utc_dt))

        # ── Telemetry point ───────────────────────────────────────────────────
        telemetry = (
            Point("bin_telemetry")
            .tag("bin_id", self.bin_id)
            .tag("zone", self.zone)
            .field("fill_pct", int(self.fill_pct))
            .field("ir_triggered", ir_triggered)
            .field("ldr_raw", ldr)
            .field("lamp_on", lamp_on)
            .field("awaiting_reset", self.awaiting_reset)
            .field("lat", self.lat)
            .field("lon", self.lon)
            .time(utc_dt, "s")
        )

        return telemetry, events

    def _event_point(self, event_type: str, utc_dt: datetime) -> Point:
        return (
            Point("bin_events")
            .tag("bin_id", self.bin_id)
            .tag("zone", self.zone)
            .tag("event_type", event_type)
            .field("value", 1)
            .time(utc_dt, "s")
        )


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    locations_path = pathlib.Path(__file__).parent / "bin_locations.json"
    with open(locations_path) as f:
        locations = json.load(f)

    bins = [
        BackfillBin(**{k: v for k, v in loc.items() if k != "physical"})
        for loc in locations
    ]
    logger.info("Loaded %d bins.", len(bins))

    # InfluxDB connection — retry until the DB is ready
    client = None
    write_api = None
    for attempt in range(10):
        try:
            client = InfluxDBClient(
                url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG
            )
            write_api = client.write_api(write_options=SYNCHRONOUS)
            # ping
            client.ping()
            logger.info("Connected to InfluxDB at %s", INFLUXDB_URL)
            break
        except Exception as exc:
            import time

            wait = 5 * (attempt + 1)
            logger.warning("InfluxDB not ready (%s). Retry in %ds...", exc, wait)
            time.sleep(wait)
    else:
        logger.error("Could not connect to InfluxDB after retries. Exiting.")
        return

    # Time window: 7 days ago → now (UTC)
    now_utc = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    start_utc = now_utc - timedelta(days=DAYS_BACK)

    total_steps = int(DAYS_BACK * 86400 / TELEMETRY_INTERVAL)
    logger.info(
        "Backfilling %d days at %ds resolution → %d steps × %d bins ≈ %s points",
        DAYS_BACK,
        TELEMETRY_INTERVAL,
        total_steps,
        len(bins),
        f"{total_steps * len(bins):,}",
    )

    batch = []
    written = 0
    step = 0
    dt = start_utc

    while dt <= now_utc:
        for bin_ in bins:
            tel, evts = bin_.step(dt, TELEMETRY_INTERVAL)
            batch.append(tel)
            batch.extend(evts)

        if len(batch) >= BATCH_SIZE:
            write_api.write(bucket=INFLUXDB_BUCKET, record=batch)
            written += len(batch)
            batch = []
            pct = step / total_steps * 100
            logger.info(
                "  %6.1f%%  written=%s  t=%s",
                pct,
                f"{written:,}",
                dt.strftime("%Y-%m-%d %H:%M UTC"),
            )

        dt += timedelta(seconds=TELEMETRY_INTERVAL)
        step += 1

    if batch:
        write_api.write(bucket=INFLUXDB_BUCKET, record=batch)
        written += len(batch)

    client.close()
    logger.info("Done. Total points written: %s", f"{written:,}")


if __name__ == "__main__":
    main()
