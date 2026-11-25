'use strict';
const assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs');
const {generate}=require('../../scripts/lead-strategy/v2/provider.cjs');
const {benchmarks,syntheticReadiness}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
const saved=require('./fixtures/live-167-rejected.json');
(async()=>{
 const x=(await benchmarks()).find(x=>x.id===167);
 const p=c.build(x.input,{now:'2026-10-14T00:00:00Z',readinessSnapshot:syntheticReadiness});
 assert.deepEqual(c.validate(saved.output,p).errors,['INVALID_FOLLOWUP']);
 let calls=0;
 const result=await generate(p,{mocked:true,allowRepair:false,gate:()=>true,operation:{lease:'offline',reservation:'offline',fingerprint:p.input_hash,lease_expires_at:Date.now()+60000},transport:async()=>{calls++;return{choices:[{finish_reason:'stop',message:{content:JSON.stringify(saved.output)}}],usage:saved.usage};}});
 assert.equal(calls,1);assert.equal(result.state,'ai_failed');assert.equal(result.strategy,null);assert.equal(result.execution_authorized,false);
 // Controlled local edit isolates the defect; not presented as a successful model reply.
 const edited=structuredClone(saved.output);edited.followups=edited.followups.filter(f=>f.channel!=='email');
 assert.equal(c.validate(edited,p).ok,true);
 assert.equal(p.prompt_version,'strategy_v2.6');assert(p.prompt.includes('EVERY channel_plan'));
 console.log('PASS: saved real response rejected; no repair/fallback/send; isolated follow-up defect; prompt instruction present. No network calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
