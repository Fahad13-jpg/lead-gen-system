'use strict';
// One GET in a disposable container. Live SQL is read-only. No workflow import,
// message submission, credential mutation, migration or production restart.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const binding=JSON.parse(fs.readFileSync('.local/whatsapp-org1-onboarding/connection.json','utf8'));
assert.equal(binding.org_id,1);assert.equal(binding.credential_ref,'kKL9mQObSvnb3bkX');assert.equal(binding.api_version,'v25.0');
const dir=path.resolve('.local/whatsapp-check-'+Date.now()),name='whatsapp-readonly-'+Date.now();
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:180000,maxBuffer:4000000});assert.equal(r.status,0,'WHATSAPP_CHECK_COMMAND_FAILED; private output suppressed');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const quote=s=>"'"+s.replace(/'/g,"''")+"'";
let created=false;
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(dir,'results'));
const encrypted=path.join(dir,'credential.encrypted.json');
try{
 const resolved=cp.spawnSync(process.execPath,['-e',"require('./scripts/whatsapp/network.cjs').resolveIPv4().then(ip=>console.log(ip)).catch(()=>{process.exitCode=1})"],{encoding:'utf8',timeout:15000});
 const ipv4=(resolved.stdout||'').trim();
 assert.equal(resolved.status,0,'HOST_DNS_LOOKUP_FAILED');
 assert(require('node:net').isIPv4(ipv4)&&! /^(0|10|127|169\.254|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(ipv4),'PUBLIC_HOST_DNS_ADDRESS_REQUIRED');
 fs.writeFileSync(path.join(dir,'host-dns.json'),JSON.stringify({hostname:'graph.facebook.com',ipv4,resolved_at:new Date().toISOString()}));
 const service=JSON.parse(docker(['inspect','n8n']))[0];assert(service.State.Running,'N8N_NOT_RUNNING');
 const raw=sql('BEGIN READ ONLY; SELECT json_agg(json_build_object(\'id\',id,\'name\',name,\'type\',type,\'data\',data)) FROM credentials_entity WHERE id='+quote(binding.credential_ref)+'; COMMIT;');
 const rows=JSON.parse(raw.split('\n').find(s=>s.startsWith('[')));assert.equal(rows.length,1);assert.equal(rows[0].type,'whatsAppApi');
 fs.writeFileSync(encrypted,JSON.stringify(rows),{flag:'wx'});
 fs.writeFileSync(path.join(dir,'binding.json'),JSON.stringify({...binding,verify_test_number:process.argv.includes('--test-readiness')}));
 fs.copyFileSync('scripts/whatsapp/connection.cjs',path.join(dir,'connection.cjs'));
 fs.copyFileSync('scripts/whatsapp/discovery.cjs',path.join(dir,'discovery.cjs'));
 fs.writeFileSync(path.join(dir,'run.cjs'),String.raw`
const fs=require('node:fs'),cp=require('node:child_process');
const output={account_sender_match:false,sent:false,provider_requests:0,live_database_changed:false,workflow_imported:false,credential_exported_to_host:false};
const binding=JSON.parse(fs.readFileSync('/test/binding.json'));
const stored=JSON.parse(fs.readFileSync('/home/node/.n8n/config'));
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/wa-state',N8N_ENCRYPTION_KEY:process.env.N8N_ENCRYPTION_KEY||stored.encryptionKey};
const secret='/tmp/wa-credential.json';
// Request-scoped IPv4 in this disposable diagnostic only. No production DNS,
// Docker settings or Node process defaults are changed.
const https=require('node:https'),{Readable}=require('node:stream');
const hostDNS=JSON.parse(fs.readFileSync('/test/host-dns.json'));
if(hostDNS.hostname!=='graph.facebook.com'||!require('node:net').isIPv4(hostDNS.ipv4)||Date.now()-Date.parse(hostDNS.resolved_at)>300000)throw Error('FRESH_HOST_DNS_REQUIRED');
function getIPv4(url,options){return new Promise((resolve,reject)=>{
 if(new URL(url).hostname!==hostDNS.hostname)return reject(Error('UNEXPECTED_HOST'));
 const lookup=(hostname,opts,callback)=>{if(hostname!==hostDNS.hostname)return callback(Error('UNEXPECTED_HOST'));callback(null,hostDNS.ipv4,4);};
 const req=https.request(url,{method:'GET',family:4,lookup,agent:false,headers:options.headers,signal:options.signal},res=>resolve({status:res.statusCode,body:Readable.toWeb(res)}));
 req.on('error',reject);req.end();
});}
output.transport='https_request_ipv4_host_dns';
output.tls_hostname_verification=true;
function cli(args){const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:120000,maxBuffer:4000000});if(r.status!==0)throw Error('scratch_credential_load_failed');}
(async()=>{try{
cli(['import:credentials','--input=/test/credential.encrypted.json']);
cli(['export:credentials','--all','--decrypted','--output='+secret]);
const credentials=JSON.parse(fs.readFileSync(secret));fs.unlinkSync(secret);
if(credentials.length!==1||credentials[0].id!==binding.credential_ref||credentials[0].type!=='whatsAppApi')throw Error('credential_binding_mismatch');
const data=credentials[0].data;
if(String(data.businessAccountId)!==binding.waba_id||typeof data.accessToken!=='string'||!data.accessToken||/[\s\p{Cc}]/u.test(data.accessToken))throw Error('credential_account_or_schema_mismatch');
const ports={
authorizeBinding:async b=>b.org_id===1&&b.credential_ref===binding.credential_ref,
authenticatedGet:async r=>{
output.provider_requests++;
const started=Date.now();
try{
const response=await getIPv4(r.url,{headers:{Authorization:'Bearer '+data.accessToken},signal:AbortSignal.timeout(r.timeout)});
output.http_status=response.status;
const reader=response.body.getReader(),chunks=[];let size=0;
try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>r.maxResponseBytes)throw Error('response_too_large');chunks.push(Buffer.from(p.value));}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
if(response.status!==200){
 // Numeric provider codes only; never print error messages, URLs or headers.
 if(Number.isSafeInteger(payload?.error?.code))output.provider_error_code=payload.error.code;
 if(Number.isSafeInteger(payload?.error?.error_subcode))output.provider_error_subcode=payload.error.error_subcode;
 return {status:response.status};
}
return {status:200,data:payload};
}catch(error){
const allowed=['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'];
const codes=[error?.code,error?.cause?.code,...(Array.isArray(error?.cause?.errors)?error.cause.errors.map(e=>e?.code):[])];
output.network_error_codes=[...new Set(codes.filter(c=>allowed.includes(c)))];
output.failure_class=['TimeoutError','AbortError'].includes(error?.name)||codes.some(c=>['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(c))?'timeout':codes.some(c=>['ENOTFOUND','EAI_AGAIN'].includes(c))?'dns':codes.some(c=>['ECONNRESET','ECONNREFUSED','ENETUNREACH'].includes(c))?'connection':codes.some(c=>allowed.includes(c)&&/CERT|TLS|SIGNATURE/.test(c))?'tls':error instanceof SyntaxError?'invalid_json':error?.message==='response_too_large'?'response_limit':'unclassified';
throw Error('provider_request_unconfirmed');
}finally{output.request_elapsed_ms=Date.now()-started;}
}};
const result=await require('/test/connection.cjs').check(binding,ports);
output.account_sender_match=result.state==='identity_checked';output.reason=result.reason;output.checked_at=new Date().toISOString();
if(!output.account_sender_match&&output.provider_error_code===100&&output.provider_error_subcode===33){
 const before={...output};
 const sender=await ports.authenticatedGet({url:'https://graph.facebook.com/'+binding.api_version+'/'+binding.phone_number_id+'?fields=id,display_phone_number',timeout:10000,maxResponseBytes:65536}).catch(()=>null);
 const direct={http_status:output.http_status,error_code:output.provider_error_code,error_subcode:output.provider_error_subcode,failure_class:output.failure_class};
 Object.assign(output,before);output.provider_requests=2;
 output.direct_sender_check={http_status:sender?.status??direct.http_status,matched:sender?.status===200&&sender.data?.id===binding.phone_number_id,execution_authorized:false};
 if(sender?.status!==200){if(Number.isInteger(direct.error_code))output.direct_sender_check.error_code=direct.error_code;if(Number.isInteger(direct.error_subcode))output.direct_sender_check.error_subcode=direct.error_subcode;if(direct.failure_class)output.direct_sender_check.failure_class=direct.failure_class;}
 // A direct phone match does not establish its WABA membership or send rights.
}
if(!output.account_sender_match&&output.direct_sender_check?.matched===true){
 const before={...output};
 output.account_discovery=await require('/test/discovery.cjs').discover({...binding,business_id:'2388510198560195'},ports.authenticatedGet);
 const requests=output.provider_requests,discovery=output.account_discovery;
 Object.assign(output,before);output.provider_requests=requests;output.account_discovery=discovery;
}
if(output.direct_sender_check?.matched===true&&!output.account_sender_match){
 const before={...output};
 const response=await ports.authenticatedGet({url:'https://graph.facebook.com/'+binding.api_version+'/me/permissions',timeout:10000,maxResponseBytes:65536}).catch(()=>null);
 const count=output.provider_requests;
 const permissions={http_status:response?.status??null,state:'unverified',permissions:[]};
 const allow=['whatsapp_business_management','whatsapp_business_messaging','whatsapp_business_manage_events','business_management'];
 if(response?.status===200&&Array.isArray(response.data?.data)){
  permissions.state='observed';
  permissions.permissions=response.data.data.filter(p=>allow.includes(p?.permission)&&['granted','declined','expired'].includes(p.status)).map(p=>({permission:p.permission,status:p.status}));
 }
 Object.assign(output,before);output.provider_requests=count;output.token_permissions=permissions;
 // A listed scope does not prove asset-level grants or permission to send.
}
if(output.account_sender_match||output.direct_sender_check?.matched===true){
 const before={...output};
 const response=await ports.authenticatedGet({url:'https://graph.facebook.com/'+binding.api_version+'/'+binding.waba_id+'/message_templates?fields=id,name,status,category,language,components&limit=10',timeout:10000,maxResponseBytes:65536}).catch(()=>null);
 const count=output.provider_requests,code=output.provider_error_code,subcode=output.provider_error_subcode;
 const templates={http_status:response?.status??null,accessible:response?.status===200&&Array.isArray(response.data?.data),execution_authorized:false};
 if(templates.accessible){templates.page_count=response.data.data.length;templates.has_more=!!response.data.paging?.next;templates.items=response.data.data.filter(t=>/^\d{5,30}$/.test(t?.id||'')&&/^\w{1,100}$/.test(t?.name||'')).map(t=>({id:t.id,name:t.name,status:['APPROVED','PENDING','REJECTED','PAUSED','DISABLED'].includes(t.status)?t.status:'UNVERIFIED',category:['MARKETING','UTILITY','AUTHENTICATION'].includes(t.category)?t.category:'UNVERIFIED',language:/^\w{2,15}$/.test(t.language||'')?t.language:'UNVERIFIED'}));}
 else if(response){if(Number.isInteger(code))templates.error_code=code;if(Number.isInteger(subcode))templates.error_subcode=subcode;}
 const exactTestText='Hello, this is a WhatsApp integration test for Lead-Gen-system. Please reply TEST RECEIVED so we can check reply detection. Reply STOP to opt out.';
 if(templates.accessible)templates.exact_test_matches=response.data.data.filter(t=>t.status==='APPROVED'&&['en','en_US'].includes(t.language)&&Array.isArray(t.components)&&t.components.length===1&&t.components[0].type==='BODY'&&t.components[0].text===exactTestText).map(t=>({id:t.id,name:t.name,language:t.language}));
 Object.assign(output,before);output.provider_requests=count;output.template_check=templates;
}
if(binding.verify_test_number&&output.account_sender_match){
 const sender=await ports.authenticatedGet({url:'https://graph.facebook.com/'+binding.api_version+'/'+binding.phone_number_id+'?fields=id,display_phone_number',timeout:10000,maxResponseBytes:65536}).catch(()=>null);
 output.test_sender_check={http_status:sender?.status??null,matches_original_meta_test_number:sender?.status===200&&sender.data?.id===binding.phone_number_id&&String(sender.data?.display_phone_number||'').replace(/[^0-9]/g,'')==='15556392503',source:'original_operator_Meta_test_number_screenshot',execution_authorized:false};
}
output.sending_verified=false;output.callback_verified=false;output.scope='local_operator_only_not_customer_authentication';
}catch(e){output.reason=['scratch_credential_load_failed','credential_binding_mismatch','credential_account_or_schema_mismatch'].includes(e.message)?e.message:'connection_check_unconfirmed';}
finally{if(fs.existsSync(secret))fs.unlinkSync(secret);fs.writeFileSync('/results/result.json',JSON.stringify(output,null,2));}})();
`);
 const keys=(service.Config.Env||[]).filter(x=>x.startsWith('N8N_ENCRYPTION_KEY='));
 docker(['create','--name',name,'--network','bridge','--tmpfs','/tmp:rw,mode=1777','--mount','type=bind,source='+dir+',target=/test,readonly','--mount','type=bind,source='+path.join(dir,'results')+',target=/results','--volumes-from','n8n:ro','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false',...keys.flatMap(x=>['--env',x]),'--entrypoint','node',service.Image,'/test/run.cjs']);created=true;
 docker(['start','-a',name]);
 const result=JSON.parse(fs.readFileSync(path.join(dir,'results','result.json'),'utf8'));
 assert(result.provider_requests<=8);assert.equal(result.sent,false);
 const after=sql('BEGIN READ ONLY; SELECT data FROM credentials_entity WHERE id='+quote(binding.credential_ref)+'; COMMIT;').split('\n').filter(s=>s!=='BEGIN'&&s!=='COMMIT').join('\n');
 assert.equal(after,rows[0].data,'LIVE_CREDENTIAL_CHANGED');result.live_credential_unchanged=true;
 fs.writeFileSync('.local/whatsapp-org1-onboarding/check-result.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{
 if(created){try{docker(['rm','-f',name]);}catch{}}
 if(fs.existsSync(encrypted))fs.unlinkSync(encrypted);
}
