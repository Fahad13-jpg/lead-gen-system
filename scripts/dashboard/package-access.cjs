'use strict';
const free=['email','linkedin_manual','whatsapp_manual','messenger_manual'];
const paid=['sms','calling','whatsapp_automation'];
const positive=v=>Number.isSafeInteger(v)&&v>0;
const release=require('../../dashboard/src/release.json');
function snapshot(row){
 if(!row||!['free','plus'].includes(row.name)||!Number.isSafeInteger(row.revision)||row.revision<0)throw Error('PACKAGE_ACCESS_UNAVAILABLE');
 return {name:row.name,revision:row.revision,provider_credits_included:false,pricing_active:false,
  evaluation_mode:release.evaluationMode,
  features:Object.fromEntries([...free,...paid].map(f=>[f,row.features?.[f]===true&&!(release.evaluationMode&&release.deferredFeatures.includes(f))]))};
}
function features(config){
 const channels=[...(Array.isArray(config?.channels)?config.channels:[]),...(Array.isArray(config?.sequence)?config.sequence.map(s=>s.channel):[])];
 return [...new Set(channels.filter(c=>['call','sms'].includes(c)).map(c=>c==='call'?'calling':'sms'))];
}
function service({identity,pool}){
 async function read(token,org){
  if(typeof org==='string'&&/^[1-9][0-9]*$/.test(org))org=Number(org);
  if(!positive(org))throw Error('INVALID_ORG');await identity.principal(token,org);
  let row;try{row=(await pool.query('SELECT organization_package_snapshot($1) AS package',[org])).rows[0]?.package;}catch{throw Error('PACKAGE_ACCESS_UNAVAILABLE');}
  return snapshot(row);
 }
 return {async status(token,p){if(!p||Object.keys(p).some(k=>k!=='org_id'))throw Error('INVALID_FILTER');return read(token,p.org_id);},
  async authorize(token,body,context){
   const {action,smsAction,callingBindingAction}=context;let required=[];
   if(action==='smsAction'&&smsAction!=='cancel'&&!(smsAction==='configure'&&body.enabled===false))required=['sms'];
   if(['connectCallingAccount','checkCallingPreflight','saveCallingSettings'].includes(action))required=['calling'];
   if(action==='callingBindingAction'&&!(callingBindingAction==='change'&&body.action==='disconnect'))required=['calling'];
   if(['beginWhatsAppSignup','completeWhatsAppSignup','checkWhatsAppSender'].includes(action)||action==='manageWhatsApp'&&body.action==='recheck')required=['whatsapp_automation'];
   if(['saveCampaign','requestStrategy'].includes(action)){
    if(action==='saveCampaign'&&body.preferences?.pause_email===true)return;
    let config=body.config;
    if(!config&&positive(body.campaign_id)&&positive(body.org_id)){
     await identity.principal(token,body.org_id);
     const row=(await pool.query('SELECT v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=$1 AND c.id=$2',[body.org_id,body.campaign_id])).rows[0];
     config=action==='saveCampaign'?{...row?.config,...body.preferences}:row?.config;
    }
    required=features(config);
   }
   if(!required.length)return;
   const plan=await read(token,body.org_id);
   if(required.some(f=>plan.features[f]!==true))throw Error('PLUS_REQUIRED');
  }};
}
module.exports={service,snapshot,features};
