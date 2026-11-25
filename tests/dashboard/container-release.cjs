'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{validate}=require('../../scripts/dashboard/container-entry.cjs'),{guard}=require('../../scripts/operations/n8n-entry.cjs');
const env={DASHBOARD_DEPLOYMENT_STAGE:'staging',DATABASE_HOST:'postgres',DATABASE_NAME:'lead_db',DATABASE_USER:'fixture',DATABASE_PASSWORD_FILE:'/secret/password',DATABASE_TLS:'off',DASHBOARD_PUBLIC_ORIGIN:'https://app.example.com',DASHBOARD_FIREBASE_CREDENTIAL:'/secret/firebase',CREDENTIAL_ADAPTER_URL:'http://credential-adapter:3013',CREDENTIAL_ADAPTER_TOKEN_FILE:'/secret/adapter',DASHBOARD_BIND_HOST:'0.0.0.0',N8N_INTERNAL_ORIGIN:'http://n8n:5678',EMAIL_CAMPAIGN_RENEWAL_ENABLED:'false',EMAIL_BATCH_DASHBOARD_START_ENABLED:'false',SMS_WORKER_ENABLED:'false'};
const read=file=>file==='/secret/password'?'FAKE':file.endsWith('asset-manifest.json')?JSON.stringify({files:{'main.js':'/static/js/main.12345678.js'}}):'Find businesses, prepare outreach Account linking';
test('container launch requires explicit credentials, public origin and disabled staging senders',()=>{
 assert.doesNotThrow(()=>validate(env,{read}));
 for(const key of ['EMAIL_CAMPAIGN_RENEWAL_ENABLED','EMAIL_BATCH_DASHBOARD_START_ENABLED','SMS_WORKER_ENABLED'])assert.throws(()=>validate({...env,[key]:'true'},{read}),/STAGING_AUTOMATION/);
 assert.throws(()=>validate({...env,DASHBOARD_DEPLOYMENT_STAGE:undefined},{read}),/STAGE_REQUIRED/);
 assert.throws(()=>validate({...env,DATABASE_PASSWORD_FILE:undefined},{read}),/CONFIGURATION_REQUIRED/);
 assert.throws(()=>validate({...env,DASHBOARD_PUBLIC_ORIGIN:undefined},{read}),/CONFIGURATION_REQUIRED/);
 assert.throws(()=>validate({...env,CREDENTIAL_ADAPTER_URL:undefined},{read}),/CONFIGURATION_REQUIRED/);
});
test('a sample-only frontend cannot pass the live release build check',()=>{
 assert.throws(()=>validate(env,{read:file=>file.endsWith('.js')?'Sample design preview':read(file)}),/LIVE_APPLICATION_BUILD_REQUIRED/);
});
test('restored active workflows block staging before n8n is started',async()=>{
 const query=async sql=>{assert(sql.startsWith('SELECT'));return{rows:[{active_workflows:87}]};};
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'true'},query}),/REQUIRE_REVIEW/);
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'production',ENABLE_APPROVED_AUTOMATION:'false'},query}),/REQUIRE_REVIEW/);
 assert.equal((await guard({env:{DEPLOYMENT_STAGE:'production',ENABLE_APPROVED_AUTOMATION:'true'},query})).active_workflows,87);
 assert.equal((await guard({env:{DEPLOYMENT_STAGE:'staging'},query:async()=>({rows:[{active_workflows:0}]})})).active_workflows,0);
});


test('Vite release validates executable membership guards without requiring lazy-page text in the entry',()=>{
 const manifest={files:{'main.js':'/static/js/main.12345678.js'},release:{version:'leadgen_dashboard_v1',builder:'vite'}};
 const viteRead=file=>file.endsWith('asset-manifest.json')?JSON.stringify(manifest):file.endsWith('.js')?'INVALID_MEMBERSHIP MEMBERSHIP_REQUIRED':read(file);
 assert.doesNotThrow(()=>validate(env,{read:viteRead}));
 assert.throws(()=>validate(env,{read:file=>file.endsWith('.js')?'Design preview':viteRead(file)}),/LIVE_APPLICATION_BUILD_REQUIRED/);
});
