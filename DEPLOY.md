# Deploying to EC2 with iot.dan1718.dev

## 1. DNS — name.com

Add an A record:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | iot | YOUR_EC2_PUBLIC_IP | 300 |

Wait 5–10 minutes for DNS to propagate. Verify with:

```bash
nslookup iot.dan1718.dev
```

## 2. EC2 Security Group

Open these inbound ports:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirect + Certbot) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 1883 | TCP | 0.0.0.0/0 | MQTT for ESP32 |

Ports 8000, 8080, 8081, 3000, 9001 no longer need to be open publicly — Nginx proxies everything through 80/443.

## 3. EC2 setup (first time)

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
sudo apt-get install -y docker-compose-plugin git

# Clone repo
git clone https://github.com/YOUR_USERNAME/iot_project.git
cd iot_project
```

## 4. Start with HTTP only first (needed for Certbot)

```bash
# Use the init config (HTTP only, no SSL yet)
cp .env.example .env

mkdir -p mosquitto/data mosquitto/log nginx/certbot/conf nginx/certbot/www

# Start everything EXCEPT nginx using the init config
docker compose up -d --build

# Wait ~15s then run backfill
sleep 15
docker compose run --rm -e INFLUXDB_URL=http://influxdb:8086 backfill

# Now start nginx with HTTP-only config
# (iot.conf requires certs which don't exist yet — use iot-init.conf)
mv nginx/conf.d/iot.conf nginx/conf.d/iot.conf.disabled
docker compose up -d nginx
```

## 5. Issue SSL certificate

```bash
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your@email.com \
  --agree-tos \
  --no-eff-email \
  -d iot.dan1718.dev
```

## 6. Switch to HTTPS config

```bash
# Restore the full HTTPS config
mv nginx/conf.d/iot.conf.disabled nginx/conf.d/iot.conf
rm nginx/conf.d/iot-init.conf

# Reload nginx
docker compose restart nginx
```

## 7. Verify

Open https://iot.dan1718.dev — should show Grafana with SSL.

| URL | Service |
|-----|---------|
| https://iot.dan1718.dev | Grafana (admin / admin) |
| https://iot.dan1718.dev/console | Worker Console (password) |
| https://iot.dan1718.dev/panel | Demo Panel (password) |
| https://iot.dan1718.dev/api/docs | API docs |

## 8. Point ESP32 at the domain

In `firmware/smart_bin/smart_bin.ino`:

```cpp
#define MQTT_BROKER   "iot.dan1718.dev"
#define MQTT_PORT     1883
#define MQTT_USER     "smartcity"
#define MQTT_PASSWORD "password"
```

MQTT uses plain TCP on port 1883 — not proxied through Nginx.

## 9. Mobile app

On first launch, set server host to:

```
iot.dan1718.dev
```

The app will call `https://iot.dan1718.dev/api/...` automatically.

## SSL renewal

Certbot renews automatically every 12 hours via the certbot container.
To force renew manually:

```bash
docker compose run --rm certbot renew
docker compose restart nginx
```
