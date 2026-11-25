import React,{useCallback,useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getGmailSetup,beginGmail,finishGmail,reconcileGmail}from'../api/client';
import useReadList from'../hooks/useReadList';
import GmailSetupView from'./GmailSetupView';
function saved(key){try{return{value:sessionStorage.getItem(key)||'',blocked:false};}catch{return{value:'',blocked:true};}}
function receiptMatches(r,org){return r?.org_id===org&&/^gmail_[a-f0-9]{32}$/.test(r.connection_id||'')&&['ready','pending_check'].includes(r.state)&&r.execution_authorized===false;}
export default function ConnectGmail({refresh}){
 const{user,organization}=useAuth();
 return <GmailEnrollment key={`${user.subject}:${organization.org_id}`} user={user} organization={organization} refresh={refresh}/>;
}
function GmailEnrollment({user,organization,refresh}){
 const key=`lg_gmail_signup_${user.subject}_${organization.org_id}`;
 const[initial]=useState(()=>saved(key)),alive=useRef(true),pending=useRef(false);
 const fetchSetup=useCallback(()=>getGmailSetup(),[]),setup=useReadList(fetchSetup);
 const[sharing,setSharing]=useState('private'),[busy,setBusy]=useState(false),[message,setMessage]=useState(null),[connected,setConnected]=useState(null);
 const[state,setState]=useState(initial.value),[storageBlocked,setStorageBlocked]=useState(initial.blocked),uncertain=state.startsWith('uncertain:');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function remember(next){try{if(next)sessionStorage.setItem(key,next);else sessionStorage.removeItem(key);setState(next);return true;}catch{setStorageBlocked(true);if(next)setState(next);return false;}}
 function connectedMessage(r){setConnected(r);remember('');setMessage({title:'Gmail connected',tone:'success',text:r.state==='ready'?'Identity and granted email permissions checked. Sending still requires campaign approval; delivery has not been tested.':'The initial account check is pending. Sending remains blocked until that check passes.'});refresh();}
 async function start(){
  if(pending.current||state||storageBlocked)return;pending.current=true;setBusy(true);setMessage(null);
  try{
   try{sessionStorage.setItem(key,'');sessionStorage.removeItem(key);}catch{setStorageBlocked(true);return;}
   const r=await beginGmail({sharing});if(!alive.current)return;
   const url=new URL(r.authorization_url),nonce=url.searchParams.get('state');if(url.origin!=='https://accounts.google.com'||!/^[A-Za-z0-9_-]{43}$/.test(nonce||''))throw Error();
   if(!remember(nonce))return;window.location.assign(url.href);
  }catch(e){if(alive.current){setMessage({title:'Google could not open',text:e.response?.data?.error==='GMAIL_SIGNUP_BUSY'?'Another Gmail setup needs to finish first. Check your saved connections before trying again.':'Try again from this workspace. If it still fails, ask your administrator to check the Gmail setup.'});try{sessionStorage.getItem(key);}catch{setStorageBlocked(true);}}}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 async function recover(){
  if(pending.current||!state||storageBlocked)return;pending.current=true;setBusy(true);setMessage(null);
  try{const r=await reconcileGmail(state.replace(/^uncertain:/,''));if(!alive.current)return;
   if(r.confirmed===true&&receiptMatches(r,organization.org_id))connectedMessage(r);
   else if(r.safe_to_restart===true&&r.confirmed!==true){if(remember(''))setMessage({title:'You can start again',text:'The previous authorization is closed. Choose Connect Gmail with Google to start a new one.'});}
   else{remember('uncertain:'+state.replace(/^uncertain:/,''));refresh();setMessage({title:'Connection still needs checking',tone:'warning',text:r.recovery?.reason==='gmail_link_outcome_unconfirmed'?'The saved result needs an administrator to review it. Do not authorize this account again yet.':'The saved result is not confirmed yet. Check the connection status again before starting a new authorization.'});}
  }catch{if(alive.current)setMessage({title:'Status is unavailable',tone:'warning',text:'Try Check connection status again. Keep this request in place; no authorization has been repeated.'});}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 async function complete(){
  if(pending.current||!state||uncertain||storageBlocked)return;pending.current=true;setBusy(true);setMessage(null);
  try{const r=await finishGmail(state);if(!alive.current)return;if(!receiptMatches(r,organization.org_id))throw Error();connectedMessage(r);}
  catch(e){if(!alive.current)return;const code=e.response?.data?.error;
   if(code==='GMAIL_CALLBACK_NOT_READY')setMessage({title:'Authorization is not ready',text:'Finish the Google authorization, then try again. If it has expired, check the saved result before starting again.'});
   else if(code==='GMAIL_CONSENT_DENIED'){remember('');setMessage({title:'Google access was not granted',text:'You can try again when you are ready. No sending was enabled.'});}
   else{remember('uncertain:'+state.replace(/^uncertain:/,''));setMessage({title:'Check the saved connection',tone:'warning',text:[401,403].includes(e.response?.status)?'Your access could not be confirmed. Sign in again, then check this connection status.':'The completion result was not confirmed. Check its saved status before authorizing again. No token exchange has been retried.'});}
  }finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 return <GmailSetupView {...{message,storageBlocked,setup,connected,uncertain,state,busy,organization,sharing,setSharing,start,recover,complete,setConnected,setMessage}}/>;
}
