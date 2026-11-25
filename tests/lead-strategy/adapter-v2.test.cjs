'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {runClaim,sqlCall}=require('../../scripts/lead-strategy/v2/adapter.cjs');
const c=require('../../scripts/lead-strategy/v2/contract.cjs');
const {benchmarks,mockReply,syntheticReadiness}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
async function run(){
 const input=(await benchmarks())[0].input;input.fingerprint='database-fingerprint';
 const claim={id:7,org_id:input.lead.org_id,lease:'existing-lease',input};
 const briefOptions={now:'2026-10-12T00:00:00Z',readinessSnapshot:syntheticReadiness};
 const prepared=c.build(input,briefOptions);let passed=0;
 const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 function mocks(){
  const counts={reserve:0,recheck:0,transport:0,finish:0},saved=[];
  const state={allowed:true,reservation:claim.lease,lease_until:new Date(Date.now()+300000).toISOString()};
  return {counts,state,saved,deps:{
   reserve:async p=>{counts.reserve++;assert.equal(p.lease,claim.lease);assert.equal(p.org_id,claim.org_id);return{allowed:true};},
   recheck:async p=>{counts.recheck++;assert.equal(p.fingerprint,'database-fingerprint');return state;},
   transport:async()=>{counts.transport++;return mockReply(c.template(prepared));},
   finish:async p=>{counts.finish++;saved.push(p);return{saved:true,mock:true};}
  }};
 }
 const opts={briefOptions,provider:{mocked:true,sleep:async()=>{},random:()=>0}};
 await test('AI claim reserves once, rechecks same reservation, preserves DB fingerprint',async()=>{const m=mocks(),r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.reserve,1);assert(m.counts.recheck>=3);assert.equal(m.counts.transport,1);assert.equal(r.payload.plan.state,'ai_completed');assert.equal(r.payload.lease,claim.lease);assert.equal(r.payload.plan.input_hash,prepared.input_hash);assert.notEqual(prepared.input_hash,input.fingerprint);assert(r.payload.plan.blocking_reasons.includes('v2_offline_only'));});
 await test('zero allowance sends no request and saves explicit AI failure',async()=>{const m=mocks();m.deps.reserve=async()=>({allowed:false,reason:'ai_disabled'});const r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.transport,0);assert.equal(r.payload.plan.state,'ai_failed');assert.equal(r.payload.plan.strategy,null);});
 await test('cancellation/input change closes recheck before transport',async()=>{const m=mocks();m.state.allowed=false;const r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.transport,0);assert.equal(r.payload.plan.state,'ai_failed');});
 await test('missing or expired lease metadata cannot be invented',async()=>{for(const value of [undefined,'2000-01-01T00:00:00Z']){const m=mocks();m.state.lease_until=value;const r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.transport,0);assert.equal(r.payload.plan.state,'ai_failed');}});
 await test('template mode does not reserve AI',async()=>{const m=mocks(),r=await runClaim(claim,m.deps,{...opts,mode:'template'});assert.equal(m.counts.reserve,0);assert.equal(m.counts.transport,0);assert.equal(r.payload.plan.state,'template_completed');});
 await test('fallback requires explicit choice and stays marked for acknowledgement',async()=>{const m=mocks();await assert.rejects(()=>runClaim(claim,m.deps,{...opts,mode:'fallback'}),/EXPLICIT_FALLBACK/);const r=await runClaim(claim,m.deps,{...opts,mode:'fallback',explicitFallback:true});assert.equal(r.payload.plan.state,'template_fallback');assert.equal(r.payload.plan.fallback_acknowledgement_required,true);assert.equal(m.counts.reserve,0);});
 await test('schema repair cannot consume a second unreserved request',async()=>{const m=mocks();m.deps.transport=async()=>{m.counts.transport++;return mockReply({});};const r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.transport,1);assert.equal(r.payload.plan.generation.failure_reason,'SCHEMA_REPAIR_NOT_RESERVED');});
 await test('proven pre-send retry uses same reservation and one reservation call',async()=>{const m=mocks();m.deps.transport=async()=>{if(++m.counts.transport===1)throw{transport_proof:{instrumented:true,phase:'connect',application_bytes:0,all_attempts_pre_send:true,prior_dispatch:false,pooled:false,redirected:false}};return mockReply(c.template(prepared));};const r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.reserve,1);assert.equal(m.counts.transport,2);assert.equal(r.payload.plan.state,'ai_completed');});
 await test('ambiguous failures do not retry or produce template success',async()=>{const m=mocks();m.deps.transport=async()=>{m.counts.transport++;throw{code:'ECONNRESET'};};const r=await runClaim(claim,m.deps,opts);assert.equal(m.counts.transport,1);assert.equal(r.payload.plan.state,'ai_failed');});
 await test('tenant mismatch rejected before any persistence',async()=>{const m=mocks();await assert.rejects(()=>runClaim({...claim,org_id:999},m.deps,opts),/INVALID_CLAIM/);assert.equal(m.counts.reserve,0);assert.equal(m.counts.finish,0);});
 await test('save rejection retained, not reported as success',async()=>{const m=mocks();m.deps.finish=async()=>({saved:false,reason:'input_changed'});const r=await runClaim(claim,m.deps,opts);assert.equal(r.result.saved,false);assert.equal(r.result.reason,'input_changed');});
 await test('SQL payload follows manual single-quote escaping convention',()=>{const q=sqlCall('strategy_approval',{actor:"O'Brien",acknowledge_fallback:true,acknowledge_fallback_hash:'dbhash'});assert(q.includes("O''Brien"));assert(q.includes('acknowledge_fallback_hash'));assert.throws(()=>sqlCall('arbitrary',{}));});
 await test('migration static checks: no tables/budgets/claim changes; authoritative approval hash retained',()=>{
  const s=fs.readFileSync('database/migrations/017_strategy_v2_compatibility.sql','utf8');
  assert(!/CREATE\s+TABLE|ALTER\s+TABLE|UPDATE\s+strategy_ai_controls|CREATE OR REPLACE FUNCTION strategy_claim|CREATE OR REPLACE FUNCTION strategy_ai_gate/i.test(s));
  assert(s.includes("md5(b::text)"));assert(s.includes("p->>'acknowledge_fallback_hash' IS DISTINCT FROM v.content_hash"));assert(s.includes('FOR UPDATE'));assert(s.includes("b->>'version'='strategy_v1'"));assert(s.includes("b->>'version'='strategy_v2'"));assert(s.includes('LANGUAGE plpgsql STABLE'));
 });
 return{passed,scope:'Mock orchestration and static SQL checks only; PostgreSQL execution UNVERIFIED'};
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
