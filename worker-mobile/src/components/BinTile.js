import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function BinTile({ bin, onReset }) {
  const fill       = bin.fill_pct ?? 0;
  const isFull     = fill >= 80;
  const isPhysical = bin.bin_id === 'BIN_001';
  const fillColor  = isFull ? '#dc2626' : fill >= 40 ? '#d97706' : '#16a34a';
  const barColor   = isFull ? '#fecaca' : fill >= 40 ? '#fde68a' : '#bbf7d0';
  const status     = isFull ? 'Full — needs pickup' : fill >= 40 ? 'Half full' : 'Normal';

  return (
    <View style={[s.row, isFull && s.rowFull, isPhysical && s.rowPhysical]}>
      {/* accent strip */}
      <View style={[s.accent, { backgroundColor: fillColor }]} />

      <View style={s.info}>
        <View style={s.titleRow}>
          <Text style={s.id}>{bin.bin_id}</Text>
          {isPhysical && <View style={s.badge}><Text style={s.badgeText}>Physical</Text></View>}
        </View>
        <Text style={s.zone}>{bin.zone || 'Unknown zone'}</Text>
        <Text style={[s.status, { color: fillColor }]}>{status}</Text>
      </View>

      <View style={s.right}>
        <Text style={[s.pct, { color: fillColor }]}>{fill}%</Text>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${fill}%`, backgroundColor: barColor }]} />
        </View>
        {isFull && (
          <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]} onPress={() => onReset(bin.bin_id)}>
            <Text style={s.btnText}>Reset</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e4e4e0',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: .04,
    shadowRadius: 4,
    elevation: 1,
  },
  rowFull:     { borderColor: '#fecaca' },
  rowPhysical: { borderColor: '#bbf7d0' },
  accent: { width: 4 },
  info:    { flex: 1, padding: 12, paddingLeft: 10 },
  titleRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  id:      { fontSize: 15, fontWeight: '800', color: '#1c1c1a' },
  badge: {
    backgroundColor: '#dbeafe', borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#2563eb' },
  zone:      { color: '#6b6b66', marginTop: 2, fontSize: 13 },
  status:    { marginTop: 4, fontSize: 12, fontWeight: '600' },
  right:     { padding: 12, alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  pct:       { fontSize: 22, fontWeight: '800' },
  barTrack:  { width: 70, height: 6, backgroundColor: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 3 },
  btn: {
    backgroundColor: '#16a34a', borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 7, marginTop: 2,
  },
  btnPressed: { backgroundColor: '#15803d' },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },
});
