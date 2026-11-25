'use strict';
// Executes only the account-check workflow; never an email/reply workflow.
const cp=require('node:child_process'),fs=require('node:fs');
const r=cp.spawnSync('docker',['exec','n8n','n8n','execute','--id=managedGmailcheck','--rawOutput'],{encoding:'utf8',timeout:120000,maxBuffer:12000000});
let result;const raw=r.stdout||'';
for(let i=0;i<raw.length;i++){if(raw[i]!=='{')continue;try{const candidate=JSON.parse(raw.slice(i,raw.lastIndexOf('}')+1));const data=candidate?.data?.resultData||candidate?.resultData;const value=data?.runData?.['Check Gmail Connection']?.[0]?.data?.main?.[0]?.[0]?.json;if(value){result=value;break;}}catch{}}
if(r.status===0&&result&&['ready','reconnect_required','pending_check','idle','busy','unchanged'].includes(result.state)){
 const safe={state:result.state,processed:result.processed,sent:false,...(['provider_check_unconfirmed','authorization_rejected','identity_or_scope_mismatch','check_stale'].includes(result.reason)?{reason:result.reason}:{})};
 fs.writeFileSync('.local/gmail-recheck-last-result.json',JSON.stringify({...safe,checked_at:new Date().toISOString()},null,2));console.log(JSON.stringify(safe));
}else{console.error('GMAIL_CHECK_EXECUTION_UNCONFIRMED');process.exitCode=1;}
