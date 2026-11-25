'use strict';
const {query}=require('./core.cjs');
// Adapter contract only. No public ingress: Flutter auth is still unspecified.
function create({authenticate,executeQuery}){return {async invoke(operation,args,request){
 const who=await authenticate(request);
 if(!who||!Number.isSafeInteger(who.org_id)||who.org_id<=0||who.can_manage_outreach!==true||typeof who.member_ref!=='string'||!who.member_ref||who.member_ref.length>120)return {ok:false,reason:'authenticated_org_member_required'};
 const allowed={queue:[],prepare:['plan_id','step'],event:['activity_id','content_hash','action','event_id','note','snooze_until','assignee','confirmed_by_customer']};
 if(!Object.hasOwn(allowed,operation)||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed[operation].includes(k)))return {ok:false,reason:'invalid_arguments'};
 if(args.assignee!==undefined&&(!who.can_manage_assignments||!Array.isArray(who.assignable_member_refs)||!who.assignable_member_refs.includes(args.assignee)))return {ok:false,reason:'verified_assignment_membership_required'};
 return executeQuery(query('outreach_linkedin_'+operation,{...args,org_id:who.org_id,actor:who.member_ref,can_manage_assignments:who.can_manage_assignments===true}));
 }};}
module.exports={create};
