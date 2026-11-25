'use strict';
// Read-only provider diagnosis. Never print stored credentials or full logs.
const {execFileSync}=require('node:child_process');
(async()=>{
 const query="SELECT json_build_object('key',a.api_key,'run',j.apify_actor_run_id,'dataset',j.dataset_id) FROM scraping_jobs j JOIN gathering_accounts a ON a.id=j.provider_account_id WHERE j.id=133 AND j.org_id=7";
 const saved=JSON.parse(execFileSync('docker',['exec','postgres_db','psql','-U','n8n_user','-d','lead_db','-At','-c',query],{encoding:'utf8'}).trim());
 async function read(path){const r=await fetch('https://api.apify.com/v2/'+path,{headers:{Authorization:'Bearer '+saved.key},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('PROVIDER_HTTP_'+r.status);return r;}
 const run=(await (await read('actor-runs/'+saved.run)).json()).data;
 const dataset=(await (await read('datasets/'+saved.dataset)).json()).data;
 const logs=await (await read('actor-runs/'+saved.run+'/log')).text();
 const relevant=logs.split('\n').filter(l=>/error|warn|blocked|captcha|403|429|failed|finished|results|business|listing|request/i.test(l)).slice(-25).map(l=>l.replaceAll(saved.key,'[REDACTED]').replace(/apify_api_[A-Za-z0-9]+/g,'[REDACTED]').slice(0,700));
 console.log(JSON.stringify({status:run.status,statusMessage:run.statusMessage,usageTotalUsd:run.usageTotalUsd,itemCount:dataset.itemCount,logs:relevant},null,2));
})().catch(e=>{console.error(e.message.startsWith('PROVIDER_HTTP_')?e.message:'READ_ONLY_SEARCH_DIAGNOSIS_FAILED');process.exitCode=1;});
