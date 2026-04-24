import { useNotifications } from '../context/NotificationContext';
import { formatDistanceToNow } from 'date-fns';

const TYPE = {
  alert:   { dot: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  success: { dot: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  info:    { dot: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
};

export default function NotificationPanel({ onClose }) {
  const { notifications, dismiss, requestPermission } = useNotifications();

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.headerTitle}>Notifications</span>
          <div style={s.headerActions}>
            <button style={s.ghostBtn} onClick={requestPermission}>Enable Push</button>
            <button style={s.closeBtn} onClick={onClose}>Close ✕</button>
          </div>
        </div>

        <div style={s.body}>
          {notifications.length === 0 && <div style={s.empty}>No notifications yet</div>}
          {notifications.map(n => {
            const t = TYPE[n.type] || TYPE.info;
            return (
              <div key={n.id} style={{ ...s.item, background: t.bg, borderColor: t.border }}>
                <div style={{ ...s.dot, background: t.dot }} />
                <div style={s.itemBody}>
                  <div style={s.msg}>{n.msg}</div>
                  <div style={s.time}>{formatDistanceToNow(n.ts, { addSuffix: true })}</div>
                </div>
                <button style={s.dismiss} onClick={() => dismiss(n.id)}>✕</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(28,28,26,.12)',
    backdropFilter: 'blur(2px)',
    zIndex: 1000,
    display: 'flex', justifyContent: 'flex-end',
  },
  panel: {
    width: '380px', maxWidth: '100%', height: '100%',
    background: '#f7f7f5',
    borderLeft: '1px solid #e4e4e0',
    display: 'flex', flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,.07)',
  },
  header: {
    padding: '1rem 1.25rem',
    background: '#fff',
    borderBottom: '1px solid #e4e4e0',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { fontWeight: 700, color: '#1c1c1a', fontSize: '.95rem' },
  headerActions: { display: 'flex', gap: '.5rem' },
  ghostBtn: {
    border: '1px solid #d1d1cc', background: '#fff',
    borderRadius: '8px', padding: '.4rem .7rem',
    fontSize: '.78rem', cursor: 'pointer', color: '#6b6b66',
  },
  closeBtn: {
    border: 'none', background: '#16a34a',
    color: '#fff', borderRadius: '8px',
    padding: '.4rem .7rem', fontSize: '.78rem',
    fontWeight: 600, cursor: 'pointer',
  },
  body: {
    padding: '.75rem', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '.5rem',
  },
  item: {
    border: '1px solid',
    borderRadius: '10px', padding: '.75rem',
    display: 'flex', gap: '.6rem', alignItems: 'flex-start',
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
  itemBody: { flex: 1, minWidth: 0 },
  msg:  { color: '#1c1c1a', fontSize: '.85rem', lineHeight: 1.4 },
  time: { color: '#a8a8a3', fontSize: '.75rem', marginTop: '.2rem', fontFamily: "'DM Mono', monospace" },
  dismiss: { border: 'none', background: 'transparent', color: '#a8a8a3', cursor: 'pointer', fontSize: '.85rem' },
  empty: { color: '#a8a8a3', textAlign: 'center', padding: '2rem', fontSize: '.875rem' },
};
