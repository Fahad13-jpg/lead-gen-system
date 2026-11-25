'use strict';
// Read-only: exercise the same safe plan projection as the dashboard.
const assert=require('node:assert/strict'),{localPool}=require('../dashboard/start-local-auth.cjs'),{review}=require('../dashboard/plan-review.cjs');
async function main(){const db=localPool();try{
 const rows=(await db.query('SELECT p.id,p.lead_id,p.campaign_version,p.body FROM strategy_plans p JOIN strategy_jobs j ON j.id=p.job_id AND j.org_id=p.org_id WHERE p.org_id=1 AND j.request_id IN (\'quality-approved-20261108-strong\',\'quality-approved-20261108-weak\',\'quality-approved-20261108-thin\') ORDER BY p.id')).rows.map(review);
 assert.equal(rows.length,3);const expected={167:'UNKNOWN_ANGLE',449:'MISSING_QUALITY_FLAG:weak_offer_fit',446:'MISSING_QUALITY_FLAG:fit_not_established'};
 for(const p of rows){assert.equal(p.state,'ai_failed');assert.equal(p.failure_reason,expected[p.lead_id]);assert.equal(p.generation_details.attempts,1);assert(p.generation_details.usage_complete);assert.equal(p.step1,null);}
 const control=(await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0];assert.equal(control.enabled,false);
 console.log(JSON.stringify({read_only:true,processing_paused:true,model_calls:0,projected_failures:rows.map(p=>({id:p.id,lead_id:p.lead_id,failure_reason:p.failure_reason,...p.generation_details})),total_tokens:rows.reduce((n,p)=>n+p.generation_details.tokens.total,0)}));
 }finally{await db.end();}}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
