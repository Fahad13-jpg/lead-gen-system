'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const{input,service}=require('../../scripts/dashboard/workspace-enrollment.cjs');
const subject='a'.repeat(64),request_id='11111111-1111-4111-8111-111111111111';
test('workspace enrollment accepts only a name, request identity and owner acknowledgement',()=>{
 assert.deepEqual(input({name:'  My   workspace ',request_id,acknowledge_owner:true}),{name:'My workspace',request_id});
 for(const patch of [{org_id:1},{role:'admin'},{subscription_tier:'premium'},{credits:1000},{subject:'b'.repeat(64)},{name:'x'},{name:'a\u202eb'},{acknowledge_owner:false},{request_id:'invalid'}])assert.throws(()=>input({name:'My workspace',request_id,acknowledge_owner:true,...patch}),/INVALID_FILTER/);
});
test('unverified identities cannot reach any enrollment transaction',async()=>{
 let transactions=0;const api=service({identity:{session:async()=>({identity_verified:true,email_verified:false,subject})},transaction:async()=>{transactions++;}});await assert.rejects(api.create('token',{name:'My workspace',request_id,acknowledge_owner:true}),/AUTHENTICATION_FAILED/);assert.equal(transactions,0);
});
test('repeated creation uses verified subject and returns only an existing active owner receipt',async()=>{
 const queries=[],row={org_id:7,request_id,requested_name:'My workspace',org_name:'My workspace',status:'active',role:'owner',active:true};
 const api=service({identity:{session:async()=>({identity_verified:true,email_verified:true,subject})},transaction:fn=>fn({query:async(sql,args)=>{queries.push({sql,args});return{rows:sql.includes('FROM workspace_enrollments e')?[row]:[]};}})});
 const r=await api.create('token',{name:'My workspace',request_id,acknowledge_owner:true});assert(r.saved);assert(r.already_recorded);assert.equal(r.organization.org_id,7);assert.equal(r.provider_credits_granted,false);assert.equal(r.ai_requests_granted,0);assert(queries.every(q=>q.sql.startsWith('SELECT')));assert(queries.every(q=>q.args[0]===subject));
 row.active=false;await assert.rejects(api.status('token',{request_id}),/WORKSPACE_ACCESS_REVIEW_REQUIRED/);row.active=true;await assert.rejects(api.create('token',{name:'Changed',request_id,acknowledge_owner:true}),/WORKSPACE_REQUEST_CONFLICT/);
});
