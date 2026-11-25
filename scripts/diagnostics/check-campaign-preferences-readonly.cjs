'use strict';
const assert=require('node:assert/strict'),{localPool}=require('../dashboard/start-local-auth.cjs'),{dataService}=require('../dashboard/data.cjs');
async function main(){const db=localPool();try{
 // Operator-only projection check; not an alternate HTTP authentication path.
 const service=dataService({pool:db,identity:{principal:async()=>({role:'owner'})}}),campaigns=[];
 for(const id of [1,2]){const r=await service.campaigns('operator-local-only',{org_id:'1',campaign_id:String(id)});assert(r.found);assert(Array.isArray(r.preferences.sequence));assert(r.preferences.sending_window.weekdays.length);assert(r.preferences.offer.description);assert(Array.isArray(r.preferences.channels));campaigns.push({campaign_id:r.campaign_id,version:r.version,sequence_steps:r.preferences.sequence.length,timezone:r.preferences.timezone,offer_and_channels_projected:true,email_daily_limit:r.email_daily_limit});}
 const rights=(await db.query("SELECT current_user role,has_function_privilege(current_user,'strategy_campaign_save(jsonb)','EXECUTE') can_save")).rows[0];assert(rights.can_save);
 const controls=(await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0];
 const usage=(await db.query("SELECT c.monthly_limit,(SELECT count(*)::integer FROM strategy_ai_requests r WHERE r.org_id=c.org_id AND reserved_at>=date_trunc('month',now())) used FROM strategy_ai_controls c WHERE org_id=1")).rows[0];
 assert.equal(controls.enabled,false);
 console.log(JSON.stringify({read_only:true,operator_check_not_customer_auth:true,campaigns,existing_save_function_available:true,database_role:rights.role,processing_paused:true,monthly_ai_requests_used:usage.used,monthly_ai_requests_remaining:usage.monthly_limit-usage.used,model_calls:0,live_campaigns_changed:false}));
 }finally{await db.end();}}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
