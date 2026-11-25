'use strict';
const assert=require('node:assert/strict'),o=require('../../scripts/lead-enrichment/observations.cjs'),{basic}=require('../../scripts/lead-enrichment/worker.cjs');
(async()=>{
 const lead={company_name:'Clinic',category:'Dental clinic',website:'https://clinic.example'};
 assert.equal(o.serviceHeading('Green light for £100m Clydeside resi development',lead),null);
 assert.equal(o.serviceHeading('We Protect Your Dental Health With Our Professional Dentists',lead),null);
 assert.equal(o.serviceHeading('Orthodontics &amp; braces',lead),'Orthodontics & braces');
 for(const href of ['#',' #booking ','javascript:void(0)','https://clinic.example/'])assert.equal(o.bookingTarget(href,'Book appointment',lead.website),null);
 assert.equal(o.bookingTarget('/appointments','Book appointment',lead.website),'https://clinic.example/appointments');
 assert.equal(o.appointmentForms('<form><input name="name"><select><option>Dental implants</option></select><button type="submit">Prepare my appointment request</button></form>',lead.website).length,1);
 assert.equal(o.appointmentForms('<form><input name="q"><button>Search</button></form>',lead.website).length,0);
 const transient=await basic({lead},async()=>{throw Object.assign(Error('DNS failure'),{code:'ESERVFAIL'});});
 assert.equal(transient.status,'failed');assert.equal(transient.retryable,true);assert.equal(transient.reason,'temporary_source_failure');
 for(const status of [408,429,503])assert.equal((await basic({lead},async url=>({url,status,headers:{},body:''}))).status,'failed');
 for(const status of [403,404])assert.equal((await basic({lead},async url=>({url,status,headers:{},body:''}))).status,'partial');
 const binary=await basic({lead},async url=>({url,status:200,headers:{'content-type':'application/pdf'},body:'not html'}));assert.equal(binary.status,'partial');assert.equal(binary.observations.booking_link,'unknown');
 assert.equal((await basic({lead:{...lead,website:null}})).status,'partial');
 for(const [page,expected] of [[{error:'ENOTFOUND'},'dns'],[{status:403},'blocked'],[{error:'blocked_target'},'blocked'],[{status:404},'not_found'],[{status:200,error_class:'non_html'},'non_html'],[{status:503},'unavailable']]){
  assert.equal(o.sourceFailure([page]),expected);
  assert.equal(o.sourceFailure([page,{usable_html:true}]),null,'a useful page must retain partial evidence');
 }
 assert.equal(o.sourceFailure([]),null);assert.equal(o.sourceFailure(null),null);
 assert.equal(transient.failure_class,'dns');
 const blocked=await basic({lead},async url=>({url,status:403,headers:{},body:''}));assert.equal(blocked.reason,'source_blocked');assert.equal(blocked.failure_class,'blocked');
 console.log('PASS: industry-specific headings, placeholder links, appointment forms, transient retries, permanent failures and non-HTML evidence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
