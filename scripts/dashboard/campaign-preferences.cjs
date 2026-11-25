'use strict';
const fields=['timezone','tone','sending_window','sequence','expiry_days','source_check_max_age_days','name','offer','cta','mode','channels','email_template','email_daily_limit','pause_email','linkedin_manual'];
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function manualSettings(m,c){
 if(!object(m)||Object.keys(m).some(k=>!['enabled','daily_task_limit','connection_note'].includes(k))||typeof m.enabled!=='boolean'||!Number.isInteger(m.daily_task_limit)||m.daily_task_limit<1||m.daily_task_limit>100||m.connection_note!==null&&(typeof m.connection_note!=='string'||Array.from(m.connection_note).length>200||/[\p{Cc}\p{Cf}]/u.test(m.connection_note.replace(/[\r\n\t]/g,''))))throw Error('INVALID_FILTER');
 if(m.enabled&&(c.mode!=='ai'||(c.language||'en')!=='en'||c.channels?.length!==1||c.channels[0]!=='linkedin'||Array.isArray(c.sequence)&&c.sequence.some(s=>s.channel!=='linkedin')))throw Error('INVALID_FILTER');
 for(const match of (m.connection_note||'').matchAll(/\{\{\s*([^}]+)\s*\}\}/g))if(!['company_name','city','offer_name','offer_description','cta','demo_url','sender_name','sender_company'].includes(match[1].trim()))throw Error('INVALID_FILTER');
 return structuredClone(m);
}
function merge(config,p,{resetBenefitRules=false}={}){
 if(!object(p)||!Object.keys(p).length||Object.keys(p).some(k=>!fields.includes(k)))throw Error('INVALID_FILTER');
 const c=structuredClone(config);
 if(Object.hasOwn(p,'pause_email')){
  if(p.pause_email!==true||Object.keys(p).length!==1||!object(c.email_dispatch)||typeof c.email_dispatch.enabled!=='boolean')throw Error('INVALID_FILTER');
  c.email_dispatch={...c.email_dispatch,enabled:false};
 }
 for(const key of ['name','mode','channels'])if(p[key]!==undefined)c[key]=structuredClone(p[key]);
 if(p.mode!==undefined&&!['ai','template'].includes(p.mode))throw Error('INVALID_FILTER');
 for(const [key,allowed] of [['offer',['name','description','approved_points','prohibited_claims']],['cta',['text','url']]])if(p[key]!==undefined){if(!object(p[key])||Object.keys(p[key]).some(k=>!allowed.includes(k)))throw Error('INVALID_FILTER');c[key]={...c[key],...structuredClone(p[key])};}
 const benefitsChanged=JSON.stringify(c.offer?.approved_points)!==JSON.stringify(config.offer?.approved_points);
 if(benefitsChanged&&(config.offer_fit_rules||[]).length){if(resetBenefitRules!==true)throw Error('CAMPAIGN_BENEFIT_RULE_REVIEW_REQUIRED');c.offer_fit_rules=[];}
 else if(resetBenefitRules)throw Error('INVALID_FILTER');
 if(p.email_template!==undefined&&p.email_template!==null){if(!c.channels?.includes('email')||!object(p.email_template)||Object.keys(p.email_template).some(k=>!['subject','body','followups'].includes(k)))throw Error('INVALID_FILTER');c.templates={...c.templates,email:structuredClone(p.email_template)};}
 const templateChanged=['mode','channels','sequence','email_template'].some(k=>p[k]!==undefined);
 if(c.mode==='template'&&templateChanged&&((c.language||'en')!=='en'||c.channels?.length!==1||c.channels[0]!=='email'||!c.templates?.email))throw Error('INVALID_FILTER');
 if(p.sending_window!==undefined){const w=p.sending_window;if(!object(w)||Object.keys(w).some(k=>!['start_hour','end_hour','weekdays'].includes(k))||!Array.isArray(w.weekdays)||new Set(w.weekdays).size!==w.weekdays.length)throw Error('INVALID_FILTER');c.sending_window=structuredClone(w);}
 if(p.sequence!==undefined){if(!Array.isArray(p.sequence)||!Array.isArray(c.sequence)||(p.sequence.length!==c.sequence.length&&!(c.channels?.length===1&&['messenger','sms'].includes(c.channels[0])&&p.sequence.length===1))||p.sequence.some((s,i)=>!object(s)||Object.keys(s).some(k=>!['channel','delay_days'].includes(k))||(p.channels===undefined&&s.channel!==c.sequence[i].channel)))throw Error('INVALID_FILTER');c.sequence=structuredClone(p.sequence);}
 for(const k of ['timezone','tone','expiry_days'])if(p[k]!==undefined)c[k]=p[k];
 if(p.linkedin_manual!==undefined)c.linkedin_manual={...c.linkedin_manual,...manualSettings(p.linkedin_manual,c)};
 if(c.linkedin_manual?.enabled===true&&['linkedin_manual','mode','channels','sequence'].some(k=>p[k]!==undefined))manualSettings({enabled:true,daily_task_limit:c.linkedin_manual.daily_task_limit??10,connection_note:c.linkedin_manual.connection_note??null},c);
 if(p.tone!==undefined&&p.tone!==config.tone&&!['professional','friendly','concise'].includes(p.tone))throw Error('INVALID_FILTER');
 if(p.source_check_max_age_days!==undefined)c.offer_profile={...(typeof c.offer_profile==='string'?{key:c.offer_profile}:c.offer_profile||{key:'generic'}),source_check_max_age_days:p.source_check_max_age_days};
 if(c.mode==='template'&&templateChanged){const t=c.templates?.email;if(!Array.isArray(t?.followups)||t.followups.length!==c.sequence.length-1||typeof t.subject!=='string'||!t.subject.trim()||[t.body,...t.followups].some(v=>typeof v!=='string'||!v.trim()||v.length>1200))throw Error('INVALID_FILTER');}
 return c;
}
function project(row){
 if(!row)return{found:false};const c=row.config||{};
 return{found:true,campaign_id:String(row.id),version:row.version,name:c.name,language:c.language||'en',shared_email_signature:c.sender?.signature||[c.sender?.name,c.sender?.company].filter(Boolean).join(' | '),benefit_rule_count:Array.isArray(c.offer_fit_rules)?c.offer_fit_rules.length:0,preferences:{timezone:c.timezone,tone:c.tone||'professional',sending_window:c.sending_window,sequence:(Array.isArray(c.sequence)?c.sequence:[]).map(s=>({channel:s.channel,delay_days:s.delay_days})),expiry_days:c.expiry_days??7,source_check_max_age_days:c.offer_profile?.source_check_max_age_days??30,name:c.name,mode:c.mode,channels:c.channels,offer:{name:c.offer?.name,description:c.offer?.description,approved_points:c.offer?.approved_points||[],prohibited_claims:c.offer?.prohibited_claims||[]},cta:{text:c.cta?.text,url:c.cta?.url||''},linkedin_manual:c.linkedin_manual?{enabled:c.linkedin_manual.enabled===true,daily_task_limit:c.linkedin_manual.daily_task_limit??10,connection_note:c.linkedin_manual.connection_note??null}:null,email_template:c.templates?.email?{subject:c.templates.email.subject,body:c.templates.email.body,followups:c.templates.email.followups||[]}:null}};
}
function dailyLimit(row){
 const c=row?.config,ref=c?.sender_connection,p=c?.email_dispatch,s=row?.sender_daily_snapshot;
 if(!ref||!p||!s||!/^[a-f0-9]{64}$/.test(ref.subject||'')||s.org_id!==row.org_id||s.connection_id!==ref.connection_id||s.version!==ref.version||s.provider!==ref.provider||s.credential_ref!==p.credential_ref||s.email!==p.sender_email||!['gmail','smtp'].includes(s.provider))return{available:false};
 if(![s.daily_limit,p.daily_limit].every(v=>Number.isInteger(v)&&v>=1&&v<=9999)||p.daily_limit>s.daily_limit)return{available:false};
 return{available:true,value:p.daily_limit,ceiling:s.daily_limit,scope:'shared_organization_lowest_enabled_campaign',sending_enabled:p.enabled===true};
}
function withDailyLimit(config,value,control){
 if(!control.available||!Number.isInteger(value)||value<1||value>control.ceiling)throw Error('INVALID_FILTER');
 return{...config,email_dispatch:{...config.email_dispatch,daily_limit:value}};
}
function loader(pool){return async(org,campaign)=>{
 if(!Number.isSafeInteger(org)||org<1||!Number.isSafeInteger(campaign)||campaign<1)throw Error('INVALID_FILTER');
 return(await pool.query(`SELECT c.id,c.org_id,c.version,v.config,(SELECT jsonb_build_object('org_id',s.org_id,'connection_id',s.connection_id,'version',s.version,'provider',s.provider,'credential_ref',s.credential_ref,'email',s.email,'daily_limit',s.daily_limit) FROM sender_connections s WHERE s.org_id=c.org_id AND s.connection_id=v.config#>>'{sender_connection,connection_id}') AS sender_daily_snapshot FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=${org} AND c.id=${campaign}`)).rows[0]||null;
};}
function saver(execute){return async payload=>{
 const result=(await execute("SELECT strategy_campaign_save('"+JSON.stringify(payload).replace(/'/g,"''")+"'::jsonb) AS result")).rows[0]?.result;
 return{status:result?.http_status||500,body:result};
};}
module.exports={merge,project,loader,saver,dailyLimit,withDailyLimit,manualSettings};
