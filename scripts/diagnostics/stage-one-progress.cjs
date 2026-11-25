'use strict';
// Operator-only read: no claims, retries, provider access, secrets or writes.
const fs=require('node:fs'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const db=localPool();try{
 const read=async q=>(await db.query(q)).rows;
 const counts=await read('SELECT kind,status,count(*)::integer count FROM enrichment_tasks GROUP BY kind,status ORDER BY kind,status');
 const problematic=await read(`SELECT t.id,t.org_id,t.lead_id,c.company_name,c.website,t.status,t.attempts,t.error,t.next_attempt,t.finished_at,
 a.result->>'status' AS worker_status,a.result->'result'->>'reason' AS reason,a.result->'result'->>'retryable' AS retryable,
 a.result->'result'->'pages' AS pages FROM enrichment_tasks t JOIN cleaned_leads c ON c.org_id=t.org_id AND c.id=t.lead_id
 LEFT JOIN LATERAL(SELECT result FROM enrichment_attempts WHERE task_id=t.id ORDER BY started_at DESC LIMIT 1)a ON true
 WHERE t.kind='basic' AND (t.status='failed' OR t.error IS NOT NULL) ORDER BY t.id`);
 const pending=await read(`SELECT t.id,t.org_id,t.lead_id,t.status,t.attempts,t.error,t.next_attempt,t.lease_until,
 contact_eligible(t.org_id,t.lead_id,t.staging_id) AS eligible FROM enrichment_tasks t WHERE t.kind='basic' AND t.status IN ('pending','processing') ORDER BY t.id LIMIT 50`);
 const claim=(await read("SELECT prosrc FROM pg_proc WHERE oid='enrichment_claim(text,integer)'::regprocedure"))[0].prosrc;
 const controls=await read('SELECT enabled,lead_ids FROM enrichment_controls WHERE id');
 for(const item of problematic)item.observed_failure_class=require('../lead-enrichment/observations.cjs').sourceFailure(item.pages);
 const result={checked_at:new Date().toISOString(),counts,problematic,pending,claim,controls,read_only:true,provider_calls:0};
 fs.writeFileSync('.local/stage-one-progress.json',JSON.stringify(result,null,2));console.log(JSON.stringify(process.argv.includes('--summary')?{checked_at:result.checked_at,counts,failed_sources:problematic.map(p=>({lead_id:p.lead_id,status:p.status,attempts:p.attempts,stored_error:p.error,observed_failure_class:p.observed_failure_class})),read_only:true}:result));
 }finally{await db.end();}}
main().catch(e=>{console.error(JSON.stringify({error:'STAGE_ONE_INSPECTION_UNCONFIRMED',sql_code:e.code}));process.exitCode=1;});
