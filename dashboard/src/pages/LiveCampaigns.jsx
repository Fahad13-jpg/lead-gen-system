import {Link} from 'react-router-dom';
import React,{useCallback,useState}from'react';
import{RefreshCw,Layers,ArrowRight}from'lucide-react';
import{getCampaigns}from'../api/client';
import{uiLabel}from'../uiText';
import useReadList from'../hooks/useReadList';
import{ReadFeedback,Pagination}from'./ReadListParts';
import'./LiveData.css';
import'./Campaigns.css';
import'./NewSearch.css';
export default function LiveCampaigns(){
 const[page,setPage]=useState(1),fetchPage=useCallback(()=>getCampaigns({page,limit:10}),[page]);
 const state=useReadList(fetchPage,60000),{data,loading,refresh}=state;
 return <div className="live-page cp-page"><div className="dp-heading"><div><h1>Campaigns</h1><p>Create campaigns, review messages and contact leads.</p></div><button className="live-secondary" disabled={loading} onClick={refresh}><RefreshCw size={16}/>Refresh</button></div><p className="cp-count"><Link className="ns-primary" to="/campaigns/new">Create campaign</Link></p><ReadFeedback {...state}/>
 {data&&<><div className="cp-count">{data.total.toLocaleString()} saved campaigns</div><section className="cp-list" aria-label="Saved campaigns">{data.campaigns.map(c=><article className="cp-campaign" key={c.id}><header><span className="cp-icon"><Layers size={23}/></span><div><h2><Link to={`/campaigns/${c.id}`}>{c.name||`Campaign ${c.id}`}</Link></h2><p>{c.mode==='ai'?'Drafts written for you':c.mode==='template'?'Your own email text':'Campaign'}</p></div></header><div className="cp-body"><div className="cp-offer"><h3>The offer</h3><p>{c.offer||'Offer description not recorded'}</p><h3>Requested next step</h3><p className="cp-cta"><ArrowRight size={15}/>{c.cta||'Call to action not recorded'}</p><div className="cp-channels" aria-label="Configured channels">{c.channels.length?c.channels.map((v,i)=><span key={i}>{v==='call'?'Phone call':v==='linkedin'?'LinkedIn':v==='whatsapp'?'WhatsApp':uiLabel(v)}</span>):<span>No channels recorded</span>}</div></div><dl className="cp-metrics"><div><dt>Messages</dt><dd>{c.plans}</dd></div><div><dt>Approved</dt><dd>{c.approval_records}</dd></div><div><dt>Need a new draft</dt><dd>{c.expired}</dd></div></dl></div><footer><div className="lm-campaign-next"><span>{c.lifecycle?.label||'Review plans before sending'}</span><Link to={['view_progress','reconcile','review_cost'].includes(c.lifecycle?.next_action?.code)?'/outreach':`/campaigns/${c.id}`}>{c.lifecycle?.next_action?.label||'Open campaign'} <ArrowRight size={16}/></Link></div>{c.lifecycle?.description&&<p className="lm-status-description">{c.lifecycle.description}</p>}<details><summary>About these counts</summary><p>These counts show the current campaign. Open it to check which messages are ready.</p></details></footer></article>)}</section>{!data.campaigns.length&&<div className="dp-empty"><Layers size={30}/><h2>No campaigns saved yet</h2><p>Create your first campaign to choose an offer, audience and outreach channels.</p></div>}<Pagination data={data} page={page} setPage={setPage} loading={loading}/></>}
 <p className="live-footnote">Open a campaign to see what to do next.</p></div>;
}
