'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const{localPool}=require('../dashboard/start-local-auth.cjs'),{service}=require('../dashboard/calling-calendar.cjs');
async function main(){const pool=localPool();try{
 assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const a=(await pool.query("SELECT m.org_id,m.subject,m.role,c.id campaign_id FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' JOIN strategy_campaigns c ON c.org_id=m.org_id WHERE m.active AND m.role IN('owner','admin') ORDER BY m.org_id,c.id LIMIT 1")).rows[0];assert(a,'LOCAL_OWNER_CAMPAIGN_REQUIRED');
 const s=service({identity:{principal:async()=>a},pool,transaction:async()=>assert.fail('NO_WRITES'),listCalendars:async()=>assert.fail('NO_PROVIDER_REQUESTS')});const r=await s.preview('read-only-fixture',{org_id:a.org_id,campaign_id:a.campaign_id});assert.equal(r.preview_only,true);assert.equal(r.execution_authorized,false);
 const result={passed:true,read_only:true,current_plan_steps:r.items.length,workspace_active_or_uncertain:r.active_or_uncertain.length,provider_requests:0,campaigns_changed:0,phone_calls_placed:0,authenticated_browser_verified:false,checked_at:new Date().toISOString()};fs.mkdirSync('.local/calling-dashboard-20261115',{recursive:true});fs.writeFileSync('.local/calling-dashboard-20261115/read-preview.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}}
main().catch(()=>{console.error('CALL_PREVIEW_READONLY_UNCONFIRMED');process.exitCode=1;});
