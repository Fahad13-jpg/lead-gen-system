'use strict';
// Explicit live-provider integration test in the isolated database only.
const assert=require('node:assert/strict'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});
 await db.connect();let controls,ai;
 try{
  controls=(await db.query('SELECT * FROM enrichment_controls WHERE id')).rows[0];
  ai=(await db.query('SELECT * FROM enrichment_ai_controls WHERE id')).rows[0];
  await db.query("INSERT INTO organizations(id,org_name,status) VALUES(940065,'AI live worker fixture','active') ON CONFLICT DO NOTHING");
  const s=(await db.query("INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940065,'Synthetic Dental Clinic','google_maps','cleaned','{}') RETURNING id")).rows[0].id;
  const l=(await db.query("INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940065,$1,'Synthetic Dental Clinic','https://clinic.example') RETURNING id",[s])).rows[0].id;
  await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,940065,$2)',[s,l]);
  await db.query('UPDATE enrichment_controls SET enabled=true,lead_ids=$1',[[l]]);
  const claim=async kind=>(await db.query('SELECT value AS task FROM enrichment_claim($1,1) value',[kind])).rows[0]?.task;
  const basic=await claim('basic');assert(basic);
  const result={version:'enrichment_v1',status:'complete',evidence:[{type:'website_description',value:'Synthetic Dental Clinic offers dental implants and routine checkups.',source_url:'https://clinic.example/services'}]};
  assert((await db.query('SELECT enrichment_finish($1) AS result',[{...basic,status:'complete',result}])).rows[0].result.saved);
  await db.query("SELECT enrichment_submit($1,'campaign')",[{org_id:940065,lead_id:l,config:{offer:'Clinic website demo with service pages and online booking'}}]);
  await db.query("UPDATE enrichment_ai_controls SET enabled=true,monthly_request_limit=(SELECT count(*)+1 FROM enrichment_ai_requests WHERE reserved_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')");
  const task=await claim('research');assert(task);
  const run=cp.spawnSync(process.execPath,['/home/node/.n8n/enrichment-stage/worker.cjs',String(task.id),task.lease,'lead_gathering_test_20260926'],{encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,'Worker failed');const output=JSON.parse(run.stdout);
  assert.equal(output.result.ai_research.status,'review_required');
  assert((await db.query('SELECT enrichment_finish($1) AS result',[output])).rows[0].result.saved);
  const ledger=(await db.query('SELECT status,usage FROM enrichment_ai_requests WHERE lease=$1',[task.lease])).rows[0];
  assert.equal(ledger.status,'review_required');assert(ledger.usage.total_tokens>0);
  assert.equal((await db.query('SELECT email_valid FROM cleaned_leads WHERE id=$1',[l])).rows[0].email_valid===true,false);
  console.log(JSON.stringify({test:'live_worker_isolated_database',passed:true,lead_id:l,ai_status:ledger.status,usage:ledger.usage,outreach_sent:false}));
 }finally{
  if(controls)await db.query('UPDATE enrichment_controls SET enabled=$1,lead_ids=$2',[controls.enabled,controls.lead_ids]);
  if(ai)await db.query('UPDATE enrichment_ai_controls SET enabled=$1,monthly_request_limit=$2',[ai.enabled,ai.monthly_request_limit]);
  await db.end();
 }
})().catch(()=>{console.error('AI worker integration failed; review isolated test ledger');process.exitCode=1;});
