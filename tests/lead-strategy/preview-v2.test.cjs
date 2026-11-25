'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=require('../../scripts/lead-strategy/v2/contract.cjs'),native=require('../../scripts/lead-strategy/v2/native.cjs');
const {benchmarks,syntheticReadiness}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
(async()=>{
 const fixtures=await benchmarks();
 for(const f of fixtures){
  const options={now:'2026-10-14T00:00:00Z',readinessSnapshot:syntheticReadiness};
  const ai=native.preview(f.input,options).result;
  assert.deepEqual(ai.brief,c.build(f.input,options).brief);assert.equal(ai.plan,null);assert.equal(ai.ai_generated,false);assert.equal(ai.provider_requests,0);
  assert(c.validate(ai.template_example.strategy,c.build(f.input,options)).ok);
  const input=structuredClone(f.input);input.campaign.config.mode='template';
  const template=native.preview(input,options).result;
  assert.equal(template.plan.state,'template_completed');assert.equal(template.execution_authorized,false);assert.equal(template.template_example,null);
 }
 assert.equal(native.preview({error:'NOT_FOUND',http_status:404}).result.http_status,404);
 assert.equal(native.preview(null).result.error,'INVALID_PREVIEW_INPUT');
 const hybrid=structuredClone(fixtures[0].input);hybrid.campaign.config.mode='hybrid';assert.equal(native.preview(hybrid).result.http_status,400);
 const w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json'));
 const code=w.nodes.find(n=>n.name==='Build Preview').parameters.jsCode;
 const execute=env=>JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+code+'})()',{$json:{result:fixtures[0].input},$env:env,Buffer,require:id=>{assert.equal(id,'crypto');return require('crypto');}},{timeout:5000})));
 const v2=execute({STRATEGY_CONTRACT_VERSION:'strategy_v2'}).result;
 assert.equal(v2.version,'strategy_v2');assert.equal(v2.plan,null);assert.equal(v2.brief.permitted_channels.length,0);
 assert.equal(execute({}).result.plan.version,'strategy_v1');
 console.log('PASS: five benchmark preview parity cases, explicit AI/example distinction, template preview, blocked channels, error/hybrid handling and v1 compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1;});
