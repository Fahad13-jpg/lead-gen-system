'use strict';
const fs=require('node:fs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const actor='apify~facebook-page-contact-information';const r=await fetch('https://api.apify.com/v2/acts/'+actor,{headers:{Authorization:'Bearer '+process.env.APIFY_API_KEY},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Actor lookup HTTP '+r.status);const a=(await r.json()).data;
  const rows=await db.query(`SELECT s.id,s.company_name,c.email,c.website,s.raw_data->'facebooks' AS facebooks,s.raw_data->'socialLinks'->>'facebook' AS facebook
   FROM staging_leads s JOIN cleaning_links l ON l.staging_id=s.id AND l.org_id=s.org_id JOIN cleaned_leads c ON c.id=l.cleaned_id
   WHERE contact_eligible(l.org_id,c.id,s.id) AND (s.raw_data->'facebooks' IS NOT NULL OR s.raw_data->'socialLinks'->>'facebook' IS NOT NULL) ORDER BY (NULLIF(c.email,'') IS NULL) DESC,s.id`);
  const account=await db.query("SELECT id,monthly_budget_usd,gathering_account_spent(id) AS spent FROM gathering_accounts WHERE mode='platform' AND enabled");
  console.log(JSON.stringify({actor_id:a.id,pricing:a.pricingInfos,defaultRunOptions:a.defaultRunOptions,account:account.rows,leads:rows.rows},null,2));
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
