'use strict';
// Offline release checks. No key loading, HTTP transport, DB access or deployment.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const c=require('./contract.cjs'),native=require('./native.cjs'),{generate}=require('./provider.cjs');
const {benchmarks,syntheticReadiness,mockReply}=require('./fixtures.cjs');
async function run(){
 const fixtures=await benchmarks(),rows=[],ratings=[];
 const now='2026-10-14T00:00:00Z';
 const scenarios=fixtures.map(f=>({name:'benchmark_'+f.id,input:f.input,expected:({167:'strong',445:'unclear',446:'unclear',447:'unclear',449:'weak'})[f.id]}));
 for(const state of ['suppressed','replied','conflicted','not_assessed']){
  const input=structuredClone(fixtures[0].input);
  if(state==='conflicted')input.report.trust.conflicts=['identity_conflict'];
  else if(state==='not_assessed')input.report={};else input[state]=true;
  scenarios.push({name:state,input,expected:state==='not_assessed'?'not_assessed':state==='conflicted'?'unclear':'strong',blocked:state!=='not_assessed'});
 }
 for(const s of scenarios){
  const claim={id:1,org_id:s.input.lead.org_id,lease:'OFFLINE_ACCEPTANCE',input:s.input};
  const preparedNode=native.prepare(claim,{hasKey:true,briefOptions:{now,readinessSnapshot:syntheticReadiness}});
  const p=preparedNode.prepared,output=c.template(p);
  assert.equal(p.brief.qualifier.fit,s.expected);
  if(s.blocked)assert.equal(p.brief.permitted_channels.length,0);
  const variants=[
   {name:'valid_mock',response:mockReply(output),expected:'ai_completed'},
   {name:'truncated',response:{...mockReply(output),choices:[{finish_reason:'length',message:{content:JSON.stringify(output)}}]},expected:'ai_failed'},
   {name:'malformed',response:{...mockReply(output),choices:[{finish_reason:'stop',message:{content:'{broken'}}]},expected:'ai_failed'},
   {name:'fit_override',response:mockReply({...output,fit:s.expected==='weak'?'strong':'weak'}),expected:'ai_failed'},
   {name:'forbidden_followup',response:mockReply({...output,followups:[{channel:'email',intent:'Follow up.'}]}),expected:'ai_failed'},
  ];
  for(const v of variants){
   let calls=0;
   const result=await generate(p,{mocked:true,allowRepair:false,gate:()=>true,operation:{lease:claim.lease,reservation:'OFFLINE',fingerprint:p.input_hash,lease_expires_at:Date.now()+60000},transport:async()=>{calls++;return v.response;}});
   const assembled=native.assemble(preparedNode,{statusCode:200,body:v.response}).plan;
   assert.equal(calls,1);assert.equal(result.state,v.expected);assert.equal(assembled.state,v.expected);
   assert.equal(result.execution_authorized,false);assert.equal(assembled.execution_authorized,false);
   assert.deepEqual(result.strategy,assembled.strategy);
   if(v.expected==='ai_failed'){assert.equal(result.strategy,null);assert.equal(result.artifacts.whatsapp_draft,null);}
   rows.push({scenario:s.name,variant:v.name,expected:v.expected,provider:result.state,native:assembled.state,passed:true});
  }
  const disabled=await generate(p,{transport:async()=>{throw Error('ZERO_GATE_MUST_NOT_DISPATCH');}});
  assert.equal(disabled.generation.attempts,0);assert.equal(disabled.state,'ai_failed');
  rows.push({scenario:s.name,variant:'zero_allowance',passed:true});
  const template=c.plan(p,output,'template_completed');
  ratings.push({scenario:s.name,provenance:'Template output; mock acceptance is NOT an AI quality rating.',fit:s.expected,permitted_channels:p.brief.permitted_channels,source_facts:p.brief.facts,approved_benefits:p.brief.campaign.approved_benefits,draft:template.artifacts.whatsapp_draft,followups:output.followups,quality_review:template.quality_review,human_rating:null,human_approval:null});
 }
 // Replay the actual model defects, without a provider request or altering historic outcomes.
 const a=require('../../../tests/lead-strategy/fixtures/live-167-rejected.json');
 const p167=c.build(fixtures[0].input,{now,readinessSnapshot:syntheticReadiness});
 assert(c.validate(a.output,p167).errors.includes('INVALID_FOLLOWUP'));
 const b=require('../../../tests/lead-strategy/fixtures/live-449-followup.json');
 const p449={brief:b.brief,qualification:{absence_wording:null}};
 assert(c.validate(b.output,p449).errors.includes('FOLLOWUP_ASSET_UNAVAILABLE'));
 rows.push({scenario:'saved_real_167',variant:'forbidden_channel',passed:true},{scenario:'saved_real_449',variant:'missing_asset',passed:true});
 return {scope:'Offline mocks and saved-response replays only',prompt_version:p167.prompt_version,passed:rows.length,failed:0,network_calls:0,rows,ratings,release_status:'NOT_READY_FOR_DEPLOYMENT',remaining:['Latest-prompt live quality across representative leads UNVERIFIED','Human usefulness ratings unfilled','Executor event checks not implemented; requirements are metadata','Deployment and live migration not authorized','Latest changes not tested in actual n8n runtime']};
}
if(require.main===module)run().then(result=>{
 const out=path.resolve(__dirname,'../../../documentation/strategy-contract-v2/acceptance-results.json');
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:result.passed,failed:result.failed,network_calls:0,release_status:result.release_status,report:out}));
}).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
