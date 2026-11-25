'use strict';
class ManagedCallTools{
 constructor(){this.description={displayName:'Managed Retell Tools',name:'managedCallTools',group:['transform'],version:1,description:'Authenticated, organization-bound Retell tools; never dials',defaults:{name:'Managed Retell Tools'},inputs:['main'],outputs:['main'],credentials:[{name:'postgres',required:true},{name:'googleCalendarOAuth2Api',required:true}],properties:[{displayName:'Backend ID',name:'backendId',type:'string',default:'legacy',description:'Trusted deployment binding. Each backend has its own organization, token and Calendar credential.'}]};}
 async execute(){
  try{return [[{json:await require('./lead-system/scripts/calling/tool-worker.cjs').run(this,{backendId:this.getNodeParameter('backendId',0,'legacy')})}]];}
  catch(error){let diagnostic='call_tool_backend_unavailable';try{if(this.getInputData()[0]?.json?.body?.name==='connection_check')diagnostic=require('./lead-system/scripts/calling/tool-worker.cjs').calendarDiagnostic(error);}catch{}return [[{json:{ok:false,reason:'tool_backend_unavailable',diagnostic,action_completed:false,retry_allowed:false}}]];}
 }
}
module.exports={ManagedCallTools};
