'use strict';
// Trusted schedule adapter; not a webhook. The installer must be supplied explicitly.
const{loader}=require('./campaign-authority.cjs');const q=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
function ports({pool,execute,installAndStart,now=Date.now}){
 async function call(name,p){if(!['email_campaign_slice_publish','email_campaign_renewal_finish'].includes(name))throw Error('FIXED_OPERATION_REQUIRED');return(await execute(`SELECT ${name}(${q(p)}) AS result`)).rows[0]?.result;}
 return{now,
 claim:async({org_id,campaign_id})=>{if(![org_id,campaign_id].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('INVALID_CAMPAIGN');return(await execute(`SELECT email_campaign_renewal_claim(${org_id},${campaign_id},'campaign-renewal-worker-v1') AS result`)).rows[0]?.result;},
 load:async claim=>{if(!Number.isSafeInteger(claim.org_id)||!Number.isSafeInteger(claim.campaign_id)||!/^[a-f0-9]{64}$/.test(claim.actor_subject||''))throw Error('CLAIM_IDENTITY_REQUIRED');const member=(await pool.query(`SELECT org_id,subject,role FROM org_sender_memberships WHERE org_id=${claim.org_id} AND subject='${claim.actor_subject.replace(/'/g,"''")}' AND active AND role IN ('owner','admin')`)).rows[0];if(!member)throw Error('APPROVAL_ACTOR_INACTIVE');return loader(pool)(member,claim.campaign_id);},
 publish:(claim,d)=>call('email_campaign_slice_publish',{org_id:claim.org_id,campaign_id:claim.campaign_id,campaign_version:claim.campaign_version,revision:claim.revision,scope_hash:claim.scope_hash,lease:claim.lease,plan_id:d.plan_id,content_hash:d.content_hash,recipient:d.recipient,target_step:d.target_step,expires_at:d.expires_at}),
 finish:(claim,result)=>call('email_campaign_renewal_finish',{...claim,...result}),
 installAndStart:async(...args)=>{if(typeof installAndStart!=='function')throw Error('CAMPAIGN_INSTALLER_NOT_CONFIGURED');return installAndStart(...args);}
 };
}
module.exports={ports};
