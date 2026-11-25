'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function build(operation){
 const queue=operation==='queue',fn=queue?'outreach_call_queue_preview':'outreach_call_reconciliation_preview';
 const label=queue?'Call queue preview':'Call reconciliation preview';
 const nodes=[{id:'schedule',name:'Schedule Trigger',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],
 parameters:{rule:{interval:[{field:'minutes',minutesInterval:queue?1:5}]}}},
 {id:'scope',name:'Validate configured organization',type:'n8n-nodes-base.code',typeVersion:2,position:[240,0],
 parameters:{mode:'runOnceForAllItems',jsCode:"// Operator configuration only; never take org_id from an unauthenticated request.\nconst org_id = null; // Set only during an approved deployment.\nif (!Number.isSafeInteger(org_id) || org_id <= 0) throw new Error('CALL_ORG_NOT_CONFIGURED');\nreturn [{json:{org_id}}];"}},
 {id:'preview',name:label,type:'n8n-nodes-base.postgres',typeVersion:2.6,position:[480,0],alwaysOutputData:true,
 parameters:{operation:'executeQuery',query:`SELECT ${fn}({{ $json.org_id }}) AS result`,options:{}}},
 {id:'note',name:'Read-only rollout boundary',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-300],
 parameters:{width:780,height:260,content:'LOCAL / INACTIVE PREVIEW ONLY. Requires migration 037 (unapplied) and explicit org_id + PostgreSQL credential binding. No call creation, provider lookup, reservation, database write or automatic redial. These schedules prepare monitoring only; they are not a deployed executor. Pakistan route, carrier number, cost quote and bilingual voice test UNVERIFIED. Preserve existing approval, lease, budget and suppression gates. Existing uncertain calls remain quarantined.\n\n2026-10-26 update: initial rollout is US / English only. Pakistan is deferred. The Pakistan setup note above is retained as history, not a US rollout requirement. Verify US route, owned caller ID, recipient eligibility and timezone before any live release.'}}];
 return {name:label,active:false,nodes,connections:{'Schedule Trigger':{main:[[{node:'Validate configured organization',type:'main',index:0}]]},
 'Validate configured organization':{main:[[{node:label,type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'Asia/Karachi',saveDataSuccessExecution:'none',saveDataErrorExecution:'none'}};
}
if(require.main===module){for(const [operation,file] of [['queue','07f_call_queue_preview.json'],['reconciliation','09c_call_reconciliation_preview.json']])
 fs.writeFileSync(path.join(root,'workflows',file),JSON.stringify(build(operation),null,2)+'\n');}
module.exports={build};
