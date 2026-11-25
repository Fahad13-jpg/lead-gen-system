'use strict';
const fs=require('node:fs'),http=require('node:http'),https=require('node:https'),dns=require('node:dns').promises;
const rt=require('./runtime.cjs');
function request(url,options={}){return new Promise((resolve,reject)=>{
 const u=new URL(url),limit=options.maxBytes||524288;let settled=false,timer;
 const req=(u.protocol==='https:'?https:http).request(u,{method:'GET',agent:false,...options,headers:{'User-Agent':'LeadDiscovery/1.0','Accept':'text/html,application/json;q=0.9',...options.headers}},res=>{
  const chunks=[];let bytes=0;
  const finish=truncated=>{if(settled)return;settled=true;clearTimeout(timer);resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),truncated,bytes});};
  res.on('data',part=>{if(settled)return;const available=limit-bytes;chunks.push(part.subarray(0,available));bytes+=Math.min(part.length,available);if(part.length>available){if(options.allowPartial){finish(true);res.destroy();req.destroy();}else req.destroy(Object.assign(Error('response_too_large'),{code:'response_too_large'}));}});
  res.on('error',e=>{if(!settled){settled=true;clearTimeout(timer);reject(e);}});res.on('end',()=>finish(false));
 });timer=setTimeout(()=>req.destroy(Object.assign(Error('timeout'),{code:'timeout'})),Math.max(1,Math.min(10000,(options.deadline||Infinity)-Date.now())));req.on('error',e=>{clearTimeout(timer);if(!settled){settled=true;reject(e);}});req.end();
});}
async function publicPage(value,originHost,deadline=Date.now()+55000){let url=rt.target(value);for(let n=0;n<4;n++){
 if(Date.now()>=deadline)throw Object.assign(Error('timeout'),{code:'timeout'});
 if(originHost&&url.hostname.replace(/^www\./,'')!==originHost)throw Object.assign(Error('cross_domain_redirect'),{code:'blocked_target'});
 let timer;const addresses=await Promise.race([dns.resolve4(url.hostname),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('dns_timeout'),{code:'dns_timeout'})),Math.max(1,Math.min(5000,deadline-Date.now())));})]).finally(()=>clearTimeout(timer));
 if(!addresses.length||addresses.some(ip=>!rt.publicIPv4(ip)))throw Object.assign(Error('blocked_target'),{code:'blocked_target'});
 const address=addresses[0];const r=await request(url,{deadline,maxBytes:2097152,allowPartial:true,lookup:(_host,opts,cb)=>opts.all?cb(null,[{address,family:4}]):cb(null,address,4)});
 if([301,302,303,307,308].includes(r.status)&&r.headers.location){url=rt.target(new URL(r.headers.location,url).href);continue;}
 return {...r,url:url.href};
 }throw Object.assign(Error('redirect_limit'),{code:'redirect_limit'});}
