import './RequestStrategy.css';
import HelpTip from './HelpTip';
import React,{useCallback,useRef,useState}from'react';

import{useAuth}from'../context/AuthContext';
import{Link}from'react-router-dom';

import{getLeads,getJobs,getLeadImports,requestStrategy,getStrategyRequest}from'../api/client';

import useReadList from'../hooks/useReadList';

import{ReadFeedback}from'../pages/ReadListParts';

const readinessMessages={PLUS_REQUIRED:'This campaign uses a Plus channel. Choose Free channels in campaign preferences or arrange Plus access.',STRATEGY_SERVICE_UNAVAILABLE:'Strategy management is not available yet.',STRATEGY_PROCESSING_PAUSED:'Strategy processing is paused.',STRATEGY_AI_ALLOWANCE_REQUIRED:'AI generation needs an enabled request allowance.',STRATEGY_AI_LIMIT_REACHED:'The monthly AI request allowance has been used.',STRATEGY_MODE_UNSUPPORTED:'Choose AI or template mode explicitly.',STRATEGY_CAMPAIGN_NOT_FOUND:'This campaign is not available.',STRATEGY_READINESS_UNCONFIRMED:'Strategy readiness could not be confirmed.'};
const failureMessages={CUSTOMER_TEMPLATE_INVALID:'The saved email could not be prepared. Edit it and save again. The sender line and opt-out line are added automatically.',CUSTOMER_PLAN_OR_CONTEXT_CHANGED:'The campaign or business details changed. Refresh the campaign and prepare a new draft.',INPUT_CHANGED:'The campaign or business details changed. Prepare a new draft.',PLUS_REQUIRED:'This campaign needs a Plus channel. Choose a Free channel or check your workspace package.'};

