#!/usr/bin/env bash
# Smart City Waste Monitoring — First-time setup
# Run once after cloning: bash setup.sh

set -e

echo "==> Copying .env.example to .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    .env created — edit it if you need custom values"
else
  echo "    .env already exists, skipping"
fi

echo "==> Creating required directories"
mkdir -p mosquitto/data mosquitto/log

echo "==> Starting stack (first run pulls images and builds containers)"
docker compose up -d --build

echo "==> Waiting 15s for InfluxDB to initialise..."
sleep 15

echo "==> Running historical backfill (6 days of data)"
docker compose run --rm -e INFLUXDB_URL=http://influxdb:8086 backfill

echo ""
echo "All done. Services:"
echo "  Backend        http://localhost:8000"
echo "  Mock panel     http://localhost:8080  (passcode: password)"
echo "  Worker console http://localhost:8081  (passcode: password)"
echo "  Grafana        http://localhost:3000  (admin / admin)"
echo ""
echo "Passcode for all UI panels: password"
