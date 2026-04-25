import React, { useEffect, useState } from 'react';
import { getLeads } from '../api/client';
import { PageWrap, Card, Loader, Badge } from '../components/UI';
import { Mail, Phone, MapPin, Star } from 'lucide-react';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeads({ limit: 100 })
      .then(d => setLeads(d.leads || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageWrap><Loader /></PageWrap>;

  return (
    <PageWrap>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        Leads Database
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>
        {leads.length} scraped and enriched leads
      </p>

      <Card padding={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Company', 'Contact', 'Location', 'Score', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 11,
                  fontWeight: 600, color: 'var(--text3)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                No leads yet. Start a scraping job to see leads here.
              </td></tr>
            ) : leads.map(lead => (
              <tr key={lead.lead_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {lead.company_name}
                  </div>
                  {lead.category && (
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{lead.category}</div>
                  )}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {lead.email && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 2 }}>
                      <Mail size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {lead.email}
                    </div>
                  )}
                  {lead.phone && (
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      <Phone size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {lead.phone}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text3)' }}>
                  {[lead.city, lead.country].filter(Boolean).join(', ') || '—'}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
                    color: (lead.lead_score || 0) >= 70 ? 'var(--green)' : 
                           (lead.lead_score || 0) >= 50 ? 'var(--yellow)' : 'var(--accent)',
                  }}>
                    {lead.lead_score || '—'}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <Badge type={lead.priority || 'cold'}>
                    {lead.outreach_status || 'pending'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageWrap>
  );
}