'use strict';
// Runs inside n8n. Patch the existing live validator without replacing its graph.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/home/node/.n8n/enrichment-stage/trust-backup';
const file=dir+'/state.json';
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});
 await db.connect();
 try {
  const action=process.argv[2];
  if(action==='prepare'){
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   if(fs.existsSync(file))throw Error('Deployment state already exists; inspect before repeating');
   const controls=(await db.query('SELECT enabled FROM enrichment_controls WHERE id')).rows[0];
   const flags=(await db.query('SELECT (SELECT enabled FROM enrichment_ai_controls WHERE id) AS ai, (SELECT verification_enabled FROM contact_controls WHERE id) AS verification')).rows[0];
   assert.equal(flags.ai,false);assert.equal(flags.verification,false);
   const old=(await db.query("SELECT * FROM workflow_entity WHERE id='GcF1OfshaLH1zJoQ'")).rows[0];
   assert(old);fs.writeFileSync(dir+'/workflow-before.json',JSON.stringify(old),{mode:0o600});
   fs.writeFileSync(file,JSON.stringify({enabled:controls.enabled,active:old.active}),{mode:0o600});
   await db.query('UPDATE enrichment_controls SET enabled=false WHERE id');
   console.log('Saved workflow and control state; enrichment claims paused.');
  }else if(action==='import'){
   assert.equal((await db.query('SELECT enabled FROM enrichment_controls WHERE id')).rows[0].enabled,false);
   assert.equal((await db.query("SELECT count(*)::int AS n FROM execution_entity WHERE status IN ('running','new')")).rows[0].n,0,'Wait for running executions');
   const old=JSON.parse(fs.readFileSync(dir+'/workflow-before.json'));
   const desired=JSON.parse(fs.readFileSync('/tmp/06B_ai_deep_research.json'));
   const source=desired.nodes.find(n=>n.name==='Validate AI Evidence');
   const target=old.nodes.find(n=>n.name==='Validate AI Evidence');
   assert(source&&target);assert.equal(target.type,source.type);assert.equal(source.parameters.mode,'runOnceForEachItem');
   target.parameters.jsCode=source.parameters.jsCode;target.parameters.mode=source.parameters.mode;
   const w={id:old.id,name:old.name,nodes:old.nodes,connections:old.connections,settings:old.settings,pinData:old.pinData||{},active:false};
   fs.writeFileSync(dir+'/import.json',JSON.stringify(w),{mode:0o600});
   for(const args of [['import:workflow','--input='+dir+'/import.json','--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+old.id,'--active='+String(JSON.parse(fs.readFileSync(file)).active)]]){
    const result=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
    if(result.status!==0)throw Error('Workflow CLI failed; claims remain paused and backup retained');
   }
   console.log('Patched live evidence validator; restart n8n before resume.');
  }else if(action==='resume'){
   const saved=JSON.parse(fs.readFileSync(file));
   const live=(await db.query("SELECT nodes,connections FROM workflow_entity WHERE id='GcF1OfshaLH1zJoQ'")).rows[0];
   const expected=JSON.parse(fs.readFileSync(dir+'/import.json'));
   assert.deepEqual(live.nodes,expected.nodes);assert.deepEqual(live.connections,expected.connections);
   assert((await db.query("SELECT to_regprocedure('lead_trust_report(integer,integer)') IS NOT NULL AS present")).rows[0].present);
   await db.query('UPDATE enrichment_controls SET enabled='+ (saved.enabled?'true':'false')+' WHERE id');
   console.log('Verified deployed nodes and restored previous enrichment switch; AI and Abstract unchanged.');
  }else throw Error('Expected prepare, import or resume');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
