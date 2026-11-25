'use strict';
// Explicit user-supplied personal profile; no scraping, AI, approval or sending.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {localPool}=require('../dashboard/start-local-auth.cjs');
const rt=require('../lead-strategy/runtime.cjs'),native=require('../lead-strategy/v2/native.cjs');
const org=1,url='https://www.linkedin.com/in/muhammad-f56/',request='owned-linkedin-walkthrough-20261115';
const dir='.local/owned-linkedin-walkthrough-20261115';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/commit-attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=localPool({registryWrite:true}),db=await pool.connect();let open=false;
 try{
  await db.query('BEGIN');open=true;await db.query("SET LOCAL lock_timeout='5s'");
  const call=async(fn,p)=>(await db.query('SELECT '+fn+'($1::jsonb) AS result',[JSON.stringify(p)])).rows[0].result;
  await db.query('SELECT pg_advisory_xact_lock(727415,1)');
  assert.equal((await db.query('SELECT count(*)::int n FROM strategy_jobs WHERE org_id=1 AND request_id=$1',[request])).rows[0].n,0,'ALREADY_PREPARED');
  const controls=(await db.query('SELECT enabled FROM strategy_controls WHERE id FOR UPDATE')).rows[0];assert.equal(controls.enabled,true);
  assert.equal((await db.query("SELECT count(*)::int n FROM strategy_jobs WHERE status IN ('pending','processing')")).rows[0].n,0,'OTHER_JOBS_PRESENT');
  const before=(await db.query('SELECT count(*)::int n FROM strategy_ai_requests')).rows[0].n;
  const now=(await db.query('SELECT now() AS at')).rows[0].at.toISOString();
  const provenance={test_only:true,purpose:'no-send personal LinkedIn walkthrough',profile_url:url,source:'user_supplied_personal_test_profile',independent_verification:false,business_affiliation_claimed:false,recorded_at:now};
  const label='[TEST] Owner personal LinkedIn profile';
  const stage=(await db.query("INSERT INTO staging_leads(org_id,source,source_record_id,company_name,raw_data,cleaning_status,processing_status,processed) VALUES($1,'owned_account_test',$2,$3,$4::jsonb,'cleaned','completed',true) RETURNING id",[org,request,label,JSON.stringify(provenance)])).rows[0];
  const lead=(await db.query('INSERT INTO cleaned_leads(org_id,company_name,cleaning_metadata) VALUES($1,$2,$3::jsonb) RETURNING id',[org,label,JSON.stringify(provenance)])).rows[0];
  await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,$2,$3)',[stage.id,org,lead.id]);
  const who={kind:'person',profile_url:url,observed_at:now,provenance:'user_supplied_personal_test_profile',independent_verification:false,business_affiliation_claimed:false};
  const research={status:'customer_supplied_test_profile',observed_at:now,linkedin:{profiles:[who]},limitations:['The user supplied this as a personal test profile. No page was scraped, affiliation inferred or ownership independently verified.']};
  const fp=(await db.query("SELECT enrichment_fingerprint($1,$2,'research') AS value",[org,lead.id])).rows[0].value;
  research.input_fingerprint=fp;
  await db.query('INSERT INTO enrichment_profiles(org_id,lead_id,research,research_at) VALUES($1,$2,$3::jsonb,now())',[org,lead.id,JSON.stringify(research)]);
  const config=rt.campaign({org_id:org,config:{name:'[TEST] Personal LinkedIn manual walkthrough',mode:'template',channels:['linkedin'],sender:{name:'Lead workspace',company:'Integration test'},offer:{name:'No-send manual interface walkthrough',description:'A personal-profile walkthrough of opening a profile, copying a draft and skipping a task. No marketing or sending.',approved_points:['This is the requested manual LinkedIn interface walkthrough.'],prohibited_claims:[]},cta:{text:'Please do not send this test message.'},timezone:'Asia/Karachi',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},expiry_days:2,sequence:[{channel:'linkedin',delay_days:0}],linkedin_manual:{enabled:true,daily_task_limit:1,connection_note:'This is a no-send interface walkthrough. Please do not send this connection note.',target_profiles:{[lead.id]:url}}}}).config;
  config.integration_test={...provenance};
  const campaign=await call('strategy_campaign_save',{org_id:org,config});assert(campaign.campaign_id&&!campaign.error,'CAMPAIGN_NOT_SAVED');
  const queued=await call('strategy_enqueue',{org_id:org,campaign_id:campaign.campaign_id,lead_id:lead.id,request_id:request});assert(queued.job_id&&!queued.error,'ENQUEUE_FAILED');
  const claim=(await db.query('SELECT strategy_claim($1,1) AS result',[request])).rows[0].result;assert.equal(Number(claim.id),Number(queued.job_id),'EXACT_CLAIM_REQUIRED');
  const prepared=native.prepare(claim,{hasKey:false,linkedinManualEnabled:true});assert.equal(prepared.wants_ai,false);
  const assembled=native.assemble(prepared,{});assert.deepEqual(assembled.plan.blocking_reasons,[]);assert.deepEqual(assembled.plan.validation_errors,[]);
  assert.equal(assembled.plan.artifacts.linkedin_manual.target.profile_url,url);assert.equal(assembled.plan.execution_authorized,false);
  assembled.plan.integration_test=provenance;delete assembled.plan.content_hash;assembled.plan.content_hash=require('../lead-strategy/v2/contract.cjs').hash(assembled.plan);
  const saved=await call('strategy_finish',assembled);assert.equal(saved.saved,true,'PLAN_NOT_SAVED');
  assert.equal((await db.query('SELECT count(*)::int n FROM strategy_ai_requests')).rows[0].n,before,'NO_AI_ALLOWED');
  assert.equal((await db.query('SELECT count(*)::int n FROM strategy_approvals WHERE org_id=$1 AND plan_id=$2',[org,saved.plan_id])).rows[0].n,0);
  const result={prepared:true,org_id:org,campaign_id:campaign.campaign_id,lead_id:lead.id,plan_id:saved.plan_id,profile_url:url,approved:false,task_created:false,model_calls:0,messages_sent:0,source:'user_supplied_personal_test_profile',independent_verification:false};
  fs.writeFileSync(dir+'/commit-attempt.json',JSON.stringify(result,null,2),{flag:'wx'});
  await db.query('COMMIT');open=false;fs.writeFileSync(dir+'/prepared.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(open)await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();await pool.end();}
}
main().catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PERSONAL_LINKEDIN_PREPARATION_FAILED');process.exitCode=1;});
