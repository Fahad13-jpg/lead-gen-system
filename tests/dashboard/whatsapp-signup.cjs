'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {signup}=require('../../scripts/dashboard/whatsapp-signup.cjs');
const config={enabled:true,embedded_signup_version:4,app_id:'2132619344002820',configuration_id:'1321599346730988',api_version:'v25.0',app_secret:'SECRET',https_origin:'https://fixture.example',credential_rotation_deadline:new Date(Date.now()+86400000).toISOString()};
function fixture(){let calls=0;const p={org_id:7,subject:'a'.repeat(64),active:true,role:'member'};const f={p,identity:{principal:async(t,org)=>{assert.equal(t,'verified');if(org!==7)throw Error('MEMBERSHIP_REQUIRED');return p;}}};f.api=signup({identity:f.identity,config,allowedOrigins:[config.https_origin],transaction:()=>assert.fail('NO_STORAGE'),encrypt:()=>assert.fail('NO_ENCRYPTION'),fetch:async()=>{calls++;throw Error('PRIVATE_PROVIDER_FAILURE');}});f.calls=()=>calls;return f;}
test('signup fails closed without setup and refuses deprecated configuration versions',async()=>{
 const f=fixture();assert.equal(signup({identity:f.identity,config:{enabled:false}}).ready(),false);assert.equal(signup({identity:f.identity,config:{...config,embedded_signup_version:3},allowedOrigins:[config.https_origin],transaction:()=>{},encrypt:()=>{}}).ready(),false);assert.equal(f.api.ready(),true);
 await assert.rejects(f.api.begin('verified',{org_id:8},config.https_origin),/MEMBERSHIP_REQUIRED/);await assert.rejects(f.api.begin('verified',{org_id:7},'http://localhost:3002'),/ORIGIN_REQUIRED/);assert.equal(f.calls(),0);
});
test('HTTP-only hosting or an expired rotation deadline cannot advertise signup availability',()=>{
 const f=fixture(),ports={identity:f.identity,config,transaction:()=>{},encrypt:()=>{}};
 assert.equal(signup({...ports,allowedOrigins:['http://localhost:3002']}).ready(),false);
 assert.equal(signup({...ports,allowedOrigins:[config.https_origin],config:{...config,credential_rotation_deadline:'2000-01-01T00:00:00Z'}}).ready(),false);
});
test('HTTP-derived origin and one-use state prevent forged origin, scope or repeated exchanges',async()=>{
 const f=fixture(),s=await f.api.begin('verified',{org_id:7},config.https_origin);
 const p={org_id:7,state:s.state,code:'ONE_USE_CODE',waba_id:'123456789',phone_number_id:'987654321',connection_id:'whatsapp_fixture',sharing:'private'};
 await assert.rejects(f.api.complete('verified',{...p,origin:config.https_origin},config.https_origin),/INVALID_FILTER/);assert.equal(f.calls(),0);
 const r=await f.api.complete('verified',p,config.https_origin);assert.equal(r.state,'setup_unconfirmed');assert(!JSON.stringify(r).includes('PRIVATE'));assert.equal(f.calls(),1);
 await assert.rejects(f.api.complete('verified',p,config.https_origin),/RESULT_REJECTED/);assert.equal(f.calls(),1);
});
test('a member cannot authorize a team sender or supply higher initial sending limits',async()=>{
 const f=fixture(),s=await f.api.begin('verified',{org_id:7},config.https_origin),p={org_id:7,state:s.state,code:'CODE',waba_id:'123456789',phone_number_id:'987654321',connection_id:'fixture',sharing:'team'};
 await assert.rejects(f.api.complete('verified',p,config.https_origin),/ROLE_REQUIRED/);await assert.rejects(f.api.complete('verified',{...p,limits:{daily_messages:999}},config.https_origin),/INVALID_FILTER/);assert.equal(f.calls(),0);
});
