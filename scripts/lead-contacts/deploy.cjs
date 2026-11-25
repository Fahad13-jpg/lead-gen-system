'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{if(process.env.DB_POSTGRESDB_DATABASE!=='lead_db')throw Error('Unexpected database');
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const controls=await db.query('SELECT discovery_enabled,verification_enabled FROM contact_controls WHERE id');if(controls.rows[0].discovery_enabled||controls.rows[0].verification_enabled)throw Error('Workers must be paused before import');
  fs.mkdirSync('/tmp/contact-deploy',{recursive:true,mode:0o700});
  for(const [file,id,active] of [['03b_email_scraper.json','uCZOwnPIZXN6UjQF',true],['05_email_validation(Batch).json','PhPwFzvnz5uOmYQN',true],['07a_email_outreach_executor.json','gTjsUEP8VLlxKfWf',false]]){
   if(process.argv.includes('--outreach-only')&&active)continue;
   const old=await db.query('SELECT * FROM workflow_entity WHERE id=$1',[id]);if(old.rows.length!==1)throw Error('Missing workflow');if(!active&&old.rows[0].active)throw Error('Outreach unexpectedly active');
   const backup='/tmp/contact-deploy/previous-'+id+'.json';if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(old.rows),{mode:0o600});
   const w=JSON.parse(fs.readFileSync('/tmp/'+file));w.id=id;w.name=w.name||old.rows[0].name;w.active=false;const path='/tmp/contact-deploy/'+file;fs.writeFileSync(path,JSON.stringify(w));
   for(const args of [['import:workflow','--input='+path,'--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+id,'--active='+active]]){console.log('Deploy '+w.name+': '+args[0]);const r=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:240000});if(r.status!==0)throw Error(r.error?.message||r.stdout+r.stderr);}
  }
  await db.query('UPDATE contact_controls SET monthly_requests=100 WHERE id');console.log('Imported contact workflows; 100-request monthly cap configured; processing remains paused until canary.');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
