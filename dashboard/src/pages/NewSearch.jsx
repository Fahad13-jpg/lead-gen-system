import HelpTip from '../components/HelpTip';
import LocationPicker from '../components/LocationPicker';
import React,{useRef,useState}from'react';

import{Link}from'react-router-dom';

import{ArrowLeft,ArrowRight,Search,MapPin,ShieldCheck,CheckCircle,AlertCircle}from'lucide-react';

import{useAuth}from'../context/AuthContext';

import{previewSearch,submitSearch,getSearchRequest}from'../api/client';

import'./LiveData.css';

import'./NewSearch.css';

import{sourceNames,searchRequests,combinedPreview,submitCombined,uncertainChild}from'./searchSources';

const initial={search_query:'',location:'',country_code:'PK',source:'google_maps',max_results:50,billing_mode:'byok',max_cost_usd:0.5,max_customer_cost_usd:0.5,website_filter:'allPlaces',require_contact:false,include_categories:'',exclude_categories:'',exclude_unrelated_page_types:true};

const errors={ROLE_REQUIRED:'Only an organization owner or admin can start searches.',BYOK_NOT_CONNECTED:'Connect your organization’s Apify account before using your own key.',PLATFORM_NOT_CONFIGURED:'Platform scraping is not configured yet. Ask your administrator.',PROVIDER_BUDGET_EXHAUSTED:'The provider spending allowance is currently exhausted.',INSUFFICIENT_PLATFORM_CREDITS:'Your organization needs platform credits for this search.',ORG_QUEUE_FULL:'Your organization’s search queue is full. Wait for existing jobs to finish.',PREVIEW_EXPIRED:'This review expired or the dashboard restarted. Review the search again.',PRICE_CONFIRMATION_REQUIRED:'The current customer charge exceeds your limit. Review the budget again.',REQUEST_ID_CONFLICT:'This request ID already belongs to different settings. Ask your administrator to reconcile it.'};

