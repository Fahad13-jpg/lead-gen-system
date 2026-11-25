'use strict';
// Run inside n8n after a verified external pg_dump and migration 004.
// Imports the known workflow ID through the supported CLI; keeps claims disabled.
const fs=require('node:fs'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 if(process.env.DB_POSTGRESDB_DATABASE!=='lead_db')throw Error('Unexpected production database');
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const r=await db.query('SELECT * FROM workflow_entity WHERE id=$1',['PnLPSceKs2Rzn4xw']);if(r.rows.length!==1||r.rows[0].active)throw Error('Expected inactive cleaning workflow');
  const control=await db.query('SELECT enabled FROM cleaning_controls WHERE id=true');if(control.rows[0]?.enabled!==false)throw Error('Claims must remain disabled during deployment');
  fs.mkdirSync('/tmp/cleaning-deploy',{recursive:true,mode:0o700});
  fs.writeFileSync('/tmp/cleaning-deploy/previous-workflow.json',JSON.stringify(r.rows),{mode:0o600});
  const w=JSON.parse(fs.readFileSync('/tmp/cleaning-workflow.json'));w.id=r.rows[0].id;w.active=false;
  fs.writeFileSync('/tmp/cleaning-deploy/import.json',JSON.stringify(w));
  for(const args of [['import:workflow','--input=/tmp/cleaning-deploy/import.json','--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+w.id,'--active=true']]){
   console.log('Cleaning deployment: '+args[0]);const p=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:240000});if(p.status!==0)throw Error(p.error?.message||p.stdout+p.stderr);
  }
  console.log('Imported updated cleaning workflow; reload required. Database claims remain disabled.');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
