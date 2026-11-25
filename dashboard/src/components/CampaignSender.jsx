import React,{useCallback,useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getSettings,bindSender}from'../api/client';
import useReadList from'../hooks/useReadList';
import{ReadFeedback}from'../pages/ReadListParts';
export default function CampaignSender({campaignId,version,current,refresh}){
 const{user,organization}=useAuth(),key=`lg_bind_${user.subject}_${organization.org_id}_${campaignId}`;
 const fetchPage=useCallback(()=>getSettings(),[]),settings=useReadList(fetchPage);
 const[selected,setSelected]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),pending=useRef(false);
 const[uncertain,setUncertain]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return{version};}});
 useEffect(()=>{if(uncertain&&version>uncertain.version){sessionStorage.removeItem(key);setUncertain(null);setConfirmed(false);setMessage(current===uncertain.connection_id?'The requested sender is now saved.':'Campaign version changed. Review its current sender before another change.');}},[version,current,key,uncertain]);
 const allowed=['owner','admin'].includes(organization.role),choices=(settings.data?.connections||[]).filter(c=>['gmail','smtp'].includes(c.provider));
 const chosen=choices.find(c=>c.connection_id===selected),ready=chosen?.state==='ready'&&chosen.send_capable&&chosen.reply_capable;
 async function submit(e){e.preventDefault();if(pending.current||uncertain||!allowed||!confirmed||!ready)return;pending.current=true;setBusy(true);setMessage('');
  try{sessionStorage.setItem(key,JSON.stringify({version,connection_id:selected}));setUncertain({version,connection_id:selected});}catch{setMessage('Enable session storage before saving a sender selection.');pending.current=false;setBusy(false);return;}
  try{await bindSender({campaign_id:Number(campaignId),connection_id:selected,expected_version:version});sessionStorage.removeItem(key);setUncertain(null);setConfirmed(false);setMessage('Sender saved in a new campaign version. Email sending remains disabled.');refresh();}
  catch(e){if([400,401,403,409].includes(e.response?.status)){sessionStorage.removeItem(key);setUncertain(null);setConfirmed(false);setMessage('Binding rejected. Refresh the campaign and sender status; verify account access and connection readiness.');refresh();settings.refresh();}else setMessage('Result uncertain. Refresh the campaign to reconcile its version and selected sender; this save has not been retried.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <section className="pr-plan"><div className="pr-body"><h2>Email account</h2><p className="pr-note">Choose the account for this campaign. If you change it, review the messages again.</p>{message&&<p className="pr-note" role="status">{message}</p>}{uncertain?<><p className="pr-warning">Checking your account choice.</p><button className="live-secondary" disabled={busy} onClick={refresh}>Refresh campaign</button></>:<><ReadFeedback {...settings}/><form onSubmit={submit}><label className="live-select">Choose an email account<select value={selected} disabled={busy||!allowed||settings.loading} onChange={e=>{setSelected(e.target.value);setConfirmed(false);}}><option value="">Choose an account</option>{choices.map(c=><option key={c.connection_id} value={c.connection_id}>{c.email||c.connection_id} · {c.provider} · {c.state}</option>)}</select></label>{selected&&!ready&&<p className="pr-warning">This account needs a connection check in Settings.</p>}<label className="pr-note" style={{display:'block'}}><input type="checkbox" checked={confirmed} disabled={busy||!allowed} onChange={e=>setConfirmed(e.target.checked)}/> I want to use this account for the campaign.</label><button className="live-secondary" type="submit" disabled={busy||!allowed||!confirmed||!ready}>{busy?'Saving…':'Save email account'}</button></form>{!choices.length&&!settings.loading&&!settings.error&&<p className="pr-note">No email account is ready. Connect one in Settings.</p>}{!allowed&&<p className="pr-note">Only owners and admins can change the campaign sender.</p>}</>}</div></section>;
}
