"""
In-memory registry of the latest known state for every bin.
Also holds static metadata (zone, lat, lon) that the simulator seeds.

In production this would be persisted in Redis or Postgres.
"""

from datetime import datetime, timezone
from typing import Dict, Optional
from models import BinStatus

# bin_id → BinStatus
_registry: Dict[str, BinStatus] = {}

# bin_id → {zone, lat, lon}  (seeded by simulator via REST endpoint)
_metadata: Dict[str, dict] = {}


def upsert(bin_id: str, fill_pct: int, awaiting_reset: bool) -> None:
    meta = _metadata.get(bin_id, {})
    _registry[bin_id] = BinStatus(
        bin_id=bin_id,
        fill_pct=fill_pct,
        awaiting_reset=awaiting_reset,
        last_seen=datetime.now(timezone.utc).isoformat(),
        zone=meta.get("zone"),
        lat=meta.get("lat"),
        lon=meta.get("lon"),
    )


def register_metadata(
    bin_id: str, zone: str, lat: float, lon: float, physical: bool = False
) -> None:
    _metadata[bin_id] = {"zone": zone, "lat": lat, "lon": lon, "physical": physical}


def get_physical_bins() -> list[BinStatus]:
    """Return only physical ESP32 bins (not simulator bins)."""
    return [
        b for b in _registry.values() if _metadata.get(b.bin_id, {}).get("physical")
    ]


def get(bin_id: str) -> Optional[BinStatus]:
    return _registry.get(bin_id)


def get_all() -> list[BinStatus]:
    return list(_registry.values())


def get_full_bins() -> list[BinStatus]:
    return [b for b in _registry.values() if b.awaiting_reset]


def get_metadata(bin_id: str) -> dict:
    return _metadata.get(bin_id, {})
