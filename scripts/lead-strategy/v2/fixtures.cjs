'use strict';
const {basic}=require('../../lead-enrichment/worker.cjs');
const rt=require('../runtime.cjs');
const snapshots=require('../../../tests/lead-enrichment/fixtures/benchmark-signals.json');
async function benchmarks(){
 const results=[];
 for(const f of snapshots){
  const report=await basic({lead:f.lead,source_checks:f.source_checks},async url=>{
   const page=f.snapshots.find(p=>p.request_url===url);if(!page)throw Error('OFFLINE_SNAPSHOT_NOT_FOUND');return page.response;
  });
  report.observed_at=f.captured_at;
  const state=report.signals?.web_presence?.state;
  const config=rt.campaign({org_id:f.lead.org_id,config:{name:'MOCK clinic website demonstration',mode:'ai',offer_profile:{key:'website_presence',source_check_max_age_days:180},channels:['whatsapp','call'],sender:{name:'Demo Sender',company:'Example Studio'},offer:{name:'Clinic website demonstration',description:'A sample clinic website for review.',approved_points:['The demonstration includes an enquiry form.'],prohibited_claims:['guaranteed revenue']},cta:{text:'Would you like to review the demonstration?'},timezone:'Asia/Karachi'}}).config;
  const input={lead:f.lead,campaign:{id:1,version:1,config},report:{basic:report,trust:{evaluated_at:'2026-10-12T00:00:00Z',website_presence:['none_found','social_only'].includes(state)?state:f.lead.website?'present':'unknown',freshness:{website_current:true},assessment_status:'assessed',conflicts:[]}}};
  results.push({id:f.lead.id,input,expected_fit:f.expected_fit});
 }
 return results;
}
function mockReply(output){return{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:1800,completion_tokens:550,total_tokens:2350}};}
const syntheticReadiness={whatsapp:{status:'ready',reasons:[]},call:{status:'ready',reasons:[]}};
module.exports={benchmarks,mockReply,syntheticReadiness};
