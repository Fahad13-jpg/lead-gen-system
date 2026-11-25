'use strict';
// Read-only discovery, never an automatic account rebind. Pagination is reported
// as incomplete rather than following provider URLs or claiming absence.
async function discover(binding,get){
 if(!/^\d{5,30}$/.test(binding?.business_id||'')||!/^\d{5,30}$/.test(binding.phone_number_id||'')||!/^v\d{1,3}\.\d$/.test(binding.api_version||''))throw Error('INVALID_DISCOVERY_BINDING');
 const base='https://graph.facebook.com/'+binding.api_version+'/',request=async path=>{try{return await get({url:base+path,timeout:10000,maxResponseBytes:65536});}catch{return null;}};
 const accounts=await request(binding.business_id+'/owned_whatsapp_business_accounts');
 if(accounts?.status!==200||!Array.isArray(accounts.data?.data))return {state:'unverified',reason:'business_account_listing_unavailable',http_status:accounts?.status??null,execution_authorized:false};
 const ids=[...new Set(accounts.data.data.map(a=>a?.id).filter(id=>typeof id==='string'&&/^\d{5,30}$/.test(id)))];
 let complete=!accounts.data.paging?.next&&ids.length<=3;const matches=[],checks=[];
 for(const id of ids.slice(0,3)){
  const phones=await request(id+'/phone_numbers');
  const valid=phones?.status===200&&Array.isArray(phones.data?.data);
  if(!valid||phones.data.paging?.next)complete=false;
  const matched=valid&&phones.data.data.some(p=>p?.id===binding.phone_number_id);
  checks.push({account_id:id,http_status:phones?.status??null,matched});if(matched)matches.push(id);
 }
 return {state:matches.length===1&&complete?'candidate_found':'unverified',reason:matches.length>1?'multiple_account_matches':matches.length===1?'phone_link_observed':complete?'no_match_in_owned_accounts':'incomplete_checks',candidate_account_ids:matches,checks,complete,execution_authorized:false,requires_operator_review:true};
}
module.exports={discover};
