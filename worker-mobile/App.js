import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';
import process from 'process';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import LoginScreen from './src/components/LoginScreen';
import DashboardScreen from './src/components/DashboardScreen';

global.Buffer = Buffer;
global.process = process;

function AppInner() {
  const { authed } = useAuth();
  return authed ? <DashboardScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <StatusBar style="light" />
        <AppInner />
      </NotificationProvider>
    </AuthProvider>
  );
}
