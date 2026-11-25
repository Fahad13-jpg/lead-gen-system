'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {preflight}=require('../../scripts/calling/publish-tested-agent.cjs');
function fixture(){const llm={llm_id:'fixture',version:1,is_published:false,general_prompt:require('../../scripts/calling/improve-retell-agent.cjs').prompt(),general_tools:[{type:'custom',max_retry:0}]};return {agent:{version:1,is_published:false,response_engine:{llm_id:'fixture',version:1},max_call_duration_ms:60000,enable_dnc_detection:false},llm,baseline:structuredClone(llm),receipts:[{call_id:'call_opt',agent_version:1,enabled:false,events:[{outcome:'opt_out'}],stop_reason:'opt_out'},{call_id:'call_booking',agent_version:1,booking:{state:'booked'},events:[{outcome:'meeting_booked'}]}]};}
test('publish preflight requires unchanged tested prompt and both real browser receipts',()=>{const f=fixture();preflight(f.agent,f.llm,f.baseline,f.receipts);
 for(const receipts of [[],f.receipts.slice(0,1),[{...f.receipts[0],agent_version:0},f.receipts[1]]])assert.throws(()=>preflight(f.agent,f.llm,f.baseline,receipts));
 f.llm.general_prompt+='changed';assert.throws(()=>preflight(f.agent,f.llm,f.baseline,f.receipts));
});
test('published or wrong-version agent and changed tool definitions fail release checks',()=>{const f=fixture();for(const changed of [{...f.agent,is_published:true},{...f.agent,version:2},{...f.agent,enable_dnc_detection:true}])assert.throws(()=>preflight(changed,f.llm,f.baseline,f.receipts));
 f.llm.general_tools[0].max_retry=1;assert.throws(()=>preflight(f.agent,f.llm,f.baseline,f.receipts));
});
