'use strict';
// Private backend service only; no route, webhook or demo-login authorization.
const assert=require('node:assert/strict'),auth=require('../sender-connections/auth.cjs');
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
const json=p=>quote(JSON.stringify(p))+'::jsonb';
function publicItems(result){if(!Array.isArray(result?.items))return result;return {...result,items:result.items.map(i=>({activity_id:i.activity_id,received_at:i.received_at,phone:i.message?.recipient,text:i.message?.text??null,occurred_at:i.message?.occurred_at,unsupported_content:i.message?.unsupported_content===true,opted_out:i.message?.stop_reason==='opt_out',review_state:i.message?.review_state,inbox_status:i.message?.inbox_review?.status||'new',revision:i.message?.inbox_revision||1,body_redacted:!!i.message?.body_redacted_at}))};}
function service(deps){
 async function invoke(token,input,operation,keys){
  assert(input&&typeof input==='object'&&!Array.isArray(input)&&Number.isSafeInteger(input.org_id)&&input.org_id>0,'INVALID_ORG');
  assert(Object.keys(input).every(k=>['org_id',...keys].includes(k)),'UNSUPPORTED_FIELD');
  const identity=auth.verify(token,deps.authConfig),{org_id,...payload}=input;
  // SQL rechecks active organization membership and role. JWT org/role claims,
  // request-supplied subjects and localStorage values never become principals.
  return deps.query(`SELECT ${operation}(${org_id},${quote(identity.subject)},${json(payload)}) AS result`);
 }
 return {
  async list(token,input){return publicItems(await invoke(token,input,'outreach_whatsapp_inbox_read',['limit','before_id']));},
  async review(token,input){return invoke(token,input,'outreach_whatsapp_inbox_manage',['activity_id','expected_revision','action','request_id']);},
  async retention(token,input){return invoke(token,input,'outreach_whatsapp_inbox_retention',['retention_days','limit','dry_run']);}
 };
}
module.exports={service,publicItems};
