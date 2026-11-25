'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 if(process.env.DB_POSTGRESDB_DATABASE!=='lead_db')throw Error('Unexpected database');
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const mode=process.argv[2],dir='/home/node/.n8n/contact-stage/contact-quality-deploy';fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(mode==='pause'){
   await db.query('BEGIN');const c=await db.query('SELECT * FROM contact_controls WHERE id FOR UPDATE');
   if(c.rows[0].verification_enabled)throw Error('Verification unexpectedly enabled');
   const running=await db.query("SELECT count(*)::int n FROM contact_tasks WHERE status='processing'");if(running.rows[0].n)throw Error('Wait for processing contact tasks');
   if(!fs.existsSync(dir+'/controls.json'))fs.writeFileSync(dir+'/controls.json',JSON.stringify(c.rows[0]),{mode:0o600});
   const old=await db.query("SELECT * FROM workflow_entity WHERE id='uCZOwnPIZXN6UjQF'");if(!fs.existsSync(dir+'/workflow.json'))fs.writeFileSync(dir+'/workflow.json',JSON.stringify(old.rows),{mode:0o600});
   const baseline=await db.query('SELECT count(*)::int n FROM lead_contacts');fs.writeFileSync(dir+'/baseline.json',JSON.stringify({contacts:baseline.rows[0].n}));
   await db.query('UPDATE contact_controls SET discovery_enabled=false WHERE id');await db.query('COMMIT');console.log('Contact discovery paused for migration; backups preserved; verification stays disabled.');
  }else if(mode==='import'){
   const cfg=await db.query('SELECT discovery_enabled OR verification_enabled AS active FROM contact_controls');if(cfg.rows[0].active)throw Error('Workers must be paused');
   for(const [file,id] of [['03b_email_scraper.json','uCZOwnPIZXN6UjQF'],['03c_facebook_contact_discovery.json','contactFbV2']]){
    const w=JSON.parse(fs.readFileSync('/tmp/'+file));w.id=id;w.active=false;const path=dir+'/'+file;fs.writeFileSync(path,JSON.stringify(w));
    for(const args of [['import:workflow','--input='+path,'--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+id,'--active=true']]){console.log(args[0]+' '+w.name);const r=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:240000});if(r.status!==0)throw Error(r.error?.message||r.stdout+r.stderr);}
   }
   console.log('Imported contact qualification and optional Facebook workflows. Processing remains paused.');
  }else if(mode==='canary'){
   await db.query('BEGIN');const c=await db.query('SELECT * FROM contact_controls WHERE id FOR UPDATE');if(c.rows[0].verification_enabled||c.rows[0].discovery_enabled)throw Error('Canary requires paused workers');
   const selected=await db.query("SELECT s.id AS staging_id FROM staging_leads s JOIN cleaning_links l ON l.staging_id=s.id AND l.org_id=s.org_id WHERE s.id IN (118,121,122) AND contact_eligible(l.org_id,l.cleaned_id,s.id)");
   const ids=selected.rows.map(r=>r.staging_id);if(ids.length!==3)throw Error('Expected three representative canary leads');
   await db.query('SELECT contact_sync()');
   await db.query("UPDATE contact_tasks SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL WHERE kind='discovery' AND staging_id=ANY($1::int[]) AND status<>'processing'",[ids]);
   await db.query('UPDATE contact_controls SET discovery_enabled=true,staging_ids=$1 WHERE id',[ids]);await db.query('COMMIT');
   fs.writeFileSync(dir+'/canary.json',JSON.stringify(ids));console.log('Free source-first canary enabled for staging IDs: '+ids.join(', '));
  }else if(mode==='resume'){
   const previous=JSON.parse(fs.readFileSync(dir+'/controls.json'));
   await db.query('BEGIN');const c=await db.query('SELECT * FROM contact_controls WHERE id FOR UPDATE');if(c.rows[0].verification_enabled)throw Error('Verification unexpectedly enabled');
   // One-time upgrade retry, preserving completed audit history and avoiding repeated reruns.
   if(!fs.existsSync(dir+'/resumed.json'))await db.query("UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL,last_error=NULL WHERE kind='discovery' AND status IN ('found','not_found','blocked','failed') AND contact_eligible(org_id,lead_id,staging_id) AND NOT EXISTS(SELECT 1 FROM contact_attempts a WHERE a.task_id=t.id AND a.finished_at IS NOT NULL AND a.result->>'strategy'='contact_evidence_v2')");
   await db.query('UPDATE contact_controls SET discovery_enabled=$1,staging_ids=$2 WHERE id',[previous.discovery_enabled,previous.staging_ids]);await db.query('COMMIT');fs.writeFileSync(dir+'/resumed.json',JSON.stringify({at:new Date().toISOString()}));
   console.log('Restored prior discovery switch and scope. Upgraded eligible tasks queued; verification and its quota unchanged.');
  }else throw Error('Use pause, import, canary or resume');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
