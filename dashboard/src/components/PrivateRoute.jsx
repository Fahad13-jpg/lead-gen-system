import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PrivateRoute({ children }) {
  const { status } = useAuth();
  // Keep the requested URL while Firebase restores the session and checks membership.
  if (status === 'loading') return <div className="ws-access-page"><p role="status">Checking your access…</p></div>;
  if (status === 'ready') return children;
  return <Navigate to={['signed_out', 'not_configured'].includes(status) ? '/login' : '/access'} replace />;
}
