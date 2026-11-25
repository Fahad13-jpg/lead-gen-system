'use strict';
// One Gmail getProfile request through the installed n8n HTTP/OAuth client.
// SQLite scratch execution; production DB access is read-only; service state unchanged.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve('.local/gmail-profile-20261019'),name='gmail-profile-check-20261019';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:240000,maxBuffer:12e6});if(r.status!==0)throw Error('PROFILE_CHECK_COMMAND_FAILED');return r.stdout.trim();}
const service=JSON.parse(docker(['inspect','n8n']))[0];
const active=docker(['exec','-i','postgres_db','psql','-XAt','-U','n8n_user','-d','lead_db'],"SELECT count(*) FROM workflow_entity WHERE id IN ('gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ') AND active");assert.equal(active,'0','Outreach workflows must remain inactive');
const draft=JSON.parse(fs.readFileSync('.local/email-sender-review-20261019.json','utf8'));
const ref=draft.binding.credential_ref;assert(/^[A-Za-z0-9]+$/.test(ref));
const raw=docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT json_agg(json_build_object('id',id,'name',name,'type',type,'data',data)) FROM credentials_entity WHERE id='${ref}'; COMMIT;`);
const credentials=JSON.parse(raw.split('\n').find(s=>s.startsWith('[')));assert.equal(credentials.length,1);assert.equal(credentials[0].type,'gmailOAuth2');assert.equal(typeof credentials[0].data,'string');
fs.mkdirSync(dir,{recursive:true});const encrypted=path.join(dir,'credentials.encrypted.json');fs.writeFileSync(encrypted,JSON.stringify(credentials),{flag:'wx'});
const w={id:'scratchGmailProfile',name:'Scratch Gmail account profile only',active:false,settings:{executionOrder:'v1'},nodes:[
 {id:'start',name:'Manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{},position:[0,0]},
 {id:'profile',name:'Profile Only',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[200,0],retryOnFail:false,parameters:{method:'GET',url:'https://gmail.googleapis.com/gmail/v1/users/me/profile',authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',options:{timeout:20000}},credentials:{gmailOAuth2:{id:ref,name:credentials[0].name}}},
 {id:'check',name:'Identity Check',type:'n8n-nodes-base.code',typeVersion:2,position:[400,0],parameters:{mode:'runOnceForEachItem',jsCode:'return {json:{profile_verified:typeof $json.emailAddress===\'string\'&&$json.emailAddress.toLowerCase()==='+JSON.stringify(draft.binding.email)+',inbox_read:false,sent:false}};'}}
],connections:{Manual:{main:[[{node:'Profile Only',type:'main',index:0}]]},'Profile Only':{main:[[{node:'Identity Check',type:'main',index:0}]]}}};
fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(w));
fs.writeFileSync(path.join(dir,'run.cjs'),String.raw`
const fs=require('fs'),cp=require('child_process');
const stored=JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8'));
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/profile-state',N8N_ENCRYPTION_KEY:process.env.N8N_ENCRYPTION_KEY||stored.encryptionKey};
const output={profile_verified:false,inbox_read:false,sent:false,live_database_changed:false};
for(const args of [['import:credentials','--input=/tmp/profile/credentials.encrypted.json'],['import:workflow','--input=/tmp/profile/workflow.json'],['execute','--id=scratchGmailProfile','--rawOutput']]){
 const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:12e6});
 if(args[0]!=='execute'){if(r.status!==0){output.reason='scratch_import_failed';break;}continue;}
 let result;for(let i=0;i<(r.stdout||'').length;i++){if(r.stdout[i]!=='{')continue;try{result=JSON.parse(r.stdout.slice(i,r.stdout.lastIndexOf('}')+1));break;}catch{}}
 const data=result?.data?.resultData||result?.resultData;
 const check=data?.runData?.['Identity Check']?.[0]?.data?.main?.[0]?.[0]?.json;
 if(check){output.profile_verified=check.profile_verified===true;output.reason=output.profile_verified?'matched':'mailbox_mismatch';}
 else {
  const error=data?.error||{};const text=JSON.stringify(error)+' '+(r.stdout||'')+' '+(r.stderr||'');
  // Return only allowlisted classifications; never raw OAuth errors or tokens.
  output.reason=/invalid_grant|revoked|expired.*refresh/i.test(text)?'oauth_reconnect_required':/decrypt|encryption/i.test(text)?'credential_decryption_failed':/insufficient.*scope|insufficient.*permission/i.test(text)?'insufficient_permissions':/ETIMEDOUT|ECONNRESET|ENETUNREACH|timed out/i.test(text)?'network_failure':'profile_check_failed';
 }
}
fs.writeFileSync('/tmp/profile-result.json',JSON.stringify(output,null,2));
`);
const key=(service.Config.Env||[]).filter(v=>v.startsWith('N8N_ENCRYPTION_KEY='));
docker(['create','--name',name,'--network','bridge','--volumes-from','n8n:ro','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false',...key.flatMap(v=>['--env',v]),'--entrypoint','node',service.Image,'/tmp/profile/run.cjs']);
docker(['cp',dir+'/.',name+':/tmp/profile']);docker(['start','-a',name]);
docker(['cp',name+':/tmp/profile-result.json',path.join(dir,'result.json')]);
const result=JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8'));
const status=JSON.parse(docker(['inspect',name]))[0];assert.equal(status.State.Running,false);
docker(['rm',name]);fs.unlinkSync(encrypted);
fs.writeFileSync('documentation/strategy-contract-v2/gmail-profile-verification-20261019.json',JSON.stringify({...result,checked_at:new Date().toISOString(),send_permission_verified:false},null,2)+'\n');console.log(JSON.stringify(result));
