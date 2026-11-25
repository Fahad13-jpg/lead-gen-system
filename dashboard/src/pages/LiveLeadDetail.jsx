import React,{useCallback}from'react';

import{Link,useLocation,useParams}from'react-router-dom';

import{ArrowLeft,ArrowUpRight,RefreshCw,MapPin,Building2,ShieldCheck,FileText,AlertCircle,Link2}from'lucide-react';

import{getLeadDetail}from'../api/client';

import ManualWhatsApp from'../components/ManualWhatsApp';

import ManualFacebook from'../components/ManualFacebook';

import useReadList from'../hooks/useReadList';

import{ReadFeedback}from'./ReadListParts';

import'./LiveData.css';

import'./LeadDetail.css';

const labels={provider_verified:'Provider verified',deliverability_unknown:'Delivery not verified',expired:'Verification expired',invalid:'Invalid',risky:'Risky',present:'Website observed',none_found:'Not found on checked sources',social_only:'Social profile only',unknown:'Unknown',booking_link:'Booking link',contact_form:'Contact form',whatsapp:'WhatsApp link',phone:'Phone observation',email:'Email observation',social:'Social profile',technology_marker:'Technology marker',website_description:'Website description',needs_review:'Review needed',insufficient_fresh_evidence:'Details need another check',evidence_available_contacts_unverified:'Details saved. Contact not checked',contact_verified_business_review_required:'Contact checked. Review business',template_site_suspected:'Possible unfinished template site',missing_or_stale_business_evidence:'Business details are missing or need another check',business_identity_unconfirmed:'Business identity has not been confirmed',conflicting_business_evidence:'Business details do not agree',no_fresh_provider_verified_email:'Email has not been checked recently'};

const label=v=>labels[v]||String(v||'Not recorded').replace(/_/g,' ');

const date=v=>v?new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not recorded';

function Source({url,children='View source'}){let safe=false;try{safe=['https:','http:'].includes(new URL(url).protocol);}catch{}return safe?<a className="ld-source" href={url} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13}/></a>:<span className="ld-muted">Link not available</span>;}

function ContactLink({kind,value}){
 if(!value)return <span className="ld-muted">Not recorded</span>;
 if(kind==='email')return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value)?<a className="ld-contact-link" href={`mailto:${value}`}>{value}</a>:<span>{value}</span>;
 if(kind==='phone'){
  const normalized=String(value).replace(/[\s().-]/g,'');
  return /^\+?[0-9]{7,15}$/.test(normalized)?<a className="ld-contact-link" href={`tel:${normalized}`}>{value}</a>:<span>{value}</span>;
 }
 return <span>{value}</span>;
}

function websiteHost(value){try{return new URL(value).hostname.replace(/^www\./i,'www.')||value;}catch{return value;}}

function Freshness({value}){return <span className={`ld-status ${value===true?'current':''}`}>{value===true?'Checked recently':value===false?'Needs another check':'Check date not known'}</span>;}

function socialPlatform(value){try{const host=new URL(value).hostname.toLowerCase();return [['facebook.com','Facebook'],['instagram.com','Instagram'],['linkedin.com','LinkedIn']].find(([domain])=>host===domain||host.endsWith('.'+domain))?.[1]||null;}catch{return null;}}

