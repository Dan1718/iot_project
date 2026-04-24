import { createContext, useContext, useState, useEffect } from 'react';
import { CONFIG } from '../config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('wc_auth') === 'true');
  const [error, setError]   = useState('');

  const login = (password) => {
    if (password === CONFIG.PASSWORD) {
      sessionStorage.setItem('wc_auth', 'true');
      setAuthed(true);
      setError('');
      return true;
    }
    setError('Incorrect password');
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem('wc_auth');
    setAuthed(false);
  };

  return (
    <AuthContext.Provider value={{ authed, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
