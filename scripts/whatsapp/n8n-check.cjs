'use strict';
const {check}=require('./connection.cjs');
// Read-only node adapter: credentials stay inside n8n's credential interface.
// An operator binding is not a replacement for customer authentication.
async function run(context){
 const binding=JSON.parse(context.getNodeParameter('binding',0));
 const ref=context.getNode().credentials?.whatsAppApi?.id;
 if(ref!==binding.credential_ref)throw Error('CREDENTIAL_REFERENCE_MISMATCH');
 const operator=context.getNodeParameter('operatorConfirmed',0)===true;
 if(!operator)return {state:'blocked',reason:'operator_binding_required',execution_authorized:false};
 const credential=await context.getCredentials('whatsAppApi');
 if(String(credential.businessAccountId)!==binding.waba_id||typeof credential.accessToken!=='string'||!credential.accessToken||/[\s\p{Cc}]/u.test(credential.accessToken))throw Error('CREDENTIAL_ACCOUNT_MISMATCH');
 const result=await check(binding,{
  authorizeBinding:async b=>operator&&b.credential_ref===ref&&b.waba_id===String(credential.businessAccountId),
  authenticatedGet:async r=>{
   const response=await context.helpers.httpRequest({method:'GET',url:r.url,headers:{Authorization:'Bearer '+credential.accessToken},returnFullResponse:true,ignoreHttpStatusErrors:true,disableFollowRedirect:true,timeout:r.timeout,json:true});
   if(response.statusCode!==200)return {status:response.statusCode};
   // n8n's helper parses the response before this bound; adapter transport-size
   // enforcement is UNVERIFIED. The provider URL is fixed, never user supplied.
   if(Buffer.byteLength(JSON.stringify(response.body),'utf8')>65536)throw Error('RESPONSE_LIMIT');
   return {status:200,data:response.body};
  }
 });
 return {...result,scope:'local_operator_only',sent:false};
}
module.exports={run};