export default function RequestStrategy({campaignId,readiness}){

 const{user,organization}=useAuth(),key=`lg_strategy_${user.subject}_${organization.org_id}_${campaignId}`;

 const[source,setSource]=useState('all'),[sourceId,setSourceId]=useState(''),[stage,setStage]=useState('cleaned');

 const fetchSources=useCallback(async()=>source==='search'?{items:(await getJobs({page:1,limit:100})).jobs.map(j=>({id:j.id,name:j.job_name||j.search_query||`Search ${j.id}`}))}:source==='import'?{items:(await getLeadImports()).imports.map(b=>({id:b.id,name:b.filename}))}:{items:[]},[source]),sources=useReadList(fetchSources);

 const[query,setQuery]=useState(''),[input,setInput]=useState(''),[lead,setLead]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');

 const[record,setRecord]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return{uncertain:true};}}),pending=useRef(false);

 const fetchLeads=useCallback(()=>source!=='all'&&!sourceId?Promise.resolve({leads:[],observed_at:new Date().toISOString()}):getLeads({q:query,limit:25,...(sourceId&&source==='search'?{search_id:sourceId}:{}),...(sourceId&&source==='import'?{import_id:sourceId}:{}),...(stage!=='cleaned'?{stage}:{})}),[query,source,sourceId,stage]),leads=useReadList(fetchLeads);

 const allowed=['owner','admin'].includes(organization.role);

 const generationReady=readiness?.generation_allowed===true;

 function save(value){sessionStorage.setItem(key,JSON.stringify(value));setRecord(value);}

 async function submit(e){e.preventDefault();if(pending.current||!lead||!confirmed||record||!allowed||!generationReady||source!=='all'&&!sourceId)return;pending.current=true;setBusy(true);setError('');

  const id='dash_'+[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');

  try{save({request_id:id,uncertain:true});}catch{setError('Enable session storage before requesting a strategy.');pending.current=false;setBusy(false);return;}

  try{save({...await requestStrategy({campaign_id:Number(campaignId),lead_id:Number(lead),request_id:id}),request_id:id});}

  catch(e){if([400,401,403,409].includes(e.response?.status)){sessionStorage.removeItem(key);setRecord(null);setError(readinessMessages[e.response?.data?.error]||'Request rejected. Check access, campaign eligibility and queue capacity before retrying.');}else setError('The response is uncertain. Check this request below; do not create a replacement.');}

  finally{pending.current=false;setBusy(false);}

 }

 async function check(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{const r=await getStrategyRequest(record.request_id);if(r.found)save({...record,...r,uncertain:false});else setError('No saved request was found yet. This does not prove the request failed. Wait and check again.');}catch{setError('Progress could not be loaded. Check again later.');}finally{pending.current=false;setBusy(false);}}

 const needsSource=source!=='all'&&!sourceId;
 const selectedBusiness=leads.data?.leads.find(l=>String(l.id)===String(lead));
 return <section className="draft-builder" aria-label="Prepare a business message">
  <div className="draft-intro"><h2>Prepare a message</h2><p>Choose one business. We use this campaign’s offer and settings to prepare its draft for review.</p><span className={`draft-readiness ${generationReady?'ready':'blocked'}`} role="status">{generationReady?'Ready to write':'Check campaign setup'}{readiness?.mode==='template'?<span> · Uses your saved email text</span>:Number.isSafeInteger(readiness?.requests_remaining)&&<span> · {readiness.requests_remaining} draft requests left this month</span>}</span></div>
  {!generationReady&&<div className="pr-warning"><ul>{(readiness?.reasons?.length?readiness.reasons:['STRATEGY_READINESS_UNCONFIRMED']).map(reason=><li key={reason}>{readinessMessages[reason]||'We could not check whether drafts can be prepared. Try refreshing the campaign.'}</li>)}</ul></div>}
  {error&&<p role="alert" className="pr-warning">{error}</p>}
  {record?<section className="draft-result" aria-label="Draft progress"><h3>{record.status==='completed'?'Your message is saved':record.status==='failed'?'This draft could not be prepared':'Check your message'}</h3><p>{record.job_id?`Job #${record.job_id} · ${record.status||'Accepted'}`:'Waiting for confirmation'}{record.plan_id?` · Saved plan #${record.plan_id}`:''}</p>{record.status==='failed'&&<><p className="pr-note">{failureMessages[record.error_code]||'Review the campaign email and business details, then prepare a new draft.'}</p>{record.error_code==='CUSTOMER_TEMPLATE_INVALID'&&<Link className="live-secondary" to={`/campaigns/${campaignId}/preferences`}>Fix campaign email</Link>}</>}<div className="draft-actions"><button className="live-secondary" disabled={busy||!record.request_id} onClick={check}>{busy?'Checking…':'Check request progress'}</button>{['completed','failed','superseded'].includes(record.status)&&<button className="live-secondary" onClick={()=>{sessionStorage.removeItem(key);setRecord(null);setLead('');setConfirmed(false);}}>Prepare another request</button>}</div><p className="pr-note">{record.status==='completed'?'Go to Review messages to read it.':record.status==='failed'?'No email was sent. Fix the campaign and prepare a fresh draft.':'Check this message before starting another.'}</p></section>:<>
   <form className="draft-source-form" onSubmit={e=>{e.preventDefault();setQuery(input.trim());setLead('');setConfirmed(false);}}>
    <fieldset className="draft-section"><legend>Choose a lead</legend><p>Use all saved businesses, or narrow the list to one search or uploaded file.</p>
     <div className="draft-fields"><label className="live-select"><span className="help-field-title">Lead source<HelpTip label="Lead source">Choose all saved leads, one search or one CSV import. Then select the business whose message you want to prepare.</HelpTip></span><select value={source} onChange={e=>{setSource(e.target.value);setSourceId('');setLead('');setConfirmed(false);}}><option value="all">All saved leads</option><option value="search">A specific search</option><option value="import">A CSV import</option></select></label>
     {source!=='all'&&<label className="live-select"><span className="help-field-title">{source==='search'?'Choose a search':'Choose an uploaded file'}</span><select value={sourceId} disabled={sources.loading} onChange={e=>{setSourceId(e.target.value);setLead('');setConfirmed(false);}}><option value="">{sources.loading?'Loading…':source==='search'?'Choose a search':'Choose an import'}</option>{sources.data?.items.map(s=><option key={s.id} value={s.id}>{s.name} · #{s.id}</option>)}</select></label>}</div>
     {sources.error&&<p role="alert">This list could not be loaded. <button type="button" className="live-secondary" onClick={sources.refresh}>Try again</button></p>}
     <div className="draft-find"><label className="live-select">Find a business<input maxLength={120} value={input} onChange={e=>setInput(e.target.value)} placeholder="Business name, category or city"/></label><button className="live-secondary" type="submit" disabled={needsSource}>Search this list</button></div>
     <details className="draft-extra"><summary>More lead filters</summary><label className="live-select"><span className="help-field-title">Lead preparation<HelpTip label="Lead preparation">Choose leads with our research or research you uploaded. We check the selected lead again before writing its message.</HelpTip></span><select value={stage} onChange={e=>{setStage(e.target.value);setLead('');setConfirmed(false);}}><option value="cleaned">All cleaned leads</option><option value="enriched">System enrichment recorded</option><option value="provided_enriched">Uploaded as enriched (user provided)</option><option value="outreach">Outreach activity recorded</option></select></label></details>
    </fieldset>
   </form>
   <form onSubmit={submit}>
    <fieldset className="draft-section"><legend>2. Select a business</legend>
     {needsSource?<p>Choose {source==='search'?'a search':'an uploaded file'} above to see its businesses.</p>:<><ReadFeedback {...leads}/>{!leads.loading&&leads.data?.leads.length===0&&<p className="pr-note">No businesses match. Try a different source or filter, or wait for lead processing to finish.</p>}</>}
     <label className="live-select">Business<select aria-label="Select business" required disabled={busy||!allowed||leads.loading||needsSource} value={lead} onChange={e=>{setLead(e.target.value);setConfirmed(false);}}><option value="">Choose a business</option>{!needsSource&&leads.data?.leads.map(l=><option key={l.id} value={l.id}>{l.company_name||`Lead ${l.id}`}{l.city?` · ${l.city}`:''}</option>)}</select></label>
     {!needsSource&&leads.data?.leads.length>0&&<p className="draft-small">Showing up to 25 matches. Use the search above if your business is missing.</p>}
    </fieldset>
    <fieldset className="draft-section draft-confirm"><legend>3. Prepare its draft</legend>
     <p>{selectedBusiness?<>Prepare a message for <strong>{selectedBusiness.company_name||'this business'}</strong> using this campaign’s offer.</>:'Select a business above to continue.'}</p>
     <label className="draft-check"><input type="checkbox" disabled={busy||!allowed||!lead} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I want to prepare this draft using the campaign’s available allowance.</span></label>
     <button className="ns-primary" disabled={busy||!allowed||!lead||!confirmed||!generationReady||needsSource} type="submit">{busy?'Preparing…':'Prepare draft'}</button>
     {!busy&&(!allowed||!lead||!confirmed||!generationReady||needsSource)&&<p className="draft-small" role="status">{!allowed?'Only a workspace owner or admin can prepare drafts.':!generationReady?'Check campaign setup above before preparing a draft.':needsSource?'Choose a search or uploaded file above.':!lead?'Choose a business above.':'Check the confirmation box to enable this button.'}</p>}
     <p className="draft-small">Read and approve the message before sending.</p>{!allowed&&<p className="pr-note">Only workspace owners and admins can prepare drafts.</p>}
    </fieldset>
   </form>
  </>}
 </section>;
}
