'use strict';
const assert=require('node:assert/strict');
const clients=require('./clients.cjs'),mime=require('./mime.cjs'),poll=require('./imap-poll.cjs').poll;
const executor=require('./smtp-executor.cjs'),rollout=require('../lead-strategy/v2/email-rollout.cjs');
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
async function run(context,lib=clients.libraries(),connect=clients.connect){
 const operation=context.getNodeParameter('operation',0),config=JSON.parse(context.getNodeParameter('binding',0));
 assert(Number.isSafeInteger(config.org_id)&&config.org_id>0&&/^[A-Za-z0-9_-]{1,120}$/.test(config.connection_id),'INVALID_BINDING');
 const node=context.getNode(),smtpRef=node.credentials?.smtp?.id,imapRef=node.credentials?.imap?.id;
 assert(smtpRef&&imapRef,'BOUND_CREDENTIALS_REQUIRED');
 let release;
 if(operation==='send'){
  release=JSON.parse(context.getNodeParameter('release',0));
  // An empty release is an intentional closed gate; no provider connection is made.
  if(!release)return {state:'blocked',reason:'release_not_authorized'};
  rollout.validate(release);
 }
 const pg=await context.getCredentials('postgres');
 assert(!pg.sshTunnel,'SSH_DB_NOT_SUPPORTED');
 const db=new lib.Client({host:pg.host,port:Number(pg.port||5432),database:pg.database,user:pg.user,password:pg.password,
 ssl:pg.ssl&&pg.ssl!=='disable'?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,statement_timeout:20000});
 let connected;
 try{
  await db.connect();
  const query=async sql=>(await db.query(sql)).rows;
  const executeQuery=async sql=>(await query(sql))[0]?.result;
  if(operation==='check'){
   const lock=(await query(`SELECT pg_try_advisory_lock(61020811,hashtext(${quote(config.org_id+':'+config.connection_id)})) AS locked`))[0];
   if(lock?.locked!==true)return {state:'busy',processed:0};
  }
  const binding=(await query(`SELECT * FROM sender_connections WHERE org_id=${config.org_id} AND connection_id=${quote(config.connection_id)}`))[0];
  assert(binding&&binding.provider==='smtp'&&binding.credential_ref===smtpRef&&binding.inbox_credential_ref===imapRef,'CREDENTIAL_BINDING_MISMATCH');
  const age=Date.now()-Date.parse(binding.checked_at),routine=operation==='check'&&binding.state==='ready'&&(!Number.isFinite(age)||age<0||age>=12*3600000);
  if(operation==='check'&&binding.state!=='pending_check'&&!routine)return {state:'idle',processed:0};
  const checkFunction=routine?'sender_connection_refreshed':'sender_connection_checked';
  assert(!['disabled','disconnected'].includes(binding.state),'CONNECTION_DISABLED');
  if(operation==='send'){
   assert(release.binding.org_id===binding.org_id&&release.binding.email===binding.email&&release.binding.credential_ref===smtpRef,'RELEASE_BINDING_MISMATCH');
   assert(binding.daily_limit<=10&&binding.mailbox_rolling_limit<=10&&binding.min_interval_seconds>=300,'CANARY_LIMITS_REQUIRED');
  }
  let rows=[];
  if(operation==='send'){
   assert(binding.state==='ready'&&binding.send_capable&&binding.reply_capable,'CONNECTION_NOT_READY');
   const base=require('./queue-query.cjs');
   rows=await query(base.replace("WHERE p.body->>'version'",`WHERE p.org_id=${binding.org_id} AND p.id IN (${release.plans.map(p=>p.plan_id).join(',')}) AND p.body->>'version'`));
   rows=rows.filter(row=>rollout.allows(row,release));if(!rows.length)return {state:'idle',processed:0};
  }else if(operation==='poll'){
   rows=await query(`SELECT id AS activity_id,org_id,external_id AS message_id,sent_at,dispatch_metadata FROM outreach_activities WHERE org_id=${binding.org_id} AND channel='email' AND dispatch_metadata->>'transport'='smtp' AND dispatch_metadata->>'connection_id'=${quote(binding.connection_id)} AND dispatch_metadata->>'credential_ref'=${quote(smtpRef)} AND dispatch_metadata->>'inbox_credential_ref'=${quote(imapRef)} AND dispatch_metadata->>'state'='provider_accepted' AND sent_at>now()-interval '30 days' ORDER BY coalesce(dispatch_metadata->'reply_scan'->>'checked_at',''),id LIMIT 10`);
   if(!rows.length)return {state:'idle',processed:0};
  }else assert(operation==='check','UNKNOWN_OPERATION');
  const captureCheckpoint=async()=>{const lock=await connected.client.getMailboxLock();try{return {mailbox:'INBOX',uid_validity:String(connected.client.mailbox.uidValidity),uid_next:String(connected.client.mailbox.uidNext)};}finally{lock.release();}};
  if(operation==='check'){
   try{
   connected=await connect({smtp:await context.getCredentials('smtp'),imap:await context.getCredentials('imap')},binding,lib);
   await connected.transport.verify();await captureCheckpoint();
   // Await persistence before finally closes PostgreSQL; returning its promise
   // directly can destroy an in-flight query after it has committed.
   return await executeQuery(`SELECT ${checkFunction}(${binding.org_id},${quote(binding.connection_id)},${binding.version},${quote(JSON.stringify({email:binding.email,credential_ref:smtpRef,...(routine?{inbox_credential_ref:imapRef}:{}),send:true,read_replies:true}))}::jsonb) AS result`);
   }catch(error){
    // A failed check becomes reconnect_required once, rather than logging in every minute.
    // The existing function fences concurrent pause/disconnect/recheck changes by version.
    try{await executeQuery(`SELECT ${checkFunction}(${binding.org_id},${quote(binding.connection_id)},${binding.version},${quote(JSON.stringify({email:binding.email,credential_ref:smtpRef,...(routine?{inbox_credential_ref:imapRef}:{}),send:false,read_replies:false}))}::jsonb) AS result`);}catch{}
    throw error;
   }
  }
  connected=await connect({smtp:await context.getCredentials('smtp'),imap:await context.getCredentials('imap')},binding,lib);
  const results=[];
  for(const row of rows){
   if(operation==='send')results.push(await executor.execute(row,{sender:binding,executeQuery,captureCheckpoint,
    sendMail:message=>connected.transport.sendMail(message),
    loadParent:async message=>(await query(`SELECT org_id,(dispatch_metadata->>'plan_id')::bigint AS plan_id,(dispatch_metadata->>'step')::integer AS step,dispatch_metadata->>'content_hash' AS content_hash,dispatch_metadata->>'state' AS state,external_id AS message_id,dispatch_metadata->>'sender_email' AS sender_email,dispatch_metadata->>'credential_ref' AS credential_ref,dispatch_metadata->>'recipient_email' AS recipient,dispatch_metadata->'smtp_references' AS references,dispatch_metadata->>'smtp_subject' AS subject FROM outreach_activities WHERE org_id=${message.org_id} AND dispatch_metadata->>'plan_id'=${quote(message.plan_id)} AND dispatch_metadata->>'step'=${quote(message.step-1)} AND dispatch_metadata->>'transport'='smtp'`))[0]
   },release));
   else{
    const m=row.dispatch_metadata,activity={...row,connection_id:m.connection_id,credential_ref:m.credential_ref,inbox_credential_ref:m.inbox_credential_ref,sender_email:m.sender_email,recipient:m.recipient_email,state:m.state};
    results.push(await poll(binding,activity,m.imap_checkpoint,{client:connected.client,parse:source=>mime.parse(source,lib.simpleParser),persist:p=>executeQuery(executor.query('outreach_imap_scan_finish',p))}));
   }
  }
  return {state:'processed',processed:results.length,results};
 }finally{try{await connected?.close();}finally{await db.end();}}
}
module.exports={run};
