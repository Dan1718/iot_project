export const APP_PASSWORD = 'password';
export const DEFAULT_SERVER_HOST = '192.168.1.100';
export const MQTT_USER = 'smartcity';
export const MQTT_PASSWORD = 'password';

export function buildApiBase(host) {
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host.match(/^\d+\.\d+\.\d+\.\d+$/);
  const proto = isLocalhost ? 'http' : 'https';
  const port  = isLocalhost ? ':8000' : '';
  return `${proto}://${host}${port}/backend`;
}

export function buildMqttUrl(host) {
  return `ws://${host}:9001`;
}
