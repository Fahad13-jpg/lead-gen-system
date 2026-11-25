import{useCallback,useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getCallingAccountReceipt}from'../api/client';
const pending=k=>{try{return sessionStorage.getItem(k);}catch{return'blocked';}};
export default function useCallingChange(onSaved){
 const{user,organization}=useAuth(),key=`lg_calling_change_${user?.subject}_${organization.org_id}`;
 const[waiting,setWaiting]=useState(()=>pending(key)),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),epoch=useRef(0),saved=useRef(onSaved);saved.current=onSaved;
 useEffect(()=>{setWaiting(pending(key));setMessage('');const e=++epoch.current;return()=>{if(epoch.current===e)epoch.current++;};},[key]);
 const clear=useCallback(id=>{if(pending(key)===id)sessionStorage.removeItem(key);setWaiting(pending(key));},[key]);
 async function reconcile(){if(lock.current)return;const id=pending(key);if(!id)return;const current=epoch.current;lock.current=true;setBusy(true);
  try{const r=await getCallingAccountReceipt(id);if(current!==epoch.current)return;if(r.recorded===true&&r.result?.saved===true&&r.execution_authorized===false){clear(id);setMessage('Saved change confirmed. Calling remains paused.');await saved.current?.();}else{setWaiting(id);setMessage('No saved receipt yet. The result is still uncertain; do not repeat the change.');}}
  catch{if(current===epoch.current)setMessage('Could not confirm the change. Refresh its result again later.');}finally{lock.current=false;if(current===epoch.current)setBusy(false);}
 }
 async function run(send,payload){if(lock.current)return;const old=pending(key);if(old){setWaiting(old);setMessage('Confirm the previous change before continuing.');return;}const current=epoch.current;lock.current=true;setBusy(true);let id;
  try{id=window.crypto.randomUUID();sessionStorage.setItem(key,id);setWaiting(id);setMessage('Saving calling setup…');const r=await send({...payload,request_id:id});if(current!==epoch.current)return;if(r.saved!==true||r.execution_authorized!==false||r.calling_enabled!==false)throw Error();clear(id);setMessage('Saved. Calling is paused; review new campaign versions before a future release.');await saved.current?.();}
  catch(e){if(current!==epoch.current)return;if([400,401,403,404,409].includes(e.response?.status)){clear(id);const code=e.response?.data?.error;setMessage(code==='CALLING_ACTIVE_OR_UNCERTAIN'?'A call is active or awaiting reconciliation. Resolve it before changing this account or campaign.':code==='CALLING_ACCOUNT_NOT_VERIFIED'?'Retell could not verify this published agent/version or number. Check the account details.':code==='CALLING_ACCOUNT_ALREADY_LINKED'?'This key, agent or number is already assigned to another workspace.':'Change rejected. Refresh current account and campaign settings before trying again.');}else setMessage(id?'Save result uncertain. Refresh its saved receipt before another change.':'Enable session storage before saving calling setup.');}
  finally{lock.current=false;if(current===epoch.current)setBusy(false);}
 }
 return{busy,waiting,message,run,reconcile};
}
