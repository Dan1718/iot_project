// When served via the domain (iot.dan1718.dev), use subpath routing.
// When served locally (localhost), use direct ports.
const onDomain = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const proto    = window.location.protocol === 'https:' ? 'wss' : 'ws';

export const CONFIG = {
  MQTT_WS_URL:  onDomain
    ? `${proto}://${window.location.hostname}/mqtt`
    : `ws://${window.location.hostname}:9001`,
  API_BASE_URL: onDomain
    ? `${window.location.protocol}//${window.location.hostname}/api`
    : `http://${window.location.hostname}:8000`,
  PASSWORD: 'password',
  POLL_INTERVAL_MS: 10000,
};
