export const APP_PASSWORD = 'password';
export const DEFAULT_SERVER_HOST = '192.168.1.100';
export const MQTT_USER = 'smartcity';
export const MQTT_PASSWORD = 'password';

export function buildApiBase(host) {
  return `http://${host}:8000`;
}

export function buildMqttUrl(host) {
  return `ws://${host}:9001`;
}
