'use strict';
const crypto=require('node:crypto'),fs=require('node:fs');
const base='https://api.sms-gate.app/3rdparty/v1';
function vault(file){
 const key=fs.readFileSync(file);if(key.length!==32)throw Error('SMS_SETUP_REQUIRED');
 return {
  seal:(org,device,value)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(`${org}:${device}`));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return{v:1,iv:iv.toString('base64'),data:data.toString('base64'),tag:cipher.getAuthTag().toString('base64')};},
  open:(org,device,value)=>{if(value?.v!==1)throw Error('SMS_SETUP_REQUIRED');const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(`${org}:${device}`));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));}
 };
}
function provider({fetcher=fetch,onDiagnostic=()=>{}}={}){
 async function request(secrets,method,path,body){
  if(typeof secrets?.username!=='string'||!secrets.username||typeof secrets.password!=='string'||!secrets.password)throw Error('SMS_GATEWAY_UNAVAILABLE');
  try{
  const r=await fetcher(base+path,{method,redirect:'error',headers:{Authorization:'Basic '+Buffer.from(secrets.username+':'+secrets.password).toString('base64'),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!r.ok){const e=Error('SMS_GATEWAY_UNAVAILABLE');e.status=r.status;throw e;}
  const text=await r.text();if(text.length>1000000)throw Error('SMS_GATEWAY_UNAVAILABLE');try{return text?JSON.parse(text):null;}catch{throw Error('SMS_GATEWAY_UNAVAILABLE');}
  }catch(error){const status=Number.isInteger(error.status)?error.status:null;try{onDiagnostic({method,operation:path.split('/')[1]?.split('?')[0]||'unknown',status,reason:status?'provider_http_rejected':'provider_lookup_unavailable'});}catch{}const safe=Error('SMS_GATEWAY_UNAVAILABLE');if(status)safe.status=status;throw safe;}
 }
 return{
  async devices(secrets){
   const rows=await request(secrets,'GET','/devices');if(!Array.isArray(rows))throw Error('SMS_DEVICE_NOT_VERIFIED');
   return rows.filter(d=>!d.deletedAt&&typeof d.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(d.id)).slice(0,100).map(d=>({id:d.id,name:typeof d.name==='string'?d.name.replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,120):'',sim_numbers:[...new Set((Array.isArray(d.simCards)?d.simCards:[]).map(s=>s.simNumber).filter(n=>[1,2].includes(n)))].sort()}));
  },
  async device(secrets,id,sim){
   const devices=await request(secrets,'GET','/devices'),d=Array.isArray(devices)?devices.find(d=>d.id===id&&!d.deletedAt):null;
   const cards=Array.isArray(d?.simCards)?d.simCards:[],available=[...new Set(cards.map(s=>s.simNumber).filter(n=>Number.isInteger(n)&&n>=1&&n<=3))].sort();
   if(!d||!available.includes(sim)){
    const reason=!Array.isArray(devices)?'device_response_invalid':!d?'device_id_not_found':!cards.length?'sim_metadata_missing':'selected_sim_not_reported';
    try{onDiagnostic({method:'GET',operation:'devices',status:200,reason,selected_sim:sim,available_sim_numbers:available});}catch{}
    throw Error('SMS_DEVICE_NOT_VERIFIED');
   }
   return{id:d.id,last_seen:d.lastSeen,sim:sim};
  },
  async hooks(secrets,id,url){
   const existing=await request(secrets,'GET','/webhooks');if(!Array.isArray(existing))throw Error('SMS_GATEWAY_UNAVAILABLE');
   for(const event of ['sms:received','sms:sent','sms:delivered','sms:failed','sms:cancelled','system:ping'])if(!existing.some(h=>(h.device_id||h.deviceId)===id&&h.url===url&&h.event===event)){
    // The OpenAPI request schema uses deviceId. The prose guide's device_id
    // example is silently ignored by the live Cloud API, creating global hooks.
    const saved=await request(secrets,'POST','/webhooks',{deviceId:id,url,event});
    if(saved?.deviceId!==id||saved?.url!==url||saved?.event!==event)throw Error('SMS_WEBHOOK_NOT_VERIFIED');
   }
  },
  send:(secrets,{id,deviceId,simNumber,recipient,message,validUntil})=>request(secrets,'POST','/messages?deviceActiveWithin=1',{id,deviceId,simNumber,phoneNumbers:[recipient],textMessage:{text:message},validUntil,withDeliveryReport:true,priority:0}),
  status:(secrets,id)=>request(secrets,'GET','/messages/'+encodeURIComponent(id))
 };
}
function verify(secret,raw,timestamp,signature,now=Date.now()){
 if(typeof secret!=='string'||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const wanted=crypto.createHmac('sha256',secret).update(raw).update(timestamp).digest();return crypto.timingSafeEqual(wanted,Buffer.from(signature,'hex'));
}
module.exports={provider,vault,verify};
