'use strict';
const rt=require('./runtime.cjs');
function spec(kind,target){const profile=rt.linkedin(target);if(kind==='company')return {actor:'harvestapi~linkedin-company',input:profile?{companies:[profile]}:{searches:[rt.text(target,200)]}};
 if(!profile)throw Error('Invalid LinkedIn target');
 if(kind==='employees')return {actor:'harvestapi~linkedin-company-employees',input:{companies:[profile],jobTitles:['CEO','Founder','Owner','Practice Manager'],maxItems:2,profileScraperMode:'Full ($8 per 1k)'}};
 if(kind==='person')return {actor:'harvestapi~linkedin-profile-scraper',input:{urls:[profile],profileScraperMode:'Profile details no email ($4 per 1k)'}};
 if(kind==='posts')return {actor:'harvestapi~linkedin-profile-posts',input:{targetUrls:[profile],maxPosts:5,postedLimit:'3months',includeQuotePosts:false,includeReposts:false,scrapeComments:false,scrapeReactions:false}};
 throw Error('Unknown kind');}
function mapRows(job,rows,previous={profiles:[]}){
 const profiles=new Map((previous.profiles||[]).map(p=>[p.profile_url,p])),now=new Date().toISOString();
 for(const row of rows){
  if(job.kind==='posts'){const author=rt.linkedin(row.author?.linkedinUrl?.replace(/\/posts\/?$/, ''));if(author!==rt.linkedin(job.target)||!profiles.has(author))continue;const p=profiles.get(author);const post={url:row.linkedinUrl,author_profile:author,published_at:row.postedAt?.date,text:row.content};
   try{const valid=rt.normalizeLinkedIn({org_id:job.org_id,lead_id:job.lead_id,profiles:[{...p,posts:[post]}]}).profiles[0].posts[0];p.posts=[...(p.posts||[]).filter(x=>x.url!==valid.url),valid].sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,5);}catch{}continue;}
  const profile=rt.linkedin(row.linkedinUrl);if(!profile)continue;
  if(job.kind==='company'&&!profile.includes('/company/'))continue;if(job.kind!=='company'&&!profile.includes('/in/'))continue;
  const currentRoles=(row.experience||[]).filter(e=>e.isCurrent===true||/^present$/i.test(e.endDate?.text||'')||/present/i.test(e.duration||''));
  const current=currentRoles.find(e=>{const company=rt.linkedin(e.companyLinkedinUrl);return company&&(company===rt.linkedin(job.target)||profiles.get(company)?.kind==='company');})||currentRoles[0];
  const p={profile_url:profile,name:row.name||[row.firstName,row.lastName].filter(Boolean).join(' '),website:row.website,description:job.kind==='company'?row.description:row.headline,role:current?.position,company_name:current?.companyName,company_profile:current?.companyLinkedinUrl,observed_at:now,posts:profiles.get(profile)?.posts||[]};
  try{const normalized=rt.normalizeLinkedIn({org_id:job.org_id,lead_id:job.lead_id,profiles:[p]}).profiles[0];normalized.provenance='apify:'+job.actor;profiles.set(profile,normalized);}catch{}
 }
 return {profiles:[...profiles.values()].slice(0,10)};
}
async function api(key,path,options={}){const r=await fetch('https://api.apify.com/v2/'+path,{...options,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('provider_http_'+r.status);return r.json();}
async function enqueue(db,lead,kind,target){const s=spec(kind,target);await db.query(`INSERT INTO enrichment_linkedin_jobs(org_id,lead_id,staging_id,fingerprint,kind,target,actor,input) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[lead.org_id,lead.lead_id,lead.staging_id,lead.fingerprint,kind,target,s.actor,s.input]);}
async function advance(db,call=api){
 if(!(await db.query('SELECT pg_try_advisory_lock(49302813) AS locked')).rows[0].locked)return {busy:true};
 try{
  const controls=(await db.query('SELECT enabled,lead_ids FROM enrichment_controls WHERE id')).rows[0];if(!controls.enabled)return {paused:true};
  const leads=(await db.query(`SELECT DISTINCT ON(c.id) c.org_id,c.id AS lead_id,l.staging_id,c.company_name,p.basic,enrichment_fingerprint(c.org_id,c.id,'basic') fingerprint FROM cleaned_leads c JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id JOIN enrichment_profiles p ON p.lead_id=c.id AND p.org_id=c.org_id JOIN enrichment_linkedin_policy policy ON policy.org_id=c.org_id AND policy.enabled WHERE contact_eligible(c.org_id,c.id,l.staging_id) AND p.basic IS NOT NULL AND NOT EXISTS(SELECT 1 FROM enrichment_linkedin_jobs existing WHERE existing.org_id=c.org_id AND existing.lead_id=c.id AND existing.kind='company' AND existing.fingerprint=enrichment_fingerprint(c.org_id,c.id,'basic')) AND ($1::int[] IS NULL OR c.id=ANY($1)) ORDER BY c.id LIMIT 10`,[controls.lead_ids])).rows;
  for(const lead of leads){const target=(lead.basic.social_profiles||[]).find(u=>rt.linkedin(u)?.includes('/company/'))||lead.company_name;await enqueue(db,lead,'company',target);}
  await db.query("UPDATE enrichment_linkedin_jobs SET status='needs_review',reason='start_outcome_uncertain' WHERE status='starting' AND created_at<now()-interval '5 minutes'");
  const jobs=(await db.query(`SELECT j.*,a.api_key,d.run_id,d.dataset_id,c.company_name,c.website,c.phone,c.category FROM enrichment_linkedin_jobs j JOIN cleaned_leads c ON c.id=j.lead_id AND c.org_id=j.org_id LEFT JOIN apify_diagnostic_runs d ON d.reference=j.reference LEFT JOIN gathering_accounts a ON a.id=d.provider_account_id WHERE j.status IN ('pending','disabled','budget_blocked','running') AND ($1::int[] IS NULL OR j.lead_id=ANY($1)) ORDER BY (j.status='running') DESC,j.id LIMIT 3`,[controls.lead_ids])).rows;
  let processed=0;
  for(const job of jobs){
   if(job.status!=='running'){
    const reservation=(await db.query('SELECT enrichment_linkedin_reserve($1) AS r',[job.id])).rows[0].r;if(!reservation.ready)continue;
    try{const meta=(await call(reservation.api_key,'acts/'+job.actor)).data;const price=meta.pricingInfos?.filter(p=>new Date(p.startedAt)<=new Date()).at(-1);if(price?.pricingModel!=='PAY_PER_EVENT')throw Error('unsupported_pricing');
     const run=(await call(reservation.api_key,'acts/'+job.actor+'/runs?timeout=180&maxTotalChargeUsd='+reservation.cap,{method:'POST',body:JSON.stringify(job.input)})).data;
     if(!/^[a-zA-Z0-9]+$/.test(run.id||''))throw Error('missing_run_id');
     await db.query('UPDATE apify_diagnostic_runs SET run_id=$2,dataset_id=$3,status=$4 WHERE reference=$1',[reservation.reference,run.id,run.defaultDatasetId,run.status]);await db.query("UPDATE enrichment_linkedin_jobs SET status='running' WHERE id=$1",[job.id]);processed++;
    }catch{await db.query("UPDATE enrichment_linkedin_jobs SET status='needs_review',reason='start_outcome_uncertain_or_pricing' WHERE id=$1",[job.id]);}continue;
   }
   try{const run=(await call(job.api_key,'actor-runs/'+job.run_id)).data;if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status))continue;if(!Number.isFinite(run.usageTotalUsd))throw Error('cost_missing');
    await db.query('SELECT enrichment_linkedin_settle($1,$2)',[job.id,run.usageTotalUsd]);
    if(run.status!=='SUCCEEDED'){await db.query("UPDATE enrichment_linkedin_jobs SET status='failed',reason=$2 WHERE id=$1",[job.id,run.status]);continue;}
    if(!/^[a-zA-Z0-9]+$/.test(job.dataset_id||''))throw Error('invalid_dataset');
    const rows=await call(job.api_key,'datasets/'+job.dataset_id+'/items?clean=true&limit=10');if(!Array.isArray(rows))throw Error('invalid_dataset');
    await db.query('BEGIN');const fresh=(await db.query("SELECT contact_eligible(org_id,lead_id,staging_id) AND fingerprint=enrichment_fingerprint(org_id,lead_id,'basic') AS ok FROM enrichment_linkedin_jobs WHERE id=$1 FOR UPDATE",[job.id])).rows[0].ok;
    if(!fresh){await db.query("UPDATE enrichment_linkedin_jobs SET status='superseded' WHERE id=$1",[job.id]);await db.query('COMMIT');continue;}
    const previous=(await db.query('SELECT evidence FROM enrichment_linkedin WHERE org_id=$1 AND lead_id=$2 FOR UPDATE',[job.org_id,job.lead_id])).rows[0]?.evidence;
    const evidence=mapRows(job,rows,previous);await db.query('SELECT enrichment_submit($1,\'linkedin\')',[{org_id:job.org_id,lead_id:job.lead_id,...evidence}]);
    const matched=rt.research({lead:job,linkedin:evidence}).linkedin.profiles;
    for(const p of matched){if(job.kind==='company'&&p.kind==='company'){await enqueue(db,job,'employees',p.profile_url);await enqueue(db,job,'posts',p.profile_url);}if(['person','employees'].includes(job.kind)&&p.kind==='person')await enqueue(db,job,'posts',p.profile_url);}
    await db.query("UPDATE enrichment_linkedin_jobs SET status='completed',reason=NULL WHERE id=$1",[job.id]);await db.query('COMMIT');processed++;
   }catch{await db.query('ROLLBACK');await db.query("UPDATE enrichment_linkedin_jobs SET reason='poll_or_result_retry' WHERE id=$1",[job.id]);}
  }return {processed};
 }finally{await db.query('SELECT pg_advisory_unlock(49302813)');}
}
async function main(){const name=process.argv[2]||process.env.DB_POSTGRESDB_DATABASE;if(!['lead_db','lead_gathering_test_20260926'].includes(name))throw Error('Unexpected database');const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:name});await db.connect();try{console.log(JSON.stringify(await advance(db)));}finally{await db.end();}}
if(require.main===module)main().catch(()=>{console.error('linkedin_worker_failed');process.exitCode=1});module.exports={spec,mapRows,advance};
