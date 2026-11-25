'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {benchmarks,mockReply}=require('../lead-strategy/v2/fixtures.cjs'),c=require('../lead-strategy/v2/contract.cjs');
const allowCrypto=process.argv.includes('--allow-crypto');
const name=allowCrypto?'strategy-v2-runtime-crypto-20261013':'strategy-v2-runtime-20261012',dir=path.resolve('.local/strategy-v2-runtime');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',maxBuffer:5e6,timeout:300000});if(r.status!==0)throw Error('Isolated runtime operation failed: '+String(r.stderr||r.error||'').slice(0,1200));return r.stdout.trim();}
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 const source=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json'));
 const base=(await benchmarks())[0].input;
 const fixtures=[];
 for(const kind of ['template','disabled','valid','malformed','truncated','unknown_reference']){
  const input=structuredClone(base);input.campaign.config.mode=kind==='template'?'template':'ai';input.fingerprint='fixture_db_hash';
  const prepared=c.build(input),output=c.template(prepared);
  let reply=kind==='template'||kind==='disabled'?{gate:{allowed:false,reason:'ai_disabled'}}:{statusCode:200,body:mockReply(output)};
  if(kind==='malformed')reply.body.choices[0].message.content='{';
  if(kind==='truncated')reply.body.choices[0].finish_reason='length';
  if(kind==='unknown_reference'){output.angle_id='unknown-angle';reply.body=mockReply(output);}
  fixtures.push({id:fixtures.length+1,org_id:1,lease:'MOCK_LEASE',input,_case:kind,_reply:reply});
 }
 const prepare=structuredClone(source.nodes.find(n=>n.name==='Prepare Strategy'));
 const assemble=structuredClone(source.nodes.find(n=>n.name==='Validate and Assemble Draft'));
 const code=(name,jsCode,mode='runOnceForEachItem')=>({id:name,name,type:'n8n-nodes-base.code',typeVersion:2,position:[0,0],parameters:{mode,jsCode}});
 const nodes=[{id:'manual',name:'Manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},code('Fixtures','return '+JSON.stringify(fixtures)+'.map(json=>({json}));','runOnceForAllItems'),prepare,code('Mock response','return $json._reply;'),assemble,code('Assertions',`const kind=$('Prepare Strategy').item.json._case;const expected=kind==='template'?'template_completed':kind==='valid'?'ai_completed':'ai_failed';if($json.plan.state!==expected)throw Error('WRONG_STATE:'+kind+':'+$json.plan.state);if($json.plan.execution_authorized!==false)throw Error('SEND_AUTHORIZED');if(!$json.plan.blocking_reasons.includes('v2_offline_only'))throw Error('BLOCKER_REMOVED');if(expected==='ai_failed'&&$json.plan.strategy!==null)throw Error('SILENT_FALLBACK');return {case:kind,pass:true,execution_authorized:false};`)];
 nodes.push(code('Preview input',"return {result:$('Prepare Strategy').item.json.input};"),structuredClone(source.nodes.find(n=>n.name==='Build Preview')),code('Preview assertions',"const r=$json.result;const mode=$('Prepare Strategy').item.json.input.campaign.config.mode;if(r.version!=='strategy_v2'||r.ai_generated!==false||r.provider_requests!==0||r.execution_authorized!==false)throw Error('PREVIEW_CONTRACT');if(mode==='ai'&&(r.plan!==null||!r.template_example))throw Error('PREVIEW_SILENT_FALLBACK');if(mode==='template'&&r.plan?.state!=='template_completed')throw Error('PREVIEW_TEMPLATE');return {pass:true,mode};"));
 const connections={};for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
 fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify({id:'scratchStrategyV2',name:'Scratch v2 runtime only',active:false,nodes,connections,settings:{executionOrder:'v1'}}));
 fs.writeFileSync(path.join(dir,'run.cjs'),`const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
fs.mkdirSync('/tmp/v2-out',{recursive:true});const env={...process.env,N8N_USER_FOLDER:'/tmp/n8n-v2-'+crypto.randomBytes(6).toString('hex'),N8N_ENCRYPTION_KEY:crypto.randomBytes(24).toString('hex')};
for(const args of [['import:workflow','--input=/tmp/v2/workflow.json'],['execute','--id=scratchStrategyV2','--rawOutput']]){const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:240000,maxBuffer:12e6});fs.writeFileSync('/tmp/v2-out/'+args[0].replace(':','-')+'.log',(r.stdout||'')+(r.stderr||''));if(r.status!==0){console.error('N8N_RUNTIME_FAILED:'+args[0]);process.exit(1);}if(args[0]==='execute'){const text=r.stdout;let result;for(let i=0;i<text.length;i++){if(text[i]!=='{')continue;try{result=JSON.parse(text.slice(i,text.lastIndexOf('}')+1));break;}catch{}}const data=result?.data?.resultData||result?.resultData;const rows=data?.runData?.Assertions?.flatMap(x=>x.data?.main?.[0]||[]).map(x=>x.json)||[];const previews=data?.runData?.['Preview assertions']?.flatMap(x=>x.data?.main?.[0]||[]).map(x=>x.json)||[];if(previews.length!==6||previews.some(x=>x.pass!==true)||rows.length!==6||rows.some(x=>x.pass!==true)||data?.error){console.error('ASSERTION_RESULTS_MISSING');process.exit(1);}fs.writeFileSync('/tmp/v2-out/results.json',JSON.stringify({n8n_runtime:true,network:'none',cases:rows,preview_cases:previews},null,2));console.log('PASS: six cases through actual n8n Code nodes; network disabled, zero HTTP/database/provider nodes.');}}
`);
 const image=JSON.parse(fs.readFileSync('.local/scratch-diagnostics-20261011/environment.json')).image;
 if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Expected pinned local image');
 if(!process.argv.includes('--resume'))docker(['create','--name',name,'--network','none','--label','codex.scratch=strategy-v2-runtime','--memory','768m',...(allowCrypto?['--env','NODE_FUNCTION_ALLOW_BUILTIN=crypto']:[]),'--env','DB_TYPE=sqlite','--env','N8N_USER_FOLDER=/tmp/n8n-v2','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false','--env','N8N_RUNNERS_ENABLED=false','--env','STRATEGY_CONTRACT_VERSION=strategy_v2','--env','GROQ_API_KEY=MOCK_ONLY_NOT_A_KEY','--entrypoint','node',image,'/tmp/v2/run.cjs']);
 const info=JSON.parse(docker(['inspect',name]))[0];if(info.HostConfig.NetworkMode!=='none'||info.Mounts.some(m=>m.Type==='bind')||info.Config.Labels['codex.scratch']!=='strategy-v2-runtime'||info.Image!==image||info.State.Running)throw Error('Isolation mismatch');
 docker(['cp',dir+'/.',name+':/tmp/v2']);
 let failure;try{console.log(docker(['start','-a',name]));}catch(e){failure=e;}
 // Only files created by this harness are collected; no credentials or production volumes exist.
 docker(['cp',name+':/tmp/v2-out/.',dir]);
 if(failure)throw failure;
 const results=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));results.container=name;results.crypto_allowlisted=allowCrypto;results.required_configuration=allowCrypto?{NODE_FUNCTION_ALLOW_BUILTIN:'crypto'}:{};results.default_configuration_failure='VMError: Cannot find module crypto';
 fs.writeFileSync('documentation/strategy-contract-v2/n8n-runtime-results.json',JSON.stringify(results,null,2));
 console.log('Saved isolated runtime results. Container is stopped; retained for diagnosis.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
