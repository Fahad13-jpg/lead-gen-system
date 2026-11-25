import React,{useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getManualWhatsApp,prepareManualWhatsApp}from'../api/client';
import'./ManualWhatsApp.css';
const reasons={international_phone_required:'This number needs a country code before WhatsApp can open it.',recipient_stopped_or_needs_review:'This business replied or asked not to be contacted. Review it before messaging.',lead_not_available:'This business is no longer available.'};
function Composer({leadId}){
 const[context,setContext]=useState(null),[message,setMessage]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[prepared,setPrepared]=useState(null),[opened,setOpened]=useState(false),[notice,setNotice]=useState('');
 const alive=useRef(true),lock=useRef(false),edited=useRef(false),pendingWindow=useRef(null),[retry,setRetry]=useState(0);
 useEffect(()=>{alive.current=true;setNotice('');getManualWhatsApp(leadId).then(r=>{if(alive.current){setContext(r);if(!edited.current&&typeof r.draft?.message==='string')setMessage(r.draft.message);}}).catch(()=>{if(alive.current)setNotice('We could not check this number. Try again.');});return()=>{alive.current=false;try{pendingWindow.current?.close();}catch{}};},[leadId,retry]);
 async function prepare(e){
  e.preventDefault();if(lock.current||!context?.available||!ack||!message.trim())return;lock.current=true;setBusy(true);setPrepared(null);setOpened(false);setNotice('');
  let popup;try{popup=window.open('about:blank','_blank');if(popup){popup.opener=null;pendingWindow.current=popup;}}catch{try{popup?.close();}catch{}popup=null;}
  try{
   const source=context.draft;
   const r=await prepareManualWhatsApp({lead_id:Number(leadId),recipient:context.recipient,message,acknowledge_manual_contact:true,...(source?{source_plan_id:source.plan_id,source_content_hash:source.content_hash}:{})});if(!alive.current){try{popup?.close();}catch{}return;}
   const text=message.trim(),expected='https://wa.me/'+context.recipient.slice(1)+'?text='+encodeURIComponent(text);
   if(r.lead_id!==Number(leadId)||r.recipient!==context.recipient||r.message!==text||r.url!==expected||r.manual_only!==true||r.message_sent!==false||r.provider_verified!==false||r.execution_authorized!==false)throw Error();
   setPrepared(r);
   if(popup&&!popup.closed){try{popup.location.replace(r.url);pendingWindow.current=null;setOpened(true);setNotice('WhatsApp opened with your message. Check the chat and press Send there.');}catch{try{popup.close();}catch{}setNotice('Use Continue in WhatsApp to open your prepared message.');}}
   else setNotice('Use Continue in WhatsApp to open your prepared message.');
  }catch(e){try{popup?.close();}catch{}pendingWindow.current=null;if(alive.current)setNotice(e.response?.data?.error==='WHATSAPP_MANUAL_BLOCKED'?'Recipient details, saved approval or contact status changed. Refresh the page before continuing.':'Could not prepare the message. Nothing was sent.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function copy(){try{await navigator.clipboard.writeText(prepared.message);setNotice('Message copied. Nothing has been marked as sent.');}catch{setNotice('Select and copy your message from the text box.');}}
 return <section className="ld-panel manual-whatsapp"><h2>Message on WhatsApp</h2><p className="ld-note">Write a message, then open the chat. You will send it in WhatsApp.</p>
 {notice&&<p role="status">{notice}</p>}{!context&&notice&&<button className="live-secondary" type="button" onClick={()=>setRetry(v=>v+1)}>Try again</button>}{!context&&!notice&&<p className="ld-note">Checking the number…</p>}
 {context&&!context.available&&<p className="ld-note">{reasons[context.reason]||'This recipient cannot be prepared for manual contact.'}</p>}
 {context?.available&&<form onSubmit={prepare}><p>To <strong>{context.recipient}</strong></p>{context.draft&&<p className="ld-note">Message from {context.draft.campaign_name||'your campaign'}. You can edit it.</p>}<label>Your message<textarea rows={5} maxLength={2000} value={message} disabled={busy} onChange={e=>{edited.current=true;setMessage(e.target.value);setAck(false);setPrepared(null);setOpened(false);setNotice('');}} placeholder="Write the message you want to send."/></label>
 <label className="manual-whatsapp-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>{setAck(e.target.checked);setPrepared(null);}}/> I checked this number and have permission to send this message.</label>
 <button className="live-secondary" type="submit" disabled={busy||!ack||!message.trim()}>{busy?'Checking…':'Open WhatsApp'}</button>
 {prepared&&<div className="manual-whatsapp-actions">{!opened&&<a className="live-secondary" href={prepared.url} target="_blank" rel="noopener noreferrer">Continue in WhatsApp</a>}<button className="live-secondary" type="button" onClick={copy}>Copy message</button></div>}</form>}
 <p className="ld-note">Opening the chat does not send the message.</p></section>;
}
export default function ManualWhatsApp({leadId}){const{user,organization}=useAuth();return <Composer key={`${user.subject}:${organization.org_id}:${leadId}`} leadId={leadId}/>;}
