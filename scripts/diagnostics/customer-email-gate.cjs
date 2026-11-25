'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/owned-email-test-20261115',file='database/migrations/059_customer_email_transport_gate.sql';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:1000000});assert.equal(r.status,0,String(r.stderr||'DOCKER_FAILED').slice(0,1200));return r.stdout.trim();}
async function main(){const mode=process.argv[2];assert.ok(['--scratch','--apply-local'].includes(mode));fs.mkdirSync(dir,{recursive:true});
 const source=fs.readFileSync(file,'utf8'),body=source.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
 assert.ok(['unclear','not_assessed'].includes(require('../lead-strategy/runtime.cjs').qualify(undefined,{key:'generic'},[],{}).fit));
 if(mode==='--scratch'){
  const container='lead_diag_pg_20261011',info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.HostConfig.NetworkMode,'none');if(!info.State.Running)docker(['start',container]);try{
   let ready=false;for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore',timeout:3000}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
   docker(['exec','-i',container,'psql','-Xq','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','postgres'],'BEGIN;\n'+body+'\n'+fs.readFileSync('tests/lead-strategy/customer-transport-marker.sql','utf8')+'\nROLLBACK;');
   const r={passed:true,rolled_back:true,customer_format_checked:true,native_and_legacy_preserved:true,missing_business_evidence_not_invented:true,sends:0};fs.writeFileSync(dir+'/gate-scratch.json',JSON.stringify(r));console.log(JSON.stringify(r));
  }finally{if(!info.State.Running)docker(['stop',container]);}return;
 }
 assert.equal(JSON.parse(fs.readFileSync(dir+'/gate-scratch.json')).passed,true);assert.ok(!fs.existsSync(dir+'/gate-installed.json'),'ALREADY_INSTALLED');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});let db;try{db=await pool.connect();
  const read=async()=>(await db.query("SELECT pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text acl FROM pg_proc p WHERE p.oid='outreach_email_transport_marker_allowed(jsonb)'::regprocedure")).rows[0];
  const before=await read();assert.ok(before.definition.includes("customer_email_v1")&&before.definition.includes("<>"),'BASELINE_CHANGED');
  fs.writeFileSync(dir+'/gate-rollback.sql',before.definition);await db.query('BEGIN');
  const approval=(await db.query("SELECT pg_get_functiondef('strategy_approval(jsonb)'::regprocedure) d")).rows[0].d;assert.ok(approval.includes('acknowledge_customer_content_hash')&&approval.includes('CUSTOMER_CONTENT_ACK_REQUIRED'));
  await db.query(body);const after=await read();assert.equal(after.owner,before.owner);assert.equal(after.acl,before.acl);await db.query(fs.readFileSync('tests/lead-strategy/customer-transport-marker.sql','utf8'));await db.query('COMMIT');
  const r={installed:true,migration:'059',owners_and_grants_preserved:true,approval_acknowledgement_retained:true,senders_changed:0,campaigns_approved:0,sends:0};fs.writeFileSync(dir+'/gate-installed.json',JSON.stringify(r));console.log(JSON.stringify(r));
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db?.release();await pool.end();}
}
main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'CUSTOMER_EMAIL_GATE_CHECK_FAILED');process.exitCode=1;});
