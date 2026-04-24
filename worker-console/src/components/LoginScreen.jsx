import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login, error } = useAuth();
  const [pw, setPw] = useState('');

  const handle = (e) => { e.preventDefault(); login(pw); };

  return (
    <div style={s.root}>
      <form style={s.card} onSubmit={handle}>
        <div style={s.iconWrap}>🗑</div>
        <div>
          <h1 style={s.title}>Worker Console</h1>
          <p style={s.sub}>Hyderabad Smart City · Waste Management</p>
        </div>

        <div style={s.field}>
          <label style={s.label}>Passcode</label>
          <input
            type="password"
            placeholder="Enter passcode"
            value={pw}
            onChange={e => setPw(e.target.value)}
            style={s.input}
            autoFocus
          />
          {error && <p style={s.error}>{error}</p>}
        </div>

        <button type="submit" style={s.btn}
          onMouseEnter={e => e.target.style.background = '#15803d'}
          onMouseLeave={e => e.target.style.background = '#16a34a'}
        >
          Enter Console
        </button>
      </form>
    </div>
  );
}

const s = {
  root: {
    minHeight: '100vh',
    background: '#f7f7f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  card: {
    width: '100%',
    maxWidth: '360px',
    background: '#ffffff',
    border: '1px solid #e4e4e0',
    borderRadius: '18px',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    boxShadow: '0 4px 20px rgba(0,0,0,.07)',
  },
  iconWrap: {
    width: '44px', height: '44px',
    background: '#16a34a',
    borderRadius: '12px',
    display: 'grid',
    placeItems: 'center',
    fontSize: '1.3rem',
  },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#1c1c1a', letterSpacing: '-.02em' },
  sub:   { fontSize: '.85rem', color: '#6b6b66', marginTop: '.2rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '.45rem' },
  label: { fontSize: '.75rem', fontWeight: 600, color: '#6b6b66', textTransform: 'uppercase', letterSpacing: '.07em' },
  input: {
    border: '1px solid #d1d1cc',
    borderRadius: '10px',
    padding: '.75rem .9rem',
    fontSize: '1rem',
    fontFamily: "'DM Mono', monospace",
    color: '#1c1c1a',
    background: '#f7f7f5',
    transition: 'border-color .15s, box-shadow .15s',
  },
  error: { color: '#dc2626', fontSize: '.8rem' },
  btn: {
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    borderRadius: '10px',
    padding: '.85rem',
    fontSize: '.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background .15s',
  },
};
