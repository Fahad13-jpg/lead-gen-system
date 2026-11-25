'use strict';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
// Conservative ASCII HTTP(S) comparison only; no fetch, DNS, ownership inference,
// IDN expansion, arbitrary ports or cross-domain redirect inference.
function address(value){
 if(typeof value!=='string'||/[\s\\<>"\x00-\x1f]/.test(value))return null;
 const m=/^(https?):\/\/([a-z0-9.-]+)(?::(80|443))?((?:\/[^#]*)|(?:\?[^#]*))?(?:#.*)?$/i.exec(value);
 if(!m||m[3]&&m[3]!==({http:'80',https:'443'})[m[1].toLowerCase()])return null;
 const host=m[2].toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
 if(!host.includes('.')||host.includes('..')||host.startsWith('.')||host.endsWith('.'))return null;
 const rest=m[4]?(m[4].startsWith('?')?'/'+m[4]:m[4]):'/';
 return{host,key:m[1].toLowerCase()+'://'+host+rest};
}
function normalize(input,now=new Date().toISOString()){
 if(!object(input?.report?.basic)||!object(input.report.trust))return input;
 const basic=input.report.basic,trust=input.report.trust;
 if(Object.hasOwn(trust,'website_presence')&&Object.hasOwn(trust,'assessment_status'))return input;
 const time=Date.parse(basic.observed_at),clock=Date.parse(now),validTime=typeof basic.observed_at==='string'&&Number.isFinite(time)&&Number.isFinite(clock)&&time<=clock;
 const assessed=basic.version==='enrichment_v1'&&['complete','partial'].includes(basic.status)&&validTime;
 let expected=address(input.lead?.website);
 const directoryHosts=['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','yelp.com','yellowpages.com'];
 if(expected&&(directoryHosts.some(host=>expected.host===host||expected.host.endsWith('.'+host))||/(^|\.)google\.[a-z.]+$/.test(expected.host)))expected=null;
 const pages=Array.isArray(basic.pages)?basic.pages:[],successful=new Set();
 for(const page of pages){
  if(!object(page)||page.usable_html!==true||!/^2\d\d$/.test(String(page.status))||page.error_class)continue;
  const initial=address(page.url),final=page.final_url==null?initial:address(page.final_url);
  if(!expected||!initial||!final||initial.host!==expected.host||final.host!==expected.host)continue;
  successful.add(initial.key);successful.add(final.key);
 }
 const fresh=assessed&&clock-time<30*86400000&&trust.freshness?.website_current===true;
 const recorded=address(trust.fields?.website?.value);
 const inferredPresence=fresh&&expected&&recorded?.host===expected.host&&trust.fields?.website?.status==='page_observed_ownership_unverified'&&successful.size>0?'present':'unknown';
 const nextTrust={...trust};
 if(!Object.hasOwn(nextTrust,'website_presence'))nextTrust.website_presence=inferredPresence;
 if(!Object.hasOwn(nextTrust,'assessment_status'))nextTrust.assessment_status=assessed?'assessed':'not_assessed';
 let services=Array.isArray(basic.services)?basic.services:[];
 if(!Object.hasOwn(trust,'website_presence'))services=services.filter(e=>{const source=address(e?.source_url),at=Date.parse(e?.observed_at||basic.observed_at);return object(e)&&typeof e.text==='string'&&e.text.replace(/[\p{Cc}\p{Cf}]/gu,'').trim()&&source&&successful.has(source.key)&&Number.isFinite(at)&&at<=clock&&clock-at<30*86400000;});
 return{...input,report:{...input.report,basic:{...basic,services},trust:nextTrust,compatibility:{version:'legacy_enrichment_bridge_v1',limitations:['Legacy profile has no signal sheet; website quality, website absence and inquiry paths remain unassessed.','Only recorded same-site successful-page excerpts are used; business ownership is unverified.']}}};
}
module.exports={normalize,address};
