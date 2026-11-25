'use strict';
// Explicitly approved two-email integration test. Gmail reads; writes only to
// the final-test scratch database. Never retries an attempted message.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const t=require('./test-live-email-final.cjs'),{Client}=require('./gmail-test-client.cjs');
const h=require('../lead-strategy/v2/gmail-replies.cjs');
const lit=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const row=JSON.parse(fs.readFileSync(path.join(t.dir,'plan.json')));
const binding={org_id:1,email:t.from,credential_ref:t.ref};
async function scan(client,step){
 const a=t.parse(t.sql("SELECT json_build_object('activity_id',id,'org_id',org_id,'lead_id',lead_id,'lead_email',dispatch_metadata->>'recipient_email','sender_email',dispatch_metadata->>'sender_email','credential_ref',dispatch_metadata->>'credential_ref','external_id',external_id,'plan_id',dispatch_metadata->>'plan_id','content_hash',dispatch_metadata->>'content_hash','step',(dispatch_metadata->>'step')::integer,'state',dispatch_metadata->>'state','delivery_scan',coalesce(dispatch_metadata->'delivery_scan','{}'::jsonb)) FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'='"+row.plan_id+"' AND dispatch_metadata->>'step'='"+step+"'"));
 assert.equal(a.state,'provider_accepted','Unconfirmed attempt: reconcile, never resend');
 const original=client.request('GET','messages/'+a.external_id+'?format=full');
 assert.equal(original.id,a.external_id);
 const thread=client.request('GET','threads/'+original.threadId+'?format=full');
 assert.equal(thread.id,original.threadId);assert(Array.isArray(thread.messages)&&thread.messages.length<=200);
 const events=[],reviews=[];
 for(const m of thread.messages){if(m.id===original.id)continue;const r=h.match(binding,a,original,m);
  if(r.matched)events.push(r);else if(r.reason!=='outgoing_message')reviews.push({message_id:m.id,reason:r.reason});}
 const previous=a.delivery_scan;assert.notEqual(previous.complete,false,'Incomplete scan needs normal checkpoint recovery');
 const until=Date.now(),from=previous.checked_through||Number(original.internalDate);
 const delivery=await h.discoverDeliveryReports(binding,a,original,{
  listMessages:async(_,p)=>{assert(!p.pageToken,'Test scan exceeds bounded first page');return client.request('GET','messages?maxResults=25&q='+encodeURIComponent(p.q));},
  getMessage:async(_,id)=>client.request('GET','messages/'+id+'?format=full')
 },{enabled:true,now:until,checkedThrough:new Date(from).toISOString()});
 assert.equal(delivery.complete,true,'Delivery scan incomplete; no follow-up allowed');
 events.push(...delivery.events);reviews.push(...delivery.reviews);
 const payload={org_id:1,activity_id:a.activity_id,credential_ref:t.ref,sender_email:t.from,external_id:a.external_id,
  events:[...new Map(events.map(e=>[e.stop_event.event_id,e])).values()],reviews,delivery_scan_previous:previous,
  delivery_scan_next:{window_start:from,window_end:until,checked_through:until,complete:true,next_page_token:null,review_required:previous.review_required===true||reviews.length>0}};
 const saved=t.parse(t.sql('SELECT outreach_reply_scan_finish('+lit(payload)+')'));assert.equal(saved.saved,true);
 fs.writeFileSync(path.join(t.dir,'scan-'+step+'.json'),JSON.stringify({at:new Date().toISOString(),matched:saved.matched_count,reviews:saved.review_count,categories:events.map(e=>e.category)}));
 return {activity:a,message:original,thread,events,reviews};
}
async function main(){
 const mode=process.argv[2];assert(['--send-approved-followup','--check-reply'].includes(mode));
 const step=fs.existsSync(path.join(t.dir,'receipt-2.json'))?2:1;
 if(mode==='--send-approved-followup')assert(!fs.existsSync(path.join(t.dir,'attempt-2.json')),'Second email already attempted: never replay');
 const client=new Client(t.dir,'gmail-final-check-20261019',t.ref);
 try{
  client.open();
  // Refresh both accepted activities: an older stale scan must not mask the
  // reply-stop reason we are trying to verify in this final integration test.
  if(mode==='--check-reply'&&step===2)await scan(client,1);
  const parent=await scan(client,step);
  if(mode==='--check-reply'){
   const gate=t.parse(t.sql("SELECT outreach_email_contact_gate(1,167,'"+t.to+"','"+t.from+"')"));
   const report={matched:parent.events.length,categories:parent.events.map(e=>e.category),contact_gate:gate,thread_messages:parent.thread.messages.length};
   if(parent.events.length){assert.equal(gate.allowed,false,'Reply must prevent further contact');
    assert(['reply_requires_review','email_address_suppressed'].includes(gate.reason),'Verify an actual persisted stop, not a stale-scan block');}
   fs.writeFileSync(path.join(t.dir,'reply-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));return;
  }
  assert.equal(parent.events.length,0,'Reply or bounce already present: stop');assert.equal(parent.reviews.length,0,'Conversation requires review');
  assert(Date.now()-Number(parent.message.internalDate)>=300000,'Wait five minutes after Gmail acceptance');
  const result=await t.send(row,2,client,parent);
  if(result.provider_accepted){const receipt=JSON.parse(fs.readFileSync(path.join(t.dir,'receipt-2.json')));
   assert.equal(receipt.threadId,parent.message.threadId,'Gmail thread mismatch');
   fs.writeFileSync(path.join(t.dir,'thread-verification.json'),JSON.stringify({same_thread:true,first:parent.message.id,second:receipt.id,thread_id:receipt.threadId}));
   console.log('PASS: both accepted messages share the actual Gmail thread. Awaiting recipient reply.');}
 }finally{client.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
