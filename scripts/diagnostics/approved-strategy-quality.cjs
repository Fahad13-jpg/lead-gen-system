'use strict';
// Explicit approval 2026-11-08: 10/month, at most three single-attempt tests.
// Uses the installed planner, ordinary leases/quota/finish path. Never sends.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {localPool}=require('../dashboard/start-local-auth.cjs');
// Separate fresh approval on 2026-11-09: ONE corrected-v2.8 request only.
const corrected=process.argv[2]==='corrected-v28-once';
const root=corrected?'.local/strategy-quality-corrected-approved-20261109':'.local/strategy-quality-approved-20261108';
const cases=corrected?{corrected:167}:{strong:167,weak:449,thin:446};
const name=corrected?'corrected':process.argv[2];assert(Object.hasOwn(cases,name),'Choose an explicitly approved case');
fs.mkdirSync(root,{recursive:true});
async function main(){const db=localPool({registryWrite:true});let enabled=false;try{
 const prior=root+'/'+name+'.json';assert(!fs.existsSync(prior),'CASE_ALREADY_ADMITTED_RECONCILE_DO_NOT_RETRY');
 const controls=(await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0];assert.equal(controls.enabled,false,'PROCESSING_MUST_START_PAUSED');
 const ai=(await db.query('SELECT enabled,monthly_limit FROM strategy_ai_controls WHERE org_id=1')).rows[0];assert(ai.enabled&&ai.monthly_limit===10,'APPROVED_ALLOWANCE_REQUIRED');
 if(corrected){const planner=(await db.query("SELECT nodes FROM workflow_entity WHERE id='27W04lgTGdgFMWUx'")).rows[0];assert(planner.nodes.find(n=>n.name==='Prepare Strategy').parameters.jsCode.includes('strategy_v2.8'),'CORRECTED_PROMPT_NOT_INSTALLED');assert.equal(planner.nodes.find(n=>n.name==='Compose With Groq').retryOnFail,false);}
 const jobs=(await db.query(`SELECT j.id,j.org_id,j.status,j.campaign_version,c.version FROM strategy_jobs j LEFT JOIN strategy_campaigns c ON c.org_id=j.org_id AND c.id=j.campaign_id WHERE j.status IN ('pending','processing')`)).rows;
 assert(jobs.every(j=>j.status==='pending'&&j.campaign_version!==j.version),'UNEXPECTED_RUNNABLE_JOB');
 const recent=(await db.query(`SELECT EXISTS(SELECT 1 FROM strategy_ai_requests WHERE reserved_at>now()-interval '66 seconds') OR EXISTS(SELECT 1 FROM enrichment_ai_requests WHERE reserved_at>now()-interval '66 seconds') busy`)).rows[0];assert(!recent.busy,'WAIT_FOR_EXISTING_RATE_GATE');
 const admission={org_id:1,campaign_id:1,lead_id:cases[name],request_id:corrected?'quality-corrected-v28-approved-20261109':'quality-approved-20261108-'+name};
 // Durable admission marker precedes writes. A crash requires reconciliation, never replay.
 const record={case:name,lead_id:cases[name],request_id:admission.request_id,admitted_at:new Date().toISOString(),state:'admission_started',sending_authorized:false};
 fs.writeFileSync(prior,JSON.stringify(record,null,2),{flag:'wx'});
 const result=(await db.query("SELECT strategy_enqueue('"+JSON.stringify(admission).replace(/'/g,"''")+"'::jsonb) result")).rows[0].result;
 assert(result.job_id&&!result.error,'ADMISSION_REJECTED');record.job_id=result.job_id;record.state='admitted';fs.writeFileSync(prior,JSON.stringify(record,null,2));
 await db.query('UPDATE strategy_controls SET enabled=true WHERE id');enabled=true;
 console.log(JSON.stringify({case:name,job_id:record.job_id,state:'waiting_for_installed_planner',max_completion_tokens:6000,automatic_http_retries:false}));
 const deadline=Date.now()+140000;
 while(Date.now()<deadline){
  const r=(await db.query("SELECT strategy_report(1,"+Number(record.job_id)+") result")).rows[0].result;
  if(['completed','failed','superseded','cancelled'].includes(r?.job_status)){
   await db.query('UPDATE strategy_controls SET enabled=false WHERE id');enabled=false;
   const requests=(await db.query('SELECT status,usage,reserved_at,finished_at FROM strategy_ai_requests WHERE org_id=1 AND job_id='+Number(record.job_id))).rows;
   record.state='finished';record.report=r;record.requests=requests;record.finished_at=new Date().toISOString();fs.writeFileSync(prior,JSON.stringify(record,null,2));
   console.log(JSON.stringify({case:name,job_id:record.job_id,job_status:r.job_status,plan_state:r.plan?.state,generation:r.plan?.generation,blocking_reasons:r.plan?.blocking_reasons,requests:requests.length,processing_paused:true}));return;
  }
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 throw Error('TEST_DEADLINE_RECONCILE_WITHOUT_RETRY');
 }finally{if(enabled)await db.query('UPDATE strategy_controls SET enabled=false WHERE id');await db.end();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
