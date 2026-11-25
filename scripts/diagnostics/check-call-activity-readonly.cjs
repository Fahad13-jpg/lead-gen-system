'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
async function main(){const pool=require('../dashboard/start-local-auth.cjs').localPool();try{
 assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const org=JSON.parse(fs.readFileSync('.local/calling-tools-20261028/private.json','utf8')).org_id;
 const a=(await pool.query({text:"SELECT m.org_id,m.role,m.subject FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=$1 AND m.active LIMIT 1",values:[org]})).rows[0];assert.ok(a);
 const service=require('../dashboard/data.cjs').dataService({pool,identity:{principal:async(_token,n)=>{assert.equal(n,a.org_id);return a;}}});
 const r=await service.outreach('read-only-local-fixture',{org_id:String(org),channel:'call',limit:'20'});
 assert.ok(r.activities.every(x=>x.channel==='call'&&Object.hasOwn(x,'call_result')));
 const report={read_query_passed:true,call_records:r.total,read_only:true,authenticated_browser_verified:false,provider_requests:0,lead_writes:0,checked_at:new Date().toISOString()};fs.mkdirSync('.local/call-activity-20261115',{recursive:true});fs.writeFileSync('.local/call-activity-20261115/read-query.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await pool.end();}}
main().catch(()=>{console.error('CALL_ACTIVITY_READ_UNCONFIRMED');process.exitCode=1;});
