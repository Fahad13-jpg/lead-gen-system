import React,{useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{connectApify,prepareApify,reconcileApify}from'../api/client';
import './ConnectApify.css';
const messages={APIFY_CONNECTION_UNAVAILABLE:'Secure connection setup is unavailable. Ask your administrator to check the existing workflow configuration.',APIFY_KEY_NOT_VERIFIED:'The key could not be verified. Check the key and provider access before trying again.',PROVIDER_ACCOUNT_ALREADY_LINKED:'This Apify account is already linked elsewhere. Ask your administrator to review the account mapping.',ACCOUNT_HAS_UNSETTLED_JOBS:'This account has unsettled searches. Reconcile them before replacing its key.',ORG_NOT_READY:'This organization is not ready for account connections.',APIFY_RECOVERY_INVALID:'The recovery reference does not match this account or key. No replacement was submitted.',APIFY_RECOVERY_EXPIRED:'The recovery reference expired. Ask your administrator to reconcile the saved account.'};
function stored(key){try{const raw=sessionStorage.getItem(key);if(!raw)return null;try{const p=JSON.parse(raw);if(typeof p.recovery_token==='string'&&p.recovery_token.length<=2048)return{recovery_token:p.recovery_token};}catch{}return{legacy:true};}catch{return{storage_unavailable:true};}}
export default function ConnectApify(props){const auth=useAuth();return <Connection key={`${auth.user.subject}_${auth.organization.org_id}`} auth={auth} {...props}/>;}
function Connection({auth,refresh}){
 const{user,organization}=auth,storageKey=`lg_apify_change_${user.subject}_${organization.org_id}`;
 const[key,setKey]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tone,setTone]=useState('error');
 const[receipt,setReceipt]=useState(()=>stored(storageKey)),pending=useRef(false),mounted=useRef(true);
 const allowed=['owner','admin'].includes(organization.role);
 function notify(text,nextTone='error'){setMessage(text);setTone(nextTone);}
 function clear(){sessionStorage.removeItem(storageKey);setReceipt(null);setConfirmed(false);}
 async function resolve(token){
  const r=await reconcileApify(token);if(!mounted.current)return;
  if(r.configuration_matches===true){clear();notify(r.enabled?'Your submitted key is saved. Its latest live provider check was not confirmed; the connection request was not repeated.':'Your submitted key is saved, but the account remains disabled. The connection request was not repeated.','warning');refresh();}
  else notify('The saved key does not yet confirm this request. No connection was retried. Wait and check again, or ask your administrator to reconcile it.','warning');
 }
 async function recover(token){
  if(pending.current||!allowed)return;pending.current=true;setBusy(true);
  try{await resolve(token);}catch(e){if(mounted.current)notify(messages[e.response?.data?.error]||'Saved connection could not be checked. Keep this reference and check again; no connection request was repeated.');}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 const initial=useRef(receipt),initialRecover=useRef(recover);
 useEffect(()=>{mounted.current=true;if(initial.current?.recovery_token)initialRecover.current(initial.current.recovery_token);return()=>{mounted.current=false;};},[]);
 function replace(){
  if(pending.current||busy)return;
  try{clear();}catch{notify('Enable session storage before connecting an account.');return;}
  setKey('');notify('Enter the replacement account key and verify it. The previous request has not been repeated.','info');
 }
 async function submit(e){
  e.preventDefault();if(pending.current||receipt||!allowed||!confirmed)return;
  pending.current=true;setBusy(true);notify('');const value=key.trim();setKey('');let token;
  try{
   let p;try{p=await prepareApify(value);}catch{if(mounted.current)notify('Could not prepare recovery for this connection. No connection request was submitted.');return;}
   if(!mounted.current)return;
   if(typeof p.recovery_token!=='string'||p.recovery_token.length>2048){notify('Could not prepare recovery. No connection request was submitted.');return;}
   token=p.recovery_token;
   try{sessionStorage.setItem(storageKey,JSON.stringify({recovery_token:token}));setReceipt({recovery_token:token});}catch{notify('Enable session storage before connecting an account. No connection request was submitted.');return;}
   try{await connectApify(value,token);if(!mounted.current)return;clear();notify('Organization Apify account connected. Future searches can select your own account.','success');refresh();}
   catch(error){
    if(!mounted.current)return;const code=error.response?.data?.error;
    if(code==='APIFY_CONNECTION_UNAVAILABLE'||[400,401,403,409].includes(error.response?.status)){clear();notify(messages[code]||'Connection rejected. Check your access and key format.');}
    else{try{await resolve(token);}catch{if(mounted.current)notify('Connection result uncertain. Check the saved connection below. No connection request was repeated.','warning');}}
   }
  }finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 return <div className="st-actions"><h3>Connect your Apify account</h3><p className="st-note">Apify bills your account directly for future BYOK searches. Connecting does not add provider credits or change your organization spending limits. No scraper is started by this action.</p>{message&&<p role={tone==='error'?'alert':'status'} className="apify-feedback" data-tone={tone}>{message}</p>}{!allowed?<p className="st-note">An owner or admin connects the organization account.</p>:receipt?<><p className="st-note">The previous connection change is awaiting confirmation. Only a recovery reference is stored in this browser; the API key is not stored.</p>{receipt.recovery_token?<button className="live-secondary" disabled={busy} onClick={()=>recover(receipt.recovery_token)}>{busy?'Checking saved connection...':'Check saved connection'}</button>:<><button className="live-secondary" disabled={busy} onClick={refresh}>Refresh saved configuration</button><button className="live-secondary" disabled={busy} onClick={replace}>Enter a replacement key</button></>}</>:<form onSubmit={submit}><label className="live-select">Apify API key<input aria-label="Apify API key" type="password" autoComplete="off" spellCheck={false} maxLength={300} required pattern="apify_api_[A-Za-z0-9]+" value={key} onChange={e=>{setKey(e.target.value);setConfirmed(false);}} disabled={busy}/></label><label className="st-note" style={{display:'block',marginBottom:14}}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> Connect or replace this organization key. I am authorized to use this account and understand its provider billing.</label><button className="live-secondary" type="submit" disabled={busy||!confirmed||!key.trim()}>{busy?'Verifying...':'Verify and connect Apify'}</button></form>}</div>;
}
