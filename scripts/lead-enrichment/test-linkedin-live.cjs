'use strict';
// Explicit operator canary, not a scheduled customer job. Uses the shared platform
// ledger and LinkedIn sub-limit; does not manufacture customer wallet credit.
const fs=require('fs'),rt=require('/home/node/.n8n/enrichment-stage/runtime.cjs'),{spec,mapRows}=require('/home/node/.n8n/enrichment-stage/linkedin.cjs'),{Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const kind=process.argv[3]||'company';if(!['company','employees','posts'].includes(kind))throw Error('Invalid canary kind');
const reference='linkedin-job-canary-20261003-'+kind,cap=0.05,leadId=159,org=1;
(async()=>{const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();try{
 const account=(await db.query("SELECT id,api_key,provider_user_id FROM gathering_accounts WHERE mode='platform' AND enabled")).rows[0];if(!account?.api_key)throw Error('Platform account unavailable');
 const api=async(path,options={})=>{const r=await fetch('https://api.apify.com/v2/'+path,{...options,headers:{Authorization:'Bearer '+account.api_key,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Apify HTTP '+r.status);return r.json();};
 let d=(await db.query('SELECT * FROM apify_diagnostic_runs WHERE reference=$1',[reference])).rows[0];
 if(process.argv[2]==='start'){
  if(d){console.log(JSON.stringify({existing:true,status:d.status,run_id:d.run_id}));return;}
  const row=(await db.query('SELECT c.*,p.basic FROM cleaned_leads c JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE c.org_id=$1 AND c.id=$2',[org,leadId])).rows[0];
  const previous=(await db.query('SELECT evidence FROM enrichment_linkedin WHERE org_id=$1 AND lead_id=$2',[org,leadId])).rows[0]?.evidence;
  const profiles=rt.research({lead:row,linkedin:previous}).linkedin.profiles;
  const profile=kind==='company'?row?.basic?.social_profiles?.map(rt.linkedin).find(u=>u?.includes('/company/')):kind==='employees'?profiles.find(p=>p.kind==='company')?.profile_url:(profiles.find(p=>p.kind==='person')||profiles.find(p=>p.kind==='company'))?.profile_url;
  if(!profile)throw Error('No corroborated profile for this stage');const s=spec(kind,profile);
  const meta=(await api('acts/'+s.actor)).data;const pricing=meta.pricingInfos?.filter(p=>new Date(p.startedAt)<=new Date()).at(-1);if(pricing?.pricingModel!=='PAY_PER_EVENT')throw Error('Unsupported actor pricing');
  const user=(await api('users/me')).data;if(user.id!==account.provider_user_id)throw Error('Provider account mismatch');
  await db.query('BEGIN');const cfg=(await db.query('SELECT * FROM enrichment_linkedin_controls WHERE id FOR UPDATE')).rows[0];const a=(await db.query('SELECT * FROM gathering_accounts WHERE id=$1 FOR UPDATE',[account.id])).rows[0];
  const linked=(await db.query("SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0)::float8 amount FROM apify_diagnostic_runs WHERE reference LIKE 'linkedin-job-%' AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL)")).rows[0].amount;
  const usage=(await db.query("SELECT gathering_account_spent($1)::float8 spent,coalesce(sum(max_cost_usd),0)::float8 reserved FROM scraping_jobs WHERE provider_account_id=$1 AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL))",[account.id])).rows[0];
  if(linked+cap>Number(cfg.monthly_cap_usd)||usage.spent+usage.reserved+cap>Number(a.monthly_budget_usd))throw Error('Budget unavailable');
  await db.query('INSERT INTO apify_diagnostic_runs(reference,provider_account_id,actor_id,input,max_cost_usd) VALUES($1,$2,$3,$4,$5)',[reference,account.id,s.actor,s.input,cap]);await db.query('COMMIT');
  const run=(await api('acts/'+s.actor+'/runs?timeout=180&maxTotalChargeUsd='+cap,{method:'POST',body:JSON.stringify(s.input)})).data;
  await db.query('UPDATE apify_diagnostic_runs SET run_id=$2,dataset_id=$3,status=$4 WHERE reference=$1',[reference,run.id,run.defaultDatasetId,run.status]);console.log(JSON.stringify({run_id:run.id,status:run.status,cap_usd:cap}));
 }else if(process.argv[2]==='status'){
  if(!d?.run_id)throw Error('No saved run ID; reconcile before any restart');const run=(await api('actor-runs/'+d.run_id)).data;
  if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status)){console.log(JSON.stringify({status:run.status}));return;}
  if(!Number.isFinite(run.usageTotalUsd))throw Error('Missing provider cost');await db.query('UPDATE apify_diagnostic_runs SET status=$2,actual_cost_usd=$3,finished_at=now() WHERE reference=$1',[reference,run.status,run.usageTotalUsd]);
  if(run.status!=='SUCCEEDED'){console.log(JSON.stringify({status:run.status,cost_usd:run.usageTotalUsd}));return;}
  const rows=await api('datasets/'+d.dataset_id+'/items?clean=true&limit=5');const previous=(await db.query('SELECT evidence FROM enrichment_linkedin WHERE org_id=$1 AND lead_id=$2',[org,leadId])).rows[0]?.evidence;const evidence=mapRows({kind,org_id:org,lead_id:leadId,actor:d.actor_id,target:d.input.targetUrls?.[0]||d.input.companies?.[0]},rows,previous);
  const lead=(await db.query('SELECT company_name,website FROM cleaned_leads WHERE org_id=$1 AND id=$2',[org,leadId])).rows[0];const matched=rt.research({lead,linkedin:evidence}).linkedin.profiles;
  if(matched.length)await db.query("SELECT enrichment_submit($1,'linkedin')",[{org_id:org,lead_id:leadId,profiles:matched}]);
  fs.writeFileSync('/home/node/.n8n/enrichment-stage/linkedin-canary-'+kind+'-result.json',JSON.stringify({run_id:run.id,cost_usd:run.usageTotalUsd,rows,evidence},null,2),{mode:0o600});console.log(JSON.stringify({status:run.status,cost_usd:run.usageTotalUsd,returned:rows.length,matched:matched.length,posts:matched.reduce((n,p)=>n+p.posts.length,0)}));
 }else throw Error('Use start or status');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
