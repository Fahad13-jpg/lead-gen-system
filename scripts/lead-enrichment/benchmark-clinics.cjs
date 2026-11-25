'use strict';
// Read-only production snapshot; public website reads only. Never claims/saves jobs.
const fs=require('node:fs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const {basic}=require('/home/node/.n8n/enrichment-stage/worker.cjs');
const contacts=require('/home/node/.n8n/contact-stage/worker.cjs');
(async()=>{
 const output='/tmp/clinic-benchmark.json';if(fs.existsSync(output))throw Error('Benchmark already exists; use saved evidence before repeating network calls');
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});
 await db.connect();let rows;
 try{await db.query('BEGIN READ ONLY');rows=(await db.query(`SELECT c.id,c.org_id,c.company_name,c.category,c.city,c.country,c.website,c.phone,c.email,c.staging_id,s.raw_data,s.raw_data->>'url' AS source_url,
 lead_trust_report(c.org_id,c.id) AS previous_trust
 FROM cleaned_leads c JOIN staging_leads s ON s.id=c.staging_id AND s.org_id=c.org_id
 WHERE c.id IN (162,167,445,446,447,448,449,460,461,462) AND c.org_id=1 AND contact_eligible(c.org_id,c.id,c.staging_id) ORDER BY c.id`)).rows;await db.query('COMMIT');}finally{await db.end();}
 const report={started_at:new Date().toISOString(),method:'existing_eligible_clinic_cohort_plus_flagged_business',provider_calls:0,results:[]};
 for(const lead of rows){
  const started=Date.now(),snapshots=[];const cache=new Map();
  const fetchPage=async(url,host,deadline)=>{
   if(cache.has(url)){const saved=cache.get(url);if(saved.error)throw Object.assign(Error(saved.error),{code:saved.error});return saved.response;}
   try{const response=await contacts.publicPage(url,host,deadline);const saved={request_url:url,response};cache.set(url,saved);snapshots.push(saved);return response;}
   catch(e){const saved={request_url:url,error:e.code||'website_unavailable'};cache.set(url,saved);snapshots.push(saved);throw e;}
  };
  const task={lead};const enriched=await basic(task,fetchPage);
  const discovery=await contacts.resolveContacts({website:lead.website,record:lead},{crawl:t=>contacts.discover(t,fetchPage)});
  const result={lead,basic:enriched,discovery,snapshots,duration_ms:Date.now()-started};report.results.push(result);
  fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({id:lead.id,website:!!lead.website,basic:enriched.status,discovery:discovery.status,emails:discovery.candidates.length,pages:snapshots.length,duration_ms:result.duration_ms}));
 }
 report.finished_at=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
