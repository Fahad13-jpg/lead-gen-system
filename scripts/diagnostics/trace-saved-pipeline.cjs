'use strict';
// Trace existing stored data only; no claims, new jobs, provider calls or writes.
const fs=require('node:fs'),assert=require('node:assert/strict'),{localPool}=require('../dashboard/start-local-auth.cjs');
const {dataService}=require('../dashboard/data.cjs');
async function main(){const db=localPool();try{
 const jobs=(await dataService({pool:db,identity:{principal:async()=>{}}}).jobs('operator-read',{org_id:'1',limit:'100'})).jobs;
 const traces=(await db.query(`SELECT j.id,j.status,j.source,j.result_mode,j.max_results,j.total_leads,j.duplicate_count,j.completion_reason,
 (SELECT count(*)::integer FROM gathering_results r WHERE r.org_id=j.org_id AND r.job_id=j.id) AS recorded_results,
 (SELECT count(DISTINCT r.lead_id)::integer FROM gathering_results r WHERE r.org_id=j.org_id AND r.job_id=j.id AND (r.reason='organization_already_has_business' OR r.disposition='reused')) AS existing_matches,
 (SELECT count(DISTINCT s.id)::integer FROM staging_leads s WHERE s.org_id=j.org_id AND s.job_id=j.id) AS staged,
 (SELECT count(DISTINCT c.id)::integer FROM staging_leads s JOIN cleaning_links l ON l.org_id=s.org_id AND l.staging_id=s.id JOIN cleaned_leads c ON c.org_id=l.org_id AND c.id=l.cleaned_id WHERE s.org_id=j.org_id AND s.job_id=j.id) AS cleaned,
 (SELECT count(DISTINCT p.lead_id)::integer FROM staging_leads s JOIN cleaning_links l ON l.org_id=s.org_id AND l.staging_id=s.id JOIN cleaned_leads c ON c.org_id=l.org_id AND c.id=l.cleaned_id JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE s.org_id=j.org_id AND s.job_id=j.id AND p.basic_at IS NOT NULL) AS assessed,
 (gathering_report_v3(j.id,j.org_id)->>'shortfall')::integer AS authoritative_shortfall
 FROM scraping_jobs j WHERE j.org_id=1 AND EXISTS(SELECT 1 FROM staging_leads s WHERE s.org_id=j.org_id AND s.job_id=j.id) ORDER BY j.id DESC`)).rows;
 for(const t of traces){const view=jobs.find(j=>j.id===t.id);assert(view,'TRACE_MISSING_FROM_PAGE');assert.equal(view.staged_count,t.staged);assert.equal(view.cleaned_count,t.cleaned);assert.equal(view.assessed_count,t.assessed);
  if(['new','matching'].includes(t.result_mode)){assert.equal(view.existing_match_count,t.existing_matches);if(['completed','failed','cancelled'].includes(t.status))assert.equal(view.target_shortfall,t.authoritative_shortfall);}
  else{assert.equal(view.existing_match_count,null);assert.equal(view.target_shortfall,null);}
 }
 const isolation=(await db.query(`SELECT (SELECT count(*) FROM cleaning_links l JOIN staging_leads s ON s.id=l.staging_id JOIN cleaned_leads c ON c.id=l.cleaned_id WHERE l.org_id<>s.org_id OR l.org_id<>c.org_id)::integer AS mismatched_links,
 (SELECT count(*) FROM gathering_results r JOIN scraping_jobs j ON j.id=r.job_id WHERE r.org_id<>j.org_id)::integer AS mismatched_results`)).rows[0];
 const result={checked_at:new Date().toISOString(),traces,isolation,api_counts_match:true,read_only:true,provider_calls:0,new_jobs:0};fs.writeFileSync('.local/saved-pipeline-trace.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,traces:traces.slice(0,8),total_traced:traces.length}));
 }finally{await db.end();}}
main().catch(e=>{console.error(JSON.stringify({error:'PIPELINE_TRACE_UNCONFIRMED',code:e.code,assertion:e.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;});
