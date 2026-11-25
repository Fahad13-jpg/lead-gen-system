'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{handle,authorized}=require('../../scripts/calling/tool-gateway.cjs');
const config={token:'x'.repeat(64),org_id:1,agent_id:'agent_test',agent_version:0,connection_ref:'retell_test'};
const expected_request={override_agent_id:'agent_test',override_agent_version:0,from_number:'+12025550101',to_number:'+12025550102',metadata:{org_id:'1',activity_id:'5',plan_hash:'fixture',dispatch_key:'fixture-dispatch'}};
const call={call_id:'call_test',agent_id:'agent_test',agent_version:0,call_type:'phone_call',call_status:'ongoing',from_number:expected_request.from_number,to_number:expected_request.to_number,metadata:expected_request.metadata};
const input={headers:{'x-call-tool-token':config.token},body:{name:'record_outcome',args:{outcome:'interested',event_id:'one'},call}};
test('bad token stops before every dependency',async()=>{assert.equal(authorized({},config.token),false);assert.equal((await handle({...input,headers:{}},config,{})).reason,'unauthorized');});
test('provider identity and browser calls cannot write leads',async()=>{
 const deps={getCall:async()=>({...call,agent_id:'wrong'})};assert.equal((await handle(input,config,deps)).reason,'provider_call_not_active_or_mismatched');
 const web={...call,call_type:'web_call'};assert.equal((await handle({...input,body:{...input.body,call:web}},config,{getCall:async()=>web})).reason,'browser_test_has_no_live_lead_binding');
});
test('unique org-bound activity required',async()=>{let sql;const r=await handle(input,config,{getCall:async()=>call,rows:async q=>{sql=q;return [];}});assert.equal(r.reason,'unique_call_binding_required');assert.match(sql,/org_id=1/);assert.match(sql,/connection_ref/);});
test('browser version is separate from phone pin and dispatches only after provider verification',async()=>{
 const c={...config,browser_agent_version:1},web={...call,agent_version:1,call_type:'web_call'};
 let reached=0;const deps={getCall:async()=>web,rows:()=>assert.fail('browser must never reach production SQL'),browserTest:async(_i,actual)=>{assert.equal(actual,web);reached++;return{test_only:true};}};
 assert.equal((await handle({...input,body:{...input.body,call:web}},c,deps)).test_only,true);assert.equal(reached,1);
 await assert.rejects(handle({...input,body:{...input.body,call:{...call,agent_version:1}}},c,deps),/CALL_IDENTITY_INVALID/);
 deps.getCall=async()=>({...web,call_status:'ended'});
 assert.equal((await handle({...input,body:{...input.body,call:web}},c,deps)).reason,'provider_call_not_active_or_mismatched');assert.equal(reached,1);
});
test('connected tool uses server binding and validates context',async()=>{
 const binding={org_id:1,activity_id:'5',provider_call_id:'call_test',connection_ref:'retell_test',expected_request},queries=[];
 const r=await handle(input,config,{getCall:async()=>call,rows:async()=>[binding],now:()=>new Date().toISOString(),executeQuery:async q=>{queries.push(q);return queries.length===1?{allowed:true,...binding}:{saved:true};}});
 assert.equal(r.saved,true);assert.equal(queries.length,2);assert.match(queries[1],/outreach_call_result/);
 const forged=await handle({...input,body:{...input.body,args:{...input.body.args,org_id:2}}},config,{getCall:async()=>call,rows:async()=>[binding]});assert.equal(forged.reason,'invalid_tool_arguments');
});
test('phone tools reject wrong recipient, original version, correlation or missing dispatch request before SQL mutation',async()=>{
 const binding={org_id:1,activity_id:'5',provider_call_id:'call_test',connection_ref:'retell_test',expected_request};
 for(const changed of [{...call,to_number:'+12025550103'},{...call,metadata:{...call.metadata,org_id:'2'}},{...call,metadata:{...call.metadata,dispatch_key:'other'}}]){
  const result=await handle(input,config,{getCall:async()=>changed,rows:async()=>[binding],executeQuery:async()=>assert.fail('no mutation')});assert.equal(result.reason,'original_phone_request_mismatch');
 }
 for(const original of [undefined,{...expected_request,override_agent_version:1}]){
  assert.equal((await handle(input,config,{getCall:async()=>call,rows:async()=>[{...binding,expected_request:original}],executeQuery:async()=>assert.fail('no mutation')})).reason,'original_phone_request_mismatch');
 }
});
