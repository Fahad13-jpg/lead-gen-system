'use strict';
const crypto=require('node:crypto');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function vault(key){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('GMAIL_SETUP_REQUIRED');
 return{
 seal(id,value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(id));return{v:1,iv:iv.toString('base64'),data:Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]).toString('base64'),tag:c.getAuthTag().toString('base64')};},
 open(id,value){if(value?.v!==1)throw Error('GMAIL_SETUP_REQUIRED');const c=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));c.setAAD(Buffer.from(id));c.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([c.update(Buffer.from(value.data,'base64')),c.final()]).toString('utf8'));}
 };
}
function store({transaction,key}){
 const cipher=vault(key);
 const valid=state=>typeof state==='string'&&/^[A-Za-z0-9_-]{43}$/.test(state);
 function bound(row,b){if(!row)return false;if(row.org_id!==b.org_id||row.subject!==b.subject)throw Error('MEMBERSHIP_REQUIRED');return true;}
 async function lock(db,state){if(!valid(state))return null;return(await db.query(`SELECT *,expires_at>now() AS fresh FROM gmail_oauth_sessions WHERE state_hash=${q(hash(state))} FOR UPDATE`)).rows[0];}
 return{
 async issue(value){return transaction(async db=>{
  // Serialize admissions, including across gateway processes. Never retire a claim.
  await db.query("SELECT pg_advisory_xact_lock(714070)");
  await db.query("UPDATE gmail_oauth_sessions SET phase='retired',payload=NULL WHERE expires_at<=now() AND phase IN('issued','callback','denied')");
  // Completed receipts contain no secrets; prune old terminal rows only.
  await db.query("DELETE FROM gmail_oauth_sessions WHERE phase IN('completed','retired','denied') AND created_at<now()-interval '7 days'");
  const count=(await db.query("SELECT count(*)::integer AS count FROM gmail_oauth_sessions WHERE phase IN('issued','callback','claimed')")).rows[0]?.count;
  if(!Number.isInteger(count)||count>=100)throw Error('GMAIL_SIGNUP_BUSY');
  const state=crypto.randomBytes(32).toString('base64url'),id=hash(state),payload=cipher.seal(id,{...value,oauth_state_hash:id});
  try{await db.query(`INSERT INTO gmail_oauth_sessions(state_hash,org_id,subject,client_id,redirect_uri,reconnect_id,phase,payload) VALUES(${q(id)},${value.org_id},${q(value.subject)},${q(value.client_id)},${q(value.redirect_uri)},${value.reconnect?q(value.reconnect.connection_id):'NULL'},'issued',${q(JSON.stringify(payload))}::jsonb)`);}catch(e){if(e.code==='23505')throw Error('GMAIL_SIGNUP_BUSY');throw e;}
  return state;
 });},
 async capture(params){const state=params.get('state'),code=params.get('code'),denied=params.has('error');if(!valid(state)||!denied&&(typeof code!=='string'||!code||code.length>8192||/[\x00-\x20]/.test(code)))return false;
  return transaction(async db=>{const r=await lock(db,state);if(!r?.fresh||r.phase!=='issued')return false;const value=cipher.open(r.state_hash,r.payload);await db.query(`UPDATE gmail_oauth_sessions SET phase=${q(denied?'denied':'callback')},payload=${denied?'NULL':q(JSON.stringify(cipher.seal(r.state_hash,{...value,code})))+'::jsonb'} WHERE state_hash=${q(r.state_hash)}`);return true;});
 },
 async get(state,b){return transaction(async db=>{const r=await lock(db,state);if(!bound(r,b))return null;return{phase:r.phase,fresh:r.fresh,receipt:r.receipt,reconnect_id:r.reconnect_id,...(r.fresh&&r.phase==='callback'?{code:cipher.open(r.state_hash,r.payload).code}:{})};});},
 async consume(state,b){return transaction(async db=>{const r=await lock(db,state);if(!bound(r,b)||!r.fresh||r.phase!=='callback'||r.client_id!==b.client_id||r.redirect_uri!==b.redirect_uri)return null;const value=cipher.open(r.state_hash,r.payload);await db.query(`UPDATE gmail_oauth_sessions SET phase='claimed',payload=NULL WHERE state_hash=${q(r.state_hash)}`);delete value.code;return value;});},
 async complete(state,b,receipt){return transaction(async db=>{const r=await lock(db,state);if(!bound(r,b)||r.phase!=='claimed')throw Error('GMAIL_STATE_EXPIRED');await db.query(`UPDATE gmail_oauth_sessions SET phase='completed',receipt=${q(JSON.stringify(receipt))}::jsonb,payload=NULL WHERE state_hash=${q(r.state_hash)}`);});},
 async reconcile(state,b){return transaction(async db=>{
  const r=await lock(db,state);if(!bound(r,b))return null;if(r.phase!=='claimed')return r.receipt||null;
  const s=(await db.query(`SELECT s.connection_id,s.state,s.version FROM gmail_enrollment_journal j JOIN sender_connections s ON s.org_id=j.org_id AND s.connection_id=j.connection_id AND s.credential_ref=j.credential_ref AND s.version=j.version WHERE j.oauth_state_hash=${q(r.state_hash)} AND j.org_id=${b.org_id} AND j.owner_subject=${q(b.subject)} AND ((j.phase='registered' AND s.state='pending_check') OR (j.phase='checked' AND s.state='ready')) FOR SHARE OF j,s`)).rows[0];if(!s)return null;
  const receipt={org_id:b.org_id,connection_id:s.connection_id,state:s.state,version:s.version,execution_authorized:false,...(r.reconnect_id?{reconnected:true,campaign_rebind_required:true}:{})};
  await db.query(`UPDATE gmail_oauth_sessions SET phase='completed',receipt=${q(JSON.stringify(receipt))}::jsonb WHERE state_hash=${q(r.state_hash)}`);return receipt;
 });},
 async retire(state,b,{definitive=false}={}){return transaction(async db=>{const r=await lock(db,state);if(!bound(r,b))return{missing:true};if(r.phase==='claimed'&&!definitive)return{blocked:true};if(r.phase==='completed')return{receipt:r.receipt};await db.query(`UPDATE gmail_oauth_sessions SET phase='retired',payload=NULL WHERE state_hash=${q(r.state_hash)}`);return{retired:true};});}
 };
}
module.exports={store,vault};
