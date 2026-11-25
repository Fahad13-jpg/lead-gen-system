'use strict';
// Explicitly approved one-request experiment. No DB access, deployment or sending.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const c=require('../lead-strategy/v2/contract.cjs');
const {generate}=require('../lead-strategy/v2/provider.cjs');
const {benchmarks,syntheticReadiness}=require('../lead-strategy/v2/fixtures.cjs');
const root=path.resolve(__dirname,'../..');
const selected=({strong:167,weak:449,thin:445})[process.argv[3]];
if(!selected)throw Error('EXPECTED_STRONG_WEAK_OR_THIN');
const dir=path.join(root,'.local/strategy-v2-quality-20261014-'+selected);
function key(){
 if(process.env.GROQ_API_KEY)return process.env.GROQ_API_KEY;
 const line=fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).find(x=>/^GROQ_API_KEY\s*=/.test(x));
 if(!line)throw Error('GROQ_KEY_NOT_CONFIGURED');
 return line.slice(line.indexOf('=')+1).trim().replace(/^(['"])(.*)\1$/,'$2');
}
async function main(){
 const fixture=(await benchmarks()).find(x=>x.id===selected);
 const config=fixture.input.campaign.config;
 config.name='SAMPLE clinic service pages';config.offer.name='Clinic website demo';
 config.offer.description='Sample clinic service-page demo; no claim that the business needs a replacement website.';
 config.offer.approved_points=['The demo explains clinic services.','The demo includes an enquiry form.'];
 config.offer_fit_rules=[{evidence_terms:['braces'],approved_point_index:0}];
 const prepared=c.build(fixture.input,{now:'2026-10-14T00:00:00Z',readinessSnapshot:syntheticReadiness});
 fs.mkdirSync(dir,{recursive:true});
 const context={lead_id:selected,evidence:'Historical stored snapshot, not freshly verified',offer:'Demonstration offer, not a real customer campaign',channel_permissions:'Synthetic draft-only readiness',budget:{requests:1,max_completion_tokens:6000},token_estimate:prepared.token_estimate,brief:prepared.brief};
 fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(context,null,2));
 if(process.argv[2]!=='--run'){console.log(JSON.stringify({prepared:true,...context,brief:undefined}));return;}
 const secret=key();if(!secret||secret.includes('MOCK'))throw Error('GROQ_KEY_NOT_CONFIGURED');
 const marker=path.join(dir,'one-request-reservation.json');
 // Exclusive creation prevents repeat runs, even after a crash or ambiguous timeout.
 fs.writeFileSync(marker,JSON.stringify({state:'reserved',at:new Date().toISOString(),requests:1,max_completion_tokens:6000}),{flag:'wx'});
 let calls=0,httpStatus=null,transportError=null;
 const operation={lease:'scratch-quality-20261014-'+selected,reservation:'scratch-quality-20261014-'+selected,fingerprint:prepared.input_hash,lease_expires_at:Date.now()+120000};
 const start=Date.now();
 const transport=async request=>{
  if(++calls!==1)throw Error('ONE_REQUEST_LIMIT');
  fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(request,null,2));
  return new Promise((resolve,reject)=>{
   const req=https.request('https://api.groq.com/openai/v1/chat/completions',{method:'POST',family:4,agent:false,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'}},res=>{
    httpStatus=res.statusCode;let text='';res.setEncoding('utf8');
    res.on('data',chunk=>{text+=chunk;if(text.length>2000000)req.destroy(Error('RESPONSE_TOO_LARGE'));});
    res.on('end',()=>{clearTimeout(timer);try{const response=JSON.parse(text);fs.writeFileSync(path.join(dir,'response.json'),JSON.stringify(response,null,2));resolve(response);}catch{reject(Error('INVALID_PROVIDER_JSON'));}});
   });
   const timer=setTimeout(()=>req.destroy(Error('REQUEST_DEADLINE')),90000);
   req.on('error',e=>{clearTimeout(timer);transportError={code:e.code||'TRANSPORT_ERROR'};reject(e);});
   req.end(JSON.stringify(request));
  });
 };
 const plan=await generate(prepared,{operation,gate:()=>calls===0,transport,allowRepair:false,max_completion_tokens:6000,reasoning_effort:'low'});
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(plan,null,2));
 const report={...context,brief:undefined,at:new Date().toISOString(),calls,http_status:httpStatus,transport_error:transportError,duration_ms:Date.now()-start,state:plan.state,generation:plan.generation,validation_errors:plan.validation_errors,quality_review:plan.quality_review,production_changes:false,trial_ledger_changes:false,sent:false};
 fs.writeFileSync(marker,JSON.stringify({state:'consumed_or_ambiguous',calls,at:report.at}));
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(['EEXIST','ENOENT'].includes(e.code)?e.code:'TEST_STOPPED');process.exitCode=1;});
