'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function challenge(query,token){return typeof token==='string'&&token.length>=32&&query?.['hub.mode']==='subscribe'&&equal(query['hub.verify_token'],token)&&typeof query['hub.challenge']==='string'&&query['hub.challenge'].length<=1024?{status:200,body:query['hub.challenge']}:{status:403,body:'Forbidden'};}
function parse(raw,signature,secret,now=Date.now()){
 if(!Buffer.isBuffer(raw)||raw.length>262144||typeof secret!=='string'||secret.length<16||!/^sha256=[a-f0-9]{64}$/.test(signature||'')||!equal(signature,'sha256='+createHmac('sha256',secret).update(raw).digest('hex')))throw Error('INVALID_META_SIGNATURE');
 const data=JSON.parse(raw.toString('utf8'));if(data.object!=='whatsapp_business_account'||!Array.isArray(data.entry))throw Error('INVALID_META_ENVELOPE');
 const out=[];const stamp=v=>{if(typeof v!=='string'||!/^\d{10,12}$/.test(v))throw Error('INVALID_EVENT_TIME');const n=Number(v)*1000;if(!Number.isSafeInteger(n)||n>now+300000)throw Error('INVALID_EVENT_TIME');return new Date(n).toISOString();};
 for(const entry of data.entry){if(!/^\d{5,30}$/.test(entry?.id||'')||!Array.isArray(entry.changes))throw Error('INVALID_ACCOUNT_EVENT');for(const change of entry.changes){if(change.field!=='messages')continue;const v=change.value;if(!/^\d{5,30}$/.test(v?.metadata?.phone_number_id||'')||v.messaging_product!=='whatsapp')throw Error('INVALID_SENDER_EVENT');
  const base={waba_id:entry.id,phone_number_id:v.metadata.phone_number_id};
  if(v.statuses!==undefined&&!Array.isArray(v.statuses)||v.messages!==undefined&&!Array.isArray(v.messages))throw Error('INVALID_EVENT_ARRAY');
  for(const s of v.statuses||[]){if(!['sent','delivered','read','failed'].includes(s.status)||typeof s.id!=='string'||s.id.length>450||!/^\d{8,15}$/.test(s.recipient_id||''))throw Error('INVALID_STATUS');out.push({...base,kind:'status',provider_message_id:s.id,recipient:'+'+s.recipient_id,status:s.status,occurred_at:stamp(s.timestamp)});}
  for(const m of v.messages||[]){if(typeof m.id!=='string'||m.id.length>450||!/^\d{8,15}$/.test(m.from||''))throw Error('INVALID_MESSAGE');const text=m.type==='text'?m.text?.body:m.type==='button'?m.button?.text:m.type==='interactive'?m.interactive?.button_reply?.title||m.interactive?.list_reply?.title:null;out.push({...base,kind:'inbound',provider_message_id:m.id,recipient:'+'+m.from,context_id:m.context?.id||null,text:typeof text==='string'?text.slice(0,4000):null,unsupported_content:typeof text!=='string',occurred_at:stamp(m.timestamp)});}
  if(out.length>50)throw Error('EVENT_BATCH_LIMIT');
 }}return out;
}
function optOut(text){return typeof text==='string'&&/^(stop|unsubscribe|cancel|please stop|do not contact me|don't contact me|بند|بند کریں)[.!\s]*$/iu.test(text.trim());}
async function handle(raw,signature,deps){const events=parse(raw,signature,deps.appSecret,deps.now());for(const e of events){const binding=await deps.resolveBinding(e);if(!binding)throw Error('UNMATCHED_EVENT_STORAGE_REVIEW_REQUIRED');const result=await deps.persist({...e,...binding,signature_verified:true,opt_out:e.kind==='inbound'&&optOut(e.text)});if(result?.saved!==true)throw Error('EVENT_PERSISTENCE_UNCONFIRMED');}return {status:200,body:'EVENT_RECEIVED'};}
module.exports={challenge,parse,optOut,handle};
