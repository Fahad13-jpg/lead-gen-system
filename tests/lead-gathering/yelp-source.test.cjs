'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rt=require('../../scripts/lead-gathering/runtime.cjs');
const call=(name,input={},job={})=>new Function('$input','$',`return (${rt[name].toString()})();`)({first:()=>({json:input})},()=>({first:()=>({json:job})}));
const base={org_id:7,source:'yelp',job_name:'US businesses',request_id:'yelp_fixture_01',search_query:'Plumbers',location:'Austin, Texas, USA',country_code:'US',max_results:5,max_cost_usd:.5};
const business={name:'Example Plumbing',bizId:'fixture_business',directUrl:'https://www.yelp.com/biz/example-plumbing-austin?ref=test',phone:'(512) 555-0123',website:'https://example.org/',address:{addressLine1:'100 Main St',addressLine2:'Suite 2',city:'Austin',regionCode:'TX',postalCode:'78701',country:'US'},aggregatedRating:4.5,reviewCount:12,categories:['Plumbing']};
test('Yelp admission is US-only, bounded and uses the existing billing/target contract',()=>{
 const p=call('validateRequest',{body:base});assert.equal(p.error,false);assert.equal(p.candidate_limit,15);
 for(const patch of [{country_code:'PK'},{country_code:null},{max_results:51},{candidate_limit:151},{max_cost_usd:.51},{website_filter:'withoutWebsite'}])assert.equal(call('validateRequest',{body:{...base,...patch}}).error,true);
 const a=call('prepareActor',{...base,candidate_limit:15,request_settings:p});assert.equal(a.actor_id,'tri_angle~yelp-scraper');assert.deepEqual(a.apify_input,{searchTerms:['Plumbers'],locations:['Austin, Texas, USA'],searchLimit:15,maxImages:0,directUrls:[]});
 assert.throws(()=>call('prepareActor',{...base,candidate_limit:151,request_settings:p}),/SCOPE_EXCEEDED/);
});
test('documented Yelp output preserves contacts, address, listing provenance and rating without fabricating email',()=>{
 const r=call('transformResults',{body:[business]},{...base,id:1,candidate_limit:15,request_settings:{country_code:'US',require_contact:true}});assert.equal(r.rows.length,1);const row=r.rows[0];assert.equal(row.email,null);assert.equal(row.phone,business.phone);assert.equal(row.website,'https://example.org');assert.equal(row.address,'100 Main St, Suite 2');assert.equal(row.state,'TX');assert.equal(row.source_record_id,'fixture_business');assert.equal(row.raw_data.url,'https://www.yelp.com/biz/example-plumbing-austin');
 const cleaned=require('../../scripts/lead-cleaning/runtime.cjs').normalize({...row,org_id:7,source:'yelp'});assert.equal(cleaned.fields.rating,4.5);assert.equal(cleaned.fields.review_count,12);assert.equal(cleaned.fields.phone,'+15125550123');
});
test('invalid identities, closed businesses, country mismatch and missing contacts cannot inflate useful results',()=>{
 const rows=[{...business,directUrl:'https://evil.test/biz/x'},{...business,directUrl:'https://www.yelp.com/search?x=y'},{...business,isClosed:true},{...business,address:{...business.address,country:'CA'}},{...business,phone:null,website:'https://www.yelp.com/biz/example'}];
 const r=call('transformResults',{body:rows},{...base,id:1,candidate_limit:15,request_settings:{country_code:'US',require_contact:true}});assert.equal(r.rows.length,0);assert.equal(r.excluded.length,5);
});
test('Yelp workflow uses the existing guarded worker and the orchestrator routes Yelp explicitly',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/03c_yelp_scraper.json','utf8'));assert(w.nodes.find(n=>n.name==='Claim Job').parameters.query.includes("'yelp'"));assert.equal(w.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail,undefined);assert(w.nodes.some(n=>n.name==='Validate Saved Run Ownership'));
 const m=JSON.parse(fs.readFileSync('workflows/02_main_orchestrator.json','utf8'));assert.equal(m.connections['Yelp?'].main[0][0].node,'Dispatch Yelp');assert.equal(m.connections['Yelp?'].main[1][0].node,'Dispatch Yellow Pages');
});
