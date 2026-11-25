// Run inside the temporary isolated n8n server container (port 5680).
const fs=require('node:fs'),assert=require('node:assert/strict');
const credential=JSON.parse(fs.readFileSync('/tmp/gathering-auth.json'))[0];
const headers={'Content-Type':'application/json','X-Lead-Gathering-Key':credential.data.value};
const base='http://127.0.0.1:5680/webhook/';
async function req(path,body,auth=true){const r=await fetch(base+path,{method:body?'POST':'GET',headers:auth?headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let value;try{value=JSON.parse(text)}catch{value={message:text.slice(0,160)}}return {status:r.status,value};}
async function finished(id,expected='completed'){for(let i=0;i<40;i++){const r=await req('gathering-job-status?org_id=900001&job_id='+id);if(['completed','failed','cancelled','needs_review'].includes(r.value.job?.status)){assert.equal(r.value.job.status,expected,JSON.stringify(r.value));return r.value.job;}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('Job did not finish: '+id);}
const prefix='http_'+Date.now();
const body={org_id:900001,billing_mode:'platform',result_mode:'matching',candidate_limit:6,source:'google_maps',job_name:'Webhook feature verification',search_terms:['dentist','dental clinic'],locations:['Islamabad, Pakistan'],center:{latitude:33.7,longitude:73},radius_km:5,max_results:2,max_cost_usd:0.5,request_id:prefix,refresh:true,country_code:'PK',include_categories:['Dentist']};
(async()=>{
 for(let i=0;i<60;i++){try{const ready=await req('gathering-preview',{},false);if([401,403].includes(ready.status))break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 if(process.argv[2]){const id=Number(process.argv[2]);const r=await req('gathering-control',{org_id:900001,job_id:id,action:'resume'});assert.equal(r.status,202,JSON.stringify(r));await finished(id);console.log('PASS: saved-run resume completed without visiting the paid-start node');return;}
 let r=await req('gathering-preview',body,false);assert.ok([401,403].includes(r.status),'Unauthenticated request accepted');
 r=await req('gathering-preview',body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.value.combinations.length,2);assert.equal(r.value.location_resolution,'explicit_coordinates');
 r=await req('start-scraping',{...body,max_results:0});assert.equal(r.status,400);
 r=await req('start-scraping',body);assert.equal(r.status,202,JSON.stringify(r));assert.ok(r.value.job_id,'Missing job identity: '+JSON.stringify(r));const id=r.value.job_id;
 const report=await finished(id);assert.equal(report.unique_leads,2);assert.equal(report.rejected,1);assert.equal(Number(report.actual_cost),0.017);assert.equal(Number(report.customer_charge_usd),0.017);
 r=await req('start-scraping',body);assert.equal(r.status,200);assert.equal(r.value.job_id,id);assert.equal(r.value.dispatch,false);
 r=await req('start-scraping',{...body,max_results:6});assert.equal(r.status,409);
 r=await req('start-scraping',{...body,refresh:false,request_id:prefix+'_cache'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.value.reused_from_job_id,id);assert.equal(r.value.dispatch,false);
 r=await req('gathering-results?org_id=900001&job_id='+id+'&limit=2');assert.equal(r.status,200);assert.equal(r.value.results.length,2);
 r=await req('gathering-results?org_id=900002&job_id='+id);assert.equal(r.status,404);
 r=await req('gathering-job-status?org_id=900002&job_id='+id);assert.equal(r.status,404);
 r=await req('gathering-source-quality?org_id=900001');assert.equal(r.status,200);assert.ok(r.value.sources.length);
 r=await req('start-scraping',{...body,result_mode:'new',refresh:false,request_id:prefix+'_new'});assert.equal(r.status,202);const newOnly=await finished(r.value.job_id);assert.equal(newOnly.new_leads,0);assert.equal(newOnly.shortfall,2);assert.equal(newOnly.existing_matches,2);assert.equal(newOnly.reused_from_job_id,null);
 r=await req('start-scraping',{...body,billing_mode:'byok',request_id:prefix+'_byok'});assert.equal(r.status,202);const byok=await finished(r.value.job_id);assert.equal(byok.billing_mode,'byok');assert.equal(Number(byok.customer_charge_usd),0);
 r=await req('start-scraping',{...body,request_id:prefix+'_cancel',job_name:'Cancel webhook verification'});assert.equal(r.status,202);const cancelId=r.value.job_id;
 // Wait until the worker has persisted the provider identity before cancelling.
 for(let i=0;i<20;i++){const s=await req('gathering-job-status?org_id=900001&job_id='+cancelId);if(s.value.job.status==='running')break;await new Promise(resolve=>setTimeout(resolve,300));}
 await new Promise(resolve=>setTimeout(resolve,500));
 r=await req('gathering-control',{org_id:900001,job_id:cancelId,action:'cancel'});assert.equal(r.status,202,JSON.stringify(r));const cancelled=await finished(cancelId,'cancelled');assert.equal(cancelled.partial_results,true);assert.equal(Number(cancelled.actual_cost),0.017);
 r=await req('start-scraping',{...body,request_id:prefix+'_failure',job_name:'Failure webhook verification'});assert.equal(r.status,202);const failed=await finished(r.value.job_id,'failed');assert.equal(failed.partial_results,true);
 const batch=await Promise.all([1,2,3].map(n=>req('start-scraping',{...body,request_id:prefix+'_batch_'+n})));
 for(const accepted of batch){assert.equal(accepted.status,202,JSON.stringify(accepted));await finished(accepted.value.job_id);}
 console.log('PASS: authenticated dispatch, platform debit, BYOK non-debit, new-only shortfall, three queued jobs, replay/conflict, cache, tenant isolation, cancellation and partial results');
})().catch(e=>{console.error(e.message);process.exitCode=1});
