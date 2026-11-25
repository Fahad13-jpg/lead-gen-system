'use strict';
const assert=require('node:assert/strict');const {advance}=require('./social-worker.cjs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();
try{
 await db.query("INSERT INTO organizations(id,org_name,status) VALUES(940041,'Social recovery fixture','active') ON CONFLICT(id) DO NOTHING");
 const sid=(await db.query("INSERT INTO staging_leads(org_id,company_name,source,cleaning_status) VALUES(940041,'Fixture','google_maps','cleaned') RETURNING id")).rows[0].id;
 const lid=(await db.query("INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940041,$1,'Fixture','https://business.example') RETURNING id",[sid])).rows[0].id;
 await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,940041,$2)',[sid,lid]);
 const account=(await db.query("INSERT INTO gathering_accounts(mode,org_id,api_key,provider_user_id,enabled,monthly_budget_usd) VALUES('byok',940041,'fake-key-never-sent','social-recovery-fixture',true,100) ON CONFLICT(org_id) DO UPDATE SET enabled=true RETURNING id")).rows[0].id;
 await db.query('INSERT INTO contact_social_policy(org_id,enabled,account_id,monthly_cap_usd) VALUES(940041,true,$1,10) ON CONFLICT(org_id) DO UPDATE SET enabled=true',[account]);
 await db.query('UPDATE contact_controls SET discovery_enabled=true,verification_enabled=false,staging_ids=$1',[[sid]]);await db.query('UPDATE contact_social_controls SET enabled=true,monthly_cap_usd=100');
 const job=(await db.query("INSERT INTO contact_social_jobs(org_id,lead_id,staging_id,profile,input_fingerprint) VALUES(940041,$1,$2,'https://www.facebook.com/fixture',contact_input_fingerprint(940041,$1,$2)) RETURNING id",[lid,sid])).rows[0].id;
 let starts=0,failedPoll=false;
 const fake=async(key,path,opts={})=>{assert.equal(key,'fake-key-never-sent');if(opts.method==='POST'){starts++;return {data:{id:'fake-run-'+job,defaultDatasetId:'fake-dataset-'+job}};}
  if(path.startsWith('actor-runs/')){if(!failedPoll){failedPoll=true;throw Error('temporary network failure');}return {data:{status:'SUCCEEDED',usageTotalUsd:0.014}};}
  return [{facebookUrl:'https://www.facebook.com/fixture',title:'Fixture',website:'https://business.example',email:'hello@business.example'}];};
 await advance(db,fake);assert.equal((await db.query('SELECT status FROM contact_social_jobs WHERE id=$1',[job])).rows[0].status,'running');
 await advance(db,fake);assert.equal((await db.query('SELECT status FROM contact_social_jobs WHERE id=$1',[job])).rows[0].status,'running');
 await advance(db,fake);assert.equal(starts,1);
 const done=(await db.query('SELECT status,actual_cost_usd,result FROM contact_social_jobs WHERE id=$1',[job])).rows[0];assert.equal(done.status,'completed');assert.equal(Number(done.actual_cost_usd),0.014);assert(done.result.identity.matched);
 const uncertain=(await db.query("INSERT INTO contact_social_jobs(org_id,lead_id,staging_id,profile,input_fingerprint) VALUES(940041,$1,$2,'https://www.facebook.com/fixture2',contact_input_fingerprint(940041,$1,$2)) RETURNING id",[lid,sid])).rows[0].id;
 let calls=0;const fail=async()=>{calls++;throw Error('uncertain POST outcome');};await advance(db,fail);await advance(db,fail);assert.equal(calls,1);
 assert.equal((await db.query('SELECT status FROM contact_social_jobs WHERE id=$1',[uncertain])).rows[0].status,'needs_review');
 console.log('PASS: saved-run polling after network failure, one paid start, actual-cost settlement, qualified result, and no resubmission after ambiguous POST. Mock provider only.');
}finally{await db.query('UPDATE contact_controls SET discovery_enabled=false,verification_enabled=false,staging_ids=NULL');await db.query('UPDATE contact_social_controls SET enabled=false');await db.query('UPDATE contact_social_policy SET enabled=false WHERE org_id=940041');await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
