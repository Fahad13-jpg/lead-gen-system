const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const rt=require('../../scripts/lead-gathering/runtime.cjs');
const call=(name,input={},refs={})=>new Function('$input','$','$execution',`return (${rt[name].toString()})();`)({first:()=>({json:input})},n=>({first:()=>({json:refs[n]})}),{id:'test-execution'});
const valid={org_id:1,source:'google_maps',job_name:'Dental clinics',search_query:'dentists',location:'Islamabad, Pakistan',max_results:5,request_id:'test_0001'};
test('valid request is normalized, bounded and assigned defaults',()=>{const r=call('validateRequest',{body:valid});assert.equal(r.error,false);assert.equal(r.max_cost_usd,0.5);assert.equal(r.scrape_contacts,true)});
for(const patch of [{org_id:'1; DROP TABLE users'},{org_id:0},{org_id:true},{max_results:'5abc'},{max_results:NaN},{max_results:501},{max_results:0},{location:''},{search_query:null},{job_name:'x\n'},{source:'yelp'},{max_cost_usd:false},{max_cost_usd:Infinity},{max_cost_usd:11},{request_id:'bad'},{website_filter:'unknown'},{scrape_contacts:'yes'}])test('rejects '+JSON.stringify(patch),()=>assert.equal(call('validateRequest',{body:{...valid,...patch}}).error,true));
test('Yellow Pages is restricted to explicit US searches',()=>{assert.equal(call('validateRequest',{body:{...valid,source:'yellow_pages'}}).error,true);assert.equal(call('validateRequest',{body:{...valid,source:'yellow_pages',country_code:'US'}}).error,false)});
test('quotes in search fields remain data',()=>assert.equal(call('validateRequest',{body:{...valid,search_query:"O'Brien dental"}}).search_query,"O'Brien dental"));
test('invalid replacement connection cannot overwrite current key',()=>assert.equal(call('parseConnection',{statusCode:401,body:{error:{}}},{'Validate Input':{org_id:1}}).valid,false));
test('successful connection requires authenticated user identity',()=>{assert.equal(call('parseConnection',{statusCode:200,body:{}},{'Validate Input':{}}).valid,false);assert.equal(call('parseConnection',{statusCode:200,body:{data:{id:'user'}}},{'Validate Input':{}}).valid,true)});
const job={id:1,org_id:1,source:'google_maps',max_results:5,started_at:new Date().toISOString(),request_settings:{}};
const refs={'Prepare Actor':job,'Parse Run':{run_id:'run1',dataset_id:'dataset1'}};
test('actor input avoids unnecessary detail enrichment',()=>{const r=call('prepareActor',job);assert.equal(r.apify_input.scrapePlaceDetailPage,false);assert.equal(r.apify_input.maxCrawledPlacesPerSearch,5)});
test('start requires run and dataset identities',()=>assert.throws(()=>call('parseStart',{body:{data:{id:'run1'}}},refs),/run ID/));
test('polling times out during RUNNING, not only on terminal states',()=>{const r=call('parseStatus',{body:{data:{id:'run1',status:'RUNNING'}}},{...refs,'Prepare Actor':{...job,started_at:new Date(Date.now()-700000).toISOString()}});assert.equal(r.expired,true);assert.equal(r.terminal,false)});
for(const status of ['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'])test('recognizes terminal '+status,()=>{const r=call('parseStatus',{body:{data:{id:'run1',status,usageTotalUsd:0.017}}},refs);assert.equal(r.terminal,true);assert.equal(r.succeeded,status==='SUCCEEDED');assert.equal(r.actual_cost,0.017)});
test('empty datasets produce an explicit empty completion batch',()=>assert.deepEqual(call('transformResults',{body:[]},refs),{job_id:1,org_id:1,rows:[],excluded:[],rejected:0,fetched:0}));
test('university search excludes colleges, schools and departments even with broad provider categories',()=>{
 const universityJob={...job,search_query:'Universities',request_settings:{exclude_categories:['collages','schools']}};
 const rows=[{title:'Attock University',categoryName:'University'},{title:'Attock College',categoryName:'University'},{title:'School of Medicine',categoryName:'University'},{title:'Department of Physics at Attock University',categoryName:'University'}];
 const result=call('transformResults',{body:rows},{'Prepare Actor':universityJob});
 assert.equal(result.rows.length,1);assert.equal(result.rejected,3);
 assert.ok(result.excluded.some(x=>String(x.reason).includes('category_excluded')));
});
test('the same university filter applies to Facebook and Yelp listings',()=>{
 const settings={exclude_categories:['collages','schools']};
 const facebook=call('transformResults',{body:[
  {pageName:'Attock University',pageUrl:'https://www.facebook.com/attockuniversity/',category:'University'},
  {pageName:'Attock College',pageUrl:'https://www.facebook.com/attockcollege/',category:'University'}
 ]},{'Prepare Actor':{...job,source:'facebook_pages',search_query:'Universities',request_settings:settings}});
 assert.deepEqual(facebook.rows.map(row=>row.company_name),['Attock University']);
 const yelp=call('transformResults',{body:[
  {name:'Attock University',directUrl:'https://www.yelp.com/biz/attock-university',categories:['University']},
  {name:'Attock College',directUrl:'https://www.yelp.com/biz/attock-college',categories:['University']}
 ]},{'Prepare Actor':{...job,source:'yelp',search_query:'Universities',request_settings:settings}});
 assert.deepEqual(yelp.rows.map(row=>row.company_name),['Attock University']);
});
test('all source workflows contain the current result filter',()=>{
 for(const file of ['03_google_maps_scraper','03a_yellow_pages_scraper','03b_facebook_pages_scraper','03c_yelp_scraper']){
  const workflow=JSON.parse(fs.readFileSync(`workflows/${file}.json`));
  const code=workflow.nodes.find(node=>node.name==='Transform Results').parameters.jsCode;
  assert.match(code,/mismatchedUniversity/);
  assert.match(code,/excludedCategory/);
  new Function(code);
 }
});
test('provider error bodies are not mistaken for leads',()=>assert.throws(()=>call('transformResults',{body:{error:'bad'}},refs),/array/));
test('malformed results are counted without creating Unknown companies',()=>{const r=call('transformResults',{body:[{},null,{error:'failed'},{name:'Clinic',phone:123}]},refs);assert.equal(r.rejected,3);assert.equal(r.rows.length,1);assert.equal(r.rows[0].phone,'123')});
test('preserves raw provenance, quotes, email and nested address',()=>{const raw={name:"O'Brien Clinic",address:{street:'Main road',city:'Austin'},emails:['Info@Clinic.example'],website:'clinic.example/?tracking=1',id:'place1'};const r=call('transformResults',{body:[raw]},{'Prepare Actor':{...job,source:'yellow_pages'}}).rows[0];assert.equal(r.email,'info@clinic.example');assert.equal(r.website,'https://clinic.example');assert.equal(r.city,'Austin');assert.equal(r.source_record_id,'place1');assert.deepEqual(r.raw_data,raw)});
test('result cap enforced independently of provider behavior',()=>assert.equal(call('transformResults',{body:Array.from({length:10},(_,i)=>({name:'Clinic '+i}))},refs).rows.length,5));
test('website mapping works without browser URL global in n8n sandbox',()=>{const vm=require('node:vm');const r=vm.runInNewContext(`(${rt.transformResults.toString()})()`,{$input:{first:()=>({json:{body:[{name:'Clinic',website:'https://Clinic.example/contact/?track=1'}]}})},$:()=>({first:()=>({json:job})})});assert.equal(r.rows[0].website,'https://clinic.example/contact')});
test('failure records do not copy provider secrets',()=>{const r=call('formatFailure',{error:{message:'token=SECRET'}},refs);assert.ok(!JSON.stringify(r).includes('SECRET'))});
test('multi-location campaign has one shared cap and normalized terms',()=>{const p=call('validateRequest',{body:{...valid,search_terms:['Dentists','dentists','Dental clinics'],locations:['Islamabad','Rawalpindi']}});assert.equal(p.error,false);assert.equal(p.search_terms.length,2);const a=call('prepareActor',{...job,request_settings:p});assert.equal(a.apify_input.searchStringsArray.length,4);assert.equal(a.apify_input.maxCrawledPlacesPerSearch,2);assert.equal(a.apify_input.locationQuery,undefined);});
for(const patch of [{center:{latitude:91,longitude:0},radius_km:5},{center:{latitude:33,longitude:73}},{radius_km:10},{reuse_hours:169},{refresh:'yes'},{search_terms:[]},{locations:['A','B','C','D','E','F']},{include_categories:'dentist'},{country_code:'Pakistan'}])test('rejects invalid feature settings '+JSON.stringify(patch),()=>assert.equal(call('validateRequest',{body:{...valid,...patch}}).error,true));
test('radius generates closed longitude/latitude polygon without conflicting named location',()=>{const p=call('validateRequest',{body:{...valid,center:{latitude:33.7,longitude:73},radius_km:5}});const a=call('prepareActor',{...job,request_settings:p});assert.equal(a.apify_input.locationQuery,undefined);const ring=a.apify_input.customGeolocation.coordinates[0];assert.equal(ring.length,65);assert.deepEqual(ring[0],ring[64]);assert.ok(ring[0][1]>33.7);});
test('precise relevance filtering explains missing coordinates, outside radius and closed',()=>{const r=call('transformResults',{body:[{title:'Near',location:{lat:33.7,lng:73}},{title:'Far',location:{lat:34,lng:73}},{title:'Unknown'},{title:'Closed',permanentlyClosed:true,location:{lat:33.7,lng:73}}]},{'Prepare Actor':{...job,request_settings:{center:{latitude:33.7,longitude:73},radius_km:5}}});assert.equal(r.rows.length,1);assert.deepEqual(r.excluded.map(x=>x.reason),['outside_radius','missing_coordinates','closed']);});
test('category, contact and country exclusions retain their source evidence',()=>{const raw={title:'Shop',categoryName:'Grocery',countryCode:'US'};const r=call('transformResults',{body:[raw]},{'Prepare Actor':{...job,request_settings:{include_categories:['dentist'],require_contact:true,country_code:'PK'}}});assert.equal(r.rows.length,0);assert.match(r.excluded[0].reason,/category_not_included/);assert.match(r.excluded[0].reason,/missing_contact/);assert.match(r.excluded[0].reason,/outside_country/);assert.deepEqual(r.excluded[0].raw_data,raw);});
test('resume reuses saved provider identities without requiring a start response',()=>{const r=call('parseStart',{}, {'Prepare Actor':{...job,apify_actor_run_id:'saved',dataset_id:'existing'}});assert.equal(r.run_id,'saved');assert.equal(r.dataset_id,'existing');});
test('preview reports ambiguity and does not claim to geocode a named city',()=>{const p=call('validateRequest',{body:valid});const r=call('previewRequest',p);assert.equal(r.location_resolution,'provider_resolves_named_locations');assert.equal(r.combinations.length,1);assert.equal(r.max_cost_usd,0.5);});
test('defaults to platform billing and a new-business target with bounded candidates',()=>{const p=call('validateRequest',{body:valid});assert.equal(p.billing_mode,'platform');assert.equal(p.result_mode,'new');assert.equal(p.candidate_limit,15);assert.equal(call('previewRequest',p).reuse_hours,0);});
test('BYOK and matching mode are explicit and preserve reuse',()=>{const p=call('validateRequest',{body:{...valid,billing_mode:'byok',result_mode:'matching'}});assert.equal(p.billing_mode,'byok');assert.equal(p.candidate_limit,5);assert.equal(call('previewRequest',p).reuse_hours,24);});
for(const patch of [{billing_mode:'automatic'},{result_mode:'all'},{candidate_limit:4},{candidate_limit:1501},{candidate_limit:true},{max_customer_cost_usd:-1},{max_customer_cost_usd:true}])test('rejects billing/target ambiguity '+JSON.stringify(patch),()=>assert.equal(call('validateRequest',{body:{...valid,...patch}}).error,true));
test('new target is applied after database dedup, not before transforming candidates',()=>{const r=call('transformResults',{body:Array.from({length:6},(_,i)=>({title:'Clinic '+i}))},{'Prepare Actor':{...job,max_results:2,candidate_limit:6}});assert.equal(r.rows.length,6);});
test('provider receives the bounded candidate allowance',()=>{const r=call('prepareActor',{...job,max_results:5,candidate_limit:15});assert.equal(r.apify_input.maxCrawledPlacesPerSearch,15);});
for(const file of ['01_connect_apify.json','02_main_orchestrator.json','03_google_maps_scraper.json','03a_yellow_pages_scraper.json'])test('workflow graph and database parameterization: '+file,()=>{
 const w=JSON.parse(fs.readFileSync('workflows/'+file));const names=new Set(w.nodes.map(n=>n.name));
 for(const [name,types]of Object.entries(w.connections)){assert.ok(names.has(name));for(const outputs of Object.values(types))for(const edges of outputs)for(const e of edges)assert.ok(names.has(e.node));}
 for(const n of w.nodes){if(n.type.endsWith('.code'))new Function(n.parameters.jsCode);if(n.type.endsWith('.postgres')){assert.ok(!n.parameters.query.includes('{{'));assert.ok(n.parameters.options.queryReplacement);}if(n.type.endsWith('.webhook'))assert.equal(n.parameters.authentication,'headerAuth');if(n.name==='Start Apify Actor')assert.ok(!n.retryOnFail);}
});
