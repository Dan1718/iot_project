import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login, error, serverHost, ready } = useAuth();
  const [host, setHost]         = useState(serverHost);
  const [password, setPassword] = useState('');

  if (!ready) return <SafeAreaView style={s.root} />;

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={s.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <View style={s.logoBox}>
            <Text style={s.logoEmoji}>🗑</Text>
          </View>
          <Text style={s.title}>Worker Console</Text>
          <Text style={s.subtitle}>Hyderabad Smart City</Text>
        </View>

        <View style={s.card}>
          <View style={s.fieldGroup}>
            <Text style={s.label}>Server Host</Text>
            <TextInput
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="192.168.1.100"
              placeholderTextColor="#a8a8a3"
              style={s.input}
            />
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.label}>Passcode</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter passcode"
              placeholderTextColor="#a8a8a3"
              style={s.input}
            />
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]} onPress={() => login(password, host)}>
            <Text style={s.btnText}>Enter Console</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#f7f7f5' },
  outer:    { flex: 1, justifyContent: 'center', padding: 20 },
  header:   { alignItems: 'center', marginBottom: 28 },
  logoBox:  {
    width: 52, height: 52, backgroundColor: '#16a34a',
    borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  logoEmoji: { fontSize: 24 },
  title:     { fontSize: 26, fontWeight: '800', color: '#1c1c1a', letterSpacing: -.4 },
  subtitle:  { fontSize: 14, color: '#6b6b66', marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4e4e0',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: .06,
    shadowRadius: 12,
    elevation: 2,
  },
  fieldGroup: { gap: 6 },
  label:      { fontSize: 11, fontWeight: '700', color: '#6b6b66', textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d1cc',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1c1c1a',
    backgroundColor: '#f7f7f5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  error:      { color: '#dc2626', fontSize: 13 },
  btn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPressed: { backgroundColor: '#15803d' },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
});
