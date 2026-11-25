'use strict';
// Explicitly authorized release of a browser-tested version. No call creation,
// numbers, workflow activation, campaign modification or budget authorization.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util'),{request}=require('./configure-retell-agent.cjs');
const root=path.resolve(__dirname,'../..'),configFile=path.join(root,'.local/calling-tools-20261028/private.json');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:20000,maxBuffer:200000});if(r.status!==0)throw Error('RELEASE_DOCKER_FAILED');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
function withoutTimestamp(value){const result={...value};delete result.last_modification_timestamp;return result;}
function preflight(agent,llm,baseline,receipts){
 assert.equal(agent.version,1);assert.equal(llm.version,1);assert.equal(agent.is_published,false);assert.equal(llm.is_published,false);
 assert.equal(agent.response_engine.llm_id,llm.llm_id);assert.equal(agent.response_engine.version,llm.version);
 assert.equal(agent.max_call_duration_ms,60000);assert.equal(agent.enable_dnc_detection,false);
 assert.equal(llm.general_prompt,require('./improve-retell-agent.cjs').prompt());
 assert.ok(isDeepStrictEqual(withoutTimestamp(llm),withoutTimestamp(baseline)),'TESTED_LLM_CHANGED');
 // Archived receipts can already be disabled; successful bound actions are the evidence.
 const bound=s=>s.agent_version===agent.version&&/^call_[A-Za-z0-9_-]+$/.test(s.call_id||'');
 assert.ok(receipts.some(s=>bound(s)&&s.events?.some(e=>e.outcome==='opt_out')&&s.stop_reason==='opt_out'),'OPT_OUT_RECEIPT_REQUIRED');
 assert.ok(receipts.some(s=>bound(s)&&s.booking?.state==='booked'&&s.events?.some(e=>e.outcome==='meeting_booked')),'BOOKING_RECEIPT_REQUIRED');
 assert.ok(llm.general_tools.filter(t=>t.type==='custom').every(t=>t.max_retry===0));
}
async function publish(id,version,key){
 // Fixed provider operation. Unknown response is reconciled with GET, never retried.
 return new Promise((resolve,reject)=>{
  const body=JSON.stringify({version,version_title:'Browser-tested English calling',version_description:'Verified browser opt-out and Calendar test booking. Telephone dialing remains disabled pending number, routing and funding acceptance.'});
  const req=https.request({hostname:'api.retellai.com',path:'/publish-agent-version/'+id,method:'POST',family:4,timeout:20000,headers:{Authorization:'Bearer '+key,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{
   res.resume();res.on('end',()=>res.statusCode>=200&&res.statusCode<300?resolve():reject(Error('PUBLISH_STATUS_UNCONFIRMED')));
  });req.on('timeout',()=>req.destroy());req.on('error',()=>reject(Error('PUBLISH_RESULT_UNCERTAIN')));req.end(body);
 });
}
async function main(){
 assert.equal(process.argv[2],'--publish-and-pin');
 const dir=path.join(root,'.local/calling-production-20261115'),journalFile=path.join(dir,'release-journal.json');fs.mkdirSync(dir,{recursive:true});
 assert.ok(!fs.existsSync(journalFile),'EXISTING_RELEASE_RECONCILE_BEFORE_REPLAY');
 const c=JSON.parse(fs.readFileSync(configFile,'utf8'));
 assert.ok(/^[A-Za-z0-9_-]+$/.test(c.agent_id));
 const agent=await request('GET','/get-agent/'+c.agent_id+'?version=1',c.retell_key);
 const llm=await request('GET','/get-retell-llm/'+agent.response_engine.llm_id+'?version=1',c.retell_key);
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'.local/calling-ingress-20261115/retell-after-private.json'),'utf8'));
 const receipts=['94b62282e051559a730d51d703945961','1c4cf72d4191359ccffa1550598eb2ba'].map(id=>JSON.parse(fs.readFileSync(path.join(root,'.local/calling-browser-test',id+'-receipt-private.json'),'utf8')));
 preflight(agent,llm,baseline,receipts);
 const oldAgent=JSON.parse(fs.readFileSync(path.join(root,'.local/retell-improvement-1794716569124/after-private.json'),'utf8')).agent;
 assert.deepEqual(withoutTimestamp(agent),withoutTimestamp(oldAgent),'TESTED_AGENT_CHANGED');
 const state=()=>JSON.parse(sql(`SELECT json_build_object('active_calls',(SELECT count(*) FROM outreach_activities WHERE channel='call' AND coalesce(dispatch_metadata->>'state','unknown') NOT IN('settled','cancelled_before_send')),'enabled_campaigns',(SELECT count(*) FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE v.config->'call_dispatch'->>'enabled'='true' OR v.config->'call_dispatch'->'release'->>'enabled'='true'),'active_call_workflows',(SELECT count(*) FROM workflow_entity WHERE active AND name IN('Approved Retell call executor','Calling result poller')));`));
 assert.deepEqual(state(),{active_calls:0,enabled_campaigns:0,active_call_workflows:0},'CALLING_MUST_STAY_DISABLED');
 const runtime=JSON.parse(docker(['exec','n8n','node','-e',"console.log(require('fs').readFileSync('/home/node/.n8n/calling-tools-private.json','utf8'))"]));assert.deepEqual(runtime,c,'BACKEND_CONFIG_MISMATCH');
 const disabled=JSON.parse(docker(['exec','n8n','node','-e',"console.log(require('fs').readFileSync('/home/node/.n8n/calling-browser-test.json','utf8'))"]));assert.equal(disabled.enabled,false,'BROWSER_TEST_MUST_BE_DISABLED');
 fs.writeFileSync(path.join(dir,'release-before-private.json'),JSON.stringify({agent,llm,config:c},null,2),{flag:'wx'});
 const journal={phase:'preflight_passed',version:agent.version,calls_created:0,campaigns_changed:0,workflow_activations:0};const save=()=>fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));save();
 journal.phase='publish_attempted';save();
 try{await publish(c.agent_id,agent.version,c.retell_key);}catch{journal.publish_response_uncertain=true;save();}
 const after=await request('GET','/get-agent/'+c.agent_id+'?version='+agent.version,c.retell_key);
 const afterLlm=await request('GET','/get-retell-llm/'+llm.llm_id+'?version='+llm.version,c.retell_key);
 assert.equal(after.is_published,true,'PUBLISH_RECONCILIATION_REQUIRED');assert.equal(afterLlm.is_published,true);
 for(const k of ['voice_id','language','max_call_duration_ms','response_engine'])assert.deepEqual(after[k],agent[k]);
 for(const k of ['general_prompt','general_tools','model_config'])assert.deepEqual(afterLlm[k],llm[k]);
 journal.phase='published_verified';save();assert.deepEqual(state(),{active_calls:0,enabled_campaigns:0,active_call_workflows:0});
 const next={...c,agent_version:after.version};
 const target=path.join(dir,'pinned-config-private.json');fs.writeFileSync(target,JSON.stringify(next));
 journal.phase='pin_update_attempted';save();
 docker(['cp',target,'n8n:/home/node/.n8n/calling-tools-private.json']);docker(['exec','-u','root','n8n','chown','node:node','/home/node/.n8n/calling-tools-private.json']);docker(['exec','n8n','chmod','600','/home/node/.n8n/calling-tools-private.json']);
 const pinned=JSON.parse(docker(['exec','n8n','node','-e',"console.log(require('fs').readFileSync('/home/node/.n8n/calling-tools-private.json','utf8'))"]));assert.deepEqual(pinned,next);
 fs.writeFileSync(configFile,JSON.stringify(next));assert.deepEqual(JSON.parse(fs.readFileSync(configFile)),next);
 fs.writeFileSync(path.join(dir,'release-after-private.json'),JSON.stringify({agent:after,llm:afterLlm},null,2));
 journal.phase='published_and_backend_pinned';journal.published=true;journal.backend_version=pinned.agent_version;journal.calling_disabled=true;journal.verified_at=new Date().toISOString();save();console.log(JSON.stringify(journal));
}
if(require.main===module)main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'RELEASE_UNCONFIRMED_INSPECT_JOURNAL');process.exitCode=1;});
module.exports={preflight};
