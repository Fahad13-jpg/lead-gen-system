'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {gatheringService,normalize,localGatheringTransport}=require('../../scripts/dashboard/gathering.cjs');
const request={org_id:7,request_id:'dash_'+'a'.repeat(32),job_name:'Dental clinics',source:'google_maps',search_query:'dental clinics',location:'Islamabad, Pakistan',country_code:'PK',max_results:5,max_cost_usd:.5,max_customer_cost_usd:.5,billing_mode:'platform'};
function fixture({role='owner',billing={},clock=1000,failSubmit=false}={}){
 const calls=[];let now=clock;
 const service=gatheringService({identity:{principal:async(token,org)=>{if(org!==7)throw Error('MEMBERSHIP_REQUIRED');return{subject:token,role};}},secret:Buffer.alloc(32,1),now:()=>now,transport:async(route,payload)=>{
  calls.push({route,payload});if(route==='gathering-preview')return{status:200,body:{preview:true,org_id:7,billing:{ready:true,can_submit:true,maximum_customer_charge_usd:.5,...billing}}};
  if(failSubmit)throw Error('private upstream error');return{status:202,body:{job_id:123,org_id:7,status:'queued',api_key:'MUST_NOT_LEAK'}};
 }});return{service,calls,advance:()=>{now+=600001;}};
}
test('normalization uses the existing workflow validator and fixes new-business semantics',()=>{
 const p=normalize(request);assert.equal(p.result_mode,'new');assert.equal(p.exclude_closed,true);
 for(const bad of [{...request,user_id:7},{...request,source:'yelp'},{...request,source:'yellow_pages'},{...request,max_results:501},{...request,request_id:'invalid'},{...request,max_cost_usd:true}])assert.throws(()=>normalize(bad),/INVALID_FILTER/);
});
test('membership and role are checked before any preview or submit call',async()=>{
 const f=fixture({role:'member'});await assert.rejects(f.service.preview('subject',request),/ROLE_REQUIRED/);assert.equal(f.calls.length,0);
 await assert.rejects(f.service.submit('subject',{org_id:8,preview_token:'fake'}),/MEMBERSHIP_REQUIRED/);
});
test('preview is non-submitting; confirmation sends only its signed request and projects response',async()=>{
 const f=fixture(),p=await f.service.preview('subject',request);assert.equal(f.calls.length,1);assert.equal(f.calls[0].route,'gathering-preview');
 const r=await f.service.submit('subject',{org_id:7,preview_token:p.preview_token});assert.equal(r.job_id,123);assert.ok(!('api_key'in r));assert.equal(f.calls[1].payload.request_id,request.request_id);assert.equal(f.calls[1].payload.max_results,5);
});
test('tampering, different subjects, expiry and blocked budgets cannot submit',async()=>{
 for(const scenario of ['tampered','subject','expired','budget']){
  const f=fixture(scenario==='budget'?{billing:{can_submit:false}}:{}),p=await f.service.preview('subject',request);
  if(scenario==='expired')f.advance();
  await assert.rejects(f.service.submit(scenario==='subject'?'other':'subject',{org_id:7,preview_token:scenario==='tampered'?'x'+p.preview_token:p.preview_token}),/PREVIEW_EXPIRED/);
  assert.equal(f.calls.length,1);
 }
});
test('charge above customer ceiling blocks confirmation',async()=>{
 const f=fixture({billing:{maximum_customer_charge_usd:1}}),p=await f.service.preview('subject',request);assert.equal(p.billing.can_submit,false);
});
test('budget and wallet blocks use only explicit quote observations',async()=>{
 const exhausted=fixture({billing:{can_submit:false,provider_budget_available:false}});
 assert.equal((await exhausted.service.preview('subject',request)).billing.reason,'PROVIDER_BUDGET_EXHAUSTED');
 const empty=fixture({billing:{can_submit:false,provider_budget_available:true,wallet_available_usd:0}});
 assert.equal((await empty.service.preview('subject',request)).billing.reason,'INSUFFICIENT_PLATFORM_CREDITS');
});
test('ambiguous admission is never automatically retried and keeps the same request ID',async()=>{
 const f=fixture({failSubmit:true}),p=await f.service.preview('subject',request);
 await assert.rejects(f.service.submit('subject',{org_id:7,preview_token:p.preview_token}),/SUBMISSION_UNCONFIRMED/);
 assert.equal(f.calls.filter(c=>c.route==='start-scraping').length,1);assert.equal(f.calls[1].payload.request_id,request.request_id);
});
test('transport uses fixed local destinations, secret header, timeout and no redirect',async()=>{
 let captured;const transport=localGatheringTransport({key:'fixture-key',fetchImpl:async(url,options)=>{captured={url,options};return{status:200,text:async()=>'{"preview":true}'};}});
 await transport('gathering-preview',request);assert.equal(captured.url,'http://127.0.0.1:5678/webhook/gathering-preview');assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers['X-Lead-Gathering-Key'],'fixture-key');
 await assert.rejects(transport('arbitrary-webhook',request),/INVALID_ROUTE/);assert.throws(()=>localGatheringTransport({key:'fixture',baseURL:'https://evil.example'}));
});
test('campaign creation uses canonical validation and never retries uncertain saves',async()=>{
 let calls=0;const service=gatheringService({strategyReadiness:async()=>({management_available:true,generation_allowed:true}),identity:{principal:async()=>({role:'owner'})},transport:async(route,payload)=>{calls++;assert.equal(route,'strategy-campaign');assert.equal(payload.config.email_verification_policy,'basic');throw Error('timeout');}});
 const config={name:'Clinic campaign',mode:'ai',channels:['email'],sender:{name:'Fixture',company:'Fixture company'},offer:{name:'Website',description:'Website demonstration',approved_points:['Shows services']},cta:{text:'Request demo'},timezone:'Asia/Karachi',email_verification_policy:'basic'};
 await assert.rejects(service.saveCampaign('fixture',{org_id:7,config}),/CAMPAIGN_SAVE_UNCONFIRMED/);assert.equal(calls,1);
 await assert.rejects(service.saveCampaign('fixture',{org_id:7,config:{}}),/INVALID_FILTER/);assert.equal(calls,1);
 const member=gatheringService({identity:{principal:async()=>({role:'member'})},transport:async()=>assert.fail()});await assert.rejects(member.saveCampaign('fixture',{org_id:7,config}),/ROLE_REQUIRED/);
});
test('strategy admission sends one org-bound request and never retries uncertainty',async()=>{
 let calls=0;const service=gatheringService({strategyReadiness:async()=>({management_available:true,generation_allowed:true}),identity:{principal:async()=>({role:'owner'})},transport:async(route,p)=>{calls++;assert.equal(route,'strategy-request');assert.equal(p.org_id,7);throw Error('timeout');}});
 const p={org_id:7,campaign_id:1,lead_id:167,request_id:'dash_'+'b'.repeat(32)};
 await assert.rejects(service.requestStrategy('fixture',p),/STRATEGY_REQUEST_UNCONFIRMED/);assert.equal(calls,1);
 await assert.rejects(service.requestStrategy('fixture',{...p,lead_id:'167'}),/INVALID_FILTER/);assert.equal(calls,1);
});
test('Apify connection requires role and execution-retention preflight and never returns a key',async()=>{
 let calls=0;const input={org_id:7,apify_api_key:'apify_api_fixture'},identity={principal:async()=>({role:'owner'})};
 const transport=async()=>{calls++;return{status:200,body:{success:true,org_id:7,billing_mode:'byok',api_key:input.apify_api_key}};};
 const blocked=gatheringService({identity,transport});await assert.rejects(blocked.connectApify('fixture',input),/UNAVAILABLE/);assert.equal(calls,0);
 const service=gatheringService({identity,transport,connectionSafety:async()=>true});const result=await service.connectApify('fixture',input);assert.deepEqual(result,{connected:true,billing_mode:'byok'});assert.ok(!JSON.stringify(result).includes(input.apify_api_key));
 const member=gatheringService({identity:{principal:async()=>({role:'member'})},transport,connectionSafety:async()=>true});await assert.rejects(member.connectApify('fixture',input),/ROLE_REQUIRED/);assert.equal(calls,1);
});
