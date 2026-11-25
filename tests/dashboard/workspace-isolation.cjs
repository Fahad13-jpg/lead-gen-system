'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {identityService}=require('../../scripts/dashboard/identity.cjs');
const {dataService}=require('../../scripts/dashboard/data.cjs');
const {service:packages}=require('../../scripts/dashboard/package-access.cjs');
const projectId='workspace-isolation-test',issuer='https://securetoken.google.com/'+projectId,clock=2000000000;
const subject=crypto.createHash('sha256').update(issuer+'\0fixture-user').digest('hex');
function fixture(){let active=true,queries=0;const identity=identityService({projectId,now:()=>clock,verifyIdToken:async()=>({iss:issuer,aud:projectId,sub:'fixture-user',uid:'fixture-user',email_verified:true,iat:clock-60,exp:clock+3540,auth_time:clock-60,org_id:8,role:'owner'}),loadMemberships:async()=>active?[{org_id:7,name:'Allowed workspace',subject,role:'member',active:true,organization_active:true}]:[]});const pool={query:async()=>{queries++;throw Error('UNEXPECTED_DATABASE_ACCESS');}};return{identity,pool,get queries(){return queries;},revoke(){active=false;}};}
test('forged organization and owner claims cannot reach another workspace read query',async()=>{
 const x=fixture(),data=dataService(x);
 const principal=await x.identity.principal('fixture-token',7);assert.equal(principal.role,'member');
 for(const [method,params] of [['settings',{}],['outreach',{}],['leadDetail',{lead_id:'1'}],['searchRequest',{request_id:'dash_'+'b'.repeat(32)}],['campaigns',{}],['plans',{campaign_id:'1'}],['strategyRequest',{request_id:'dash_'+'a'.repeat(32)}],['overview',{}],['leads',{}],['jobs',{}]])await assert.rejects(data[method]('fixture-token',{org_id:'8',...params}),/MEMBERSHIP_REQUIRED/);
 assert.equal(x.queries,0);
});
test('paid setup rejects another workspace before reading package or provider configuration',async()=>{
 const x=fixture(),access=packages(x);
 await assert.rejects(access.authorize('fixture-token',{org_id:8},{action:'connectCallingAccount'}),/MEMBERSHIP_REQUIRED/);
 await assert.rejects(access.authorize('fixture-token',{org_id:8},{action:'smsAction',smsAction:'release'}),/MEMBERSHIP_REQUIRED/);
 assert.equal(x.queries,0);
});
test('revoked membership blocks the next read even with the same verified token',async()=>{
 const x=fixture();await x.identity.principal('fixture-token',7);x.revoke();
 await assert.rejects(dataService(x).settings('fixture-token',{org_id:'7'}),/MEMBERSHIP_REQUIRED/);assert.equal(x.queries,0);
});
