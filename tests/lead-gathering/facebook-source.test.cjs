'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rt=require('../../scripts/lead-gathering/runtime.cjs');
const call=(name,input={},job={})=>new Function('$input','$',`return (${rt[name].toString()})();`)({first:()=>({json:input})},()=>({first:()=>({json:job})}));
const base={org_id:1,source:'facebook_pages',job_name:'Dental clinics',request_id:'facebook_fixture_01',search_query:'Dental clinics',location:'Islamabad, Pakistan',max_results:5,max_cost_usd:0.5};
test('Facebook admission retains bounded budgets and rejects unsupported scope',()=>{
 assert.equal(call('validateRequest',{body:base}).error,false);
 for(const patch of [{max_results:51},{max_cost_usd:0.51},{candidate_limit:151},{website_filter:'withoutWebsite'},{center:{latitude:1,longitude:1},radius_km:2}])assert.equal(call('validateRequest',{body:{...base,...patch}}).error,true);
});
test('Facebook uses exactly one page-only actor request with total result limit',()=>{
 const out=call('prepareActor',base);assert.equal(out.actor_id,'apify~facebook-search-scraper');assert.deepEqual(out.apify_input,{categories:['Dental clinics'],locations:['Islamabad, Pakistan'],searchType:'pages-google',resultsLimit:5});
 assert.throws(()=>call('prepareActor',{...base,candidate_limit:151}),/SCOPE_EXCEEDED/);
});
const page={pageId:'123456',pageName:'Clinic',title:'Clinic Islamabad',pageUrl:'https://www.facebook.com/clinic/?tracking=1',categories:['Page','Dentist'],email:'INFO@CLINIC.EXAMPLE',phone:'+92510000000',websites:['https://clinic.example/'],messenger:'https://m.me/clinic',address:'Islamabad'};
test('Page contacts, identity and Messenger observations are preserved without inventing geography or send authority',()=>{
 const r=call('transformResults',{body:[page]},{...base,candidate_limit:15,request_settings:{country_code:'PK'}});assert.equal(r.rows.length,1);const row=r.rows[0];assert.equal(row.source_record_id,'123456');assert.equal(row.email,'info@clinic.example');assert.equal(row.website,'https://clinic.example');assert.equal(row.country,null);assert.equal(row.city,null);assert.equal(row.category,'Dentist');assert.equal(row.raw_data.facebook_page_url,'https://www.facebook.com/clinic/');assert.equal(row.raw_data.messenger_url,'https://m.me/clinic');assert.equal(row.raw_data.automatic_messaging_eligible,false);assert.equal(row.raw_data.location_verified,false);
});
test('personal search output, failed rows and search URLs cannot become business pages',()=>{
 const r=call('transformResults',{body:[{...page,searchType:'profiles'}, {...page,error:'private'}, {...page,pageId:null,pageUrl:'https://www.facebook.com/search/pages?q=x'}]},base);assert.equal(r.rows.length,0);assert.equal(r.rejected,3);
});
test('missing Messenger link is unknown, filters and candidate cap are enforced',()=>{
 const r=call('transformResults',{body:[{...page,messenger:null},{...page,pageId:'987'}]},{...base,candidate_limit:1,request_settings:{}});assert.equal(r.rows.length,1);assert.equal(r.rows[0].raw_data.messenger_availability,'unknown');assert.equal(r.excluded[0].reason,'candidate_limit');
 const filtered=call('transformResults',{body:[page]},{...base,request_settings:{exclude_categories:['dentist']}});assert.equal(filtered.rejected,1);
});
test('documented contact-rich search output preserves bare websites and filters contact-less results',()=>{
 const rich={...page,searchType:'pages-google',website:'clinic.example/contact?tracking=1',websites:[]};
 const result=call('transformResults',{body:[rich,{pageId:'999',title:'No contacts',pageUrl:'https://www.facebook.com/no-contacts/'}]},{...base,request_settings:{require_contact:true}});
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].website,'https://clinic.example/contact');assert.equal(result.rows[0].phone,'+92510000000');assert.equal(result.rows[0].email,'info@clinic.example');assert.equal(result.excluded[0].reason,'missing_contact');
});
test('Google Maps navigation links are not treated as business websites',()=>{
 for(const website of ['https://maps.google.com/maps?q=clinic','https://www.google.com/maps/place/clinic','https://maps.app.goo.gl/abc','https://goo.gl/maps/abc']){
  const r=call('transformResults',{body:[{...page,website,websites:[]}]},base);assert.equal(r.rows[0].website,null);
 }
 const r=call('transformResults',{body:[{...page,website:'https://maps.google.com/maps?q=x',websites:['https://clinic.example/']}]},base);assert.equal(r.rows[0].website,'https://clinic.example');
});
test('Facebook worker uses authenticated entry, no paid-start retry and receipt/ownership guards',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/03b_facebook_pages_scraper.json'));
 assert.equal(w.nodes.find(n=>n.name==='Webhook').parameters.authentication,'headerAuth');assert.equal(w.nodes.find(n=>n.name==='Webhook').parameters.path,'scrape-facebook-pages');assert(w.nodes.find(n=>n.name==='Claim Job').parameters.query.includes("'facebook_pages'"));assert(!w.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail);assert(w.nodes.some(n=>n.name==='Validate Saved Run Ownership'));
});
test('a Facebook-only listing remains visible for discovery without inventing a website or usable contact',()=>{
 const {normalize}=require('../../scripts/lead-cleaning/runtime.cjs');
 const p=normalize({source:'facebook_pages',company_name:'Clinic',raw_data:{facebook_page_url:'https://www.facebook.com/clinic/'}});
 assert.equal(p.outcome,'needs_discovery');assert.equal(p.fields.website,null);assert.equal(p.fields.phone,null);assert.equal(p.fields.email,null);assert(p.issues.includes('facebook_page_only_contact_unavailable'));
 assert.equal(normalize({source:'other',company_name:'Clinic',raw_data:{facebook_page_url:'https://www.facebook.com/clinic/'}}).outcome,'review');
});
test('Page-type filtering applies across industries while preserving intentionally requested types and overrides',()=>{
 const run=(query,category,settings={})=>call('transformResults',{body:[{...page,category,categories:['Page',category]}]},{...base,search_query:query,request_settings:settings});
 for(const query of ['Dental clinics','Plumbers','Restaurants','Law firms','Real estate agencies']){
  for(const category of ['Reel creator','Government organization','Professional Association']){
   const r=run(query,category);assert.equal(r.rows.length,0,query+' / '+category);assert.match(r.excluded[0].reason,/unrequested_page_type/);
  }
 }
 for(const [query,category] of [['Plumbers','Plumbing Service'],['Restaurants','Restaurant'],['Law firms','Lawyer & Law Firm'],['Real estate agencies','Real Estate Agent'],['Digital creators','Digital creator'],['Government offices','Government organization'],['Trade associations','Professional Association'],['Anything','Unrecognized category']])assert.equal(run(query,category).rows.length,1);
 assert.equal(run('Restaurants','Reel creator',{exclude_unrelated_page_types:false}).rows.length,1);
});
