'use strict';
// Same authorized three-attempt ledger; Windows fallback for Docker TLS failure.
// Key is captured in memory only: never print it or write it to an artifact.
const fs=require('node:fs'),cp=require('node:child_process'),rt=require('./runtime.cjs');
(async()=>{
 const bundle=JSON.parse(cp.execFileSync('docker',['exec','n8n','node','/tmp/strategy-test-ai-live.cjs','host-prepare'],{encoding:'utf8',timeout:30000}));
 const {prepared,result,dir}=bundle;result.transport='windows_host_due_to_docker_tls_failure';
 const key=cp.execFileSync('docker',['exec','n8n','node','-e',"process.stdout.write(process.env.GROQ_API_KEY||'')"],{encoding:'utf8',timeout:10000});
 if(!key)throw Error('Key unavailable');
 const start=Date.now();
 try{
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(prepared.request),signal:AbortSignal.timeout(45000)});
  result.http_status=response.status;result.provider_response=await response.json();result.plan=rt.compose(prepared,{statusCode:response.status,body:result.provider_response});
 }catch(e){result.error={name:e.name,code:e.code,cause_code:e.cause?.code};}
 result.elapsed_ms=Date.now()-start;
 const data=JSON.stringify(result,null,2);
 fs.writeFileSync('documentation/STRATEGY_AI_TRIAL_'+result.attempt+'.json',data);
 cp.execFileSync('docker',['exec','-i','n8n','node','-e',"require('node:fs').writeFileSync("+JSON.stringify(dir+'/result-'+result.attempt+'.json')+",require('node:fs').readFileSync(0),{mode:0o600})"],{input:data,timeout:10000});
 console.log(JSON.stringify({attempt:result.attempt,lead_id:result.lead_id,http_status:result.http_status,error:result.error,elapsed_ms:result.elapsed_ms,method:result.plan?.generation.method,ai_status:result.plan?.generation.ai_status,validation_errors:result.plan?.validation_errors,usage:result.provider_response?.usage,finish_reason:result.provider_response?.choices?.[0]?.finish_reason}));
})().catch(()=>{console.error('Host trial failed; inspect the reserved attempt and saved result before retrying.');process.exitCode=1;});