function requestId(){return'dash_'+[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');}

export default function NewSearch(){

 const{organization,user}=useAuth(),key=`lg_search_${user.subject}_${organization.org_id}`;

 const[locationConfirmed,setLocationConfirmed]=useState(null),[categoryConfirmed,setCategoryConfirmed]=useState(false);
 const[form,setForm]=useState(initial),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');

 const[submission,setSubmission]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return{state:'storage_unavailable'};}});

 const id=useRef(null),pending=useRef(false),allowed=['owner','admin'].includes(organization.role);

 function change(k,v){if(k==='location'||k==='country_code')setLocationConfirmed(null);setCategoryConfirmed(false);setForm(f=>({...f,[k]:v}));setPreview(null);setError('');id.current=null;}

 function save(value){sessionStorage.setItem(key,JSON.stringify(value));setSubmission(value);}

 async function review(event){

  event.preventDefault();if(pending.current)return;if(!locationConfirmed){setError('Choose a city from the suggestions, or confirm the spelling and country of your unlisted area.');document.getElementById('search-location')?.focus();return;}setCategoryConfirmed(false);pending.current=true;setBusy(true);setError('');setPreview(null);

  try{if(!id.current)id.current=requestId();const payload={...form,include_categories:form.include_categories.split(',').map(s=>s.trim()).filter(Boolean),exclude_categories:form.exclude_categories.split(',').map(s=>s.trim()).filter(Boolean),job_name:`${form.search_query.trim()} in ${form.location.trim()}`.slice(0,255),request_id:id.current};const requests=searchRequests(payload);if(requests.length===1)setPreview(await previewSearch(payload));else{const children=await Promise.all(requests.map(p=>previewSearch(p)));setPreview(combinedPreview(payload,children));}}

  catch(e){setError(errors[e.response?.data?.error]||'The preview could not be loaded. Check your details and try again. No search has been submitted.');}

  finally{pending.current=false;setBusy(false);}

 }

 async function confirm(){

  if(pending.current||!preview?.billing.can_submit||submission||((preview.request.include_categories?.length||preview.request.exclude_categories?.length)&&!categoryConfirmed))return;

  pending.current=true;setBusy(true);setError('');

  if(preview.children){try{await submitCombined(preview,{save,submit:submitSearch});}catch{setError('Could not save the combined search result. Check the saved requests before any replacement.');}finally{pending.current=false;setBusy(false);}return;}

  try{save({state:'unconfirmed',request_id:preview.request.request_id});}

  catch{setError('This browser could not save the request reference. Enable session storage before starting a search.');pending.current=false;setBusy(false);return;}

  try{const result=await submitSearch(preview.preview_token);save({...result,state:'accepted'});}

  catch(e){const code=e.response?.data?.error;

   if(errors[code]||[400,401,403,409].includes(e.response?.status)){sessionStorage.removeItem(key);setSubmission(null);setPreview(null);setError(errors[code]||'Your request was rejected. Sign in again or review the search before retrying.');}

   else setError('The submission result is uncertain. It may already be queued. Check this request below; do not create a replacement search.');

  }finally{pending.current=false;setBusy(false);}

 }

 async function reconcile(){

  if(pending.current)return;pending.current=true;setBusy(true);setError('');

  try{if(submission.state==='batch'){let children=[...submission.children];for(let i=0;i<children.length;i++){if(!uncertainChild(children[i]))continue;const result=await getSearchRequest(children[i].request_id);if(result.found){children=children.map((c,j)=>j===i?{...c,...result,state:'accepted'}:c);save({...submission,children});}}if(children.some(uncertainChild))setError('One source is still awaiting confirmation. No search was retried.');return;}const result=await getSearchRequest(submission.request_id);if(result.found)save({...result,state:'accepted'});else setError('No saved job was found yet. This does not prove the submission failed. Wait and check again, or ask your administrator to reconcile this request.');}

  catch{setError('Could not check the saved request. Keep its reference and try again later.');}

  finally{pending.current=false;setBusy(false);}

 }

 function another(){sessionStorage.removeItem(key);setSubmission(null);setPreview(null);id.current=null;setError('');}

 return <div className="live-page ns-page"><Link className="ns-back" to="/scraping"><ArrowLeft size={16}/>Back to searches</Link><div className="dp-heading"><div><h1>Find businesses</h1><p>Choose the businesses and area. Review the budget before starting.</p></div></div>

 {error&&<div className="ns-notice warning" role="alert"><AlertCircle size={18}/><p>{error}</p></div>}

 {!allowed&&<div className="ns-notice warning">Your role can view search history. Ask an owner or admin to start a search.</div>}

 {submission?<section className="ns-panel ns-result" aria-live="polite">{submission.state==='batch'?<><CheckCircle size={32}/><h2>{submission.children.every(c=>c.state==='accepted')?'Both searches are saved':'Combined search status'}</h2><ul>{submission.children.map(c=><li key={c.request_id}><strong>{sourceNames[c.source]}</strong>: {c.state==='accepted'?`Search #${c.job_id} · ${c.status}`:c.state==='not_started'?'Not started':c.state==='rejected'?'Rejected before admission':'Awaiting confirmation'}</li>)}</ul><p>Each source has its own job. No failed or uncertain search is automatically replaced.</p><Link className="ns-primary" to="/scraping">View progress<ArrowRight size={16}/></Link>{submission.children.some(uncertainChild)?<button className="live-secondary" disabled={busy} onClick={reconcile}>Check saved requests</button>:<button className="live-secondary" disabled={busy} onClick={another}>Prepare another search</button>}</>:submission.state==='accepted'?<><CheckCircle size={32}/><h2>Search #{submission.job_id} is saved</h2><p>Recorded status: {submission.status}. Gathering and later stages continue in the background. The target is not a guarantee of delivery.</p><Link className="ns-primary" to="/scraping">View progress<ArrowRight size={16}/></Link><button className="live-secondary" disabled={busy} onClick={another}>Prepare another search</button></>:<><AlertCircle size={32}/><h2>Check your previous request</h2><p>A submission is awaiting confirmation. We have not retried it.</p>{submission.request_id&&<><code>{submission.request_id}</code><button className="ns-primary" disabled={busy} onClick={reconcile}>{busy?'Checking…':'Check saved request'}</button></>}{submission.state==='storage_unavailable'&&<p>Browser session storage is unavailable. Enable it and reload before submitting a search.</p>}</>}</section>:<div className="ns-layout"><form className="ns-panel" onSubmit={review}><h2>Who are you looking for?</h2><div className="ns-examples"><span>Try an example</span>{[['Dental clinics','Islamabad, Pakistan','PK'],['Software companies','Lahore, Pakistan','PK'],['Dental clinics','Austin, Texas, USA','US']].map(([query,location,country])=><button type="button" key={location} disabled={busy} onClick={()=>{change('search_query',query);setForm(f=>({...f,location,country_code:country,source:'google_maps',include_categories:'',exclude_categories:''}));setLocationConfirmed('city');}}>{query} · {location.split(',')[0]}</button>)}</div>

 <fieldset disabled={busy||!allowed}><label><span className="help-field-title">Business type<HelpTip label="Business type">Lead quality depends on the business type you enter. Be specific, for example dental clinics, restaurants or property agents. Use a business category, rather than a company name, to find similar businesses.</HelpTip></span><span className="ns-input"><Search size={17}/><input required maxLength={120} value={form.search_query} onChange={e=>change('search_query',e.target.value)} placeholder="e.g. dental clinics"/></span></label><div className="ns-fields ns-location-fields"><LocationPicker value={form.location} country={form.country_code} confirmed={locationConfirmed} onChange={v=>change('location',v)} onSelect={v=>{change('location',v);setLocationConfirmed('city');}} onConfirmCustom={checked=>{setLocationConfirmed(checked?'custom':null);setPreview(null);setError('');id.current=null;}} disabled={busy||!allowed}/><label>Country<select value={form.country_code} onChange={e=>{change('country_code',e.target.value);setForm(f=>({...f,location:''}));if(e.target.value!=='US'&&['yellow_pages','yelp'].includes(form.source))setForm(f=>({...f,source:'google_maps'}));}}><option value="PK">Pakistan</option><option value="US">United States</option></select></label></div>

 {form.source==='maps_facebook'&&<p className="ns-help">Search Google Maps and Facebook together. Split the target and total spending ceiling between two jobs. Businesses found on both sources may overlap; the final unique count can be lower.</p>}{['facebook_pages','maps_facebook'].includes(form.source)&&<p className="ns-help">Facebook searches business Pages and their available public contact details in one run, up to 50 businesses and a $0.50 provider ceiling. Area is a search hint; review each Page’s location. Contact details may be missing. A Messenger link does not authorize automated messages.</p>}<div className="ns-fields"><label><span className="help-field-title">Source<HelpTip label="Search source">Choose where to find businesses. Choosing Google Maps + Facebook shares your budget between both. Some businesses may appear on both sites.</HelpTip></span><select value={form.source} onChange={e=>{change('source',e.target.value);setForm(f=>({...f,website_filter:'allPlaces',...(['facebook_pages','maps_facebook','yelp'].includes(e.target.value)?{max_results:Math.min(f.max_results,e.target.value==='maps_facebook'?100:50),max_cost_usd:Math.max(e.target.value==='maps_facebook'?0.02:0.01,Math.min(f.max_cost_usd,e.target.value==='maps_facebook'?1:0.5)),require_contact:true}:{})}));}}><option value="google_maps">Google Maps</option><option value="facebook_pages">Facebook business Pages</option><option value="maps_facebook">Google Maps + Facebook</option><option value="yelp" disabled={form.country_code!=='US'}>Yelp (US only)</option><option value="yellow_pages" disabled={form.country_code!=='US'}>Yellow Pages · US only</option></select></label><label><span className="help-field-title">New business target<HelpTip label="Search target">Choose how many new businesses to aim for. The total is not guaranteed: sources may return fewer matches, records may repeat or be filtered out, and spending limits may end a run. Combined searches split this target between sources.</HelpTip></span><select value={form.max_results} onChange={e=>change('max_results',Number(e.target.value))}>{(['facebook_pages','yelp'].includes(form.source)?[5,10,25,50]:form.source==='maps_facebook'?[5,10,25,50,100]:[5,10,25,50,100,250,500]).map(n=><option key={n} value={n}>{n} businesses</option>)}</select></label></div><p className="ns-help">This is a target, not a guaranteed total. Sources, filters, duplicates and spending limits can leave fewer businesses. We do not start extra paid runs automatically to fill the gap.</p>

 {form.source==='yelp'&&<p className="ns-help">Yelp searches US business listings for published phones, websites, addresses and categories. Emails may be missing. Live result quality has not been verified yet. Up to 50 businesses and a $0.50 provider ceiling per search; photos and review collection are disabled.</p>}

 {form.source==='yellow_pages'&&<p className="ns-help">Yellow Pages is implemented; its paid live result quality remains UNVERIFIED.</p>}

 <details><summary>Business, contact and website filters</summary><label>Accept categories · optional<input maxLength={1000} value={form.include_categories} onChange={e=>change('include_categories',e.target.value)} placeholder="e.g. Dental clinic, Dentist"/></label><label>Exclude categories · optional<input maxLength={1000} value={form.exclude_categories} onChange={e=>change('exclude_categories',e.target.value)} placeholder="College, School"/></label><p className="ns-help">Separate terms with commas. We check both the business name and its listed categories. Some source listings may still need your review.</p>{['facebook_pages','maps_facebook'].includes(form.source)&&<label className="ns-check"><input type="checkbox" checked={form.exclude_unrelated_page_types} onChange={e=>change('exclude_unrelated_page_types',e.target.checked)}/> Filter commonly unrelated Page types. Searches naming creators, government or associations keep those types; turn this off to keep all Page types.</label>}<label>Website<select disabled={form.source!=='google_maps'} value={form.website_filter} onChange={e=>change('website_filter',e.target.value)}><option value="allPlaces">Any website status</option><option value="withWebsite">Website listed</option><option value="withoutWebsite">No website listed on the source</option></select></label><label className="ns-check"><input type="checkbox" checked={form.require_contact} onChange={e=>change('require_contact',e.target.checked)}/>Require a phone, email or website</label><p className="ns-help">A missing source listing does not prove that a business has no website. Closed businesses are excluded.</p></details>

 <h2 className="ns-budget-title">Keep spending in your control</h2><p className="ns-help">Searches use your workspace’s own Apify account. Apify bills that account directly; platform credits are not required. <Link to="/settings#search-account">Connect or check your Apify account</Link>.</p><div className="ns-fields"><label><span className="help-field-title">Maximum provider spend (USD)<HelpTip label="Maximum provider spend">The most you allow Apify to spend on this search. A search can cost money even if it finds fewer businesses than requested.</HelpTip></span><input type="number" required min={form.source==='maps_facebook'?'0.02':'0.01'} max={['facebook_pages','yelp'].includes(form.source)?'0.50':form.source==='maps_facebook'?'1':'10'} step="0.01" value={form.max_cost_usd} onChange={e=>change('max_cost_usd',e.target.value===''?'':Number(e.target.value))}/></label>{form.billing_mode==='platform'&&<label><span className="help-field-title">Maximum workspace charge (USD)<HelpTip label="Maximum workspace charge">The most workspace credit this search can use. This is separate from your own Apify balance.</HelpTip></span><input type="number" required min="0" max="100" step="0.01" value={form.max_customer_cost_usd} onChange={e=>change('max_customer_cost_usd',e.target.value===''?'':Number(e.target.value))}/></label>}</div><p className="ns-help">{form.billing_mode==='byok'?'Apify bills your connected account directly. Its balance and billing terms still apply.':'The preview checks available organization credits and the shared provider allowance. It does not add credit.'}</p>

 <button className="ns-primary" type="submit">{busy?'Loading preview…':'Review search'}<ArrowRight size={16}/></button><p className="ns-help">Reviewing does not start scraping or reserve funds.</p></fieldset></form>

 <aside className="ns-side"><section className="ns-panel"><ShieldCheck size={25}/><h2>{preview?'Review before you start':'Search with a spending limit'}</h2>{preview?<><dl className="ns-summary"><div><dt>Business type</dt><dd>{preview.request.search_query}</dd></div><div><dt>Area</dt><dd>{preview.request.location}</dd></div><div><dt>Sources</dt><dd>{sourceNames[preview.request.source]}</dd></div><div><dt>Requested businesses</dt><dd>{preview.request.max_results} new businesses</dd></div>{preview.request.include_categories?.length>0&&<div><dt>Accept categories</dt><dd>{preview.request.include_categories.join(', ')}</dd></div>}{preview.request.exclude_categories?.length>0&&<div><dt>Exclude categories</dt><dd>{preview.request.exclude_categories.join(', ')}</dd></div>}{preview.children&&preview.children.map(child=><div key={child.request.source}><dt>{sourceNames[child.request.source]}</dt><dd>{child.request.max_results} businesses · ${child.request.max_cost_usd.toFixed(2)} ceiling</dd></div>)}<div><dt>Records we may check</dt><dd>{preview.candidate_limit} source records</dd></div><div><dt>Maximum Apify spend</dt><dd>${preview.request.max_cost_usd.toFixed(2)}</dd></div><div><dt>Billed to</dt><dd>{preview.request.billing_mode==='byok'?'Your Apify account':'Workspace credits'}</dd></div></dl><div className={`ns-notice ${preview.billing.can_submit?'ready':'warning'}`}>{preview.billing.can_submit?'Budget checks passed. Admission checks them again before reserving funds.':errors[preview.billing.reason]||'This account does not currently have enough budget or credits. No search has started.'}</div>{(preview.request.include_categories?.length>0||preview.request.exclude_categories?.length>0)&&<label className="ns-check"><input type="checkbox" checked={categoryConfirmed} onChange={e=>setCategoryConfirmed(e.target.checked)} disabled={busy}/>I checked that these category filters match the businesses I want. Incorrect filters can remove useful results.</label>}{locationConfirmed==='custom'&&<p className="ns-help">Custom area: its spelling and location have not been verified by the city list.</p>}<p className="ns-help">Review valid for 10 minutes. Starting authorizes {preview.children?'both bounded searches and their separate reservations. Admission can accept one source while blocking the other.':'this bounded scraping job and its reservation.'}</p><button className="ns-primary" disabled={busy||!preview.billing.can_submit||!allowed||((preview.request.include_categories?.length||preview.request.exclude_categories?.length)&&!categoryConfirmed)} onClick={confirm}>{busy?'Submitting…':'Confirm and start search'}</button></>:<><p>Existing businesses are shown separately and do not count toward your new-business target.</p><ul><li>One bounded run per selected source; no automatic paid refill.</li><li>Filters and duplicates may leave fewer businesses than requested.</li><li>Progress updates while gathering, cleaning and assessment continue.</li><li>This action does not authorize outreach.</li></ul></>}</section></aside></div>}</div>;

}

