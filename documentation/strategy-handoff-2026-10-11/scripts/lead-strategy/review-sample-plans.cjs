'use strict';
// Run inside n8n; read-only production records, sample brief, no provider calls.
const fs=require('node:fs'),rt=require('/tmp/strategy-runtime.cjs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  await db.query('BEGIN READ ONLY');
  const config=rt.campaign({org_id:1,config:{name:'DEMONSTRATION ONLY — clinic website',mode:'hybrid',channels:['email','linkedin','call'],timezone:'Asia/Karachi',sender:{name:'Alex (sample sender)',company:'Example Web Studio (sample)'},offer:{name:'Clinic website demonstration',description:'We build mobile-friendly clinic websites with clear service pages.',approved_points:['An appointment-request form lets visitors send a request to your team.','Service pages present the treatments your clinic offers.'],prohibited_claims:['guaranteed bookings','double your revenue']},cta:{text:'Would you like to see a sample website?'},target_terms:['dental','dentist'],locations:['Islamabad'],offer_fit_rules:[{evidence_terms:['dental','dentist'],approved_point_index:1}]}}).config;
  const leads=(await db.query('SELECT id,org_id,company_name,category,city,email,phone,website,enrichment_report(org_id,id) AS report FROM cleaned_leads WHERE org_id=1 AND id IN (167,445,446,447,449) ORDER BY id')).rows;
  const results=[];
  for(const {report,...lead} of leads){if(!report){results.push({lead_id:lead.id,status:'no_eligible_report'});continue;}const plan=rt.compose(rt.prepare({lead,report,campaign:{id:0,version:1,config}}),{gate:{reason:'ai_disabled'}});results.push({lead_id:lead.id,company_name:lead.company_name,plan});}
  await db.query('ROLLBACK');
  fs.writeFileSync('/tmp/strategy-sample-review.json',JSON.stringify({label:'DEMONSTRATION ONLY: fictional product and sender, real existing leads; no messages sent, no model calls, no database writes',campaign:config,results},null,2),{mode:0o600});
  console.log(JSON.stringify(results.map(r=>({lead_id:r.lead_id,fit:r.plan?.scores.product_fit.score,evidence:r.plan?.evidence.length,method:r.plan?.generation.method,errors:r.plan?.validation_errors,warnings:r.plan?.quality_review.map(q=>({step:q.step,warnings:q.warnings}))}))));
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