async function discover(task,fetchPage=publicPage){
 let root;try{root=rt.target(/^https?:\/\//i.test(task.source_value)?task.source_value:'https://'+task.source_value);}catch{return {status:'blocked',error:'blocked_target'};}
 const pending=[root.href],seen=new Set(),contacts=new Map(),routes=new Map(),pages=[],errors=[];const deadline=Date.now()+55000;const host=root.hostname.replace(/^www\./,'');let attempted=0;
 while(pending.length&&attempted<5&&Date.now()<deadline){const url=pending.shift(),key=rt.pageKey(url);if(seen.has(key))continue;seen.add(key);attempted++;
  try{const r=await fetchPage(url,host,deadline);pages.push({url:r.url,status:r.status,truncated:Boolean(r.truncated),bytes:r.bytes||0});const finalKey=rt.pageKey(r.url);if(finalKey!==key&&seen.has(finalKey))continue;seen.add(finalKey);
   if(r.status===429||r.status>=500){errors.push('website_unavailable');continue;}
   if(r.status===401||r.status===403){errors.push('website_blocked');continue;}
   if(r.status!==200||!/text\/html/i.test(r.headers['content-type']||''))continue;
   for(const c of rt.extract(r.body,r.url)){if(!contacts.has(c.email)||contacts.get(c.email).score<c.score)contacts.set(c.email,c);}
   for(const route of rt.contactRoutes(r.body,r.url))routes.set(route.type+':'+route.value,route);
   for(const link of rt.links(r.body,r.url))if(!seen.has(rt.pageKey(link))&&!pending.some(p=>rt.pageKey(p)===rt.pageKey(link)))pending.push(link);
  }catch(e){errors.push(['blocked_target','response_too_large','redirect_limit'].includes(e.code)?e.code:'website_unavailable');}
 }
 const candidates=[...contacts.values()].sort((a,b)=>b.score-a.score).slice(0,20);
 const remaining=pending.filter(p=>!seen.has(rt.pageKey(p))).length;
 const partial=pages.some(p=>p.truncated);
 const stop_reason=Date.now()>=deadline?'time_budget_reached':remaining?'page_budget_reached':partial?'partial_page_content':'relevant_pages_exhausted';
 const evidence={partial_content:partial,pages,errors,contact_routes:[...routes.values()].slice(0,20),stop_reason,pages_attempted:attempted,remaining_pages:remaining};
 if(candidates.length)return {status:'found',candidates,...evidence};
 if(errors.includes('blocked_target')||errors.includes('website_blocked'))return {status:'blocked',error:errors.find(e=>['blocked_target','website_blocked'].includes(e)),...evidence};
 if(errors.length||stop_reason==='time_budget_reached')return {status:'retry',error:errors[0]||'website_timeout',...evidence};
 return {status:'not_found',...evidence};
}
async function verify(task,call=request){if(!rt.email(task.source_value))return {status:'invalid',evidence:{format:false}};
 if(!process.env.ABSTRACT_EMAIL_API_KEY)return {status:'retry',error:'provider_auth',pause:true};
 const u=new URL('https://emailvalidation.abstractapi.com/v1/');u.searchParams.set('api_key',process.env.ABSTRACT_EMAIL_API_KEY);u.searchParams.set('email',task.source_value);
 try{const r=await call(u);let body;try{body=JSON.parse(r.body);}catch{return {status:'retry',error:'provider_schema',pause:true};}return rt.verification(r.status,body);}catch{return {status:'retry',error:'provider_unavailable'};}
}
async function resolveContacts(task,{crawl=discover,readCache=async()=>null,writeCache=async()=>{}}={}){
 const record=rt.sourceContacts(task.record),strategy='contact_evidence_v2';
 const lead={...task.record,website:task.website};record.candidates=record.candidates.map(c=>rt.qualify(c,lead));
 const finish=(value)=>{
  const map=new Map();for(const c of [...record.candidates,...(value.candidates||[])].map(c=>rt.qualify(c,lead)))if(!map.has(c.email)||map.get(c.email).score<c.score)map.set(c.email,c);
  const candidates=[...map.values()].filter(c=>!(task.record?.invalid_emails||[]).includes(c.email)).sort((a,b)=>b.score-a.score).slice(0,20);
  const routes=new Map();for(const r of [...record.contact_routes,...(value.contact_routes||[])])routes.set(r.type+':'+r.value,r);
  const eligible=candidates.filter(c=>c.relevance_status==='eligible');const profile=[...routes.values()].map(r=>rt.facebookProfile(r.value)).find(Boolean)||null;
  return {...value,status:value.status==='retry'&&!eligible.length?'retry':candidates.length?'found':value.status==='found'?'not_found':value.status,candidates,contact_routes:[...routes.values()].slice(0,20),strategy,
   relevant_candidate_count:eligible.length,facebook_profile:eligible.length?null:profile,
   discovery_outcome:eligible.length?'relevant_candidate_found':value.status==='retry'?'retry_pending':candidates.length?'identity_review_required':routes.size?'alternative_route_only':'no_public_contact_found',
   quality_flags:rt.businessQuality(lead,[...routes.values()]),
   business_context:{company_name:task.record?.company_name||null,website:task.website||null,category:task.record?.category||null,city:task.record?.city||null,phone:task.record?.phone||null,source:'cleaned_record',inferred:false}};
 };
 if(record.candidates.some(c=>c.relevance_status==='eligible'))return finish({status:'found',stop_reason:'saved_business_contacts_found',pages:[],pages_attempted:0,cache_hit:false});
 if(!task.website)return finish({status:'not_found',stop_reason:'no_website_or_saved_email',pages:[],pages_attempted:0,cache_hit:false});
 let key;try{key=rt.target(/^https?:\/\//i.test(task.website)?task.website:'https://'+task.website).href;}catch{return finish({status:'blocked',error:'blocked_target',stop_reason:'invalid_website',pages:[],pages_attempted:0,cache_hit:false});}
 let result=await readCache(key),cache_hit=Boolean(result);
 if(!result){result=await crawl({...task,source_value:key});if(['found','not_found'].includes(result.status))await writeCache(key,result);}
 return finish({...result,cache_hit,network_pages_this_attempt:cache_hit?0:result.pages_attempted||0});
}
async function main(){const [id,lease,database]=process.argv.slice(2);if(!/^\d+$/.test(id||'')||! /^[a-f0-9]{32}$/.test(lease||''))throw Error('invalid_worker_arguments');
 const dbName=database||process.env.DB_POSTGRESDB_DATABASE;if(!['lead_db','lead_gathering_test_20260926'].includes(dbName))throw Error('unexpected_database');
 const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));const db=new Client({host:process.env.DB_POSTGRESDB_HOST,port:Number(process.env.DB_POSTGRESDB_PORT||5432),user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:dbName});await db.connect();
 try{const r=await db.query("SELECT * FROM contact_tasks WHERE id=$1 AND lease=$2 AND status='processing' AND lease_until>now() AND contact_eligible(org_id,lead_id,staging_id)",[id,lease]);if(!r.rows.length){console.log(JSON.stringify({id,lease,status:'superseded'}));return;}
  const task=r.rows[0];let result;
  if(process.env.CONTACT_TEST_FIXTURE){if(dbName!=='lead_gathering_test_20260926')throw Error('test_fixture_forbidden_in_production');const fixture=JSON.parse(fs.readFileSync(process.env.CONTACT_TEST_FIXTURE));result=fixture[String(task.id)];if(!result)throw Error('test_fixture_missing');}
  else if(task.kind==='discovery'){
   const context=await db.query(`SELECT c.website,jsonb_build_object('staging_id',s.id,'company_name',c.company_name,'category',c.category,'city',c.city,'email',c.email,'phone',c.phone,'raw_data',s.raw_data,'source_url',s.raw_data->>'url',
    'invalid_emails',coalesce((SELECT jsonb_agg(email) FROM lead_contacts WHERE org_id=t.org_id AND lead_id=t.lead_id AND status='invalid' AND expires_at>now()),'[]'::jsonb)||CASE WHEN c.email_verification_status='invalid' THEN jsonb_build_array(lower(trim(c.email))) ELSE '[]'::jsonb END) AS record
    FROM contact_tasks t JOIN cleaned_leads c ON c.id=t.lead_id AND c.org_id=t.org_id JOIN staging_leads s ON s.id=t.staging_id AND s.org_id=t.org_id WHERE t.id=$1`,[id]);
   if(!context.rows.length)result={status:'superseded'};
   else result=await resolveContacts({...task,...context.rows[0]}, {
    readCache:async key=>{const c=await db.query('SELECT result FROM contact_discovery_cache WHERE org_id=$1 AND website=$2 AND expires_at>now()',[task.org_id,key]);return c.rows[0]?.result;},
    writeCache:async(key,value)=>{await db.query(`INSERT INTO contact_discovery_cache(org_id,website,result,expires_at) VALUES($1,$2,$3,now()+CASE WHEN $4 THEN interval '7 days' ELSE interval '1 day' END)
      ON CONFLICT(org_id,website) DO UPDATE SET result=excluded.result,checked_at=now(),expires_at=excluded.expires_at`,[task.org_id,key,JSON.stringify(value),value.status==='found']);}
   });
  }else result=await verify(task);
  console.log(JSON.stringify({...result,id,lease}));
 }finally{await db.end();}
}
if(require.main===module)main().catch(()=>{console.error('contact_worker_failed');process.exitCode=1;});
module.exports={request,discover,resolveContacts,verify,publicPage};

