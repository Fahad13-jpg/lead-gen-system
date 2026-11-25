'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{localPool}=require('../dashboard/start-local-auth.cjs'),{service}=require('../dashboard/email-followups.cjs');
async function main(){const pool=localPool();try{
 assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const r=(await pool.query("SELECT c.org_id,c.id FROM strategy_campaigns c WHERE EXISTS(SELECT 1 FROM strategy_plans p WHERE p.org_id=c.org_id AND p.campaign_id=c.id) ORDER BY EXISTS(SELECT 1 FROM strategy_plans p WHERE p.org_id=c.org_id AND p.campaign_id=c.id AND CASE WHEN jsonb_typeof(p.body#>'{artifacts,schedule,sequence}')='array' THEN jsonb_array_length(p.body#>'{artifacts,schedule,sequence}')>1 ELSE false END) DESC,c.id DESC LIMIT 1")).rows[0];assert(r,'CAMPAIGN_FIXTURE_REQUIRED');
 const result=await service({pool,identity:{principal:async()=>({org_id:r.org_id})}})('operator-read-only-check',{org_id:String(r.org_id),campaign_id:String(r.id),limit:'10'});assert.equal(result.found,true);assert.equal(result.execution_authorized,false);
 const states={};for(const row of result.items)states[row.state]=(states[row.state]||0)+1;
 const evidence={passed:true,sql_executed:true,read_only:true,total_steps:result.total,page_steps:result.items.length,eligibility_checks_exercised:result.items.length>0,state_counts:states,provider_requests:0,sent:false,database_changed:false,customer_authentication_tested:false};fs.mkdirSync('.local/email-followups-20261110',{recursive:true});fs.writeFileSync('.local/email-followups-20261110/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await pool.end();}}
main().catch(()=>{console.error('EMAIL_FOLLOWUPS_SQL_UNCONFIRMED');process.exitCode=1;});
