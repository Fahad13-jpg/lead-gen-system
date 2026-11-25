'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
 const summaries=[];
 for(const id of [167,449]){
  const r=await fetch('http://127.0.0.1:5678/webhook/enrichment-report?org_id=1&lead_id='+id,{headers:{'X-Lead-Gathering-Key':key},signal:AbortSignal.timeout(10000)});
  assert.equal(r.status,200);const report=await r.json();assert.equal(report.lead_id,id);
  assert.equal(report.basic.status,'complete');assert.equal(report.research.status,'complete');
  assert.equal(report.trust.fully_verified,false);assert.equal(report.trust.usable_for.automatic_outreach,false);
  assert.equal(report.basic.observations.contact_form,'observed');
  assert(report.basic.pages.every(p=>p.usable_html===true));
  assert(!report.basic.services.some(s=>/Clydeside|£100m/.test(s.text)));
  if(id===167){assert.equal(report.basic.observations.booking_link,'not_observed');assert.equal(report.basic.services.length,0);}
  if(id===449){assert(report.basic.evidence.some(e=>e.method==='appointment_request_form'&&e.submission_tested===false));assert(report.basic.services.some(s=>s.text==='Dental implants'));}
  summaries.push({lead_id:id,observations:report.basic.observations,trust:report.trust.overall_status});
 }
 console.log('PASS live clinic report API: corrected observations, fresh saved enrichment, no false verification or outreach readiness.');console.log(JSON.stringify(summaries));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
