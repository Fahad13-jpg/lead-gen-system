'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../../scripts/sms/core.cjs'),native=require('../../scripts/lead-strategy/v2/native.cjs'),contract=require('../../scripts/lead-strategy/v2/contract.cjs'),rt=require('../../scripts/lead-strategy/runtime.cjs');
function input(){return{org_id:1,lead:{id:3,org_id:1,company_name:'Example shop',phone:'+923175153405'},campaign:{id:1,version:1,config:rt.campaign({org_id:1,config:{name:'SMS sample',mode:'ai',channels:['sms'],sequence:[{channel:'sms',delay_days:0}],timezone:'Asia/Karachi',sender:{name:'Fahad',company:'Studio'},offer:{name:'Websites',description:'Business website design.',approved_points:['We build clear business websites.']},cta:{text:'Open to a quick chat?'}}}).config},report:{trust:{conflicts:[],freshness:{},assessment_status:'assessed'}},suppressed:false,replied:false};}
test('SMS drafts are short channel-specific texts with early sender, one benefit, one question and opt-out',()=>{
 const p=native.prepare({id:1,org_id:1,lease:'mock',input:input()},{hasKey:true}),output=contract.template(p.prepared);
 const r=native.assemble(p,{statusCode:200,body:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}}),a=r.plan.artifacts.sms_draft;
 assert.equal(r.plan.state,'ai_completed');assert.deepEqual(r.plan.blocking_reasons,[]);assert.equal(a.message,'Hi, Fahad at Studio. We build clear business websites. Open to a quick chat? Reply STOP to opt out.');assert.equal(a.segments,1);assert(!a.message.includes('\n'));assert.equal(r.plan.approval_required,true);assert.equal(r.plan.execution_authorized,false);
 output.step1.parts.push({type:'observed',ref:'fake',text:'Your website says hello'});assert.equal(contract.validate(output,p.prepared).ok,false);
});
test('SMS layout puts trusted blocks in order without changing text or accepting extra claims',()=>{
 const p=native.prepare({id:2,org_id:1,lease:'mock',input:input()},{hasKey:true});
 const assemble=output=>native.assemble(p,{statusCode:200,body:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}});
 const reordered=contract.template(p.prepared);
 reordered.step1.parts=[reordered.step1.parts[2],reordered.step1.parts[0],reordered.step1.parts[1],reordered.step1.parts[3],reordered.step1.parts[4]];
 reordered.step1.parts.push({...reordered.step1.parts[0]});
 const accepted=assemble(reordered);
 assert.equal(accepted.plan.state,'ai_completed');
 assert.equal(accepted.plan.artifacts.sms_draft.message,'Hi, Fahad at Studio. We build clear business websites. Open to a quick chat? Reply STOP to opt out.');
 assert.equal(accepted.plan.generation.application_sms_layout.duplicate_parts_removed,1);
 const extra=contract.template(p.prepared);extra.step1.parts.push({type:'offer',ref:'unknown',text:'Unapproved benefit.'});
 assert.equal(assemble(extra).plan.state,'ai_failed');
 const missing=contract.template(p.prepared);missing.step1.parts=missing.step1.parts.filter(part=>part.ref!=='opt_out');
 assert.equal(assemble(missing).plan.state,'ai_failed');
});
test('segment accounting handles GSM extensions and Unicode surrogate pairs without treating characters as equal costs',()=>{
 assert.equal(core.segments('a'.repeat(160)).segments,1);assert.equal(core.segments('a'.repeat(161)).segments,2);assert.equal(core.segments('^'.repeat(80)).segments,1);assert.equal(core.segments('^'.repeat(81)).segments,2);assert.equal(core.segments('ا'.repeat(70)).segments,1);assert.equal(core.segments('ا'.repeat(71)).segments,2);assert.equal(core.segments('😀'.repeat(36)).segments,2);
});
test('sending slots use organization timezones and expire provider queues at the slot boundary',()=>{
 const s={timezone:'Asia/Karachi',start_hour:10,end_hour:11,weekdays:[1,2,3,4,5]};
 assert.equal(core.slot(s,Date.parse('2026-11-16T05:00:00Z')).active,true);assert.equal(core.slot(s,Date.parse('2026-11-16T06:00:00Z')).active,false);assert.equal(core.slot(s,Date.parse('2026-11-15T05:00:00Z')).active,false);assert.equal(core.slot(s,Date.parse('2026-11-16T05:59:45Z')).valid_until,'2026-11-16T06:00:00.000Z');assert.throws(()=>core.slot({...s,timezone:undefined}),/INVALID_SMS_SLOT/);
});
test('credential encryption binds organization/device and signed webhook verification rejects tampering and stale requests',()=>{
 const file=path.join(os.tmpdir(),'sms-test-'+crypto.randomUUID());fs.writeFileSync(file,crypto.randomBytes(32));try{const {vault,verify}=require('../../scripts/sms/provider.cjs'),v=vault(file),secret={password:'MOCK_ONLY'},sealed=v.seal(1,'device',secret);assert.deepEqual(v.open(1,'device',sealed),secret);assert.throws(()=>v.open(2,'device',sealed));
 const raw=Buffer.from('{"event":"system:ping"}'),time=String(Math.floor(Date.now()/1000)),sig=crypto.createHmac('sha256','mock-signing-key').update(raw).update(time).digest('hex');assert(verify('mock-signing-key',raw,time,sig));assert(!verify('mock-signing-key',Buffer.from('{}'),time,sig));assert(!verify('mock-signing-key',raw,time,sig,Date.now()+600000));}finally{fs.unlinkSync(file);}
});
test('worker never blindly repeats an uncertain provider submission and treats API acceptance as queued, not sent',async()=>{
 const {worker}=require('../../scripts/sms/worker.cjs');for(const ambiguous of [true,false]){let sent=0,state='queued';const history=[],d={id:1,org_id:1,device_id:'dev',sim_number:1,secrets:{},client_id:'mock',recipient:'+923175153405',message:'mock',valid_until:new Date(Date.now()+60000).toISOString()};
 const store={reconcile:async()=>[],candidate:async()=>state==='queued'?[d]:[],admit:async()=>{state='submitting';return d;},outcome:async(id,s)=>{state=s;history.push(s);}};
 const w=worker({store,vault:{open:()=>({})},provider:{device:async()=>({last_seen:new Date().toISOString()}),send:async()=>{sent++;if(ambiguous)throw Error('timeout');return{id:'mock'};}}});await w.tick();await w.tick();assert.equal(sent,1);assert.equal(state,ambiguous?'uncertain':'accepted');assert(!history.includes('sent'));
 }
});
test('provider transport fixes destination host, selected SIM and expiry, with no retry',async()=>{
 let calls=0;const p=require('../../scripts/sms/provider.cjs').provider({fetcher:async(url,r)=>{calls++;assert.equal(url,'https://api.sms-gate.app/3rdparty/v1/messages?deviceActiveWithin=1');assert.equal(r.redirect,'error');const body=JSON.parse(r.body);assert.equal(body.simNumber,2);assert.equal(body.validUntil,'2026-11-16T06:00:00Z');assert.deepEqual(body.phoneNumbers,['+923175153405']);return{ok:true,text:async()=>'{"id":"mock"}'};}});await p.send({username:'mock',password:'mock'},{id:'mock',deviceId:'dev',simNumber:2,recipient:'+923175153405',message:'Hi',validUntil:'2026-11-16T06:00:00Z'});assert.equal(calls,1);
});
module.exports={input};
