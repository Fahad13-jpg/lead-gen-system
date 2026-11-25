'use strict';
// Read-only adapter check. EXPLAIN without ANALYZE never executes manual actions.
const fs=require('node:fs'),assert=require('node:assert/strict');
const{localPool}=require('../dashboard/start-local-auth.cjs'),{service}=require('../dashboard/linkedin-manual.cjs');
async function main(){const pool=localPool();try{
 assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const actor=(await pool.query("SELECT m.org_id,m.subject,m.role FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.active AND m.role IN('owner','admin') ORDER BY m.org_id,m.subject LIMIT 1")).rows[0];assert(actor,'LOCAL_MEMBER_REQUIRED');
 let explains=0;const s=service({identity:{principal:async()=>actor},pool,execute:async statement=>{await pool.query({...statement,text:'EXPLAIN '+statement.text});explains++;throw Error('READONLY_EXPLAIN_ONLY');}});
 const q=await s.queue('read-only-fixture',{org_id:actor.org_id});assert.equal(q.manual_only,true);assert.equal(q.execution_authorized,false);
 const p={org_id:actor.org_id,activity_id:999999999,content_hash:'0'.repeat(32),event_id:'12345678-1234-1234-1234-123456789abc',action:'request_sent',confirmed_by_customer:true};
 await assert.rejects(s.event('read-only-fixture',p),/LINKEDIN_WRITE_UNCONFIRMED/);
 await assert.rejects(s.prepare('read-only-fixture',{org_id:actor.org_id,plan_id:999999999,step:1,content_hash:p.content_hash,acknowledge_manual_task:true}),/LINKEDIN_WRITE_UNCONFIRMED/);
 await s.receipt('read-only-fixture',{org_id:actor.org_id,kind:'event',activity_id:p.activity_id,content_hash:p.content_hash,event_id:p.event_id,action:p.action});
 assert.equal(explains,2);const result={passed:true,read_only:true,queue_items:q.items.length,write_statements_parsed_without_execution:explains,authenticated_browser_verified:false,provider_requests:0,activities_created:0,customer_events_written:0,verified_at:new Date().toISOString()};fs.mkdirSync('.local/linkedin-dashboard-20261110',{recursive:true});fs.writeFileSync('.local/linkedin-dashboard-20261110/read-adapter.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}}
main().catch(()=>{console.error('LINKEDIN_READONLY_ADAPTER_UNCONFIRMED');process.exitCode=1;});
