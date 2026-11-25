'use strict';
// Explicit operator test only. Never called by an n8n schedule. No outreach or verification.
const fs=require('node:fs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const reference='facebook-contact-canary-20260928',actor='apify~facebook-page-contact-information',cap=0.10;
const dir='/home/node/.n8n/contact-stage/facebook-test';fs.mkdirSync(dir,{recursive:true,mode:0o700});
async function api(path,options={}){const r=await fetch('https://api.apify.com/v2/'+path,{...options,headers:{Authorization:'Bearer '+process.env.APIFY_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Apify HTTP '+r.status);return r.json();}
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{
  const mode=process.argv[2];let state=(await db.query('SELECT * FROM apify_diagnostic_runs WHERE reference=$1',[reference])).rows[0];
  if(mode==='start'){
   if(state){console.log(JSON.stringify({message:'Existing test preserved; use status, never start twice',run_id:state.run_id,status:state.status}));return;}
   const user=(await api('users/me')).data;
   const metadata=(await api('acts/'+actor)).data;
   const pricing=metadata.pricingInfos.filter(p=>new Date(p.startedAt)<=new Date()).at(-1);
   if(pricing?.pricingModel!=='PAY_PER_EVENT')throw Error('Unexpected pricing; no run started');
   const leads=(await db.query(`SELECT s.id,s.company_name,c.email,c.website,s.raw_data->'socialLinks'->>'facebook' AS facebook FROM staging_leads s
    JOIN cleaning_links l ON l.staging_id=s.id AND l.org_id=s.org_id JOIN cleaned_leads c ON c.id=l.cleaned_id AND c.org_id=l.org_id
    WHERE s.id=ANY($1::int[]) AND contact_eligible(l.org_id,c.id,s.id) ORDER BY s.id`,[[118,121,122]])).rows;
   if(leads.length!==3)throw Error('Expected three eligible test businesses');
   const pages=leads.map(l=>{const u=new URL(l.facebook);if(!['facebook.com','www.facebook.com'].includes(u.hostname)||u.pathname==='/platform')throw Error('Unexpected Facebook URL');u.protocol='https:';u.pathname=u.pathname.replace(/\/reviews\/?$/,'/');u.search='';u.hash='';return u.href;});
   const input={pages,language:'en-US'};
   await db.query('BEGIN');const account=(await db.query("SELECT * FROM gathering_accounts WHERE mode='platform' AND enabled FOR UPDATE")).rows[0];
   if(!account||account.provider_user_id!==user.id||account.api_key!==process.env.APIFY_API_KEY)throw Error('Platform account identity mismatch');
   const usage=(await db.query(`SELECT gathering_account_spent($1)::float8 AS spent,coalesce(sum(max_cost_usd),0)::float8 AS reserved FROM scraping_jobs WHERE provider_account_id=$1 AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL))`,[account.id])).rows[0];
   if(Number(account.monthly_budget_usd)-usage.spent-usage.reserved<cap)throw Error('Insufficient platform budget');
   await db.query('INSERT INTO apify_diagnostic_runs(reference,provider_account_id,actor_id,input,max_cost_usd) VALUES($1,$2,$3,$4,$5)',[reference,account.id,actor,input,cap]);await db.query('COMMIT');
   fs.writeFileSync(dir+'/manifest.json',JSON.stringify({reference,cap,input,leads,pricing},null,2),{mode:0o600});
   // A network error after POST leaves the reservation unresolved; never automatically repeat it.
   const run=(await api('acts/'+actor+'/runs?timeout=180&maxTotalChargeUsd='+cap,{method:'POST',body:JSON.stringify(input)})).data;
   fs.writeFileSync(dir+'/run.json',JSON.stringify({id:run.id,dataset_id:run.defaultDatasetId}),{mode:0o600});
   await db.query('UPDATE apify_diagnostic_runs SET run_id=$2,dataset_id=$3,status=$4 WHERE reference=$1',[reference,run.id,run.defaultDatasetId,run.status]);
   console.log(JSON.stringify({run_id:run.id,status:run.status,pages:3,cap_usd:cap,lead_names:leads.map(l=>l.company_name)}));
  }else if(mode==='status'){
   if(!state?.run_id)throw Error('No recorded run ID; reconcile provider state before any retry');
   const run=(await api('actor-runs/'+state.run_id)).data;
   const terminal=['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(run.status);
   if(!terminal){console.log(JSON.stringify({run_id:run.id,status:run.status,reported_cost_usd:run.usageTotalUsd}));return;}
   const items=await api('datasets/'+state.dataset_id+'/items?clean=true&limit=10');
   const cost=typeof run.usageTotalUsd==='number'?run.usageTotalUsd:null;
   await db.query('UPDATE apify_diagnostic_runs SET status=$2,actual_cost_usd=$3,finished_at=now() WHERE reference=$1',[reference,run.status,cost]);
   const report={run_id:run.id,status:run.status,reported_cost_usd:cost,charged_events:run.chargedEventCounts,pricing:run.pricingInfo,started_at:run.startedAt,finished_at:run.finishedAt,items};
   fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
  }else throw Error('Use start or status');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
