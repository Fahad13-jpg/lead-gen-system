'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {poll}=require('../../scripts/sender-connections/imap-poll.cjs');
const binding={org_id:1,connection_id:'one',credential_ref:'smtp',inbox_credential_ref:'imap',email:'sender@example.org'};
const activity={...binding,activity_id:2,sender_email:binding.email,state:'provider_accepted',message_id:'<sent@example.org>',recipient:'recipient@example.org',sent_at:'2026-10-24T01:00:00Z'};
const cursor={mailbox:'INBOX',uid_validity:'1',uid_next:'5'};
function fixture(){
 const state={released:false,payload:null};
 const deps={client:{mailbox:{uidValidity:1,uidNext:6},async getMailboxLock(name,options){assert.equal(options.readOnly,true);return {release(){state.released=true;}};},async *fetch(range,fields,options){assert.equal(options.uid,true);yield {uid:5,source:Buffer.from('mime')};}},
 async parse(){return {message_id:'<reply@example.org>',from:activity.recipient,to:[binding.email],in_reply_to:activity.message_id,references:[],received_at:'2026-10-24T02:00:00Z',text:'STOP'};},
 async persist(p){state.payload=p;return {saved:true};}};
 return {deps,state};
}
test('poll stores matched opt-out and cursor together, without marking read',async()=>{
 const {deps,state}=fixture();const r=await poll(binding,activity,cursor,deps);
 assert.equal(r.saved,true);assert.equal(state.payload.events[0].kind,'opt_out');assert.equal(state.payload.checkpoint.uid_next,'6');assert.equal(state.released,true);
});
test('missing initial cursor and UIDVALIDITY changes never skip inbox',async()=>{
 for(const previous of [null,{...cursor,uid_validity:'2'}]){const {deps,state}=fixture();assert.equal((await poll(binding,activity,previous,deps)).saved,false);assert.equal(state.payload,null);assert.equal(state.released,true);}
});
test('partial fetch, oversized MIME and parser failure never advance cursor',async()=>{
 for(const mode of ['fetch','size','parser']){const {deps,state}=fixture();
  if(mode==='fetch')deps.client.fetch=async function*(){yield {uid:5,source:Buffer.from('x')};throw Error('disconnect');};
  if(mode==='size')deps.client.fetch=async function*(){yield {uid:5,source:Buffer.alloc(1024*1024+1)};};
  if(mode==='parser')deps.parse=async()=>{throw Error('bad mime');};
  assert.equal((await poll(binding,activity,cursor,deps)).saved,false);assert.equal(state.payload,null);assert.equal(state.released,true);
 }
});
test('large mailbox scans at most 100 UID positions then resumes',async()=>{
 const {deps,state}=fixture();deps.client.mailbox.uidNext=500;
 deps.client.fetch=async function*(range){assert.equal(range,'5:104');};
 const r=await poll(binding,activity,cursor,deps);assert.equal(r.more,true);assert.equal(state.payload.checkpoint.uid_next,'105');
});
test('stale database cursor is reported, never treated as success',async()=>{
 const {deps}=fixture();deps.persist=async()=>({saved:false,reason:'stale_scan'});
 const r=await poll(binding,activity,cursor,deps);assert.equal(r.saved,false);assert.equal(r.reason,'stale_scan');
});
