'use strict';
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function senderManagement({identity,execute,onRecheck}){return{
async bindSender(token,p){
 if(!p||Object.keys(p).some(k=>!['org_id','connection_id','campaign_id','expected_version'].includes(k))||![p.org_id,p.campaign_id,p.expected_version].every(v=>Number.isSafeInteger(v)&&v>0)||!/^[-A-Za-z0-9_]{1,120}$/.test(p.connection_id||''))throw Error('INVALID_FILTER');
 const principal=await identity.principal(token,p.org_id);if(!['owner','admin'].includes(principal.role))throw Error('ROLE_REQUIRED');if(!/^[a-f0-9]{64}$/.test(principal.subject||''))throw Error('AUTHENTICATION_FAILED');
 let r;try{r=(await execute(`SELECT sender_connection_bind(${p.org_id},${q(principal.subject)},${q(p.connection_id)},${p.campaign_id},${p.expected_version}) AS result`)).rows[0]?.result;}catch{throw Error('SENDER_BIND_UNCONFIRMED');}
 if(r?.error)throw Error('SENDER_BIND_REJECTED');
 if(r?.org_id!==p.org_id||r.campaign_id!==p.campaign_id||r.version!==p.expected_version+1)throw Error('SENDER_BIND_UNCONFIRMED');
 return{bound:true,campaign_id:r.campaign_id,version:r.version,email_sending_enabled:false};
},async manageSender(token,p){
 if(!p||Object.keys(p).some(k=>!['org_id','connection_id','expected_version','action'].includes(k))||!Number.isSafeInteger(p.org_id)||p.org_id<1||!Number.isSafeInteger(p.expected_version)||p.expected_version<1||!/^[-A-Za-z0-9_]{1,120}$/.test(p.connection_id||'')||!['pause','disconnect','recheck'].includes(p.action))throw Error('INVALID_FILTER');
 const principal=await identity.principal(token,p.org_id);if(!/^[a-f0-9]{64}$/.test(principal.subject||''))throw Error('AUTHENTICATION_FAILED');
 const{org_id,...payload}=p;let r;
 try{r=(await execute(`SELECT sender_connection_manage(${org_id},${q(principal.subject)},${q(JSON.stringify(payload))}::jsonb) AS result`)).rows[0]?.result;}catch{throw Error('SENDER_CHANGE_UNCONFIRMED');}
 if(r?.error)throw Error(['VERSION_CONFLICT','MANAGE_FORBIDDEN','MEMBERSHIP_REQUIRED','NOT_FOUND','ORG_UNAVAILABLE'].includes(r.error)?'SENDER_CHANGE_REJECTED':'SENDER_CHANGE_UNCONFIRMED');
 const expectedState={pause:'disabled',disconnect:'disconnected',recheck:'pending_check'}[p.action];
 if(r?.org_id!==org_id||r.connection_id!==p.connection_id||!Number.isSafeInteger(r.version)||r.version!==p.expected_version+1||r.state!==expectedState||r.execution_authorized!==false)throw Error('SENDER_CHANGE_UNCONFIRMED');
 const result={connection_id:r.connection_id,version:r.version,state:r.state,execution_authorized:false};
 if(p.action==='recheck'&&onRecheck){try{const setup=await onRecheck({org_id,connection_id:p.connection_id,subject:principal.subject});result.workflow_setup=['configured','not_applicable'].includes(setup?.workflow_setup)?setup.workflow_setup:'pending_operator_review';result.connection_check_scheduled=setup?.connection_check_scheduled===true;}catch{result.workflow_setup='pending_operator_review';}}
 return result;
}};}
module.exports={senderManagement};
