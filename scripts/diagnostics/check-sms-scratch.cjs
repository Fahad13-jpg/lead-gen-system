'use strict';
// Real SQL/transactions and signed callbacks; mocked strategy/model and provider.
// All business/schema changes are rolled back. No external provider calls.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
async function run(pool){
 const client=await pool.connect(),keyfile='.local/sms-scratch-test.key';fs.writeFileSync(keyfile,crypto.randomBytes(32));
 try{
  await client.query('BEGIN');const migration=fs.readFileSync('database/migrations/063_android_sms.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await client.query(migration);
  const rt=require('../lead-strategy/runtime.cjs'),native=require('../lead-strategy/v2/native.cjs'),contract=require('../lead-strategy/v2/contract.cjs');
  const config=rt.campaign({org_id:1,config:{name:'ROLLBACK ONLY SMS',mode:'ai',channels:['sms'],sequence:[{channel:'sms',delay_days:0}],timezone:'UTC',sender:{name:'Test',company:'Studio'},offer:{name:'Websites',description:'Business website design.',approved_points:['We build clear business websites.']},cta:{text:'Open to a quick chat?'}}}).config;
  const campaign=(await client.query('INSERT INTO strategy_campaigns(org_id) VALUES(1) RETURNING id')).rows[0].id;await client.query('INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(1,$1,1,$2)',[campaign,config]);
  await client.query("UPDATE cleaned_leads SET phone='+923001234567' WHERE org_id=1 AND id=493");
  const context=(await client.query('SELECT strategy_context(1,$1,493) AS context',[campaign])).rows[0].context;assert(context);assert.equal(context.suppressed,false);assert.equal(context.replied,false);
  const job=(await client.query("INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status) VALUES(1,$1,1,493,$2,'completed') RETURNING id",[campaign,'sms-rollback-'+crypto.randomUUID()])).rows[0].id;
  const p=native.prepare({id:Number(job),org_id:1,lease:'MOCK_ONLY',input:context},{hasKey:true}),output=contract.template(p.prepared),result=native.assemble(p,{statusCode:200,body:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}});assert.equal(result.plan.state,'ai_completed');assert(result.plan.artifacts.sms_draft);
  const plan=(await client.query('INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(1,$1,$2,1,493,$3,$4,md5($3::jsonb::text),now()+interval \'1 day\') RETURNING id,content_hash',[job,campaign,result.plan,context.fingerprint])).rows[0];
  await client.query("INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,$1,'approve','rollback-test',$2)",[plan.id,plan.content_hash]);
  const vault=require('../sms/provider.cjs').vault(keyfile),secret={username:'MOCK_ONLY',password:'MOCK_ONLY',signing_key:'test-signing-key-only'},cipher=vault.seal(1,'mock-device',secret);
  await client.query("INSERT INTO sms_connections(org_id,device_id,sender_phone,sim_number,secrets,state,slot,callback_id,heartbeat_at,callback_verified_at,checked_at,daily_limit,daily_segment_limit) VALUES(1,'mock-device','+923175153405',1,$1,'ready',$2,$3,now(),now(),now(),1,2)",[cipher,{timezone:'UTC',start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},'a'.repeat(32)]);
  const transaction=fn=>fn(client),store=require('../sms/store.cjs').store({pool:client,transaction}),release={plan_id:Number(plan.id),content_hash:plan.content_hash,connection_version:1,consent_ref:'Rollback-only permission fixture',consent_expires_at:new Date(Date.now()+3600000).toISOString()};
  const r=await store.release(1,'fixture',release);assert(r.released);const repeated=await store.release(1,'fixture',release);assert.equal(repeated.dispatch_id,r.dispatch_id);assert(repeated.already_recorded);
  await client.query("UPDATE cleaned_leads SET phone='+923001234568' WHERE org_id=1 AND id=494");
  const context2=(await client.query('SELECT strategy_context(1,$1,494) AS context',[campaign])).rows[0].context;
  const job2=(await client.query("INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status) VALUES(1,$1,1,494,$2,'completed') RETURNING id",[campaign,'sms-rollback-'+crypto.randomUUID()])).rows[0].id;
  const p2=native.prepare({id:Number(job2),org_id:1,lease:'MOCK_ONLY',input:context2},{hasKey:true}),out2=contract.template(p2.prepared),result2=native.assemble(p2,{statusCode:200,body:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(out2)}}]}});
  const plan2=(await client.query('INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(1,$1,$2,1,494,$3,$4,md5($3::jsonb::text),now()+interval \'1 day\') RETURNING id,content_hash',[job2,campaign,result2.plan,context2.fingerprint])).rows[0];
  await client.query("INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,$1,'approve','rollback-test',$2)",[plan2.id,plan2.content_hash]);
  const second=await store.release(1,'fixture',{...release,plan_id:Number(plan2.id),content_hash:plan2.content_hash});
  const candidate=(await store.candidate())[0],admitted=await store.admit(candidate.id);assert(admitted);assert.equal(await store.admit(candidate.id),null);await store.outcome(candidate.id,'accepted','Pending');
  const signature=body=>{const raw=Buffer.from(JSON.stringify(body)),timestamp=String(Math.floor(Date.now()/1000));return{raw,headers:{'x-timestamp':timestamp,'x-signature':crypto.createHmac('sha256',secret.signing_key).update(raw).update(timestamp).digest('hex')}};};
  const handle=require('../sms/events.cjs').events({pool:client,transaction,vault});
  const unknown=signature({deviceId:'mock-device',event:'sms:received',id:'unknown-personal',payload:{sender:'+923111111111',simNumber:1,message:'Unrelated personal text',messageId:'personal'}});assert((await handle('a'.repeat(32),unknown.raw,unknown.headers)).ignored);assert.equal((await client.query('SELECT count(*)::int n FROM sms_events')).rows[0].n,0);
  const reply=signature({deviceId:'mock-device',event:'sms:received',id:'known-stop',payload:{sender:'+923001234567',simNumber:1,message:'STOP',messageId:'reply-one'}});assert((await handle('a'.repeat(32),reply.raw,reply.headers)).recorded);assert((await handle('a'.repeat(32),reply.raw,reply.headers)).duplicate);
  assert.equal((await client.query('SELECT state FROM sms_dispatches WHERE id=$1',[candidate.id])).rows[0].state,'opt_out');assert.equal((await client.query('SELECT kind FROM sms_stops WHERE org_id=1')).rows[0].kind,'opt_out');assert((await client.query('SELECT replied_at FROM outreach_activities WHERE id=$1',[admitted.activity_id])).rows[0].replied_at);
  await client.query('UPDATE sms_connections SET last_attempt_at=NULL WHERE org_id=1');assert.equal(await store.admit(second.dispatch_id),null,'Rolling quota must block a second message');await client.query('UPDATE sms_connections SET daily_limit=2,daily_segment_limit=4 WHERE org_id=1');assert(await store.admit(second.dispatch_id),'A second eligible recipient fits the increased test-only allowance');
  await assert.rejects(require('../sms/store.cjs').plan(client,2,Number(plan.id)),/SMS_PLAN_NOT_READY/);
  return{scratch_checks_passed:true,duplicate_release_deduplicated:true,rolling_quota_enforced:true,unknown_personal_sms_discarded:true,stop_persisted:true,org_isolation:true,provider_calls:0,model_calls:0};
 }finally{await client.query('ROLLBACK');client.release();fs.unlinkSync(keyfile);}
}
if(require.main===module){const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});run(pool).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error((e.code||'CHECK_FAILED')+': '+e.message?.slice(0,180));process.exitCode=1;}).finally(()=>pool.end());}module.exports={run};
