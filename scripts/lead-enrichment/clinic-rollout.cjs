'use strict';
// Container rollout: preserve controls, refresh only the two reviewed clinic records.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/home/node/.n8n/enrichment-stage/clinic-rollout-20261010';
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const action=process.argv[2];
  if(action==='prepare'){
   assert(!fs.existsSync(dir+'/state.json'),'Existing rollout state; inspect before retrying');
   const flags=(await db.query('SELECT (SELECT enabled FROM enrichment_ai_controls WHERE id) AS ai,(SELECT verification_enabled FROM contact_controls WHERE id) AS verification')).rows[0];assert.equal(flags.ai,false);assert.equal(flags.verification,false);
   await db.query('BEGIN');
   const state=(await db.query('SELECT enabled,lead_ids FROM enrichment_controls WHERE id FOR UPDATE')).rows[0];
   assert.equal((await db.query("SELECT count(*)::int AS n FROM enrichment_tasks WHERE status='processing'")).rows[0].n,0,'Wait for active tasks');
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   fs.writeFileSync(dir+'/state.json',JSON.stringify(state),{mode:0o600});
   fs.copyFileSync('/home/node/.n8n/enrichment-stage/worker.cjs',dir+'/worker-before.cjs');
   const old=(await db.query("SELECT pg_get_functiondef('enrichment_finish(jsonb)'::regprocedure) AS definition")).rows[0].definition;
   fs.writeFileSync(dir+'/finish-before.sql',old,{mode:0o600});
   const leads=(await db.query('SELECT * FROM enrichment_profiles WHERE org_id=1 AND lead_id IN (167,449)')).rows;
   fs.writeFileSync(dir+'/profiles-before.json',JSON.stringify(leads),{mode:0o600});
   await db.query('UPDATE enrichment_controls SET enabled=false WHERE id');await db.query('COMMIT');
   console.log('Backed up worker, function, profiles and controls; claims paused.');
  }else if(action==='refresh'){
   const state=JSON.parse(fs.readFileSync(dir+'/state.json'));
   try{
    assert.equal((await db.query('SELECT enabled FROM enrichment_ai_controls WHERE id')).rows[0].enabled,false);
    const summaries=[];
    for(const kind of ['basic','research']){
     await db.query('BEGIN');
     await db.query('SELECT id FROM enrichment_controls WHERE id FOR UPDATE');
     assert.equal((await db.query("SELECT count(*)::int n FROM enrichment_tasks WHERE status='processing' AND org_id=1 AND lead_id IN (167,449)")).rows[0].n,0);
     await db.query('UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[167,449] WHERE id');
     await db.query("UPDATE enrichment_tasks SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL WHERE org_id=1 AND lead_id IN (167,449) AND kind="+quote(kind));
     const tasks=(await db.query('SELECT value AS task FROM enrichment_claim('+quote(kind)+',2) value')).rows;
     await db.query('UPDATE enrichment_controls SET enabled=false WHERE id');await db.query('COMMIT');
     assert.equal(tasks.length,2,'Expected two eligible clinic tasks');
     for(const {task} of tasks){
      const child=cp.spawnSync(process.execPath,['/home/node/.n8n/enrichment-stage/worker.cjs',String(task.id),task.lease],{encoding:'utf8',timeout:65000,maxBuffer:3*1024*1024});
      assert.equal(child.status,0,'Worker failed');const output=JSON.parse(child.stdout);
      const saved=(await db.query('SELECT enrichment_finish('+quote(JSON.stringify(output))+'::jsonb) AS result')).rows[0].result;
      assert.equal(saved.saved,true,'Source did not complete; task recovery retained');
      summaries.push({kind,task_id:task.id,status:output.status});
     }
    }
    fs.writeFileSync(dir+'/results.json',JSON.stringify(summaries,null,2),{mode:0o600});console.log(JSON.stringify(summaries));
   }finally{
    await db.query('ROLLBACK');
    const ids=state.lead_ids===null?'NULL':'ARRAY['+state.lead_ids.map(id=>{assert(Number.isSafeInteger(id));return id;}).join(',')+']::integer[]';
    await db.query('UPDATE enrichment_controls SET enabled='+(state.enabled?'true':'false')+',lead_ids='+ids+' WHERE id');
    console.log('Restored previous enrichment controls; AI/Abstract unchanged.');
   }
  }else throw Error('Expected prepare or refresh');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
