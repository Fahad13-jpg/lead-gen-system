'use strict';
// One approved test through installed gate/claim/transport/finish. No campaign tick.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir=path.resolve('.local/whatsapp-owned-test-20261107'),candidate=JSON.parse(fs.readFileSync(dir+'/candidate.json'));assert(Date.parse(candidate.expires_at)>Date.now(),'TEST_EXPIRED');
const approval=JSON.parse(fs.readFileSync('.local/whatsapp-callback/single-message-approval.json'));assert(approval.approved_by_user&&!approval.sent&&approval.max_messages===1);
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:180000,maxBuffer:4e6});assert.equal(r.status,0,'GUARDED_TEST_COMMAND_FAILED; private details suppressed');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
assert.equal(sql("SELECT count(*) FROM outreach_activities WHERE org_id=1 AND channel='whatsapp' AND dispatch_metadata->>'version'='whatsapp_v1'"),'0','EXISTING_ATTEMPT_REQUIRES_RECONCILIATION');
fs.writeFileSync(dir+'/attempt-started.json',JSON.stringify({at:new Date().toISOString(),automatic_retry:false}),{flag:'wx'});
const name='whatsapp-owned-canary-'+Date.now(),service=JSON.parse(docker(['inspect','n8n']))[0],network=Object.keys(service.NetworkSettings.Networks)[0];assert(network);
let created=false;const encrypted=dir+'/credentials.encrypted.json';
(async()=>{try{
 const ip=await require('../whatsapp/network.cjs').resolveIPv4();fs.writeFileSync(dir+'/network.json',JSON.stringify({ip,at:Date.now()}));
 const rows=JSON.parse(sql("SELECT json_agg(json_build_object('id',id,'name',name,'type',type,'data',data)) FROM credentials_entity WHERE id IN ('kKL9mQObSvnb3bkX','Scc3yxojKZkvXpOL')"));assert.equal(rows.length,2);fs.writeFileSync(encrypted,JSON.stringify(rows));
 fs.writeFileSync(dir+'/run.cjs',String.raw`
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const result={messages_attempted:0,paid_spend_authorized:0,automatic_retry:false,followups:0};let db;
(async()=>{try{
 const config=JSON.parse(fs.readFileSync('/home/node/.n8n/config')),env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/owned-test-state',N8N_ENCRYPTION_KEY:process.env.N8N_ENCRYPTION_KEY||config.encryptionKey};
 for(const args of [['import:credentials','--input=/test/credentials.encrypted.json'],['export:credentials','--all','--decrypted','--output=/tmp/credentials.json']]){const p=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:120000,maxBuffer:4e6});assert.equal(p.status,0);}
 const credentials=JSON.parse(fs.readFileSync('/tmp/credentials.json'));fs.unlinkSync('/tmp/credentials.json');
 const wa=credentials.find(c=>c.id==='kKL9mQObSvnb3bkX'),pg=credentials.find(c=>c.id==='Scc3yxojKZkvXpOL').data;assert.equal(wa.type,'whatsAppApi');assert.equal(String(wa.data.businessAccountId),'1844540190060485');assert.equal(pg.database,'lead_db');
 const Client=require('module').createRequire('/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/package.json')('pg').Client;
 db=new Client({host:pg.host,port:Number(pg.port||5432),database:pg.database,user:pg.user,password:pg.password,ssl:pg.ssl&&pg.ssl!=='disable'?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,statement_timeout:20000});await db.connect();
 const candidate=JSON.parse(fs.readFileSync('/test/candidate.json')),network=JSON.parse(fs.readFileSync('/test/network.json'));assert(Date.now()-network.at<300000);
 const root='/home/node/.n8n/custom/lead-system/scripts/whatsapp/',fetch=require(root+'network.cjs').createFetch({resolveIPv4:async()=>network.ip});
 const output=await require(root+'runner.cjs').run(candidate,{mode:'live',liveEnabled:true,executeQuery:async q=>(await db.query(q)).rows[0]?.result,
 resolveCredential:async a=>{assert.equal(a.org_id,1);assert.equal(a.credential_ref,wa.id);assert.equal(a.phone_number_id,'1458187094033954');assert.equal(a.waba_id,'1844540190060485');return {...a,access_token:wa.data.accessToken,expires_at:candidate.expires_at};},
 fetch:async(url,options)=>{assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.to,'923175153405');assert.equal(body.template.name,'leadgen_integration_test_v1');assert.equal(body.template.language.code,'en');assert.equal(++result.messages_attempted,1);return fetch(url,options);}});
 result.outcome=output;result.delivery_verified=false;
}catch{result.state='test_unconfirmed';result.reconciliation_required=true;}finally{if(db)await db.end().catch(()=>{});fs.writeFileSync('/results/send-result.json',JSON.stringify(result,null,2));}})();
`);
 fs.mkdirSync(dir+'/results',{recursive:true});const keys=service.Config.Env.filter(x=>x.startsWith('N8N_ENCRYPTION_KEY='));
 docker(['create','--name',name,'--network',network,'--tmpfs','/tmp:rw,mode=1777','--volumes-from','n8n:ro','--mount','type=bind,source='+dir+',target=/test,readonly','--mount','type=bind,source='+dir+'/results,target=/results','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false',...keys.flatMap(x=>['--env',x]),'--entrypoint','node',service.Image,'/test/run.cjs']);created=true;docker(['start','-a',name]);
 const result=JSON.parse(fs.readFileSync(dir+'/results/send-result.json'));console.log(JSON.stringify(result));
}finally{if(created)try{docker(['rm','-f',name]);}catch{}if(fs.existsSync(encrypted))fs.unlinkSync(encrypted);}})().catch(()=>{console.error('TEST_STOPPED; inspect private attempt record before any retry');process.exitCode=1;});
