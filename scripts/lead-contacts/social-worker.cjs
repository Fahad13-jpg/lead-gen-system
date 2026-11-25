'use strict';
const rt=require('./runtime.cjs');
async function provider(key,path,options={}){const r=await fetch('https://api.apify.com/v2/'+path,{...options,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('provider_http_'+r.status);return r.json();}
function interpret(job,row){
 const identity=rt.matchFacebook({...job,facebook_profile:job.profile},row||{});
 const candidates=[];const e=rt.email(row?.email);if(e)candidates.push(rt.qualify({email:e,score:80,method:'published_facebook',source_url:job.profile,identity_match:identity.matched,identity_evidence:identity.evidence,evidence:'Public business page contact field'},job));
 return {quality_flags:rt.businessQuality(job,[],identity.matched?{phone:row.phone,source_url:job.profile}:null),candidates,identity,source_url:job.profile,observed_at:new Date().toISOString(),business_details:identity.matched?{name:row.title||null,address:row.address||null,phone:row.phone||null,websites:row.websites||[],source:'matched_facebook_page'}:null,outcome:candidates.some(c=>c.relevance_status==='eligible')?'relevant_candidate_found':candidates.length?'identity_review_required':'no_public_contact_found'};
}
async function saveResult(db,job,result){
 await db.query('BEGIN');
 try{
  const fresh=(await db.query(`SELECT *,contact_eligible(org_id,lead_id,staging_id) AND input_fingerprint=contact_input_fingerprint(org_id,lead_id,staging_id) AS eligible FROM contact_social_jobs WHERE id=$1 FOR UPDATE`,[job.id])).rows[0];
  if(!fresh.eligible){await db.query("UPDATE contact_social_jobs SET status='superseded',finished_at=now(),result=$2 WHERE id=$1",[job.id,result]);await db.query('COMMIT');return;}
  for(const c of result.candidates){
   const suppressed=(await db.query('SELECT 1 FROM unsubscribes WHERE lower(trim(email))=$1',[c.email])).rowCount;if(suppressed){c.relevance_status='excluded';c.relevance_reasons.push('suppressed');}
   await db.query(`INSERT INTO lead_contacts(org_id,lead_id,email,score,method,evidence,status,relevance_status) VALUES($1,$2,$3,$4,'published_facebook',$5,$6,$7)
    ON CONFLICT(org_id,lead_id,email) DO UPDATE SET evidence=CASE WHEN lead_contacts.evidence @> excluded.evidence THEN lead_contacts.evidence ELSE lead_contacts.evidence||excluded.evidence END,
    relevance_status=excluded.relevance_status,score=greatest(lead_contacts.score,excluded.score),status=CASE WHEN excluded.relevance_status<>'eligible' THEN 'review' WHEN lead_contacts.status='review' THEN 'pending' ELSE lead_contacts.status END`,
    [job.org_id,job.lead_id,c.email,c.score,JSON.stringify([c]),c.relevance_status==='eligible'?'pending':'review',c.relevance_status]);
  }
  await db.query("UPDATE contact_social_jobs SET status='completed',result=$2,finished_at=now() WHERE id=$1",[job.id,result]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
async function advance(db,api=provider){
 const locked=(await db.query('SELECT pg_try_advisory_lock(49302812) AS locked')).rows[0].locked;if(!locked)return {busy:true};
 try{
  const cfg=(await db.query('SELECT discovery_enabled,staging_ids FROM contact_controls WHERE id')).rows[0];if(!cfg.discovery_enabled)return {paused:true};
  await db.query("UPDATE contact_social_jobs SET status='needs_review',reason='start_outcome_uncertain' WHERE status='starting' AND created_at<now()-interval '5 minutes'");
  // Round robin organizations; prioritize finishing already-paid operations.
  const jobs=(await db.query(`SELECT j.*,c.company_name,c.website,c.phone,c.category,a.api_key,row_number() OVER(PARTITION BY j.org_id ORDER BY (j.status='running') DESC,j.created_at,j.id) AS org_turn FROM contact_social_jobs j JOIN cleaned_leads c ON c.id=j.lead_id AND c.org_id=j.org_id
   LEFT JOIN gathering_accounts a ON a.id=j.account_id WHERE j.status IN ('pending','budget_blocked','disabled','running') AND ($1::int[] IS NULL OR j.staging_id=ANY($1))
   ORDER BY (j.status='running') DESC,org_turn,j.created_at,j.id LIMIT 20`,[cfg.staging_ids])).rows;
  let processed=0;const orgs=new Set();
  for(const job of jobs){if(processed>=3)break;if(orgs.has(job.org_id)&&job.status!=='running')continue;orgs.add(job.org_id);
   if(job.status!=='running'){
    const eligible=(await db.query('SELECT contact_eligible($1,$2,$3) AND contact_input_fingerprint($1,$2,$3)=$4 AS ok',[job.org_id,job.lead_id,job.staging_id,job.input_fingerprint])).rows[0].ok;
    if(!eligible){await db.query("UPDATE contact_social_jobs SET status='superseded',actual_cost_usd=0,finished_at=now() WHERE id=$1",[job.id]);continue;}
    const cached=(await db.query('SELECT result,checked_at FROM contact_social_cache WHERE org_id=$1 AND profile=$2 AND expires_at>now()',[job.org_id,job.profile])).rows[0];
    if(cached){await db.query('UPDATE contact_social_jobs SET actual_cost_usd=0 WHERE id=$1',[job.id]);await saveResult(db,job,{...interpret(job,cached.result),observed_at:cached.checked_at,cache_hit:true});processed++;continue;}
    const reserved=(await db.query('SELECT contact_social_reserve($1) AS value',[job.id])).rows[0].value;
    if(!reserved.ready)continue;
    try{
     const run=(await api(reserved.api_key,'acts/apify~facebook-page-contact-information/runs?timeout=180&maxTotalChargeUsd=0.05',{method:'POST',body:JSON.stringify({pages:[job.profile],language:'en-US'})})).data;
     if(!run?.id||!run.defaultDatasetId)throw Error('missing_run_identity');
     await db.query("UPDATE contact_social_jobs SET run_id=$2,dataset_id=$3,status='running' WHERE id=$1",[job.id,run.id,run.defaultDatasetId]);
    }catch{await db.query("UPDATE contact_social_jobs SET status='needs_review',reason='start_outcome_uncertain' WHERE id=$1",[job.id]);}
    processed++;continue;
   }
   try{
    const run=(await api(job.api_key,'actor-runs/'+encodeURIComponent(job.run_id))).data;
    if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status))continue;
    if(typeof run.usageTotalUsd!=='number')continue;
    await db.query('SELECT contact_social_settle($1,$2)',[job.id,run.usageTotalUsd]);
    if(run.status!=='SUCCEEDED'){await db.query("UPDATE contact_social_jobs SET status='failed',reason=$2,finished_at=now() WHERE id=$1",[job.id,'provider_'+run.status]);processed++;continue;}
    const items=await api(job.api_key,'datasets/'+encodeURIComponent(job.dataset_id)+'/items?clean=true&limit=5');
    const row=items.find(r=>rt.facebookProfile(r.facebookUrl||r.pageUrl)===rt.facebookProfile(job.profile));
    if(!row){await db.query("UPDATE contact_social_jobs SET status='failed',reason='missing_input_identity',finished_at=now() WHERE id=$1",[job.id]);processed++;continue;}
    await db.query(`INSERT INTO contact_social_cache(org_id,profile,result,expires_at) VALUES($1,$2,$3,now()+CASE WHEN $4 THEN interval '7 days' ELSE interval '1 day' END)
     ON CONFLICT(org_id,profile) DO UPDATE SET result=excluded.result,checked_at=now(),expires_at=excluded.expires_at`,[job.org_id,job.profile,row,Boolean(rt.email(row.email))]);
    await saveResult(db,job,{...interpret(job,row),cache_hit:false,run_id:job.run_id,provider_cost_usd:run.usageTotalUsd});processed++;
   }catch{await db.query("UPDATE contact_social_jobs SET reason='poll_retry' WHERE id=$1",[job.id]);}
  }
  return {processed};
 }finally{await db.query('SELECT pg_advisory_unlock(49302812)');}
}
async function main(){const name=process.argv[2]||process.env.DB_POSTGRESDB_DATABASE;if(!['lead_db','lead_gathering_test_20260926'].includes(name))throw Error('Unexpected database');
 const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:name});await db.connect();try{console.log(JSON.stringify(await advance(db)));}finally{await db.end();}}
if(require.main===module)main().catch(()=>{console.error('social_worker_failed');process.exitCode=1;});
module.exports={interpret,saveResult,advance};
