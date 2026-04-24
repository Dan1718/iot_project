import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt from 'mqtt';
import { CONFIG } from '../config';
import { useNotifications } from '../context/NotificationContext';

export function useMQTT() {
  const clientRef               = useRef(null);
  const [connected, setConnected] = useState(false);
  const [binData, setBinData]     = useState({});   // bin_id → latest telemetry
  const [events, setEvents]       = useState([]);   // last 100 events across all bins
  const { push }                  = useNotifications();
  const prevFullRef               = useRef(new Set());

  useEffect(() => {
    const client = mqtt.connect(CONFIG.MQTT_WS_URL, {
      clientId: 'worker_console_' + Math.random().toString(16).slice(2),
      username: 'smartcity',
      password: 'password',
      reconnectPeriod: 3000,
    });
    clientRef.current = client;

    client.on('connect', () => {
      setConnected(true);
      client.subscribe('city/bins/+/telemetry');
      client.subscribe('city/bins/+/events');
      client.subscribe('city/alerts');
    });

    client.on('disconnect', () => setConnected(false));
    client.on('error', ()     => setConnected(false));

    client.on('message', (topic, payload) => {
      try {
        const data  = JSON.parse(payload.toString());
        const parts = topic.split('/');          // city/bins/<id>/<type>
        const binId = parts[2];
        const type  = parts[3];

        if (type === 'telemetry') {
          setBinData(prev => ({ ...prev, [binId]: { ...data, _ts: Date.now() } }));

          // Detect newly full bins and push notification
          if (data.fill_pct >= 80 && !prevFullRef.current.has(binId)) {
            prevFullRef.current.add(binId);
            push(`🔴 ${binId} is FULL (${data.fill_pct}%)`, 'alert');
          } else if (data.fill_pct < 80) {
            prevFullRef.current.delete(binId);
          }
        }

        if (type === 'events') {
          // Only log FULL and RESET — suppress APPROACH
          if (data.event === 'APPROACH') return;

          const evt = { ...data, binId, _ts: Date.now() };
          setEvents(prev => [evt, ...prev].slice(0, 100));

          if (data.event === 'FULL')  push(`🔴 ${binId} — BIN FULL`, 'alert');
          if (data.event === 'RESET') push(`✅ ${binId} — Collected`, 'success');
        }
      } catch (_) {}
    });

    return () => client.end();
  }, [push]);

  const sendReset = useCallback((binId) => {
    clientRef.current?.publish(`city/bins/${binId}/cmd`, 'RESET');
  }, []);

  return { connected, binData, events, sendReset };
}
