import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useMQTT } from '../hooks/useMQTT';
import { useAPI } from '../hooks/useAPI';
import BinCard from './BinCard';
import NotificationPanel from './NotificationPanel';

export default function Dashboard() {
  const { logout }                                   = useAuth();
  const { notifications, push }                      = useNotifications();
  const { connected, binData, events, sendReset }    = useMQTT();
  const { bins, loading, remoteReset, resetAll }      = useAPI();
  const [showNotifs, setShowNotifs]                  = useState(false);
  const [search, setSearch]                          = useState('');
  const [tab, setTab]                                = useState('bins');

  const mergedBins = useMemo(() => {
    return bins
      .map(b => ({ ...b, fill_pct: binData[b.bin_id]?.fill_pct ?? b.fill_pct ?? 0 }))
      .sort((a, b) => {
        if (a.bin_id === 'BIN_001') return -1;
        if (b.bin_id === 'BIN_001') return 1;
        return (b.fill_pct ?? 0) - (a.fill_pct ?? 0);
      });
  }, [bins, binData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? mergedBins.filter(b => b.bin_id.toLowerCase().includes(q) || (b.zone || '').toLowerCase().includes(q)) : mergedBins;
  }, [mergedBins, search]);

  const stats = useMemo(() => {
    const total = mergedBins.length;
    const full  = mergedBins.filter(b => (b.fill_pct ?? 0) >= 80).length;
    const avg   = total ? Math.round(mergedBins.reduce((s, b) => s + (b.fill_pct ?? 0), 0) / total) : 0;
    return { total, full, avg };
  }, [mergedBins]);

  const handleReset = async (binId) => {
    try {
      sendReset(binId);
      await remoteReset(binId);
      push(`Reset sent to ${binId}`, 'success');
    } catch {
      push(`Failed to reset ${binId}`, 'alert');
    }
  };

  return (
    <div style={s.root}>
      {/* ── Topbar ── */}
      <header style={s.topbar}>
        <div style={s.topbarLeft}>
          <div style={s.logo}>🗑</div>
          <div>
            <div style={s.appName}>Worker Console</div>
            <div style={s.appSub}>Hyderabad Smart City · Waste Management</div>
          </div>
        </div>
        <div style={s.topbarRight}>
          <div style={{
            ...s.connPill,
            background: connected ? '#f0fdf4' : '#fef2f2',
            borderColor: connected ? '#bbf7d0' : '#fecaca',
            color: connected ? '#16a34a' : '#dc2626',
          }}>
            <div style={{ ...s.connDot, background: 'currentColor' }} />
            {connected ? 'Live' : 'Offline'}
          </div>
          <button style={s.ghostBtn} onClick={() => setShowNotifs(true)}>
            Alerts {notifications.length > 0 && <span style={s.badge}>{notifications.length}</span>}
          </button>
          <button
            style={s.clearBtn}
            onClick={async () => {
              if (window.confirm('Set all simulated bins to 20%?')) {
                await resetAll();
                push('All simulated bins reset to 20%', 'success');
              }
            }}
          >
            Clear All
          </button>
          <button style={s.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      {/* ── Summary strip ── */}
      <div style={s.strip}>
        {[
          { label: 'Total bins',    value: stats.total },
          { label: 'Full',          value: stats.full  },
          { label: 'Average fill',  value: `${stats.avg}%` },
        ].map(({ label, value }) => (
          <div key={label} style={s.statItem}>
            <div style={s.statVal}>{value}</div>
            <div style={s.statLbl}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabBar}>
        {['bins', 'events'].map(t => (
          <button
            key={t}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t === 'bins' ? 'Bins' : 'Events'}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={s.content}>
        {tab === 'bins' && (
          <>
            <input
              style={s.search}
              placeholder="Search bin or zone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {!loading && filtered.length > 0 && (
              <div style={s.tableHead}>
                <div />
                <div>Bin</div>
                <div>Fill level</div>
                <div>Updated</div>
                <div style={{ textAlign: 'right' }}>Action</div>
              </div>
            )}

            {loading
              ? <div style={s.muted}>Loading bins…</div>
              : filtered.length === 0
                ? <div style={s.muted}>No bins match your search</div>
                : filtered.map(bin => (
                    <BinCard
                      key={bin.bin_id}
                      bin={bin}
                      liveData={binData[bin.bin_id]}
                      onReset={handleReset}
                    />
                  ))}
          </>
        )}

        {tab === 'events' && (
          <>
            <div style={s.tableHeadEvents}>
              <div>Bin</div>
              <div>Event</div>
              <div style={{ textAlign: 'right' }}>Time</div>
            </div>
            {events.length === 0
              ? <div style={s.muted}>No events yet</div>
              : events.map((evt, i) => (
                  <div key={`${evt.binId}_${evt._ts}_${i}`} style={s.eventRow}>
                    <span style={s.eventBin}>{evt.binId}</span>
                    <span style={{
                      ...s.eventTag,
                      background: evt.event === 'FULL' ? '#fef2f2' : '#f0fdf4',
                      color:      evt.event === 'FULL' ? '#dc2626' : '#16a34a',
                    }}>
                      {evt.event}
                    </span>
                    <span style={s.eventTime}>{new Date(evt._ts).toLocaleTimeString('en-GB')}</span>
                  </div>
                ))}
          </>
        )}
      </div>

      {showNotifs && <NotificationPanel onClose={() => setShowNotifs(false)} />}
    </div>
  );
}

const s = {
  root: { minHeight: '100vh', background: '#f7f7f5', display: 'flex', flexDirection: 'column' },

  topbar: {
    background: '#fff', borderBottom: '1px solid #e4e4e0',
    padding: '.875rem 1.5rem',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    position: 'sticky', top: 0, zIndex: 100,
    flexWrap: 'wrap', gap: '.75rem',
  },
  topbarLeft: { display: 'flex', gap: '.75rem', alignItems: 'center' },
  logo: {
    width: '34px', height: '34px', background: '#16a34a',
    borderRadius: '9px', display: 'grid', placeItems: 'center', fontSize: '1.1rem', flexShrink: 0,
  },
  appName:  { fontWeight: 700, color: '#1c1c1a', fontSize: '.95rem', letterSpacing: '-.01em' },
  appSub:   { color: '#6b6b66', fontSize: '.75rem', marginTop: '1px' },
  topbarRight: { display: 'flex', gap: '.6rem', alignItems: 'center' },
  connPill: {
    display: 'flex', alignItems: 'center', gap: '.4rem',
    padding: '.3rem .75rem', borderRadius: '999px',
    border: '1px solid', fontSize: '.78rem', fontWeight: 600,
    fontFamily: "'DM Mono', monospace",
  },
  connDot: { width: '7px', height: '7px', borderRadius: '50%' },
  ghostBtn: {
    border: '1px solid #d1d1cc', background: '#fff',
    borderRadius: '9px', padding: '.55rem 1rem',
    color: '#1c1c1a', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '.4rem',
  },
  badge: {
    background: '#16a34a', color: '#fff',
    borderRadius: '999px', fontSize: '.65rem',
    fontWeight: 700, padding: '.1rem .4rem',
  },
  clearBtn: {
    border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
    borderRadius: '9px', padding: '.55rem 1rem',
    fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
  },
  logoutBtn: {
    border: 'none', background: '#16a34a', color: '#fff',
    borderRadius: '9px', padding: '.55rem 1rem',
    fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
  },

  strip: {
    background: '#fff', borderBottom: '1px solid #e4e4e0',
    padding: '.75rem 1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap',
  },
  statItem: {},
  statVal:  { fontSize: '1.4rem', fontWeight: 700, color: '#1c1c1a', fontFamily: "'DM Mono', monospace", letterSpacing: '-.02em' },
  statLbl:  { fontSize: '.75rem', color: '#6b6b66', textTransform: 'uppercase', letterSpacing: '.07em', marginTop: '.1rem' },

  tabBar: {
    background: '#fff', borderBottom: '1px solid #e4e4e0',
    padding: '0 1.5rem', display: 'flex', gap: '.25rem',
  },
  tab: {
    border: 'none', background: 'transparent',
    borderBottom: '2px solid transparent',
    padding: '.7rem 1rem', color: '#6b6b66',
    fontSize: '.875rem', fontWeight: 600, cursor: 'pointer',
    transition: 'color .15s',
  },
  tabActive: { color: '#16a34a', borderBottomColor: '#16a34a' },

  content: { padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '.5rem', flex: 1 },
  search: {
    border: '1px solid #d1d1cc', borderRadius: '10px',
    padding: '.7rem .9rem', fontSize: '.9rem',
    background: '#fff', color: '#1c1c1a', marginBottom: '.5rem',
    transition: 'border-color .15s, box-shadow .15s',
  },

  tableHead: {
    display: 'grid',
    gridTemplateColumns: '4px 1.4fr 180px 130px 80px',
    gap: '1rem', padding: '.5rem 1rem .5rem 0',
    fontSize: '.72rem', fontWeight: 700,
    color: '#a8a8a3', textTransform: 'uppercase', letterSpacing: '.07em',
    borderBottom: '2px solid #e4e4e0',
  },
  tableHeadEvents: {
    display: 'grid', gridTemplateColumns: '1.2fr 1fr auto',
    gap: '1rem', padding: '.5rem 0',
    fontSize: '.72rem', fontWeight: 700,
    color: '#a8a8a3', textTransform: 'uppercase', letterSpacing: '.07em',
    borderBottom: '2px solid #e4e4e0',
  },
  muted: { color: '#a8a8a3', fontSize: '.875rem', padding: '.5rem 0' },

  eventRow: {
    display: 'grid', gridTemplateColumns: '1.2fr 1fr auto',
    gap: '1rem', alignItems: 'center',
    padding: '.65rem 0', borderBottom: '1px solid #e4e4e0',
  },
  eventBin:  { fontWeight: 600, color: '#1c1c1a', fontFamily: "'DM Mono', monospace", fontSize: '.88rem' },
  eventTag:  { fontSize: '.75rem', fontWeight: 700, padding: '.2rem .5rem', borderRadius: '6px', width: 'fit-content' },
  eventTime: { color: '#a8a8a3', fontSize: '.78rem', fontFamily: "'DM Mono', monospace", textAlign: 'right' },
};
