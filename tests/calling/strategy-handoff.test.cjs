'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{handoff}=require('../../scripts/calling/strategy-handoff.cjs');
function fixture(){return {version:'strategy_v2',state:'template_completed',strategy:{step1:{channel:'call'}},artifacts:{call_brief:{opening:{text:'Hello'},permission_question:{text:'May I briefly explain?'}}},execution_authorized:false,approval_required:true,validation_errors:[],blocking_reasons:['v2_offline_only']};}
const config={call_dispatch:{enabled:true,campaign_state:'running',language:'en',release:{enabled:true},connection_ref:'fixture',connection:{ready:true,credential_ref:'fixture'}}};
const {readiness}=require('../../scripts/calling/strategy-handoff.cjs');
test('generation readiness requires reviewed US phone permission and does not infer it from +1',()=>{
 const input={lead:{id:167,org_id:1,phone:'+12025550102'},campaign:{config:structuredClone(config)}};
 Object.assign(input.campaign.config.call_dispatch,{release:{enabled:true,expires_at:'2026-12-01T00:00:00Z'},connection:{ready:true,credential_ref:'fixture',country:'US',route_verified:true,caller_id_authorized:true,voice_tested:true},recipient_permissions:{167:{phone:input.lead.phone,country:'US',country_verified:true,calling_eligible:true,timezone_verified:true,timezone:'America/New_York',expires_at:'2026-12-01T00:00:00Z',permission_source_ref:'fixture',reviewed_by:'fixture'}}});
 assert.equal(readiness(input,'2026-11-01T00:00:00Z').status,'ready');
 input.campaign.config.call_dispatch.recipient_permissions[167].country_verified=false;
 assert.equal(readiness(input,'2026-11-01T00:00:00Z').status,'blocked');
});
test('native generator produces an approvable call draft only through the explicit operator flag',async()=>{
 const native=require('../../scripts/lead-strategy/v2/native.cjs'),{benchmarks}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
 const input=(await benchmarks())[0].input;input.campaign.config.mode='template';input.campaign.config.channels=['call'];input.campaign.config.call_dispatch=config.call_dispatch;
 const claim={id:1,org_id:input.lead.org_id,lease:'fixture',input};
 const options={briefOptions:{now:'2026-10-14T00:00:00Z',readinessSnapshot:{call:{status:'ready',reasons:[]}}}};
 const disabled=native.assemble(native.prepare(claim,options),{}).plan;
 const enabled=native.assemble(native.prepare(claim,{...options,callingIntegrationEnabled:true}),{}).plan;
 assert.ok(disabled.blocking_reasons.includes('v2_offline_only'));assert.deepEqual(enabled.blocking_reasons,[]);
 assert.equal(enabled.execution_authorized,false);assert.equal(enabled.approval_required,true);assert.notEqual(enabled.content_hash,disabled.content_hash);
});
test('embedded n8n strategy nodes wire reviewed call readiness and handoff without a model',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{benchmarks}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
 const input=(await benchmarks())[0].input;input.lead.phone='+12025550102';input.campaign.config.mode='template';input.campaign.config.channels=['call'];
 input.campaign.config.call_dispatch={...structuredClone(config.call_dispatch),release:{enabled:true,expires_at:'2099-01-01T00:00:00Z'},
 connection:{ready:true,credential_ref:'fixture',country:'US',route_verified:true,caller_id_authorized:true,voice_tested:true},
 recipient_permissions:{[input.lead.id]:{phone:input.lead.phone,country:'US',country_verified:true,calling_eligible:true,timezone_verified:true,timezone:'America/New_York',expires_at:'2099-01-01T00:00:00Z',permission_source_ref:'fixture',reviewed_by:'fixture'}}};
 const w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
 const run=(name,json,prepared)=>JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+w.nodes.find(n=>n.name===name).parameters.jsCode+'})()',{
 $json:json,$env:{STRATEGY_CONTRACT_VERSION:'strategy_v2',CALLING_INTEGRATION_ENABLED:'true'},$:()=>({item:{json:prepared}}),Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000})));
 const p=run('Prepare Strategy',{id:1,org_id:input.lead.org_id,lease:'fixture',input});
 assert.equal(p.wants_ai,false);assert.equal(p.prepared.brief.permitted_channels[0].channel,'call');
 const r=run('Validate and Assemble Draft',{},p).plan;
 assert.deepEqual(r.blocking_reasons,[]);assert.equal(r.execution_authorized,false);assert.equal(r.approval_required,true);
});
test('handoff is disabled unless explicitly enabled by the operator',()=>{const p=fixture();assert.equal(handoff(p,{config}),p);assert.deepEqual(p.blocking_reasons,['v2_offline_only']);});
test('generation-time call handoff retains approval and zero transport authority',()=>{const p=fixture(),r=handoff(p,{integrationEnabled:true,config});assert.notEqual(r,p);assert.deepEqual(r.blocking_reasons,[]);assert.equal(r.execution_authorized,false);assert.equal(r.approval_required,true);assert.deepEqual(p.blocking_reasons,['v2_offline_only']);assert.equal(r.artifacts.call_brief.max_connected_seconds,60);});
test('approved follow-up message becomes its own hash-bound call brief',()=>{const p=fixture();p.artifacts.followup_drafts=[{step:2,channel:'call',status:'requires_plan_approval_and_execution_checks',body:'Approved follow-up offer.'},{step:3,channel:'call',status:'message_missing',body:null}];const r=handoff(p,{integrationEnabled:true,config});assert.equal(r.artifacts.followup_drafts[0].call_brief.after_permission,'Approved follow-up offer.');assert.equal(r.artifacts.followup_drafts[0].call_brief.sequence_step,2);assert.equal(r.artifacts.followup_drafts[1].call_brief,undefined);assert.equal(p.artifacts.followup_drafts[0].call_brief,undefined);});
test('failed plans, other blockers and email plans are never promoted',()=>{for(const edit of [{state:'ai_failed'},{blocking_reasons:['conflicted']},{validation_errors:['invalid']},{execution_authorized:true},{strategy:{step1:{channel:'email'}}}]){const p={...fixture(),...edit};assert.equal(handoff(p,{integrationEnabled:true,config}),p);}});
test('unready or customer-only configuration cannot clear the offline blocker',()=>{for(const change of [{enabled:false},{campaign_state:'paused'},{language:'ur'},{release:{enabled:false}},{connection:{ready:true,credential_ref:'wrong'}}]){const p=fixture();assert.equal(handoff(p,{integrationEnabled:true,config:{call_dispatch:{...config.call_dispatch,...change}}}),p);}});
