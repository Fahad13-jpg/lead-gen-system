'use strict';
const policy=require('./sender-policy.cjs');
// Planning capability only; a fresh server snapshot never grants dispatch authority.
function readiness(input,snapshot,base,now=new Date().toISOString()){
 const blocked=()=>({...base,status:'blocked',execution_authorized:false});
 const cfg=input?.campaign?.config,ref=cfg?.sender_connection,p=cfg?.email_dispatch,s=snapshot,t=Date.parse(now);
 if(!base||!Array.isArray(base.reasons)||!s||s.kind!=='email_draft_snapshot_v1'||!ref||!policy.validate(p).valid)return blocked();
 if(!/^[A-Za-z0-9_-]{1,120}$/.test(ref.connection_id||'')||!Number.isSafeInteger(ref.version)||ref.version<1||!/^[a-f0-9]{64}$/.test(ref.subject||''))return blocked();
 if(!policy.validate({enabled:false,credential_ref:s.credential_ref,sender_email:s.email,daily_limit:s.daily_limit,mailbox_rolling_limit:s.mailbox_rolling_limit,min_interval_seconds:s.min_interval_seconds}).valid)return blocked();
 const age=t-Date.parse(s.checked_at),snapshotAge=t-Date.parse(s.observed_at);
 if(!Number.isFinite(t)||!Number.isFinite(age)||age<0||age>86400000||!Number.isFinite(snapshotAge)||snapshotAge<0||snapshotAge>60000)return blocked();
 if(s.org_id!==input.org_id||s.org_id!==input.lead?.org_id||s.connection_id!==ref.connection_id||s.version!==ref.version||ref.provider!=='gmail'||s.provider!=='gmail'||s.state!=='ready'||s.send_capable!==true||s.reply_capable!==true||s.org_active!==true||s.member_active!==true||s.member_subject!==ref.subject||!['owner','admin','member'].includes(s.member_role))return blocked();
 if(s.sharing!=='team'&&(s.sharing!=='private'||s.owner_subject!==s.member_subject&&!['owner','admin'].includes(s.member_role)))return blocked();
 if(s.credential_ref!==p.credential_ref||s.email!==p.sender_email||s.email_workflow_installed!==true||s.reply_workflow_installed!==true)return blocked();
 if(p.daily_limit>s.daily_limit||p.mailbox_rolling_limit>s.mailbox_rolling_limit||p.min_interval_seconds<s.min_interval_seconds)return blocked();
 const reasons=base.reasons.filter(r=>r!=='executor_not_integrated');
 return{...base,status:reasons.length?'blocked':'ready',reasons,draft_available:true,execution_authorized:false};
}
module.exports={readiness};
