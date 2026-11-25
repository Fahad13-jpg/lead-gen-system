import React,{useCallback,useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getCallingBinding,bindCallingAccount}from'../api/client';
import useCallingChange from'../hooks/useCallingChange';
const labels={account_connection_required:'Connect your Retell account in Settings.',calling_number_required:'Add a calling number to the saved account.',approved_agent_tools_review_required:'Review the published agent and its opt-out/booking tools.',caller_and_route_verification_required:'Verify caller authorization and the calling route.',provider_funding_and_cost_quote_required:'Confirm provider funds and a bounded cost quote.',recipient_and_release_checks_required:'Review recipient eligibility, messages, timing and release.'};
export default function CallingBinding({campaignId,onSaved}){
 const{organization}=useAuth();return ['owner','admin'].includes(organization.role)?<Binding key={organization.org_id+':'+campaignId} campaignId={campaignId} onSaved={onSaved}/>:null;
}
function Binding({campaignId,onSaved}){
 const[data,setData]=useState(null),[ack,setAck]=useState(false),[error,setError]=useState(''),alive=useRef(true);
 const refresh=useCallback(async()=>{try{const r=await getCallingBinding(campaignId);if(alive.current){setData(r);setAck(false);setError('');}}catch{if(alive.current)setError('Could not load calling account binding. Refresh before saving.');}},[campaignId]);
 useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false;};},[refresh]);
 const change=useCallingChange(async()=>{await refresh();onSaved?.();});
 if(data&&!data.call_channel_selected)return null;
 return <section className="pr-plan"><div className="pr-body"><h2>Calling account for this campaign</h2><button className="live-secondary" type="button" onClick={refresh} disabled={change.busy}>Refresh calling account binding</button>{error&&<p role="alert">{error}</p>}{change.message&&<p role="status">{change.message}</p>}{change.waiting&&<p><button className="live-secondary" type="button" onClick={change.reconcile} disabled={change.busy}>Confirm saved calling change</button></p>}
 {data&&<><p>{data.bound?'Bound to saved account':'Account not yet bound'} · Campaign version {data.version}{data.account&&` · Account version ${data.account.version}`}</p>{data.account&&<p>Agent: {data.account.agent_id} · Published version {data.account.agent_version} · Number: {data.account.from_number||'Not added yet'}</p>}
 <p>Binding creates a new campaign version and leaves calling paused. Current plans need regeneration and review; this action places no call.</p><ul>{data.remaining_checks?.map(r=><li key={r}>{labels[r]||r.replace(/_/g,' ')}</li>)}</ul>
 {data.account?.state==='pending_setup'&&!data.bound&&<><p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={change.busy||!!change.waiting}/> I reviewed this account and understand binding pauses calling and requires fresh campaign review.</label></p><button className="live-secondary" type="button" disabled={!ack||change.busy||!!change.waiting} onClick={()=>change.run(bindCallingAccount,{campaign_id:Number(campaignId),expected_campaign_version:data.version,expected_account_version:data.account.version,acknowledge_pause_and_review:true})}>Bind account and pause calling</button></>}
 </>}</div></section>;
}
