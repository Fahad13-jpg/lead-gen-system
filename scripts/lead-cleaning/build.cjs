'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {normalize}=require('./runtime.cjs');
const path='workflows/04_data_cleaning.json';
const old=JSON.parse(fs.readFileSync(path));
fs.mkdirSync('.local/cleaning-before',{recursive:true});
if(!fs.existsSync('.local/cleaning-before/04_data_cleaning.json'))fs.copyFileSync(path,'.local/cleaning-before/04_data_cleaning.json');
const credentials=old.nodes.find(n=>n.type.endsWith('.postgres')).credentials;
const nodes=[],connections={};
const auth={httpHeaderAuth:{id:'leadGatheringAuth',name:'Lead Gathering API'}};
function add(name,type,parameters,extra={}){nodes.push({name,type:'n8n-nodes-base.'+type,typeVersion:({postgres:2.6,code:2,webhook:2.1,respondToWebhook:1.4,scheduleTrigger:1.2})[type]||1,id:crypto.createHash('sha256').update('cleaning:'+name).digest('hex').slice(0,32),position:[nodes.length*220,0],parameters,...extra});}
function edge(a,b){connections[a]={main:[[{node:b,type:'main',index:0}]]};}
function pg(name,query,params,extra={}){add(name,'postgres',{operation:'executeQuery',query,options:{queryReplacement:params,queryBatching:'independently'}},{credentials,...extra});}
add('Every Minute','scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:1}]}});
add('Manual Test','manualTrigger',{});
pg('Claim Cleaning Batch','SELECT value AS lead FROM cleaning_claim($1,50) value','={{ [String($execution.id)] }}');
add('Normalize Leads','code',{mode:'runOnceForAllItems',jsCode:`const normalize=${normalize.toString()};return $input.all().map((item,index)=>({json:normalize(item.json.lead),pairedItem:{item:index}}));`});
pg('Save Cleaning Outcome','SELECT cleaning_finish($1::jsonb) AS result','={{ [JSON.stringify($json)] }}',{retryOnFail:true,maxTries:3,waitBetweenTries:1000});
edge('Every Minute','Claim Cleaning Batch');edge('Manual Test','Claim Cleaning Batch');edge('Claim Cleaning Batch','Normalize Leads');edge('Normalize Leads','Save Cleaning Outcome');
for(const kind of ['status','preview']){
 add(kind+' Webhook','webhook',{httpMethod:'GET',path:'cleaning-'+kind,authentication:'headerAuth',responseMode:'responseNode',options:{}},{credentials:auth,webhookId:crypto.randomUUID()});
 add(kind+' Input','code',{mode:'runOnceForAllItems',jsCode:`const q=$input.first().json.query||{};const id=v=>/^[1-9]\\d*$/.test(String(v))&&Number.isSafeInteger(Number(v))?Number(v):null;return {org_id:id(q.org_id),staging_id:id(q.staging_id),job_id:q.job_id===undefined?null:id(q.job_id),invalid:!id(q.org_id)||(q.job_id!==undefined&&!id(q.job_id))${kind==='preview'?'||!id(q.staging_id)':''}};`});
 if(kind==='status'){
  pg('Read Status',"SELECT CASE WHEN $3::boolean THEN jsonb_build_object('error','INVALID_REQUEST') WHEN NOT EXISTS(SELECT 1 FROM organizations WHERE id=$1) THEN jsonb_build_object('error','NOT_FOUND') ELSE cleaning_report($1,$2) END AS result",'={{ [$json.org_id,$json.job_id,$json.invalid] }}');
  edge(kind+' Input','Read Status');edge('Read Status',kind+' Response');
 }else{
  pg('Read Preview Lead',"SELECT CASE WHEN $3::boolean THEN NULL ELSE (SELECT to_jsonb(s) FROM staging_leads s WHERE s.id=$2 AND s.org_id=$1) END AS lead,$3::boolean AS invalid",'={{ [$json.org_id,$json.staging_id,$json.invalid] }}');
  add('Preview Normalization','code',{mode:'runOnceForAllItems',jsCode:`const normalize=${normalize.toString()};const row=$input.first().json;if(row.invalid)return {result:{error:'INVALID_REQUEST'}};if(!row.lead)return {result:{error:'NOT_FOUND'}};const p=normalize(row.lead);delete p.lease_token;return {result:{preview:true,proposal:p}};`});
  edge(kind+' Input','Read Preview Lead');edge('Read Preview Lead','Preview Normalization');edge('Preview Normalization',kind+' Response');
 }
 add(kind+' Response','respondToWebhook',{respondWith:'json',responseBody:'={{ $json.result }}',options:{responseCode:"={{ $json.result.error === 'INVALID_REQUEST' ? 400 : $json.result.error ? 404 : 200 }}"}});
 edge(kind+' Webhook',kind+' Input');
}
require('../workflow-queue-guards.cjs').install(nodes);
fs.writeFileSync(path,JSON.stringify({name:'4 - Data Cleaning',nodes,connections,pinData:{},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},meta:old.meta},null,2)+'\n');
console.log('Built cleaning workflow: leased batches, atomic outcomes, authenticated status and preview.');
