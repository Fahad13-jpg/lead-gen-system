'use strict';
const crypto=require('node:crypto'),core=require('./core.cjs');
const busyStates=['submitting','accepted','uncertain'];
async function plan(db,org,id){
 const r=(await db.query(`SELECT p.*,strategy_context(p.org_id,p.campaign_id,p.lead_id) AS context,
  p.content_hash=md5(p.body::text) AS intact,a.action AS approval_action,a.content_hash AS approval_hash
  FROM strategy_plans p JOIN strategy_campaigns c ON c.org_id=p.org_id AND c.id=p.campaign_id AND c.version=p.campaign_version
  JOIN LATERAL(SELECT action,content_hash FROM strategy_approvals WHERE org_id=p.org_id AND plan_id=p.id ORDER BY id DESC LIMIT 1)a ON true
  WHERE p.org_id=$1 AND p.id=$2 AND p.expires_at>now()`,[org,id])).rows[0];
 const a=r?.body?.artifacts?.sms_draft,body=r?.body;
 if(!r||!r.intact||r.approval_action!=='approve'||r.approval_hash!==r.content_hash||r.context?.fingerprint!==r.fingerprint||r.context.suppressed!==false||r.context.replied!==false||r.context.report?.trust?.conflicts?.length!==0||body.version!=='strategy_v2'||body.state!=='ai_completed'||body.execution_authorized!==false||body.approval_required!==true||body.validation_errors?.length!==0||body.blocking_reasons?.length!==0||body.strategy?.step1?.channel!=='sms'||a?.version!=='sms_draft_v1'||a.recipient!==r.context.lead.phone||!/^\+923[0-9]{9}$/.test(a.recipient)||!Array.isArray(body.strategy.step1.parts)||a.message!==body.strategy.step1.parts.map(p=>p.text).join(' ')||!a.message?.trim()||a.message.length>306||a.segments!==core.segments(a.message).segments||a.segments>2)throw Error('SMS_PLAN_NOT_READY');
 const stopped=(await db.query(`SELECT EXISTS(SELECT 1 FROM sms_stops WHERE org_id=$1 AND recipient=$3) OR EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=$1 AND (lead_id=$2 OR dispatch_metadata->>'recipient'=$3) AND (replied_at IS NOT NULL OR bounced_at IS NOT NULL OR dispatch_metadata->>'stop_reason' IS NOT NULL OR dispatch_metadata->>'followup_pause_reason' IS NOT NULL OR dispatch_metadata->>'review_state'='needs_review')) AS stopped`,[org,r.lead_id,a.recipient])).rows[0]?.stopped;
 if(stopped!==false)throw Error('SMS_RECIPIENT_STOPPED');return{row:r,artifact:a};
}
function store({pool,transaction,now=Date.now}){
 return{
  transaction,
  connection:(org)=>pool.query('SELECT * FROM sms_connections WHERE org_id=$1',[org]).then(r=>r.rows[0]),
  async list(org){return(await pool.query('SELECT id,plan_id,lead_id,recipient,message,segments,state,released_at,attempted_at,provider_state FROM sms_dispatches WHERE org_id=$1 ORDER BY id DESC LIMIT 50',[org])).rows;},
  async release(org,subject,p){return transaction(async db=>{
   const s=(await db.query('SELECT * FROM sms_connections WHERE org_id=$1 FOR UPDATE',[org])).rows[0];if(!s||s.version!==p.connection_version||s.state!=='ready')throw Error('SMS_CONNECTION_NOT_READY');
   const {row,artifact}=await plan(db,org,p.plan_id);if(row.content_hash!==p.content_hash)throw Error('SMS_PLAN_CHANGED');
   const existing=(await db.query('SELECT id,content_hash,connection_version FROM sms_dispatches WHERE org_id=$1 AND plan_id=$2',[org,p.plan_id])).rows[0];
   if(existing){if(existing.content_hash!==p.content_hash||existing.connection_version!==p.connection_version)throw Error('SMS_RELEASE_CONFLICT');return{released:true,dispatch_id:String(existing.id),already_recorded:true};}
   const activity=(await db.query(`INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata) VALUES($1,$2,'sms','queued',$3) RETURNING id`,[org,row.lead_id,{version:'sms_gate_v1',plan_id:String(p.plan_id),step:'1',content_hash:p.content_hash,state:'queued',recipient:artifact.recipient,execution_authorized:false}])).rows[0];
   const out=(await db.query(`INSERT INTO sms_dispatches(org_id,plan_id,lead_id,connection_version,content_hash,recipient,message,segments,activity_id,client_id,release_subject,consent_ref,consent_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[org,p.plan_id,row.lead_id,s.version,p.content_hash,artifact.recipient,artifact.message,artifact.segments,activity.id,crypto.randomUUID().replace(/-/g,''),subject,p.consent_ref,p.consent_expires_at])).rows[0];
   return{released:true,dispatch_id:String(out.id),already_recorded:false};
  });},
  async cancel(org,id){return transaction(async db=>{
   await db.query('SELECT org_id FROM sms_connections WHERE org_id=$1 FOR UPDATE',[org]);const r=(await db.query("UPDATE sms_dispatches SET state='cancelled' WHERE org_id=$1 AND id=$2 AND state='queued' RETURNING activity_id",[org,id])).rows[0];if(!r)throw Error('SMS_ALREADY_IN_FLIGHT');await db.query("UPDATE outreach_activities SET status='cancelled',dispatch_metadata=dispatch_metadata||'{\"state\":\"cancelled\"}' WHERE id=$1 AND org_id=$2",[r.activity_id,org]);return{cancelled:true};
  });},
  async candidate(){return(await pool.query("SELECT d.*,s.device_id,s.sim_number,s.secrets,s.sender_phone FROM sms_dispatches d JOIN sms_connections s ON s.org_id=d.org_id WHERE d.state='queued' AND s.state='ready' AND s.version=d.connection_version ORDER BY d.released_at,d.id LIMIT 5")).rows;},
  async admit(id){return transaction(async db=>{
   const initial=(await db.query('SELECT org_id FROM sms_dispatches WHERE id=$1',[id])).rows[0];if(!initial)return null;
   const s=(await db.query('SELECT * FROM sms_connections WHERE org_id=$1 FOR UPDATE',[initial.org_id])).rows[0],d=(await db.query('SELECT * FROM sms_dispatches WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!s||d.state!=='queued'||s.state!=='ready'||s.version!==d.connection_version)return null;
   if(Date.parse(d.consent_expires_at)<=now())return null;
   const currentSlot=core.slot(s.slot,now());if(!currentSlot.active||now()-Date.parse(s.heartbeat_at)>180000||!s.heartbeat_at||!s.callback_verified_at||s.last_attempt_at&&now()-Date.parse(s.last_attempt_at)<60000)return null;
   if((await db.query('SELECT EXISTS(SELECT 1 FROM sms_dispatches WHERE org_id=$1 AND state=ANY($2)) AS busy',[s.org_id,busyStates])).rows[0].busy)return null;
   const usage=(await db.query("SELECT count(*)::int messages,coalesce(sum(segments),0)::int segments FROM sms_dispatches WHERE org_id=$1 AND attempted_at>now()-interval '24 hours'",[s.org_id])).rows[0];if(usage.messages>=s.daily_limit||usage.segments+d.segments>s.daily_segment_limit)return null;
   let p;try{p=await plan(db,d.org_id,d.plan_id);}catch(e){if(['SMS_PLAN_NOT_READY','SMS_PLAN_CHANGED','SMS_RECIPIENT_STOPPED'].includes(e.message)){await db.query("UPDATE sms_dispatches SET state='cancelled' WHERE id=$1",[id]);await db.query("UPDATE outreach_activities SET status='cancelled',dispatch_metadata=dispatch_metadata||'{\"state\":\"cancelled\"}' WHERE id=$1",[d.activity_id]);return null;}throw e;}
   if(p.row.content_hash!==d.content_hash||p.artifact.recipient!==d.recipient||p.artifact.message!==d.message)return null;
   await db.query("UPDATE sms_dispatches SET state='submitting',attempted_at=now(),valid_until=$2 WHERE id=$1",[id,currentSlot.valid_until]);await db.query('UPDATE sms_connections SET last_attempt_at=now() WHERE org_id=$1',[d.org_id]);
   await db.query("UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||'{\"state\":\"submitting\"}' WHERE org_id=$1 AND id=$2",[d.org_id,d.activity_id]);
   return{...d,...s,id:d.id,valid_until:currentSlot.valid_until};
  });},
  async outcome(id,state,providerState=null){return transaction(async db=>{
   const allowed=state==='accepted'?['submitting']:state==='uncertain'?['submitting','accepted']:['submitting','accepted','uncertain','sent'];
   const d=(await db.query("UPDATE sms_dispatches SET state=$2,provider_state=$3 WHERE id=$1 AND state=ANY($4) RETURNING *",[id,state,providerState,allowed])).rows[0];if(!d)return;
   await db.query(`UPDATE outreach_activities SET status=$3::text,external_id=$4,sms_delivery_status=$5,sent_at=CASE WHEN $3 IN('sent','delivered') THEN coalesce(sent_at,now() AT TIME ZONE 'UTC') ELSE sent_at END,dispatch_metadata=dispatch_metadata||jsonb_build_object('state',$3::text) WHERE org_id=$1 AND id=$2`,[d.org_id,d.activity_id,state,d.client_id,providerState]);
  });},
  async reconcile(){await pool.query("UPDATE sms_dispatches SET state='uncertain' WHERE state='submitting' AND attempted_at<now()-interval '2 minutes'");return transaction(async db=>{const rows=(await db.query("SELECT d.*,s.secrets,s.device_id FROM sms_dispatches d JOIN sms_connections s ON s.org_id=d.org_id WHERE d.state IN('accepted','uncertain','sent') AND d.reconcile_attempts<20 AND d.next_reconcile_at<=now() ORDER BY d.next_reconcile_at LIMIT 5 FOR UPDATE OF d SKIP LOCKED")).rows;for(const d of rows)await db.query("UPDATE sms_dispatches SET reconcile_attempts=reconcile_attempts+1,next_reconcile_at=now()+make_interval(secs=>$2) WHERE id=$1",[d.id,Math.min(1800,30*2**Math.min(d.reconcile_attempts,6))]);return rows;});}
 };
}
module.exports={store,plan};
