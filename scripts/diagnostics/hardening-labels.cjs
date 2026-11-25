'use strict';
const fs=require('fs'),assert=require('assert/strict'),sheet=require('../lead-enrichment/signals.cjs'),{stamp}=require('../lead-enrichment/source-checks.cjs'),rt=require('../lead-strategy/runtime.cjs');
const rows=require('../../.local/scratch-diagnostics-20261011/source-rows.json'),old=require('../../documentation/scratch-review-20261011/labelling-manifest.json'),dir='documentation/hardening-review-20261012/';
const now=new Date().toISOString();
function evaluate(row,days){
 const check=stamp(row),b=row.basic?structuredClone(row.basic):null;
 // Offline reclassification of already-assessed stored data; never fabricate an assessment timestamp.
 const signals=b?sheet.build({...b,business:b.business||{website:row.website},pages:b.pages||[],observed_at:b.observed_at||row.basic_at},[check],days):null;
 const state=signals?.web_presence.state||'not_assessed';
 const trust={assessment_status:b?'assessed':'not_assessed',evaluated_at:now,website_presence:state==='social_only'?'social_only':state==='none_found'?'none_found':b?.pages?.some(p=>p.usable_html)?'present':'unknown',freshness:{website_current:!!b&&Date.parse(row.basic_at)<=Date.parse(now)&&Date.parse(row.basic_at)>Date.parse(now)-30*86400000},conflicts:b?.quality_flags||[]};
 const q=rt.qualify(signals,{key:'website_presence',source_check_max_age_days:days},[],trust);
 return {state,check,signals,q};
}
const windows=rows.filter(r=>r.lead_id>=450&&r.lead_id<=458).map(r=>({lead_id:r.lead_id,source_at:r.raw_data.scrapedAt,assessment_at:r.basic_at,source_age_days:(Date.parse(now)-Date.parse(r.raw_data.scrapedAt))/86400000,windows:Object.fromEntries([30,90,180].map(days=>{const e=evaluate(r,days);return [days,{state:e.state,fit:e.q.fit,reasons:e.q.reason_codes}]}))}));
fs.writeFileSync(dir+'source-age-windows.json',JSON.stringify({evaluated_at:now,method:'Offline reclassification of stored basic observations. Assumes normal fingerprint refresh; does not bypass current production hash gates.',leads:windows},null,2));
const records=old.lead_ids.map(id=>{const row=rows.find(r=>r.lead_id===id);assert(row);const e=evaluate(row,30);return {name:row.company_name,category:row.category||'',city:row.city||'',source:row.source,lead_id:id,'web_presence state':e.state,'key signals':JSON.stringify({source_result:e.check.website_result,source_at:e.check.observed_at,assessment_at:row.basic_at,reasons:e.q.reason_codes,next_action:e.q.next_action,method:'Stored observation reclassification; no new fetch; existing fingerprint gates still require refresh',inquiry_paths:e.signals?.inquiry_paths||{}}),'qualifier verdict':e.q.fit,'human: would pitch a website? Y/N/unsure':''};});
assert.equal(records.length,30);const headers=Object.keys(records[0]),cell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';fs.writeFileSync(dir+'website-pitch-labelling-30.csv','\uFEFF'+[headers,...records.map(r=>headers.map(h=>r[h]))].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n');
fs.writeFileSync(dir+'labelling-manifest.json',JSON.stringify({evaluated_at:now,lead_ids:old.lead_ids,rows:30,human_labels_filled:0,evaluation_score:null,states:records.reduce((a,r)=>(a[r['web_presence state']]=(a[r['web_presence state']]||0)+1,a),{}),verdicts:records.reduce((a,r)=>(a[r['qualifier verdict']]=(a[r['qualifier verdict']]||0)+1,a),{})},null,2));console.log(JSON.stringify(windows,null,2));
