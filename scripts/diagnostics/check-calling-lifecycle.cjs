'use strict';
// Rollback-only fixture: real SQL/functions, no provider, model or transport request.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function check({installed=false}={}){
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true}),db=await pool.connect();let verified=0;
 try{
  await db.query('BEGIN');if(!installed)await db.query(fs.readFileSync('database/migrations/066_calling_account_lifecycle.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
  const org=(await db.query("INSERT INTO organizations(org_name,subscription_tier,max_users,monthly_credit_limit,credits_used,status) VALUES('Rollback calling lifecycle','freemium',1,0,0,'active') RETURNING id")).rows[0].id;
  const subject=crypto.randomBytes(32).toString('hex');await db.query("INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES($1,$2,'owner',true)",[org,subject]);
  const config={name:'Rollback only',offer:{description:'Owned test only'},cta:{text:'No send'},channels:['call'],sequence:[{channel:'call',delay_days:0}],mode:'template'};
  const c=(await db.query('SELECT strategy_campaign_save($1::jsonb) result',[JSON.stringify({org_id:org,config})])).rows[0].result;assert.equal(c.http_status,200);
  await db.query("INSERT INTO calling_accounts(org_id,request_id,key_fingerprint,agent_id,agent_version,from_number,secrets) VALUES($1,$2,$3,$4,1,'+14155550123','{}')",[org,crypto.randomUUID(),crypto.randomBytes(32).toString('hex'),'rollback_'+org]);
  const transaction=async fn=>{await db.query('SAVEPOINT operation');try{const r=await fn(db);await db.query('RELEASE SAVEPOINT operation');return r;}catch(e){await db.query('ROLLBACK TO SAVEPOINT operation');throw e;}};
  const api=require('../dashboard/calling-binding.cjs').service({identity:{principal:async()=>({org_id:org,active:true,role:'owner',subject})},pool:db,transaction,provider:{verify:async()=>{verified++;}},vault:{open:()=>({api_key:'rollback-only-key'}),seal:()=>({encrypted:'fixture'})}});
  const bind={org_id:org,campaign_id:Number(c.campaign_id),expected_campaign_version:c.version,expected_account_version:1,request_id:crypto.randomUUID(),acknowledge_pause_and_review:true};
  const b=await api.bind('fixture',bind);assert.equal(b.version,c.version+1);assert.equal(b.calling_enabled,false);assert.deepEqual(await api.bind('fixture',bind),b);
  const u={org_id:org,request_id:crypto.randomUUID(),action:'update',expected_account_version:1,agent_id:'rollback_updated_'+org,agent_version:2,from_number:'+14155550124',acknowledge_pause_and_review:true};const updated=await api.change('fixture',u);assert.equal(updated.account_version,2);assert.equal(updated.campaigns[0].version,b.version+1);assert.deepEqual(await api.change('fixture',u),updated);assert.equal(verified,1);
  const d=await api.change('fixture',{org_id:org,request_id:crypto.randomUUID(),action:'disconnect',expected_account_version:2,acknowledge_pause_and_review:true});assert.equal(d.account_version,3);assert.equal(d.campaigns[0].version,updated.campaigns[0].version+1);
  const account=(await db.query('SELECT * FROM calling_accounts WHERE org_id=$1',[org])).rows[0];assert.equal(account.secrets,null);assert.equal(account.key_fingerprint,null);assert.equal(account.state,'disconnected');
  const cfg=(await db.query('SELECT config FROM strategy_campaign_versions WHERE org_id=$1 AND campaign_id=$2 AND version=$3',[org,c.campaign_id,d.campaigns[0].version])).rows[0].config;assert.equal(cfg.call_dispatch.enabled,false);assert.equal(cfg.call_dispatch.connection,undefined);assert.equal(cfg.call_dispatch.release.enabled,false);assert.equal(cfg.call_dispatch.quote.verified,false);
  await assert.rejects(api.bind('fixture',{...bind,request_id:crypto.randomUUID(),expected_campaign_version:d.campaigns[0].version,expected_account_version:3}),/CALLING_ACCOUNT_NOT_CONNECTED/);
  const result={passed:true,real_sql:true,rolled_back:true,provider_requests:0,calls_placed:0,funds_added:0};console.log(JSON.stringify(result));return result;
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
}
if(require.main===module)check({installed:process.argv.includes('--installed')}).catch(e=>{console.error((e.code||'CHECK_FAILED')+': '+e.message?.slice(0,130));process.exitCode=1;});
module.exports={check};
