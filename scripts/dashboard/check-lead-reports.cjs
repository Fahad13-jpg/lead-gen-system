'use strict';
// Read-only report shape diagnostic. Never prints raw reports or contact values.
const {localPool}=require('./start-local-auth.cjs');
(async()=>{const pool=localPool();try{
 const result=await pool.query("SELECT id,enrichment_report(org_id,id) AS report FROM cleaned_leads WHERE org_id=1 AND id IN (167,445,446,447,449) ORDER BY id");
 console.log(JSON.stringify(result.rows.map(({id,report:r})=>({id,available:!!r,keys:Object.keys(r||{}),basic_keys:Object.keys(r?.basic||{}),trust_keys:Object.keys(r?.trust||{}),evidence_shape:Object.keys(Array.isArray(r?.basic?.evidence)?r.basic.evidence[0]||{}:{}),service_shape:Object.keys(Array.isArray(r?.basic?.services)?r.basic.services[0]||{}:{}),page_shape:Object.keys(Array.isArray(r?.basic?.pages)?r.basic.pages[0]||{}:{}),research_keys:Object.keys(r?.research||{}),contact_keys:Object.keys(r?.contact||{})}))));
 }finally{await pool.end();}})().catch(()=>{console.error('LEAD_REPORT_CHECK_FAILED');process.exitCode=1;});
