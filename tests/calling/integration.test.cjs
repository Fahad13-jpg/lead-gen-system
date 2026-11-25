'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {reduce}=require('../../scripts/calling/outcomes.cjs'),{build}=require('../../scripts/calling/build-workflows.cjs');
const initial=()=>({org_id:1,provider_call_id:'fixture-call',state:'active'});
const storage=require('../../scripts/calling/storage.cjs');
test('storage uses escaped JSON and fixed operation allowlist',()=>{assert.match(storage.query('outreach_call_reserve',{org_id:1,content_hash:"a'b"}),/a''b/);assert.throws(()=>storage.query('arbitrary_sql',{org_id:1}));assert.throws(()=>storage.query('outreach_call_reserve',{org_id:null}));});
test('reservation adapter cannot grant call authority',async()=>{await assert.rejects(storage.reserve({org_id:1},{executeQuery:async()=>({reserved:true,execution_authorized:true})}),/UNEXPECTED_TRANSPORT/);const r=await storage.reserve({org_id:1},{executeQuery:async()=>({reserved:true,execution_authorized:false})});assert.equal(r.execution_authorized,false);});
const event=(type,id=type)=>({authenticated:true,org_id:1,provider_call_id:'fixture-call',type,id});
test('cross-tenant and unauthenticated outcomes rejected',()=>{for(const edit of [{org_id:2},{authenticated:false},{provider_call_id:'different'}])assert.equal(reduce(initial(),{...event('ended'),...edit}).accepted,false);});
test('ended without cost retains reservation',()=>{const r=reduce(initial(),event('ended')).record;assert.equal(r.state,'awaiting_final_cost');assert.equal(r.budget_release_allowed,false);});
test('cost events never bypass durable all-provider settlement',()=>{let r=reduce(initial(),{...event('cost_final'),total_micro_usd:123}).record;assert.equal(r.budget_release_allowed,false);r=reduce(r,event('ended')).record;assert.equal(r.state,'awaiting_final_cost');r=reduce(r,event('connected')).record;assert.equal(r.state,'awaiting_final_cost');assert.equal(r.budget_release_allowed,false);assert.equal(r.automatic_redial_allowed,false);});
test('event replay is idempotent; conflicting cost requires review',()=>{const e={...event('cost_final'),total_micro_usd:123},r=reduce(initial(),e).record;assert.equal(reduce(r,e).replayed,true);assert.equal(reduce(r,{...e,id:'second',total_micro_usd:456}).reconciliation_required,true);});
test('AI opt-out requires suppression; AI cannot book or authorize',()=>{const r=reduce(initial(),{...event('analysis'),outcome:'opt_out',booked:true,execution_authorized:true}).record;assert.equal(r.suppression_required,true);assert.equal(r.booked,undefined);assert.equal(r.execution_authorized,undefined);});
test('invalid costs cannot release funds',()=>{for(const cost of [-1,NaN,Infinity,'100',null])assert.equal(reduce(initial(),{...event('cost_final'),total_micro_usd:cost}).accepted,false);});
for(const [op,file] of [['queue','07f_call_queue_preview.json'],['reconciliation','09c_call_reconciliation_preview.json']])test(op+' workflow is deterministic, inactive and read-only',()=>{
 const w=build(op);assert.deepEqual(w,JSON.parse(fs.readFileSync(path.join(__dirname,'../../workflows',file),'utf8')));assert.equal(w.active,false);
 for(const n of w.nodes){assert.ok(!['n8n-nodes-base.httpRequest','n8n-nodes-base.webhook','n8n-nodes-base.executeCommand'].includes(n.type));
 if(n.type==='n8n-nodes-base.code'){assert.equal(n.parameters.mode,'runOnceForAllItems');assert.match(n.parameters.jsCode,/const org_id = null/);}
 if(n.type==='n8n-nodes-base.postgres'){assert.equal(n.alwaysOutputData,true);assert.match(n.parameters.query,/^SELECT outreach_call_.*_preview/);}}
});
