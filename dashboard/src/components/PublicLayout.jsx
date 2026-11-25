import React from 'react';
import {Link} from 'react-router-dom';
import Brand from './Brand';
import ThemeToggle from './ThemeToggle';
import './PublicPages.css';
export function PublicLinks(){return <nav className="public-links" aria-label="Helpful links"><Link to="/">Home</Link><Link to="/faq">FAQs</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/contact">Contact</Link></nav>;}
export default function PublicLayout({title,intro,children}){return <div className="dp-app public-page"><a className="dp-skip" href="#public-main">Skip to content</a><header className="public-header"><Link to="/"><Brand/></Link><div><ThemeToggle/><Link to="/login">Sign in</Link></div></header><main id="public-main" className="public-document">{title&&<h1>{title}</h1>}{intro&&<p className="public-intro">{intro}</p>}{children}</main><footer className="public-footer"><PublicLinks/></footer></div>;}
