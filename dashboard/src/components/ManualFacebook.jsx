import React,{useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getManualFacebook,prepareManualFacebook}from'../api/client';
import'./ManualWhatsApp.css';
const reasons={recipient_stopped_or_needs_review:'This business replied or asked not to be contacted. Review it before messaging.',lead_not_available:'This business is no longer available.',facebook_page_required:'No Facebook page is saved for this business.'};
function Composer({leadId}){
 const[context,setContext]=useState(null),[page,setPage]=useState(''),[message,setMessage]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[prepared,setPrepared]=useState(null),[notice,setNotice]=useState('');
 const alive=useRef(true),lock=useRef(false),[retry,setRetry]=useState(0);
 useEffect(()=>{alive.current=true;setNotice('');getManualFacebook(leadId).then(r=>{if(!alive.current)return;if(r.manual_only!==true||r.execution_authorized!==false||!Array.isArray(r.targets))throw Error();setContext(r);setPage(r.draft?.page_url||r.targets[0]?.page_url||'');if(r.draft)setMessage(r.draft.message);}).catch(()=>{if(alive.current)setNotice('We could not check this business. Try again.');});return()=>{alive.current=false;};},[leadId,retry]);
 function reset(){setAck(false);setPrepared(null);setNotice('');}
 async function prepare(e){
  e.preventDefault();if(lock.current||!context?.available||!ack||!message.trim())return;lock.current=true;setBusy(true);setPrepared(null);setNotice('');
  let tab;try{tab=window.open('about:blank','_blank');if(tab)tab.opener=null;}catch{}
  try{
   const r=await prepareManualFacebook({lead_id:Number(leadId),page_url:page,message,acknowledge_manual_contact:true,...(context.draft?{source_plan_id:context.draft.plan_id,source_content_hash:context.draft.content_hash}:{})});
   if(!alive.current)return;
   const target=context.targets.find(t=>t.page_url===page);
   if(!target||r.lead_id!==Number(leadId)||r.page_url!==page||r.url!==target.url||r.message!==message.trim()||r.manual_only!==true||r.message_sent!==false||r.provider_verified!==false||r.execution_authorized!==false)throw Error();
   setPrepared(r);
   let copied=true;try{await navigator.clipboard.writeText(r.message);}catch{copied=false;}
   if(!alive.current)return;
   try{if(tab&&!tab.closed)tab.location.replace(r.url);}catch{}
   setNotice(copied?'Message copied. Paste it in Facebook and send it there.':'Facebook opened. Copy the message below and send it there.');
  }catch(e){try{tab?.close();}catch{}if(alive.current)setNotice(e.response?.data?.error==='FACEBOOK_MANUAL_BLOCKED'?'The business details changed. Try again.':'We could not open Facebook. Nothing was sent.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="ld-panel manual-whatsapp"><h2>Message on Facebook</h2><p className="ld-note">Write a message, then open the business on Facebook. You will send it there.</p>
 {notice&&<p role="status">{notice}</p>}{!context&&notice&&<button className="live-secondary" type="button" onClick={()=>setRetry(v=>v+1)}>Try again</button>}{!context&&!notice&&<p className="ld-note">Checking the business…</p>}
 {context&&!context.available&&<p className="ld-note">{reasons[context.reason]||'This business is unavailable for manual contact.'}</p>}
 {context?.available&&<form onSubmit={prepare}>
 {context.draft?<p className="ld-note">This message was approved in {context.draft.campaign_name}. To change it, prepare a new draft in the campaign.</p>:null}<label>Business page<select className="manual-facebook-select" value={page} disabled={busy||!!context.draft} onChange={e=>{setPage(e.target.value);reset();}}>{context.targets.map(t=><option key={t.page_url} value={t.page_url}>{t.page_url}</option>)}</select></label>
 <label>Your message<textarea rows={5} maxLength={2000} value={message} readOnly={!!context.draft} disabled={busy} onChange={e=>{setMessage(e.target.value);reset();}} placeholder="Write the message you want to send."/></label>
 <label className="manual-whatsapp-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>{setAck(e.target.checked);setPrepared(null);}}/> I checked the page and have permission to message this business.</label>
 <button className="live-secondary" type="submit" disabled={busy||!ack||!page||!message.trim()}>{busy?'Checking…':'Open Facebook'}</button>
 {prepared&&<div className="manual-whatsapp-actions"><a className="live-secondary" href={prepared.url} target="_blank" rel="noopener noreferrer">Continue to Facebook</a><label>Message to copy<textarea readOnly rows={4} value={prepared.message} onFocus={e=>e.target.select()}/></label></div>}
 </form>}
 <p className="ld-note">Opening Facebook does not send the message. Some pages may not have a Message button.</p></section>;
}
export default function ManualFacebook({leadId}){const{user,organization}=useAuth();return <Composer key={`${user.subject}:${organization.org_id}:${leadId}`} leadId={leadId}/>;}
