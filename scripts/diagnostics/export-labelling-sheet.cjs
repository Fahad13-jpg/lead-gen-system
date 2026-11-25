'use strict';
const fs=require('fs'),assert=require('assert/strict'),{stamp}=require('../lead-enrichment/source-checks.cjs'),sheet=require('../lead-enrichment/signals.cjs'),{basic}=require('../lead-enrichment/worker.cjs'),rt=require('../lead-strategy/runtime.cjs');
const rows=require('../../.local/scratch-diagnostics-20261011/source-rows.json'),fixtures=require('../../tests/lead-enrichment/fixtures/benchmark-signals.json'),dir='documentation/scratch-review-20261011/';
(async()=>{
 const stamps=rows.map(row=>({staging_id:row.staging_id,lead_id:row.lead_id,source:row.source,...stamp(row)}));
 const counts={};for(const r of stamps){const key=r.source+':'+r.website_result;counts[key]=(counts[key]||0)+1;}fs.writeFileSync(dir+'source-stamps.json',JSON.stringify({counts,rows:stamps},null,2));
 const selected=[],add=r=>{if(r?.lead_id&&!selected.some(x=>x.lead_id===r.lead_id)&&selected.length<30)selected.push(r)};
 for(const id of [167,445,446,447,449])add(rows.find(r=>r.lead_id===id));for(const r of rows.filter(r=>r.source==='yellow_pages'))add(r);for(const r of rows)add(r);assert.equal(selected.length,30);
 const records=[];
 for(const row of selected){const check=stamp(row);let b,method;
  if([167,449].includes(row.lead_id)){const fixture=fixtures.find(f=>f.lead.id===row.lead_id);b=await basic({lead:fixture.lead,source_checks:[check]},async url=>{const p=fixture.snapshots.find(x=>x.request_url===url);if(!p)throw Error('Missing historical capture');return p.response});method='October 5 HTML replay; no live fetch';}
  else{b=row.basic?structuredClone(row.basic):{business:{website:row.website},pages:[],evidence:[],services:[]};b.observed_at=new Date().toISOString();b.signals=sheet.build(b,[check]);method='Stored records only; unrecorded text metrics remain unknown';}
  const presence=b.signals.web_presence.state==='none_found'?'none_found':b.pages.some(p=>p.usable_html)?'present':'unknown';
  const fresh=[167,449].includes(row.lead_id)||!row.basic_at||Date.now()-Date.parse(row.basic_at)<30*86400000;
  const qualification=rt.qualify(b.signals,'website_presence',[],{website_presence:presence,freshness:{website_current:fresh},conflicts:b.quality_flags||[]});
  const paths=Object.fromEntries(Object.entries(b.signals.inquiry_paths).map(([k,v])=>[k,v.state]));
  records.push({name:row.company_name,category:row.category||'',city:row.city||'',source:row.source,lead_id:row.lead_id,'web_presence state':b.signals.web_presence.state,'key signals':JSON.stringify({inquiry_paths:paths,quality_flags:Object.keys(b.signals.site_quality_flags).filter(k=>b.signals.site_quality_flags[k].observed),source_website_result:check.website_result,source_observed_at:check.observed_at,method}),'qualifier verdict':qualification.fit,'human: would pitch a website? Y/N/unsure':''});
 }
 const headers=Object.keys(records[0]),cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';
 fs.writeFileSync(dir+'website-pitch-labelling-30.csv','\uFEFF'+[headers.map(cell).join(','),...records.map(r=>headers.map(h=>cell(r[h])).join(','))].join('\r\n')+'\r\n');
 assert(records.every(r=>r['human: would pitch a website? Y/N/unsure']===''));fs.writeFileSync(dir+'labelling-manifest.json',JSON.stringify({generated_at:new Date().toISOString(),rows:records.length,lead_ids:records.map(r=>r.lead_id),source_counts:records.reduce((a,r)=>(a[r.source]=(a[r.source]||0)+1,a),{}),states:records.reduce((a,r)=>(a[r['web_presence state']]=(a[r['web_presence state']]||0)+1,a),{}),human_labels_filled:0,evaluation_score:null},null,2));console.log(JSON.stringify({records:records.length,source_counts:counts,human_labels_filled:0,evaluation_score:null}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
