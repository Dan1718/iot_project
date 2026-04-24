import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useBinsApi } from '../hooks/useBinsApi';
import BinTile from './BinTile';

function Stat({ label, value, accent }) {
  return (
    <View style={[ss.statCard, accent && ss.statCardAccent]}>
      <Text style={[ss.statVal, accent && ss.statValAccent]}>{value}</Text>
      <Text style={ss.statLbl}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { serverHost, logout, updateHost, error: authError } = useAuth();
  const { bins, fullBins, loading, remoteReset, resetAll, connected, apiError } = useBinsApi(serverHost);
  const { items, clear, requestPermission, push } = useNotifications();
  const [query, setQuery]             = useState('');
  const [tab, setTab]                 = useState('bins');
  const [hostDraft, setHostDraft]     = useState(serverHost);
  const [hostSaved, setHostSaved]     = useState(false);
  const previousFullRef               = useRef(new Set());

  useEffect(() => { setHostDraft(serverHost); }, [serverHost]);

  const mergedBins = useMemo(() => {
    return bins
      .map(bin => ({ ...bin, fill_pct: bin.fill_pct ?? 0 }))
      .sort((a, b) => {
        if (a.bin_id === 'BIN_001') return -1;
        if (b.bin_id === 'BIN_001') return 1;
        return (b.fill_pct ?? 0) - (a.fill_pct ?? 0);
      });
  }, [bins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mergedBins;
    return mergedBins.filter(b =>
      b.bin_id.toLowerCase().includes(q) || (b.zone || '').toLowerCase().includes(q)
    );
  }, [mergedBins, query]);

  const stats = useMemo(() => {
    const total = mergedBins.length;
    const full  = mergedBins.filter(b => (b.fill_pct ?? 0) >= 80).length;
    const avg   = total ? Math.round(mergedBins.reduce((s, b) => s + (b.fill_pct ?? 0), 0) / total) : 0;
    return { total, full, avg };
  }, [mergedBins]);

  useEffect(() => {
    const current = new Set(fullBins.map(b => b.bin_id));
    current.forEach(binId => {
      if (!previousFullRef.current.has(binId)) push(`${binId} is full`, 'alert');
    });
    previousFullRef.current = current;
  }, [fullBins, push]);

  const handleReset = async (binId) => {
    try { await remoteReset(binId); push(`Reset sent to ${binId}`, 'success'); }
    catch { push(`Failed to reset ${binId}`, 'alert'); }
  };

  const handleSaveHost = async () => {
    Keyboard.dismiss();
    const ok = await updateHost(hostDraft);
    if (!ok) return;
    setHostSaved(true);
    setTimeout(() => setHostSaved(false), 1600);
  };

  const TABS = ['bins', 'full', 'alerts', 'settings'];

  return (
    <SafeAreaView style={ss.root}>
      {/* ── Topbar ── */}
      <View style={ss.topbar}>
        <View style={ss.topbarLogo}><Text style={ss.topbarEmoji}>🗑</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={ss.topbarTitle}>Worker Console</Text>
          <Text style={ss.topbarSub}>{serverHost}</Text>
        </View>
        <View style={[ss.connPill, connected ? ss.connOn : ss.connOff]}>
          <View style={[ss.connDot, { backgroundColor: connected ? '#16a34a' : '#dc2626' }]} />
          <Text style={[ss.connText, { color: connected ? '#16a34a' : '#dc2626' }]}>
            {connected ? 'Live' : 'Offline'}
          </Text>
        </View>
        <Pressable onPress={logout} style={ss.logoutBtn}>
          <Text style={ss.logoutText}>Logout</Text>
        </Pressable>
      </View>

      {/* ── Stats strip ── */}
      <View style={ss.statsStrip}>
        <Stat label="Total" value={stats.total} />
        <Stat label="Full"  value={stats.full}  accent />
        <Stat label="Avg"   value={`${stats.avg}%`} />
      </View>

      {/* ── Tabs ── */}
      <View style={ss.tabRow}>
        {TABS.map(t => (
          <Pressable key={t} style={[ss.tab, tab === t && ss.tabActive]} onPress={() => setTab(t)}>
            <Text style={[ss.tabText, tab === t && ss.tabTextActive]}>
              {t === 'full' ? `Full (${stats.full})` : t === 'alerts' ? `Alerts (${items.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled">

        {/* ── BINS ── */}
        {tab === 'bins' && (
          <View style={ss.section}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={ss.searchInput}
              placeholder="Search bin or zone"
              placeholderTextColor="#a8a8a3"
            />
            {loading
              ? <Text style={ss.muted}>Loading bins…</Text>
              : filtered.length === 0
                ? <Text style={ss.muted}>No bins match</Text>
                : filtered.map(bin => (
                    <BinTile key={bin.bin_id} bin={bin} onReset={handleReset} />
                  ))}
          </View>
        )}

        {/* ── FULL ── */}
        {tab === 'full' && (
          <View style={ss.section}>
            {fullBins.length === 0
              ? <Text style={ss.muted}>No bins full right now</Text>
              : fullBins.map(bin => (
                  <BinTile key={bin.bin_id} bin={bin} onReset={handleReset} />
                ))}
          </View>
        )}

        {/* ── ALERTS ── */}
        {tab === 'alerts' && (
          <View style={ss.section}>
            <View style={ss.rowBetween}>
              <Text style={ss.sectionTitle}>Notifications</Text>
              <Pressable onPress={clear}><Text style={ss.link}>Clear all</Text></Pressable>
            </View>
            {items.length === 0
              ? <Text style={ss.muted}>No alerts yet</Text>
              : items.map(item => (
                  <View key={item.id} style={[ss.alertRow, item.type === 'alert' && ss.alertRowDanger]}>
                    <Text style={ss.alertMsg}>{item.message}</Text>
                    <Text style={ss.alertTime}>{formatDistanceToNow(item.ts, { addSuffix: true })}</Text>
                  </View>
                ))}
          </View>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>Connection</Text>
            <Text style={ss.fieldLabel}>Server Host</Text>
            <TextInput
              value={hostDraft}
              onChangeText={setHostDraft}
              autoCapitalize="none"
              autoCorrect={false}
              style={ss.textInput}
              placeholder="192.168.1.100"
              placeholderTextColor="#a8a8a3"
            />
            {apiError ? <Text style={ss.errorText}>{apiError}</Text> : null}
            {authError ? <Text style={ss.errorText}>{authError}</Text> : null}
            <View style={ss.actionRow}>
              <Pressable style={({ pressed }) => [ss.primaryBtn, pressed && ss.primaryBtnPressed, { flex: 1 }]} onPress={handleSaveHost}>
                <Text style={ss.primaryBtnText}>Save Host</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [ss.secondaryBtn, pressed && ss.secondaryBtnPressed, { flex: 1 }]} onPress={requestPermission}>
                <Text style={ss.secondaryBtnText}>Enable Notifications</Text>
              </Pressable>
            </View>
            {hostSaved ? <Text style={ss.saved}>Host saved</Text> : null}

            <View style={{ height: 1, backgroundColor: '#e4e4e0', marginVertical: 4 }} />

            <Text style={ss.sectionTitle}>Actions</Text>
            <Pressable
              style={({ pressed }) => [ss.dangerBtn, pressed && ss.dangerBtnPressed]}
              onPress={async () => {
                try {
                  await resetAll();
                  await push('All simulated bins reset to 20%', 'success');
                } catch {
                  await push('Failed to reset all bins', 'alert');
                }
              }}
            >
              <Text style={ss.dangerBtnText}>Clear All Bins (→ 20%)</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#f7f7f5' },
  topbar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e4e4e0',
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  topbarLogo: {
    width: 34, height: 34, backgroundColor: '#16a34a',
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  topbarEmoji: { fontSize: 16 },
  topbarTitle: { fontSize: 16, fontWeight: '800', color: '#1c1c1a' },
  topbarSub:   { fontSize: 11, color: '#6b6b66', marginTop: 1 },
  connPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1,
  },
  connOn:   { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  connOff:  { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  connDot:  { width: 7, height: 7, borderRadius: 99 },
  connText: { fontSize: 12, fontWeight: '700' },
  logoutBtn:  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f7f7f5', borderWidth: 1, borderColor: '#e4e4e0' },
  logoutText: { color: '#6b6b66', fontWeight: '700', fontSize: 13 },

  statsStrip: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e4e4e0',
    padding: 12, gap: 10,
  },
  statCard: {
    flex: 1, backgroundColor: '#f7f7f5',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#e4e4e0',
  },
  statCardAccent: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  statVal:        { fontSize: 22, fontWeight: '800', color: '#1c1c1a' },
  statValAccent:  { color: '#dc2626' },
  statLbl:        { fontSize: 11, color: '#6b6b66', textTransform: 'uppercase', letterSpacing: .5, marginTop: 2 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e4e4e0',
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: '#16a34a' },
  tabText:       { fontSize: 12, fontWeight: '600', color: '#6b6b66' },
  tabTextActive: { color: '#16a34a' },

  content:       { padding: 12, gap: 10, paddingBottom: 40 },
  section:       { gap: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: '800', color: '#1c1c1a' },

  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#d1d1cc',
    borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11,
    color: '#1c1c1a', fontSize: 15,
  },
  muted: { color: '#a8a8a3', fontSize: 14, paddingVertical: 8 },

  alertRow: {
    backgroundColor: '#fff',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#e4e4e0', gap: 4,
  },
  alertRowDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  alertMsg:       { color: '#1c1c1a', fontSize: 14, lineHeight: 20 },
  alertTime:      { color: '#a8a8a3', fontSize: 12 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link:       { color: '#16a34a', fontWeight: '700', fontSize: 14 },

  fieldLabel:   { fontSize: 11, fontWeight: '700', color: '#6b6b66', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 4 },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#d1d1cc',
    borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12,
    color: '#1c1c1a', fontSize: 15,
  },
  errorText:  { color: '#dc2626', fontSize: 12 },
  actionRow:  { flexDirection: 'row', gap: 8 },
  primaryBtn: { backgroundColor: '#16a34a', borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  primaryBtnPressed: { backgroundColor: '#15803d' },
  primaryBtnText:    { color: '#fff', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#f0fdf4', borderRadius: 11, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#bbf7d0' },
  secondaryBtnPressed: { backgroundColor: '#dcfce7' },
  secondaryBtnText:    { color: '#16a34a', fontWeight: '700' },
  saved: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  dangerBtn: { backgroundColor: '#fef2f2', borderRadius: 11, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  dangerBtnPressed: { backgroundColor: '#fee2e2' },
  dangerBtnText: { color: '#dc2626', fontWeight: '700' },
});
