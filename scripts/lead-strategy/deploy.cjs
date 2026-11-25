'use strict';
// Run inside n8n. Imports only 06C; never enables a sending workflow.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/home/node/.n8n/strategy-deployment-015',id='27W04lgTGdgFMWUx';
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try {
  const action=process.argv[2];
  if(action==='inspect'){
   console.log(JSON.stringify((await db.query("SELECT id,name,active FROM workflow_entity WHERE id="+q(id)+" OR name ~* '(outreach|follow.?up)' ORDER BY name")).rows));
   console.log(JSON.stringify((await db.query("SELECT count(*)::int running FROM execution_entity WHERE status IN ('running','new')")).rows));
  }else if(action==='import'){
   const desired=JSON.parse(fs.readFileSync('/tmp/06C_outreach_strategy_generator.json'));
   assert(desired.nodes.some(n=>n.name==='Build Preview'));assert(desired.nodes.some(n=>n.name==='Save Versioned Strategy'));
   assert.equal((await db.query("SELECT count(*)::int n FROM execution_entity WHERE status IN ('running','new')")).rows[0].n,0,'Wait for current executions');
   assert.equal((await db.query("SELECT count(*)::int n FROM workflow_entity WHERE active AND name ~* '(outreach|follow.?up)' AND id<>"+q(id))).rows[0].n,0,'Sending workflow already active: review before deploying');
   const old=(await db.query('SELECT * FROM workflow_entity WHERE id='+q(id))).rows[0];assert(old);
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   if(!fs.existsSync(dir+'/before.json'))fs.writeFileSync(dir+'/before.json',JSON.stringify(old),{mode:0o600});
   await db.query(fs.readFileSync('/tmp/015_outreach_strategy.sql','utf8'));
   await db.query('UPDATE strategy_controls SET enabled=false WHERE id');
   const w={...desired,id,active:false};fs.writeFileSync(dir+'/import.json',JSON.stringify(w),{mode:0o600});
   for(const args of [['import:workflow','--input='+dir+'/import.json','--projectId=xLW48WqYIkxblH0N'],['update:workflow','--id='+id,'--active=true']]){
    const r=cp.spawnSync('n8n',args,{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
    if(r.status!==0){fs.writeFileSync(dir+'/failure.log',(r.stdout||'')+(r.stderr||''),{mode:0o600});throw Error('Import failed; planner claims remain paused; backup retained');}
   }
   console.log('Migration 015 applied; 06C imported. Restart n8n, then verify before enabling claims.');
  }else if(action==='verify'){
   const expected=JSON.parse(fs.readFileSync(dir+'/import.json'));
   const live=(await db.query('SELECT nodes,connections,active FROM workflow_entity WHERE id='+q(id))).rows[0];
   assert.deepEqual(live.nodes,expected.nodes);assert.deepEqual(live.connections,expected.connections);assert(live.active);
   assert.equal((await db.query('SELECT count(*)::int n FROM strategy_ai_controls WHERE enabled')).rows[0].n,0);
   console.log('Verified live 06C matches the tested file; strategy AI remains disabled.');
  }else if(action==='resume'){
   assert.equal((await db.query("SELECT count(*)::int n FROM execution_entity WHERE status IN ('running','new') AND \"workflowId\"="+q(id))).rows[0].n,0);
   await db.query('UPDATE strategy_controls SET enabled=true WHERE id');
   console.log('Planner queue enabled. No sending workflows or external verification settings changed.');
  }else throw Error('Expected inspect, import, verify or resume');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
