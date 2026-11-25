import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import WorkspaceFrame from './WorkspaceFrame';
import { useAuth } from '../context/AuthContext';
import '../pages/DesignPreview.css';
import '../pages/Workspace.css';
export default function Layout(){
 const{user,organization,chooseOrganization,logout}=useAuth(),{pathname}=useLocation();
 const[error,setError]=useState('');
 const pageTitle=pathname.startsWith('/settings')?'Settings':pathname==='/scraping/new'?'New search':pathname.startsWith('/scraping')?'Find leads':pathname.startsWith('/leads/')?'Lead details':pathname.startsWith('/leads')?'Leads':pathname==='/campaigns/new'?'New campaign':pathname.endsWith('/preferences')?'Campaign settings':pathname.startsWith('/campaigns/')?'Review campaign':pathname.startsWith('/campaigns')?'Campaigns':pathname.startsWith('/outreach')?'Outreach':'Overview';
 return <WorkspaceFrame user={user} organization={organization} onChooseOrganization={chooseOrganization} pageTitle={pageTitle} onLogout={async()=>{try{await logout();}catch{setError('Sign out could not finish. Try again before leaving a shared device.');}}}>{error&&<div className="ws-auth-error" role="alert">{error}</div>}<div key={organization.org_id}><Outlet/></div></WorkspaceFrame>;
}
