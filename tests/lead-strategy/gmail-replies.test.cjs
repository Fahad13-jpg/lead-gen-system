'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const r=require('../../scripts/lead-strategy/v2/gmail-replies.cjs');
function fixture(){
 const binding={org_id:1,email:'sales@example.org',credential_ref:'mock'};
 const activity={org_id:1,lead_id:3,activity_id:8,credential_ref:'mock',sender_email:binding.email,lead_email:'clinic@example.com',external_id:'abcdef1234'};
 const headers=obj=>Object.entries(obj).map(([name,value])=>({name,value}));
 const original={id:activity.external_id,threadId:'11112222',internalDate:'1700000000000',payload:{headers:headers({From:'Sales <sales@example.org>',To:activity.lead_email,'Message-ID':'<out@example.org>'})}};
 const incoming={id:'abcdef5678',threadId:original.threadId,internalDate:'1700000010000',payload:{mimeType:'text/plain',headers:headers({From:activity.lead_email,To:binding.email,'In-Reply-To':'<out@example.org>',Subject:'Hello'}),body:{data:Buffer.from('Please send details').toString('base64url')}}};
 return {binding,activity,original,incoming};
}
test('exact account and conversation produces deterministic stop event without AI',()=>{
 const f=fixture(),v=r.match(...Object.values(f));assert.equal(v.matched,true);assert.equal(v.body,'Please send details');
 assert.deepEqual(v.stop_event,{org_id:1,activity_id:8,kind:'reply',event_id:'gmail:abcdef5678',source_ref:'gmail-thread:11112222'});
});
for(const [name,mutate] of Object.entries({
 tenant:f=>f.activity.org_id=2,credential:f=>f.activity.credential_ref='other',sender:f=>f.binding.email='other@example.org',missingRecipient:f=>{delete f.activity.lead_email;f.original.payload.headers=[];f.incoming.payload.headers=[];},
 original:f=>f.original.id='00000000',thread:f=>f.incoming.threadId='99999999',self:f=>f.incoming.labelIds=['SENT'],
 stranger:f=>f.incoming.payload.headers[0].value='someone@example.com',reference:f=>f.incoming.payload.headers[2].value='<other@example.org>',
 old:f=>f.incoming.internalDate=f.original.internalDate,missing:f=>f.incoming={},invalidDate:f=>f.incoming.internalDate='9000000000000000',
 duplicateHeader:f=>f.incoming.payload.headers.push({name:'from',value:'clinic@example.com'})
}))test('reject '+name,()=>{const f=fixture();mutate(f);assert.equal(r.match(...Object.values(f)).matched,false);});
test('automatic response pauses for review, not automatic nurture',()=>{
 const f=fixture();f.incoming.payload.headers.push({name:'auto-submitted',value:'auto-replied'});
 const result=r.match(...Object.values(f));assert.equal(result.category,'automatic_response');assert.equal(result.stop_event.kind,'reply');
});
test('body handles nested MIME, unicode, control removal and bounded output',()=>{
 const m={payload:{parts:[{parts:[{mimeType:'text/plain',body:{data:Buffer.from('سلام\0'+ 'x'.repeat(20000)).toString('base64url')}}]}]}};
 assert(r.body(m).startsWith('سلام'));assert(!r.body(m).includes('\0'));assert(r.body(m).length<=12000);assert.equal(r.body({}), '');
});
test('disabled means no mailbox or database access',async()=>assert.deepEqual(await r.poll(null,null,null),{state:'disabled',processed:0}));
test('wrong organization never reads mailbox',async()=>{
 const f=fixture();f.activity.org_id=2;const result=await r.poll(f.binding,[f.activity],{}, {enabled:true});assert.equal(result.results[0].reason,'sender_binding_mismatch');
});
test('one stop per message per poll; replay uses same id; no sending dependency',async()=>{
 const f=fixture(),events=[],deps={getMessage:async()=>f.original,getThread:async()=>({id:f.original.threadId,messages:[f.original,f.incoming,f.incoming]}),recordStop:async e=>{events.push(e);return {saved:true};}};
 for(let i=0;i<2;i++){const result=await r.poll(f.binding,[f.activity],deps,{enabled:true});assert.equal(result.results.length,1);assert.equal(result.results[0].state,'stopped');}
 assert.deepEqual(events[0],events[1]);
});
test('read and persistence failures never invent a reply or claim success',async()=>{
 const f=fixture();let writes=0;const deps={getMessage:async()=>{throw Error('SECRET');},recordStop:async()=>{writes++;}};
 let v=await r.poll(f.binding,[f.activity],deps,{enabled:true});assert.equal(writes,0);assert(!JSON.stringify(v).includes('SECRET'));
 deps.getMessage=async()=>f.original;deps.getThread=async()=>({id:f.original.threadId,messages:[f.incoming]});deps.recordStop=async()=>{throw Error('SECRET');};
 v=await r.poll(f.binding,[f.activity],deps,{enabled:true});assert.equal(v.results[0].reason,'stop_commit_unknown');
});
module.exports={fixture};
test('connected Gmail profile must match explicit sender binding and fixed credential',()=>{
 const f=fixture();assert.equal(r.verifyMailbox(f.binding,{emailAddress:'SALES@example.org'},'mock').email,'sales@example.org');
 for(const profile of [{},{emailAddress:'other@example.org'},{emailAddress:f.binding.email,error:'expired'}])assert.throws(()=>r.verifyMailbox(f.binding,profile,'mock'),/CONNECTED_MAILBOX_MISMATCH/);
 assert.throws(()=>r.verifyMailbox(f.binding,{emailAddress:f.binding.email},'other'),/INVALID_SENDER_BINDING/);
});
test('standalone unsubscribe becomes opt-out; quoted/negated/uncertain text does not',()=>{
 for(const text of ['Unsubscribe','Please remove me from your list.','Stop emailing me','Do not contact me again.','unsubscribe\n> previous message'])assert.equal(r.clearOptOut(text),true,text);
 for(const text of ['Please do not unsubscribe me','How do I unsubscribe?','Interested\n> Unsubscribe','\n> Unsubscribe','Thanks\nOn Monday someone wrote:\nUnsubscribe','Unsubscribe instructions are useful'])assert.equal(r.clearOptOut(text),false,text);
 const f=fixture();f.incoming.payload.body.data=Buffer.from('Unsubscribe').toString('base64url');
 assert.equal(r.match(...Object.values(f)).stop_event.kind,'opt_out');
});
