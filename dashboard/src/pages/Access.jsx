import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import ThemeToggle from'../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { resendVerification, authErrorMessage } from '../auth/firebase';
import './DesignPreview.css';
import './Workspace.css';

export default function Access() {
  const { status, user, chooseOrganization, logout, refreshIdentity, verificationEmail } = useAuth();
  const location=useLocation();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  if (status === 'ready') return <Navigate to="/dashboard" replace />;
  if (['signed_out', 'not_configured'].includes(status)) return <Navigate to="/login" replace />;
  async function run(fn, message) {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await fn(); if (message) setNotice(message); } catch (e) { setNotice(authErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return <div className="dp-app ws-access-page"><ThemeToggle/><main className="ws-auth-card"><ShieldCheck size={30} color="var(--lm-secondary)" />
    <h1>{status === 'loading' ? 'Checking your access…' : status === 'choose_org' ? 'Choose your organization' : status === 'verify_email' ? 'Verify your email' : status === 'no_membership' ? 'Create your workspace' : 'Unable to confirm access'}</h1>
    <p>{status === 'verify_email' ? `Open the verification link${verificationEmail?' sent to '+verificationEmail:' in your email'}, then choose “I verified my email” below. Check your spam folder too.` : status === 'choose_org' ? 'Select a workspace you have permission to use.' : status === 'no_membership' ? 'Start a separate workspace for your business. If you are joining an existing team, ask its administrator for access instead.' : status === 'access_unavailable' ? 'The access service could not confirm your membership. No organization data has been loaded.' : 'Please wait while your identity and membership are checked.'}</p>
    {status === 'no_membership' && <CreateWorkspace key={user.subject} />}
    {status === 'choose_org' && user.organizations.map(org => <button className="ws-org-option" key={org.org_id} onClick={() => chooseOrganization(org.org_id)}><strong>{org.name}</strong><span>{org.role}</span></button>)}
    {status==='verify_email'&&location.state?.verificationNotice&&<p role="status">{location.state.verificationNotice}</p>}
    {status === 'verify_email' && <><button className="dp-primary" disabled={busy} onClick={() => run(refreshIdentity)}>I verified my email</button><button className="dp-text-button" disabled={busy} onClick={() => run(resendVerification, 'Verification email requested. Check your inbox and spam folder.')}>Resend verification email</button></>}
    {status === 'access_unavailable' && <button className="dp-primary" disabled={busy} onClick={() => run(refreshIdentity)}>Check again</button>}
    {notice && <p role="status">{notice}</p>}
    {status !== 'loading' && <button className="dp-text-button" disabled={busy} onClick={() => run(logout)}>Sign out</button>}
  </main></div>;
}

function CreateWorkspace(){
 const{user,createOrganization,checkOrganizationCreation,refreshIdentity}=useAuth(),key=`lg_workspace_create_${user.subject}`;
 const[name,setName]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return{unreadable:true};}});
 const alive=useRef(true),lock=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function create(e){
  e.preventDefault();if(lock.current||pending||!ack||name.trim().length<2)return;
  let marker;try{marker={name,request_id:window.crypto.randomUUID(),acknowledge_owner:true};sessionStorage.setItem(key,JSON.stringify(marker));}catch{setNotice('Enable browser session storage and use a secure connection before creating a workspace.');return;}
  lock.current=true;setBusy(true);setPending(marker);setNotice('');
  try{await createOrganization(marker);sessionStorage.removeItem(key);if(alive.current)setPending(null);}
  catch(e){if(!alive.current)return;if([400,401,403,409].includes(e.response?.status)){sessionStorage.removeItem(key);setPending(null);setNotice(e.response?.data?.error==='WORKSPACE_MEMBERSHIP_EXISTS'?'This account already has a workspace membership. Check your access or contact its administrator.':e.response?.data?.error==='WORKSPACE_ACCESS_REVIEW_REQUIRED'?'Your earlier workspace access needs administrator review. A new workspace has not been created.':'Workspace not created. Check the name and your account access.');}else setNotice('Creation result uncertain. Check the saved result before trying again; this request has not been repeated.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function check(){if(lock.current||!pending||pending.unreadable)return;lock.current=true;setBusy(true);try{const r=await checkOrganizationCreation({request_id:pending.request_id});if(r.saved===true||r.saved===false){sessionStorage.removeItem(key);if(alive.current){setPending(null);setNotice(r.saved?'Workspace confirmed.':'No workspace was created by that request. You can submit the form again.');}}}catch{if(alive.current)setNotice('Could not reconcile creation. Check workspace access or contact an administrator.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <section aria-label="New workspace">{notice&&<p className="ws-auth-notice" role="status">{notice}</p>}{pending?<><p className="ws-auth-notice">An earlier workspace request needs confirmation.</p><button className="dp-primary" disabled={busy||pending.unreadable} onClick={check}>Check saved workspace</button></>:<form onSubmit={create}><label className="ws-field">Workspace name<input required minLength={2} maxLength={100} value={name} disabled={busy} autoComplete="organization" onChange={e=>{setName(e.target.value);setAck(false);}} placeholder="Your business or team name"/></label><label className="ws-owner-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/> I am creating and managing a new workspace, rather than requesting access to an existing organization.</label><button className="dp-primary ws-auth-submit" type="submit" disabled={busy||!ack||name.trim().length<2}>{busy?'Creating…':'Create workspace'}</button><p className="ws-auth-notice">No provider credits, AI allowance or sending is enabled by creation. Provider connections and processing limits are configured separately.</p></form>}<button className="dp-text-button" disabled={busy} onClick={refreshIdentity}>Check workspace access</button></section>;
}
