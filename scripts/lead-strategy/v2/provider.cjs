'use strict';
const c=require('./contract.cjs');
// No HTTP client, key loading or ledger mutation. Transport must be injected.
function provenPreSend(e){const p=e?.transport_proof;return !!p&&p.instrumented===true&&['dns','connect','tls_handshake'].includes(p.phase)&&p.application_bytes===0&&p.all_attempts_pre_send===true&&p.prior_dispatch===false&&p.pooled===false&&p.redirected===false;}
async function generate(prepared,options={}){
 const {mode='ai',transport,gate=()=>false,sleep=ms=>new Promise(r=>setTimeout(r,ms)),random=Math.random,model='openai/gpt-oss-120b',reasoning_effort='low',max_completion_tokens=6000,operation}=options;
 if(mode==='template')return c.plan(prepared,c.template(prepared),'template_completed');
 if(mode==='fallback'){
  if(options.explicitFallback!==true)throw Error('EXPLICIT_FALLBACK_REQUIRED');
  return c.plan(prepared,c.template(prepared),'template_fallback');
 }
 if(mode!=='ai')throw Error('INVALID_MODE');
 const metadata={model,attempts:0,tokens:{prompt:0,completion:0,total:0},usage_complete:true,mocked:options.mocked===true};
 const fail=reason=>c.plan(prepared,null,'ai_failed',{...metadata,failure_reason:reason});
 if(!transport||!operation||await gate(operation)!==true)return fail('DISABLED_OR_ZERO_ALLOWANCE');
 if(!operation.lease||!operation.reservation||operation.fingerprint!==prepared.input_hash||c.hash(prepared.brief)!==prepared.input_hash||!Number.isFinite(operation.lease_expires_at)||operation.lease_expires_at<=Date.now())return fail('INVALID_LEASE_RESERVATION_OR_FINGERPRINT');
 const operationHash=c.hash(operation);
 if(!['low','medium','high'].includes(reasoning_effort)||!Number.isInteger(max_completion_tokens)||max_completion_tokens<1||max_completion_tokens>16000)throw Error('INVALID_PROVIDER_CONFIG');
 const request={model,reasoning_effort,max_completion_tokens,response_format:{type:'json_object'},messages:[{role:'system',content:prepared.prompt+'\nOUTPUT_SCHEMA\n'+JSON.stringify(prepared.schema)},{role:'user',content:JSON.stringify(prepared.brief)}]};
 let repaired=false,quickRetried=false;
 for(;;){
  if(c.hash(operation)!==operationHash||operation.lease_expires_at<=Date.now()||await gate(operation)!==true)return fail('GATE_CLOSED');
  let response;
  try{metadata.attempts++;response=await transport(request,operation);}
  catch(e){
   if(!quickRetried&&provenPreSend(e)){
    quickRetried=true;const delay=250+Math.floor(random()*751);
    if(!Number.isFinite(operation.lease_expires_at)||Date.now()+delay>=operation.lease_expires_at)return fail('LEASE_TOO_SHORT');
    await sleep(delay);continue;
   }
   metadata.usage_complete=provenPreSend(e);
   return fail(provenPreSend(e)?'PRE_SEND_RETRIES_EXHAUSTED':'AMBIGUOUS_DISPATCH_RECONCILE_OR_STOP');
  }
  const u=response?.usage;
  if(u){for(const [key,field] of [['prompt','prompt_tokens'],['completion','completion_tokens'],['total','total_tokens']]){if(Number.isFinite(u[field]))metadata.tokens[key]+=u[field];else metadata.usage_complete=false;}}
  else metadata.usage_complete=false;
  if(response?.error?.code==='rate_limit_exceeded')return fail('PROVIDER_RATE_LIMITED');
  const choice=response?.choices?.[0];
  if(choice?.finish_reason==='length')return fail('TRUNCATED_OUTPUT');
  if(choice?.finish_reason!=='stop')return fail('INCOMPLETE_OR_PROVIDER_ERROR');
  let output,result;
  try{output=JSON.parse(choice.message.content);result=c.validate(output,prepared);}catch{result={ok:false,kind:'schema',errors:['MALFORMED_JSON']};}
  if(result.ok)return c.plan(prepared,output,'ai_completed',metadata);
  if(result.kind!=='schema'||repaired)return fail(result.errors.join(','));
  if(options.allowRepair===false)return fail('SCHEMA_REPAIR_NOT_RESERVED');
  repaired=true;
  // Never echo arbitrary rejected prose into a repair instruction. Same reservation, gate rechecked.
  request.messages.push({role:'user',content:'Your previous response failed JSON/schema validation. Return the complete object again using the original brief and schema. This is the only repair attempt.'});
 }
}
module.exports={generate,provenPreSend};
