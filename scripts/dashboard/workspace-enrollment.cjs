'use strict';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function input(value,read=false){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!(read?['request_id']:['request_id','name','acknowledge_owner']).includes(k))||!uuid(value.request_id))throw Error('INVALID_FILTER');
 if(read)return{request_id:value.request_id.toLowerCase()};
 if(typeof value.name!=='string'||/[\p{Cc}\p{Cf}]/u.test(value.name)||value.acknowledge_owner!==true)throw Error('INVALID_FILTER');const name=value.name.normalize('NFKC').trim().replace(/ +/g,' ');if(Array.from(name).length<2||Array.from(name).length>100)throw Error('INVALID_FILTER');return{request_id:value.request_id.toLowerCase(),name};
}
function service({identity,transaction}){
 async function verified(token){const s=await identity.session(token);if(s?.identity_verified!==true||s.email_verified!==true||!/^[a-f0-9]{64}$/.test(s.subject||''))throw Error('AUTHENTICATION_FAILED');return s.subject;}
 const lock=(db,subject)=>db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[subject]);
 async function saved(db,subject){return(await db.query(`SELECT e.org_id,e.request_id::text,e.requested_name,o.org_name,o.status,m.role,m.active
  FROM workspace_enrollments e JOIN organizations o ON o.id=e.org_id
  LEFT JOIN org_sender_memberships m ON m.org_id=e.org_id AND m.subject=e.subject
  WHERE e.subject=$1`,[subject])).rows[0];}
 function receipt(row,p){if(row.request_id!==p.request_id||p.name!==undefined&&row.requested_name!==p.name)throw Error('WORKSPACE_REQUEST_CONFLICT');if(row.status!=='active'||row.active!==true||row.role!=='owner')throw Error('WORKSPACE_ACCESS_REVIEW_REQUIRED');return{saved:true,organization:{org_id:row.org_id,name:row.org_name,role:'owner'},provider_credits_granted:false,ai_requests_granted:0,sending_enabled:false};}
 return{
  async create(token,value){const p=input(value),subject=await verified(token);return transaction(async db=>{
   await lock(db,subject);const prior=await saved(db,subject);if(prior)return{...receipt(prior,p),already_recorded:true};
   const memberships=(await db.query('SELECT active FROM org_sender_memberships WHERE subject=$1 LIMIT 1',[subject])).rows;if(memberships.length)throw Error('WORKSPACE_MEMBERSHIP_EXISTS');
   const existing=(await db.query('SELECT 1 FROM workspace_enrollments WHERE request_id=$1',[p.request_id])).rows;if(existing.length)throw Error('WORKSPACE_REQUEST_CONFLICT');
   const row=(await db.query(`INSERT INTO organizations(org_name,subscription_tier,max_users,monthly_credit_limit,credits_used,status)
    VALUES($1,'freemium',1,0,0,'active') RETURNING id,org_name`,[p.name])).rows[0];
   await db.query("INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES($1,$2,'owner',true)",[row.id,subject]);
   await db.query('INSERT INTO workspace_enrollments(subject,org_id,request_id,requested_name) VALUES($1,$2,$3,$4)',[subject,row.id,p.request_id,p.name]);
   await db.query('INSERT INTO strategy_ai_controls(org_id,enabled,monthly_limit) VALUES($1,false,0)',[row.id]);
   return{saved:true,organization:{org_id:row.id,name:row.org_name,role:'owner'},already_recorded:false,provider_credits_granted:false,ai_requests_granted:0,sending_enabled:false};
  });},
  async status(token,value){const p=input(value,true),subject=await verified(token);return transaction(async db=>{await lock(db,subject);const row=await saved(db,subject);return row?receipt(row,p):{saved:false,provider_credits_granted:false,ai_requests_granted:0,sending_enabled:false};});}
 };
}
module.exports={service,input};
