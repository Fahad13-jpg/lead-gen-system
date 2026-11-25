'use strict';
const assert=require('node:assert/strict');
const id=v=>typeof v==='string'&&/^\d{5,30}$/.test(v);
function pending(input){
 assert(Number.isSafeInteger(input?.org_id)&&input.org_id>0,'ORG_REQUIRED');
 assert(typeof input.connection_id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(input.connection_id),'CONNECTION_REQUIRED');
 assert(typeof input.credential_ref==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(input.credential_ref),'CREDENTIAL_REFERENCE_REQUIRED');
 assert(id(input.phone_number_id)&&id(input.waba_id),'ACCOUNT_IDS_REQUIRED');
 return {org_id:input.org_id,connection_id:input.connection_id,credential_ref:input.credential_ref,phone_number_id:input.phone_number_id,waba_id:input.waba_id,api_version:null,state:'pending_check',verified_at:null,expires_at:null,execution_authorized:false};
}
async function check(connection,ports){
 const base=pending(connection),fail=reason=>({...base,api_version:connection.api_version??null,state:'reconnect_required',reason,execution_authorized:false});
 assert(/^v\d{1,3}\.\d$/.test(connection.api_version||''),'EXPLICIT_API_VERSION_REQUIRED');
 assert(typeof ports?.authorizeBinding==='function'&&typeof ports?.authenticatedGet==='function','TRUSTED_CONNECTOR_REQUIRED');
 // This port must check backend membership/credential ownership. A dashboard's
 // org_id or an n8n credential display name is never sufficient authorization.
 if(await ports.authorizeBinding(base)!==true)return fail('credential_ownership_unverified');
 let response;
 try{response=await ports.authenticatedGet({org_id:base.org_id,credential_ref:base.credential_ref,method:'GET',url:'https://graph.facebook.com/'+connection.api_version+'/'+base.waba_id+'/phone_numbers',redirect:'error',timeout:10000,maxResponseBytes:65536});}
 catch{return fail('provider_check_unconfirmed');}
 if(response?.status!==200||!Array.isArray(response.data?.data)||response.data.data.length>100)return fail('provider_check_unconfirmed');
 const matches=response.data.data.filter(x=>x?.id===base.phone_number_id);
 if(matches.length!==1)return fail(response.data?.paging?.next?'sender_not_found_in_checked_page':'sender_not_in_account');
 const timestamp=(ports.now||(()=>new Date().toISOString()))();
 assert(Number.isFinite(Date.parse(timestamp)),'INVALID_CHECK_TIME');
 return {...base,api_version:connection.api_version,state:'identity_checked',verified_at:timestamp,expires_at:new Date(Date.parse(timestamp)+86400000).toISOString(),reason:'account_sender_match',capabilities:{account_sender_match:true,sending_verified:false,callback_verified:false},execution_authorized:false};
}
module.exports={pending,check};
