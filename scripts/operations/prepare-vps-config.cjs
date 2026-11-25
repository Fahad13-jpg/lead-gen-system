'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const backup=require('./backup-crypto.cjs');
async function main(){
 const root='/work',privateRoot=path.join(root,'private-migration'),dest=path.join(privateRoot,'secrets');
 if(!fs.existsSync(path.join(privateRoot,'RESTORE_COMPLETE')))throw Error('RESTORE_NOT_COMPLETE');
 if(fs.existsSync(path.join(privateRoot,'CONFIG_COMPLETE')))throw Error('CONFIG_ALREADY_PREPARED');
 const data=await backup.readSmall(path.join(root,'deployment-backup-20261122/runtime-secrets.lgb'),backup.keyFile(path.join(root,'deployment-backup-20261122.key')));
 const source=new Map(data.files.map(f=>[f.name,Buffer.from(f.data,'base64')]));
 fs.mkdirSync(dest,{recursive:true,mode:0o700});fs.chmodSync(dest,0o700);
 const save=(name,value)=>{const file=path.join(dest,name);if(fs.existsSync(file))throw Error('SECRET_ALREADY_EXISTS '+name);fs.writeFileSync(file,value,{flag:'wx',mode:0o644});};
 const required=name=>{if(!source.has(name))throw Error('SOURCE_SECRET_MISSING '+name);return source.get(name);};
 for(const [from,to]of [['external/firebase-admin.json','firebase-admin.json'],['external/gmail-oauth-client.json','gmail-client.json'],['.local/gathering-api-key','gathering-api-key'],['.local/n8n-api-key.txt','n8n-api-key'],['.local/credential-adapter/token','credential-adapter-token'],['.local/gmail-onboarding/state.key','gmail-state.key']])save(to,required(from));
 const pg=parseEnv(fs.readFileSync(path.join(privateRoot,'postgres.env'),'utf8')).POSTGRES_PASSWORD;
 if(!/^[a-f0-9]{64}$/.test(pg||''))throw Error('TARGET_DATABASE_SECRET_INVALID');
 save('postgres-password',pg);save('gateway-database-password',crypto.randomBytes(32).toString('hex'));
 save('gmail-config.json',JSON.stringify({enabled:true,origin:'https://leadmorrow.tech',redirect_uri:'https://leadmorrow.tech/oauth/gmail/callback',client_file:'/run/secrets/gmail-oauth-client'},null,2));
 const provider=parseEnv(required('.env').toString('utf8'));
 const allowed=['GROQ_API_KEY','SERPER_API_KEY','APIFY_API_KEY','ABSTRACT_EMAIL_API_KEY','SENDGRID_API_KEY'];
 save('providers.env',allowed.filter(k=>provider[k]).map(k=>k+'='+JSON.stringify(provider[k])).join('\n')+'\n');
 const journalRoot=path.join(privateRoot,'gateway-journals');fs.mkdirSync(journalRoot,{recursive:true,mode:0o700});
 for(const [name,value]of source){if(!/^\.local\/(smtp-provisioning|campaign-slices)\/[A-Za-z0-9_./-]+$/.test(name))continue;const relative=name.slice('.local/'.length);if(relative.split('/').includes('..'))throw Error('UNSAFE_JOURNAL_PATH');const file=path.join(journalRoot,relative);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,value,{mode:0o600});}
 const host='/opt/leadmorrow/private-migration/secrets/';
 const env={DEPLOYMENT_STAGE:'staging',DASHBOARD_PUBLIC_ORIGIN:'https://leadmorrow.tech',PUBLIC_WEBHOOK_BASE:'https://leadmorrow.tech/',POSTGRES_DATA_VOLUME:'leadmorrow_target_postgres',N8N_DATA_VOLUME:'leadmorrow_target_n8n',DASHBOARD_DB_USER:'lead_dashboard',POSTGRES_PASSWORD_FILE:host+'postgres-password',DASHBOARD_DATABASE_PASSWORD_FILE:host+'gateway-database-password',CREDENTIAL_ADAPTER_TOKEN_FILE:host+'credential-adapter-token',FIREBASE_CREDENTIAL_FILE:host+'firebase-admin.json',GATHERING_API_KEY_FILE:host+'gathering-api-key',N8N_API_KEY_FILE:host+'n8n-api-key',GMAIL_CONFIG_FILE:host+'gmail-config.json',GMAIL_CLIENT_FILE:host+'gmail-client.json',GMAIL_STATE_KEY_FILE:host+'gmail-state.key',N8N_PROVIDER_ENV_FILE:host+'providers.env',ENABLE_APPROVED_AUTOMATION:'false',STAGING_APPROVED_WORKFLOW_IDS:'',EMAIL_CAMPAIGN_RENEWAL_ENABLED:'false',EMAIL_BATCH_DASHBOARD_START_ENABLED:'false',SMS_WORKER_ENABLED:'false',PUBLIC_SITE_INDEXING_ENABLED:'false',PUBLIC_ANALYTICS_ENABLED:'false',APP_DOMAIN:'leadmorrow.tech'};
 fs.writeFileSync(path.join(root,'deployment/target.env'),Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(privateRoot,'CONFIG_COMPLETE'),'prepared\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({configured:true,domain:'leadmorrow.tech',automation_enabled:false,secrets_displayed:0,next:'Google domain registration, gateway database grants and image build'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
