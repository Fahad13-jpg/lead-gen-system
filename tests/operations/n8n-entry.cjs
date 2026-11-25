'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {guard,stagingWorkflowIds}=require('../../scripts/operations/n8n-entry.cjs');

function queryFor(ids){return async sql=>{assert.match(sql,/SELECT id FROM workflow_entity WHERE active=true/);return{rows:ids.map(id=>({id}))};};}

test('staging allows an empty workflow set by default',async()=>{
 const result=await guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false'},query:queryFor([])});
 assert.deepEqual(result,{active_workflows:0,staging_allowlist_entries:0});
});

test('staging allows only active workflow IDs that were explicitly approved',async()=>{
 const result=await guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false',STAGING_APPROVED_WORKFLOW_IDS:'apify-connect,search-v1,campaign-v2'},query:queryFor(['apify-connect','campaign-v2'])});
 assert.equal(result.active_workflows,2);
 assert.equal(result.staging_allowlist_entries,3);
});

test('staging rejects any active workflow outside the exact allowlist',async()=>{
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false',STAGING_APPROVED_WORKFLOW_IDS:'apify-connect,campaign-v2'},query:queryFor(['apify-connect','email-send'])}),{message:'ACTIVE_WORKFLOWS_REQUIRE_REVIEW'});
});

test('staging rejects active workflows when the allowlist is empty',async()=>{
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false'},query:queryFor(['campaign-v2'])}),{message:'ACTIVE_WORKFLOWS_REQUIRE_REVIEW'});
});

test('production still requires explicit automation approval for active workflows',async()=>{
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'production',ENABLE_APPROVED_AUTOMATION:'false'},query:queryFor(['email-send'])}),{message:'ACTIVE_WORKFLOWS_REQUIRE_REVIEW'});
 assert.deepEqual(await guard({env:{DEPLOYMENT_STAGE:'production',ENABLE_APPROVED_AUTOMATION:'true'},query:queryFor(['email-send'])}),{active_workflows:1,staging_allowlist_entries:0});
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'production',ENABLE_APPROVED_AUTOMATION:'true',STAGING_APPROVED_WORKFLOW_IDS:'one'},query:queryFor([])}),{message:'STAGING_WORKFLOW_ALLOWLIST_INVALID'});
});

test('unknown stage, malformed allowlists and unavailable database state fail closed',async()=>{
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'development'},query:queryFor([])}),{message:'DEPLOYMENT_STAGE_REQUIRED'});
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'true'},query:queryFor([])}),{message:'STAGING_AUTOMATION_MUST_BE_DISABLED'});
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false',STAGING_APPROVED_WORKFLOW_IDS:'one,,two'},query:queryFor([])}),{message:'STAGING_WORKFLOW_ALLOWLIST_INVALID'});
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false',STAGING_APPROVED_WORKFLOW_IDS:'one,one'},query:queryFor([])}),{message:'STAGING_WORKFLOW_ALLOWLIST_INVALID'});
 await assert.rejects(guard({env:{DEPLOYMENT_STAGE:'staging',ENABLE_APPROVED_AUTOMATION:'false'},query:async()=>({rows:null})}),{message:'WORKFLOW_STATE_UNAVAILABLE'});
});

test('allowlist parser accepts blank input and rejects unsafe or duplicate identifiers',()=>{
 assert.equal(stagingWorkflowIds('').size,0);
 assert.equal(stagingWorkflowIds('  ').size,0);
 assert.deepEqual([...stagingWorkflowIds('abc-1,def_2')],['abc-1','def_2']);
 assert.throws(()=>stagingWorkflowIds('abc,abc'),{message:'STAGING_WORKFLOW_ALLOWLIST_INVALID'});
 assert.throws(()=>stagingWorkflowIds('workflow id'),{message:'STAGING_WORKFLOW_ALLOWLIST_INVALID'});
});
