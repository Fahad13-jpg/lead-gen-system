'use strict';
// Local operator entry point. Credentials remain outside React and are never logged.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {initializeApp,cert,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{Pool}=require('pg');
const {identityService}=require('./identity.cjs'),{membershipLoader}=require('./memberships.cjs'),{createServer}=require('./http.cjs');
const {dataService}=require('./data.cjs');
const {gatheringService,localGatheringTransport}=require('./gathering.cjs');
const {approvalLoader,approvalService}=require('./approval.cjs');
const {senderManagement}=require('./sender-management.cjs');
const {connectionSafety}=require('./apify-connection-safety.cjs');
const {loadClient,provider}=require('./gmail-provider.cjs');
const {bridge}=require('./gmail-bridge.cjs');
const {gmailService}=require('./gmail-service.cjs');
const projectId='lead-gen-system-fad55';
function localPool({registryWrite=false}={}){
  const configured=require('./runtime-config.cjs').databaseOptions();
  if(configured)return new Pool({...configured,options:registryWrite?undefined:'-c default_transaction_read_only=on',application_name:registryWrite?'lead_dashboard_sender_registry':'lead_dashboard_readonly_auth',max:2,connectionTimeoutMillis:5000,query_timeout:5000,idleTimeoutMillis:20000});
  const result=cp.spawnSync('docker',['inspect','postgres_db'],{encoding:'utf8',timeout:30000,maxBuffer:100000});
  if(result.status!==0)throw Error('LOCAL_DATABASE_UNAVAILABLE');
  const info=JSON.parse(result.stdout)[0];if(info.Name!=='/postgres_db')throw Error('LOCAL_DATABASE_MISMATCH');
  const env=Object.fromEntries(info.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
  const ports=info.NetworkSettings.Ports['5432/tcp'];
  const port=ports?.find(p=>['0.0.0.0','127.0.0.1'].includes(p.HostIp))?.HostPort;
  if(!port||!env.POSTGRES_USER||!env.POSTGRES_PASSWORD)throw Error('LOCAL_DATABASE_CONNECTION_REQUIRED');
  return new Pool({host:'127.0.0.1',port:Number(port),database:'lead_db',user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,
    options:registryWrite?undefined:'-c default_transaction_read_only=on',application_name:registryWrite?'lead_dashboard_sender_registry':'lead_dashboard_readonly_auth',max:2,
    connectionTimeoutMillis:5000,query_timeout:5000,idleTimeoutMillis:20000});
}
async function main(){
  require('./credential-adapter-client.cjs').fromEnvironment(); // Explicit bad setup must not fall back to Docker.
  require('./runtime-config.cjs').internalOrigin();
  const publicOrigin=require('./runtime-config.cjs').publicOrigin(process.env.DASHBOARD_PUBLIC_ORIGIN);
  const credentialFile=process.env.DASHBOARD_FIREBASE_CREDENTIAL||path.join(process.env.USERPROFILE||'', 'Downloads','firebase-admin.json');
  const credential=JSON.parse(fs.readFileSync(credentialFile,'utf8'));
  if(credential.type!=='service_account'||credential.project_id!==projectId)throw Error('FIREBASE_PROJECT_MISMATCH');
  const app=initializeApp({projectId,credential:cert(credential)},'dashboard-server');
  const auth=getAuth(app);
  if(process.argv.includes('--check-credential')){
    await auth.listUsers(1); // Read-only credential/permission check. Never log returned records.
    console.log(JSON.stringify({credential_verified:true,project_matches:true,accounts_created:0,emails_sent:0}));await deleteApp(app);return;
  }
  const pool=localPool();
  pool.on('error',()=>console.error('LOCAL_AUTH_DATABASE_CONNECTION_LOST'));
  const check=await pool.query('SHOW default_transaction_read_only');
  if(check.rows[0]?.default_transaction_read_only!=='on')throw Error('READ_ONLY_DATABASE_REQUIRED');
  const identity=identityService({projectId,verifyIdToken:(token,checkRevoked)=>auth.verifyIdToken(token,checkRevoked),loadMemberships:membershipLoader(pool)});
  const keyFile=path.resolve(__dirname,'../../.local/gathering-api-key');
  const gathering=fs.existsSync(keyFile)?gatheringService({identity,apifyRecovery:require('./apify-recovery.cjs').recovery({secret:Buffer.from(require('node:crypto').hkdfSync('sha256',fs.readFileSync(keyFile,'utf8').trim(),'', 'dashboard-apify-recovery-v1',32)),read:require('./apify-recovery.cjs').loader(pool)}),campaignLoader:require('./campaign-preferences.cjs').loader(pool),campaignSave:payload=>require('./campaign-preferences.cjs').saver(write)(payload),strategyReadiness:require('./strategy-readiness.cjs').readinessLoader(pool),connectionSafety:connectionSafety(pool),transport:localGatheringTransport({key:fs.readFileSync(keyFile,'utf8').trim()})}):undefined;
  if(gathering)gathering.approvePlan=approvalService({identity,load:approvalLoader(pool),transport:localGatheringTransport({key:fs.readFileSync(keyFile,'utf8').trim()})});
  // A separate lazy pool is used only by the fixed registry-function action.
  // The existing authentication and data pool remains read-only.
  let registryPool;
  const write=sql=>{if(!registryPool)registryPool=localPool({registryWrite:true});return registryPool.query(sql);};
  const provisionSmtp=require('./n8n-smtp-workflows.cjs').createProvisioner({read:sql=>pool.query(sql)});
  const sender=senderManagement({identity,execute:write,onRecheck:provisionSmtp});
  const registryTransaction=async operation=>{
    if(!registryPool)registryPool=localPool({registryWrite:true});const client=await registryPool.connect();
    try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  };
  const smtp={...require('./smtp-onboarding.cjs').smtpOnboarding({identity,provision:provisionSmtp,encrypt:require('./gmail-bridge.cjs').encryptInContainer,transaction:registryTransaction}),
    ...require('./smtp-replacement.cjs').smtpReplacement({identity,provision:provisionSmtp,transaction:registryTransaction,rotate:require('./smtp-password-crypto.cjs').rotateInContainer})};
  let gmail;try{const cfg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.local/gmail-onboarding/config.json'),'utf8'));const client=loadClient(process.env.GMAIL_OAUTH_CLIENT_FILE||cfg.client_file,{redirect_uri:cfg.redirect_uri});const {OAuth2Client}=require('google-auth-library');
    const storageReady=(await pool.query("SELECT has_table_privilege(current_user,'credentials_entity','INSERT,UPDATE') AND has_table_privilege(current_user,'shared_credentials','INSERT') AND has_function_privilege(current_user,'sender_connection_manage(integer,text,jsonb)','EXECUTE') AS ready")).rows[0]?.ready;
    if(storageReady!==true)throw Error('GMAIL_STORAGE_NOT_CONFIGURED');
    const ports=provider({client,verifier:new OAuth2Client(client.client_id),onDiagnostic:event=>console.error(JSON.stringify({event:'gmail_provider_failure',...event}))});
    const durableReady=(await pool.query("SELECT has_table_privilege(current_user,'gmail_oauth_sessions','SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege(current_user,'gmail_enrollment_journal','SELECT,INSERT,UPDATE') AS ready")).rows[0]?.ready;
    if(durableReady!==true)throw Error('GMAIL_STORAGE_NOT_CONFIGURED');
    const oauthStore=require('./gmail-durable-store.cjs').store({transaction:registryTransaction,key:fs.readFileSync(path.resolve(__dirname,'../../.local/gmail-onboarding/state.key'))});
    const storage=bridge({identity,read:sql=>pool.query(sql),write,client,transaction:registryTransaction,durable:true});
    gmail=gmailService({config:{...cfg,client_id:client.client_id},principal:(token,org)=>identity.principal(token,org),onFailure:event=>console.error(JSON.stringify({event:'gmail_onboarding_failure',...event})),...ports,...storage,oauthStore});
  }catch{console.error('GMAIL_ONBOARDING_SETUP_UNAVAILABLE');}
  const batch=require('./email-batch-service.cjs').service({identity,store:require('./email-batch-store.cjs').createStore({pool}),startEnabled:()=>process.env.EMAIL_BATCH_DASHBOARD_START_ENABLED==='true'});
  const renewal=require('./campaign-renewal-supervisor.cjs').supervisor({enabled:process.env.EMAIL_CAMPAIGN_RENEWAL_ENABLED==='true',run:()=>require('../sender-connections/run-campaign-renewal.cjs').run({enabled:true,pool,execute:write,installAndStart:require('./campaign-slice-installer.cjs').create({pool,execute:write})}),onResult:result=>console.log(JSON.stringify({event:'campaign_renewal',...result})),onError:code=>console.error(code)});
  const campaignAuthority=require('./campaign-authority.cjs');const authority=campaignAuthority.service({identity,load:campaignAuthority.loader(pool),execute:write,available:campaignAuthority.availability(pool),startEnabled:()=>renewal.ready()});
  const linkedin=require('./linkedin-manual.cjs').service({identity,pool,execute:write});
  const callingModule=require('./calling-calendar.cjs'),listCallingCalendars=callingModule.localCatalog({loadAccount:async org=>(await pool.query('SELECT org_id,version,state,agent_id,agent_version FROM calling_accounts WHERE org_id=$1',[org])).rows[0]}),calling=callingModule.service({identity,pool,transaction:registryTransaction,listCalendars:listCallingCalendars});
  let whatsappConfig={enabled:false};try{whatsappConfig=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.local/whatsapp-embedded-signup/config.private.json'),'utf8'));}catch{}
  const whatsappSignup=require('./whatsapp-signup.cjs').signup({identity,config:whatsappConfig,allowedOrigins:['http://localhost:3002','http://127.0.0.1:3002',...(publicOrigin?[publicOrigin]:[])],transaction:registryTransaction,encrypt:require('./gmail-bridge.cjs').encryptInContainer});
  const checkWhatsApp=require('./whatsapp-check.cjs').checker({identity,pool,transaction:registryTransaction,...(['container','local-container'].includes(process.env.DASHBOARD_RUNTIME)?{inspect:async()=>{throw Error('WHATSAPP_CHECK_UNCONFIRMED');}}:{})});
  const whatsapp=require('./whatsapp.cjs').service({identity,pool,execute:write,signup:whatsappSignup,checkSender:checkWhatsApp});
  const facebook=require('./facebook-manual.cjs').service({identity,pool});
  let sms,smsPool,smsTimer,smsCallback,smsTick=Promise.resolve();
  try{
   const smsConfig=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.local/sms-gate/config.json'),'utf8'));
   const smsVault=require('../sms/provider.cjs').vault(path.resolve(__dirname,'../../.local/sms-gate/encryption.key'));
   const smsProvider=require('../sms/provider.cjs').provider({onDiagnostic:event=>console.error(JSON.stringify({event:'sms_provider_failure',...event}))});smsPool=localPool({registryWrite:true});
   const smsTransaction=async operation=>{const client=await smsPool.connect();try{await client.query('BEGIN');const r=await operation(client);await client.query('COMMIT');return r;}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}};
   const smsStore=require('../sms/store.cjs').store({pool:smsPool,transaction:smsTransaction});
   sms=require('./sms.cjs').service({identity,pool:smsPool,transaction:smsTransaction,store:smsStore,provider:smsProvider,vault:smsVault,callbackBase:smsConfig.callback_base||null});
   const callbackModule=require('../sms/events.cjs');smsCallback=callbackModule.server({handle:callbackModule.events({pool:smsPool,transaction:smsTransaction,vault:smsVault})});
   smsCallback.on('error',()=>{clearInterval(smsTimer);console.error('SMS_CALLBACK_LISTENER_UNAVAILABLE');});smsCallback.listen(3012,'0.0.0.0');
   const smsWorker=require('../sms/worker.cjs').worker({store:smsStore,provider:smsProvider,vault:smsVault,onError:code=>console.error(code)});
   if(!require('../../dashboard/src/release.json').evaluationMode&&(process.env.SMS_WORKER_ENABLED==='true'||process.env.SMS_WORKER_ENABLED===undefined&&process.env.DASHBOARD_RUNTIME!=='container')){let smsRunning=false;smsTimer=setInterval(()=>{if(smsRunning)return;smsRunning=true;smsTick=smsWorker.tick().catch(()=>console.error('SMS_WORKER_CHECK_UNAVAILABLE')).finally(()=>{smsRunning=false;});},30000);smsTimer.unref();}
  }catch{console.error('SMS_SETUP_PENDING');}
  let callingAccounts,callingBinding,callingPreflight;try{const accountModule=require('../calling/account-provider.cjs');callingAccounts=require('./calling-accounts.cjs').service({identity,pool,transaction:registryTransaction,provider:accountModule.provider({onDiagnostic:event=>console.error(JSON.stringify({event:'calling_account_lookup',...event}))}),vault:accountModule.vault(path.resolve(__dirname,'../../.local/calling-accounts/encryption.key'))});callingBinding=require('./calling-binding.cjs').service({identity,pool,transaction:registryTransaction,listCalendars:listCallingCalendars,provider:accountModule.provider({onDiagnostic:event=>console.error(JSON.stringify({event:'calling_account_lookup',...event}))}),vault:accountModule.vault(path.resolve(__dirname,'../../.local/calling-accounts/encryption.key'))});callingPreflight=require('./calling-preflight.cjs').service({identity,pool,transaction:registryTransaction,provider:accountModule.provider({onDiagnostic:event=>console.error(JSON.stringify({event:'calling_account_lookup',...event}))}),vault:accountModule.vault(path.resolve(__dirname,'../../.local/calling-accounts/encryption.key'))});}catch{console.error('CALLING_ACCOUNT_SETUP_PENDING');}
  const draftBatch=fs.existsSync(keyFile)?require('./draft-batch.cjs').service({identity,pool,transaction:registryTransaction,readiness:require('./strategy-readiness.cjs').readinessLoader(pool),secret:require('node:crypto').createHash('sha256').update(fs.readFileSync(keyFile,'utf8').trim()+'draft-batch-v1').digest()}):undefined;
  const leadImports=require('./lead-import.cjs').service({identity,pool,transaction:registryTransaction});
  const leadExport=require('./lead-export.cjs').service({identity,pool});
  const cleaningReview=require('./cleaning-review.cjs').service({identity,pool,transaction:registryTransaction});
  const enrollment=require('./workspace-enrollment.cjs').service({identity,transaction:registryTransaction});
  const listenHost=process.env.DASHBOARD_BIND_HOST||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(listenHost))throw Error('DASHBOARD_BIND_HOST_INVALID');
  const server=createServer({draftBatch,leadImports,leadExport,cleaningReview,packageAccess:require('./package-access.cjs').service({identity,pool}),publicOrigin,localAppOrigin:process.env.DASHBOARD_LOCAL_ORIGIN,health:async()=>{await pool.query('SELECT 1');},callingPreflight,callingBinding,callingAccounts,enrollment,sms,facebook,whatsapp,calling,linkedin,authority,batch,identity,data:dataService({pool,identity,automationAvailable:()=>renewal.ready()}),gathering,sender,gmail,smtp,port:3002,buildRoot:path.resolve(__dirname,'../../dashboard/build')});
  server.on('error',()=>{console.error('LOCAL_AUTH_SERVER_FAILED');pool.end().finally(()=>process.exit(1));});
  server.listen(3002,listenHost,()=>console.log(JSON.stringify({listening:publicOrigin||'http://localhost:3002/login',database_read_only:true,membership_writes:false,outreach_routes_enabled:false})));
  const stop=()=>{clearInterval(smsTimer);smsCallback?.close();server.close(()=>Promise.all([renewal.stop(),smsTick]).then(()=>Promise.all([pool.end(),registryPool?.end(),smsPool?.end()])).finally(()=>process.exit(0)));};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(require.main===module)main().catch(()=>{console.error('LOCAL_AUTH_SETUP_FAILED');process.exitCode=1;});
module.exports={localPool,main};
