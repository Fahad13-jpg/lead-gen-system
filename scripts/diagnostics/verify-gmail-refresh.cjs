'use strict';
// Force a 401 using a dummy access token in a SCRATCH credential only.
// Native n8n refreshes it and retries GET profile. No send/inbox access.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const stamp=Date.now(),dir=path.resolve('.local/gmail-refresh-'+stamp),name='gmail-refresh-'+stamp;
const customerArg=process.argv.slice(2);
assert(customerArg.length<=1&&(!customerArg.length||/^--customer-org=[1-9][0-9]{0,8}$/.test(customerArg[0])),'INVALID_CUSTOMER_ORG');
const customerOrg=customerArg.length?Number(customerArg[0].split('=')[1]):null;
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:240000,maxBuffer:12e6});if(r.status!==0)throw Error('PROFILE_CHECK_COMMAND_FAILED');return r.stdout.trim();}
const service=JSON.parse(docker(['inspect','n8n']))[0];
const active=docker(['exec','-i','postgres_db','psql','-XAt','-U','n8n_user','-d','lead_db'],"SELECT count(*) FROM workflow_entity WHERE id IN ('gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ') AND active");assert.equal(active,'0','Outreach workflows must remain inactive');
let draft;
if(customerOrg){
 const selected=docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT coalesce(json_agg(json_build_object('credential_ref',credential_ref,'email',email)),'[]'::json) FROM sender_connections WHERE org_id=${customerOrg} AND provider='gmail' AND state='ready'; COMMIT;`);
 const bindings=JSON.parse(selected.split('\n').find(s=>s.startsWith('[')));assert.equal(bindings.length,1,'EXACTLY_ONE_READY_CUSTOMER_GMAIL_REQUIRED');draft={binding:bindings[0]};
}else draft=JSON.parse(fs.readFileSync('.local/email-sender-review-20261019.json','utf8'));
const ref=draft.binding.credential_ref;assert(/^[A-Za-z0-9_-]{1,36}$/.test(ref));
const raw=docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT json_agg(json_build_object('id',id,'name',name,'type',type,'data',data)) FROM credentials_entity WHERE id='${ref}'; COMMIT;`);
const credentials=JSON.parse(raw.split('\n').find(s=>s.startsWith('[')));assert.equal(credentials.length,1);assert.equal(credentials[0].type,'gmailOAuth2');assert.equal(typeof credentials[0].data,'string');
const crypto=require('crypto'),beforeHash=crypto.createHash('sha256').update(credentials[0].data).digest('hex');
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
const output={profile_verified:false,refresh_verified:false,inbox_read:false,sent:false,live_database_changed:false};
const secret='/tmp/scratch-credential.json',dummy='scratch-invalid-access-token-refresh-test';
function cli(args){return cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:12e6});}
try {
if(cli(['import:credentials','--input=/tmp/profile/credentials.encrypted.json']).status!==0)throw Error('scratch_import_failed');
if(cli(['export:credentials','--all','--decrypted','--output='+secret]).status!==0)throw Error('scratch_export_failed');
const saved=JSON.parse(fs.readFileSync(secret,'utf8'));
if(saved.length!==1)throw Error('scratch_credential_count');
const token=saved[0].data.oauthTokenData;
if(!token||!(token.refresh_token||token.refreshToken))throw Error('refresh_token_missing');
token.access_token=dummy;if('accessToken' in token)token.accessToken=dummy;
fs.writeFileSync(secret,JSON.stringify(saved),{mode:0o600});
if(cli(['import:credentials','--input='+secret]).status!==0)throw Error('scratch_import_failed');
fs.unlinkSync(secret);
output.invalid_access_token_installed=true;
for(const args of [['import:workflow','--input=/tmp/profile/workflow.json'],['execute','--id=scratchGmailProfile','--rawOutput']]){
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
if(output.profile_verified){
 if(cli(['export:credentials','--all','--decrypted','--output='+secret]).status!==0)throw Error('scratch_export_failed');
 const updated=JSON.parse(fs.readFileSync(secret,'utf8'))[0].data.oauthTokenData;
 output.refreshed_access_token_persisted=!!updated?.access_token&&updated.access_token!==dummy;
 output.refresh_verified=output.refreshed_access_token_persisted===true;
}
}catch(e){output.reason=['scratch_import_failed','scratch_export_failed','scratch_credential_count','refresh_token_missing'].includes(e.message)?e.message:'scratch_check_failed';}
finally{if(fs.existsSync(secret))fs.unlinkSync(secret);}
fs.writeFileSync('/tmp/profile-result.json',JSON.stringify(output,null,2));
`);
const key=(service.Config.Env||[]).filter(v=>v.startsWith('N8N_ENCRYPTION_KEY='));
// /tmp holds decrypted scratch exports and SQLite only in memory. Mounts are read-only.
const networkOptions=(service.Config.Env||[]).filter(v=>v.startsWith('NODE_OPTIONS='));
// A separate narrow writable bind receives only sanitized test results.
const resultDir=path.join(dir,'results');fs.mkdirSync(resultDir);
docker(['create','--name',name,'--network','bridge','--tmpfs','/tmp:rw,mode=1777','--mount','type=bind,source='+dir+',target=/test,readonly','--mount','type=bind,source='+resultDir+',target=/tmp-result','--volumes-from','n8n:ro','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false',...networkOptions.flatMap(v=>['--env',v]),...key.flatMap(v=>['--env',v]),'--entrypoint','sh',service.Image,'-c','cp -r /test /tmp/profile && node /tmp/profile/run.cjs && cp /tmp/profile-result.json /tmp-result/result.json']);
docker(['start','-a',name]);
const result=JSON.parse(fs.readFileSync(path.join(resultDir,'result.json'),'utf8'));
const status=JSON.parse(docker(['inspect',name]))[0];assert.equal(status.State.Running,false);
docker(['rm',name]);fs.unlinkSync(encrypted);
const after=docker(['exec','postgres_db','psql','-XAt','-U','n8n_user','-d','lead_db','-c',"BEGIN READ ONLY; SELECT data FROM credentials_entity WHERE id='"+ref+"'; COMMIT;"]).split('\n').filter(x=>x!=='BEGIN'&&x!=='COMMIT').join('\n');
result.live_credential_unchanged=crypto.createHash('sha256').update(after).digest('hex')===beforeHash;
assert(result.live_credential_unchanged);
const report=customerOrg?'documentation/strategy-contract-v2/gmail-customer-refresh-'+stamp+'.json':'documentation/strategy-contract-v2/gmail-refresh-verification-20261020.json';
fs.writeFileSync(report,JSON.stringify({...result,...(customerOrg?{org_id:customerOrg}:{}),checked_at:new Date().toISOString(),send_permission_verified:false},null,2)+'\n');console.log(JSON.stringify(result));
