'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {patchTools,verify}=require('../../scripts/calling/update-tool-ingress.cjs');
const tools=()=>[{type:'end_call',name:'end_call'},...['get_available_slots','book_meeting','record_outcome','request_callback','opt_out'].map(name=>({type:'custom',name,url:'https://old.invalid/tools',headers:{secret:'preserve'},max_retry:0,timeout_ms:10000,parameters:{type:'object'}}))];
test('ingress replacement preserves auth, schema, retries and unrelated LLM fields',()=>{
 const before={general_prompt:'keep',is_published:false,version:1,model_config:{primary:'keep'},general_tools:tools()};
 const expected=patchTools(before.general_tools,'https://new.invalid/tools');
 const after={...before,general_tools:structuredClone(expected),last_modification_timestamp:2};verify(before,after,expected);
 assert.deepEqual(before.general_tools[1].headers,after.general_tools[1].headers);
 assert.equal(before.general_tools[1].url,'https://old.invalid/tools');
 after.general_tools[1].headers.secret='changed';assert.throws(()=>verify(before,after,expected));
});
test('ingress only accepts HTTPS tool route without credentials or query',()=>{
 for(const url of ['http://x.invalid/tools','https://x.invalid/','https://secret@x.invalid/tools','https://x.invalid/tools?token=secret'])assert.throws(()=>patchTools(tools(),url));
 assert.throws(()=>patchTools(tools().slice(1,3),'https://new.invalid/tools'));
});
