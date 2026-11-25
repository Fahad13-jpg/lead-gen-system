'use strict';
// Reconnect existing authenticated custom tools on the current draft only.
// No inference, calling, publishing, DB writes or credential replacement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {request}=require('./configure-retell-agent.cjs');
function patchTools(tools,url){
 const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.pathname,'/tools');
 assert.ok(!u.username&&!u.password&&!u.search&&!u.hash,'INGRESS_URL_INVALID');
 assert.equal(tools.filter(t=>t.type==='custom').length,5,'EXPECTED_EXISTING_CUSTOM_TOOLS');
 return tools.map(t=>t.type==='custom'?{...t,url}:t);
}
function verify(before,after,tools){
 for(const [k,v] of Object.entries(before)){
  if(k==='general_tools'||k==='last_modification_timestamp')continue;
  assert.ok(isDeepStrictEqual(after[k],v),'UNEXPECTED_LLM_CHANGE_'+k);
 }
 assert.equal(after.general_tools.length,tools.length);
 for(const t of tools){const a=after.general_tools.find(x=>x.name===t.name);
  for(const [k,v] of Object.entries(t))assert.ok(isDeepStrictEqual(a?.[k],v),'TOOL_READBACK_'+t.name+'_'+k);}
}
async function main(){
 assert.equal(process.argv[2],'--apply-draft');
 const root=path.resolve(__dirname,'../..'),dir=path.join(root,'.local/calling-ingress-20261115');
 assert.ok(!fs.existsSync(path.join(dir,'retell-before-private.json')),'EXISTING_ATTEMPT_INSPECT_READBACK');
 const check=JSON.parse(fs.readFileSync(path.join(dir,'check.json'),'utf8'));
 assert.equal(check.unauthenticated_rejected,true);assert.equal(check.calendar_connected,true);
 assert.ok(Date.now()-Date.parse(check.checked_at)<10*60000,'FRESH_INGRESS_CHECK_REQUIRED');
 const c=JSON.parse(fs.readFileSync(path.join(root,'.local/calling-tools-20261028/private.json'),'utf8'));
 const {url}=JSON.parse(fs.readFileSync(path.join(dir,'tunnel.json'),'utf8'));
 const agent=await request('GET','/get-agent/'+c.agent_id,c.retell_key);assert.equal(agent.is_published,false);
 const e=agent.response_engine;assert.equal(e.type,'retell-llm');
 assert.ok(/^[A-Za-z0-9_-]+$/.test(e.llm_id)&&Number.isSafeInteger(e.version));
 const route='/get-retell-llm/'+e.llm_id+'?version='+e.version;
 const before=await request('GET',route,c.retell_key);assert.equal(before.is_published,false);
 const general_tools=patchTools(before.general_tools,url);
 // Refuse a shared engine before changing tools for any other agent.
 const list=await request('POST','/v2/list-agents?limit=1000',c.retell_key,{});
 const agents=Array.isArray(list)?list:list.items;assert.ok(Array.isArray(agents)&&list.has_more!==true);
 for(const x of agents){if(x.agent_id===c.agent_id||x.channel&&x.channel!=='voice')continue;
  assert.ok(/^[A-Za-z0-9_-]+$/.test(x.agent_id));
  const other=await request('GET','/get-agent/'+x.agent_id,c.retell_key);assert.notEqual(other.response_engine?.llm_id,e.llm_id,'SHARED_LLM_BLOCKED');}
 fs.writeFileSync(path.join(dir,'retell-before-private.json'),JSON.stringify({agent,llm:before},null,2),{flag:'wx'});
 fs.writeFileSync(path.join(dir,'retell-proposed-private.json'),JSON.stringify({general_tools},null,2),{flag:'wx'});
 const fresh=await request('GET',route,c.retell_key);assert.deepEqual(fresh,before,'CONCURRENT_EDIT_BLOCKED');
 await request('PATCH','/update-retell-llm/'+e.llm_id+'?version='+e.version,c.retell_key,{general_tools});
 const after=await request('GET',route,c.retell_key);verify(before,after,general_tools);
 fs.writeFileSync(path.join(dir,'retell-after-private.json'),JSON.stringify(after,null,2));
 const report={verified_at:new Date().toISOString(),verified_by_readback:true,agent_version:agent.version,llm_version:after.version,tools_reconnected:5,prompt_and_model_preserved:true,published:false,calls_placed:0,events_written:0,backend_pinned_version:c.agent_version};
 fs.writeFileSync(path.join(dir,'retell-verification.json'),JSON.stringify(report,null,2));
 // The historical installer reads this path. Update only its temporary URL, not secrets.
 const oldFile=path.join(root,'.local/calling-tools-20261028/tunnel.json');
 fs.copyFileSync(oldFile,path.join(dir,'tunnel-before.json'));
 fs.writeFileSync(oldFile,JSON.stringify({url},null,2));
 console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(e=>{console.error(/^(RETELL_|EXISTING_|FRESH_|CONCURRENT_|SHARED_)/.test(e.message)?e.message:'INGRESS_UPDATE_UNCONFIRMED_INSPECT_BEFORE_RETRY');process.exitCode=1;});
module.exports={patchTools,verify};