export default function LiveLeadDetail(){

 const location=useLocation(),from=location.state?.from,backTo=typeof from==='string'&&/^\/leads(?:\?[^#]*)?$/.test(from)?from:'/leads';
 const{leadId}=useParams(),fetchPage=useCallback(()=>getLeadDetail(leadId),[leadId]);

 const state=useReadList(fetchPage),{data,loading,refresh}=state;

 if(data?.found===false)return <div className="live-page"><Link className="ld-back" to={backTo} state={{leadList:location.state?.leadList}}><ArrowLeft size={16}/>Back to lead list</Link><div className="dp-empty"><h1>Lead not available</h1><p>This business was not found in your selected organization.</p></div></div>;

 const c=data?.lead,a=data?.assessment,socialWebsite=socialPlatform(c?.website);

 return <div className="live-page ld-page"><Link className="ld-back" to={backTo} state={{leadList:location.state?.leadList}}><ArrowLeft size={16}/>Back to lead list</Link><ReadFeedback {...state}/>{data&&<><header className="ld-header"><span className="ld-business-icon"><Building2 size={28}/></span><div><h1>{c.company_name||'Unnamed business'}</h1><p>{c.category||'Category not recorded'}<span>·</span><MapPin size={14}/>{[c.city,c.country].filter(Boolean).join(', ')||'Location not recorded'}</p></div><button className="live-secondary" disabled={loading} onClick={refresh}><RefreshCw size={16}/>Refresh</button></header>

 <div className="ld-layout"><aside className="ld-sidebar"><section className="ld-panel"><h2>Contact this business</h2><dl className="ld-contacts"><div><dt>Email</dt><dd><ContactLink kind="email" value={c.email}/></dd></div><div><dt>Phone</dt><dd><ContactLink kind="phone" value={c.phone}/></dd></div><div><dt>Website</dt><dd>{c.website&&!socialWebsite?<Source url={c.website}>{websiteHost(c.website)}</Source>:<span className="ld-muted">Not recorded</span>}</dd></div>{socialWebsite&&<div><dt>{socialWebsite} profile</dt><dd><Source url={c.website}>Open {socialWebsite} profile</Source></dd></div>}</dl>{socialWebsite&&<p className="ld-note">This is a social profile. No business website is saved.</p>}<p className="ld-note">Check the details before contacting this business.</p></section>

 <section className="ld-panel"><h2>Past checks</h2><dl className="ld-history"><div><dt>Website check</dt><dd>{date(a.basic_at)}</dd></div><div><dt>Research</dt><dd>{date(a.research_at)}</dd></div><div><dt>Details last checked</dt><dd>{date(a.evaluated_at)}</dd></div></dl>{data.tasks.length>0&&<div className="ld-tasks">{data.tasks.map((t,i)=><span key={i}>{label(t.kind)} · {label(t.status)}</span>)}</div>}<p className="ld-note">Refresh shows the latest saved details.</p></section></aside>

 <div className="ld-content">{data.imports?.length>0&&<section className="ld-panel"><h2>Uploaded information</h2><p className="ld-note">Your team uploaded this information. Check it before use.</p>{data.imports.map((v,i)=><div key={i}><h3>{v.filename||'CSV import'}</h3><p className="ld-note">Uploaded as {v.provided_stage} · {date(v.created_at)}{v.batch_id&&<> · <Link to={`/leads?import_id=${v.batch_id}`}>View import leads</Link></>}</p>{v.notes&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{v.notes}</p>}</div>)}</section>}{data.facebook?.length>0&&<section className="ld-panel"><h2>Facebook page</h2>{data.facebook.map((p,i)=><div key={i}><Source url={p.page_url}>Open Facebook page</Source>{p.messenger_url&&<Source url={p.messenger_url}>Open Messenger</Source>}<p className="ld-note">Saved {date(p.observed_at)}. Check the page before sending a message.</p></div>)}</section>}{data.facebook?.length>0&&<ManualFacebook leadId={c.id}/>}{c.phone&&<ManualWhatsApp leadId={c.id}/>}<details className="ld-more"><summary>More saved details</summary><div className="ld-more-content"><section className="ld-panel"><div className="ld-panel-title"><ShieldCheck size={20}/><h2>Business checks</h2></div>{!data.report_available?<div className="ld-empty">No business check is saved yet.</div>:<><p className="ld-report-status">{label(a.overall_status)}</p><div className="ld-freshness"><div><span>Website presence</span><strong>{label(a.website_presence)}</strong></div><div><span>Website details</span><Freshness value={a.website_current}/></div><div><span>Business information</span><Freshness value={a.research_current}/></div></div><p className="ld-note">Check the website link before using it.</p>{[...a.warnings,...a.conflicts].length>0&&<div className="ld-flags">{[...a.warnings,...a.conflicts].map((f,i)=><p key={i}><AlertCircle size={16}/>{f.message||label(f.code)}</p>)}</div>}{a.blocking_reasons.length>0&&<details className="ld-report-notes"><summary>Notes about these checks</summary><ul>{a.blocking_reasons.map((r,i)=><li key={i}>{label(r)}</li>)}</ul><p className="ld-note">Check the contact details before sending.</p></details>}</>}<p className="ld-note">Review each message before sending.</p></section>

 {(data.summary||data.description)&&<section className="ld-panel"><div className="ld-panel-title"><FileText size={20}/><h2>About this business</h2></div>{data.summary&&<p className="ld-summary">{data.summary}</p>}{data.description&&<><h3>Website description</h3><p className="ld-summary">{data.description}</p></>}<p className="ld-note">Check these details before mentioning them in a message.</p></section>}

 <section className="ld-panel"><div className="ld-panel-title"><Link2 size={20}/><h2>Website details found</h2></div><p className="ld-note">Saved links may have changed.</p>{data.evidence.length?data.evidence.map((e,i)=><article className="ld-evidence" key={i}><div><strong>{label(e.type)}</strong><span>{date(e.observed_at)}</span></div><p>{e.value||'Value not recorded'}</p><Source url={e.source_url}/></article>):<div className="ld-empty">No website observations are saved for this business.</div>}{data.services.length>0&&<><h3>Service headings found</h3><div className="ld-services">{data.services.map((s,i)=><div key={i}><p>{s.text}</p><Source url={s.source_url}/></div>)}</div><p className="ld-note">Headings found on checked pages; not independently confirmed services.</p></>}</section>

 <section className="ld-panel"><h2>Email checks</h2>{data.emails.length?data.emails.map((e,i)=><div className="ld-email" key={i}><strong>{e.value}</strong><span className="ld-status">{label(e.status)}</span><small>Checked {date(e.checked_at)}. Check again after {date(e.expires_at)}</small></div>):<div className="ld-empty">This email has not been checked.</div>}</section>

 {(data.linkedin.profiles.length>0||data.linkedin.posts.length>0)&&<section className="ld-panel"><h2>LinkedIn evidence</h2><p className="ld-note">Saved profile and post evidence. Identity matching and freshness still require review.</p>{data.linkedin.profiles.map((p,i)=><div className="ld-evidence" key={i}><Source url={p.url}>{label(p.kind)} profile</Source></div>)}{data.linkedin.posts.map((p,i)=><article className="ld-evidence" key={i}><p>{p.text}</p><small>{date(p.published_at)}</small><Source url={p.url}>View post</Source></article>)}</section>}

 <section className="ld-panel"><details className="ld-diagnostics"><summary>Checked website pages <span>{data.pages.length} saved pages</span></summary>{data.pages.length?<div className="ld-table"><table><caption className="dp-sr-only">Saved website fetch diagnostics</caption><thead><tr>{['Page','HTTP','HTML bytes','Text bytes','Truncated','Result'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{data.pages.map((p,i)=><tr key={i}><td><Source url={p.final_url||p.url}/></td><td>{p.status??'Unknown'}</td><td>{p.html_bytes??'Unknown'}</td><td>{p.text_bytes??'Unknown'}</td><td>{p.truncated===null?'Unknown':p.truncated?'Yes':'No'}</td><td>{p.error_class?label(p.error_class):p.usable_html===true?'HTML observed':'Not recorded'}</td></tr>)}</tbody></table></div>:<div className="ld-empty">No website page checks are saved.</div>}</details></section>

 </div></details></div></div><p className="live-footnote">Saved {date(data.observed_at)}. Opening this page does not send a message.</p></>}</div>;

}

