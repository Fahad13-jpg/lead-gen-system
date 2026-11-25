'use strict';
const assert=require('node:assert/strict');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
const scopes=['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'];
async function run(context,lib=require('./clients.cjs').libraries()){
 const binding=JSON.parse(context.getNodeParameter('binding',0)),ref=context.getNode().credentials?.gmailOAuth2?.id;
 assert(Number.isSafeInteger(binding.org_id)&&binding.org_id>0&&/^[A-Za-z0-9_-]{1,120}$/.test(binding.connection_id||'')&&/^[A-Za-z0-9_-]{1,36}$/.test(ref||''),'INVALID_GMAIL_BINDING');
 const pg=await context.getCredentials('postgres');assert(!pg.sshTunnel,'SSH_DB_NOT_SUPPORTED');
 const db=new lib.Client({host:pg.host,port:Number(pg.port||5432),database:pg.database,user:pg.user,password:pg.password,ssl:pg.ssl&&pg.ssl!=='disable'?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,statement_timeout:20000});
 try{
  await db.connect();
  const lock=(await db.query(`SELECT pg_try_advisory_lock(61020811,hashtext(${q(binding.org_id+':'+binding.connection_id)})) AS locked`)).rows[0];
  if(lock?.locked!==true)return{state:'busy',processed:0};
  const saved=(await db.query(`SELECT s.* FROM sender_connections s JOIN organizations o ON o.id=s.org_id AND o.status='active' JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=s.owner_subject AND m.active WHERE s.org_id=${binding.org_id} AND s.connection_id=${q(binding.connection_id)}`)).rows[0];
  assert(saved?.provider==='gmail'&&saved.credential_ref===ref,'CREDENTIAL_BINDING_MISMATCH');
  const age=Date.now()-Date.parse(saved.checked_at);
  const routine=saved.state==='ready'&&(!Number.isFinite(age)||age<0||age>=12*3600000);
  if(saved.state!=='pending_check'&&!routine)return{state:'idle',processed:0};
  let valid=false,reason='identity_or_scope_mismatch';
  try{
   const profile=await context.helpers.httpRequestWithAuthentication.call(context,'gmailOAuth2',{method:'GET',url:'https://gmail.googleapis.com/gmail/v1/users/me/profile',json:true,timeout:15000});
   // Reload after native OAuth refresh; credentials never enter node output.
   const credential=await context.getCredentials('gmailOAuth2'),granted=new Set(String(credential.oauthTokenData?.scope||'').split(' '));
   valid=String(profile?.emailAddress||'').toLowerCase()===saved.email&&scopes.every(s=>granted.has(s));
  }catch(error){
   const status=Number(error?.httpCode||error?.statusCode||error?.response?.status);
   if(![401,403].includes(status))return{state:saved.state,processed:0,reason:'provider_check_unconfirmed'};
   reason='authorization_rejected';
  }
  const result=(await db.query(`SELECT ${routine?'sender_connection_refreshed':'sender_connection_checked'}(${binding.org_id},${q(binding.connection_id)},${saved.version},${q(JSON.stringify({email:saved.email,credential_ref:ref,send:valid,read_replies:valid}))}::jsonb) AS result`)).rows[0]?.result;
  if(result?.error)return{state:'unchanged',processed:0,reason:'check_stale'};
  assert(['ready','reconnect_required'].includes(result?.state),'GMAIL_CHECK_PERSISTENCE_UNCONFIRMED');
  return{state:result.state,processed:1,...(!valid?{reason}:{}),sent:false};
 }finally{await db.end();}
}
module.exports={run};
