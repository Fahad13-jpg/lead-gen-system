'use strict';
const core=require('./core.cjs');

// No global fetch, environment lookup or automatic retry. The caller must supply
// both an authenticated credential resolver and an explicitly selected HTTP port.
async function prepareTransport(artifact,ports){
 if(typeof ports?.fetch!=='function'||typeof ports?.resolveCredential!=='function')throw Error('WHATSAPP_TRANSPORT_NOT_CONFIGURED');
 const request=core.request(artifact),snapshot=core.hash(artifact);
 const now=ports.now||Date.now,timeout=ports.timeoutMs??10000;
 if(!Number.isInteger(timeout)||timeout<1000||timeout>30000)throw Error('INVALID_TRANSPORT_TIMEOUT');
 let credential;
 try{credential=await ports.resolveCredential({org_id:artifact.org_id,connection_id:artifact.connection_id,credential_ref:artifact.credential_ref,phone_number_id:artifact.phone_number_id,waba_id:artifact.waba_id});}
 catch{throw Error('WHATSAPP_CREDENTIAL_UNAVAILABLE');}
 if(!Number.isSafeInteger(artifact.org_id)||artifact.org_id<1||credential?.org_id!==artifact.org_id||credential.connection_id!==artifact.connection_id||credential.credential_ref!==artifact.credential_ref||credential.phone_number_id!==artifact.phone_number_id||credential.waba_id!==artifact.waba_id||typeof credential.access_token!=='string'||!credential.access_token||credential.access_token.length>8192||/[\s\p{Cc}]/u.test(credential.access_token)||!Number.isFinite(Date.parse(credential.expires_at))||Date.parse(credential.expires_at)<=now()+timeout)throw Error('WHATSAPP_CREDENTIAL_BINDING_INVALID');
 const token=credential.access_token,expiresAt=Date.parse(credential.expires_at);
 let used=false;
 return async function submit(supplied,boundArtifact){
  if(used)throw Error('WHATSAPP_TRANSPORT_ALREADY_USED');
  if(core.hash(boundArtifact)!==snapshot||JSON.stringify(supplied)!==JSON.stringify(request)||expiresAt<=now()+timeout)throw Error('WHATSAPP_TRANSPORT_BINDING_CHANGED');
  used=true; // Consumed before I/O; even a timeout cannot unlock a second send.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await ports.fetch(request.url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(request.body),redirect:'error',signal:controller.signal});
   if(!Number.isInteger(response?.status)||response.status<100||response.status>599)throw Error('INVALID_HTTP_RESPONSE');
   // Never retain or surface provider errors, which may contain sensitive data.
   if(response.status!==200){
    const diagnostic={phase:'http_response',http_status:response.status};
    if(typeof response.body?.getReader==='function'){
     const reader=response.body.getReader(),chunks=[];let size=0;
     try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw Error('LIMIT');chunks.push(Buffer.from(part.value));}const error=JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error;for(const [field,name]of [['code','provider_error_code'],['error_subcode','provider_error_subcode']])if(Number.isSafeInteger(error?.[field]))diagnostic[name]=error[field];}catch{}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
    }else{try{await response.body?.cancel();}catch{}}
    return {status:response.status,data:null,diagnostic};
   }
   if(typeof response.body?.getReader!=='function')throw Error('BOUNDED_RESPONSE_REQUIRED');
   const reader=response.body.getReader();let size=0;const chunks=[];
   try{for(;;){const part=await reader.read();if(part.done)break;const bytes=Buffer.from(part.value);size+=bytes.length;if(size>65536)throw Error('RESPONSE_TOO_LARGE');chunks.push(bytes);}}
   finally{try{await reader.cancel();}catch{}reader.releaseLock();}
   return {status:200,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  }catch{throw Error('WHATSAPP_SUBMISSION_UNCONFIRMED');}
  finally{clearTimeout(timer);}
 };
}
module.exports={prepareTransport};
