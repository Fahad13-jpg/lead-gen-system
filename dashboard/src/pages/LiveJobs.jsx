import {Link} from 'react-router-dom';
import React,{useCallback,useEffect,useState}from'react';
import{RefreshCw,Search,MapPin,Layers,CheckCircle,AlertCircle,Clock,Filter}from'lucide-react';
import{ResponsiveContainer,PieChart,Pie,Cell,Tooltip,BarChart,Bar,CartesianGrid,XAxis,YAxis}from'recharts';
import{getJobs,getAssessmentReviews}from'../api/client';
import{getCleaningReviews,skipCleaningReview}from'../api/client';
import{useAuth}from'../context/AuthContext';
import{uiLabel}from'../uiText';
import useReadList from'../hooks/useReadList';
import{ReadFeedback,Pagination}from'./ReadListParts';
import'./LiveData.css';
import'./SearchProgress.css';
import'./NewSearch.css';
const groups=[{key:'active',label:'In progress',short:'In progress',color:'var(--lm-ink)',icon:Clock},{key:'finished',label:'Finished',short:'Finished',color:'var(--lm-success)',icon:CheckCircle},{key:'attention',label:'Needs attention',short:'Needs attention',color:'var(--lm-warning)',icon:AlertCircle},{key:'other',label:'Stopped or other',short:'Other',color:'var(--lm-secondary)',icon:Layers}];
const stages=[{key:'staged_count',label:'Businesses found',color:'var(--lm-ink)'},{key:'cleaned_count',label:'Businesses organized',color:'#FFC93C'},{key:'assessed_count',label:'Business checks saved',color:'var(--lm-success)'}];
export function jobGroup(value){
 const job=value&&typeof value==='object'?value:null,status=job?.lifecycle?.status||job?.status||value;
 if(['failed','needs_review','needs_attention'].includes(status))return 'attention';
 if(['cancelled','stopped'].includes(status))return 'other';
 if(['queued','pending','running','scheduled','stopping'].includes(status))return 'active';
 if(job&&!job.lifecycle){
  if(job.cleaning_review_count>0||job.basic_failed_count>0)return 'attention';
  if(job.cleaning_active_count>0||job.basic_pending_count>0||job.basic_processing_count>0)return 'active';
 }
 return status==='completed'?'finished':'other';
}
const recorded=v=>Number.isInteger(v)&&v>=0;
const count=v=>recorded(v)?v.toLocaleString():'Not recorded';
export function SearchElapsed({job}){
 const active=jobGroup(job)==='active';
 const[now,setNow]=useState(Date.now());
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active]);
 if(!active)return null;
 const started=Date.parse(job.started_at||job.created_at||'');
 const seconds=Number.isFinite(started)?Math.max(0,Math.floor((now-started)/1000)):null;
 const minutes=Math.floor((seconds||0)/60),hours=Math.floor((seconds||0)/3600),remainingMinutes=Math.floor((seconds||0)%3600/60);
 const elapsed=seconds===null?'':seconds<60?`${seconds} ${seconds===1?'second':'seconds'}`:seconds<3600?`${minutes} ${minutes===1?'minute':'minutes'}`:seconds<86400?`${hours} ${hours===1?'hour':'hours'} ${remainingMinutes} ${remainingMinutes===1?'minute':'minutes'}`:'over a day';
 return <p className="sp-elapsed" aria-label={elapsed?`Search started ${elapsed} ago`:'Search is in progress'}><Clock size={15}/>{elapsed?`Started ${elapsed} ago. `:'Search is in progress. '}This page checks for updates every 30 seconds.</p>;
}
function SavedStages({job}){
 const max=Math.max(1,...stages.map(s=>recorded(job[s.key])?job[s.key]:0));
 return <div className="sp-stages" aria-label="Saved processing counts">{stages.map(s=><div className="sp-stage" key={s.key}><div><span><i style={{background:s.color}}/>{s.label}</span><strong>{count(job[s.key])}</strong></div><div className="sp-track" aria-hidden="true"><div style={{transform:`scaleX(${recorded(job[s.key])?job[s.key]/max:0})`,background:s.color}}/></div></div>)}</div>;
}
export function AssessmentProgress({job}){
 const fields=[['basic_current_count','Recently checked'],['basic_pending_count','Waiting to be checked'],['basic_processing_count','Checking now'],['basic_failed_count','Could not be checked']];
 if(!fields.every(([key])=>recorded(job[key])))return null;
 return <section className="sp-assessment-progress" aria-label="Business assessment progress"><dl>{fields.map(([key,label])=><div key={key} className={key==='basic_failed_count'&&job[key]>0?'sp-check-warning':''}><dt>{label}</dt><dd>{count(job[key])}</dd></div>)}</dl><p>Some details may still be missing. A business can appear in more than one count. Older information stays saved if a new check fails.</p>{job.basic_failed_count>0&&<p className="sp-check-warning">Some websites could not be checked. Use View leads from this search below to review the saved details before sending messages.</p>}</section>;
}
export function GatheringOutcome({job}){
 if(!['new','matching'].includes(job.result_mode))return <p className="sp-recorded-status">Historical search: new-business and shortfall details were not recorded.</p>;
 const reasons={target_reached:'Target reached',candidate_limit_reached:'Candidate allowance reached',source_or_provider_limit:'Source or provider limit reached',cached_matches:'Reused saved matches',cancelled:'Search cancelled',queue_expired:'Queue time limit reached',provider_failed:'Provider search failed'};
 const terminal=['completed','failed','cancelled'].includes(job.status);
 return <section className="sp-assessment-progress" aria-label="Gathering outcome"><dl>
 <div><dt>Existing matches</dt><dd>{count(job.existing_match_count)}</dd></div>
 <div><dt>{terminal?'Fewer than requested':'Still needed'}</dt><dd>{terminal?count(job.target_shortfall):'Still gathering'}</dd></div>
 <div><dt>Search goal</dt><dd className="sp-outcome-mode">{job.result_mode==='new'?'New businesses':'Matching businesses'}</dd></div>
 </dl><p>{reasons[job.completion_reason]||(!terminal?'Other stages can continue after gathering ends.':'Completion details not recorded.')}</p><p>Existing matches and duplicate source records are separate counts.</p></section>;
}
function CleaningReviewPanel({job,canManage,onChanged}){
 const[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[rows,setRows]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await getCleaningReviews(job.id);setRows(result.reviews||[]);}catch{setError('The businesses needing review could not be loaded. Refresh and try again.');}finally{setLoading(false);}},[job.id]);
 const toggle=e=>{const next=e.currentTarget.open;setOpen(next);if(next&&!rows.length&&!loading)load();};
 async function skip(row){setBusy(String(row.staging_id));setError('');setMessage('');try{await skipCleaningReview({job_id:job.id,staging_id:row.staging_id});setRows(current=>current.filter(item=>item.staging_id!==row.staging_id));setMessage('Marked reviewed. This business remains out of your leads.');onChanged?.();}catch(e){const code=e?.response?.data?.error;setError(code==='ROLE_REQUIRED'?'Only workspace owners and admins can close this alert.':'The review could not be saved. Refresh and try again.');}finally{setBusy('');}}
 if(!Number.isInteger(job.cleaning_review_count)||job.cleaning_review_count<1)return null;
 return <details className="sp-review-details" onToggle={toggle}><summary>Review {job.cleaning_review_count===1?'one business':`${job.cleaning_review_count} businesses`}</summary><p className="sp-review-intro">These businesses were held back because their details were not clear enough to add as leads.</p>{loading&&<p role="status">Loading businesses needing review…</p>}{error&&<p className="sp-review-error" role="alert">{error}</p>}{message&&<p className="sp-review-success" role="status">{message}</p>}{open&&!loading&&!rows.length&&!error&&<p>No businesses are waiting for review.</p>}<ul className="sp-review-list">{rows.map(row=><li key={row.staging_id}><div className="sp-review-copy"><strong>{row.company_name||'Business name not recorded'}</strong><span>{[row.category,row.city,row.state].filter(Boolean).join(' · ')||'Location not recorded'}{row.source?` · ${uiLabel(row.source)}`:''}</span><p>{row.reason}</p></div>{canManage&&<button type="button" className="live-secondary" disabled={busy===String(row.staging_id)} onClick={()=>skip(row)}>{busy===String(row.staging_id)?'Saving…':'Mark reviewed and skip'}</button>}</li>)}</ul>{!canManage&&<p className="sp-review-note">Ask a workspace owner or admin to mark these businesses reviewed.</p>}</details>;
}
function AssessmentReviewPanel({job}){
 const[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[rows,setRows]=useState([]),[error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await getAssessmentReviews(job.id);setRows(result.reviews||[]);}catch{setError('The failed business check could not be loaded. Refresh and try again.');}finally{setLoading(false);}},[job.id]);
 const toggle=e=>{const next=e.currentTarget.open;setOpen(next);if(next&&!rows.length&&!loading)load();};
 if(!Number.isInteger(job.basic_failed_count)||job.basic_failed_count<1)return null;
 return <details className="sp-review-details" onToggle={toggle}><summary>Review {job.basic_failed_count===1?'one failed business check':`${job.basic_failed_count} failed business checks`}</summary><p className="sp-review-intro">The check did not finish for these businesses. Their saved lead information is still available.</p>{loading&&<p role="status">Loading businesses needing review…</p>}{error&&<p className="sp-review-error" role="alert">{error}</p>}{open&&!loading&&!rows.length&&!error&&<p>No failed business checks were found.</p>}<ul className="sp-review-list">{rows.map(row=><li key={row.lead_id}><div className="sp-review-copy"><strong>{row.company_name||'Business name not recorded'}</strong><span>{[row.category,row.city,row.state].filter(Boolean).join(' · ')||'Location not recorded'}</span><p>{row.reason}</p></div><Link className="live-secondary" to={`/leads/${row.lead_id}`}>Open lead</Link></li>)}</ul></details>;
}
function ChartSummary({jobs,filter,setFilter}){
 const statusData=groups.map(g=>({...g,value:jobs.filter(j=>jobGroup(j)===g.key).length}));
 const visible=filter==='all'?jobs:jobs.filter(j=>jobGroup(j)===filter);
 return <div className="sp-charts"><section className="sp-panel"><div className="sp-panel-heading"><h2>Search status</h2><span>Includes business checks</span></div><div className="sp-donut-layout"><div className="sp-donut" role="img" aria-label={statusData.map(g=>`${g.label} ${g.value}`).join(', ')}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData.filter(g=>g.value>0)} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="70%" outerRadius="94%" paddingAngle={3} stroke="none" isAnimationActive={false}>{statusData.filter(g=>g.value>0).map(g=><Cell key={g.key} fill={g.color}/>)}</Pie></PieChart></ResponsiveContainer><div className="sp-donut-total"><strong>{jobs.length}</strong><span>on this page</span></div></div><div className="sp-status-legend">{statusData.map(({key,label,value,color,icon:Icon})=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(filter===key?'all':key)}><span className="sp-legend-icon" style={{color}}><Icon size={16}/></span><span>{label}</span><strong>{value}</strong></button>)}</div></div></section>
 <section className="sp-panel"><div className="sp-panel-heading"><h2>Business progress</h2><span>{visible.length} shown</span></div><p className="sp-chart-caption">See how many businesses were found, organized and checked.</p>{visible.length?<div className="sp-bar-chart" role="img" aria-label="Grouped bars comparing gathered, cleaned and assessed counts for the displayed searches. Exact counts appear in the search cards below."><ResponsiveContainer width="100%" height="100%"><BarChart data={visible.map(j=>({...j,name:`#${j.id}`}))} margin={{top:8,right:0,left:-22,bottom:0}} barGap={3}><CartesianGrid vertical={false} stroke="var(--lm-line)" strokeDasharray="3 3"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:13,fill:'var(--lm-secondary)'}}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{fontSize:13,fill:'var(--lm-secondary)'}}/><Tooltip cursor={{fill:'var(--lm-soft)'}} labelFormatter={label=>`Search ${label}`}/>{stages.map(s=><Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3,3,0,0]} maxBarSize={20} isAnimationActive={false}/>)}</BarChart></ResponsiveContainer></div>:<p className="sp-chart-empty">No searches in this status on this page.</p>}<div className="sp-chart-key">{stages.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.label}</span>)}</div></section></div>;
}
export default function LiveJobs(){
 const{organization}=useAuth();
 const[page,setPage]=useState(1),[filter,setFilter]=useState('all');
 const fetchPage=useCallback(()=>getJobs({page,limit:10}),[page]);
 const state=useReadList(fetchPage,30000),{data,loading,refresh}=state;
 const jobs=data?.jobs||[],visible=filter==='all'?jobs:jobs.filter(j=>jobGroup(j)===filter);
 function changePage(next){setFilter('all');setPage(next);}
 return <div className="live-page sp-page"><div className="dp-heading"><div><h1>Search progress</h1><p>See what’s running, what needs attention and how your leads are moving.</p></div><div className="ns-heading-actions"><a className="ns-primary" href="/scraping/new">New search</a><button className="live-secondary" disabled={loading} onClick={refresh}><RefreshCw size={16}/>Refresh</button></div></div>
 <div className="sp-refresh-note"><span><span className="sp-live-dot"/>Updates every 30 seconds while this tab is visible</span><span>Read-only · No credits spent by viewing</span></div><ReadFeedback {...state}/>
 {data&&<>{jobs.length>0&&<><div className="sp-page-scope">Showing {jobs.length} of {data.total.toLocaleString()} searches. Businesses can appear in more than one search.</div><ChartSummary jobs={jobs} filter={filter} setFilter={setFilter}/></>}
 <div className="sp-list-heading"><h2>Your searches</h2><span><Filter size={14}/>Filter this page</span></div><div className="sp-filter-tabs" role="group" aria-label="Filter searches on this page">{[{key:'all',short:'All searches'},...groups].map(g=><button key={g.key} aria-pressed={filter===g.key} onClick={()=>setFilter(g.key)}>{g.short}<span>{g.key==='all'?jobs.length:jobs.filter(j=>jobGroup(j)===g.key).length}</span></button>)}</div>
 <div className="live-jobs">{visible.map(job=>{const group=groups.find(g=>g.key===jobGroup(job)),progress=job.lifecycle,badge=groups.find(g=>g.key===(progress?.status==='needs_attention'?'attention':['running','scheduled','stopping'].includes(progress?.status)?'active':progress?.status==='completed'?'finished':group.key)),Icon=badge.icon;return <article className="dp-search-job sp-job" key={job.id}><div className="dp-job-name"><span className="dp-search-icon"><Search size={20}/></span><div><h2>{job.job_name?.replace(/\s+[—–]\s+/g,' in ')||job.search_query||`Search ${job.id}`}</h2><p><MapPin size={13}/>{job.location||'Location not recorded'}<span>·</span>{uiLabel(job.source)}</p></div><span className={`sp-state ${badge.key}`}><Icon size={13}/>{progress?.label||group.label}</span></div><SearchElapsed job={job}/>{job.lifecycle&&<div className="lm-health">{job.lifecycle.description&&<p className="lm-status-description">{job.lifecycle.description}</p>}{job.lifecycle.next_action?.label&&<p className="lm-status-description">Next you can {job.lifecycle.next_action.label}</p>}</div>}<SavedStages job={job}/><details className="lm-search-details"><summary>Search results and business checks</summary><AssessmentProgress job={job}/><GatheringOutcome job={job}/></details><CleaningReviewPanel job={job} canManage={['owner','admin'].includes(organization?.role)} onChanged={refresh}/><AssessmentReviewPanel job={job}/><div className="dp-job-footer"><span>Requested <strong>{job.max_results??'Not recorded'}</strong> businesses <span className="sp-footer-dot">·</span>Saved businesses {job.total_leads??'Not recorded'}<span className="sp-footer-dot">·</span>Repeated records {job.duplicate_count??'Not recorded'}</span><span>Search #{job.id}{job.cancel_requested?' · Cancellation requested':''}</span></div><div className="sp-search-actions"><Link className="live-secondary" to={`/leads?search_id=${job.id}`}>View leads from this search</Link></div>{group.key==='other'&&<p className="sp-recorded-status">Saved search status {uiLabel(job.status)}</p>}</article>;})}</div>
 {!visible.length&&<div className="dp-empty"><h2>{jobs.length?'No searches in this status':'No searches yet'}</h2><p>{jobs.length?'Choose another status or another page.':'Your organization’s searches will appear here.'}</p>{jobs.length>0&&<button className="dp-text-button" onClick={()=>setFilter('all')}>Show all on this page</button>}</div>}<Pagination data={data} page={page} setPage={changePage} loading={loading}/></>}
 <div className="sp-explainer"><Layers size={20}/><div><strong>What do these numbers mean?</strong><p>Businesses found are the records returned by the search. Businesses organized have their details sorted and linked. Business checks saved means we saved what we could learn about them. Details may still be missing or out of date.</p><p>Finding businesses can finish before their details are checked. These numbers show different steps and should not be added together.</p></div></div><p className="live-footnote">Repeated records and businesses already in your workspace are counted separately. Starting another search needs a new budget review.</p></div>;
}


