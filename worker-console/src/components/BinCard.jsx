import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function BinCard({ bin, liveData, onReset }) {
  const [resetting, setResetting] = useState(false);
  const fill           = liveData?.fill_pct ?? bin.fill_pct ?? 0;
  const awaitingReset  = liveData?.awaiting_reset ?? bin.awaiting_reset ?? false;
  const full           = fill >= 80 || awaitingReset;
  const isPhysical     = bin.bin_id === 'BIN_001';
  const ts         = liveData?._ts ? new Date(liveData._ts) : null;
  const fillColor  = full ? '#dc2626' : fill >= 40 ? '#d97706' : '#16a34a';
  const barColor   = full ? '#fecaca' : fill >= 40 ? '#fde68a' : '#bbf7d0';

  const handleReset = async () => {
    setResetting(true);
    await onReset(bin.bin_id);
    setTimeout(() => setResetting(false), 1200);
  };

  return (
    <div style={s.row}>
      {/* fill accent bar on left edge */}
      <div style={{ ...s.accent, background: fillColor }} />

      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.binId}>{bin.bin_id}</span>
          {isPhysical && <span style={s.badge}>Physical</span>}
        </div>
        <div style={s.zone}>{bin.zone || 'Unknown zone'}</div>
      </div>

      {/* inline fill bar */}
      <div style={s.barWrap}>
        <div style={{ ...s.barFill, width: `${fill}%`, background: barColor }} />
        <span style={{ ...s.barLabel, color: fillColor }}>{fill}%</span>
      </div>

      <div style={s.meta}>
        {ts ? formatDistanceToNow(ts, { addSuffix: true }) : 'No data'}
      </div>

      <div style={s.actionCell}>
        {full ? (
          <button
            style={{ ...s.resetBtn, opacity: resetting ? .6 : 1 }}
            onClick={handleReset}
            disabled={resetting}
            onMouseEnter={e => !resetting && (e.target.style.background = '#15803d')}
            onMouseLeave={e => (e.target.style.background = '#16a34a')}
          >
            {resetting ? 'Sent' : 'Reset'}
          </button>
        ) : <span style={s.ok}>OK</span>}
      </div>
    </div>
  );
}

const s = {
  row: {
    display: 'grid',
    gridTemplateColumns: '4px 1.4fr 180px 130px 80px',
    alignItems: 'center',
    gap: '1rem',
    padding: '.75rem 1rem .75rem 0',
    borderBottom: '1px solid #e4e4e0',
  },
  accent: { width: '4px', height: '36px', borderRadius: '2px', flexShrink: 0 },
  main: { minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: '.5rem' },
  binId: { fontWeight: 600, color: '#1c1c1a', fontFamily: "'DM Mono', monospace", fontSize: '.9rem' },
  badge: {
    fontSize: '.65rem', fontWeight: 700, color: '#2563eb',
    background: '#dbeafe', borderRadius: '999px',
    padding: '.1rem .45rem', letterSpacing: '.03em',
  },
  zone: { color: '#6b6b66', fontSize: '.82rem', marginTop: '.15rem' },
  barWrap: {
    height: '8px', background: '#f0f0ec', borderRadius: '4px',
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center',
  },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: '4px', transition: 'width .5s ease' },
  barLabel: {
    position: 'absolute', right: 0,
    fontFamily: "'DM Mono', monospace", fontSize: '.72rem', fontWeight: 500,
    background: 'transparent', transform: 'translateX(calc(100% + 6px))',
    whiteSpace: 'nowrap',
  },
  meta: { color: '#a8a8a3', fontSize: '.78rem', fontFamily: "'DM Mono', monospace" },
  actionCell: { display: 'flex', justifyContent: 'flex-end' },
  resetBtn: {
    border: 'none', background: '#16a34a', color: '#fff',
    borderRadius: '8px', padding: '.4rem .8rem',
    fontSize: '.8rem', fontWeight: 600, cursor: 'pointer',
    transition: 'background .15s',
  },
  ok: { color: '#a8a8a3', fontSize: '.82rem' },
};
