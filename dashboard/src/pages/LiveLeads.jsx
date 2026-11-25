import HelpTip from '../components/HelpTip';
import LeadExport from '../components/LeadExport';

import LeadImports from '../components/LeadImports';

import './LeadTransfers.css';

import React,{useCallback,useEffect,useState}from'react';

import {Search,RefreshCw,ArrowUpRight}from'lucide-react';

import{Link,useLocation,useNavigate,useSearchParams}from'react-router-dom';

import {getLeads}from'../api/client';

import useReadList from'../hooks/useReadList';

import {ReadFeedback,Pagination}from'./ReadListParts';

import './LiveData.css';

import './LeadDetail.css';

export default function LiveLeads(){

  const location=useLocation(),navigate=useNavigate(),[scope]=useSearchParams(),searchId=scope.get('search_id')||undefined,importId=scope.get('import_id')||undefined;

  const saved=location.state?.leadList||{};
  const[showImports,setShowImports]=useState(false),[stage,setStage]=useState(saved.stage||'cleaned');

  useEffect(()=>{setPage(location.state?.leadList?.page||1);},[searchId,importId,location.state]);

  function openLead(event,id){if(event.defaultPrevented||event.target.closest('a,button,input,select,textarea')||window.getSelection()?.toString())return;const url=`/leads/${id}`;if(event.button===1||event.ctrlKey||event.metaKey){event.preventDefault();window.open(url,'_blank','noopener,noreferrer');}else if(event.button===0)navigate(url,{state:{from:location.pathname+location.search,leadList:{query,contact,stage,page}}});}

  const [input,setInput]=useState(saved.query||''),[query,setQuery]=useState(saved.query||''),[contact,setContact]=useState(saved.contact||'all'),[page,setPage]=useState(saved.page||1);

  const fetchPage=useCallback(()=>getLeads({page,limit:25,q:query,contact,...(searchId?{search_id:searchId}:{}),...(importId?{import_id:importId}:{}),...(stage!=='cleaned'?{stage}:{})}),[page,query,contact,searchId,importId,stage]);

  const state=useReadList(fetchPage),{data,loading,refresh,error}=state;

  return <div className="live-page"><div className="dp-heading"><div><h1>{searchId?`Leads from search #${searchId}`:importId?`Leads from import #${importId}`:'Leads'}</h1><p>Review your saved businesses and open a lead to see its details.</p></div><button className="live-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>

    {(searchId||importId)&&<p className="pr-note"><Link to="/leads">All leads</Link> · Only businesses linked to this {searchId?'search':'import'} are shown. Cleaning may still be processing.</p>}<div className="lead-page-actions"><button className="live-secondary" onClick={()=>setShowImports(v=>!v)} aria-expanded={showImports}>{showImports?'Hide CSV imports':'Upload or view CSV imports'}</button></div>{showImports&&<LeadImports/>}<LeadExport filters={{q:query,contact,...(searchId?{search_id:searchId}:{}),...(importId?{import_id:importId}:{})}}/>

    <form className="live-filters" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(input.trim());}}><label className="dp-search-field"><Search size={17}/><input aria-label="Search business, city or category" value={input} maxLength={120} onChange={e=>setInput(e.target.value)} placeholder="Business, city or category"/></label><label className="live-select">Email address<select value={contact} onChange={e=>{setContact(e.target.value);setPage(1);}}><option value="all">All records</option><option value="email_found">Email found</option><option value="email_missing">Email missing</option></select></label><label className="live-select"><span className="help-field-title">Lead preparation<HelpTip label="Lead preparation">Choose leads with our research, research you uploaded, or past outreach. Uploaded research still needs review before sending.</HelpTip></span><select value={stage} onChange={e=>{setStage(e.target.value);setPage(1);}}><option value="cleaned">All cleaned businesses</option><option value="enriched">System enrichment recorded</option><option value="provided_enriched">Uploaded as enriched (user provided)</option><option value="outreach">Outreach activity recorded</option></select></label><button className="dp-primary" type="submit">Search</button></form>

    <ReadFeedback {...state}/>

    {data&&<><div className="dp-table-wrap"><table><caption className="dp-sr-only">Organization business leads</caption><thead><tr>{['Business','Location','Email','Phone','Business checks'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{data.leads.map(lead=><tr className="lm-lead-row" key={lead.id} onClick={e=>openLead(e,lead.id)} onAuxClick={e=>{if(e.button===1)openLead(e,lead.id);}}><td data-label="Business"><Link className="live-lead-link" state={{from:location.pathname+location.search,leadList:{query,contact,stage,page}}} to={`/leads/${lead.id}`}><strong>{lead.company_name||'Unnamed business'}</strong></Link><small className="dp-cell-note">{lead.category||'Category not recorded'}</small></td><td data-label="Location">{[lead.city,lead.country].filter(Boolean).join(', ')||'Not recorded'}</td><td data-label="Email">{lead.email||'Not found'}</td><td data-label="Phone">{lead.phone||'Not found'}</td><td data-label="Business checks"><span className="dp-status">{lead.last_assessed_at?'Business checks saved':'Not checked yet'}</span><ArrowUpRight className="lm-row-arrow" size={16} aria-hidden="true"/></td></tr>)}</tbody></table>{!data.leads.length&&<div className="dp-empty"><h2>No matching leads</h2><p>{query||contact!=='all'?'Try another search or email filter.':'Cleaned businesses will appear here as processing completes.'}</p></div>}</div><Pagination data={data} page={page} setPage={setPage} loading={loading}/></>}

    {!loading&&!data&&!error&&<p>No records available.</p>}<p className="live-footnote">A discovered email is not proof of delivery or permission to contact. An assessment record does not guarantee its freshness or completeness.</p>

  </div>;

}

