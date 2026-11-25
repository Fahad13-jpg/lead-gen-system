'use strict';
const legacy=require('../lead-strategy/v2/email-rollout.cjs'),campaign=require('./campaign-slice.cjs');
module.exports={validate:(s,now)=>s?.format==='email_campaign_slice_v1'?campaign.validate(s,now):legacy.validate(s,now),allows:(r,s,now)=>s?.format==='email_campaign_slice_v1'?campaign.allows(r,s,now):legacy.allows(r,s,now),authority:campaign.authority,planIds:s=>s?.format==='email_campaign_slice_v1'?[s.plan.plan_id]:s.plans.map(p=>p.plan_id)};
