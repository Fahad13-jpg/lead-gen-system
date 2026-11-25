'use strict';
// Existing network-isolated scratch DB only. All row changes roll back; sequences may advance.
const cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict'),fs=require('node:fs');
const native=require('../lead-strategy/v2/native.cjs');
const runtime=require('../lead-strategy/runtime.cjs');
const reviewGate=process.argv.includes('--review-gate');
let dispatchResult=null;
if(process.argv.includes('--dispatch'))assert(reviewGate&&process.argv.includes('--latest-email'),'Dispatch tests require --review-gate --latest-email');
const sample=require('../../documentation/strategy-contract-v2/customer-template-preview-example.json');
const container='lead_diag_pg_20261011',db=process.argv.includes('--latest-email')?'scratch_email_release_20261019':'scratch_strategy_v2_20261012';
const inspect=cp.spawnSync('docker',['inspect',container],{encoding:'utf8'});
assert.equal(inspect.status,0,'Scratch inspect failed');
const info=JSON.parse(inspect.stdout)[0];assert.equal(info.Name,'/'+container);assert.equal(info.HostConfig.NetworkMode,'none');assert(info.State.Running);
const child=cp.spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db]);
let pending,serial=0,errors='';child.stderr.on('data',b=>{errors+=b.toString();});
readline.createInterface({input:child.stdout}).on('line',line=>{if(!pending)return;if(line===pending.marker){const p=pending;pending=null;p.resolve(p.lines);}else pending.lines.push(line);});
child.on('exit',code=>{if(pending){pending.reject(Error('Scratch SQL stopped ('+code+'): '+errors.slice(0,500)));pending=null;}});
function sql(query){return new Promise((resolve,reject)=>{assert(!pending);const marker='CUSTOMER_TEST_END_'+(++serial);pending={resolve,reject,marker,lines:[]};child.stdin.write(query+'\n\\echo '+marker+'\n');});}
const quote=value=>"'"+JSON.stringify(value).replace(/'/g,"''")+"'::jsonb";
async function json(query){return JSON.parse((await sql(query)).join('\n'));}
async function run(){
 await sql('BEGIN;');
 if(process.argv.includes('--latest-email')){
  // This snapshot lacks the older scratch role's table grants. Test-only grants
  // stay inside this transaction and do not represent a live permissions audit.
  await sql('GRANT SELECT ON ALL TABLES IN SCHEMA public TO v2_scratch_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_scratch_runtime; GRANT INSERT,UPDATE ON strategy_campaigns,strategy_campaign_versions,strategy_ai_controls,strategy_ai_requests,strategy_jobs,strategy_plans,strategy_approvals,strategy_controls,cleaned_leads TO v2_scratch_runtime;');
  await sql('GRANT UPDATE(id) ON organizations TO v2_scratch_runtime;'); // enqueue locks its org row
 }
 if(reviewGate){
  const migration=fs.readFileSync('database/migrations/032_customer_content_approval.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
  await sql(migration); // DDL also rolls back at the end of this single session.
 }
 await sql('SET LOCAL ROLE v2_scratch_runtime;');
 if(process.argv.includes('--basic-policy')){
  await sql('RESET ROLE;');
  await sql(fs.readFileSync('database/migrations/033_optional_email_verification.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
  if(process.argv.includes('--legacy-evidence'))await sql(fs.readFileSync('database/migrations/034_email_evidence_compatibility.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
  await sql('GRANT INSERT,UPDATE ON lead_contacts TO v2_scratch_runtime; SET LOCAL ROLE v2_scratch_runtime;');
  await sql(fs.readFileSync('tests/lead-strategy/optional-email-verification.sql','utf8'));
  if(process.argv.includes('--legacy-evidence'))await sql(fs.readFileSync('tests/lead-strategy/legacy-email-evidence.sql','utf8'));
  console.log('PASS optional email policy: basic/strict, provenance, invalid/risky, tenant, recipient, old evidence, malformed JSON and format checks (scratch only).');
 }
 if(process.argv.includes('--latest-email')){
  const workflow=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
  await sql('EXPLAIN '+workflow.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters.query+';');
 }
 if(process.argv.includes('--sender-connections')){
  await sql('RESET ROLE;');
  await sql(fs.readFileSync('database/migrations/035_sender_connections.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
  await sql('GRANT SELECT,INSERT,UPDATE,DELETE ON org_sender_memberships,sender_connections TO v2_scratch_runtime; GRANT EXECUTE ON FUNCTION sender_connection_manage(integer,text,jsonb),sender_connection_checked(integer,text,integer,jsonb),sender_connection_gate(integer,jsonb),sender_connection_bind(integer,text,text,bigint,integer) TO v2_scratch_runtime; SET LOCAL ROLE v2_scratch_runtime;');
  await sql(fs.readFileSync('tests/lead-strategy/sender-connections.sql','utf8'));
  if(process.argv.includes('--smtp-receipts')){
   await sql('RESET ROLE;');
   await sql(fs.readFileSync('database/migrations/036_smtp_receipts.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
   await sql('GRANT EXECUTE ON FUNCTION outreach_smtp_begin(jsonb),sender_connection_smtp_gate(integer,jsonb),outreach_smtp_finish(jsonb),outreach_imap_scan_finish(jsonb) TO v2_scratch_runtime; SET LOCAL ROLE v2_scratch_runtime;');
  }
  console.log('PASS sender registry: identity, membership, privacy, version, limits, health, disconnect, stale check and legacy protection (scratch only).');
 }
 assert.equal((await sql('SELECT rolsuper FROM pg_roles WHERE rolname=current_user;'))[0],'f');
 const before=await json('SELECT jsonb_build_object(\'requests\',(SELECT count(*) FROM strategy_ai_requests),\'controls\',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_ai_controls c));');
 await sql("UPDATE strategy_jobs SET status='failed' WHERE status IN ('pending','processing'); UPDATE strategy_controls SET enabled=true; UPDATE cleaned_leads SET email='owned-test@example.org' WHERE org_id=1 AND id=167;");
 const config=runtime.campaign({org_id:1,config:{...sample.input.campaign.config,name:'Scratch customer template routing',expiry_days:7}}).config;
 const campaign=await json('SELECT strategy_campaign_save('+quote({org_id:1,config})+');');assert(campaign.campaign_id,JSON.stringify(campaign));
 const job=await json('SELECT strategy_enqueue('+quote({org_id:1,campaign_id:campaign.campaign_id,lead_id:167,request_id:'scratch-customer-route'})+');');assert(job.job_id,JSON.stringify(job));
 const claim=await json("SELECT value FROM strategy_claim('scratch-customer',1) value;");assert.equal(claim.id,job.job_id);
 const prepared=native.prepare(claim,{hasKey:true});assert.equal(prepared.wants_ai,false);
 const gate=await json('SELECT strategy_ai_gate('+quote(prepared)+');');assert.equal(gate.allowed,false);assert.equal(gate.reason,'template_or_insufficient_evidence');
 const payload=native.assemble(prepared,{gate});
 const foreign=await json('SELECT strategy_finish('+quote({...payload,org_id:999999})+');');assert.equal(foreign.saved,false);
 const stale=await json('SELECT strategy_finish('+quote({...payload,lease:'invalid'})+');');assert.equal(stale.reason,'stale_lease');
 const saved=await json('SELECT strategy_finish('+quote(payload)+');');assert.equal(saved.saved,true,JSON.stringify(saved));
 const stored=await json('SELECT jsonb_build_object(\'body\',body,\'hash_ok\',content_hash=md5(body::text)) FROM strategy_plans WHERE id='+Number(saved.plan_id)+';');
 assert.equal(stored.hash_ok,true);assert.deepEqual(stored.body,payload.plan);
 const replay=await json('SELECT strategy_finish('+quote(payload)+');');assert.equal(replay.replayed,true);
 const approvalInput={org_id:1,plan_id:saved.plan_id,action:'approve',actor:'scratch test',content_hash:saved.content_hash};
 const approve=p=>json('SELECT strategy_approval('+quote(p)+');');
 const approval=await approve(approvalInput);assert.equal(approval.error,reviewGate?'CUSTOMER_CONTENT_ACK_REQUIRED':'PLAN_NEEDS_CORRECTION');
 if(reviewGate){
  for(const extra of [{acknowledge_customer_content:true},{acknowledge_customer_content:'true',acknowledge_customer_content_hash:saved.content_hash},{acknowledge_customer_content:true,acknowledge_customer_content_hash:'wrong'}]){
   assert.equal((await approve({...approvalInput,...extra})).error,'CUSTOMER_CONTENT_ACK_REQUIRED');
  }
  const acknowledged={...approvalInput,acknowledge_customer_content:true,acknowledge_customer_content_hash:saved.content_hash};
  assert.equal((await approve(acknowledged)).error,'PLAN_NEEDS_CORRECTION');
  assert.equal((await approve({...acknowledged,org_id:999999})).error,'NOT_FOUND');
  assert.equal((await approve({...acknowledged,content_hash:'wrong'})).error,'CONTENT_CHANGED');
  // Exercise the server-enabled draft path; the live flag remains unset.
  const fixture=require('../organization-policy/customer-plan.cjs').build(claim,{integrationEnabled:true}).plan;
  // Re-read JSONB in PostgreSQL key order and validate customer content locally.
  const validator=require('../organization-policy/customer-execution.cjs');
  assert.equal(validator.validate({org_id:claim.org_id,plan_id:saved.plan_id,lead_id:claim.input.lead.id,email:claim.input.lead.email,body:{...stored.body,blocking_reasons:[]},strategy_context:claim.input}).content_valid,true);
  async function replaceBody(body){return (await sql('UPDATE strategy_plans SET body='+quote(body)+',content_hash=md5(('+quote(body)+')::text) WHERE id='+Number(saved.plan_id)+' RETURNING content_hash;'))[0];}
  let h=await replaceBody(fixture);
  assert.equal((await approve({...approvalInput,content_hash:h,acknowledge_customer_content:true,acknowledge_customer_content_hash:saved.content_hash})).error,'CUSTOMER_CONTENT_ACK_REQUIRED');
  const request={...approvalInput,content_hash:h,acknowledge_customer_content:true,acknowledge_customer_content_hash:h};
  const accepted=await approve(request);assert.equal(accepted.approved_content,true);assert.equal(accepted.execution_authorized,false);
  if(process.argv.includes('--dispatch'))dispatchResult=await require('./customer-dispatch-scratch.cjs')({sql,json,quote,claim,fixture,saved:{...saved,content_hash:h},config});
  assert.equal((await approve({...approvalInput,action:'revoke',content_hash:h})).approved_content,false);
  await sql('UPDATE strategy_plans SET expires_at=now()-interval \'1 second\' WHERE id='+Number(saved.plan_id)+';');
  assert.equal((await approve(request)).error,'STALE_PLAN');
  await sql('UPDATE strategy_plans SET expires_at=now()+interval \'1 day\' WHERE id='+Number(saved.plan_id)+';');
  const bad={...fixture,customer_review:{...fixture.customer_review,claim_provenance:'verified'}};h=await replaceBody(bad);
  assert.equal((await approve({...request,content_hash:h,acknowledge_customer_content_hash:h})).error,'INVALID_CUSTOMER_REVIEW');
  // Existing fallback acknowledgement remains independently required.
  const fallback={...fixture,state:'template_fallback',validation_profile:undefined,customer_review:undefined,generation:{...fixture.generation,source:undefined},fallback_acknowledgement_required:true};h=await replaceBody(fallback);
  const fallbackRequest={...approvalInput,content_hash:h};
  assert.equal((await approve(fallbackRequest)).error,'FALLBACK_ACK_REQUIRED');
  assert.equal((await approve({...fallbackRequest,acknowledge_fallback:true,acknowledge_fallback_hash:h})).approved_content,true);
 }
 const after=await json('SELECT jsonb_build_object(\'requests\',(SELECT count(*) FROM strategy_ai_requests),\'controls\',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_ai_controls c));');
 assert.equal(after.requests,before.requests);
 // Existing campaign_save creates a disabled zero-allowance control if absent.
 const oldControls=before.controls||[];
 for(const control of oldControls)assert.deepEqual(after.controls.find(c=>c.org_id===control.org_id),control);
 for(const control of after.controls||[])if(!oldControls.some(c=>c.org_id===control.org_id))assert.deepEqual(control,{org_id:1,enabled:false,monthly_limit:0});
 await sql('ROLLBACK;');child.stdin.end();
 if(dispatchResult)console.log(JSON.stringify({dispatch:dispatchResult,all_changes_rolled_back:true}));
 console.log(JSON.stringify({database:db,container,review_gate_tested:reviewGate,passed:['non-superuser runtime','real normalized campaign/claim/context','template AI gate no reservation','cross-org denied','stale lease denied','exact body persisted','database hash','replay idempotence','approval blocker retained','AI ledger unchanged and no allowance increase','transaction rolled back'],review_checks:reviewGate?'missing/wrong/string acknowledgements, blockers, cross-org, hash change, explicit approval without sending authority, revoke, expiry, invalid provenance, existing fallback gate':'not requested',deployment:false}));
}
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;console.error('Scratch test timeout; connection closure rolls back.');},60000);
run().catch(e=>{console.error(e.message);process.exitCode=1;child.stdin.end('ROLLBACK;\n');}).finally(()=>clearTimeout(timeout));
