'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{service,input}=require('../../scripts/dashboard/calling-accounts.cjs');
const{provider,vault}=require('../../scripts/calling/account-provider.cjs');
const payload=()=>({org_id:7,request_id:'11111111-1111-4111-8111-111111111111',api_key:'private-key-test-only',agent_id:'agent_test',agent_version:1,from_number:'+14155550123',acknowledge_provider_billing:true});
function fixture(role='owner'){
 let row,calls=0,writes=0,principal={org_id:7,active:true,role};
 const db={async query(sql,args){if(sql.startsWith('INSERT')){writes++;row=Object.fromEntries(['org_id','request_id','key_fingerprint','agent_id','agent_version','from_number','secrets'].map((k,i)=>[k,args[i]]));row.state='pending_setup';row.checked_at='2026-11-16T00:00:00Z';return{rows:[]};}return{rows:sql.includes('FROM calling_accounts')&&row?[row]:[]};}};
 const api=service({identity:{principal:async()=>principal},pool:db,transaction:fn=>fn(db),provider:{verify:async()=>{calls++;}},vault:{seal:(org,secret)=>({encrypted:true,org})}});
 return{api,counts:()=>({calls,writes}),principal,get row(){return row;}};
}
test('unknown funding, credit, authority and invalid account fields cannot be supplied',()=>{
 for(const patch of [{funding:'platform'},{managed_balance:1000},{state:'ready'},{api_key:'x'},{agent_id:'../../secret'},{agent_version:-1},{from_number:'+923171234567'},{acknowledge_provider_billing:false}])assert.throws(()=>input({...payload(),...patch},true),/INVALID_FILTER/);
});
test('nonmembers and ordinary members cannot save keys or call provider',async()=>{
 for(const role of ['member','viewer']){const f=fixture(role);await assert.rejects(f.api.connect('t',payload()),/ROLE_REQUIRED/);assert.deepEqual(f.counts(),{calls:0,writes:0});}
 const f=fixture();f.principal.org_id=8;await assert.rejects(f.api.connect('t',payload()),/MEMBERSHIP_REQUIRED/);assert.deepEqual(f.counts(),{calls:0,writes:0});
});
test('connection stays paused, replay avoids remote reads and status never returns secrets',async()=>{
 const f=fixture();assert.equal((await f.api.connect('t',payload())).execution_authorized,false);assert.equal((await f.api.connect('t',payload())).replayed,true);assert.deepEqual(f.counts(),{calls:1,writes:1});assert.equal(f.row.state,'pending_setup');
 const r=await f.api.status('t',{org_id:'7'});assert.equal(r.managed.available,false);assert.equal(r.connection.agent_id,'agent_test');assert(!JSON.stringify(r).includes('private-key'));assert(!JSON.stringify(r).includes('fingerprint'));assert(!JSON.stringify(r).includes('secrets'));
 await assert.rejects(f.api.connect('t',{...payload(),api_key:'a-different-key-test'}),/CALLING_ACCOUNT_EXISTS/);assert.equal(f.counts().calls,1);
});
test('membership is rechecked after provider response before saving',async()=>{
 let calls=0,writes=0;const api=service({identity:{principal:async()=>({org_id:7,active:++calls===1,role:'owner'})},pool:{query:async()=>({rows:[]})},provider:{verify:async()=>{}},transaction:async()=>{writes++;}});
 await assert.rejects(api.connect('t',payload()),/MEMBERSHIP_REQUIRED/);assert.equal(writes,0);
});
test('provider adapter only reads exact published agent and optional number without redirects/retries',async()=>{
 const seen=[];const p=provider({fetcher:async(url,options)=>{seen.push({url,options});return{status:200,text:async()=>JSON.stringify(url.includes('get-agent')?{agent_id:'agent_test',version:1,is_published:true}:{phone_number:'+14155550123'})};}});
 await p.verify(payload());assert.equal(seen.length,2);assert(seen.every(x=>x.options.method==='GET'&&x.options.redirect==='error'));assert(seen[0].url.endsWith('/get-agent/agent_test?version=1'));assert(seen[1].url.endsWith('/get-phone-number/%2B14155550123'));
 for(const agent of [{agent_id:'agent_test',version:2,is_published:true},{agent_id:'agent_test',version:1,is_published:false}]){let n=0;await assert.rejects(provider({fetcher:async()=>{n++;return{status:200,text:async()=>JSON.stringify(agent)};}}).verify(payload()),/CALLING_ACCOUNT_NOT_VERIFIED/);assert.equal(n,1);}
 let attempts=0;await assert.rejects(provider({fetcher:async()=>{attempts++;throw Error('SECRET_PROVIDER_RESPONSE');}}).verify(payload()),/^Error: CALLING_ACCOUNT_NOT_VERIFIED$/);assert.equal(attempts,1);
});
test('credential ciphertext is randomized, authenticated and bound to its organization',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calling-vault-'));try{const file=path.join(dir,'key');fs.writeFileSync(file,require('node:crypto').randomBytes(32));const v=vault(file),a=v.seal(7,{api_key:'private'}),b=v.seal(7,{api_key:'private'});assert.notEqual(a.data,b.data);assert.deepEqual(v.open(7,a),{api_key:'private'});assert.throws(()=>v.open(8,a));assert.throws(()=>v.open(7,{...a,tag:Buffer.alloc(16).toString('base64')}));}finally{fs.rmSync(path.join(dir,'key'));fs.rmdirSync(dir);}
});


test('provider failures expose fixed actionable reasons without raw responses, keys or URLs',async()=>{
 for(const [status,number,reason] of [[401,false,'CALLING_API_KEY_REJECTED'],[404,false,'CALLING_AGENT_NOT_FOUND'],[404,true,'CALLING_NUMBER_NOT_FOUND'],[422,false,'CALLING_VERSION_NOT_AVAILABLE']]){
  const diagnostics=[];let calls=0;const p=provider({onDiagnostic:e=>diagnostics.push(e),fetcher:async()=>{calls++;return number&&calls===1?{status:200,text:async()=>JSON.stringify({agent_id:'agent_test',version:1,is_published:true})}:{status,text:async()=> 'PRIVATE_PROVIDER_DATA'};}});
  await assert.rejects(p.verify({...payload(),from_number:number?'+14155550123':null}),e=>e.message==='CALLING_ACCOUNT_NOT_VERIFIED'&&e.publicReason===reason);assert.equal(diagnostics.at(-1).reason,reason);assert(!JSON.stringify(diagnostics).includes('PRIVATE_PROVIDER_DATA'));assert(!JSON.stringify(diagnostics).includes('private-key-test-only'));
 }
});
