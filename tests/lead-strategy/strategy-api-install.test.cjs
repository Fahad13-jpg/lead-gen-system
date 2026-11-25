'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const{update}=require('../../scripts/diagnostics/install-strategy-via-api.cjs');
const desired=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
function fixture(){const w={...structuredClone(desired),id:'27W04lgTGdgFMWUx',active:true,staticData:null};for(const n of w.nodes)if(['Prepare Strategy','Validate and Assemble Draft','Build Preview'].includes(n.name))n.parameters.jsCode='/*previous*/'+n.parameters.jsCode;return w;}
test('API update preserves graph/activation and reconciles uncertain PUT without retry',async()=>{
 for(const uncertain of [false,true]){let live=fixture(),puts=0,saved;const r=await update({desired,checkpoint:async value=>{saved=value;},request:async(method,p)=>{if(method==='GET')return structuredClone(live);puts++;live={...live,...p};if(uncertain)throw Error('timeout');return live;}});assert(r.installed);assert.equal(puts,1);assert.equal(r.put_reconciled,uncertain);assert(saved.rollback.nodes);assert.equal(saved.candidate.active,undefined);assert.deepEqual(live.connections,saved.before.connections);}
});
test('unknown PUT result, incompatible graph or changed activation never retries',async()=>{
 let puts=0;await assert.rejects(update({desired,checkpoint:async()=>{},request:async(method)=>{if(method==='PUT'){puts++;throw Error('timeout');}return fixture();}}),/UPDATE_NOT_CONFIRMED_DO_NOT_RETRY/);assert.equal(puts,1);
 const wrong=fixture();wrong.connections={};await assert.rejects(update({desired,checkpoint:async()=>assert.fail(),request:async()=>wrong}),/ONLY_REVIEWED_CODE_BODIES/);
 let live=fixture();await assert.rejects(update({desired,checkpoint:async()=>{},request:async(method,p)=>{if(method==='PUT'){live={...live,...p,active:false};return live;}return structuredClone(live);}}),/ACTIVATION_STATE_CHANGED/);
});
