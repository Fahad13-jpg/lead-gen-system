'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const r=require('../../scripts/lead-strategy/v2/gmail-replies.cjs');
function fixture(){
 const binding={org_id:1,email:'sender@example.org',credential_ref:'mock'};
 const activity={org_id:1,activity_id:2,lead_id:3,credential_ref:'mock',sender_email:binding.email,lead_email:'clinic@example.org',external_id:'abcdef1234'};
 const original={id:activity.external_id,threadId:'11112222',internalDate:'1700000000000',payload:{headers:[{name:'From',value:binding.email},{name:'To',value:activity.lead_email},{name:'Message-ID',value:'<original@example.org>'}]}};
 const encoded=text=>({data:Buffer.from(text).toString('base64url')});
 const incoming={id:'abcd9999',threadId:original.threadId,internalDate:'1700000010000',payload:{mimeType:'multipart/report',headers:[{name:'From',value:'mailer-daemon@example.org'}],parts:[
 {mimeType:'message/delivery-status',body:encoded('Reporting-MTA: dns; mx.example.org\r\n\r\nFinal-Recipient: rfc822; clinic@example.org\r\nAction: failed\r\nStatus: 5.1.1')},
 {mimeType:'text/rfc822-headers',body:encoded('Message-ID: <original@example.org>\r\nTo: clinic@example.org')}
 ]}};
 return {binding,activity,original,incoming};
}
test('structured permanent failure matches original recipient/message and stops',()=>{const f=fixture(),v=r.match(...Object.values(f));assert.equal(v.category,'hard_bounce');assert.equal(v.stop_event.kind,'bounce');});
for(const [name,change] of Object.entries({
 otherTenant:f=>f.activity.org_id=2,invalidThread:f=>f.incoming.threadId='invalid',missingAttachment:f=>f.incoming.payload.parts[0].body={attachmentId:'missing'},
 differentOriginal:f=>f.incoming.payload.parts[1].body.data=Buffer.from('Message-ID: <different@example.org>').toString('base64url'),
 wrongRecipient:f=>f.activity.lead_email='other@example.org',
 subjectOnly:f=>{f.incoming.payload={headers:[{name:'From',value:'mailer-daemon@example.org'},{name:'Subject',value:'Delivery failed'}]};},
 temporary:f=>f.incoming.payload.parts[0].body.data=Buffer.from('Reporting-MTA: dns; mx.example.org\n\nFinal-Recipient: rfc822; clinic@example.org\nAction: delayed\nStatus: 4.2.0').toString('base64url'),
 duplicateFields:f=>f.incoming.payload.parts[0].body.data=Buffer.from('Reporting-MTA: dns; mx.example.org\n\nFinal-Recipient: rfc822; clinic@example.org\nAction: failed\nStatus: 5.1.1\nStatus: 4.2.0').toString('base64url')
}))test('bounce fails closed: '+name,()=>{const f=fixture();change(f);assert.equal(r.match(...Object.values(f)).matched,false);});
test('delivery report in another thread still requires exact original reference and recipient',()=>{
 const f=fixture();f.incoming.threadId='ffffffff';assert.equal(r.match(...Object.values(f)).stop_event.kind,'bounce');
});
test('bounded mailbox discovery finds cross-thread report and deduplicates pages',async()=>{
 const f=fixture();f.incoming.threadId='ffffffff';let calls=0,reads=0;
 const deps={listMessages:async(b,p)=>{assert.equal(b.org_id,1);assert.equal(p.maxResults,25);calls++;return calls===1?{messages:[{id:f.incoming.id}],nextPageToken:'page2'}:{messages:[{id:f.incoming.id}]};},getMessage:async()=>{reads++;return f.incoming;}};
 const result=await r.discoverDeliveryReports(f.binding,f.activity,f.original,deps,{enabled:true,now:1700000020000});
 assert.equal(result.complete,true);assert.equal(result.events.length,1);assert.equal(reads,1);assert.equal(calls,2);assert(result.checked_through);
});
test('disabled or mismatched discovery makes no mailbox requests',async()=>{
 const f=fixture();assert.equal((await r.discoverDeliveryReports(null,null,null,null)).reason,'discovery_disabled');
 f.binding.org_id=2;assert.equal((await r.discoverDeliveryReports(f.binding,f.activity,f.original,{}, {enabled:true})).reason,'discovery_context_mismatch');
});
test('page budget and read failures never advance checkpoint',async()=>{
 const f=fixture();let calls=0;
 const deps={listMessages:async()=>({messages:[],nextPageToken:'page'+(++calls)})};
 let result=await r.discoverDeliveryReports(f.binding,f.activity,f.original,deps,{enabled:true});assert.equal(calls,2);assert.equal(result.complete,false);assert.equal(result.checked_through,undefined);
 deps.listMessages=async()=>({messages:[{id:f.incoming.id}]});deps.getMessage=async()=>{throw Error('SECRET');};
 result=await r.discoverDeliveryReports(f.binding,f.activity,f.original,deps,{enabled:true});assert.equal(result.complete,false);assert(!JSON.stringify(result).includes('SECRET'));
});
