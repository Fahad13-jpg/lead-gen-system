'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const cfg=(await db.query('SELECT enabled FROM enrichment_controls WHERE id')).rows[0];
  if(cfg.enabled)throw Error('Pause enrichment before import');
  const ai=(await db.query('SELECT enabled FROM enrichment_ai_controls WHERE id')).rows[0];if(ai.enabled)throw Error('AI must be paused');
  if((await db.query("SELECT count(*)::int n FROM execution_entity WHERE status IN ('running','new')")).rows[0].n)throw Error('Executions still running');
  const id='GcF1OfshaLH1zJoQ',dir='/home/node/.n8n/enrichment-stage/native-backup';fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const old=(await db.query('SELECT * FROM workflow_entity WHERE id=$1',[id])).rows; if(old.length!==1)throw Error('Workflow missing');
  fs.writeFileSync(dir+'/before-'+Date.now()+'.json',JSON.stringify(old),{mode:0o600});
  const w=JSON.parse(fs.readFileSync('/tmp/06B_ai_deep_research.json'));w.id=id;w.active=false;
  fs.writeFileSync(dir+'/import.json',JSON.stringify(w));
  for(const args of [['import:workflow','--input='+dir+'/import.json','--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+id,'--active=true']]){
   const r=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});if(r.status!==0)throw Error('Native workflow import failed');
  }
  console.log('Imported native 06B. Restart n8n before resuming enrichment. AI remains disabled.');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
