import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Search, Activity } from 'lucide-react';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scraping',  icon: Search,           label: 'New Search' },
  { to: '/leads',     icon: Users,            label: 'Leads' },
];

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{
        width: 200, background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Activity size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>LeadGen AI</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>Demo System</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 8px' }}>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 6, marginBottom: 2,
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              background: isActive ? 'rgba(47,129,247,0.1)' : 'transparent',
              fontSize: 12, fontWeight: isActive ? 500 : 400,
              textDecoration: 'none', transition: 'var(--transition)',
            })}>
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}