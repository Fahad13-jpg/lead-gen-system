'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {benchmarks,mockReply}=require('../../scripts/lead-strategy/v2/fixtures.cjs'),native=require('../../scripts/lead-strategy/v2/native.cjs'),c=require('../../scripts/lead-strategy/v2/contract.cjs'),rt=require('../../scripts/lead-strategy/runtime.cjs'),{release}=require('../../scripts/lead-strategy/v2/draft-release.cjs');
async function fixture(){const input=structuredClone((await benchmarks())[0].input);input.org_id=1;input.fingerprint='a'.repeat(32);input.suppressed=false;input.replied=false;input.campaign.config=rt.campaign({org_id:1,config:{...input.campaign.config,channels:['email'],sequence:[{channel:'email',delay_days:0}]}}).config;return{id:7,org_id:1,lease:'b'.repeat(32),input};}
const options={hasKey:true,draftReviewEnabled:true,briefOptions:{readinessSnapshot:{email:{status:'ready',reasons:[]}}}};
const reply=p=>({statusCode:200,body:mockReply(c.template(p.prepared))});
function rehash(plan){delete plan.content_hash;plan.content_hash=c.hash(plan);return plan;}
test('default remains offline; server opt-in produces a hash-bound reviewable draft without execution',async()=>{
 const claim=await fixture(),off=native.prepare({...claim,draft_review_enabled:true},{...options,draftReviewEnabled:false});assert.equal(off.draft_review_enabled,false);const blocked=native.assemble(off,reply(off)).plan;assert.deepEqual(blocked.blocking_reasons,['v2_offline_only']);
 const p=native.prepare(claim,options),before=JSON.stringify(p),plan=native.assemble(p,reply(p)).plan;
 assert.equal(plan.state,'ai_completed');assert.deepEqual(plan.blocking_reasons,[]);assert.equal(plan.draft_review_release.scope,'content_approval_only');assert.equal(plan.execution_authorized,false);assert.equal(plan.approval_required,true);assert.equal(JSON.stringify(p),before);
 const{content_hash,...body}=plan;assert.equal(content_hash,c.hash(body));assert(plan.artifacts.email_draft.body);assert.deepEqual(c.plan(p.prepared,c.template(p.prepared),'ai_completed').blocking_reasons,['v2_offline_only']);
});
test('blocked contacts, missing readiness, conflicts, suppression and replies never become reviewable',async()=>{
 const claim=await fixture();for(const mutate of [x=>{x.input.suppressed=true;},x=>{x.input.replied=true;},x=>{delete x.input.suppressed;},x=>{delete x.input.replied;},x=>{x.input.report.trust.conflicts=['identity_conflict'];},x=>{delete x.input.report.trust.conflicts;}]){
  const x=structuredClone(claim);mutate(x);const p=native.prepare(x,options),plan=native.assemble(p,reply(p)).plan;assert(plan.blocking_reasons.includes('v2_offline_only'));
 }
 const p=native.prepare(claim,{...options,briefOptions:{readinessSnapshot:{email:{status:'blocked',reasons:['email_missing']}}}}),plan=native.assemble(p,reply(p)).plan;assert.equal(plan.strategy.step1,null);assert(plan.blocking_reasons.includes('v2_offline_only'));
});
test('invalid and truncated model output remain failed, without fallback or release',async()=>{
 const p=native.prepare(await fixture(),options);for(const r of [{statusCode:200,body:mockReply({})},{statusCode:200,body:{choices:[{finish_reason:'length'}]}},{gate:{reason:'ai_disabled'}}]){const plan=native.assemble(p,r).plan;assert.equal(plan.state,'ai_failed');assert.equal(plan.strategy,null);assert(plan.blocking_reasons.includes('v2_offline_only'));assert.equal(plan.draft_review_release,undefined);}
});
test('cross-org/identity, lease, fingerprint, content and extra-block changes fail closed',async()=>{
 const p=native.prepare(await fixture(),options),plan=c.plan(p.prepared,c.template(p.prepared),'ai_completed');
 for(const mutate of [x=>{x.org_id=2;},x=>{x.input.org_id=2;},x=>{x.input.lead.org_id=2;},x=>{x.input.campaign.org_id=2;},x=>{x.input.campaign.version++;},x=>{x.lease='';},x=>{x.input.fingerprint='invalid';},x=>{x.input.fingerprint='c'.repeat(32);},x=>{x.mode='template';},x=>{x.prepared.brief.lead_id=999;},x=>{x.input.lead.id=999;}]){const x=structuredClone(p);mutate(x);assert.strictEqual(release(plan,x,{enabled:true}),plan);}
 const tampered=structuredClone(plan);tampered.strategy.fit_notes.push('Changed');assert.strictEqual(release(tampered,p,{enabled:true}),tampered);
 const blocked=rehash({...structuredClone(plan),blocking_reasons:['v2_offline_only','other_gate']});assert.strictEqual(release(blocked,p,{enabled:true}),blocked);
 const artifact=structuredClone(plan);artifact.artifacts.email_draft.body='Changed copy';rehash(artifact);assert.strictEqual(release(artifact,p,{enabled:true}),artifact);
});
test('generic template release is explicit; customer templates and non-email paths retain independent gates',async()=>{
 const claim=await fixture();claim.input.campaign.config.mode='template';const p=native.prepare(claim,options),plan=native.assemble(p,{gate:{reason:'template'}}).plan;assert.equal(plan.state,'template_completed');assert.deepEqual(plan.blocking_reasons,[]);assert.equal(plan.generation.method,'template');assert.equal(plan.generation.attempts,0);
 const original=c.plan(p.prepared,c.template(p.prepared),'template_completed');const customer=rehash({...original,validation_profile:'customer_email_v1'});assert.strictEqual(release(customer,p,{enabled:true}),customer);
 const call=await fixture();call.input.campaign.config=rt.campaign({org_id:1,config:{...call.input.campaign.config,channels:['whatsapp'],sequence:[{channel:'whatsapp',delay_days:0}]}}).config;const cp=native.prepare(call,{...options,briefOptions:{readinessSnapshot:{whatsapp:{status:'ready',reasons:[]}}}});assert(native.assemble(cp,reply(cp)).plan.blocking_reasons.includes('v2_offline_only'));
});
test('actual bundled Assemble Code node runs the release boundary offline',async()=>{
 const p=native.prepare(await fixture(),options),w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8')),code=w.nodes.find(n=>n.name==='Validate and Assemble Draft').parameters.jsCode;
 const raw=vm.runInNewContext('(function(){'+code+'})()',{$json:reply(p),$:()=>({item:{json:p}}),$env:{},Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000});const out=JSON.parse(JSON.stringify(raw));assert.deepEqual(out.plan.blocking_reasons,[]);assert.equal(out.plan.execution_authorized,false);
});
test('actual Prepare Code node reads the operator flag, never a campaign-supplied release flag',async()=>{
 const claim=await fixture();claim.input.campaign.config.draft_review_enabled=true;claim.draft_review_enabled=true;
 const w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8')),code=w.nodes.find(n=>n.name==='Prepare Strategy').parameters.jsCode;
 const run=enabled=>vm.runInNewContext('(function(){'+code+'})()',{$json:claim,$env:{STRATEGY_CONTRACT_VERSION:'strategy_v2',...(enabled?{STRATEGY_DRAFT_REVIEW_ENABLED:'true'}:{})},Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000});
 assert.equal(run(false).draft_review_enabled,false);assert.equal(run(true).draft_review_enabled,true);
});
