"""
MQTT subscriber.
Connects to the Mosquitto broker and processes messages from all bins:
  city/bins/+/telemetry
  city/bins/+/events
"""

import json
import logging
import threading

import paho.mqtt.client as mqtt

import bin_registry
import influx_client
from config import settings

logger = logging.getLogger(__name__)

TOPIC_TELEMETRY = "city/bins/+/telemetry"
TOPIC_EVENTS = "city/bins/+/events"


def _on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        logger.info("MQTT connected to %s:%s", settings.mqtt_broker, settings.mqtt_port)
        client.subscribe(TOPIC_TELEMETRY)
        client.subscribe(TOPIC_EVENTS)
    else:
        logger.error("MQTT connection failed, reason_code=%s", reason_code)


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.warning("Bad MQTT payload on %s: %s", msg.topic, exc)
        return

    topic_parts = msg.topic.split("/")  # ['city', 'bins', '<id>', '<type>']
    if len(topic_parts) != 4:
        return

    bin_id = topic_parts[2]
    msg_type = topic_parts[3]

    meta = bin_registry.get_metadata(bin_id)

    # ── Auto-register unknown bins (physical ESP32 devices) ───────────────────
    # Only auto-register bins that are NOT simulator bins (HYD_xxx).
    # Simulator bins get their metadata via POST /bins/register on startup.
    # Physical bins (BIN_xxx or any unknown ID) are registered immediately
    # using their bin_id as the zone name so they appear in Grafana.
    if not meta and not bin_id.startswith("HYD_"):
        logger.info("[AUTO-REGISTER] Physical bin detected: %s", bin_id)
        # Load correct metadata from bin_locations.json if available
        # so zone/lat/lon are correct from the first message
        import pathlib, json as _json

        _locations_path = (
            pathlib.Path(__file__).parent.parent / "simulator" / "bin_locations.json"
        )
        _known = {}
        try:
            with open(_locations_path) as _f:
                for _loc in _json.load(_f):
                    _known[_loc["bin_id"]] = _loc
        except Exception:
            pass
        _loc_data = _known.get(bin_id, {})
        bin_registry.register_metadata(
            bin_id=bin_id,
            zone=_loc_data.get("zone", "Demo Bin"),
            lat=_loc_data.get("lat", 17.3850),
            lon=_loc_data.get("lon", 78.4867),
            physical=True,
        )
        meta = bin_registry.get_metadata(bin_id)

    zone = meta.get("zone", bin_id)
    lat = meta.get("lat", 17.3850)
    lon = meta.get("lon", 78.4867)

    if msg_type == "telemetry":
        bin_registry.upsert(
            bin_id=bin_id,
            fill_pct=payload.get("fill_pct", 0),
            awaiting_reset=payload.get("awaiting_reset", False),
        )
        influx_client.write_telemetry(payload, zone=zone, lat=lat, lon=lon)

    elif msg_type == "events":
        event = payload.get("event", "UNKNOWN")
        logger.info("Event from %s: %s", bin_id, event)
        influx_client.write_event(payload, zone=zone)

        # If cleaner reset → update registry immediately
        if event == "RESET":
            bin_registry.upsert(bin_id=bin_id, fill_pct=0, awaiting_reset=False)

        # If full → send remote alert (could be webhook/SMS in production)
        elif event == "FULL":
            logger.warning("BIN FULL: %s (zone=%s)", bin_id, zone)


def _on_disconnect(client, userdata, flags, reason_code, properties):
    logger.warning(
        "MQTT disconnected (reason_code=%s). Will auto-reconnect.", reason_code
    )


def start_mqtt_listener() -> None:
    """Start the MQTT client in a background daemon thread."""
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2, client_id="smartcity_backend"
    )
    client.username_pw_set(settings.mqtt_user, settings.mqtt_password)
    client.on_connect = _on_connect
    client.on_message = _on_message
    client.on_disconnect = _on_disconnect

    client.connect(settings.mqtt_broker, settings.mqtt_port, keepalive=60)

    thread = threading.Thread(target=client.loop_forever, daemon=True)
    thread.start()
    logger.info("MQTT listener thread started.")
