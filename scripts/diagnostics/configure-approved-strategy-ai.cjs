'use strict';
// Explicit user approval on 2026-11-08: org 1, 10 requests/month, up to 3 tests.
// Does not claim jobs, enable processing, call a model or touch old trial files.
const fs=require('node:fs'),{localPool}=require('../dashboard/start-local-auth.cjs');
const dir='.local/strategy-allowance-'+Date.now();fs.mkdirSync(dir,{recursive:true});
async function main(){const db=localPool({registryWrite:true});try{
 await db.query('BEGIN');const global=(await db.query('SELECT enabled FROM strategy_controls WHERE id FOR UPDATE')).rows[0];if(global?.enabled!==false)throw Error('PROCESSING_MUST_STAY_PAUSED');
 const before=(await db.query('SELECT org_id,enabled,monthly_limit FROM strategy_ai_controls WHERE org_id=1 FOR UPDATE')).rows[0];if(!before||before.enabled||before.monthly_limit!==0)throw Error('ALLOWANCE_BASELINE_CHANGED');
 const requests=(await db.query('SELECT count(*)::integer n FROM strategy_ai_requests WHERE org_id=1')).rows[0].n;
 fs.writeFileSync(dir+'/before.json',JSON.stringify({before,processing_enabled:global.enabled,requests},null,2));
 await db.query('UPDATE strategy_ai_controls SET enabled=true,monthly_limit=10 WHERE org_id=1');await db.query('COMMIT');
 const report={configured:true,org_id:1,monthly_limit:10,approved_quality_test_limit:3,processing_paused:true,requests_created:0,model_calls:0,old_trial_ledger_touched:false,configured_at:new Date().toISOString(),report_directory:dir};fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
