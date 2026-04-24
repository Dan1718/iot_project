from pydantic import BaseModel
from typing import Optional


class TelemetryPayload(BaseModel):
    """Schema for city/bins/<id>/telemetry messages."""

    bin_id: str
    fill_pct: int  # 0–100
    ir_triggered: bool
    ldr_raw: int
    lamp_on: bool
    awaiting_reset: bool = False


class EventPayload(BaseModel):
    """Schema for city/bins/<id>/events messages."""

    bin_id: str
    event: str  # FULL | APPROACH | RESET
    timestamp: Optional[int] = None


class BinStatus(BaseModel):
    """Latest known state of a bin (served via REST API)."""

    bin_id: str
    fill_pct: int
    awaiting_reset: bool
    last_seen: str  # ISO timestamp
    zone: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
