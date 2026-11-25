'use strict';
// Disposable n8n CLI client for explicitly approved integration tests only.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:240000,maxBuffer:16e6});if(r.status!==0)throw Error('GMAIL_TEST_COMMAND_FAILED');return r.stdout.trim();}
class Client{
 constructor(dir,name,ref){this.dir=dir;this.name=name;this.ref=ref;assert(/^[a-z0-9-]+$/.test(name));assert(/^[a-zA-Z0-9]+$/.test(ref));}
 open(){
  const service=JSON.parse(docker(['inspect','n8n']))[0];
  const raw=docker(['exec','-i','postgres_db','psql','-XAt','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT json_agg(json_build_object('id',id,'name',name,'type',type,'data',data)) FROM credentials_entity WHERE id='${this.ref.replace(/'/g,"''")}'; COMMIT;`);
  const creds=JSON.parse(raw.split('\n').find(s=>s.startsWith('[')));assert.equal(creds.length,1);assert.equal(creds[0].type,'gmailOAuth2');
  this.credentialName=creds[0].name;
  const encrypted=path.join(this.dir,'credentials.encrypted.json');
  if(fs.existsSync(encrypted))assert.equal(fs.readFileSync(encrypted,'utf8'),JSON.stringify(creds),'Encrypted fixture changed');
  else fs.writeFileSync(encrypted,JSON.stringify(creds),{flag:'wx'});
  fs.writeFileSync(path.join(this.dir,'client-run.cjs'),String.raw`
const fs=require('fs'),cp=require('child_process');
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/gmail-test-state',NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --dns-result-order=ipv4first --no-network-family-autoselection',N8N_ENCRYPTION_KEY:process.env.N8N_ENCRYPTION_KEY||JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8')).encryptionKey};
const setup=process.argv[2]==='setup';
const commands=setup?[['import:credentials','--input=/tmp/client/credentials.encrypted.json']]:[['import:workflow','--input=/tmp/client/request.json'],['execute','--id=gmailTestRequest','--rawOutput']];
let output={error:'not_executed'};
for(const args of commands){const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:16e6});
 if(args[0]!=='execute'){if(r.status!==0){output={error:'import_failed'};break;}output={setup:true};continue;}
 let result;for(let i=0;i<(r.stdout||'').length;i++){if(r.stdout[i]!=='{')continue;try{result=JSON.parse(r.stdout.slice(i,r.stdout.lastIndexOf('}')+1));break;}catch{}}
 const data=result?.data?.resultData||result?.resultData,body=data?.runData?.Request?.[0]?.data?.main?.[0]?.[0]?.json;
 const errorText=JSON.stringify(data?.error||{})+' '+(r.stderr||'');
 const error_class=/invalid_grant|revoked/i.test(errorText)?'oauth_reconnect_required':/scope|permission|forbidden/i.test(errorText)?'permission_denied':/timeout|ETIMEDOUT|ECONNRESET/i.test(errorText)?'network_failure':/JSON|parse|parameter/i.test(errorText)?'request_or_parse_error':'unclassified';
 output=body&&!data?.error?{body}:{error:'provider_result_unavailable',error_class,codes:[...new Set(errorText.match(/\b(?:ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|ENOTFOUND|ECONNREFUSED)\b/g)||[])],process_status:r.status,last_node:data?.lastNodeExecuted==='Request'?'Request':'unknown'};
}fs.writeFileSync('/tmp/client-result.json',JSON.stringify(output));
`);
  const key=(service.Config.Env||[]).filter(v=>v.startsWith('N8N_ENCRYPTION_KEY='));
  const existing=cp.spawnSync('docker',['inspect',this.name],{encoding:'utf8'});
  if(existing.status===0){const c=JSON.parse(existing.stdout)[0];assert.equal(c.Image,service.Image);assert.equal(c.HostConfig.NetworkMode,'bridge');assert.deepEqual(c.Config.Cmd,['-e','setInterval(()=>{},60000)']);assert(c.Config.Env.includes('DB_TYPE=sqlite'));}
  else docker(['create','--name',this.name,'--network','bridge','--volumes-from','n8n:ro','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false',...key.flatMap(v=>['--env',v]),'--entrypoint','node',service.Image,'-e','setInterval(()=>{},60000)']);
  docker(['cp',this.dir+'/.',this.name+':/tmp/client']);docker(['start',this.name]);
  docker(['exec',this.name,'node','/tmp/client/client-run.cjs','setup']);this.copyResult();assert(this.result.setup);
  fs.unlinkSync(encrypted);
 }
 copyResult(){docker(['cp',this.name+':/tmp/client-result.json',path.join(this.dir,'client-result.private.json')]);this.result=JSON.parse(fs.readFileSync(path.join(this.dir,'client-result.private.json')));}
 request(method,suffix,body){
  assert((method==='GET'&&(/^(messages|threads)\/[a-f0-9]{8,64}\?format=full$/i.test(suffix)||/^messages\?maxResults=(10|25)&q=/.test(suffix)))||(method==='POST'&&suffix==='messages/send'));
  const w={id:'gmailTestRequest',name:'Approved Gmail test request',active:false,settings:{executionOrder:'v1'},nodes:[
   {id:'start',name:'Manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
   {id:'request',name:'Request',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[200,0],retryOnFail:false,parameters:{method,url:'https://gmail.googleapis.com/gmail/v1/users/me/'+suffix,authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',...(method==='POST'?{sendBody:true,specifyBody:'json',jsonBody:JSON.stringify(body)}:{}),options:{timeout:20000}},credentials:{gmailOAuth2:{id:this.ref,name:this.credentialName}}}
  ],connections:{Manual:{main:[[{node:'Request',type:'main',index:0}]]}}};
  const f=path.join(this.dir,'request.json');fs.writeFileSync(f,JSON.stringify(w));docker(['cp',f,this.name+':/tmp/client/request.json']);
  docker(['exec',this.name,'node','/tmp/client/client-run.cjs','request']);this.copyResult();if(this.result.error)throw Error(this.result.error);return this.result.body;
 }
 close(){docker(['stop','--time','5',this.name]);docker(['rm',this.name]);}
}
module.exports={Client,docker};
