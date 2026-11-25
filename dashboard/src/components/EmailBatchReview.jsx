import React,{useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getEmailPreflight}from'../api/client';
const label=v=>String(v).replace(/_/g,' ');
const emptyPlans=[];
export default function EmailBatchReview({campaignId,version,plans=emptyPlans}){
 const{organization}=useAuth(),allowed=['owner','admin'].includes(organization.role);
 const[selected,setSelected]=useState([]),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setSelected([]);setResult(null);setError('');setBusy(false);return()=>{generation.current++;};},[campaignId,version,plans]);
 const choices=plans.filter(p=>p.campaign_version===version&&p.step1?.channel==='email'&&p.integrity_matches===true&&p.expired===false&&p.approval_action==='approve'&&p.approval_hash_matches===true);
 function toggle(id){setResult(null);setError('');setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<10?[...old,id]:old);}
 async function check(){if(busy||!selected.length||!allowed)return;const current=++generation.current;setBusy(true);setResult(null);setError('');
  try{const r=await getEmailPreflight({campaign_id:Number(campaignId),campaign_version:version,plan_ids:selected.join(',')});if(generation.current!==current)return;if(r?.execution_authorized!==false||!Array.isArray(r.plans)||!Array.isArray(r.reasons)||!Array.isArray(r.limitations))throw Error();setResult(r);}
  catch{if(generation.current===current)setError('Could not check this batch. Refresh the campaign and try again.');}
  finally{if(generation.current===current)setBusy(false);}
 }
 return <section className="pr-plan"><div className="pr-body"><h2>Prepare an email batch</h2><p className="pr-note">Choose up to 10 approved first messages from this page. Check their current eligibility before an administrator releases sending.</p>
 {choices.length?<fieldset disabled={busy||!allowed}><legend>Approved messages · {selected.length}/10 selected</legend>{choices.map(p=><label key={p.id} className="pr-note" style={{display:'block',padding:'6px 0'}}><input type="checkbox" checked={selected.includes(p.id)} disabled={!selected.includes(p.id)&&selected.length>=10} onChange={()=>toggle(p.id)}/> {p.company_name||`Lead ${p.lead_id}`} · Plan #{p.id}</label>)}</fieldset>:<p className="pr-note">Approve a current, unexpired email plan to prepare a batch. Plans on other pages can be reviewed separately.</p>}
 <button className="live-secondary" disabled={busy||!allowed||!selected.length} onClick={check}>{busy?'Checking batch…':'Check selected messages'}</button>{!allowed&&<p className="pr-note">Only owners and admins can prepare email batches.</p>}{error&&<p role="alert">{error}</p>}
 {result&&<div role="status"><h3>{result.ready_for_operator_review?'Ready for administrator review':'Resolve these checks first'}</h3>{result.limits&&<p className="pr-note">{result.limits.daily} emails/day · {result.limits.rolling_24h} per rolling 24 hours · {result.limits.spacing_seconds} seconds apart</p>}{result.reasons.map(r=><p className="pr-warning" key={r}>{label(r)}</p>)}{result.plans.map(p=><p key={p.plan_id} className="pr-note">Plan #{p.plan_id}{p.recipient?` · ${p.recipient}`:''}: {p.ready?'eligible at this check':p.reasons.map(label).join(', ')}</p>)}{result.review_packet&&<details><summary>Batch review details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.review_packet,null,2)}</pre></details>}<p className="pr-note">Checked {new Date(result.observed_at).toLocaleString()}. This check does not enable sending, reserve quota or contact the email provider. Sending time, quota and all eligibility checks are evaluated again during execution. The existing bounded release and schedule review are still required.</p></div>}
 </div></section>;
}
