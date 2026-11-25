'use strict';
// Local operator diagnostic: calls only the existing no-write, no-provider preview.
const fs=require('node:fs'),path=require('node:path');
const {localGatheringTransport,gatheringService}=require('./gathering.cjs');
(async()=>{
 const transport=localGatheringTransport({key:fs.readFileSync(path.resolve(__dirname,'../../.local/gathering-api-key'),'utf8').trim()});
 const service=gatheringService({transport,identity:{principal:async()=>({role:'owner',subject:'operator-diagnostic-not-http-auth'})}});
 const result=await service.preview('operator',{org_id:1,request_id:'dash_'+'0'.repeat(32),job_name:'Read-only dashboard preview diagnostic',search_query:'dental clinics',location:'Islamabad, Pakistan',country_code:'PK',source:'google_maps',max_results:5,max_cost_usd:.5,max_customer_cost_usd:.5,billing_mode:'platform'});
 console.log(JSON.stringify({preview_verified:result.preview,billing_ready:result.billing.ready,can_submit:result.billing.can_submit,billing_reason:result.billing.reason,candidate_limit:result.candidate_limit,jobs_created:0,apify_requests:0,database_changed:false}));
})().catch(error=>{console.error(JSON.stringify({preview_verified:false,reason:['PREVIEW_UNAVAILABLE','GATHERING_CONNECTION_REQUIRED'].includes(error.message)?error.message:'LOCAL_PREVIEW_CHECK_FAILED',jobs_created:0,apify_requests:0}));process.exitCode=1;});
