'use strict';
const rt=require('./runtime.cjs');
const aiResearch=require('./ai-research.cjs');
const observed=require('./observations.cjs');
const signalSheet=require('./signals.cjs');
const contactPath=require('fs').existsSync(__dirname+'/../contact-stage/worker.cjs')?'../contact-stage/':'../lead-contacts/';
const contact=require(contactPath+'worker.cjs'),contacts=require(contactPath+'runtime.cjs');
async function basic(task,fetchPage=contact.publicPage){
 const lead=task.lead,observations={contact_form:'unknown',booking_link:'unknown',whatsapp:'unknown'},pages=[],evidence=[],technologies=new Set(),social=new Set();
 const result={version:'enrichment_v1',status:'partial',business:{name:lead.company_name,category:lead.category,city:lead.city,country:lead.country,website:lead.website,domain:rt.domain(lead.website),timezone:null},observations,pages,evidence,services:[],quality_flags:contacts.businessQuality(lead),observed_at:new Date().toISOString()};
 const finish=()=>{result.signals=signalSheet.build(result,task.source_checks||[]);return result;};
 if(!lead.website){result.reason='no_website';return finish();}
 let root;try{root=contacts.target(/^https?:/i.test(lead.website)?lead.website:'https://'+lead.website);}catch{result.reason='blocked_target';return finish();}
 if(/^(?:www\.)?(?:facebook|instagram)\.com$/i.test(root.hostname)){result.reason='social_profile_only';result.evidence.push({type:'social',value:root.href,source_url:root.href,method:'cleaned_website_field',observed_at:result.observed_at});return finish();}
 const queue=[root.href],seen=new Set(),deadline=Date.now()+45000,host=root.hostname.replace(/^www\./,'');
 while(queue.length&&pages.length<3&&Date.now()<deadline){const u=queue.shift(),key=contacts.pageKey(u);if(seen.has(key))continue;seen.add(key);
  try{const p=await fetchPage(u,host,deadline);const usable=p.status===200&&/text\/html/i.test(p.headers['content-type']||'');const details=signalSheet.inspect(p.body||'',p.url,new Date(result.observed_at).getUTCFullYear(),lead.category);pages.push({url:p.url,requested_url:u,final_url:p.url,status:p.status,content_type:p.headers['content-type']||null,html_bytes:Buffer.byteLength(p.body||''),text_bytes:usable?details.text_bytes:0,truncated:!!p.truncated,usable_html:usable,error_class:usable?null:[401,403,429].includes(p.status)?'blocked':p.status!==200?'http_error':'non_html',quality_flags:usable?details.flags:{}});if(!usable)continue;
   const html=p.body;for(const name of Object.keys(observations))if(observations[name]==='unknown')observations[name]='not_observed';
   for(const r of contacts.contactRoutes(html,p.url)){if(r.type==='contact_form')observations.contact_form='observed';if(r.type==='whatsapp')observations.whatsapp='observed';if(r.type==='social')social.add(r.value);evidence.push({...r,observed_at:result.observed_at});}
   for(const form of observed.appointmentForms(html,p.url)){observations.contact_form='observed';if(!evidence.some(e=>e.type==='contact_form'&&e.source_url===p.url))evidence.push(form);}
   for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const target=observed.bookingTarget(m[1],m[2],p.url);if(target){try{const v=contacts.target(target);observations.booking_link='observed';if(!evidence.some(e=>e.type==='booking_link'&&e.value===v.href&&e.source_url===p.url))evidence.push({type:'booking_link',value:v.href,source_url:p.url,submission_tested:false});}catch{}}}
   const description=html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1];if(description&&!result.website_description){result.website_description=rt.text(description,500);evidence.push({type:'website_description',value:result.website_description,source_url:p.url});}
   for(const [name,re] of [['WordPress',/wp-content\//i],['Shopify',/cdn\.shopify\.com/i]])if(re.test(html)){technologies.add(name);evidence.push({type:'technology_marker',value:name,source_url:p.url});}
   for(const m of html.matchAll(/<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/gi)){const heading=observed.serviceHeading(m[1],lead);if(heading&&result.services.length<20&&!result.services.some(s=>s.text.toLowerCase()===heading.toLowerCase()))result.services.push({text:heading,source_url:p.url,method:'industry_matched_page_heading',requires_review:true});}
   for(const link of contacts.links(html,p.url))if(!/\.(css|js|png|jpe?g|svg|webp|gif|ico|woff2?|pdf)$/i.test(new URL(link).pathname)&&!seen.has(contacts.pageKey(link)))queue.push(link);
  }catch(e){pages.push({url:u,requested_url:u,final_url:null,status:null,content_type:null,html_bytes:0,text_bytes:0,truncated:false,usable_html:false,error:e.code||'website_unavailable',error_class:e.code||'website_unavailable'});}
 }
 result.technologies=[...technologies];result.social_profiles=[...social];result.status=pages.some(p=>p.usable_html)&&pages.every(p=>p.usable_html&&!p.truncated)?'complete':'partial';
 if(!pages.some(p=>p.usable_html)&&pages.some(observed.temporaryFailure)){result.status='failed';result.reason='temporary_source_failure';result.retryable=true;}
 const failure=observed.sourceFailure(pages);if(failure){result.failure_class=failure;if(!result.reason)result.reason='source_'+failure;}
 result.coverage='up_to_three_pages';result.quality_flags=contacts.businessQuality(lead,evidence);return finish();
}
async function main(){const [id,lease,database]=process.argv.slice(2);if(!/^\d+$/.test(id||'')||!/^[a-f0-9]{32}$/.test(lease||''))throw Error('Invalid worker arguments');
 const name=database||process.env.DB_POSTGRESDB_DATABASE;if(!['lead_db','lead_gathering_test_20260926'].includes(name))throw Error('Unexpected database');
 const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:name});await db.connect();
 try{const t=(await db.query('SELECT enrichment_task_input($1,$2) AS input',[id,lease])).rows[0]?.input;if(!t){console.log(JSON.stringify({id,lease,status:'superseded'}));return;}
  let result;if(process.env.ENRICHMENT_FIXTURE){if(name!=='lead_gathering_test_20260926')throw Error('Fixture forbidden');result=JSON.parse(require('fs').readFileSync(process.env.ENRICHMENT_FIXTURE))[t.kind];}else result=t.kind==='basic'?await basic(t):rt.research(t);
  if(t.kind==='research'&&!process.env.ENRICHMENT_FIXTURE){
   // Database quota is the opt-in. An environment flag alone cannot enable scheduled usage.
   const evidence=aiResearch.evidenceFor(t,result);
   const ready=!!process.env.GROQ_API_KEY&&evidence.length>0;
   const reserved=ready&&(await db.query('SELECT enrichment_ai_reserve($1,$2) AS allowed',[id,lease])).rows[0]?.allowed;
   result.ai_research=await aiResearch.analyze(t,result,{enabled:!!reserved});
   if(!reserved)result.ai_research.status=!evidence.length?'insufficient_evidence':!process.env.GROQ_API_KEY?'not_configured':'disabled_or_quota_blocked';
   if(reserved)await db.query('UPDATE enrichment_ai_requests SET finished_at=now(),status=$2,usage=$3::jsonb WHERE lease=$1',[lease,result.ai_research.status,JSON.stringify(result.ai_research.usage||{})]);
  }
  console.log(JSON.stringify({id,lease,result,status:result.status}));
 }finally{await db.end();}
}
if(require.main===module)main().catch(()=>{console.error('enrichment_worker_failed');process.exitCode=1;});
module.exports={basic};
