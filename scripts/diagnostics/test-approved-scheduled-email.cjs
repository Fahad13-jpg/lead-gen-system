'use strict';
// One explicitly approved email. Real n8n timer and Gmail; isolated SQLite.
// This is a transport/timer check, not a production SQL campaign activation.
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const dir=path.resolve('.local/email-scheduled-verification-20261020'),name='email-scheduled-verification-20261020';
const ref='ErvKkvbo4c5GQjPn',from='mohmmadfahad53408@gmail.com',to='fah7861234@gmail.com';
const subject='Email executor scheduled verification';
const body='This is your scheduled email-executor test. Please reply TEST RECEIVED to confirm reply detection.';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:480000,maxBuffer:12000000});if(r.status!==0)throw Error('Scheduled test operation failed; inspect retained state, never resend automatically');return r.stdout.trim();}
assert.equal(process.argv[2],'--approved-single-send');
assert(!fs.existsSync(dir),'Test already prepared; never replay this command');
const service=JSON.parse(docker(['inspect','n8n']))[0];
const raw=docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT json_agg(json_build_object('id',id,'name',name,'type',type,'data',data)) FROM credentials_entity WHERE id='${ref}'; COMMIT;`);
const creds=JSON.parse(raw.split('\n').find(s=>s.startsWith('[')));assert.equal(creds.length,1);assert.equal(creds[0].type,'gmailOAuth2');
fs.mkdirSync(dir);fs.mkdirSync(path.join(dir,'results'));
fs.writeFileSync(path.join(dir,'credentials.encrypted.json'),JSON.stringify(creds),{flag:'wx'});
const request=require('../lead-strategy/v2/gmail-message.cjs').prepare({step:1,to_email:to,subject_line:subject,email_body:body},{email:from,credential_ref:ref});
const send=structuredClone(require('../../workflows/07a_email_outreach_executor.json').nodes.find(n=>n.name==='Send Email - Gmail'));
send.parameters.url='https://gmail.googleapis.com/gmail/v1/users/me/messages/send';send.position=[600,0];
const expiry=Date.now()+30*60000;
const code=(id,n,js,x)=>({id,name:n,type:'n8n-nodes-base.code',typeVersion:2,position:[x,0],parameters:{mode:'runOnceForAllItems',jsCode:js}});
const w={id:'approvedScheduledEmail',name:'Approved single scheduled email test',active:false,settings:{executionOrder:'v1'},nodes:[
 {id:'timer',name:'Schedule Trigger',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'seconds',secondsInterval:10}]}}},
 code('eligible','One Test Only',"const fs=require('fs');if(Date.now()>"+expiry+"||fs.existsSync('/results/attempt.json'))return [];return [{json:{}}];",150),
 {id:'profile',name:'Verify Mailbox',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[300,0],retryOnFail:false,parameters:{method:'GET',url:'https://gmail.googleapis.com/gmail/v1/users/me/profile',authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',options:{timeout:20000}},credentials:send.credentials},
 code('charge','Durable One Attempt',"const fs=require('fs');if($input.first().json.emailAddress!=="+JSON.stringify(from)+")throw Error('MAILBOX_MISMATCH');if(Date.now()>"+expiry+")return [];try{fs.writeFileSync('/results/attempt.json',JSON.stringify({at:new Date().toISOString(),execution:$execution.id,to:"+JSON.stringify(to)+",subject:"+JSON.stringify(subject)+"}),{flag:'wx'});}catch(e){if(e.code==='EEXIST')return [];throw e;}return [{json:{gmail_request:"+JSON.stringify(request)+"}}];",450),
 send,
 code('receipt','Record Receipt',"const fs=require('fs');const r=$input.first().json;const ok=/^[a-f0-9]{8,64}$/i.test(r.id||'')&&/^[a-f0-9]{8,64}$/i.test(r.threadId||'');const result={at:new Date().toISOString(),execution:$execution.id,provider_accepted:ok,retry_allowed:false,...(ok?{id:r.id,threadId:r.threadId}:{state:'ambiguous_do_not_retry'})};fs.writeFileSync('/results/result.json',JSON.stringify(result),{flag:'wx'});return [{json:result}];",800)
],connections:{}};
for(const [a,b] of [['Schedule Trigger','One Test Only'],['One Test Only','Verify Mailbox'],['Verify Mailbox','Durable One Attempt'],['Durable One Attempt',send.name],[send.name,'Record Receipt']])w.connections[a]={main:[[{node:b,type:'main',index:0}]]};
fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(w));
fs.writeFileSync(path.join(dir,'approval.json'),JSON.stringify({to,from,subject,body,max_sends:1,approved_by:'user yes in chat',scope:'scheduled transport test only',expires_at:new Date(expiry).toISOString()},null,2));
fs.writeFileSync(path.join(dir,'run.cjs'),String.raw`
const fs=require('fs'),cp=require('child_process');
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/test-state',N8N_ENCRYPTION_KEY:process.env.N8N_ENCRYPTION_KEY||JSON.parse(fs.readFileSync('/home/node/.n8n/config')).encryptionKey,NODE_FUNCTION_ALLOW_BUILTIN:'fs'};
async function main(){
for(const args of [['import:credentials','--input=/input/credentials.encrypted.json'],['import:workflow','--input=/input/workflow.json'],['update:workflow','--id=approvedScheduledEmail','--active=true']]){
 const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:12000000});if(r.status!==0)throw Error('scratch_setup_failed');
}
const log=fs.openSync('/tmp/server.log','w'),server=cp.spawn('n8n',['start'],{env,stdio:['ignore',log,log]});
try{
 for(let i=0;i<150;i++){
  await new Promise(r=>setTimeout(r,2000));
  if(fs.existsSync('/results/result.json'))return;
  if(server.exitCode!==null)throw Error('scratch_server_exited');
 }
 throw Error(fs.existsSync('/results/attempt.json')?'attempt_uncertain_do_not_retry':'timer_did_not_complete');
}finally{server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),new Promise(r=>setTimeout(r,10000))]);if(server.exitCode===null)server.kill('SIGKILL');fs.closeSync(log);}
}
main().catch(e=>{fs.writeFileSync('/results/diagnostic.json',JSON.stringify({error:e.message}));process.exitCode=1;});
`);
const vars=(service.Config.Env||[]).filter(v=>v.startsWith('N8N_ENCRYPTION_KEY=')||v.startsWith('NODE_OPTIONS='));
docker(['create','--name',name,'--network','bridge','--tmpfs','/tmp:rw,mode=1777','--mount','type=bind,source='+dir+',target=/input,readonly','--mount','type=bind,source='+path.join(dir,'results')+',target=/results','--volumes-from','n8n:ro','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false',...vars.flatMap(v=>['--env',v]),'--entrypoint','node',service.Image,'/input/run.cjs']);
try{docker(['start','-a',name]);}
finally{
 docker(['stop','--time','10',name]);
 fs.unlinkSync(path.join(dir,'credentials.encrypted.json'));
}
const result=JSON.parse(fs.readFileSync(path.join(dir,'results/result.json')));
fs.writeFileSync('documentation/strategy-contract-v2/email-scheduled-verification-20261020.json',JSON.stringify({...result,scope:'native timer and Gmail transport; isolated SQLite; no production SQL campaign activation',production_changed:false},null,2));
console.log(JSON.stringify(result));
