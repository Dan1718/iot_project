# Worker Mobile

Expo mobile app for the waste collection worker.

## Features

- Password login
- Configurable server IP/host
- Live MQTT feed for all bins
- BIN_001 pinned at the top
- Reset full bins
- Event feed (FULL and RESET only)
- Local mobile notifications for FULL/RESET/Grafana alerts

## Password

`password`

## Run

```bash
cd worker-mobile
npm start
```

Then scan the QR in Expo Go.

## Server settings

On first launch, enter your server LAN IP, for example:

`192.168.1.100`

The app connects to:

- API: `http://<host>:8000`
- MQTT over WebSocket: `ws://<host>:9001`

## Notes

- MQTT auth is already configured as `smartcity / password`
- APPROACH notifications are suppressed
- BIN_001 is treated as the physical ESP32 demo bin
