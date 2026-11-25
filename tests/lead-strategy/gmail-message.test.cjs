'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepare}=require('../../scripts/lead-strategy/v2/gmail-message.cjs');
const message={org_id:1,plan_id:2,step:1,content_hash:'a'.repeat(32),to_email:'clinic@example.org',subject_line:'Demo',email_body:'Hello\nسلام'};
const sender={email:'sender@example.org',credential_ref:'mock'};
function parent(){return {activity:{org_id:1,plan_id:2,step:1,content_hash:message.content_hash,state:'provider_accepted',external_id:'abcdef1234',sender_email:sender.email,credential_ref:'mock'},message:{id:'abcdef1234',threadId:'11112222',payload:{headers:[{name:'From',value:sender.email},{name:'To',value:message.to_email},{name:'Subject',value:'Demo'},{name:'Message-ID',value:'<original@example.org>'}]}}};}
test('first email has no fabricated conversation and preserves Unicode body',()=>{
 const result=prepare(message,sender);assert.equal(result.threadId,undefined);
 const mime=Buffer.from(result.raw,'base64url').toString();assert(!mime.includes('In-Reply-To:'));assert.equal(Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString(),'Hello\r\nسلام');
});
test('followup includes verified thread and RFC reply headers',()=>{
 const result=prepare({...message,step:2},sender,parent());assert.equal(result.threadId,'11112222');const mime=Buffer.from(result.raw,'base64url').toString();assert(mime.includes('In-Reply-To: <original@example.org>'));assert(mime.includes('References: <original@example.org>'));
});
for(const [name,mutate] of Object.entries({org:p=>p.activity.org_id=2,plan:p=>p.activity.plan_id=3,hash:p=>p.activity.content_hash='x',step:p=>p.activity.step=2,credential:p=>p.activity.credential_ref='other',recipient:p=>p.message.payload.headers[1].value='other@example.org',subject:p=>p.message.payload.headers[2].value='different',reference:p=>p.message.payload.headers[3].value='<bad>\r\nBcc: bad@example.org',receipt:p=>p.activity.state='ambiguous'}))test('reject mismatched parent '+name,()=>{const p=parent();mutate(p);assert.throws(()=>prepare({...message,step:2},sender,p));});
test('missing parent and header injection fail before transport',()=>{
 assert.throws(()=>prepare({...message,step:2},sender),/THREAD_CONTEXT_REQUIRED/);
 assert.throws(()=>prepare({...message,subject_line:'Demo\r\nBcc: bad@example.org'},sender),/INVALID_SUBJECT/);
});
test('Unicode subjects use independently valid bounded encoded words',()=>{
 const subject='سلام '.repeat(35),result=prepare({...message,subject_line:subject},sender),mime=Buffer.from(result.raw,'base64url').toString();
 const words=[...mime.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(m=>Buffer.from(m[1],'base64').toString());assert.equal(words.join(''),subject);assert(!words.some(w=>w.includes('\ufffd')));
});
