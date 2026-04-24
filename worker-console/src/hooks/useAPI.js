import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CONFIG } from '../config';

export function useAPI() {
  const [bins,    setBins]    = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await axios.get(`${CONFIG.API_BASE_URL}/bins`);
      setBins(res.data);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const t = setInterval(fetch, CONFIG.POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetch]);

  const remoteReset = useCallback(async (binId) => {
    await axios.post(`${CONFIG.API_BASE_URL}/bins/${binId}/reset`);
  }, []);

  const resetAll = useCallback(async () => {
    await axios.post(`${CONFIG.API_BASE_URL}/bins/reset-all`);
    await fetch();
  }, [fetch]);

  return { bins, loading, remoteReset, resetAll, refetch: fetch };
}
