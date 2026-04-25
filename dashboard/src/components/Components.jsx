import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function StatCard({ label, value, sub, icon: Icon, color = '#4f8ef7', trend }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: color, borderRadius: '12px 12px 0 0'
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)',
            letterSpacing: '-0.03em', lineHeight: 1 }}>
            {value ?? '—'}
          </div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{sub}</div>}
        </div>
        {Icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${color}18`, border: `1px solid ${color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Icon size={18} color={color} />
          </div>
        )}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 24, paddingBottom: 16,
      borderBottom: '1px solid var(--border)'
    }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>
          {title}
        </h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', ...style
    }}>
      {children}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', size = 'md',
  loading = false, disabled = false, style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: 'var(--font)', fontWeight: 600, borderRadius: 8,
    border: 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'var(--transition)', fontSize: size === 'sm' ? 12 : 13,
    padding: size === 'sm' ? '6px 12px' : '9px 16px',
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: 'var(--accent)', color: '#fff' },
    secondary: { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)' },
    danger: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' },
    success: { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' },
  };
  return (
    <button onClick={!disabled && !loading ? onClick : undefined}
      style={{ ...base, ...variants[variant], ...style }}>
      {loading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : children}
    </button>
  );
}

export function Loader({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 48, gap: 12 }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
      <span style={{ color: 'var(--text3)', fontSize: 13 }}>{text}</span>
    </div>
  );
}

export function PriorityBadge({ priority }) {
  const map = {
    hot: 'badge-hot', warm: 'badge-warm', cold: 'badge-cold'
  };
  return <span className={`badge ${map[priority] || 'badge-cold'}`}>{priority || 'cold'}</span>;
}

export function StatusBadge({ status }) {
  const map = {
    email_sent: 'badge-sent', qualified: 'badge-qualified',
    pending: 'badge-pending', sent: 'badge-sent',
  };
  return <span className={`badge ${map[status] || 'badge-pending'}`}>{status || 'pending'}</span>;
}

export function Input({ label, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{label}</label>}
      <input style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
        fontFamily: 'var(--font)', fontSize: 13, outline: 'none',
        transition: 'var(--transition)',
      }} {...props} />
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{label}</label>}
      <select style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
        fontFamily: 'var(--font)', fontSize: 13, outline: 'none',
      }} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Table({ headers, rows, emptyText = 'No data found' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '10px 14px', textAlign: 'left',
                fontSize: 11, fontWeight: 600, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length}>
                <div className="empty-state">{emptyText}</div>
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '11px 14px', fontSize: 13,
                  color: 'var(--text)', verticalAlign: 'middle'
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}