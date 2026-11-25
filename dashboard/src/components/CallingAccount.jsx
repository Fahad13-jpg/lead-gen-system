import React,{useCallback,useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{getCallingAccount,connectCallingAccount}from'../api/client';
import CallingAccountManage from './CallingAccountManage';
import CallingAccountChecks from './CallingAccountChecks';
export default function CallingAccount(){
 const{organization}=useAuth();
 return <Account key={organization.org_id||organization.id} admin={['owner','admin'].includes(organization.role)}/>;
}
function Account({admin}){
 const[data,setData]=useState(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[note,setNote]=useState(''),[form,setForm]=useState({api_key:'',agent_id:'',agent_version:'1',from_number:'',acknowledge_provider_billing:false});
 const alive=useRef(true),request=useRef(null);
 const refresh=useCallback(async()=>{try{const r=await getCallingAccount();if(alive.current){setData(r);setNote(r.connection?(r.connection.state==='disconnected'?'Account disconnected. Saved credentials have been removed.':'Account access checked. Calling remains paused pending setup.'):'');}}catch{if(alive.current)setNote('Unable to load calling setup. Refresh before making changes.');}},[]);
 useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false;};},[refresh]);
 const reasons={CALLING_API_KEY_REJECTED:'Retell rejected this key. Use a private API key from the workspace containing this agent; a public web-call key will not work.',CALLING_AGENT_NOT_FOUND:'This key cannot access that agent. Check that the key and agent belong to the same Retell workspace.',CALLING_VERSION_NOT_AVAILABLE:'Retell could not load that agent version. Check the published version number.',CALLING_VERSION_NOT_PUBLISHED:'That version is not published. Select a published version of this agent.',CALLING_NUMBER_NOT_FOUND:'The entered number is not in this Retell account. Leave the number empty until you own one; the example number is not a real connection.',CALLING_LOOKUP_UNAVAILABLE:'Retell could not be reached or returned an unexpected response. The account was not saved; try this read-only verification again.'};
 const change=e=>setForm(f=>({...f,[e.target.name]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
 async function submit(e){e.preventDefault();if(busy||uncertain)return;setBusy(true);setNote('Checking your Retell account…');
  try{if(!request.current)request.current=window.crypto.randomUUID();await connectCallingAccount({...form,agent_version:Number(form.agent_version),from_number:form.from_number||null,request_id:request.current});if(alive.current){setForm(f=>({...f,api_key:''}));await refresh();}}
  catch(e){if(alive.current){const code=e.response?.data?.error;if(['CALLING_ACCOUNT_NOT_VERIFIED','INVALID_FILTER','ROLE_REQUIRED','MEMBERSHIP_REQUIRED'].includes(code)){request.current=null;setNote(code==='CALLING_ACCOUNT_NOT_VERIFIED'?(reasons[e.response?.data?.reason]||'Could not verify access. Check the API key, published agent version and optional number in your Retell account.'):'Check the fields and your workspace permissions.');}else{setUncertain(true);setForm(f=>({...f,api_key:''}));setNote('Connection result is uncertain. Refresh saved setup; do not submit another key until this is resolved.');}}}
  finally{if(alive.current)setBusy(false);}
 }
 return <section className="st-panel st-next"><h2>Calling resources</h2><p>Use your own Retell account, or choose managed calling when prepaid billing becomes available.</p>
 <h3>Your Retell account</h3><p>Retell bills your account directly. Connecting checks access and saves encrypted credentials; it does not place a call or buy a number.</p>
 <button className="live-secondary" type="button" onClick={refresh} disabled={busy}>Refresh calling setup</button>{note&&<p role="status">{note}</p>}
 {data?.connection?<><dl><div><dt>Published agent</dt><dd>{data.connection.agent_id} · Version {data.connection.agent_version}</dd></div><div><dt>Calling number</dt><dd>{data.connection.from_number||'Not added yet'}</dd></div><div><dt>Status</dt><dd>Setup pending · Sending paused</dd></div></dl><p>Next: provision the approved agent tools, verify the calling number and route, bind it below your campaign, then complete funding and approval checks. Account access alone does not verify these.</p>{admin&&<><CallingAccountManage key={data.connection.version} account={data.connection} onSaved={refresh}/>{data.connection.state!=='disconnected'&&<CallingAccountChecks key={'check:'+data.connection.version} version={data.connection.version}/>}</>}</>:data&&admin&&!uncertain&&<form onSubmit={submit}><fieldset disabled={busy} className="st-calling-fields">
 <p><label>Retell API key<input className="live-select" type="password" name="api_key" value={form.api_key} onChange={change} required minLength={16} maxLength={300} autoComplete="new-password"/></label></p>
 <p><label>Published agent ID<input className="live-select" name="agent_id" value={form.agent_id} onChange={change} required pattern="[A-Za-z0-9_-]{1,100}"/></label></p>
 <p><label>Published version<input className="live-select" name="agent_version" type="number" min="0" max="2147483647" step="1" value={form.agent_version} onChange={change} required/></label></p>
 <p><label>US calling number (optional)<input className="live-select" name="from_number" type="tel" placeholder="+14155550123" pattern="\+1[0-9]{10}" value={form.from_number} onChange={change}/></label></p>
 <p><label><input name="acknowledge_provider_billing" type="checkbox" checked={form.acknowledge_provider_billing} onChange={change}/> I am authorized to connect this account and understand Retell bills it directly.</label></p>
 <button type="submit" className="live-secondary" disabled={!form.acknowledge_provider_billing}>Verify and save account</button>
 </fieldset></form>}
 {data&&!admin&&!data.connection&&<p>An organization owner or administrator can connect the account.</p>}
 <h3>Managed calling · Not available yet</h3><p>Planned as prepaid usage with a visible rate and spending cap. No calling credit or subscription charge is created here.</p>
 </section>;
}
