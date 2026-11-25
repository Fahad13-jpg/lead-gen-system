'use strict';
// Bounded read-only connector. Its HTTP port separately enforces fixed Meta GETs.
function createGet(fetch,token,{maxResponseBytes=262144}={}){
 if(![65536,262144].includes(maxResponseBytes))throw Error('INVALID_RESPONSE_LIMIT');
 if(typeof fetch!=='function'||typeof token!=='string'||!token||token.length>8192||/[\s\p{Cc}]/u.test(token))throw Error('RECHECK_CONNECTOR_REQUIRED');
 return async r=>{
  if(r?.method!=='GET'||r.timeout!==10000||r.maxResponseBytes!==maxResponseBytes||r.redirect!=='error')throw Error('RECHECK_REQUEST_REJECTED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(r.url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:controller.signal});
   if(response?.status!==200){try{await response?.body?.cancel();}catch{}return {status:Number.isInteger(response?.status)?response.status:0};}
   if(typeof response.body?.getReader!=='function')throw Error('BOUNDED_RESPONSE_REQUIRED');
   const reader=response.body.getReader(),parts=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;const bytes=Buffer.from(part.value);size+=bytes.length;if(size>maxResponseBytes)throw Error('RESPONSE_TOO_LARGE');parts.push(bytes);}}
   finally{try{await reader.cancel();}catch{}reader.releaseLock();}
   return {status:200,data:JSON.parse(Buffer.concat(parts).toString('utf8'))};
  }catch{throw Error('PROVIDER_RECHECK_UNCONFIRMED');}finally{clearTimeout(timer);}
 };
}
module.exports={createGet};
