'use strict';
// Read-only real lead benchmark; sample campaign is never persisted.
const rt=require('/tmp/strategy-runtime.cjs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  await db.query('BEGIN READ ONLY');
  const leads=(await db.query('SELECT id,org_id,company_name,category,city,email,phone,website,enrichment_report(org_id,id) AS report FROM cleaned_leads WHERE org_id=1 AND id IN (167,445,446,447,448,449,460,461,462) ORDER BY id')).rows;
  const config=rt.campaign({org_id:1,config:{name:'Read-only clinic score benchmark',channels:['email'],timezone:'Asia/Karachi',sender:{name:'Sample',company:'Sample studio'},offer:{name:'Clinic website',description:'Sample clinic website offer',approved_points:['Sample service pages']},cta:{text:'See a demo?'},target_terms:['dental','dentist'],locations:['Islamabad'],offer_fit_rules:[{evidence_terms:['dental','dentist'],approved_point_index:0}]}}).config;
  console.log('Scenario: synthetic clinic website brief; existing real lead reports; no writes or provider calls.');
  for(const {report,...lead} of leads){if(!report){console.log(JSON.stringify({lead_id:lead.id,status:'ineligible_or_missing_report'}));continue;}const p=rt.compose(rt.prepare({lead,report,campaign:{id:0,version:1,config}}));console.log(JSON.stringify({lead_id:lead.id,product_fit:p.scores.product_fit.score,fit_coverage:p.scores.product_fit.coverage_percent,data_confidence:p.scores.data_confidence.score,data_coverage:p.scores.data_confidence.coverage_percent,readiness:p.scores.outreach_readiness.score,blockers:p.channel_readiness.email.reasons}));}
  await db.query('ROLLBACK');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
