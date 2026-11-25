'use strict';
const fs=require('fs'),cp=require('child_process'),{Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{if(process.env.DB_POSTGRESDB_DATABASE!=='lead_db')throw Error('Unexpected database');const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();try{
 const cfg=(await db.query('SELECT enabled FROM enrichment_controls WHERE id')).rows[0];if(cfg.enabled)throw Error('Pause enrichment before importing');
 const dir='/home/node/.n8n/enrichment-stage/deploy-backup';fs.mkdirSync(dir,{recursive:true,mode:0o700});
 for(const [file,id] of [['06A_basic_enrichment.json','iCxcuTaXccj2SnEA'],['06B_ai_deep_research.json','GcF1OfshaLH1zJoQ']]){
  const old=(await db.query('SELECT * FROM workflow_entity WHERE id=$1',[id])).rows;if(old.length!==1)throw Error('Missing workflow');if(!fs.existsSync(dir+'/'+id+'.json'))fs.writeFileSync(dir+'/'+id+'.json',JSON.stringify(old),{mode:0o600});
  const w=JSON.parse(fs.readFileSync('/tmp/'+file));w.id=id;w.active=false;const input=dir+'/'+file;fs.writeFileSync(input,JSON.stringify(w));
  for(const args of [['import:workflow','--input='+input,'--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+id,'--active=true']]){const r=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:240000});if(r.status!==0)throw Error(r.stdout+r.stderr);}
  console.log('Imported '+w.name);
 }
 console.log('Reload n8n to register workflows and webhooks. Enrichment processing remains paused.');
 }finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
