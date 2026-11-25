'use strict';
// Database-only handoff. No transport, provider SDK, key loading or plan mutation.
function payload(plan,step=1){
 if(!Number.isSafeInteger(plan?.org_id)||plan.org_id<1||!Number.isSafeInteger(plan?.plan_id)||plan.plan_id<1||step!==1||!/^[a-f0-9]{32}$/.test(plan.content_hash||''))throw Error('INVALID_DISPATCH_IDENTITY');
 return {org_id:plan.org_id,plan_id:plan.plan_id,step,content_hash:plan.content_hash};
}
function query(name,p){
 if(!['outreach_dispatch_check','outreach_dispatch_reserve','outreach_dispatch_recheck'].includes(name))throw Error('UNKNOWN_DISPATCH_OPERATION');
 return "SELECT "+name+"('"+JSON.stringify(p).replace(/'/g,"''")+"'::jsonb) AS result";
}
async function reserve(plan,{executeQuery}){
 const p=payload(plan);const result=await executeQuery(query('outreach_dispatch_reserve',p));
 // Any caller must still implement explicit transport activation and another live recheck.
 return {...result,execution_authorized:false};
}
async function recheck(plan,lease,{executeQuery}){
 if(typeof lease!=='string'||!/^[a-f0-9]{32}$/.test(lease))throw Error('INVALID_DISPATCH_LEASE');
 const result=await executeQuery(query('outreach_dispatch_recheck',{...payload(plan),lease}));
 return {...result,execution_authorized:false};
}
module.exports={payload,query,reserve,recheck};
