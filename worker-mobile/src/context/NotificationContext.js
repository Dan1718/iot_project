import { createContext, useContext, useMemo, useState } from 'react';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [items, setItems] = useState([]);

  const requestPermission = async () => {
    await Notifications.requestPermissionsAsync();
  };

  const push = async (message, type = 'info') => {
    const item = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      message,
      type,
      ts: Date.now(),
    };
    setItems((prev) => [item, ...prev].slice(0, 50));

    const perms = await Notifications.getPermissionsAsync();
    if (perms.granted) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: type === 'alert' ? 'SmartCity Alert' : 'SmartCity Update',
          body: message,
        },
        trigger: null,
      });
    }
  };

  const clear = () => setItems([]);

  const value = useMemo(() => ({ items, push, clear, requestPermission }), [items]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
