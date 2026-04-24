"""
Analytics queries for the /analytics/summary endpoint.

Returns per-bin:
  - bin_id, zone, lat, lon
  - current fill_pct
  - fill_rate_per_hour  (derived from last 2h of telemetry)
  - est_hours_to_full   (how long until fill hits 80%)
  - full_events_24h     (how many FULL events in last 24h)
  - collections_24h     (how many RESET events in last 24h)

Results are cached for 60 seconds to avoid hammering InfluxDB on every map pan.
"""

import logging
import time
from typing import Optional

from influxdb_client import InfluxDBClient

from config import settings
import bin_registry

logger = logging.getLogger(__name__)

_client = InfluxDBClient(
    url=settings.influxdb_url,
    token=settings.influxdb_token,
    org=settings.influxdb_org,
)

# Simple in-memory cache
_cache: dict = {"data": None, "ts": 0}
CACHE_TTL = 60  # seconds


def _query(flux: str) -> list[dict]:
    """Run a Flux query and return rows as dicts."""
    try:
        tables = _client.query_api().query(flux, org=settings.influxdb_org)
        rows = []
        for table in tables:
            for record in table.records:
                rows.append(record.values)
        return rows
    except Exception as exc:
        logger.error("Analytics query failed: %s", exc)
        return []


def get_summary() -> list[dict]:
    """Return analytics summary for all bins, cached 60s."""
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]

    # ── 1. Latest fill per bin ────────────────────────────────────────────────
    fill_rows = _query(f'''
from(bucket: "{settings.influxdb_bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "bin_telemetry" and r._field == "fill_pct")
  |> filter(fn: (r) => r.zone !~ /^HYD_/ and r.zone != "BIN_001")
  |> group(columns: ["bin_id", "zone"])
  |> last()
  |> keep(columns: ["bin_id", "zone", "_value"])
''')
    current_fill = {r["bin_id"]: r["_value"] for r in fill_rows if r.get("bin_id")}

    # ── 2. Fill rate per bin (slope over last 2h) ─────────────────────────────
    rate_rows = _query(f'''
from(bucket: "{settings.influxdb_bucket}")
  |> range(start: -2h)
  |> filter(fn: (r) => r._measurement == "bin_telemetry" and r._field == "fill_pct")
  |> group(columns: ["bin_id"])
  |> aggregateWindow(every: 30m, fn: mean, createEmpty: false)
  |> difference()
  |> mean()
  |> keep(columns: ["bin_id", "_value"])
''')
    # _value here is avg change per 30-min window → multiply by 2 for per-hour
    fill_rate = {
        r["bin_id"]: round(float(r["_value"]) * 2, 2)
        for r in rate_rows
        if r.get("bin_id")
    }

    # ── 3. FULL events in last 24h per bin ────────────────────────────────────
    full_rows = _query(f'''
from(bucket: "{settings.influxdb_bucket}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "bin_events" and r._field == "value" and r.event_type == "FULL")
  |> group(columns: ["bin_id"])
  |> count()
  |> keep(columns: ["bin_id", "_value"])
''')
    full_events = {r["bin_id"]: r["_value"] for r in full_rows if r.get("bin_id")}

    # ── 4. RESET events in last 24h per bin ──────────────────────────────────
    reset_rows = _query(f'''
from(bucket: "{settings.influxdb_bucket}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "bin_events" and r._field == "value" and r.event_type == "RESET")
  |> group(columns: ["bin_id"])
  |> count()
  |> keep(columns: ["bin_id", "_value"])
''')
    collections = {r["bin_id"]: r["_value"] for r in reset_rows if r.get("bin_id")}

    # ── 5. Get lat/lon/zone directly from InfluxDB ────────────────────────────
    geo_lat = _query(f'''
from(bucket: "{settings.influxdb_bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "bin_telemetry" and r._field == "lat")
  |> filter(fn: (r) => r.zone !~ /^HYD_/ and r.zone != "BIN_001")
  |> group(columns: ["bin_id", "zone"])
  |> last()
  |> keep(columns: ["bin_id", "zone", "_value"])
''')
    geo_lon = _query(f'''
from(bucket: "{settings.influxdb_bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "bin_telemetry" and r._field == "lon")
  |> filter(fn: (r) => r.zone !~ /^HYD_/ and r.zone != "BIN_001")
  |> group(columns: ["bin_id", "zone"])
  |> last()
  |> keep(columns: ["bin_id", "zone", "_value"])
''')

    lat_map = {r["bin_id"]: float(r["_value"]) for r in geo_lat if r.get("bin_id")}
    lon_map = {r["bin_id"]: float(r["_value"]) for r in geo_lon if r.get("bin_id")}
    zone_map = {
        r["bin_id"]: r.get("zone", "Unknown") for r in geo_lat if r.get("bin_id")
    }

    # Use all bin IDs seen in InfluxDB
    all_bin_ids = set(current_fill.keys()) | set(lat_map.keys())

    # ── 6. Assemble per-bin summary ───────────────────────────────────────────
    result = []
    for bid in all_bin_ids:
        meta = bin_registry.get_metadata(bid)
        bin_status = bin_registry.get(bid)

        lat = lat_map.get(bid) or (meta.get("lat") if meta else None) or 17.385
        lon = lon_map.get(bid) or (meta.get("lon") if meta else None) or 78.4867
        zone = zone_map.get(bid) or (meta.get("zone") if meta else None) or "Unknown"

        fill = current_fill.get(bid, 0)
        rate = fill_rate.get(bid, 0.0)
        rate_pos = max(0.0, rate)

        if rate_pos > 0:
            est_hours = round((80 - fill) / rate_pos, 1) if fill < 80 else 0.0
        else:
            est_hours = None

        result.append(
            {
                "bin_id": bid,
                "zone": zone,
                "lat": lat,
                "lon": lon,
                "fill_pct": fill,
                "fill_rate_per_hr": rate_pos,
                "est_hours_to_full": est_hours,
                "full_events_24h": full_events.get(bid, 0),
                "collections_24h": collections.get(bid, 0),
                "is_physical": meta.get("physical", False) if meta else False,
                "awaiting_reset": bin_status.awaiting_reset if bin_status else False,
            }
        )

    # Sort: full bins first, then by fill % desc
    result.sort(key=lambda x: (-int(x["awaiting_reset"]), -(x["fill_pct"] or 0)))

    _cache["data"] = result
    _cache["ts"] = now
    return result
