import {evaluationMode} from '../components/EvaluationChannels';
import HelpTip from '../components/HelpTip';
import ConnectionOverview from '../components/ConnectionOverview';
import useWorkspacePackage from '../hooks/useWorkspacePackage';
import {PackageGate,PackageSummary} from '../components/PackageAccess';
import React,{useCallback}from'react';
import{RefreshCw,Building2,Mail,ShieldCheck}from'lucide-react';
import{getSettings}from'../api/client';
import{useAuth}from'../context/AuthContext';
import useReadList from'../hooks/useReadList';
import{ReadFeedback}from'./ReadListParts';
import'./LiveData.css';
import'./Settings.css';
import SenderActions from '../components/SenderActions';
import ConnectApify from '../components/ConnectApify';
import ConnectGmail from '../components/ConnectGmail';
import ConnectSmtp from '../components/ConnectSmtp';
import ReplaceSmtpPassword from '../components/ReplaceSmtpPassword';
import ReconnectGmail from '../components/ReconnectGmail';
const label=v=>String(v||'Not recorded').replace(/_/g,' ');
export default function LiveSettings(){
 const packageState=useWorkspacePackage();
 const{user}=useAuth(),fetchPage=useCallback(()=>getSettings(),[]),state=useReadList(fetchPage),{data,loading,refresh}=state;
 return <div className="live-page st-page"><div className="dp-heading"><div><h1>Workspace settings</h1><p>Connect your accounts and choose how your workspace sends outreach.</p></div><button className="live-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16}/>Refresh</button></div><ReadFeedback {...state}/><PackageSummary state={packageState}/>{data&&<><ConnectionOverview settings={data}/><div className="st-summary"><section className="st-panel"><Building2 size={23}/><h2>{data.organization.name}</h2><dl><div><dt>Workspace status</dt><dd>{label(data.organization.status)}</dd></div><div><dt>Your role</dt><dd>{label(data.role)}</dd></div><div><dt>Signed in as</dt><dd>{user.email}</dd></div></dl></section><section id="search-account" className="st-panel"><ShieldCheck size={23}/><h2 className="help-heading"><span>Your Apify account</span><HelpTip label="Your Apify account">Connect your Apify account to pay for searches yourself. This screen does not show your current Apify balance.</HelpTip></h2><p className="st-value">{!data.apify?'No organization account recorded':!data.apify.key_configured?'Key not configured':data.apify.enabled?'Configured and enabled':'Configured but disabled'}</p><p className="st-note">Searches use your Apify account. This shows saved settings, not a live balance check.</p><details className="lm-connection-details"><summary>Manage Apify connection</summary><ConnectApify refresh={refresh}/></details></section></div>
 <details id="email-accounts" className="lm-settings-group" open><summary><div>Email accounts<span>Connect a sender, check its status or change sending limits.</span></div></summary><div className="st-section-heading"><div><h2>Sender connections</h2><p>{data.connections.length} of {data.connection_total} visible connections · Up to 100 shown</p></div><Mail size={22}/></div><div className="st-connections">{data.connections.map(c=><section className="st-panel st-connection" key={c.connection_id}><header><span className="st-provider">{c.provider==='gmail'?'Gmail':c.provider==='smtp'?'SMTP':c.provider==='whatsapp'?'WhatsApp':label(c.provider)}</span><span className="st-state">{c.health?.label||label(c.state)}</span></header><h3>{c.email||c.connection_id}</h3><p className="st-note">{c.sharing==='private'?'Private sender':'Team sender'} · {c.connection_id}</p><dl className="st-limits"><div><dt>Daily limit</dt><dd>{c.daily_limit}</dd></div><div><dt>Rolling 24-hour limit</dt><dd>{c.mailbox_rolling_limit}</dd></div><div><dt>Minimum spacing</dt><dd>{c.min_interval_seconds} seconds</dd></div></dl><div className="st-capabilities"><span>Sending check: <strong>{c.send_capable?'Recorded as capable':'Not confirmed'}</strong></span><span>Reply check: <strong>{c.reply_capable?'Recorded as capable':'Not confirmed'}</strong></span></div><p className="st-note">Last saved check: {c.checked_at?new Date(c.checked_at).toLocaleString():'Not recorded'}. Actual execution rechecks campaign binding, account readiness and limits.</p>{c.health?.next_action?.label&&<p className="lm-health"><strong>Next step:</strong> {c.health.next_action.label}</p>}<details className="lm-connection-details"><summary>Manage this sender</summary><SenderActions connection={c} refresh={refresh}/><ReplaceSmtpPassword connection={c} refresh={refresh}/><ReconnectGmail connection={c} refresh={refresh}/></details></section>)}</div>{!data.connections.length&&<div className="dp-empty"><h2>No visible sender connections</h2><p>There are no team senders or personal senders available to your account in this workspace.</p></div>}
 <details className="lm-connection-details"><summary>Connect Gmail</summary><ConnectGmail refresh={refresh}/></details><details className="lm-connection-details"><summary>Connect another email provider</summary><ConnectSmtp refresh={refresh} connections={data.connections}/></details><p className="st-note">Connecting an account does not start a campaign. Review and approve your outreach before sending.</p></details></>}
<p className="live-footnote">Refresh reads saved configuration. Account setup and connection changes require explicit actions above. Saved credentials and provider tokens are never returned by status views.</p></div>;
}
