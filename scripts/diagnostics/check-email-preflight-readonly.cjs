'use strict';
// Operator-only SQL integration check, not a substitute for dashboard auth QA.
const fs=require('node:fs'),assert=require('node:assert/strict');
const{localPool}=require('../dashboard/start-local-auth.cjs');
const{service}=require('../dashboard/email-preflight.cjs');
async function main(){const step=process.argv.includes('--step=2')?2:1,pool=localPool();try{
 const readonly=(await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only;assert.equal(readonly,'on');
 const r=(await pool.query("SELECT c.org_id,c.id,c.version,m.subject,m.role,(SELECT p.id FROM strategy_plans p WHERE p.org_id=c.org_id AND p.campaign_id=c.id ORDER BY p.id DESC LIMIT 1) AS plan_id FROM strategy_campaigns c JOIN LATERAL(SELECT subject,role FROM org_sender_memberships WHERE org_id=c.org_id AND active AND role IN ('owner','admin') LIMIT 1)m ON true WHERE EXISTS(SELECT 1 FROM strategy_plans p WHERE p.org_id=c.org_id AND p.campaign_id=c.id) ORDER BY c.id DESC LIMIT 1")).rows[0];
 assert(r,'NO_CAMPAIGN_WITH_PLAN_FIXTURE');
 const check=service({pool,identity:{principal:async()=>({org_id:r.org_id,subject:r.subject,role:r.role})}});
 const result=await check('operator-sql-check',{org_id:String(r.org_id),campaign_id:String(r.id),campaign_version:String(r.version),plan_ids:String(r.plan_id),step:String(step)});
 assert.equal(result.found,true);assert.equal(result.execution_authorized,false);assert.equal(result.plans.length,1);
 const evidence={passed:true,step,read_only:true,sql_executed:true,found:result.found,plan_count:result.plans.length,ready_for_operator_review:result.ready_for_operator_review,blocker_codes:result.reasons,plan_blocker_codes:result.plans.map(p=>p.reasons),provider_requests:0,sent:false,database_changed:false,customer_authentication_tested:false};
 const directory=step===2?'.local/email-followup-renewal-20261110':'.local/email-preflight-20261109';fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(directory+'/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await pool.end();}}
main().catch(()=>{console.error('EMAIL_PREFLIGHT_SQL_CHECK_FAILED');process.exitCode=1;});
