'use strict';
const net=require('node:net');
function email(value){const s=String(value||'').trim().toLowerCase();if(s.length>254)return null;const parts=s.split('@');if(parts.length!==2||!parts[0]||parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..')||!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(parts[0]))return null;const labels=parts[1].split('.');return labels.length>1&&labels.every(x=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))&&/^[a-z]{2,}$/.test(labels.at(-1))?s:null;}
function publicIPv4(ip){if(net.isIP(ip)!==4)return false;const [a,b,c]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
function target(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||net.isIP(u.hostname)||u.hostname.includes(':')||!u.hostname.includes('.')||/\.(localhost|local|internal|test|invalid)$/i.test(u.hostname))throw Object.assign(Error('blocked_target'),{code:'blocked_target'});u.hash='';return u;}
function htmlText(s){return s.replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>parseInt(n,16)<=0x10ffff?String.fromCodePoint(parseInt(n,16)):'').replace(/&commat;/gi,'@').replace(/&period;/gi,'.').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'");}
function publishedText(html){
 let decoded=htmlText(String(html));
 // Decode explicitly published Cloudflare email protection. This is reversible
 // page data, not a guessed mailbox or a request to a discovery provider.
 for(const m of String(html).matchAll(/(?:data-cfemail\s*=\s*["']|\/cdn-cgi\/l\/email-protection#)([a-f0-9]{4,512})/gi)){
  const hex=m[1];if(hex.length%2)continue;
  const key=parseInt(hex.slice(0,2),16);let value='';
  for(let i=2;i<hex.length;i+=2)value+=String.fromCharCode(parseInt(hex.slice(i,i+2),16)^key);
  if(email(value))decoded+='\nPublished protected email: '+value+'\n';
 }
 // Only bracketed, explicit obfuscation is reversible. Bare prose such as
 // "contact at our office" must never manufacture an address.
 decoded=decoded.replace(/(?<![a-z0-9.!#$%&'*+\/=?^_`{|}~-])([a-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64})[ \t]{0,16}(?:\[at\]|\(at\))[ \t]{0,16}([a-z0-9-]{1,63}(?:[ \t]{0,16}(?:\[dot\]|\(dot\)|\.)[ \t]{0,16}[a-z0-9-]{1,63}){1,8})/gi,
  (whole,local,domain)=>{const value=local+'@'+domain.replace(/\s*(?:\[dot\]|\(dot\)|\.)\s*/gi,'.');return email(value)?value:whole;});
 // Decode only published mailto recipients, never query subjects or arbitrary URLs.
 decoded=decoded.replace(/mailto:([^\s"'<>?]+)/gi,(_,s)=>{try{return 'mailto:'+decodeURIComponent(s);}catch{return 'mailto:'+s;}});
 for(const m of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const obj=JSON.parse(m[1]);const walk=(v,depth=0)=>{if(depth>20||!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){if(key==='email'&&typeof value==='string')decoded+='\nPublished structured email: '+value+'\n';else walk(value,depth+1);}};walk(obj);}catch{}
 }
 return decoded;
}
function extract(html,url){const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');const decoded=publishedText(html).replace(/[^\s<>"']{320,}/g,' ');const rows=new Map();
 for(const match of decoded.matchAll(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)){
  const e=email(match[0]);if(!e)continue;const domain=e.split('@')[1];if(/\.(png|jpg|jpeg|svg|webp|css|js)$/i.test(e)||['example.com','sentry.io','wixpress.com','schema.org'].some(d=>domain===d||domain.endsWith('.'+d)))continue;
  const same=domain===host||host.endsWith('.'+domain)||domain.endsWith('.'+host);
  const context=decoded.slice(Math.max(0,match.index-100),match.index+e.length+100).replace(/<[^>]*>/g,' ');
  const vendor=/designed by|developed by|powered by|website by/i.test(context);
  const role=/^(info|contact|hello|office|appointments?|reception|enquiries|inquiries)@/.test(e);
  const score=(same?70:30)+(role?10:0)+(url.match(/contact|about|team/i)?10:0)-(vendor?60:0);
  const row={email:e,score:Math.max(0,score),source_url:url,evidence:context.slice(0,180),method:'published_website',same_domain:same};
  if(!rows.has(e)||rows.get(e).score<row.score)rows.set(e,row);
 }return [...rows.values()].sort((a,b)=>b.score-a.score).slice(0,20);
}
function pageKey(value){const u=new URL(value);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);u.searchParams.sort();return u.origin+u.pathname.replace(/\/+$/,'')+u.search;}
function links(html,base){const u=new URL(base),result=new Map();for(const m of String(html).matchAll(/href\s*=\s*["']([^"']+)["']/gi)){try{const v=target(new URL(htmlText(m[1]),u).href);if(v.origin===u.origin&&/contact|about|team|appointment/i.test(v.pathname)&&!result.has(pageKey(v.href)))result.set(pageKey(v.href),v.href);}catch{}}
 const ranked=[...result.values()].sort((a,b)=>(/contact/i.test(new URL(b).pathname)?2:1)-(/contact/i.test(new URL(a).pathname)?2:1));
 for(const p of ['/contact','/contact-us','/about']){const v=new URL(p,u.origin).href;if(!result.has(pageKey(v))){result.set(pageKey(v),v);ranked.push(v);}}return ranked.slice(0,12);}
function contactRoutes(html,base){const routes=new Map();const add=(type,value)=>{if(routes.size<20)routes.set(type+':'+value,{type,value,source_url:base});};
 for(const m of String(html).matchAll(/href\s*=\s*["']([^"']+)["']/gi)){const href=htmlText(m[1]);
  if(/^tel:/i.test(href)){try{const phone=decodeURIComponent(href.slice(4)).trim();if(/^\+?[\d ().-]{5,30}$/.test(phone))add('phone',phone);}catch{}continue;}
  try{const u=target(new URL(href,base).href);if(/^(?:www\.)?(?:wa\.me|api\.whatsapp\.com|facebook\.com|instagram\.com|linkedin\.com)$/.test(u.hostname))add(/wa\.me|whatsapp/.test(u.hostname)?'whatsapp':'social',u.href);}catch{}
 }
 // Record the containing page for manual use; never submit a form automatically.
 for(const m of String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi))if(/<textarea\b/i.test(m[0])&&/<(?:input|textarea)\b[^>]*(?:name|type)\s*=\s*["'][^"']*(?:email|message)/i.test(m[0]))add('contact_form',base);
 return [...routes.values()];
}
function sourceContacts(record={}){
 const candidates=new Map(),routes=[],raw=record.raw_data&&typeof record.raw_data==='object'?record.raw_data:{};
 const excluded=new Set(record.invalid_emails||[]);let source_url=null;try{source_url=target(record.source_url||raw.url||raw.sourceUrl||raw.profileUrl).href;}catch{}
 const add=(value,field)=>{if(typeof value!=='string')return;const e=email(value.replace(/^mailto:/i,'').trim());if(!e||excluded.has(e))return;
  if(!candidates.has(e)&&candidates.size<20)candidates.set(e,{email:e,score:80,method:'source_record',source_url,source_field:field,staging_id:record.staging_id,evidence:'Explicit business contact field: '+field});};
 const fields=(obj,prefix)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj))return;for(const key of ['email','contactEmail','emailAddress'])add(obj[key],prefix+key);
  if(Array.isArray(obj.emails))for(const [i,v] of obj.emails.slice(0,20).entries()){if(typeof v==='string')add(v,prefix+'emails['+i+']');else if(v&&typeof v==='object')add(v.email||v.address,prefix+'emails['+i+'].email');}};
 fields(record,'cleaned.');fields(raw,'raw.');fields(raw.contact,'raw.contact.');
 // Never recursively search reviews, authors or arbitrary text for addresses.
 if(Array.isArray(raw.contacts))for(const [i,v] of raw.contacts.slice(0,20).entries())fields(v,'raw.contacts['+i+'].');
 for(const phone of [record.phone,raw.phone,raw.phoneNumber,...(Array.isArray(raw.phones)?raw.phones.slice(0,10):[])])if(typeof phone==='string'&&/^\+?[\d ().-]{5,30}$/.test(phone)&&!routes.some(r=>r.value===phone))routes.push({type:'phone',value:phone,source_url,method:'source_record',staging_id:record.staging_id});
 for(const key of ['facebooks','instagrams','linkedIns','socialLinks'])for(const value of (Array.isArray(raw[key])?raw[key].slice(0,10):raw[key]&&typeof raw[key]==='object'?Object.values(raw[key]).slice(0,10):[])){
  if(typeof value!=='string')continue;try{const u=target(value);if(/^(?:www\.)?(?:facebook\.com|instagram\.com|linkedin\.com|wa\.me)$/.test(u.hostname)&&!routes.some(r=>r.value===u.href))routes.push({type:u.hostname==='wa.me'?'whatsapp':'social',value:u.href,source_url,method:'source_record',staging_id:record.staging_id});}catch{}
 }
 return {candidates:[...candidates.values()],contact_routes:routes.slice(0,20)};
}
function qualify(candidate,lead={}){
 const e=email(candidate.email),reasons=[];let relevance='eligible';
 if(!e)return {...candidate,relevance_status:'excluded',relevance_reasons:['invalid_format'],score:0};
 const [local,domain]=e.split('@');let host='';try{host=target(/^https?:/i.test(lead.website||'')?lead.website:'https://'+lead.website).hostname.replace(/^www\./,'');}catch{}
 const same=host&&(domain===host||domain.endsWith('.'+host)||host.endsWith('.'+domain));
 const free=['gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','aol.com','icloud.com','proton.me','protonmail.com'].includes(domain);
 if(/^(no[._-]?reply|donotreply|mailer-daemon|postmaster)([+._-]|$)/i.test(local)||['example.com','mailinator.com','tempmail.com','guerrillamail.com'].includes(domain)){relevance='excluded';reasons.push('non_contact_or_placeholder');}
 if(/designed by|developed by|powered by|website by/i.test(candidate.evidence||'')){relevance='excluded';reasons.push('website_vendor_context');}
 if(relevance!=='excluded'){
  if(/(^|[._-])(social|press|media|careers?|jobs?|hr|recruitment|support)([._-]|$)/i.test(local)){relevance='review';reasons.push('department_relevance_uncertain');}
  if(candidate.identity_match===false){relevance='review';reasons.push('business_identity_unconfirmed');}
  if(host&&!same&&!free){relevance='review';reasons.push('different_email_domain');}
  if(candidate.method==='published_website'&&!same&&!free){relevance='review';reasons.push('external_website_contact');}
  if(Number(candidate.score)<40&&candidate.method!=='source_record'){relevance='review';reasons.push('weak_source_evidence');}
 }
 if(relevance==='eligible')reasons.push(same?'business_domain_match':free?'published_business_mailbox':'explicit_business_contact');
 return {...candidate,email:e,relevance_status:relevance,relevance_reasons:reasons,score:relevance==='excluded'?0:relevance==='review'?Math.min(30,candidate.score||30):Math.max(60,candidate.score||60)};
}
function facebookProfile(value){try{const u=target(value);if(!['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))return null;
 const parts=u.pathname.split('/').filter(Boolean);if(!parts.length||['platform','share','sharer','sharer.php','login','groups','events','watch','photo','photos','reel','reels','marketplace','help','business','policies','dialog'].includes(parts[0].toLowerCase()))return null;
 if(parts[0]==='profile.php'){const id=u.searchParams.get('id');return /^\d+$/.test(id||'')?'https://www.facebook.com/profile.php?id='+id:null;}
 if(['pages','people'].includes(parts[0]))return parts.length>=3&&/^\d+$/.test(parts[2])?'https://www.facebook.com/'+parts.slice(0,3).join('/'):null;
 if(!/^[a-z0-9._-]+$/i.test(parts[0]))return null;return 'https://www.facebook.com/'+parts[0].toLowerCase();
 }catch{return null;}}
function matchFacebook(lead,row){
 const cleanUrl=s=>{try{const u=target(s);return u.hostname.replace(/^www\./,'').toLowerCase()+u.pathname.replace(/\/+$/,'').toLowerCase();}catch{return null;}};
 const phone=s=>String(s||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
 const words=s=>String(s||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[];
 const tokens=words(lead.company_name).filter(w=>!['the','and','inc','llc','ltd','company'].includes(w));const title=new Set(words(row.title));
 const nameMatch=tokens.length>0&&tokens.filter(w=>title.has(w)).length/Math.min(tokens.length,3)>=0.5;
 const sourceMatch=facebookProfile(row.facebookUrl||row.pageUrl)===facebookProfile(lead.facebook_profile)&&Boolean(facebookProfile(lead.facebook_profile));
 const website=cleanUrl(lead.website),sites=[row.website,...(Array.isArray(row.websites)?row.websites:[])].map(cleanUrl).filter(Boolean);
 const websiteMatch=Boolean(website&&sites.includes(website));const p=phone(lead.phone);const phoneMatch=p.length>=7&&p===phone(row.phone);
 return {matched:sourceMatch&&nameMatch&&(websiteMatch||phoneMatch),evidence:{source_match:sourceMatch,name_match:nameMatch,website_match:websiteMatch,phone_match:phoneMatch}};
}
// Review signals only: never rewrite canonical facts from heuristics.
function businessQuality(lead={},routes=[],observation=null){
 const flags=[],normalize=p=>String(p||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
 const phones=new Map();for(const item of [{value:lead.phone,source_url:null},...routes.filter(r=>r.type==='phone'),...(observation?.phone?[{value:observation.phone,source_url:observation.source_url}]:[])]){const p=normalize(item.value);if(p.length>=7&&!phones.has(p))phones.set(p,{value:item.value,source_url:item.source_url||null});}
 if(phones.size>1)flags.push({code:'conflicting_phone_numbers',severity:'review',evidence:[...phones.values()].slice(0,10)});
 const groups=[['dental',/dent(al|ist|istry)|orthodont/i],['plumbing',/plumb(er|ing)?|sewer/i],['electrical',/electric(al|ian)?/i],['software',/software|web development/i]];
 const category=groups.filter(([,r])=>r.test(lead.category||'')),name=groups.filter(([,r])=>r.test(lead.company_name||''));
 if(category.length===1&&name.length===1&&category[0][0]!==name[0][0])flags.push({code:'possible_category_mismatch',severity:'review',evidence:{company_name:lead.company_name,category:lead.category},reason:'Explicit industry terms disagree; human or enrichment review required'});
 return flags;
}
function verification(status,body){const b=body&&typeof body==='object'?body:{};const flag=v=>typeof v==='boolean'?v:v?.value;
 if(status===401||status===403)return {status:'retry',error:'provider_auth',pause:true};
 if(status===429)return {status:'retry',error:'provider_rate_or_quota',pause:true};
 if(status===402)return {status:'retry',error:'provider_quota',pause:true};
 if(status>=500||status===408||status===0)return {status:'retry',error:'provider_unavailable'};
 if(status!==200||b.error)return {status:'retry',error:'provider_error',pause:status>=400&&status<500||Boolean(b.error)};
 if(!['DELIVERABLE','UNDELIVERABLE','UNKNOWN'].includes(b.deliverability))return {status:'retry',error:'provider_schema',pause:true};
 const evidence={deliverability:b.deliverability,format:flag(b.is_valid_format),mx:flag(b.is_mx_found),smtp:flag(b.is_smtp_valid),disposable:flag(b.is_disposable_email),catch_all:flag(b.is_catchall_email),role:flag(b.is_role_email)};
 let outcome='unknown';
 if(evidence.disposable===true)outcome='risky';
 else if(evidence.format===false||evidence.mx===false||b.deliverability==='UNDELIVERABLE')outcome='invalid';
 else if(evidence.catch_all===true)outcome='risky';
 else if(b.deliverability==='DELIVERABLE'&&evidence.format===true&&evidence.mx===true&&evidence.smtp===true&&evidence.disposable===false&&evidence.catch_all===false)outcome='verified';
 return {status:outcome,evidence};
}
module.exports={businessQuality,email,publicIPv4,target,extract,links,pageKey,contactRoutes,sourceContacts,qualify,facebookProfile,matchFacebook,verification};
