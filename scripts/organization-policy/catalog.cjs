'use strict';
// Historical quota preview, superseded for runtime feature access by migration 071 and dashboard/package-access.cjs.
// Draft product configuration only. Null means unconfigured, never unlimited.
// Commercial allowances must be supplied by trusted administration, not a client.
const plans={};
for(const tier of ['freemium','standard','premium']){
 plans[tier]={strategy_modes:['template','hybrid','ai'],byok:true,
  verification_credits_included:tier==='premium',
  email:{daily:null,monthly:null},ai:{monthly_requests:null}};
 Object.freeze(plans[tier].strategy_modes);Object.freeze(plans[tier].email);
 Object.freeze(plans[tier].ai);Object.freeze(plans[tier]);
}
module.exports=Object.freeze({version:'draft_v1',plans:Object.freeze(plans)});
