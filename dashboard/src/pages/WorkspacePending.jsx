import React from 'react';
import { Link, useLocation } from 'react-router-dom';
export default function WorkspacePending() {
  const { pathname } = useLocation();
  const title = { '/dashboard': 'Overview', '/scraping': 'Find leads', '/leads': 'Leads', '/campaigns': 'Campaigns', '/outreach': 'Outreach', '/settings': 'Settings' }[pathname] || 'Workspace';
  return <section className="ws-gateway-pending"><h1>{title}</h1><p>Your organization access is verified. This screen is being connected to the existing backend. Live statistics, search and outreach actions will become available after their data contracts are checked.</p><Link className="dp-text-button" to="/design-preview">View the sample dashboard</Link></section>;
}
