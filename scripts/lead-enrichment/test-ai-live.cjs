'use strict';
// Explicit manual test only: synthetic evidence, no lead writes and no outreach.
const fs=require('node:fs');
const {analyze}=require('./ai-research.cjs');
async function main(){
 process.loadEnvFile('.env');
 const task={lead:{company_name:'Example Dental Clinic (synthetic test)'},basic:{evidence:[
  {type:'website_description',value:'Example Dental Clinic offers dental implants and routine checkups.',source_url:'https://clinic.example/services'}
 ],services:[{text:'Dental implants',source_url:'https://clinic.example/services'}]},campaign:{offer:'A clinic website demo with service pages and online appointment booking.'}};
 const research={linkedin:{profiles:[],recent_posts:[]}};
 const result=await analyze(task,research,{enabled:true});
 fs.mkdirSync('.local/enrichment-ai',{recursive:true});
 fs.writeFileSync('.local/enrichment-ai/synthetic-live.json',JSON.stringify({test_type:'synthetic_live_provider',result},null,2));
 console.log(JSON.stringify({test:'synthetic_evidence',status:result.status,http_status:result.http_status,model:result.model,usage:result.usage,analysis:result.analysis}));
 if(result.status!=='review_required')process.exitCode=1;
}
main().catch(()=>{console.error('live_test_failed');process.exitCode=1;});
