'use strict';
// Pure functions: embedded in n8n Code nodes by build.cjs and exercised offline.
function enrichmentRuntime(){
 const text=(v,n=2000)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):null;
 const url=v=>{if(typeof v!=='string')return null;const m=v.trim().match(/^(https?):\/\/([a-z0-9.-]+)(\/[^\s?#]*)?(?:\?[^\s#]*)?(?:#[^\s]*)?$/i);if(!m||!m[2].includes('.'))return null;return {hostname:m[2].toLowerCase(),pathname:m[3]||'/',origin:m[1].toLowerCase()+'://'+m[2].toLowerCase(),href:v.trim()};};
 const domain=v=>url(typeof v==='string'&&!/^https?:/i.test(v)?'https://'+v:v)?.hostname.toLowerCase().replace(/^www\./,'')||null;
 const linkedin=v=>{const u=url(v);if(!u||!['linkedin.com','www.linkedin.com'].includes(u.hostname))return null;const m=u.pathname.match(/^\/(company|in)\/([a-zA-Z0-9%_-]+)\/?$/);return m?'https://www.linkedin.com/'+m[1]+'/'+m[2].toLowerCase():null;};
 const tokens=v=>(text(v)||'').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(x=>!['the','and','inc','llc','ltd','pvt','private','limited','corporation','corp','company'].includes(x))||[];
 const nameMatch=(a,b)=>{const x=tokens(a),y=new Set(tokens(b));return x.length>0&&x.filter(t=>y.has(t)).length/x.length>=0.6;};
 function normalizeLinkedIn(input){
  if(!input||!Number.isSafeInteger(input.org_id)||input.org_id<1||!Number.isSafeInteger(input.lead_id)||input.lead_id<1)throw Error('INVALID_ID');
  const profiles=(input.profiles||[]);if(!Array.isArray(profiles)||profiles.length>10)throw Error('PROFILE_LIMIT');
  return {org_id:input.org_id,lead_id:input.lead_id,profiles:profiles.map(p=>{
   const profile_url=linkedin(p.profile_url);if(!profile_url)throw Error('INVALID_LINKEDIN_PROFILE');
   const observed=new Date(p.observed_at);if(!Number.isFinite(+observed)||observed>Date.now()+300000)throw Error('INVALID_OBSERVATION_DATE');
   if(!Array.isArray(p.posts||[])||(p.posts||[]).length>10)throw Error('POST_LIMIT');
   return {profile_url,kind:profile_url.includes('/company/')?'company':'person',name:text(p.name,200),role:text(p.role,120),company_name:text(p.company_name,200),company_profile:linkedin(p.company_profile),website:url(typeof p.website==='string'&&!/^https?:/i.test(p.website)?'https://'+p.website:p.website)?.href||null,description:text(p.description,3000),observed_at:observed.toISOString(),provenance:'submitted_evidence',posts:(p.posts||[]).map(post=>{
    const u=url(post.url),date=new Date(post.published_at);if(!u||!['www.linkedin.com','linkedin.com'].includes(u.hostname)||!/^\/(posts\/|feed\/update\/urn:li:activity:)/.test(u.pathname)||!Number.isFinite(+date)||date>Date.now()+300000||linkedin(post.author_profile)!==profile_url)throw Error('INVALID_POST');
    return {url:u.origin+u.pathname,author_profile:profile_url,published_at:date.toISOString(),text:text(post.text,4000)};
   })};
  })};
 }
 function research(task,now=Date.now()){
  const lead=task.lead,basic=task.basic||{},sources=task.linkedin?.profiles||[],fresh=p=>now-Date.parse(p.observed_at)<=30*86400000;
  const companies=sources.filter(p=>p.kind==='company'&&fresh(p)&&domain(p.website)&&domain(p.website)===domain(lead.website)&&nameMatch(lead.company_name,p.name));
  const accepted=new Set(companies.map(p=>p.profile_url));
  const people=sources.filter(p=>p.kind==='person'&&fresh(p)&&accepted.has(p.company_profile)&&nameMatch(lead.company_name,p.company_name)&&/\b(ceo|chief executive|founder|owner|director|manager)\b/i.test(p.role||''));
  const matched=[...companies,...people],recent_posts=[],opportunities=[];
  for(const p of matched)for(const post of p.posts||[]){if(now-Date.parse(post.published_at)>90*86400000||Date.parse(post.published_at)>now)continue;
   const topics=[['expansion',/\b(new (branch|office|location|clinic)|opening|expansion)\b/i],['hiring',/\b(hiring|recruiting|join our team)\b/i],['service_launch',/\b(introducing|launching|new service)\b/i],['business_event',/\b(conference|webinar|workshop)\b/i],['technology',/\b(software|artificial intelligence|data engineering|automation|AI)\b/i],['customer_experience',/\b(customer experience|patient experience|appointments?|online booking)\b/i]].filter(([,re])=>re.test(post.text||'')).map(([label])=>label);
   recent_posts.push({...post,author_kind:p.kind,author_name:p.name,topics,provenance:p.provenance,identity_status:'corroborated_from_submitted_evidence',requires_review:true});
  }
  const campaign=task.campaign;
  const fit=campaign?{industry_match:!!campaign.target_terms?.some(t=>(lead.category||'').toLowerCase().includes(t.toLowerCase())),location_match:!campaign.locations?.length||campaign.locations.some(t=>(lead.city||'').toLowerCase()===t.toLowerCase()),excluded:!!campaign.exclude_terms?.some(t=>[lead.company_name,lead.category].join(' ').toLowerCase().includes(t.toLowerCase())),basis:'configured_rules',offer:campaign.offer}:null;
  if(campaign&&basic.observations?.booking_link==='not_observed'&&/book|appointment|website/i.test(campaign.offer||''))opportunities.push({type:'hypothesis',text:'A booking demonstration may be relevant; no booking link was observed on the checked pages.',evidence_ids:basic.pages?.map(p=>p.url)||[],requires_review:true});
  const personalization=recent_posts.filter(p=>p.topics.length).slice(0,3).map(p=>({source_url:p.url,author_profile:p.author_profile,author_kind:p.author_kind,published_at:p.published_at,excerpt:p.text?.slice(0,600),topics:p.topics,usage:'draft_only',requires_review:true}));
  return {version:'enrichment_v1',status:basic.status==='complete'?'complete':'partial',summary:[lead.company_name,lead.category,lead.city].filter(Boolean).join(' — '),summary_method:'saved_business_facts',services:basic.services||[],linkedin:{collection_status:task.linkedin?'supplied_evidence':'not_configured',profiles:matched,unmatched_profiles:sources.filter(p=>!matched.includes(p)).map(p=>({profile_url:p.profile_url,reason:fresh(p)?'identity_unconfirmed':'stale_evidence'})),recent_posts},campaign_fit:fit,opportunities,personalization,readiness:{research:basic.status||'partial',campaign:campaign?'configured':'configuration_needed',email:'use_contact_verification_status',outreach:'not_authorized'},observed_at:new Date(now).toISOString()};
 }
 function normalizeCampaign(input){if(!Number.isSafeInteger(input?.org_id)||input.org_id<1||!Number.isSafeInteger(input?.lead_id)||input.lead_id<1)throw Error('INVALID_ID');const c=input.config;if(!c||!text(c.offer,1000))throw Error('OFFER_REQUIRED');const config={offer:text(c.offer,1000)};for(const k of ['target_terms','locations','exclude_terms']){if(!Array.isArray(c[k]||[])||(c[k]||[]).length>30)throw Error('INVALID_CAMPAIGN');config[k]=(c[k]||[]).map(v=>text(v,120)).filter(Boolean);}return {org_id:input.org_id,lead_id:input.lead_id,config};}
 return {text,url,domain,linkedin,normalizeLinkedIn,normalizeCampaign,research};
}
module.exports=enrichmentRuntime();module.exports.enrichmentRuntime=enrichmentRuntime;
