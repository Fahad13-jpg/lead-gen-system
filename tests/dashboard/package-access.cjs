'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {service,snapshot,features}=require('../../scripts/dashboard/package-access.cjs');
const free={name:'free',revision:0,features:{email:true,linkedin_manual:true,whatsapp_manual:true,messenger_manual:true,sms:false,calling:false,whatsapp_automation:false}};
function fixture(){
 let plan=free,calls=0;
 const identity={principal:async(t,o)=>{if(t!=='valid'||o!==7)throw Error('MEMBERSHIP_REQUIRED');return{org_id:o};}};
 const pool={query:async(sql)=>{calls++;return{rows:sql.includes('v.config')?[{config:{channels:['sms']}}]:[{package:plan}]};}};
 return{set:v=>{plan=v;},get calls(){return calls;},access:service({identity,pool})};
}
test('Free blocks every paid setup path and caller-supplied Plus cannot override it',async()=>{
 const x=fixture();for(const context of [{action:'smsAction',smsAction:'connect'},{action:'smsAction',smsAction:'release'},{action:'connectCallingAccount'},{action:'callingBindingAction',callingBindingAction:'bind'},{action:'saveCallingSettings'},{action:'beginWhatsAppSignup'},{action:'checkWhatsAppSender'}])await assert.rejects(x.access.authorize('valid',{org_id:7,package:'plus'},context),/PLUS_REQUIRED/);
});
test('manual channels and stop actions remain available on Free without paid account queries',async()=>{
 const x=fixture();for(const context of [{action:'prepareManualWhatsApp'},{action:'prepareManualFacebook'},{action:'linkedinPrepare'},{action:'smsAction',smsAction:'cancel'},{action:'smsAction',smsAction:'configure'},{action:'callingBindingAction',callingBindingAction:'change'}])await x.access.authorize('valid',{org_id:7,enabled:false,action:'disconnect'},context);assert.equal(x.calls,0);
});
test('saved campaign channels and disguised sequence channels are checked before generation',async()=>{
 const x=fixture();await assert.rejects(x.access.authorize('valid',{org_id:7,campaign_id:4},{action:'requestStrategy'}),/PLUS_REQUIRED/);
 await assert.rejects(x.access.authorize('valid',{org_id:7,config:{channels:['email'],sequence:[{channel:'call'}]}},{action:'saveCampaign'}),/PLUS_REQUIRED/);
 assert.deepEqual(features({channels:['whatsapp','messenger','linkedin','email']}),[]);
});
test('Plus is read fresh on each request and does not grant provider resources',async()=>{
 const x=fixture();x.set({...free,name:'plus',revision:1,features:{...free.features,sms:true}});await assert.rejects(x.access.authorize('valid',{org_id:7},{action:'smsAction',smsAction:'release'}),/PLUS_REQUIRED/);x.set(free);await assert.rejects(x.access.authorize('valid',{org_id:7},{action:'smsAction',smsAction:'release'}),/PLUS_REQUIRED/);
 const r=await x.access.status('valid',{org_id:'7'});assert.equal(r.provider_credits_included,false);assert.equal(r.pricing_active,false);
});
test('package reads verify membership before database access and fail closed on unavailable records',async()=>{
 const x=fixture();await assert.rejects(x.access.status('wrong',{org_id:7}),/MEMBERSHIP_REQUIRED/);assert.equal(x.calls,0);x.set(null);await assert.rejects(x.access.status('valid',{org_id:7}),/PACKAGE_ACCESS_UNAVAILABLE/);assert.throws(()=>snapshot({name:'premium',revision:1}),/PACKAGE_ACCESS_UNAVAILABLE/);
});
