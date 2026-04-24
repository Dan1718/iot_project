import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { buildApiBase } from '../config/defaults';

export function useBinsApi(serverHost) {
  const [bins, setBins] = useState([]);
  const [fullBins, setFullBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [apiError, setApiError] = useState('');
  const apiBase = useMemo(() => buildApiBase(serverHost), [serverHost]);

  useEffect(() => {
    let mounted = true;
    const fetchBins = async () => {
      try {
        const [binsRes, fullRes] = await Promise.all([
          axios.get(`${apiBase}/bins`),
          axios.get(`${apiBase}/bins/full`),
        ]);
        if (mounted) {
          setBins(binsRes.data);
          setFullBins(fullRes.data);
          setConnected(true);
          setApiError('');
        }
      } catch (err) {
        if (mounted) {
          setConnected(false);
          setApiError(err?.message || 'Backend unavailable');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchBins();
    const timer = setInterval(fetchBins, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [apiBase]);

  const remoteReset = async (binId) => {
    await axios.post(`${apiBase}/bins/${binId}/reset`);
  };

  const resetAll = async () => {
    await axios.post(`${apiBase}/bins/reset-all`);
  };

  return { bins, fullBins, loading, remoteReset, resetAll, connected, apiError };
}
