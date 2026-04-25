import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiLogin, apiRegister } from '../api/client';
import { Btn, Input, Alert } from '../components/UI';
import { Activity } from 'lucide-react';

export default function Login() {
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { login } = useAuth();
  const navigate  = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError('Email and password are required.');
    setLoading(true); setError('');
    try {
      const fn   = mode === 'login' ? apiLogin : apiRegister;
      const data = await fn(email, password);
      if (data.success && data.user) {
        login(data.user);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Authentication failed.');
      }
    } catch (e) {
      // For demo/FYP - allow local login if backend not available
      if (email && password.length >= 6) {
        login({ id: 1, email });
        navigate('/dashboard');
      } else {
        setError('Password must be at least 6 characters.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Activity size={22} color="#fff" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>LeadGen AI</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 28,
        }}>
          {/* Toggle */}
          <div style={{
            display: 'flex', background: 'var(--bg3)',
            borderRadius: 6, padding: 3, marginBottom: 24,
          }}>
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 5, border: 'none',
                  background: mode === m ? 'var(--bg2)' : 'transparent',
                  color: mode === m ? 'var(--text)' : 'var(--text3)',
                  fontSize: 13, fontWeight: mode === m ? 500 : 400,
                  cursor: 'pointer', transition: 'var(--transition)',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Email address" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            <Input label="Password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" />

            {error && <Alert type="error">{error}</Alert>}

            <Btn type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Btn>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text3)' }}>
          FYP — Lead Generation System
        </div>
      </div>
    </div>
  );
}