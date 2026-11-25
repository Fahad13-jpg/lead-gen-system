'use strict';
const assert=require('node:assert/strict');
function build({org_id,connection_id,credential_ref,postgres_ref}){
 assert(Number.isSafeInteger(org_id)&&org_id>0&&/^[A-Za-z0-9_-]{1,120}$/.test(connection_id)&&[credential_ref,postgres_ref].every(v=>/^[A-Za-z0-9_-]{1,36}$/.test(v)),'INVALID_CHECK_BINDING');
 return{id:'managedGmailcheck',name:'Managed Gmail - account check',active:false,nodes:[
  {id:'manual',name:'Manual Account Check',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
  {id:'schedule',name:'Check Pending Gmail Every Five Minutes',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,160],parameters:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
  {id:'check',name:'Check Gmail Connection',type:'CUSTOM.managedGmailCheck',typeVersion:1,position:[320,80],retryOnFail:false,parameters:{binding:JSON.stringify({org_id,connection_id})},credentials:{postgres:{id:postgres_ref,name:'Lead Database'},gmailOAuth2:{id:credential_ref,name:'Managed customer Gmail'}}},
  {id:'note',name:'Check only - no outreach',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-240],parameters:{width:650,height:200,content:'Account check only. No email sending or message-content reads. Five-minute schedule processes pending_check only; ready/disabled/disconnected accounts are skipped. Native n8n OAuth handles token refresh. Granted send/read scopes and canonical mailbox must match. A session advisory lock prevents overlapping checks and saved version fences concurrent changes. Uncertain provider failures remain pending for the next schedule. Reconnection/expiry is not campaign approval. Bind this workflow to exactly one organization/connection/credential.'}}
 ],connections:{'Manual Account Check':{main:[[{node:'Check Gmail Connection',type:'main',index:0}]]},'Check Pending Gmail Every Five Minutes':{main:[[{node:'Check Gmail Connection',type:'main',index:0}]]}},settings:{executionOrder:'v1',saveDataErrorExecution:'none',saveDataSuccessExecution:'none',saveManualExecutions:false,executionTimeout:90}};
}
module.exports={build};
