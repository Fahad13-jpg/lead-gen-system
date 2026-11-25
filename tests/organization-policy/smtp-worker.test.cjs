'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{run}=require('../../scripts/sender-connections/worker.cjs');
function fixture(){
 const binding={org_id:1,connection_id:'one',provider:'smtp',credential_ref:'smtp',inbox_credential_ref:'imap',email:'sender@example.org',version:1,state:'pending_check',checked_at:new Date().toISOString()};
 const seen=[];
 const context={getNodeParameter(key){return {operation:'check',binding:JSON.stringify({org_id:1,connection_id:'one'}),release:'null'}[key];},getNode(){return {credentials:{smtp:{id:'smtp'},imap:{id:'imap'}}};},async getCredentials(key){seen.push(key);return {host:'localhost',database:'scratch',user:'fixture',password:'fixture'};}};
 const lib={Client:class{async connect(){seen.push('db_connect');}async end(){seen.push('db_end');}async query(sql){seen.push(sql);return {rows:sql.includes('pg_try_advisory_lock')?[{locked:true}]:sql.includes('SELECT * FROM sender_connections')?[binding]:[{result:{state:'ready',version:2,execution_authorized:false}}]};}}};
 const connect=async()=>{seen.push('provider_connect');return {transport:{async verify(){seen.push('verify');}},client:{mailbox:{uidValidity:2,uidNext:10},async getMailboxLock(){return {release(){}};}},async close(){seen.push('provider_close');}};};
 return {binding,seen,context,lib,connect};
}
test('connection check resolves metadata and credentials server-side, persists readiness without sending',async()=>{const f=fixture();const r=await run(f.context,f.lib,f.connect);assert.equal(r.execution_authorized,false);assert(f.seen.some(v=>v.includes('sender_connection_checked')));assert.equal(f.seen.at(-1),'db_end');assert(f.seen.indexOf('provider_connect')>f.seen.indexOf('smtp'));});
test('wrong credential or provider blocks before provider credentials are read',async()=>{for(const patch of [{credential_ref:'other'},{provider:'gmail'}]){const f=fixture();Object.assign(f.binding,patch);await assert.rejects(run(f.context,f.lib,f.connect));assert(!f.seen.includes('smtp'));assert(!f.seen.includes('provider_connect'));assert.equal(f.seen.at(-1),'db_end');}});
test('null send release returns before any credential/database/provider access',async()=>{const f=fixture(),original=f.context.getNodeParameter;f.context.getNodeParameter=k=>k==='operation'?'send':original(k);const r=await run(f.context,f.lib,f.connect);assert.equal(r.reason,'release_not_authorized');assert.deepEqual(f.seen,[]);});
test('check failure closes provider and database without marking connection ready',async()=>{const f=fixture();const connect=async()=>{const p=await f.connect();p.transport.verify=async()=>{throw Error('failed');};return p;};await assert.rejects(run(f.context,f.lib,connect));assert(f.seen.includes('provider_close'));assert(f.seen.some(v=>v.includes('sender_connection_checked')&&v.includes('\"send\":false')));assert.equal(f.seen.at(-1),'db_end');});
test('readiness query finishes before the database connection closes',async()=>{
 const f=fixture(),Base=f.lib.Client;let settled=false;
 f.lib.Client=class extends Base{
  async query(sql){const result=await super.query(sql);if(sql.includes('sender_connection_checked')){await new Promise(resolve=>setTimeout(resolve,10));settled=true;}return result;}
  async end(){assert.equal(settled,true,'closed database while readiness query was in flight');return super.end();}
 };
 assert.equal((await run(f.context,f.lib,f.connect)).state,'ready');
});
test('ready senders and overlapping checks do not open provider connections',async()=>{
 const ready=fixture();ready.binding.state='ready';assert.equal((await run(ready.context,ready.lib,ready.connect)).state,'idle');assert(!ready.seen.includes('provider_connect'));
 for(const state of ['disabled','disconnected','reconnect_required']){const f=fixture();f.binding.state=state;assert.equal((await run(f.context,f.lib,f.connect)).state,'idle');assert(!f.seen.includes('smtp'));}
 const busy=fixture(),Base=busy.lib.Client;busy.lib.Client=class extends Base{async query(sql){return sql.includes('pg_try_advisory_lock')?{rows:[{locked:false}]}:super.query(sql);}};
 assert.equal((await run(busy.context,busy.lib,busy.connect)).state,'busy');assert(!busy.seen.includes('smtp'));assert.equal(busy.seen.at(-1),'db_end');
});
test('routine SMTP refresh checks both connections and uses stable-version persistence',async()=>{const f=fixture();f.binding.state='ready';f.binding.checked_at=new Date(Date.now()-13*3600000).toISOString();await run(f.context,f.lib,f.connect);assert(f.seen.includes('provider_connect'));assert(f.seen.some(q=>q.includes('sender_connection_refreshed')&&q.includes('"inbox_credential_ref":"imap"')));});
