'use strict';
const fs=require('node:fs'),{parseEnv}=require('node:util'),{publicOrigin}=require('../dashboard/runtime-config.cjs');
const files=['POSTGRES_PASSWORD_FILE','DASHBOARD_DATABASE_PASSWORD_FILE','CREDENTIAL_ADAPTER_TOKEN_FILE','FIREBASE_CREDENTIAL_FILE','GATHERING_API_KEY_FILE','N8N_API_KEY_FILE','GMAIL_CONFIG_FILE','GMAIL_CLIENT_FILE','GMAIL_STATE_KEY_FILE','N8N_PROVIDER_ENV_FILE'];
function check(env,{read=file=>fs.readFileSync(file)}={}){
 const issues=[],data={};const example=host=>host==='example.com'||host.endsWith('.example.com');const issue=(field,code)=>issues.push({field,code});
 if(!['staging','production'].includes(env.DEPLOYMENT_STAGE))issue('DEPLOYMENT_STAGE','required');
 let origin;try{origin=publicOrigin(env.DASHBOARD_PUBLIC_ORIGIN);if(!origin)throw Error();if(example(new URL(origin).hostname))issue('DASHBOARD_PUBLIC_ORIGIN','replace_example_domain');}catch{issue('DASHBOARD_PUBLIC_ORIGIN','exact_https_origin_required');}
 try{const u=new URL(env.PUBLIC_WEBHOOK_BASE);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/')||u.href!==env.PUBLIC_WEBHOOK_BASE)throw Error();if(example(u.hostname))issue('PUBLIC_WEBHOOK_BASE','replace_example_domain');}catch{issue('PUBLIC_WEBHOOK_BASE','https_base_required');}
 if(!env.DASHBOARD_DB_USER)issue('DASHBOARD_DB_USER','required');
 else if(env.DEPLOYMENT_STAGE==='production'&&['postgres','n8n_user'].includes(env.DASHBOARD_DB_USER))issue('DASHBOARD_DB_USER','separate_gateway_role_required');
 for(const field of ['POSTGRES_DATA_VOLUME','N8N_DATA_VOLUME'])if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(env[field]||''))issue(field,'target_volume_required');else if(['lead-gen-system_postgres_data','lead-gen-system_n8n_data'].includes(env[field]))issue(field,'working_volume_not_allowed');
 if(env.POSTGRES_DATA_VOLUME&&env.POSTGRES_DATA_VOLUME===env.N8N_DATA_VOLUME)issue('N8N_DATA_VOLUME','separate_volume_required');
 for(const field of ['ENABLE_APPROVED_AUTOMATION','EMAIL_CAMPAIGN_RENEWAL_ENABLED','EMAIL_BATCH_DASHBOARD_START_ENABLED','SMS_WORKER_ENABLED']){
  if(!['true','false'].includes(env[field]))issue(field,'explicit_boolean_required');else if(env.DEPLOYMENT_STAGE==='staging'&&env[field]!=='false')issue(field,'must_be_disabled_in_staging');
 }
 const approvedWorkflowIds=env.STAGING_APPROVED_WORKFLOW_IDS??'';
 const approvedIds=typeof approvedWorkflowIds==='string'?(approvedWorkflowIds.trim()?approvedWorkflowIds.split(',').map(id=>id.trim()):[]):null;
 if(!approvedIds||approvedIds.some(id=>!/^[A-Za-z0-9_-]{1,100}$/.test(id))||new Set(approvedIds).size!==approvedIds.length)issue('STAGING_APPROVED_WORKFLOW_IDS','comma_separated_unique_ids_required');
 if(env.DEPLOYMENT_STAGE==='production'&&approvedIds?.length)issue('STAGING_APPROVED_WORKFLOW_IDS','staging_only');
 for(const field of files){if(!env[field]){issue(field,'file_required');continue;}try{const value=read(env[field]),buffer=Buffer.isBuffer(value)?value:Buffer.from(value);if(buffer.length>1048576||!buffer.length&&field!=='N8N_PROVIDER_ENV_FILE')throw Error();data[field]=buffer;}catch{issue(field,'file_unreadable_or_invalid');}}
 for(const field of ['POSTGRES_PASSWORD_FILE','DASHBOARD_DATABASE_PASSWORD_FILE','GATHERING_API_KEY_FILE','N8N_API_KEY_FILE'])if(data[field]&&!data[field].toString('utf8').trim())issue(field,'nonempty_secret_required');
 if(data.CREDENTIAL_ADAPTER_TOKEN_FILE&&!/^[a-f0-9]{64}$/.test(data.CREDENTIAL_ADAPTER_TOKEN_FILE.toString('utf8').trim()))issue('CREDENTIAL_ADAPTER_TOKEN_FILE','token_format_invalid');
 if(data.GMAIL_STATE_KEY_FILE&&data.GMAIL_STATE_KEY_FILE.length!==32)issue('GMAIL_STATE_KEY_FILE','existing_32_byte_key_required');
 function json(field){if(!data[field])return null;try{return JSON.parse(data[field].toString('utf8'));}catch{issue(field,'invalid_json');return null;}}
 const firebase=json('FIREBASE_CREDENTIAL_FILE');if(firebase&&(firebase.type!=='service_account'||firebase.project_id!=='lead-gen-system-fad55'||typeof firebase.private_key!=='string'||!firebase.private_key.includes('PRIVATE KEY-----')||typeof firebase.client_email!=='string'||!firebase.client_email.includes('@')))issue('FIREBASE_CREDENTIAL_FILE','firebase_identity_invalid');
 const gmail=json('GMAIL_CONFIG_FILE'),client=json('GMAIL_CLIENT_FILE')?.web,callback=origin?origin+'/oauth/gmail/callback':null;
 if(gmail&&(gmail.enabled!==true||gmail.origin!==origin||gmail.redirect_uri!==callback||gmail.client_file!=='/run/secrets/gmail-oauth-client'))issue('GMAIL_CONFIG_FILE','callback_or_container_path_mismatch');
 if(data.GMAIL_CLIENT_FILE&&(!client||typeof client.client_id!=='string'||!client.client_id.endsWith('.apps.googleusercontent.com')||!client.client_secret||!Array.isArray(client.redirect_uris)||!client.redirect_uris.includes(callback)))issue('GMAIL_CLIENT_FILE','configured_callback_not_registered_in_file');
 return{scope:'offline_configuration_only',ready:issues.length===0,checked_files:Object.keys(data).length,issues,network_requests:0,resources_created:0};
}
if(require.main===module){try{if(process.argv.length!==3)throw Error();const result=check(parseEnv(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}catch{console.error('TARGET_ENV_FILE_INVALID');process.exitCode=1;}}
module.exports={check};
