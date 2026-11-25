import React from 'react';
import {Link} from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
export default function NotFound(){return <PublicLayout><div className="public-error"><p className="public-error-code">404</p><h1>We couldn’t find that page.</h1><p>The address may have changed or the page may no longer exist. Check the link, or choose where to go next.</p><div className="public-error-actions"><Link className="ns-primary" to="/">Back to home</Link><Link to="/dashboard">Open workspace</Link><Link to="/contact">Get help</Link></div></div></PublicLayout>;}
