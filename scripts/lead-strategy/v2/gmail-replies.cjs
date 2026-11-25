'use strict';
// Deterministic, read-only matching. Inputs must come from the bound mailbox,
// never from dashboard-submitted Gmail IDs. No AI or network access here.
const gmailId = v => typeof v === 'string' && /^[a-f0-9]{8,64}$/i.test(v);
const positive = v => /^[1-9][0-9]*$/.test(String(v)) && Number.isSafeInteger(Number(v));
function header(message, name) {
 const h = message?.payload?.headers;
 if (!Array.isArray(h)) return '';
 const values = h.filter(x => typeof x?.name === 'string' && x.name.toLowerCase() === name.toLowerCase());
 return values.length === 1 && typeof values[0].value === 'string' ? values[0].value : '';
}
function address(value) {
 if (typeof value !== 'string' || /[\r\n]/.test(value)) return null;
 const v = (value.match(/^[^<>]*<([^<>]+)>\s*$/)?.[1] || value).trim();
 return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v) ? v.toLowerCase() : null;
}
function verifyMailbox(binding,profile,credentialRef) {
 if(!positive(binding?.org_id)||!address(binding?.email)||binding?.credential_ref!==credentialRef||!credentialRef)
  throw Error('INVALID_SENDER_BINDING');
 if(!address(profile?.emailAddress)||address(profile.emailAddress)!==address(binding.email)||profile.error)
  throw Error('CONNECTED_MAILBOX_MISMATCH');
 // Canonical account only; aliases need an explicit verified mapping later.
 return {...binding,email:address(profile.emailAddress)};
}
function body(message) {
 let count=0;
 function visit(part, depth) {
  if (!part || depth>8 || ++count>100) return '';
  if (part.mimeType==='text/plain' && typeof part.body?.data==='string') {
   return Buffer.from(part.body.data.slice(0,22000),'base64url').toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,12000);
  }
  return Array.isArray(part.parts) ? part.parts.map(p=>visit(p,depth+1)).filter(Boolean).join('\n').slice(0,12000) : '';
 }
 return visit(message?.payload,0);
}
function clearOptOut(text) {
 // Exact standalone request in the new text only. Never classify quoted
 // unsubscribe footers, questions, or a negated request as an opt-out.
 const fresh=String(text).split(/\n\s*(?:>|On .+wrote:|From:|-----Original Message-----)/i)[0].trim();
 return /^(?:unsubscribe(?: me)?|please unsubscribe(?: me)?|remove me(?: from (?:your|the) (?:list|mailing list))?|please remove me(?: from (?:your|the) (?:list|mailing list))?|stop(?: emailing me)?|do not (?:email|contact) me(?: again)?|don't (?:email|contact) me(?: again)?)[.!\s]*$/i.test(fresh);
}
function deliveryReport(original,incoming,recipient) {
 // RFC 3464 subset: an explicit failed recipient + permanent status and a
 // returned original Message-ID. Subject text is never bounce evidence.
 const parts=[];let count=0;
 function walk(part,depth){if(!part||depth>8||++count>100)return;parts.push(part);if(Array.isArray(part.parts))for(const child of part.parts)walk(child,depth+1);}
 walk(incoming?.payload,0);
 const reports=parts.filter(p=>p.mimeType==='message/delivery-status');
 if(!reports.length)return null;
 const uncertain=reason=>({matched:false,reason});
 if(incoming.payload?.mimeType!=='multipart/report'||reports.length!==1)return uncertain('delivery_report_shape_unverified');
 const decode=p=>typeof p.body?.data==='string'&&p.body.data.length<=44000?Buffer.from(p.body.data,'base64url').toString('utf8'):null;
 function fields(text){
  const map={};for(const line of text.replace(/\r\n/g,'\n').replace(/\n[ \t]+/g,' ').split('\n')){
   const m=line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);if(!m)continue;
   const key=m[1].toLowerCase();if(Object.hasOwn(map,key))return null;map[key]=m[2].trim();
  }return map;
 }
 const raw=decode(reports[0]);if(raw===null)return uncertain('delivery_report_body_unavailable');
 const blocks=raw.replace(/\r\n/g,'\n').trim().split(/\n\s*\n/).map(fields);
 if(blocks.some(b=>!b)||!blocks[0]?.['reporting-mta'])return uncertain('delivery_report_fields_unverified');
 const recipients=blocks.slice(1).filter(b=>address(b['final-recipient']?.match(/^rfc822\s*;\s*(.+)$/i)?.[1])===address(recipient));
 if(recipients.length!==1)return uncertain('delivery_report_recipient_mismatch');
 const originalRef=header(original,'Message-ID'),returned=[];
 for(const p of parts.filter(p=>['text/rfc822-headers','message/rfc822'].includes(p.mimeType))){
  const data=decode(p);if(data!==null){const h=fields(data.split(/\r?\n\r?\n/)[0]);if(h?.['message-id'])returned.push(h['message-id']);}
  // Some Gmail payloads expose encapsulated original headers as child parts.
  if(p.mimeType==='message/rfc822'&&Array.isArray(p.parts))for(const child of p.parts){const id=header({payload:child},'Message-ID');if(id)returned.push(id);}
 }
 if(!/^<[^<>\s]+>$/.test(originalRef)||!returned.length||returned.some(id=>id!==originalRef))return uncertain('delivery_report_original_mismatch');
 const report=recipients[0];
 if(report.action?.toLowerCase()!=='failed'||!/^5\.[0-9]{1,3}\.[0-9]{1,3}$/.test(report.status||''))return uncertain('delivery_report_not_permanent_failure');
 return {matched:true,status:report.status,category:'hard_bounce'};
}
function match(binding, activity, original, incoming) {
 const review=reason=>({matched:false,reason,requires_review:true});
 if (!positive(binding?.org_id) || !binding?.credential_ref || !address(binding?.email) ||
     !positive(activity?.activity_id) || !positive(activity?.lead_id) || !address(activity?.lead_email) ||
     String(binding.org_id)!==String(activity?.org_id) ||
     binding.credential_ref!==activity?.credential_ref || address(binding.email)!==address(activity?.sender_email)) return review('sender_binding_mismatch');
 if (!gmailId(original?.id) || original.id!==activity?.external_id || !gmailId(original?.threadId) ||
     address(header(original,'From'))!==address(binding.email) ||
     address(header(original,'To'))!==address(activity.lead_email)) return review('original_message_mismatch');
 if (!gmailId(incoming?.id) || incoming.error || incoming.id===original.id) return review('not_a_new_message');
 if (!gmailId(incoming.threadId)) return review('conversation_mismatch');
 if (Array.isArray(incoming.labelIds) && (incoming.labelIds.includes('SENT') || incoming.labelIds.includes('DRAFT')) ||
     address(header(incoming,'From'))===address(binding.email)) return review('outgoing_message');
 const sent=Number(original.internalDate), received=Number(incoming.internalDate);
 if (!Number.isSafeInteger(sent) || !Number.isSafeInteger(received) || sent<=0 || received<=sent || received>8640000000000000) return review('message_time_invalid');
 const delivery=deliveryReport(original,incoming,activity.lead_email);
 if(delivery){
  if(!delivery.matched)return review(delivery.reason);
  return {matched:true,requires_review:true,category:'hard_bounce',body:'Structured delivery report: '+delivery.status,
   subject:header(incoming,'Subject').slice(0,500),received_at:new Date(received).toISOString(),
   thread_id:incoming.threadId,message_id:incoming.id,
   stop_event:{org_id:Number(binding.org_id),activity_id:Number(activity.activity_id),kind:'bounce',event_id:'gmail:'+incoming.id,source_ref:'gmail-thread:'+incoming.threadId}};
 }
 if(incoming.threadId!==original.threadId)return review('conversation_mismatch');
 // Unknown senders need review; never infer a bounce from subject text.
 if (address(header(incoming,'From'))!==address(activity.lead_email)) return review('sender_requires_review');
 const originalRef=header(original,'Message-ID');
 const refs=(header(incoming,'In-Reply-To')+' '+header(incoming,'References')).match(/<[^<>\s]+>/g)||[];
 if (!/^<[^<>\s]+>$/.test(originalRef) || !refs.includes(originalRef)) return review('reply_reference_missing');
 const text=body(incoming);
 const automatic=header(incoming,'Auto-Submitted');
 // Automatic responses also pause conservatively; no automatic resumption.
 const category=automatic && automatic.toLowerCase()!=='no' ? 'automatic_response' : clearOptOut(text)?'opt_out':'reply';
 return {matched:true,requires_review:true,category,body:text,subject:header(incoming,'Subject').slice(0,500),
  received_at:new Date(received).toISOString(),thread_id:incoming.threadId,message_id:incoming.id,
  stop_event:{org_id:Number(binding.org_id),activity_id:Number(activity.activity_id),kind:category==='opt_out'?'opt_out':'reply',
   event_id:'gmail:'+incoming.id,source_ref:'gmail-thread:'+incoming.threadId}};
}
async function discoverDeliveryReports(binding,activity,original,deps,options={}) {
 if(options.enabled!==true)return {complete:false,reason:'discovery_disabled',events:[],reviews:[]};
 if(!positive(binding?.org_id)||!positive(activity?.activity_id)||String(binding.org_id)!==String(activity?.org_id)||
 binding.credential_ref!==activity?.credential_ref||!address(binding.email)||address(binding.email)!==address(activity.sender_email)||
 !address(activity.lead_email)||original?.id!==activity.external_id||!gmailId(original?.id)||
 address(header(original,'From'))!==address(binding.email)||address(header(original,'To'))!==address(activity.lead_email))
  return {complete:false,reason:'discovery_context_mismatch',events:[],reviews:[]};
 const sent=Number(original.internalDate),until=options.now??Date.now();
 const checkpoint=options.checkedThrough===undefined?sent:Date.parse(options.checkedThrough);
 if(!Number.isSafeInteger(sent)||sent<=0||!Number.isSafeInteger(until)||until>8640000000000000||until<sent||
 !Number.isFinite(checkpoint)||checkpoint<sent||checkpoint>until)return {complete:false,reason:'invalid_discovery_window',events:[],reviews:[]};
 // Overlap by a second. Idempotent event IDs absorb repeated boundary results.
 const q='after:'+Math.max(0,Math.floor(checkpoint/1000)-1)+' before:'+(Math.floor(until/1000)+1)+' -in:sent -in:drafts';
 const events=[],reviews=[],seen=new Set(),tokens=new Set();let pageToken;
 for(let page=0;page<2;page++){
  let list;
  try{list=await deps.listMessages(binding,{q,maxResults:25,...(pageToken?{pageToken}:{})});}
  catch{return {complete:false,reason:'discovery_list_failed',events,reviews};}
  if(list?.error||!list||typeof list!=='object'||Array.isArray(list)||
   list.messages!==undefined&&!Array.isArray(list.messages)||Array.isArray(list.messages)&&list.messages.length>25)
   return {complete:false,reason:'invalid_discovery_page',events,reviews};
  for(const ref of list.messages||[]){
   if(!gmailId(ref?.id))return {complete:false,reason:'invalid_discovery_id',events,reviews};
   if(seen.has(ref.id)||ref.id===original.id)continue;seen.add(ref.id);
   let message;try{message=await deps.getMessage(binding,ref.id);}catch{return {complete:false,reason:'discovery_message_failed',events,reviews};}
   if(message?.id!==ref.id||message.error)return {complete:false,reason:'discovery_message_failed',events,reviews};
   const result=match(binding,activity,original,message);
   if(result.matched&&result.category==='hard_bounce')events.push(result);
   else if(result.reason?.startsWith('delivery_report_')&&!['delivery_report_recipient_mismatch','delivery_report_original_mismatch'].includes(result.reason))reviews.push({message_id:ref.id,reason:result.reason});
  }
  pageToken=list.nextPageToken;
  if(!pageToken)return {complete:true,checked_through:new Date(until).toISOString(),events,reviews};
  if(typeof pageToken!=='string'||pageToken.length>2000||tokens.has(pageToken))return {complete:false,reason:'invalid_discovery_page_token',events,reviews};
  tokens.add(pageToken);
 }
 return {complete:false,reason:'discovery_page_budget_reached',events,reviews};
}
async function poll(binding, activities, deps, options={}) {
 if(options.enabled!==true) return {state:'disabled',processed:0};
 if(!positive(binding?.org_id)||typeof binding?.credential_ref!=='string'||!binding.credential_ref||!address(binding?.email))throw Error('INVALID_SENDER_BINDING');
 if(!Array.isArray(activities)||activities.length>50)throw Error('INVALID_REPLY_BATCH');
 const results=[];
 for(const activity of activities) {
  // Validate binding before reading a mailbox. SQL also checks scope on write.
  if(!positive(activity?.activity_id)||!positive(activity?.lead_id)||String(activity?.org_id)!==String(binding.org_id)||activity.credential_ref!==binding.credential_ref||
     address(activity.sender_email)!==address(binding.email)||!address(binding.email)||!gmailId(activity.external_id)) {
   results.push({state:'review',reason:'sender_binding_mismatch'});continue;
  }
  let original,thread;
  try {original=await deps.getMessage(binding,activity.external_id);
   if(original?.id!==activity.external_id||!gmailId(original?.threadId))throw Error('invalid_original');
   thread=await deps.getThread(binding,original.threadId);
  } catch {results.push({state:'paused',reason:'mailbox_read_failed'});continue;}
  if(thread?.id!==original.threadId||!Array.isArray(thread?.messages)||thread.messages.length>200){results.push({state:'review',reason:'invalid_or_oversized_thread'});continue;}
  const seen=new Set();
  for(const message of thread.messages){
   if(message?.id===original.id||seen.has(message?.id))continue;
   seen.add(message?.id);
   const event=match(binding,activity,original,message);
   if(!event.matched){results.push({state:'review',reason:event.reason});continue;}
   // Stop BEFORE downstream qualification/storage. A write failure is retried
   // on a later poll with the same deterministic event ID, never a new event.
   try {const saved=await deps.recordStop(event.stop_event);
    results.push(saved?.saved===true?{state:'stopped',event}:{state:'paused',reason:'stop_not_saved'});
   } catch {results.push({state:'paused',reason:'stop_commit_unknown'});}
  }
 }
 return {state:'checked',processed:results.length,results};
}
module.exports={header,address,body,verifyMailbox,clearOptOut,deliveryReport,discoverDeliveryReports,match,poll};
