'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=require('../../scripts/lead-strategy/v2/contract.cjs'),rt=require('../../scripts/lead-strategy/runtime.cjs');
const {benchmarks,mockReply}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
async function run(){
 const w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
 const input=(await benchmarks())[0].input;input.fingerprint='DB_FINGERPRINT';
 const claim={id:7,org_id:1,lease:'fixture-lease',input};let passed=0;
 const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
 const execute=(name,json,env={},prepared)=>{
  const code=w.nodes.find(n=>n.name===name).parameters.jsCode;
  return JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+code+'})()',{$json:json,$env:env,$:()=>({item:{json:prepared}}),Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000})));
 };
 let p;
 test('customer feature flag permits draft review only and cannot come from campaign input',()=>{
  const x=customerClaim();x.customer_integration_enabled=true;x.input.campaign.config.customerTemplatesEnabled=true;
  const off=execute('Prepare Strategy',x,{STRATEGY_CONTRACT_VERSION:'strategy_v2'});
  assert(off.customer_payload.plan.blocking_reasons.includes('customer_template_integration_offline_only'));
  const on=execute('Prepare Strategy',x,{STRATEGY_CONTRACT_VERSION:'strategy_v2',CUSTOMER_EMAIL_TEMPLATES_ENABLED:'true'});
  const saved=execute('Validate and Assemble Draft',{gate:{allowed:false}}, {},on);
  assert(!saved.plan.blocking_reasons.includes('customer_template_integration_offline_only'));
  assert.equal(saved.plan.execution_authorized,false);assert.equal(saved.plan.approval_required,true);assert.equal(on.wants_ai,false);
 });
 function customerClaim(){const x=structuredClone(require('../../documentation/strategy-contract-v2/customer-template-preview-example.json').input);return {id:99,org_id:1,lease:'fixture-customer',input:{...x,campaign:{...x.campaign,id:2,version:1},lead:{...x.lead,id:7},fingerprint:'a'.repeat(32),suppressed:false,replied:false,report:{trust:{conflicts:[]}}}};};
 test('actual campaign API node preserves supplied whitespace and rejects null template',()=>{
  const config=customerClaim().input.campaign.config;config.name='Customer input test';
  config.templates.email.body='\n'+config.templates.email.body+'\n\n';
  const normalized=execute('campaign Validate',{body:{org_id:1,config}});
  assert.equal(normalized.config.templates.email.body,config.templates.email.body);
  config.templates.email=null;
  assert.equal(execute('campaign Validate',{body:{org_id:1,config}}).error,'INVALID_EMAIL_TEMPLATE');
 });
 test('customer route skips AI even with a key and preserves supplied text through actual Code nodes',()=>{
  const x=customerClaim(),prepared=execute('Prepare Strategy',x,{STRATEGY_CONTRACT_VERSION:'strategy_v2',GROQ_API_KEY:'MOCK_ONLY'});
  assert.equal(prepared.wants_ai,false);assert.equal(prepared.request,null);
  const saved=execute('Validate and Assemble Draft',{gate:{allowed:false,reason:'template_mode'}},{},prepared);
  assert.equal(saved.plan.validation_profile,'customer_email_v1');assert.equal(saved.usage.total_tokens,0);
  assert.equal(saved.plan.artifacts.email_draft.body,require('../../documentation/strategy-contract-v2/customer-template-preview-example.json').output.draft.steps[0].body);
  assert(saved.plan.blocking_reasons.includes('customer_template_integration_offline_only'));
 });
 test('customer context tampering is rejected before persistence',()=>{
  const prepared=execute('Prepare Strategy',customerClaim(),{STRATEGY_CONTRACT_VERSION:'strategy_v2'});
  prepared.input.campaign.version++;
  assert.throws(()=>execute('Validate and Assemble Draft',{}, {},prepared),/CUSTOMER_PLAN_OR_CONTEXT_CHANGED/);
 });
 test('invalid explicit customer template never falls back to generated copy',()=>{
  for(const value of [null,{}, {subject:'Unsafe',body:'Missing signature'}]){
   const x=customerClaim();x.input.campaign.config.templates.email=value;
   assert.throws(()=>execute('Prepare Strategy',x,{STRATEGY_CONTRACT_VERSION:'strategy_v2'}),/CUSTOMER_TEMPLATE_INVALID/);
   assert.equal(execute('Build Preview',{result:x.input},{STRATEGY_CONTRACT_VERSION:'strategy_v2'}).result.http_status,400);
  }
 });
 test('customer preview uses exact renderer without requiring a claim or any provider',()=>{
  const x=customerClaim(),r=execute('Build Preview',{result:x.input},{STRATEGY_CONTRACT_VERSION:'strategy_v2'}).result;
  assert.equal(r.http_status,200);assert.equal(r.provider_requests,0);assert.equal(r.execution_authorized,false);
  assert.equal(r.draft.steps.length,2);assert.equal(r.validation_profile,'customer_email_v1');
 });
 test('real local Prepare Code node executes opt-in v2 bundle offline',()=>{p=execute('Prepare Strategy',claim,{STRATEGY_CONTRACT_VERSION:'strategy_v2',GROQ_API_KEY:'MOCK_ONLY'});assert.equal(p.contract_version,'strategy_v2');assert.equal(p.wants_ai,true);assert.equal(p.prepared.input_hash,c.hash(p.prepared.brief));});
 test('real Assemble Code node accepts validated mock response',()=>{const r=execute('Validate and Assemble Draft',{statusCode:200,body:mockReply(c.template(p.prepared))},{},p);assert.equal(r.plan.state,'ai_completed');assert.equal(r.lease,claim.lease);assert.equal(r.plan.execution_authorized,false);assert(r.plan.blocking_reasons.includes('v2_offline_only'));});
 test('disabled AI gate gives failure without silent template fallback',()=>{const r=execute('Validate and Assemble Draft',{gate:{allowed:false,reason:'ai_disabled'}},{},p);assert.equal(r.plan.state,'ai_failed');assert.equal(r.plan.strategy,null);assert.equal(r.plan.generation.attempts,0);});
 test('malformed and truncated responses never use unreserved repair',()=>{for(const response of [{statusCode:200,body:mockReply({})},{statusCode:200,body:{choices:[{finish_reason:'length'}]}}]){const r=execute('Validate and Assemble Draft',response,{},p);assert.equal(r.plan.state,'ai_failed');assert.equal(r.plan.generation.attempts,1);}});
 test('no key disables request and template mode never requests AI',()=>{assert.equal(execute('Prepare Strategy',claim,{STRATEGY_CONTRACT_VERSION:'strategy_v2'}).wants_ai,false);const t=structuredClone(claim);t.input.campaign.config.mode='template';const p2=execute('Prepare Strategy',t,{STRATEGY_CONTRACT_VERSION:'strategy_v2',GROQ_API_KEY:'MOCK_ONLY'});assert.equal(p2.wants_ai,false);assert.equal(execute('Validate and Assemble Draft',{gate:{allowed:false}},{},p2).plan.state,'template_completed');});
 test('v1 remains default with original compose behavior',()=>{const legacy=execute('Prepare Strategy',claim,{});assert.equal(legacy.contract_version,undefined);const response={gate:{reason:'ai_disabled'}};const actual=execute('Validate and Assemble Draft',response,{},legacy);assert.equal(actual.plan.version,'strategy_v1');assert.deepEqual(actual.plan,rt.compose(legacy,response));});
 test('v1 default does not load new crypto dependency',()=>{const node=w.nodes.find(n=>n.name==='Prepare Strategy');const result=vm.runInNewContext('(function(){'+node.parameters.jsCode+'})()',{$json:claim,$env:{},require:()=>{throw Error('unexpected dependency');}},{timeout:5000});assert(!result.contract_version);});
 test('hybrid mode requires explicit choice for v2',()=>{const t=structuredClone(claim);t.input.campaign.config.mode='hybrid';assert.throws(()=>execute('Prepare Strategy',t,{STRATEGY_CONTRACT_VERSION:'strategy_v2'}),/EXPLICIT_AI_OR_TEMPLATE/);});
 test('graph, notes, node modes and all non-Code configuration unchanged',()=>{const original=JSON.parse(fs.readFileSync('tests/lead-strategy/fixtures/signal-graph-before.json','utf8'));const stripped=structuredClone(w);for(const n of stripped.nodes){delete n.parameters.jsCode;if(['Claim Strategy Jobs','preview Database'].includes(n.name)){assert(n.parameters.query.startsWith('/* EMAIL_DRAFT_READINESS_V1 */'));assert(n.parameters.query.includes('email_sender_snapshot'));n.parameters.query=original.nodes.find(x=>x.name===n.name).parameters.query;}}assert.deepEqual(stripped,original);assert.equal(w.nodes.find(n=>n.name==='Compose With Groq').retryOnFail,false);});
 return{passed,scope:'Actual local Code-node bodies in Node VM with mocked inputs; no n8n import or provider call'};
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});module.exports={run};
