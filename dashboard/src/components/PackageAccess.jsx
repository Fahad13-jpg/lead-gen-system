import EvaluationChannels,{evaluationMode,deferredFeature} from './EvaluationChannels';
import React from 'react';
import {LockKeyhole} from 'lucide-react';
import './PackageAccess.css';
export const channelFeature=channel=>channel==='call'?'calling':channel==='sms'?'sms':null;
export const channelAvailable=(channel,access)=>!deferredFeature(channelFeature(channel))&&(!channelFeature(channel)||access?.features?.[channelFeature(channel)]===true);
export function PackageGate({feature,access,children}){
 if(deferredFeature(feature))return <EvaluationChannels/>;
 if(access?.features?.[feature]===true)return children;
 return <div className="pk-notice"><LockKeyhole size={18} aria-hidden="true"/><div><strong>{access?'Available with Plus':'Package access not confirmed'}</strong><p>{access?'SMS, calling and official WhatsApp automation require Plus. Email and manual channels remain available.':'Refresh your package details in Settings before using this channel.'} <a href="/settings#workspace-package">View package</a></p></div></div>;
}
export function PackageSummary({state}){
 const {data,loading,error,refresh,checkedAt,manuallyChecked}=state;
 if(evaluationMode)return <EvaluationChannels/>;
 return <section id="workspace-package" className="pk-summary" aria-label="Workspace package"><div className="pk-summary-heading"><div><p className="pk-label">Your workspace package</p><h2>{data?.name==='plus'?'Plus':data?.name==='free'?'Free':error?'Access unavailable':'Checking access'}</h2></div><button className="live-secondary" onClick={refresh} disabled={loading}>{loading?'Checking…':'Check package'}</button></div><div className="pk-check-status" role="status" aria-live="polite" aria-atomic="true">{loading?<p>Checking your workspace access…</p>:!error&&checkedAt?<><p>{manuallyChecked?`Package checked. Your workspace has ${data?.name==='plus'?'Plus':'Free'} access.`:'Your package access is up to date.'}</p><p className="pk-note">Last checked {new Date(checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}</p></>:null}</div>{error?<p role="alert">Package details could not be loaded. Paid actions remain locked until access is confirmed.</p>:<><p>Email, manual LinkedIn, manual WhatsApp and manual Messenger are included in Free.</p><p>{data?.name==='plus'?'Plus also unlocks SMS, calling and official WhatsApp automation when their setup is complete.':'Plus adds SMS, calling and official WhatsApp automation when available. Contact the platform administrator to arrange access.'}</p><p className="pk-note">Provider credits, calling minutes and SIM charges are separate. Upgrading does not start a campaign. Pricing and online payments are not available yet.</p>{data?.name==='free'&&<details className="pk-upgrade-options"><summary>How to upgrade to Plus</summary><p>Plus access is currently arranged by the platform administrator. Ask your administrator to enable Plus for this workspace, then use Check package above to confirm it.</p><p>There is no online checkout yet. Viewing these options does not change your package or charge you.</p></details>}</>}</section>;
}
export function ChannelPicker({channels,onToggle,access}){
 const labels={email:'Email',linkedin:'LinkedIn · manual',whatsapp:'WhatsApp · manual',messenger:'Messenger · manual',sms:'SMS',call:'Calling'};
 return <><div className="ns-examples" role="group" aria-label="Preferred outreach channels">{['email','linkedin','whatsapp','messenger','sms','call'].filter(c=>!deferredFeature(channelFeature(c))).map(channel=>{const locked=!channelAvailable(channel,access);return <label className={`ns-check pk-channel${locked?' pk-locked':''}`} key={channel}><input type="checkbox" checked={channels.includes(channel)} disabled={locked&&!channels.includes(channel)} onChange={e=>{if(!e.target.checked||!locked)onToggle(channel,e.target.checked);}}/>{labels[channel]}{channelFeature(channel)&&<span className="pk-tag">Plus</span>}</label>;})}</div><p className="ns-help">Manual channels prepare a message for you to send. Messenger currently needs a separate campaign; selecting it replaces your other channel choices. Calling, SMS and automated WhatsApp are planned for Version 2.</p></>;
}


