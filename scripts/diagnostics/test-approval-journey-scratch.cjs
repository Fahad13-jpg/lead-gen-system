'use strict';
// Existing network-none scratch target. Everything, including function DDL,
// rolls back. Uses templates/mocked readiness, never a model or an executor.
const cp=require('node:child_process'),fs=require('node:fs'),readline=require('node:readline'),assert=require('node:assert/strict');
const {approvalLoader,approvalService}=require('../dashboard/approval.cjs'),native=require('../lead-strategy/v2/native.cjs'),rt=require('../lead-strategy/runtime.cjs');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
const nativeRelease=process.argv.includes('--native-release');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:60000,maxBuffer:1e6});if(r.status!==0)throw Error('SCRATCH_COMMAND_UNCONFIRMED');return r.stdout.trim();}
const quote=x=>"'"+JSON.stringify(x).replace(/'/g,"''")+"'::jsonb";
async function main(){assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');docker(['start',container]);
 let ready=false;for(let i=0;i<40;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert(ready);
 const child=cp.spawn('docker',['exec','-i',container,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database]);let pending,serial=0,errors='';
 child.stderr.on('data',b=>{errors+=b.toString();});
 readline.createInterface({input:child.stdout}).on('line',line=>{if(!pending)return;if(line===pending.marker){const p=pending;pending=null;p.resolve(p.lines);}else pending.lines.push(line);});
 child.on('exit',code=>{if(pending){pending.reject(Error('SCRATCH_SQL_FAILED:'+code+':'+errors.slice(0,600)));pending=null;}});
 const sql=q=>new Promise((resolve,reject)=>{assert(!pending);const marker='APPROVAL_JOURNEY_'+ ++serial;pending={resolve,reject,marker,lines:[]};child.stdin.write(q+'\n\\echo '+marker+'\n');});
 const json=async q=>JSON.parse((await sql(q)).join('\n'));
 const pool={query:async q=>({rows:await json('SELECT coalesce(json_agg(row_to_json(x)),\'[]\'::json) FROM ('+q.replace(/;\s*$/,'')+') x;')})};
 const report={database,scope:'Scratch rows and mocked email readiness; not live sending eligibility',native_release_tested:nativeRelease,provider_calls:0,model_calls:0,outreach_sent:0,migration_live_applied:false,checks:[]};
 const timer=setTimeout(()=>{child.kill();},90000);
 try{
  await sql('BEGIN;');
  const counts=()=>json("SELECT json_build_object('requests',(SELECT count(*) FROM strategy_ai_requests),'activities',(SELECT count(*) FROM outreach_activities));");const before=await counts();
  await sql("UPDATE strategy_jobs SET status='failed' WHERE status IN ('pending','processing');UPDATE strategy_controls SET enabled=true WHERE id;");
  const config=rt.campaign({org_id:1,config:{name:'SCRATCH approval journey',mode:'template',channels:['email'],sender:{name:'Scratch sender',company:'Example Studio'},offer:{name:'Website demonstration',description:'An explicitly labelled scratch demonstration.',approved_points:['The demonstration presents services.'],prohibited_claims:['guaranteed revenue']},cta:{text:'Would you like a demonstration?'},timezone:'Asia/Karachi',email_verification_policy:'basic'}}).config;
  const campaign=await json('SELECT strategy_campaign_save('+quote({org_id:1,config})+');');assert(campaign.campaign_id);
  const admitted=await json('SELECT strategy_enqueue('+quote({org_id:1,campaign_id:campaign.campaign_id,lead_id:167,request_id:'scratch-approval-journey-20261109'})+');');assert(admitted.job_id);
  const claims=await json("SELECT coalesce(json_agg(x),'[]'::json) FROM strategy_claim('scratch-approval-journey',1) x;");assert.equal(claims.length,1);const claim=claims[0];assert.equal(Number(claim.id),Number(admitted.job_id));
  // Override contact readiness solely for this fixture; never change a real
  // contact or represent this as a provider-verified or send-eligible lead.
  const p=native.prepare(claim,{hasKey:false,briefOptions:{readinessSnapshot:{email:{status:'ready',reasons:[]}}}});
  const offline=native.assemble(p,{gate:{allowed:false,reason:'template'}});assert(offline.plan.blocking_reasons.includes('v2_offline_only'));
  const assembled=nativeRelease?native.assemble(native.prepare(claim,{hasKey:false,draftReviewEnabled:true,briefOptions:{readinessSnapshot:{email:{status:'ready',reasons:[]}}}}),{gate:{allowed:false,reason:'template'}}):offline;assert.equal(assembled.plan.state,'template_completed');assert(assembled.plan.artifacts.email_draft);
  if(nativeRelease){assert.deepEqual(assembled.plan.blocking_reasons,[]);assert(assembled.plan.draft_review_release);report.checks.push('native boundary produces reviewable draft; pure builder remains offline');
   await sql("UPDATE strategy_jobs SET lease_until=now()-interval '1 second' WHERE id="+Number(claim.id)+';');assert.equal((await json('SELECT strategy_finish('+quote(assembled)+');')).reason,'stale_lease');await sql("UPDATE strategy_jobs SET lease_until=now()+interval '5 minutes' WHERE id="+Number(claim.id)+';');report.checks.push('expired native claim cannot persist a draft');}
  const saved=await json('SELECT strategy_finish('+quote(assembled)+');');assert(saved.saved);
  let h=saved.content_hash;const plan=Number(saved.plan_id);
  const raw=payload=>json('SELECT strategy_approval('+quote({org_id:1,plan_id:plan,actor:'scratch-operator',content_hash:h,action:'approve',...payload})+');');
  if(nativeRelease){const first=await raw({});assert(first.approved_content&&!first.execution_authorized);report.checks.push('native-produced draft saves and approves without fixture gate removal');}
  else{assert.equal((await raw({})).error,'PLAN_NEEDS_CORRECTION');report.checks.push('actual offline blocker prevents approval');}
  const fixture=structuredClone(assembled.plan);if(!nativeRelease){fixture.blocking_reasons=[];delete fixture.content_hash;fixture.content_hash=require('../lead-strategy/v2/contract.cjs').hash(fixture);}
  const replace=async(body,recompute=true)=>{if(recompute){body=structuredClone(body);delete body.content_hash;body.content_hash=require('../lead-strategy/v2/contract.cjs').hash(body);}await sql('UPDATE strategy_plans SET body='+quote(body)+(recompute?',content_hash=md5(('+quote(body)+')::text)':'')+' WHERE id='+plan+';');h=(await sql('SELECT content_hash FROM strategy_plans WHERE id='+plan+';'))[0];};
  await replace(fixture);
  const tampered={...fixture,extra_scratch_marker:'tampered without updating hash'};await replace(tampered,false);report.baseline_tampered_body_accepted=(await raw({})).approved_content===true;
  await replace({...fixture,state:'unknown_state'});report.baseline_unknown_state_accepted=(await raw({})).approved_content===true;
  await replace({...fixture,state:'template_fallback',fallback_acknowledgement_required:true});report.baseline_string_fallback_ack_accepted=(await raw({acknowledge_fallback:'true',acknowledge_fallback_hash:h})).approved_content===true;
  // Apply only in this transaction; production SQL remains untouched.
  await sql(fs.readFileSync('database/migrations/054_strategy_approval_integrity.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
  await replace(tampered,false);assert.equal((await raw({})).error,'CONTENT_CHANGED');report.checks.push('SQL rejects tampered body under plan lock');
  await replace({...fixture,state:'unknown_state'});assert.equal((await raw({})).error,'PLAN_NEEDS_CORRECTION');report.checks.push('unknown plan state denied');
  await replace({...fixture,state:'template_fallback',fallback_acknowledgement_required:true});assert.equal((await raw({acknowledge_fallback:'true',acknowledge_fallback_hash:h})).error,'FALLBACK_ACK_REQUIRED');report.checks.push('string fallback acknowledgement denied');
  assert.equal((await raw({acknowledge_fallback:true,acknowledge_fallback_hash:'0'.repeat(32)})).error,'FALLBACK_ACK_REQUIRED');
  const fallback=await raw({acknowledge_fallback:true,acknowledge_fallback_hash:h});assert(fallback.approved_content&&!fallback.execution_authorized);report.checks.push('boolean fallback acknowledgement succeeds only for exact hash');
  const customer={...fixture,validation_profile:'customer_email_v1',generation:{...fixture.generation,source:'customer_supplied'},customer_review:{required:true,claim_provenance:'customer_supplied_not_independently_verified'}};
  await replace(customer);assert.equal((await raw({})).error,'CUSTOMER_CONTENT_ACK_REQUIRED');assert.equal((await raw({acknowledge_customer_content:'true',acknowledge_customer_content_hash:h})).error,'CUSTOMER_CONTENT_ACK_REQUIRED');
  const customerAccepted=await raw({acknowledge_customer_content:true,acknowledge_customer_content_hash:h});assert(customerAccepted.approved_content&&!customerAccepted.execution_authorized);report.checks.push('existing customer acknowledgement and provenance gates preserved');
  assert.equal((await raw({action:null})).error,'INVALID_APPROVAL');assert.equal((await raw({actor:'   '})).error,'INVALID_APPROVAL');report.checks.push('missing action and blank actor rejected without SQL exception');
  await replace(fixture);
  const calls=[];const service=approvalService({identity:{principal:async()=>({role:'owner',subject:'scratch-owner'})},load:approvalLoader(pool),transport:async(route,payload)=>{assert.equal(route,'strategy-approval');calls.push(payload);const body=await json('SELECT strategy_approval('+quote(payload)+');');return{status:body.http_status,body};}});
  const action=(kind,extra={})=>service('mock-authentication-not-a-customer-session',{org_id:1,plan_id:plan,action:kind,content_hash:h,...extra});
  let result=await action('approve');assert(result.recorded&&!result.execution_authorized);assert.equal(calls.at(-1).actor,'dashboard:scratch-owner');report.checks.push('gateway load, approve, authoritative hash and actor binding');
  await replace(tampered,false);const callsBefore=calls.length;await assert.rejects(action('approve'),/APPROVAL_PLAN_BLOCKED/);assert.equal(calls.length,callsBefore);await action('revoke');await replace(fixture);report.checks.push('gateway blocks changed body and permits safe revocation');
  await assert.rejects(action('approve',{content_hash:'0'.repeat(32)}),/APPROVAL_CONTENT_CHANGED/);assert.equal((await raw({org_id:2147483647})).error,'NOT_FOUND');report.checks.push('hash mismatch and cross-org denied');
  result=await action('revoke');assert(result.recorded&&!result.execution_authorized);report.checks.push('gateway revoke recorded without sending authority');
  await sql("UPDATE strategy_plans SET expires_at=now()-interval '1 second' WHERE id="+plan+';');await assert.rejects(action('approve'),/APPROVAL_PLAN_BLOCKED/);assert.equal((await raw({})).error,'STALE_PLAN');await action('revoke');report.checks.push('expiry blocks approval but preserves revocation');
  assert.deepEqual(await counts(),before);report.checks.push('AI request and outreach activity counts unchanged');
  await sql('ROLLBACK;');report.rolled_back=true;report.passed=true;
  const directory=nativeRelease?'.local/strategy-native-release-20261109':'.local/approval-journey-20261109';fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(directory+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{clearTimeout(timer);if(child.exitCode===null){child.stdin.end('ROLLBACK;\n');}}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000});});
