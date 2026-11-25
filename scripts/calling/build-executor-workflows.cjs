'use strict';
const fs=require('node:fs'),path=require('node:path'),{normalize}=require('./n8n-receipt.cjs');
const root=path.resolve(__dirname,'../..');
function storeSql(item){
 const operation={outreach_call_observe:'outreach_call_ingest',outreach_call_uncertain:'outreach_call_uncertain'}[item.operation];
 if(!operation)return "SELECT '{\"saved\":false,\"reason\":\"lookup_unverified\",\"retry_allowed\":false}'::jsonb AS result";
 return "SELECT "+operation+"('"+JSON.stringify(item.payload).replace(/'/g,"''")+"'::jsonb) AS result";
}
function build(poll=false){
 const scope={id:'scope',name:'Operator binding',type:'n8n-nodes-base.code',typeVersion:2,position:[220,0],
 parameters:{mode:'runOnceForAllItems',jsCode:`// Trusted deployment configuration. Bind this SAME credential ID on the HTTP node.\nconst org_id = null;\nconst connection_ref = null;\nif (!Number.isSafeInteger(org_id) || org_id <= 0 || typeof connection_ref !== 'string' || !connection_ref) throw Error('CALL_BINDING_NOT_CONFIGURED');\nreturn [{json:{org_id,connection_ref}}];`}};
 const query=poll?"SELECT org_id,id::text AS activity_id,dispatch_metadata->>'lease' AS lease,dispatch_metadata->>'content_hash' AS content_hash,dispatch_metadata->>'connection_ref' AS connection_ref,dispatch_metadata->>'provider_call_id' AS provider_call_id,dispatch_metadata->'expected_request' AS request FROM outreach_call_poll_queue({{ $json.org_id }},'{{ $json.connection_ref.replace(/'/g, \"''\") }}')":
 "SELECT outreach_call_dispatch_next({{ $json.org_id }},'{{ $json.connection_ref.replace(/'/g, \"''\") }}') AS result";
 const nodes=[{id:'schedule',name:'Schedule Trigger',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}},scope,
 {id:'claim',name:'Load calling work',type:'n8n-nodes-base.postgres',typeVersion:2.6,position:[440,0],alwaysOutputData:true,retryOnFail:false,
 parameters:{operation:'executeQuery',query,options:{}}},
 {id:'eligible',name:'Work authorized',type:'n8n-nodes-base.if',typeVersion:2.2,position:[660,0],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'ready',leftValue:poll?'={{ !!$json.provider_call_id }}':'={{ $json.result?.authorized === true }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}},
 {id:'transport',name:'Retell request',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[880,0],retryOnFail:false,onError:'continueRegularOutput',
 parameters:{method:poll?'GET':'POST',url:poll?"={{ 'https://api.retellai.com/v2/get-call/' + encodeURIComponent($json.provider_call_id) }}":'https://api.retellai.com/v2/create-phone-call',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
 ...(poll?{}:{sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.result.request) }}'}),
 options:{timeout:15000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}}},
 {id:'normalize',name:'Validate provider receipt',type:'n8n-nodes-base.code',typeVersion:2,position:[1100,0],parameters:{mode:'runOnceForEachItem',jsCode:
 `const normalize = ${normalize.toString()};\nconst binding = $('Load calling work').item.json${poll?'':'.result'};\nreturn {json:normalize($json,binding,${poll})};`}},
 {id:'store',name:'Store calling result',type:'n8n-nodes-base.postgres',typeVersion:2.6,position:[1320,0],alwaysOutputData:true,retryOnFail:false,
 parameters:{operation:'executeQuery',query:"{{ ['outreach_call_observe','outreach_call_uncertain'].includes($json.operation) ? \"SELECT \" + $json.operation + \"('\" + JSON.stringify($json.payload).replace(/'/g, \"''\") + \"'::jsonb) AS result\" : \"SELECT '{\\\"saved\\\":false,\\\"reason\\\":\\\"lookup_unverified\\\",\\\"retry_allowed\\\":false}'::jsonb AS result\" }}",options:{}}},
 {id:'note',name:'Calling setup and safety boundary',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-340],parameters:{width:1450,height:280,content:'LOCAL / INACTIVE. Requires unapplied migrations 037–041, PostgreSQL credential, explicit organization and matching Retell Header Auth credential ID. No credentials included. Trusted campaign config must enable release, US/English verified route, recipient calling permission and timezone, owner campaign hours, plan window, fresh quote, daily cap and spacing. Plans remain non-authorizing and require current hash-bound approval with zero blockers; offline-only plans remain blocked. One global active/uncertain call, shared platform $10 monthly ceiling. POST executes ONCE, never retries. Unknown results remain quarantined; known IDs are polled. Terminal results retain reservations until verified all-provider billing settlement. No automatic follow-up calls. This file has not been imported or provider-tested; credential/voice/route configuration UNVERIFIED.'}}];
 nodes.find(n=>n.id==='store').parameters.query='{{ ('+storeSql.toString()+')($json) }}';
 nodes.find(n=>n.id==='note').parameters.content+='\n\n2026-10-28 follow-up extension (local, inactive): requires migrations 037–044. The schedule may select later explicitly approved call steps, after confirmed previous completion, approved delay/outcomes and any confirmed callback time. No extra retry or call is invented. Provider DNC results are durably synchronized through outreach_call_ingest. The earlier first-step-only note above is retained as history. Backend tools and Calendar credentials are not connected yet.';
 const connections={};
 for(const [from,to] of [['Schedule Trigger','Operator binding'],['Operator binding','Load calling work'],['Load calling work','Work authorized'],['Work authorized','Retell request'],['Retell request','Validate provider receipt'],['Validate provider receipt','Store calling result']])connections[from]={main:[[{node:to,type:'main',index:0}]]};
 connections['Work authorized'].main.push([]);
 return {name:poll?'Calling result poller':'Approved Retell call executor',active:false,nodes,connections,settings:{executionOrder:'v1',timezone:'Asia/Karachi',saveDataSuccessExecution:'none',saveDataErrorExecution:'none'}};
}
if(require.main===module)for(const [poll,file] of [[false,'07g_retell_call_executor.json'],[true,'09d_retell_result_poller.json']])fs.writeFileSync(path.join(root,'workflows',file),JSON.stringify(build(poll),null,2)+'\n');
module.exports={build};
