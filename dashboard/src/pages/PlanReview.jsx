import {evaluationMode} from '../components/EvaluationChannels';
import {campaignGuidance} from './campaignGuidance';
import useWorkspacePackage from '../hooks/useWorkspacePackage';
import {PackageGate} from '../components/PackageAccess';
import React,{useCallback,useState}from'react';
import{Link,useParams}from'react-router-dom';
import{RefreshCw,ArrowLeft}from'lucide-react';
import{getPlans}from'../api/client';
import useReadList from'../hooks/useReadList';
import{ReadFeedback,Pagination}from'./ReadListParts';
import'./LiveData.css';
import'./PlanReview.css';
import'./NewSearch.css';
import CampaignWorkflow from'../components/CampaignWorkflow';
import{uiLabel}from'../uiText';
import DraftPreparation from '../components/DraftPreparation';
import PlanApproval from '../components/PlanApproval';
import CampaignSender from '../components/CampaignSender';
import CampaignEmailControl from '../components/CampaignEmailControl';
import EmailBatchReview from '../components/EmailBatchReview';
import ReleasedEmailBatches from '../components/ReleasedEmailBatches';
import EmailFollowups from '../components/EmailFollowups';
import CampaignAutomation from '../components/CampaignAutomation';
import{PrepareLinkedInTask}from'../components/LinkedInTasks';
const label=uiLabel;
function Message({parts=[]}){return <div className="pr-message">{parts.length?parts.map((p,i)=><div key={i}><p>{p.text}</p><small>{label(p.type)}</small></div>):<p>No outgoing message saved.</p>}</div>;}
function GenerationFailure({plan}){
 if(plan.state!=='ai_failed')return null;
 const messages={UNKNOWN_ANGLE:'The AI did not select a permitted offer angle.',PROVIDER_RATE_LIMITED:'The AI provider declined the request because of its rate limit.',PROVIDER_ERROR:'The AI provider request did not produce a usable response.',TRUNCATED_OUTPUT:'The AI response was cut short.',INCOMPLETE_OUTPUT:'The AI response did not finish normally.',SCHEMA_REPAIR_NOT_RESERVED:'The AI response did not match the required format.',monthly_limit:'The monthly AI allowance blocked generation.',daily_limit:'The daily AI allowance blocked generation.',rate_limit:'Another AI request was too recent.',ai_disabled:'AI generation was disabled.',stale_lease:'This job no longer had a valid processing lease.'};
 const reason=plan.failure_reason?.startsWith('MISSING_QUALITY_FLAG:')?'The AI omitted a required fit or evidence review warning.':messages[plan.failure_reason]||'The AI response did not pass the required checks.';
 const g=plan.generation_details;
 return <section className="ns-notice warning" role="status"><strong>This message could not be saved</strong><p>{reason} Write a new message when you are ready.</p><details><summary>Details for support</summary>{plan.failure_reason&&<p>{plan.failure_reason}</p>}<p>Prompt {plan.prompt_version||'Not recorded'}{Number.isSafeInteger(g?.attempts)?` · Attempts ${g.attempts}`:''}{g?.usage_complete&&Number.isSafeInteger(g?.tokens?.total)?` · Tokens ${g.tokens.total}`:''}</p></details></section>;
}
function PlanAttempt({plan,plans,children}){
 const newer=plan.state==='ai_failed'&&plans.find(p=>p.lead_id===plan.lead_id&&p.campaign_version===plan.campaign_version&&Number(p.id)>Number(plan.id)&&['ai_completed','template_completed'].includes(p.state));
 return newer?<details className="pr-attempt-history"><summary>Earlier message for {plan.company_name||'this business'}. A newer draft is available</summary>{children}</details>:children;
}
function channelEnabled(data,channel){return !Array.isArray(data.configured_channels)||data.configured_channels.includes(channel);}
export default function PlanReview(){
 const packageState=useWorkspacePackage();
 const{campaignId}=useParams(),[page,setPage]=useState(1),fetchPage=useCallback(()=>getPlans({campaign_id:campaignId,page,limit:10}),[campaignId,page]);
 const state=useReadList(fetchPage),{data,loading,refresh}=state;
 return <div className="live-page pr-page"><Link className="pr-back" to="/campaigns"><ArrowLeft size={16}/>Campaigns</Link><div className="dp-heading"><div><h1>{data?.campaign_name||'Campaign review'}</h1><p>Choose leads, review messages and contact them.</p></div><button className="live-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>{data?.found&&<p><Link className="live-secondary" to={`/campaigns/${campaignId}/preferences`}>Edit campaign</Link></p>}<ReadFeedback {...state}/>
 {data&&(!data.found?<div className="dp-empty"><h2>Campaign not available</h2><p>It was not found in your selected organization.</p></div>:<CampaignWorkflow key={campaignId} initialStep={data.plans.length?'review':'setup'} recommendation={campaignGuidance(data)}
 setup={<><p className="pr-note">Changing the account or settings means you will need to review new messages.</p>{!Array.isArray(data.configured_channels)&&<p className="pr-warning">We could not load your contact options. Check campaign settings.</p>}<div className="cg-channels">{(data.configured_channels||[]).map(c=><span key={c}>{label(c)}</span>)}</div>{channelEnabled(data,'email')&&<><CampaignSender campaignId={campaignId} version={data.current_version} current={data.sender_connection_id} refresh={refresh}/><CampaignEmailControl campaignId={campaignId} version={data.current_version} enabled={data.email_policy_enabled} refresh={refresh}/></>}{Array.isArray(data.configured_channels)&&!data.configured_channels.some(c=>['email','call'].includes(c))&&<p className="pr-note">Review your chosen channels in <Link to="/settings">Settings</Link>. Open the lead to copy and send its approved manual message.</p>}</>}
 prepare={<DraftPreparation campaignId={campaignId} readiness={data.generation_readiness} onSaved={refresh}/>}
 review={<><p className="pr-scope">Showing saved messages. Older messages may need a new review.</p>{data.plans.map(p=><PlanAttempt key={p.id} plan={p} plans={data.plans}><article className="pr-plan" key={p.id}><header><div><h2>{p.company_name||`Lead ${p.lead_id}`}</h2><p>Message #{p.id}{p.campaign_version!==data.current_version?' from earlier settings':''}</p></div><Link to={`/leads/${p.lead_id}`}>View lead</Link></header><div className="pr-body"><div className="pr-badges"><span>{label(p.state)}</span><span>Lead match: {label(p.fit)}</span><span>{p.expired===true?'Expired':p.expired===false?'Within review period':'Expiry not confirmed'}</span><span>{p.approval_action==='approve'&&p.approval_hash_matches?'Approval recorded':p.approval_action==='revoke'?'Approval revoked':'Not approved'}</span></div><details className="pr-meta"><summary>More about this draft</summary><p>Method: {label(p.method)} · Model: {p.model||'Not recorded'} · {p.version||'Legacy format'} · {label(p.personalization_level)}</p></details>
 <GenerationFailure plan={p}/>{p.integrity_matches!==true&&<p className="pr-warning">This message could not be checked. Ask your administrator to review it.</p>}{p.fallback_acknowledgement_required&&<p className="pr-warning">This draft needs your confirmation before approval.</p>}
 {p.fit_notes.map((v,i)=><p className="pr-note" key={i}>{v}</p>)}{[...p.blocking_reasons,...p.validation_errors,...p.review_flags].filter(Boolean).length>0&&<details><summary>What needs attention</summary><ul>{[...p.blocking_reasons,...p.validation_errors,...p.review_flags].filter(Boolean).map((v,i)=><li key={i}>{label(v)}</li>)}</ul></details>}
 <h3>How to contact this lead</h3>{p.channel_plan.length?<ol>{p.channel_plan.map((c,i)=><li key={i}><strong>{label(c.channel)}</strong> · {label(c.reason)}</li>)}</ol>:<p className="pr-note">No contact method is saved.</p>}
 <h3>Your message{p.step1?` · ${label(p.step1.channel)}`:''}</h3><Message parts={p.step1?.parts}/><p className="pr-note">Check the lead details before using these claims.</p>
 {p.followups.length>0&&<details><summary>Later messages</summary>{p.followups.map((f,i)=><section key={i}><h3>{i+1}. {label(f.channel)}</h3><p className="pr-note">Intent: {f.intent}</p><Message parts={f.parts}/></section>)}</details>}
 {p.call_guidance&&<details><summary>Call guidance</summary><h3>Opening</h3><p>{p.call_guidance.opening}</p><h3>Permission question</h3><p>{p.call_guidance.permission_question}</p>{p.call_guidance.objections.map((o,i)=><p key={i}><strong>{label(o.kind)}:</strong> {o.response}</p>)}</details>}
 <PlanApproval key={p.id+':'+p.content_hash} plan={{...p,campaign_current:p.campaign_version===data.current_version}} refresh={refresh}/><p className="pr-note">Review by {p.expires_at?new Date(p.expires_at).toLocaleString():'a date to be confirmed'}. Approval alone does not send a message.</p></div></article></PlanAttempt>)}{!data.plans.length&&<div className="dp-empty"><h2>No saved plans yet</h2><p>Choose a lead to write your first message.</p></div>}<Pagination data={data} page={page} setPage={setPage} loading={loading}/></>}
 launch={<>{channelEnabled(data,'email')&&<><CampaignAutomation key={`automation:${campaignId}`} campaignId={campaignId} version={data.current_version} plans={data.plans}/><details className="cg-extra"><summary>Send a small email group</summary><p className="pr-note">Review the recipients and messages before starting this group.</p><EmailBatchReview campaignId={campaignId} version={data.current_version} plans={data.plans}/></details><details className="cg-extra"><summary>Email progress</summary><ReleasedEmailBatches key={campaignId} campaignId={campaignId}/><EmailFollowups key={`followups:${campaignId}`} campaignId={campaignId}/></details></>}{data.plans.map(p=><React.Fragment key={p.id}>{p.step1?.channel==='linkedin'&&<PrepareLinkedInTask key={'linkedin:'+p.id+':'+p.content_hash} plan={{...p,campaign_current:p.campaign_version===data.current_version}}/>}{['email','messenger','whatsapp'].includes(p.step1?.channel)&&p.approval_action==='approve'&&p.approval_hash_matches===true&&<p className="pr-note">{p.company_name||`Lead ${p.lead_id}`} · Review the approved {label(p.step1.channel)} message above, then <Link to={`/leads/${p.lead_id}`}>open the lead</Link> to contact this business yourself.</p>}</React.Fragment>)}{!evaluationMode&&channelEnabled(data,'call')&&<p className="pr-note">Calls require a verified number, funding and current channel checks. Review <Link to="/settings">calling setup</Link> before a live call.</p>}{!data.plans.length&&<p className="pr-note">Prepare and review a message before taking a sending action.</p>}</>}
 />)}<p className="live-footnote">Moving between steps does not send a message.</p></div>;
}
