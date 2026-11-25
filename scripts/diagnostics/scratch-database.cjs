'use strict';
const fs=require('fs'),cp=require('child_process'),path=require('path');
const env=JSON.parse(fs.readFileSync('.local/scratch-diagnostics-20261011/environment.json'));if(env.pg!=='lead_diag_pg_20261011'||env.dbName!=='scratch_lead_diag_20261011')throw Error('Scratch identity mismatch');
const dir='documentation/scratch-review-20261011';fs.mkdirSync(dir,{recursive:true});
function sql(query){return cp.execFileSync('docker',['exec','-i',env.pg,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',env.dbName,'-At'],{input:query,encoding:'utf8',maxBuffer:20e6}).trim()}
function json(query){return JSON.parse(sql('SELECT coalesce(jsonb_agg(t),\'[]\'::jsonb) FROM ('+query+') t;'))}
if(process.argv[2]==='inspect'){
 const rows=json(`SELECT s.id staging_id,s.org_id,s.source,s.company_name,s.category,s.city,s.created_at,s.website,s.raw_data,l.cleaned_id lead_id,p.basic,p.basic_at,c.rating,c.review_count FROM staging_leads s LEFT JOIN cleaning_links l ON l.org_id=s.org_id AND l.staging_id=s.id LEFT JOIN enrichment_profiles p ON p.org_id=l.org_id AND p.lead_id=l.cleaned_id LEFT JOIN cleaned_leads c ON c.org_id=l.org_id AND c.id=l.cleaned_id WHERE s.source IN ('google_maps','yellow_pages','yelp') ORDER BY s.source,s.id`);
 fs.writeFileSync('.local/scratch-diagnostics-20261011/source-rows.json',JSON.stringify(rows,null,2));
 const before=json(`SELECT org_id,lead_id,basic->>'input_fingerprint' stored,enrichment_fingerprint(org_id,lead_id,'basic') computed,lead_trust_report(org_id,lead_id) trust FROM enrichment_profiles ORDER BY org_id,lead_id`);fs.writeFileSync('.local/scratch-diagnostics-20261011/pre-migration.json',JSON.stringify(before,null,2));
 console.log(rows.map(r=>({id:r.lead_id,staging:r.staging_id,source:r.source,name:r.company_name,website:r.raw_data?.website,website_key:Object.hasOwn(r.raw_data||{},'website'),keys:Object.keys(r.raw_data||{})})));console.log('Existing strategy plans:',sql('SELECT count(*) FROM strategy_plans;'));
}else if(process.argv[2]==='apply'){
 const result=sql(fs.readFileSync('database/migrations/016_signal_sheet.sql','utf8'));fs.writeFileSync(dir+'/migration-apply.txt',result);console.log(result);
 const after=json(`SELECT p.org_id,p.lead_id,p.basic->>'input_fingerprint' stored,enrichment_fingerprint(p.org_id,p.lead_id,'basic') computed,enrichment_source_checks(p.org_id,p.lead_id) source_checks,lead_trust_report(p.org_id,p.lead_id) trust FROM enrichment_profiles p ORDER BY p.org_id,p.lead_id`);fs.writeFileSync(dir+'/scratch-after-migration.json',JSON.stringify(after,null,2));console.log('Profiles inspected:',after.length,'changed fingerprints:',after.filter(r=>r.stored!==r.computed).length);console.log('Permissions',sql("SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user;"));
}
module.exports={sql,json,env};
