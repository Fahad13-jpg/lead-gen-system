import React,{useCallback,useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getLinkedIn,getLinkedInReceipt,reportLinkedInTask,prepareLinkedInTask}from'../api/client';
const words=s=>String(s||'').replace(/_/g,' ');
const reports={request_sent:'Connection request sent',already_connected:'Already connected',accepted:'Connection accepted',message_sent:'Message sent',reply:'Reply received',not_interested:'Not interested',opt_out:'Opted out',wrong_person:'Wrong person',snooze:'Remind me later',skip:'Skip this task',assign:'Assign to me'};
function storage(key){try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return{unreadable:true};}}
export default function LinkedInTasks(){
 const{user,organization}=useAuth(),key=`lg_linkedin_${user.subject}_${organization.org_id}`;
 const[data,setData]=useState(null),[pending,setPending]=useState(()=>storage(key)),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(null),[profileLink,setProfileLink]=useState(null);const lock=useRef(false),epoch=useRef(0),popup=useRef(null);
 function closePopup(){try{popup.current?.close();}catch{}popup.current=null;}
 const refresh=useCallback(async()=>{const current=++epoch.current;try{const r=await getLinkedIn();if(current!==epoch.current)return;if(r.manual_only!==true||r.execution_authorized!==false||!Array.isArray(r.items))throw Error();setData(r);const p=storage(key);if(p&&!p.unreadable){const receipt=await getLinkedInReceipt({...p,kind:'event'});if(current!==epoch.current)return;if(receipt.recorded===true&&receipt.activity_id===p.activity_id&&receipt.action===p.action){sessionStorage.removeItem(key);setPending(null);setMessage('Your earlier action is saved. No request was repeated.');}else setMessage('The earlier action is not confirmed. Ask an administrator to reconcile it before another report.');}}catch{if(current===epoch.current)setMessage('Could not refresh LinkedIn tasks. Check your access and try refreshing.');}},[key]);
 useEffect(()=>{setData(null);setPending(storage(key));setMessage('');setCopied(null);setProfileLink(null);refresh();return()=>{epoch.current++;closePopup();};},[key,refresh]);
 async function submit(task,action,note,snooze,openLinkedIn=false){
  if(lock.current||pending)return;
  if(openLinkedIn&&(!['copy_note','copy_message'].includes(action)||!/^https:\/\/www[.]linkedin[.]com\/in\/[a-z0-9_-]+\/$/.test(task.profile_url||''))){setMessage('A checked LinkedIn person profile is required. Refresh this task.');return;}
  let event_id;try{event_id=window.crypto.randomUUID();}catch{setMessage('This browser needs a secure connection to record task actions.');return;}
  const receipt={activity_id:task.activity_id,content_hash:task.content_hash,event_id,action},current=epoch.current;
  lock.current=true;setBusy(true);setCopied(null);setProfileLink(null);setMessage('');
  try{sessionStorage.setItem(key,JSON.stringify(receipt));setPending(receipt);}catch{setMessage('Enable session storage before reporting a task.');lock.current=false;setBusy(false);return;}
  // Keep this document focused for clipboard permission; open only after copying.
  try{
   const r=await reportLinkedInTask({...receipt,confirmed_by_customer:true,...(note?{note}:{}),...(action==='snooze'?{snooze_until:new Date(snooze).toISOString()}:{})});
   if(current!==epoch.current){closePopup();return;}
   if(r.saved!==true||r.activity_id!==task.activity_id||r.event_id!==event_id||r.action!==action||r.provider_verified!==false||r.execution_authorized!==false)throw Error();
   sessionStorage.removeItem(key);setPending(null);
   if(action.startsWith('copy_')){
    if(typeof r.copy_text==='string'){
     setCopied(r.copy_text);
     try{
      await navigator.clipboard.writeText(r.copy_text);
      if(current!==epoch.current){closePopup();return;}
      if(openLinkedIn){
       try{
        const tab=window.open('about:blank','_blank');popup.current=tab;
        if(tab&&!tab.closed){tab.opener=null;tab.location.href=task.profile_url;popup.current=null;}
        else{popup.current=null;setProfileLink(task.profile_url);}
       }catch{closePopup();setProfileLink(task.profile_url);}
       setMessage('Copied. Paste the text and send it yourself in LinkedIn. Nothing has been marked as sent.');
      }else setMessage('Copied. Nothing has been marked as sent.');
     }catch{closePopup();if(current!==epoch.current)return;if(openLinkedIn)setProfileLink(task.profile_url);setMessage('Select and copy the approved text below, then open LinkedIn. Nothing has been marked as sent.');}
    }else{closePopup();setMessage('Action recorded without copy text. Refresh the task before another copy.');}
   }else setMessage('Your report is saved as customer reported, not independently verified.');
   await refresh();
  }catch(e){
   closePopup();if(current!==epoch.current)return;
   if([400,401,403,404,409].includes(e.response?.status)){sessionStorage.removeItem(key);setPending(null);setMessage('Action not saved: '+(words(e.response?.data?.reason)||'refresh the current task and approval')+'.');}
   else setMessage('Result uncertain. Refresh saved state before another action; this request has not been retried.');
  }finally{closePopup();lock.current=false;setBusy(false);}
 }
 return <section className="pr-plan"><div className="pr-body"><h2>LinkedIn tasks</h2><p className="pr-note">Open a checked person profile, copy approved text, then report what you did in LinkedIn. These actions never send through LinkedIn automatically.</p><button className="live-secondary" disabled={busy} onClick={refresh}>Refresh LinkedIn tasks</button>{message&&<p role="status">{message}</p>}{profileLink&&<p><a href={profileLink} target="_blank" rel="noopener noreferrer">Continue to LinkedIn</a></p>}{pending&&<p className="pr-warning">An action needs reconciliation. Refresh saved state before another report.</p>}{copied!==null&&<label className="live-select">Approved text to copy<textarea readOnly value={copied} rows={4} onFocus={e=>e.target.select()}/></label>}{data&&!data.items.length&&<p className="pr-note">No visible manual tasks. Add a task from a current approved LinkedIn plan in campaign review. LinkedIn plan generation must be configured before tasks can be prepared.</p>}{data?.items.map(t=><Task key={`${t.activity_id}:${t.state}`} task={t} disabled={busy||!!pending} submit={submit}/>)}{data&&<p className="pr-note">Up to {data.limit} tasks are read per refresh. Due reminders follow campaign hours and snoozes. Sent, accepted and reply reports are customer reported; missing tasks or events do not prove delivery.</p>}</div></section>;
}
function Task({task:t,disabled,submit}){
 const[action,setAction]=useState(''),[ack,setAck]=useState(false),[note,setNote]=useState(''),[snooze,setSnooze]=useState('');
 const available=[...(t.state==='ready'?['request_sent','already_connected']:t.state==='request_sent'?['accepted']:t.state==='accepted'?['message_sent']:[]),'reply','not_interested','opt_out','wrong_person',...(['ready','request_sent','accepted'].includes(t.state)?['snooze','skip',...(t.can_manage?['assign']:[])]:[])];
 const owned=!t.assigned_to_me&&t.can_manage;
 return <article className="ot-activity" style={{marginTop:20}}><header><div><h3>Task #{t.activity_id} · Plan #{t.plan_id} · Step {t.step}</h3><p>{words(t.state)} · {t.manual_action_due?'Action due':'Awaiting response, due time or review'}{t.assigned_to_me?' · Assigned to you':owned?' · Unassigned or another member':''}</p></div>{t.profile_url&&!t.gate_reason&&<a href={t.profile_url} target="_blank" rel="noopener noreferrer">Open checked profile</a>}</header>{t.gate_reason&&<p className="pr-warning">Review needed: {words(t.gate_reason)}. Stop reports remain available.</p>}{t.snooze_until&&<p className="pr-note">Reminder: {new Date(t.snooze_until).toLocaleString()}</p>}<div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{['ready','request_sent'].includes(t.state)&&<button className="live-secondary" disabled={disabled||!!t.gate_reason||!t.profile_url} onClick={()=>submit(t,'copy_note',undefined,undefined,true)}>Copy note & open LinkedIn</button>}{['accepted','message_sent'].includes(t.state)&&<button className="live-secondary" disabled={disabled||!!t.gate_reason||!t.profile_url} onClick={()=>submit(t,'copy_message',undefined,undefined,true)}>Copy message & open LinkedIn</button>}</div><fieldset disabled={disabled}><legend>Report an outcome</legend><label className="live-select">What happened?<select value={action} onChange={e=>{setAction(e.target.value);setAck(false);}}><option value="">Choose an outcome</option>{available.map(a=><option value={a} key={a}>{reports[a]}</option>)}</select></label>{action==='snooze'&&<label className="live-select">Remind me at · local time<input type="datetime-local" value={snooze} onChange={e=>setSnooze(e.target.value)}/></label>}<label className="live-select">Optional note<textarea value={note} maxLength={1000} rows={2} onChange={e=>setNote(e.target.value)}/></label><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I confirm this action or outcome. This is my report, not a LinkedIn delivery receipt.</label><p><button className="live-secondary" disabled={!action||!ack||action==='snooze'&&!snooze} onClick={()=>submit(t,action,note,snooze)}>Save my report</button></p></fieldset></article>;
}
export function PrepareLinkedInTask({plan}){
 const{user,organization}=useAuth(),key=`lg_linkedin_prepare_${user.subject}_${organization.org_id}_${plan.id}_${plan.content_hash}`;
 const[step,setStep]=useState(''),[ack,setAck]=useState(false),[pending,setPending]=useState(()=>storage(key)),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
 if(!['owner','admin'].includes(organization.role)||!plan.linkedin_manual?.steps?.length)return null;
 const selected=plan.linkedin_manual.steps.find(d=>String(d.step)===step);
 const ready=plan.campaign_current===true&&plan.expired===false&&plan.integrity_matches===true&&plan.approval_action==='approve'&&plan.approval_hash_matches===true;
 async function prepare(){if(lock.current||pending||!ready||!step||!ack||!selected?.message||!plan.linkedin_manual.profile_url)return;lock.current=true;setBusy(true);const p={plan_id:Number(plan.id),step:Number(step),content_hash:plan.content_hash};try{sessionStorage.setItem(key,JSON.stringify(p));setPending(p);}catch{setMessage('Enable session storage before preparing tasks.');lock.current=false;setBusy(false);return;}try{const r=await prepareLinkedInTask({...p,acknowledge_manual_task:true});if(r.prepared!==true||r.recorded!==true||r.execution_authorized!==false)throw Error();sessionStorage.removeItem(key);setPending(null);setAck(false);setMessage('Manual task saved. Open Outreach → LinkedIn to work on it. Nothing was sent.');}catch(e){if([400,401,403,404,409].includes(e.response?.status)){sessionStorage.removeItem(key);setPending(null);setMessage(`Task not prepared: ${words(e.response?.data?.reason)||'refresh the current plan'}.`);}else setMessage('Preparation result uncertain. Check the saved task before another request.');}finally{lock.current=false;setBusy(false);}}
 async function check(){if(!pending||pending.unreadable||lock.current)return;lock.current=true;setBusy(true);try{const r=await getLinkedInReceipt({...pending,kind:'prepare'});if(r.recorded===true){sessionStorage.removeItem(key);setPending(null);setMessage(`Task #${r.activity_id} is saved. Open Outreach → LinkedIn.`);}else setMessage('No matching task is confirmed. Ask an administrator to reconcile this request.');}catch{setMessage('Could not confirm the task. No preparation was retried.');}finally{lock.current=false;setBusy(false);}}
 return <section><h3>Manual LinkedIn task</h3><p className="pr-note">Only a due step with current approval and matched person evidence can be prepared. Adding a task does not send a message.</p>{message&&<p role="status">{message}</p>}{pending?<button className="live-secondary" disabled={busy} onClick={check}>Check saved LinkedIn task</button>:<><label className="live-select">Approved step<select value={step} onChange={e=>{setStep(e.target.value);setAck(false);}} disabled={busy||!ready}><option value="">Choose a step</option>{plan.linkedin_manual.steps.map(d=><option value={d.step} key={d.step}>Step {d.step}</option>)}</select></label>{selected&&<div className="pr-message"><p>Target: {plan.linkedin_manual.profile_url||'Matched profile not available'}</p><p>Approved delay: {selected.delay_days} days</p>{selected.connection_note&&<><h4>Connection note</h4><p>{selected.connection_note}</p></>}<h4>Message</h4><p>{selected.message||'Approved message not available'}</p></div>}<label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy||!ready}/> I reviewed the target and approved message for this manual task.</label><p><button className="live-secondary" disabled={busy||!ready||!step||!ack||!selected?.message||!plan.linkedin_manual.profile_url} onClick={prepare}>Add LinkedIn task</button></p></>}</section>;
}
