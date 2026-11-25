'use strict';
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 process.loadEnvFile('.env');
 const id=Number(process.argv[2]);if(![159,162,165].includes(id))throw Error('Unexpected canary');
 const suffix=process.argv[3]==='revised'?'-revised':'';
 const dir='.local/enrichment-ai',path=dir+'/real-'+id+suffix+'.json';if(fs.existsSync(path))throw Error('Result exists; do not repeat the provider request');
 const tasks=JSON.parse(fs.readFileSync(dir+'/real-input.json'));const task=tasks.find(t=>t.lead.id===id);if(!task)throw Error('Missing input');
 // Test-only offer, not a customer campaign or a claim about this lead's needs.
 task.campaign={offer:'Demonstrate a business website with service pages and an enquiry form.'};
 const w=JSON.parse(fs.readFileSync('workflows/06B_ai_deep_research.json'));
 const execute=(name,data,previous={})=>vm.runInNewContext('(function(){'+w.nodes.find(n=>n.name===name).parameters.jsCode+'})()',{$json:data,$:n=>({item:{json:previous[n]}})});
 const prepared=execute('Prepare Evidence and AI Request',{id,lease:'canary-not-a-database-lease',input:task});
 if(!prepared.evidence.length)throw Error('No usable evidence');
 const stamp=dir+'/last-real-request.json';
 if(fs.existsSync(stamp)&&Date.now()-JSON.parse(fs.readFileSync(stamp)).at<65000)throw Error('Wait 65 seconds between requests');
 fs.writeFileSync(stamp,JSON.stringify({at:Date.now(),id}));
 const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(prepared.request),signal:AbortSignal.timeout(45000)});
 const body=await response.json();const output=execute('Validate AI Evidence',{statusCode:response.status,body},{'Prepare Evidence and AI Request':prepared});
 let validation_error=null;if(output.result.ai_research.status==='invalid_output'){try{if(body.choices?.[0]?.finish_reason!=='stop')throw Error('INCOMPLETE_RESPONSE');require('./ai-research.cjs').validate(JSON.parse(body.choices[0].message.content),prepared.evidence,prepared.hasCampaign);}catch(e){validation_error=e.message;}}
 fs.writeFileSync(path,JSON.stringify({test_offer:task.campaign.offer,lead:{id,name:task.lead.company_name},input_evidence:prepared.evidence,output,validation_error,provider_message:body.choices?.[0]?.message?.content},null,2));
 console.log(JSON.stringify({id,name:task.lead.company_name,status:output.result.ai_research.status,evidence:prepared.evidence,analysis:output.result.ai_research.analysis,usage:output.result.ai_research.usage}));
 if(output.result.ai_research.status!=='review_required')process.exitCode=1;
})().catch(e=>{console.error(['Wait 65 seconds between requests','Result exists; do not repeat the provider request','No usable evidence'].includes(e.message)?e.message:JSON.stringify({status:'canary_failed',error_type:e.name,code:e.cause?.code||e.code||null}));process.exitCode=1;});
