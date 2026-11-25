'use strict';
// One Calendar-list read through the existing org-bound tools; no events or calls.
const fs=require('node:fs'),assert=require('node:assert/strict');
const{localPool}=require('../dashboard/start-local-auth.cjs'),{service,localCatalog}=require('../dashboard/calling-calendar.cjs');
async function main(){const config=JSON.parse(fs.readFileSync('.local/calling-tools-20261028/private.json','utf8'));assert(Number.isSafeInteger(config.org_id));const pool=localPool();try{
 assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const a=(await pool.query({text:"SELECT m.org_id,m.subject,m.role FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=$1 AND m.active AND m.role IN('owner','admin') LIMIT 1",values:[config.org_id]})).rows[0];assert(a,'AUTHORIZED_LOCAL_WORKSPACE_REQUIRED');
 const c=(await pool.query({text:'SELECT id FROM strategy_campaigns WHERE org_id=$1 ORDER BY id LIMIT 1',values:[a.org_id]})).rows[0];assert(c,'LOCAL_CAMPAIGN_REQUIRED');
 const s=service({identity:{principal:async()=>a},pool,transaction:async()=>assert.fail('NO_WRITES'),listCalendars:localCatalog()});const saved=await s.read('read-only-fixture',{org_id:a.org_id,campaign_id:c.id});assert.equal(saved.execution_authorized,false);
 const list=await s.list('read-only-fixture',{org_id:a.org_id,campaign_id:c.id});const result={read_adapter_passed:true,calendar_list_connected:list.available===true,writable_calendar_count:list.calendars.length,setup_reason:list.reason||null,authenticated_browser_verified:false,events_created:0,phone_calls_placed:0,campaigns_changed:0,checked_at:new Date().toISOString()};fs.mkdirSync('.local/calling-dashboard-20261114',{recursive:true});fs.writeFileSync('.local/calling-dashboard-20261114/read-adapter.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}}
main().catch(()=>{console.error('CALLING_CALENDAR_READONLY_UNCONFIRMED');process.exitCode=1;});
