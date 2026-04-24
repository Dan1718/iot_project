"""
InfluxDB writer.
All bin data is stored in the 'waste_monitoring' bucket under two measurements:
  - bin_telemetry : fill_pct, ldr_raw, lamp_on (numeric / bool fields)
  - bin_events    : event type (string tag) per occurrence
"""

import logging
from datetime import datetime, timezone

from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

from config import settings

logger = logging.getLogger(__name__)

_client = InfluxDBClient(
    url=settings.influxdb_url,
    token=settings.influxdb_token,
    org=settings.influxdb_org,
)
_write_api = _client.write_api(write_options=SYNCHRONOUS)


def write_telemetry(
    payload: dict, zone: str = "unknown", lat: float = 0.0, lon: float = 0.0
) -> None:
    """Write a telemetry reading to InfluxDB."""
    try:
        point = (
            Point("bin_telemetry")
            .tag("bin_id", payload["bin_id"])
            .tag("zone", zone)
            .field("fill_pct", int(payload["fill_pct"]))
            .field("ir_triggered", bool(payload.get("ir_triggered", False)))
            .field("ldr_raw", int(payload.get("ldr_raw", 0)))
            .field("lamp_on", bool(payload.get("lamp_on", False)))
            .field("awaiting_reset", bool(payload.get("awaiting_reset", False)))
            .field("lat", float(lat))
            .field("lon", float(lon))
            .time(datetime.now(timezone.utc), "s")
        )
        _write_api.write(bucket=settings.influxdb_bucket, record=point)
    except Exception as exc:
        logger.error("InfluxDB write_telemetry failed: %s", exc)


def write_event(payload: dict, zone: str = "unknown") -> None:
    """Write a bin event (FULL / APPROACH / RESET) to InfluxDB."""
    try:
        point = (
            Point("bin_events")
            .tag("bin_id", payload["bin_id"])
            .tag("zone", zone)
            .tag("event_type", payload["event"])
            .field("value", 1)
            .time(datetime.now(timezone.utc), "s")
        )
        _write_api.write(bucket=settings.influxdb_bucket, record=point)
    except Exception as exc:
        logger.error("InfluxDB write_event failed: %s", exc)
