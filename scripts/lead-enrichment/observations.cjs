'use strict';
const plain=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|nbsp|quot|apos|lt|gt);/gi,e=>({'&amp;':'&','&nbsp;':' ','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[e.toLowerCase()])).replace(/\s+/g,' ').trim();
function serviceHeading(heading,lead){
 const text=plain(heading).slice(0,180),identity=[lead.category,lead.company_name].join(' ');
 const rules=[[/dent(al|ist|istry)|orthodont/i,/\b(implants?|orthodontics?|braces|aligners?|(?:cosmetic|general|family|paediatric|pediatric|restorative)\s+dentistry|(?:teeth|tooth)\s+(?:whitening|extraction|cleaning)|root canal|dentures?|veneers?|fillings?)\b/i],
 [/plumb/i,/\b(plumbing|drains?|sewers?|pipe|water heater|leak)\b/i],
 [/electric/i,/\b(electrical|wiring|lighting|circuit|rewiring)\b/i],
 [/software|web development/i,/\b(software|web|mobile|application|ERP|CRM|automation|API)\b/i]];
 const rule=rules.find(([industry])=>industry.test(identity));
 // Unknown industries have no inferred service taxonomy.
 return rule&&rule[1].test(text)?text:null;
}
function bookingTarget(href,label,base){
 const raw=String(href||'').trim();
 if(!raw||raw.startsWith('#')||/^(javascript|data|mailto|tel):/i.test(raw)||!/book|appointment|schedule/i.test(raw+' '+plain(label)))return null;
 try{const u=new URL(raw,base),b=new URL(base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
  if(u.origin===b.origin&&u.pathname===b.pathname&&u.search===b.search)return null;
  return u.href;
 }catch{return null;}
}
function appointmentForms(html,source_url){
 const forms=[];for(const match of String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)){
  const form=match[0];
  if(/<(input|select|textarea)\b/i.test(form)&&/<button\b[^>]*>[\s\S]*?(appointment|consultation|booking)[\s\S]*?<\/button>/i.test(form))
   forms.push({type:'contact_form',value:source_url,source_url,method:'appointment_request_form',submission_tested:false});
 }
 return forms.slice(0,1);
}
function temporaryFailure(p){
 return [408,429].includes(p.status)||p.status>=500||/^(ESERVFAIL|EAI_AGAIN|ETIMEOUT|ETIMEDOUT|ENOTFOUND|ECONNRESET|ECONNREFUSED|timeout|dns_timeout|website_unavailable)$/.test(p.error||'');
}
function sourceFailure(pages){
 if(!Array.isArray(pages)||!pages.length||pages.some(p=>p.usable_html))return null;
 if(pages.some(p=>/^(ENOTFOUND|ESERVFAIL|EAI_AGAIN|dns_timeout)$/.test(p.error||'')))return 'dns';
 if(pages.some(p=>p.error==='blocked_target'||[401,403].includes(p.status)))return 'blocked';
 if(pages.some(temporaryFailure))return 'unavailable';
 if(pages.every(p=>[404,410].includes(p.status)))return 'not_found';
 if(pages.some(p=>p.error_class==='non_html'))return 'non_html';
 return 'unavailable';
}
module.exports={plain,serviceHeading,bookingTarget,appointmentForms,temporaryFailure,sourceFailure};
