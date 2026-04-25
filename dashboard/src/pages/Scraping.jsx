import React, { useState } from 'react';
import { startScraping } from '../api/client';
import { PageWrap, Card, Input, Btn, Alert } from '../components/UI';
import { Search, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const EXAMPLES = [
  { query: 'software companies', location: 'Lahore, Pakistan' },
  { query: 'restaurants', location: 'Karachi, Pakistan' },
  { query: 'law firms', location: 'New York, USA' },
];

const COUNTS = [10, 25, 50, 100];

export default function Scraping() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ job_name: '', search_query: '', location: '', max_results: 10 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.search_query.trim()) return setError('Search query required');
    if (!form.location.trim()) return setError('Location required');
    
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await startScraping({
        job_name: form.job_name || `${form.search_query} — ${form.location}`,
        search_query: form.search_query,
        location: form.location,
        max_results: form.max_results,
      });
      setResult(data);
      setTimeout(() => navigate('/leads'), 2000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to start scraping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrap>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        New Lead Search
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>
        Scrape business leads from Google Maps
      </p>

      {/* Quick Examples */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>
          Quick Start
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => {
              set('search_query', ex.query);
              set('location', ex.location);
              set('job_name', `${ex.query} — ${ex.location}`);
            }} style={{
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              borderRadius: 20, padding: '5px 12px', fontSize: 11,
              color: 'var(--text2)', cursor: 'pointer',
            }}>
              {ex.query} · {ex.location}
            </button>
          ))}
        </div>
      </div>

      <Card style={{ maxWidth: 700 }}>
        <div style={{ marginBottom: 16 }}>
          <Input 
            label="Job Name (optional)" 
            value={form.job_name}
            onChange={e => set('job_name', e.target.value)}
            placeholder="Auto-generated if empty"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <Input 
            label="Search Query *" 
            value={form.search_query}
            onChange={e => set('search_query', e.target.value)}
            placeholder="e.g. coffee shops"
          />
          <Input 
            label="Location *" 
            value={form.location}
            onChange={e => set('location', e.target.value)}
            placeholder="e.g. Lahore, Pakistan"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
            Number of Results
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {COUNTS.map(n => (
              <button key={n} onClick={() => set('max_results', n)} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${form.max_results === n ? 'var(--accent)' : 'var(--border2)'}`,
                background: form.max_results === n ? 'rgba(47,129,247,0.15)' : 'var(--bg3)',
                color: form.max_results === n ? 'var(--accent)' : 'var(--text3)',
              }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Estimate */}
        <div style={{
          background: 'var(--bg3)', borderRadius: 6, padding: '10px 14px',
          marginBottom: 16, border: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text3)',
        }}>
          <strong style={{ color: 'var(--text2)' }}>Estimate:</strong> ~{form.max_results} leads • 
          ${((form.max_results / 100) * 0.01).toFixed(4)} cost • 1-3 min
        </div>

        {error && <Alert type="error" style={{ marginBottom: 12 }}>{error}</Alert>}
        {result && <Alert type="success" style={{ marginBottom: 12 }}>
          Job started! Redirecting to leads...
        </Alert>}

        <Btn loading={loading} onClick={submit} style={{ width: '100%', justifyContent: 'center' }}>
          <Play size={14} fill="#fff" /> Start Scraping
        </Btn>
      </Card>
    </PageWrap>
  );
}