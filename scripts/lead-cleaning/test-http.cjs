'use strict';
// Isolated n8n HTTP integration test. No provider calls; no production DB writes.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='/tmp/cleaning-n8n-test';
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5681',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
function cli(args,e=env){console.log('Preparing isolated test: '+args[0]);const r=cp.spawnSync('n8n',args,{env:e,encoding:'utf8',timeout:240000});if(r.status!==0)throw Error('n8n '+args[0]+' failed: '+(r.error?.message||r.stdout+r.stderr));}
(async()=>{
 let server;
 try{
  let auth;
  if(process.argv.includes('--reuse')){
   fs.chmodSync(dir+'/verification-key',0o600);auth={name:'X-Lead-Gathering-Key',value:fs.readFileSync(dir+'/verification-key','utf8').trim()};fs.unlinkSync(dir+'/verification-key');
  }else{
  cli(['export:credentials','--id=leadGatheringAuth','--decrypted','--output='+dir+'/auth.json'],process.env);fs.chmodSync(dir+'/auth.json',0o600);
  auth=JSON.parse(fs.readFileSync(dir+'/auth.json'))[0].data;
  cli(['import:credentials','--input='+dir+'/auth.json']);fs.unlinkSync(dir+'/auth.json');
  const w=JSON.parse(fs.readFileSync('/tmp/cleaning-workflow.json'));w.id='cleaningIsolatedTest';w.active=false;
  for(const n of w.nodes)if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
  fs.writeFileSync(dir+'/http-workflow.json',JSON.stringify(w));cli(['import:workflow','--input='+dir+'/http-workflow.json']);cli(['update:workflow','--id='+w.id,'--active=true']);
  }
  const log=fs.openSync(dir+'/http.log','a',0o600);server=cp.spawn('n8n',['start'],{env,stdio:['ignore',log,log]});fs.closeSync(log);
  const get=async(path,authorized=true)=>fetch('http://127.0.0.1:5681/webhook/'+path,{headers:authorized?{[auth.name]:auth.value}:{},signal:AbortSignal.timeout(5000)});
  let ready=false;const deadline=Date.now()+180000;let attempt=0;while(Date.now()<deadline){try{const r=await get('cleaning-status?org_id=930010');if(r.status===200&&r.headers.get('content-type')?.includes('application/json')){const body=await r.json();if(body.org_id===930010&&body.counts){ready=true;break;}}if(attempt%15===0)console.log('Waiting for test webhook registration: HTTP '+r.status);}catch{if(attempt%15===0)console.log('Waiting for isolated server startup');}attempt++;await new Promise(r=>setTimeout(r,1000));}
  assert(ready,'test webhooks did not register');
  let r=await get('cleaning-status?org_id=930010');let j=await r.json();assert(Number(j.counts.cleaned)>=2);assert(Number(j.counts.review)>=1);
  r=await get('cleaning-status?org_id=930010',false);assert([401,403].includes(r.status),'missing authentication accepted');
  r=await get('cleaning-status?org_id=bad');assert.equal(r.status,400);
  r=await get('cleaning-preview?org_id=930010&staging_id=2147483647');assert.equal(r.status,404);
  const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();
  try{const rows=await db.query('SELECT id FROM staging_leads WHERE org_id=930010 ORDER BY id LIMIT 1');const id=rows.rows[0].id;
   r=await get('cleaning-preview?org_id=930010&staging_id='+id);assert.equal(r.status,200);j=await r.json();assert(j.preview);assert.equal(j.proposal.fields.phone,'+923001234567');assert(!j.proposal.lease_token);
   r=await get('cleaning-preview?org_id=930011&staging_id='+id);assert.equal(r.status,404);
  }finally{await db.end();}
  console.log('PASS: authenticated cleaning HTTP status, dry-run preview, invalid input and tenant isolation');
 }finally{if(server){server.kill('SIGTERM');await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,5000);});}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
