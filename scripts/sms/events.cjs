'use strict';
const {verify}=require('./provider.cjs');
const phone=v=>{if(typeof v!=='string')return null;const n=v.replace(/[\s()-]/g,'');if(/^\+92[0-9]{10}$/.test(n))return n;if(/^92[0-9]{10}$/.test(n))return'+'+n;if(/^03[0-9]{9}$/.test(n))return'+92'+n.slice(1);return null;};
function events({pool,transaction,vault,now=Date.now}){
 return async(callback,raw,headers)=>{
  const connection=(await pool.query('SELECT * FROM sms_connections WHERE callback_id=$1',[callback])).rows[0];if(!connection)throw Error('SMS_CALLBACK_REJECTED');
  const secrets=vault.open(connection.org_id,connection.device_id,connection.secrets);
  if(!verify(secrets.signing_key,raw,headers['x-timestamp'],headers['x-signature'],now()))throw Error('SMS_CALLBACK_REJECTED');
  let e;try{e=JSON.parse(raw.toString('utf8'));}catch{throw Error('SMS_CALLBACK_REJECTED');}
  if(e?.deviceId!==connection.device_id||typeof e.id!=='string'||e.id.length>150||!e.id||!e.payload||typeof e.event!=='string')throw Error('SMS_CALLBACK_REJECTED');
  return transaction(async db=>{
   const s=(await db.query('SELECT * FROM sms_connections WHERE org_id=$1 FOR UPDATE',[connection.org_id])).rows[0];if(s.device_id!==e.deviceId||s.callback_id!==callback)return{ignored:true};
   if(e.event==='system:ping'){
    if(e.payload.health?.status!=='pass')return{ignored:true};
    await db.query('UPDATE sms_connections SET heartbeat_at=now(),callback_verified_at=now() WHERE org_id=$1',[s.org_id]);return{recorded:true};
   }
   if(!['sms:received','sms:sent','sms:delivered','sms:failed','sms:cancelled'].includes(e.event)||e.payload.simNumber!==s.sim_number)return{ignored:true};
   const recipient=phone(e.event==='sms:received'?e.payload.sender:e.payload.recipient);if(!recipient)return{ignored:true};
   const d=(await db.query(`SELECT * FROM sms_dispatches WHERE org_id=$1 AND recipient=$2 AND ($3::boolean OR client_id=$4) AND state<>'cancelled' ORDER BY id DESC LIMIT 1 FOR UPDATE`,[s.org_id,recipient,e.event==='sms:received',e.payload.messageId||''])).rows[0];
   // Never retain unrelated personal SMS bodies or sender metadata.
   if(!d)return{ignored:true};
   if(e.event==='sms:received'&&typeof e.payload.message!=='string')throw Error('SMS_CALLBACK_REJECTED');
   const saved=await db.query('INSERT INTO sms_events(org_id,event_id,kind,dispatch_id,reply_text) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_id',[s.org_id,e.id,e.event,d.id,e.event==='sms:received'?e.payload.message.slice(0,2000):null]);if(!saved.rows.length)return{duplicate:true};
   if(e.event==='sms:received'){
    const stop=/\b(stop|unsubscribe|remove|cancel|quit|end)\b|don['’]?t (?:call|text|contact|message)|do not (?:call|text|contact|message)/i.test(e.payload.message),kind=stop?'opt_out':'reply';
    await db.query("INSERT INTO sms_stops(org_id,recipient,kind) VALUES($1,$2,$3) ON CONFLICT(org_id,recipient) DO UPDATE SET kind=CASE WHEN sms_stops.kind='opt_out' THEN sms_stops.kind ELSE excluded.kind END",[s.org_id,recipient,kind]);
    await db.query("UPDATE sms_dispatches SET state=$3 WHERE org_id=$1 AND recipient=$2 AND state<>'cancelled'",[s.org_id,recipient,stop?'opt_out':'replied']);
    await db.query(`UPDATE outreach_activities SET replied_at=coalesce(replied_at,now() AT TIME ZONE 'UTC'),status=$3::text,dispatch_metadata=dispatch_metadata||jsonb_build_object('stop_reason',$4::text,'review_state','needs_review','state',$3::text) WHERE org_id=$1 AND id IN(SELECT activity_id FROM sms_dispatches WHERE org_id=$1 AND recipient=$2)`,[s.org_id,recipient,stop?'opt_out':'replied',kind]);
   }else if(!['replied','opt_out','delivered'].includes(d.state)){
    // Multipart delivered callbacks are per part. The status API must confirm
    // aggregate delivery; a single callback never proves every part arrived.
    if(e.event==='sms:delivered')await db.query('UPDATE sms_dispatches SET delivery_updates=delivery_updates+1 WHERE id=$1',[d.id]);
    else{
     const state=e.event==='sms:sent'?'sent':e.event==='sms:failed'?'uncertain':'failed';
     await db.query('UPDATE sms_dispatches SET state=$2,provider_state=$3 WHERE id=$1',[d.id,state,e.event]);
     await db.query(`UPDATE outreach_activities SET status=$3::text,sent_at=CASE WHEN $3='sent' THEN coalesce(sent_at,now() AT TIME ZONE 'UTC') ELSE sent_at END,external_id=$4,sms_delivery_status=$5,dispatch_metadata=dispatch_metadata||jsonb_build_object('state',$3::text) WHERE org_id=$1 AND id=$2`,[s.org_id,d.activity_id,state,d.client_id,e.event]);
    }
   }
   return{recorded:true};
  });
 };
}
function server({handle,port=3012}){
 const http=require('node:http');const listener=http.createServer(async(req,res)=>{
  const finish=(status)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{}');};
  const match=/^\/sms-gate\/events\/([a-f0-9]{32})$/.exec(req.url||'');if(req.method!=='POST'||!match)return finish(404);
  let size=0,chunks=[];try{for await(const chunk of req){size+=chunk.length;if(size>16384)return finish(413);chunks.push(chunk);}await handle(match[1],Buffer.concat(chunks),req.headers);finish(200);}catch(e){finish(e.message==='SMS_CALLBACK_REJECTED'?403:503);}
 });listener.requestTimeout=15000;listener.headersTimeout=10000;listener.maxHeadersCount=20;listener.maxRequestsPerSocket=50;return listener;
}
module.exports={events,server,phone};
