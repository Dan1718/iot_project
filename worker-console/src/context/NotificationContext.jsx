import { createContext, useContext, useState, useCallback, useRef } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((msg, type = 'info') => {
    const id = ++idRef.current;
    const note = { id, msg, type, ts: new Date() };

    setNotifications(prev => [note, ...prev].slice(0, 50));

    // Request browser push notification if permitted
    if (Notification.permission === 'granted') {
      new Notification(`Smart City Bins — ${type.toUpperCase()}`, {
        body: msg,
        icon: '/bin-icon.png',
        badge: '/bin-icon.png',
      });
    }

    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const requestPermission = useCallback(async () => {
    if (Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, push, dismiss, requestPermission }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
