'use strict';
// n8n-owned credentials stay inside n8n. This worker cannot place phone calls.
const fs=require('node:fs'),https=require('node:https'),{createRequire}=require('node:module');
const {configPath,resolve,publicScope}=require('./owned-tools.cjs');
// Return fixed codes only. Never include raw OAuth/provider error text or tokens.
function calendarDiagnostic(error){
 const message=[error?.message,error?.description,error?.cause?.message].filter(v=>typeof v==='string').join(' ').slice(0,4000),code=error?.code||error?.cause?.code,status=Number(error?.httpCode||error?.statusCode||error?.response?.status);
 if(/TOOL_ACCOUNT_BINDING_CHANGED|TOOL_BACKEND_SCOPE_INVALID/.test(message))return'calendar_account_binding_changed';
 if(/invalid_grant|authorization grant.*invalid|refresh token.*(invalid|expired|revoked)|reauthoriz/i.test(message))return'calendar_reauthorization_required';
 if(/credentials?.*(not.*(found|exist|set)|missing)|credential.*decryption|unable to decrypt/i.test(message))return'calendar_credential_unavailable';
 if(/requestOAuth2.*not a function|Cannot find module/i.test(message))return'calendar_runtime_unavailable';
 if(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(code))return'calendar_network_unavailable';
 if(status===401||status===403)return'calendar_access_denied';
 return'calendar_backend_unavailable';
}
function getCall(id,key){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:'api.retellai.com',path:'/v2/get-call/'+encodeURIComponent(id),method:'GET',family:4,timeout:10000,headers:{Authorization:'Bearer '+key}},res=>{
   let text='';res.on('data',b=>{text+=b;if(text.length>1048576)req.destroy();});res.on('error',()=>reject(Error('PROVIDER_LOOKUP_FAILED')));
   res.on('end',()=>{try{if(res.statusCode!==200)throw Error();resolve(JSON.parse(text));}catch{reject(Error('PROVIDER_LOOKUP_FAILED'));}});
  });req.on('timeout',()=>req.destroy());req.on('error',()=>reject(Error('PROVIDER_LOOKUP_FAILED')));req.end();
 });
}
async function run(context,{backendId='legacy'}={}){
 const input=context.getInputData()[0]?.json||{},config=JSON.parse(fs.readFileSync(configPath(backendId),'utf8'));
 if(!require('./tool-gateway.cjs').authorized(input.headers,config.token))return {ok:false,reason:'unauthorized'};
 const request=async r=>{
  if(!r.url.startsWith('https://www.googleapis.com/calendar/v3/'))throw Error('CALENDAR_ROUTE_FORBIDDEN');
  // Installed n8n Calendar node uses the same OAuth2 helper; it refreshes tokens.
  const data=await context.helpers.requestOAuth2.call(context,'googleCalendarOAuth2Api',{method:r.method,uri:r.url,body:r.body,json:true,timeout:15000});
  return {status:200,data};
 };
 // Browser acceptance uses an explicitly armed fixture and never opens production SQL.
 if(input.body?.call?.call_type==='web_call'){
  const file='/home/node/.n8n/calling-browser-test.json';let session;
  try{session=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const c={...config,...(session?.agent_id===config.agent_id&&Number.isSafeInteger(session.agent_version)?{browser_agent_version:session.agent_version}:{})};
  const browserRequest=async r=>request(r.method==='POST'&&r.url.includes('/events?')?{...r,body:{...r.body,
   summary:'[TEST] Lead workspace browser meeting',extendedProperties:{private:{...r.body.extendedProperties.private,browser_test_session:session.id}}}}:r);
  return require('./tool-gateway.cjs').handle(input,c,{getCall:id=>getCall(id,config.retell_key),
   browserTest:(body,actual)=>require('./browser-test.cjs').handle(body,actual,file,{now:()=>new Date().toISOString(),
    calendar:b=>require('./google-calendar.cjs').adapter({...b,status:'ready'},{mode:'connected',transport_verified:true,request:browserRequest})})});
 }
 const pg=await context.getCredentials('postgres');if(pg.sshTunnel)throw Error('SSH_DB_NOT_SUPPORTED');
 const Client=createRequire('/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/package.json')('pg').Client;
 const db=new Client({host:pg.host,port:Number(pg.port||5432),database:pg.database,user:pg.user,password:pg.password,ssl:pg.ssl&&pg.ssl!=='disable'?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,statement_timeout:20000});
 try{
  await db.connect();const rows=async sql=>(await db.query(sql)).rows;
  if(!Number.isSafeInteger(config.org_id)||config.org_id<=0)throw Error('TOOL_BACKEND_SCOPE_INVALID');
  const account=(await db.query('SELECT org_id,version,state,agent_id,agent_version,secrets FROM calling_accounts WHERE org_id=$1',[config.org_id])).rows[0];
  const bound=resolve(config,account,(org,secrets)=>require('./account-provider.cjs').vault('/home/node/.n8n/calling-account-encryption.key').open(org,secrets));
  if(input.body?.name==='connection_check'){
   const r=await request({method:'GET',url:'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100'});
   return{ok:true,calendar_connected:true,calendars:(r.data.items||[]).map(c=>({id:c.id,primary:c.primary===true,accessRole:c.accessRole})),phone_sending_enabled:false,...publicScope(bound)};
  }
  return await require('./tool-gateway.cjs').handle(input,bound,{getCall:id=>getCall(id,bound.retell_key),rows,executeQuery:async sql=>(await rows(sql))[0]?.result,now:()=>new Date().toISOString(),calendar:b=>require('./google-calendar.cjs').adapter({...b,status:'ready'},{mode:'connected',transport_verified:true,request})});
 }finally{await db.end();}
}
module.exports={run,calendarDiagnostic};
