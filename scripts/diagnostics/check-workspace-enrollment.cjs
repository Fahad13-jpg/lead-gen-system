'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
async function run(pool){const db=await pool.connect();try{
 await db.query('BEGIN');await db.query(fs.readFileSync('database/migrations/064_workspace_enrollment.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
 const state=async()=>(await db.query("SELECT jsonb_build_object('wallet',(SELECT md5(coalesce(jsonb_agg(to_jsonb(w) ORDER BY id)::text,'')) FROM gathering_wallet_entries w),'ai_requests',(SELECT count(*)::int FROM strategy_ai_requests),'outreach',(SELECT count(*)::int FROM outreach_activities)) AS state")).rows[0].state;
 const before=await state(),subject=crypto.randomBytes(32).toString('hex'),request_id=crypto.randomUUID();
 const identity={session:async()=>({identity_verified:true,email_verified:true,subject,organizations:[]})},api=require('../dashboard/workspace-enrollment.cjs').service({identity,transaction:fn=>fn(db)});
 const payload={request_id,name:'Rollback-only new customer',acknowledge_owner:true},created=await api.create('verified-fixture',payload);assert(created.saved);assert.equal(created.organization.role,'owner');assert.equal(created.provider_credits_granted,false);assert.equal(created.ai_requests_granted,0);
 const org=created.organization.org_id,row=(await db.query('SELECT * FROM organizations WHERE id=$1',[org])).rows[0];assert.equal(Number(row.monthly_credit_limit),0);assert.equal(Number(row.credits_used),0);assert.equal(row.subscription_tier,'freemium');assert.equal(row.max_users,1);
 assert.deepEqual((await db.query('SELECT enabled,monthly_limit FROM strategy_ai_controls WHERE org_id=$1',[org])).rows[0],{enabled:false,monthly_limit:0});
 assert.equal((await db.query('SELECT count(*)::int n FROM gathering_accounts WHERE org_id=$1',[org])).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM sender_connections WHERE org_id=$1',[org])).rows[0].n,0);
 const second=await api.create('verified-fixture',payload);assert(second.already_recorded);assert.equal(second.organization.org_id,org);assert((await api.status('verified-fixture',{request_id})).saved);
 await assert.rejects(api.create('verified-fixture',{...payload,name:'Changed name'}),/WORKSPACE_REQUEST_CONFLICT/);
 await db.query('UPDATE org_sender_memberships SET active=false WHERE org_id=$1 AND subject=$2',[org,subject]);await assert.rejects(api.status('verified-fixture',{request_id}),/WORKSPACE_ACCESS_REVIEW_REQUIRED/);assert.equal((await db.query('SELECT active FROM org_sender_memberships WHERE org_id=$1',[org])).rows[0].active,false);
 const member=crypto.randomBytes(32).toString('hex');await db.query("INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES($1,$2,'member',true)",[org,member]);
 const other=require('../dashboard/workspace-enrollment.cjs').service({identity:{session:async()=>({identity_verified:true,email_verified:true,subject:member})},transaction:fn=>fn(db)});await assert.rejects(other.create('fixture',{...payload,request_id:crypto.randomUUID()}),/WORKSPACE_MEMBERSHIP_EXISTS/);
 assert.equal((await other.status('fixture',{request_id})).saved,false);assert.deepEqual(await state(),before);
 return{passed:true,duplicate_creation_deduplicated:true,revoked_access_not_restored:true,no_email_domain_join:true,credits_granted:0,ai_calls:0,messages_sent:0,all_customer_rows_rolled_back:true};
}finally{await db.query('ROLLBACK');db.release();}}
if(require.main===module){const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});run(pool).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error((e.code||'CHECK_FAILED')+': '+e.message?.slice(0,180));process.exitCode=1;}).finally(()=>pool.end());}module.exports={run};
