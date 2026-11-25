'use strict';
const assert=require('node:assert/strict'),{tick}=require('./runner.cjs');
async function run(context,ports){
 // No credential loading or SQL when the local operator switch is off.
 if(context.getNodeParameter('dispatchEnabled',0)!==true)return {state:'blocked',reason:'whatsapp_dispatch_disabled'};
 const binding=JSON.parse(context.getNodeParameter('binding',0));
 assert(Number.isSafeInteger(binding.org_id)&&binding.org_id>0,'ORG_REQUIRED');
 assert(/^\d{5,30}$/.test(binding.phone_number_id||'')&&/^\d{5,30}$/.test(binding.waba_id||''),'SENDER_REQUIRED');
 assert(binding.credential_ref===context.getNode().credentials?.whatsAppApi?.id,'CREDENTIAL_BINDING_MISMATCH');
 assert(typeof binding.connection_id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(binding.connection_id),'CONNECTION_REQUIRED');
 assert(Number.isFinite(Date.parse(binding.credential_expires_at))&&Date.parse(binding.credential_expires_at)>Date.now()+30000,'CREDENTIAL_EXPIRY_REQUIRED');
 const credentials=await context.getCredentials('whatsAppApi');
 assert(String(credentials.businessAccountId)===binding.waba_id,'CREDENTIAL_ACCOUNT_MISMATCH');
 const pg=await context.getCredentials('postgres');assert(!pg.sshTunnel,'SSH_DB_NOT_SUPPORTED');
 const Client=ports?.Client||require('node:module').createRequire('/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/package.json')('pg').Client;
 const db=new Client({host:pg.host,port:Number(pg.port||5432),database:pg.database,user:pg.user,password:pg.password,ssl:pg.ssl&&pg.ssl!=='disable'?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,statement_timeout:20000});
 try{
  await db.connect();
  return await tick(binding.org_id,{mode:'live',liveEnabled:true,fetch:ports?.fetch||require('./network.cjs').createFetch(),
   recheckEnabled:context.getNodeParameter('providerRechecksEnabled',0,false)===true,
   recheck:async task=>require('./recheck.cjs').recheck(task,{
    authorizeBinding:async requested=>['org_id','connection_id','credential_ref','phone_number_id','waba_id'].every(k=>requested[k]===binding[k])&&Date.parse(binding.credential_expires_at)>Date.now()+30000,
    authenticatedGet:require('./recheck-http.cjs').createGet(ports?.readFetch||require('./network.cjs').createReadFetch(),credentials.accessToken)
   }),
   executeQuery:async sql=>(await db.query(sql)).rows[0]?.result,
   resolveCredential:async requested=>{
    for(const key of ['org_id','connection_id','credential_ref','phone_number_id','waba_id'])assert.equal(requested[key],binding[key],'CREDENTIAL_BINDING_MISMATCH');
    return {...requested,access_token:credentials.accessToken,expires_at:binding.credential_expires_at};
   }});
 }finally{await db.end();}
}
module.exports={run};
