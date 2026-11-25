import PublicAnalytics from './components/PublicAnalytics';
import PageMetadata from './components/PageMetadata';
import AppErrorBoundary from './components/AppErrorBoundary';
import Privacy from './pages/Privacy';
import Faq from './pages/Faq';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import React,{useEffect,lazy,Suspense} from 'react';
import{brand}from'./brand';
import{ThemeProvider}from'./context/ThemeContext';
import Home from'./pages/Home';
import Terms from'./pages/Terms';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';

import Access from './pages/Access';

const DesignPreview=lazy(()=>import('./pages/DesignPreview'));
const LiveLeads=lazy(()=>import('./pages/LiveLeads'));
const LiveJobs=lazy(()=>import('./pages/LiveJobs'));
const LiveOverview=lazy(()=>import('./pages/LiveOverview'));
const LiveOutreach=lazy(()=>import('./pages/LiveOutreach'));
const LiveSettings=lazy(()=>import('./pages/LiveSettings'));
const LiveCampaigns=lazy(()=>import('./pages/LiveCampaigns'));
const PlanReview=lazy(()=>import('./pages/PlanReview'));
const NewCampaign=lazy(()=>import('./pages/NewCampaign'));
const CampaignPreferences=lazy(()=>import('./pages/CampaignPreferences'));
const NewSearch=lazy(()=>import('./pages/NewSearch'));
const LiveLeadDetail=lazy(()=>import('./pages/LiveLeadDetail'));

export default function App() {
  useEffect(()=>{let icon=document.querySelector('link[rel=icon]');if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon);}icon.href=brand.logo;},[]);
  return (
    <ThemeProvider><AuthProvider>
      <BrowserRouter><PageMetadata/><AppErrorBoundary>
        <Suspense fallback={<div className="ws-access-page"><p role="status">Loading page…</p></div>}><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/login" element={<Login />} />
          <Route path="/access" element={<Access />} />
          <Route
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route path="dashboard" element={<LiveOverview />} />
            <Route path="scraping" element={<LiveJobs />} />
            <Route path="scraping/new" element={<NewSearch />} />
            <Route path="leads" element={<LiveLeads />} />
            <Route path="leads/:leadId" element={<LiveLeadDetail />} />
            <Route path="campaigns" element={<LiveCampaigns />} />
            <Route path="campaigns/new" element={<NewCampaign />} />
            <Route path="campaigns/:campaignId/preferences" element={<CampaignPreferences />} />
            <Route path="campaigns/:campaignId" element={<PlanReview />} />
            <Route path="outreach" element={<LiveOutreach />} />
            <Route path="settings" element={<LiveSettings />} />
          </Route>
        <Route path="*" element={<NotFound/>}/></Routes></Suspense><PublicAnalytics/>
      </AppErrorBoundary></BrowserRouter>
    </AuthProvider></ThemeProvider>
  );
}
