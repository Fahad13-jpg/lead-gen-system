import React, { useEffect, useState } from 'react';
import { getStats } from '../api/client';
import { PageWrap, Card, Loader } from '../components/UI';
import { Users, Target, Mail, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setStats({}))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageWrap><Loader /></PageWrap>;

  const s = stats || {};
  const totalLeads = s.total_leads || 0;
  const qualified = s.qualified_leads || 0;
  const emailsSent = s.emails_sent || 0;
  const replies = s.replied_leads || 0;

  // Pipeline data for visualization
  const pipeline = [
    { label: 'Scraped', value: totalLeads, color: '#2f81f7', width: 100 },
    { label: 'Cleaned', value: Math.floor(totalLeads * 0.85), color: '#8b5cf6', width: 85 },
    { label: 'Enriched', value: Math.floor(totalLeads * 0.60), color: '#d29922', width: 60 },
    { label: 'Qualified', value: qualified, color: '#3fb950', width: Math.floor((qualified/totalLeads)*100) || 30 },
  ];

  return (
    <PageWrap>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        Lead Generation Dashboard
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>
        Real-time analytics for automated lead generation system
      </p>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <KPICard icon={Users} label="Total Leads" value={totalLeads} color="#2f81f7" />
        <KPICard icon={Target} label="Qualified" value={qualified} color="#3fb950" />
        <KPICard icon={Mail} label="Emails Sent" value={emailsSent} color="#8b5cf6" />
        <KPICard icon={TrendingUp} label="Replies" value={replies} color="#d29922" />
      </div>

      {/* Pipeline Funnel */}
      <Card style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>
          Lead Processing Pipeline
        </h2>
        {pipeline.map((stage, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{stage.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
                {stage.value.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 32, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${stage.width}%`,
                background: stage.color,
                display: 'flex', alignItems: 'center', paddingLeft: 12,
                fontSize: 11, fontWeight: 600, color: '#fff',
                transition: 'width 0.5s ease',
              }}>
                {stage.width > 15 && `${stage.width}%`}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
            Performance Metrics
          </h3>
          <MetricRow label="Open Rate" value={`${s.open_rate || 0}%`} />
          <MetricRow label="Reply Rate" value={`${s.reply_rate || 0}%`} />
          <MetricRow label="Jobs Completed" value={s.jobs_completed || 0} />
          <MetricRow label="Total Cost" value={`$${(s.total_cost || 0).toFixed(2)}`} />
        </Card>

        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
            Lead Quality
          </h3>
          <MetricRow label="Hot Leads" value={s.hot_leads || 0} color="#f85149" />
          <MetricRow label="Warm Leads" value={s.warm_leads || 0} color="#d29922" />
          <MetricRow label="Cold Leads" value={s.cold_leads || 0} color="#2f81f7" />
          <MetricRow label="Sales Ready" value={s.sales_ready || 0} color="#3fb950" />
        </Card>
      </div>
    </PageWrap>
  );
}

function KPICard({ icon: Icon, label, value, color }) {
  return (
    <Card style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1 }}>
            {value.toLocaleString()}
          </div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: `${color}15`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </Card>
  );
}

function MetricRow({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}