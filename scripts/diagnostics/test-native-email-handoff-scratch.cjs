'use strict';
// One focused integration slice: native saved draft -> approval -> SQL lease ->
// executor -> simulated receipt. No real provider and no live database access.
const cp=require('node:child_process'),fs=require('node:fs'),readline=require('node:readline'),assert=require('node:assert/strict');
const native=require('../lead-strategy/v2/native.cjs'),rt=require('../lead-strategy/runtime.cjs'),executor=require('../lead-strategy/v2/email-executor.cjs');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
const quote=x=>"'"+JSON.stringify(x).replace(/'/g,"''")+"'::jsonb";
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:60000,maxBuffer:1e6});assert.equal(r.status,0,'SCRATCH_COMMAND_FAILED');return r.stdout.trim();}
async function main(){
 assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');const wasRunning=docker(['inspect',container,'--format','{{.State.Running}}'])==='true';docker(['start',container]);
 let child,timer;
 try{
  let ready=false;for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore',timeout:5000}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert(ready);
  child=cp.spawn('docker',['exec','-i',container,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database]);let pending,serial=0,errors='';
  child.stderr.on('data',b=>{errors+=b.toString();});readline.createInterface({input:child.stdout}).on('line',line=>{if(!pending)return;if(line===pending.marker){const p=pending;pending=null;p.resolve(p.lines);}else pending.lines.push(line);});child.on('exit',code=>{if(pending){pending.reject(Error('SCRATCH_SQL_FAILED:'+code+':'+errors.slice(0,900)));pending=null;}});
  const sql=q=>new Promise((resolve,reject)=>{assert(!pending);const marker='NATIVE_EMAIL_HANDOFF_'+ ++serial;pending={resolve,reject,marker,lines:[]};child.stdin.write(q+'\n\\echo '+marker+'\n');});
  const json=async q=>JSON.parse((await sql(q)).join('\n'));timer=setTimeout(()=>child.kill(),90000);
  await sql('BEGIN;');
  for(const file of ['054_strategy_approval_integrity.sql','055_email_native_transport_gate.sql'])await sql(fs.readFileSync('database/migrations/'+file,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
  const aiBefore=await json('SELECT count(*)::integer FROM strategy_ai_requests;');
  await sql(`UPDATE strategy_jobs SET status='failed' WHERE status IN ('pending','processing');UPDATE strategy_controls SET enabled=true WHERE id;
   UPDATE cleaned_leads SET email='scratch.recipient@native.test' WHERE org_id=1 AND id=167;
   CREATE OR REPLACE FUNCTION outreach_email_eligibility(x jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{"allowed":true,"classification":"MOCK_FIXTURE_ONLY"}'::jsonb$$;
   CREATE OR REPLACE FUNCTION outreach_email_contact_gate(p_org integer,p_lead integer,recipient text,sender text) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{"allowed":true,"reason":"MOCK_CONTACT_HISTORY_ONLY"}'::jsonb$$;`);
  const config=rt.campaign({org_id:1,config:{name:'SCRATCH native email handoff',mode:'template',channels:['email'],sender:{name:'Fixture sender',company:'Fixture Studio'},offer:{name:'Website demo',description:'Labelled scratch demonstration.',approved_points:['The demo presents services.']},cta:{text:'Would you like a demo?'},timezone:'UTC',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},email_verification_policy:'basic'}}).config;
  const sender={credential_ref:'NATIVE_SCRATCH_ONLY',email:'scratch.sender@native.test'};
  // Existing legacy binding seam only. Managed-sender ownership has its own
  // existing coverage; this slice does not claim a real sender is connected.
  config.email_dispatch={enabled:true,credential_ref:sender.credential_ref,sender_email:sender.email,daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300};
  const campaign=await json('SELECT strategy_campaign_save('+quote({org_id:1,config})+');');assert(campaign.campaign_id);
  const admitted=await json('SELECT strategy_enqueue('+quote({org_id:1,campaign_id:campaign.campaign_id,lead_id:167,request_id:'scratch-native-email-handoff-20261109'})+');');assert(admitted.job_id);
  const claims=await json("SELECT coalesce(json_agg(x),'[]'::json) FROM strategy_claim('native-email-handoff',1) x;");assert.equal(claims.length,1);
  const prepared=native.prepare(claims[0],{hasKey:false,draftReviewEnabled:true,briefOptions:{readinessSnapshot:{email:{status:'ready',reasons:[]}}}}),assembled=native.assemble(prepared,{gate:{reason:'template'}});
  assert.equal(assembled.plan.execution_authorized,false);assert.deepEqual(assembled.plan.blocking_reasons,[]);
  const saved=await json('SELECT strategy_finish('+quote(assembled)+');');assert(saved.saved);
  const identity={org_id:1,plan_id:Number(saved.plan_id),content_hash:saved.content_hash,step:1};
  const approval=await json('SELECT strategy_approval('+quote({...identity,action:'approve',actor:'SCRATCH operator'})+');');assert.equal(approval.approved_content,true);assert.equal(approval.execution_authorized,false);
  const stored=await json('SELECT jsonb_build_object(\'body\',body,\'hash\',content_hash) FROM strategy_plans WHERE org_id=1 AND id='+identity.plan_id+';');
  const row={org_id:1,plan_id:identity.plan_id,email:'scratch.recipient@native.test',content_hash:stored.hash,body:stored.body};
  const reserve=await json('SELECT outreach_email_step_reserve('+quote(identity)+');');assert.equal(reserve.reserved,true,JSON.stringify(reserve));
  let sends=0;const dependencies={sender,executeQuery:query=>json(query+';'),transport:async()=>{sends++;return{id:'abcdef1234567890'};}};
  const outcome=await executor.execute(row,reserve.lease,dependencies,{enabled:true});assert.equal(outcome.provider_accepted,true,JSON.stringify(outcome));assert.equal(outcome.delivered,false);assert.equal(sends,1);
  const replay=await executor.execute(row,reserve.lease,dependencies,{enabled:true});assert.notEqual(replay.provider_accepted,true);assert.equal(sends,1,'duplicate transport');
  const revoke=await json('SELECT strategy_approval('+quote({...identity,action:'revoke',actor:'SCRATCH operator'})+');');assert.equal(revoke.http_status,200);assert.equal(revoke.approved_content,false);assert.equal(revoke.execution_authorized,false);
  const blocked=await json('SELECT outreach_email_step_check('+quote({...identity,step:2})+');');assert.equal(blocked.ready,false);assert.equal(blocked.reason,'approval_required');
  const after=await json('SELECT jsonb_build_object(\'body\',body,\'hash\',content_hash) FROM strategy_plans WHERE org_id=1 AND id='+identity.plan_id+';');assert.deepEqual(after,stored,'approved plan body/hash changed');assert.equal(await json('SELECT count(*)::integer FROM strategy_ai_requests;'),aiBefore);
  await sql('ROLLBACK;');
  const result={passed:true,database,rolled_back:true,plan_execution_marker_remained_false:true,approved_plan_unchanged:true,one_mock_provider_acceptance:true,duplicate_transport_blocked:true,revocation_blocks_subsequent_step:true,model_calls:0,real_provider_calls:0,outreach_sent:0,mocked_boundaries:['contact readiness','email eligibility','contact history','provider transport'],unverified:['real sender/provider behavior','real recipient eligibility','inbox delivery','live scheduled native campaign']};
  fs.mkdirSync('.local/native-email-handoff-20261109',{recursive:true});fs.writeFileSync('.local/native-email-handoff-20261109/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{clearTimeout(timer);if(child&&child.exitCode===null)child.stdin.end('ROLLBACK;\n');if(!wasRunning)docker(['stop',container]);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
