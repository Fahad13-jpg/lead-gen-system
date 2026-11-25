'use strict';
// Run inside n8n after copying tested *.next files into its persistent contact-stage directory.
const fs=require('node:fs'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 if(process.env.DB_POSTGRESDB_DATABASE!=='lead_db')throw Error('Unexpected database');
 const dir='/home/node/.n8n/contact-stage';
 for(const file of ['runtime.cjs','worker.cjs','social-worker.cjs']){const checked=cp.spawnSync(process.execPath,['--check'],{input:fs.readFileSync(dir+'/'+file+'.next','utf8'),encoding:'utf8'});if(checked.status!==0)throw Error('Invalid staged helper '+file);}
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  await db.query('BEGIN');
  const social=await db.query('SELECT pg_try_advisory_xact_lock(49302812) AS locked');if(!social.rows[0].locked)throw Error('Wait for social worker');
  // contact_claim uses this same lock, preventing a new lease during the short install.
  const controls=await db.query('SELECT verification_enabled FROM contact_controls WHERE id FOR UPDATE');
  if(controls.rows.length!==1||controls.rows[0].verification_enabled)throw Error('External verification must remain paused');
  const tasks=await db.query("SELECT count(*)::int n FROM contact_tasks WHERE status='processing'");if(tasks.rows[0].n)throw Error('Wait for active contact tasks before installing');
  const backup=dir+'/backup-'+Date.now();fs.mkdirSync(backup);
  for(const file of ['runtime.cjs','worker.cjs','social-worker.cjs'])fs.copyFileSync(dir+'/'+file,backup+'/'+file);
  try{for(const file of ['runtime.cjs','worker.cjs','social-worker.cjs'])fs.renameSync(dir+'/'+file+'.next',dir+'/'+file);}
  catch(e){for(const file of ['runtime.cjs','worker.cjs','social-worker.cjs'])fs.copyFileSync(backup+'/'+file,dir+'/'+file);throw e;}
  await db.query('COMMIT');console.log('Installed tested contact helpers; backup: '+backup+'; provider settings unchanged.');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
