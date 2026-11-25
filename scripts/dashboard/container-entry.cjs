'use strict';
const fs=require('node:fs'),path=require('node:path'),config=require('./runtime-config.cjs');
function validate(env=process.env,{read=(file)=>fs.readFileSync(file,'utf8'),buildRoot=path.resolve(__dirname,'../../dashboard/build')}={}){
 if(!['staging','production'].includes(env.DASHBOARD_DEPLOYMENT_STAGE))throw Error('DEPLOYMENT_STAGE_REQUIRED');
 if(!config.databaseOptions(env,read)||!config.publicOrigin(env.DASHBOARD_PUBLIC_ORIGIN)||!env.DASHBOARD_FIREBASE_CREDENTIAL||!env.CREDENTIAL_ADAPTER_URL||!env.CREDENTIAL_ADAPTER_TOKEN_FILE)throw Error('CONTAINER_CONFIGURATION_REQUIRED');
 config.internalOrigin(env.N8N_INTERNAL_ORIGIN);
 if(env.DASHBOARD_BIND_HOST!=='0.0.0.0')throw Error('CONTAINER_BIND_REQUIRED');
 if(env.DASHBOARD_DEPLOYMENT_STAGE==='staging'&&['EMAIL_CAMPAIGN_RENEWAL_ENABLED','EMAIL_BATCH_DASHBOARD_START_ENABLED','SMS_WORKER_ENABLED'].some(k=>env[k]!=='false'))throw Error('STAGING_AUTOMATION_MUST_BE_DISABLED');
 const root=buildRoot,manifest=JSON.parse(read(path.join(root,'asset-manifest.json')));
 const main=manifest.files?.['main.js'];if(!/^\/static\/js\/main\.[a-f0-9]{8}\.js$/.test(main||''))throw Error('RELEASE_BUILD_REQUIRED');
 const bundle=read(path.join(root,main));
 if(manifest.release?.version==='leadgen_dashboard_v1'){
  if(!bundle.includes('INVALID_MEMBERSHIP')||!bundle.includes('MEMBERSHIP_REQUIRED'))throw Error('LIVE_APPLICATION_BUILD_REQUIRED');
 }else if(!bundle.includes('Find businesses, prepare outreach')||!bundle.includes('Account linking'))throw Error('LIVE_APPLICATION_BUILD_REQUIRED');
}
if(require.main===module){try{validate();process.env.DASHBOARD_RUNTIME='container';require('./start-local-auth.cjs').main().catch(()=>{console.error('CONTAINER_GATEWAY_SETUP_UNAVAILABLE');process.exitCode=1;});}catch(error){console.error(['STAGING_AUTOMATION_MUST_BE_DISABLED','DEPLOYMENT_STAGE_REQUIRED'].includes(error.message)?error.message:'CONTAINER_GATEWAY_CONFIGURATION_REQUIRED');process.exitCode=1;}}
module.exports={validate};
