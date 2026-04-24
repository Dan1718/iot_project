import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_PASSWORD, DEFAULT_SERVER_HOST } from '../config/defaults';

const AuthContext = createContext(null);

const AUTH_KEY = 'worker_mobile_auth';
const HOST_KEY = 'worker_mobile_host';

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [serverHost, setServerHost] = useState(DEFAULT_SERVER_HOST);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [authValue, hostValue] = await Promise.all([
        AsyncStorage.getItem(AUTH_KEY),
        AsyncStorage.getItem(HOST_KEY),
      ]);
      setAuthed(authValue === 'true');
      if (hostValue) setServerHost(hostValue);
      setReady(true);
    })();
  }, []);

  const login = async (password, host) => {
    const trimmedHost = host.trim();
    if (!trimmedHost) {
      setError('Server IP/host is required');
      return false;
    }
    if (password !== APP_PASSWORD) {
      setError('Incorrect password');
      return false;
    }

    await Promise.all([
      AsyncStorage.setItem(AUTH_KEY, 'true'),
      AsyncStorage.setItem(HOST_KEY, trimmedHost),
    ]);
    setServerHost(trimmedHost);
    setAuthed(true);
    setError('');
    return true;
  };

  const logout = async () => {
    await AsyncStorage.removeItem(AUTH_KEY);
    setAuthed(false);
  };

  const updateHost = async (host) => {
    const trimmedHost = host.trim();
    if (!trimmedHost) {
      setError('Server IP/host is required');
      return false;
    }
    await AsyncStorage.setItem(HOST_KEY, trimmedHost);
    setServerHost(trimmedHost);
    setError('');
    return true;
  };

  const value = useMemo(() => ({
    ready,
    authed,
    login,
    logout,
    error,
    serverHost,
    updateHost,
  }), [ready, authed, error, serverHost]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
