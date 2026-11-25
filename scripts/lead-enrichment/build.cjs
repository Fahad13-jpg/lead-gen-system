'use strict';
const fs=require('fs'),crypto=require('crypto'),{enrichmentRuntime}=require('./runtime.cjs');
fs.mkdirSync('.local/enrichment-before',{recursive:true});
for(const [file,title,kind] of [['06A_basic_enrichment.json','6A - Evidence Based Business Enrichment','basic'],['06B_ai_deep_research.json','6B - Evidence Based Research and LinkedIn','research']]){
 const path='workflows/'+file,old=JSON.parse(fs.readFileSync(path));if(!fs.existsSync('.local/enrichment-before/'+file))fs.copyFileSync(path,'.local/enrichment-before/'+file);
 const credentials=old.nodes.find(n=>n.type.endsWith('.postgres')).credentials,nodes=[],connections={};
 function add(name,type,parameters,extra={}){nodes.push({id:crypto.createHash('sha256').update(kind+name).digest('hex').slice(0,32),name,type:'n8n-nodes-base.'+type,typeVersion:({postgres:2.6,code:2,scheduleTrigger:1.2,webhook:2.1,respondToWebhook:1.4})[type]||1,position:[nodes.length*220,0],parameters,...extra});}
 function edge(a,b){connections[a]={main:[[{node:b,type:'main',index:0}]]};}
 function pg(name,query,params){add(name,'postgres',{operation:'executeQuery',query,options:{queryReplacement:params,queryBatching:'independently'}},{credentials});}
 add('Every Five Minutes','scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:5}]}});add('Manual Test','manualTrigger',{});
 pg('Claim Enrichment Tasks',"SELECT value AS task FROM enrichment_claim('"+kind+"',2) value",'={{ [] }}');
 add('Validate Lease','code',{mode:'runOnceForAllItems',jsCode:"return $input.all().map((item,index)=>{const t=item.json.task;if(!/^\\d+$/.test(String(t.id))||!/^[a-f0-9]{32}$/.test(t.lease))throw Error('Invalid task lease');return {json:t,pairedItem:{item:index}};});"});
 add('Run Enrichment Worker','executeCommand',{executeOnce:false,command:"={{ 'node /home/node/.n8n/enrichment-stage/worker.cjs ' + $json.id + ' ' + $json.lease }}"},{notesInFlow:true,notes:kind==='basic'?'Observed website facts and existing cleaned data. Up to three pages; no AI guesses. Database leases and fingerprints protect ownership and stale results.':'Evidence-based summary, campaign fit, identity checks and LinkedIn posts. Optional Groq analysis uses collected sources only; disabled by default. AI hypotheses require review and cannot authorize sending. LinkedIn collection uses separate budget controls.'});
 add('Validate Worker Result','code',{mode:'runOnceForEachItem',jsCode:"const r=JSON.parse($json.stdout),t=$('Validate Lease').item.json;if(String(r.id)!==String(t.id)||r.lease!==t.lease)throw Error('Result identity mismatch');return r;"});
 pg('Save Enrichment','SELECT enrichment_finish($1::jsonb) AS result','={{ [JSON.stringify($json)] }}');
 for(const [a,b] of [['Every Five Minutes','Claim Enrichment Tasks'],['Manual Test','Claim Enrichment Tasks'],['Claim Enrichment Tasks','Validate Lease'],['Validate Lease','Run Enrichment Worker'],['Run Enrichment Worker','Validate Worker Result'],['Validate Worker Result','Save Enrichment']])edge(a,b);
 if(kind==='research'){add('Advance LinkedIn Collection','executeCommand',{executeOnce:true,command:'node /home/node/.n8n/enrichment-stage/linkedin.cjs'},{notesInFlow:true,notes:'Apify company lookup, role-filtered employee lookup and five recent posts. Global and organization opt-in, funded wallet or BYOK, shared account budget, $0.05 per run reservation, saved run IDs; ambiguous starts require review.'});edge('Every Five Minutes','Advance LinkedIn Collection');edge('Advance LinkedIn Collection','Claim Enrichment Tasks');}
 if(kind==='research')for(const type of ['report','linkedin','campaign']){
  const start=type+' Endpoint',check=type+' Validate',save=type+' Database',response=type+' Response';
  add(start,'webhook',{httpMethod:type==='report'?'GET':'POST',path:'enrichment-'+type,authentication:'headerAuth',responseMode:'responseNode',options:{}},{credentials:{httpHeaderAuth:{id:'leadGatheringAuth',name:'Lead Gathering API'}},webhookId:old.nodes.find(n=>n.name===start)?.webhookId||crypto.randomUUID()});
  const js=type==='report'?"const q=$input.first().json.query||{};const id=v=>/^[1-9]\\d*$/.test(String(v))&&Number.isSafeInteger(Number(v))?Number(v):null;return {org_id:id(q.org_id),lead_id:id(q.lead_id)};":`const rt=(${enrichmentRuntime.toString()})();try{return {value:rt.${type==='linkedin'?'normalizeLinkedIn':'normalizeCampaign'}($input.first().json.body)}}catch{return {value:null}}`;
  add(check,'code',{mode:'runOnceForAllItems',jsCode:js});
  if(type==='report')pg(save,"SELECT CASE WHEN $1::integer IS NULL OR $2::integer IS NULL THEN jsonb_build_object('error','INVALID_REQUEST') ELSE coalesce(enrichment_report($1,$2),jsonb_build_object('error','NOT_FOUND')) END AS result",'={{ [$json.org_id,$json.lead_id] }}');
  else pg(save,"SELECT CASE WHEN $1::jsonb IS NULL THEN jsonb_build_object('error','INVALID_REQUEST') ELSE enrichment_submit($1::jsonb,'"+type+"') END AS result",'={{ [$json.value ? JSON.stringify($json.value) : null] }}');
  add(response,'respondToWebhook',{respondWith:'json',responseBody:'={{ $json.result }}',options:{responseCode:"={{ $json.result.error==='INVALID_REQUEST'?400:$json.result.error?404:200 }}"}});edge(start,check);edge(check,save);edge(save,response);
 }
 if(kind==='research')require('./native-research.cjs').install(nodes,connections,add,pg,edge);
 require('../workflow-queue-guards.cjs').install(nodes);
 fs.writeFileSync(path,JSON.stringify({name:title,nodes,connections,pinData:{},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},meta:old.meta},null,2)+'\n');
}
console.log('Built 06A and 06B with parameterized queries, leased batches, evidence intake and reporting.');
