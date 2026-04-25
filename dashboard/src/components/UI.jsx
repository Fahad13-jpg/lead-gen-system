import React from 'react';

export function PageWrap({ children }) {
  return <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>{children}</div>;
}

export function Card({ children, style = {}, padding = 20 }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding, ...style
    }}>{children}</div>
  );
}

export function Btn({ children, onClick, variant = 'primary', loading, disabled, style = {} }) {
  const variants = {
    primary:   { background: 'var(--accent)', color: '#fff', border: 'none' },
    secondary: { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)' },
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', fontSize: 12, fontWeight: 500,
      borderRadius: 6, cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transition: 'var(--transition)', ...variants[variant], ...style,
    }}>
      {loading ? <div className="spinner" style={{ width: 12, height: 12 }} /> : children}
    </button>
  );
}

export function Input({ label, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{label}</label>}
      <input style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 6, padding: '8px 11px', color: 'var(--text)',
        fontSize: 13, outline: 'none',
      }} {...props} />
    </div>
  );
}

export function Badge({ children, type = 'cold' }) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

export function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div className="spinner" style={{ width: 24, height: 24 }} />
    </div>
  );
}

export function Alert({ children, type = 'error', style = {} }) {
  const map = {
    error:   { bg: 'rgba(248,81,73,0.08)', border: 'rgba(248,81,73,0.2)', color: '#f85149' },
    success: { bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.2)', color: '#3fb950' },
    info:    { bg: 'rgba(47,129,247,0.08)', border: 'rgba(47,129,247,0.2)', color: '#2f81f7' },
  };
  const s = map[type];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, fontSize: 12,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color, ...style
    }}>{children}</div>
  );
}