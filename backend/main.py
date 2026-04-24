"""
FastAPI backend for Smart City Waste Monitoring.

REST endpoints:
  GET  /bins                  → all bins latest status
  GET  /bins/{bin_id}         → single bin status
  GET  /bins/full             → bins needing collection
  POST /bins/{bin_id}/reset   → send remote RESET command via MQTT
  POST /bins/register         → simulator seeds bin metadata (zone, lat, lon)

On startup the MQTT listener thread is launched automatically.
"""

import json
import logging
import os

import paho.mqtt.publish as mqtt_publish
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import bin_registry
import mqtt_client
from config import settings
from models import BinStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart City Waste Monitoring API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    logger.info("Starting MQTT listener...")
    mqtt_client.start_mqtt_listener()


# ── REST endpoints ────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    bin_id: str
    zone: str
    lat: float
    lon: float
    physical: bool = False  # True for real ESP32 devices


@app.post("/bins/register", status_code=201)
def register_bin(req: RegisterRequest):
    """Called by the simulator (or device provisioning) to seed bin metadata."""
    bin_registry.register_metadata(req.bin_id, req.zone, req.lat, req.lon, req.physical)
    return {"status": "registered", "bin_id": req.bin_id, "physical": req.physical}


@app.get("/bins/physical", response_model=list[BinStatus])
def get_physical_bins():
    """Return only real physical ESP32 bins."""
    return bin_registry.get_physical_bins()


@app.get("/bins", response_model=list[BinStatus])
def get_all_bins():
    """Return latest status of every known bin."""
    return bin_registry.get_all()


@app.get("/bins/full", response_model=list[BinStatus])
def get_full_bins():
    """Return all bins that are full and awaiting collection."""
    return bin_registry.get_full_bins()


@app.get("/bins/{bin_id}", response_model=BinStatus)
def get_bin(bin_id: str):
    status = bin_registry.get(bin_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Bin {bin_id!r} not found")
    return status


@app.post("/bins/{bin_id}/reset")
def reset_bin(bin_id: str):
    """Send a remote RESET command to a physical bin via MQTT."""
    topic = f"city/bins/{bin_id}/cmd"
    try:
        mqtt_publish.single(
            topic=topic,
            payload="RESET",
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            auth={"username": settings.mqtt_user, "password": settings.mqtt_password},
        )
        logger.info("Remote reset sent to %s", bin_id)
        return {"status": "reset_sent", "bin_id": bin_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/bins/reset-all")
def reset_all_bins():
    """
    Set all simulated bins (excluding BIN_001) to 20% fill.
    Publishes a synthetic telemetry message for each bin directly via MQTT
    so the backend registry, InfluxDB, and worker UIs all update immediately.
    """
    bins = bin_registry.get_all()
    count = 0
    for b in bins:
        if b.bin_id == "BIN_001":
            continue
        meta = bin_registry.get_metadata(b.bin_id)
        payload = json.dumps(
            {
                "bin_id": b.bin_id,
                "fill_pct": 20,
                "ir_triggered": False,
                "ldr_raw": 2000,
                "lamp_on": False,
                "awaiting_reset": False,
            }
        )
        try:
            mqtt_publish.single(
                topic=f"city/bins/{b.bin_id}/telemetry",
                payload=payload,
                retain=True,
                hostname=settings.mqtt_broker,
                port=settings.mqtt_port,
                auth={
                    "username": settings.mqtt_user,
                    "password": settings.mqtt_password,
                },
            )
            bin_registry.upsert(bin_id=b.bin_id, fill_pct=20, awaiting_reset=False)
            count += 1
        except Exception as exc:
            logger.error("reset-all failed for %s: %s", b.bin_id, exc)

    logger.info("reset-all: set %d bins to 20%%", count)
    return {"status": "ok", "bins_reset": count}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Grafana alert webhook ─────────────────────────────────────────────────────


@app.post("/webhook/grafana-alert")
async def grafana_alert_webhook(request: Request):
    """
    Receives Grafana alert payloads and republishes them as MQTT messages
    on city/alerts so the worker console gets real-time alert notifications.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    alerts = body.get("alerts", [])
    for alert in alerts:
        status = alert.get("status", "firing")
        name = alert.get("labels", {}).get("alertname", "Alert")
        summary = alert.get("annotations", {}).get("summary", name)
        description = alert.get("annotations", {}).get("description", "")
        severity = alert.get("labels", {}).get("severity", "warning")
        bin_id = alert.get("labels", {}).get("bin_id", "")

        payload = json.dumps(
            {
                "status": status,
                "alertname": name,
                "summary": summary,
                "description": description,
                "severity": severity,
                "bin_id": bin_id,
            }
        )

        try:
            mqtt_publish.single(
                topic="city/alerts",
                payload=payload,
                hostname=settings.mqtt_broker,
                port=settings.mqtt_port,
                auth={
                    "username": settings.mqtt_user,
                    "password": settings.mqtt_password,
                },
            )
            logger.info("Alert forwarded to MQTT: %s [%s]", name, status)
        except Exception as exc:
            logger.error("Failed to forward alert to MQTT: %s", exc)

    return {"received": len(alerts)}
