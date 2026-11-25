'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {strategyRuntime}=require('./runtime.cjs');
const path='workflows/06C_outreach_strategy_generator.json';
const current=fs.readFileSync(path,'utf8');
const old=JSON.parse(current.trim()?current:fs.readFileSync('.local/strategy-before/06C.json','utf8'));
fs.mkdirSync('.local/strategy-before',{recursive:true});if(!fs.existsSync('.local/strategy-before/06C.json'))fs.copyFileSync(path,'.local/strategy-before/06C.json');
const credentials=old.nodes.find(n=>n.type.endsWith('.postgres')).credentials;
const nodes=old.nodes.filter(n=>n.type.endsWith('.stickyNote')&&n.name!=='Planner Contract'),connections={};
function add(name,type,parameters,extra={}){nodes.push({id:crypto.createHash('sha256').update('strategy:'+name).digest('hex').slice(0,32),name,type:'n8n-nodes-base.'+type,typeVersion:({postgres:2.6,code:2,httpRequest:4.2,if:2.2,webhook:2.1,respondToWebhook:1.4})[type]||1,position:[nodes.length%6*260,Math.floor(nodes.length/6)*240],parameters,...extra});}
function edge(a,b){connections[a]={main:[[{node:b,type:'main',index:0}]]};}
function code(name,js,mode='runOnceForEachItem'){add(name,'code',{mode,jsCode:js});}
function pg(name,query){add(name,'postgres',{operation:'executeQuery',query,options:{queryBatching:'independently'}},{credentials,alwaysOutputData:true});}
const jsonSql="'{{ JSON.stringify($json).replace(/'/g, \"''\") }}'::jsonb";
const runtime='const rt=('+strategyRuntime.toString()+')();';
add('Every Minute','scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:1}]}});add('Manual Planner Test','manualTrigger',{});
pg('Claim Strategy Jobs',"SELECT coalesce(jsonb_agg(value),'[]'::jsonb) AS tasks FROM strategy_claim('{{ String($execution.id).replace(/'/g, \"''\") }}',2) value");edge('Every Minute','Claim Strategy Jobs');edge('Manual Planner Test','Claim Strategy Jobs');
code('Expand Claimed Jobs',"return $input.all().flatMap((item,index)=>(item.json.tasks||[]).map(task=>({json:task,pairedItem:{item:index}})));",'runOnceForAllItems');edge('Claim Strategy Jobs','Expand Claimed Jobs');
code('Prepare Strategy',runtime+"const p=rt.prepare($json.input);return {...$json,...p,wants_ai:p.wants_ai&&!!$env.GROQ_API_KEY};");edge('Expand Claimed Jobs','Prepare Strategy');
pg('Reserve Strategy AI',"SELECT strategy_ai_gate("+jsonSql+") AS gate");edge('Prepare Strategy','Reserve Strategy AI');
add('AI Allowed?','if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:'allowed',leftValue:'={{ $json.gate.allowed }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}});edge('Reserve Strategy AI','AI Allowed?');
add('Compose With Groq','httpRequest',{method:'POST',url:'https://api.groq.com/openai/v1/chat/completions',sendHeaders:true,headerParameters:{parameters:[{name:'Authorization',value:"={{ 'Bearer '+$env.GROQ_API_KEY }}"}]},sendBody:true,specifyBody:'json',jsonBody:"={{ $('Prepare Strategy').item.json.request }}",options:{timeout:45000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}},{retryOnFail:false,onError:'continueRegularOutput'});
connections['AI Allowed?']={main:[[{node:'Compose With Groq',type:'main',index:0}],[{node:'Validate and Assemble Draft',type:'main',index:0}]]};edge('Compose With Groq','Validate and Assemble Draft');
code('Validate and Assemble Draft',runtime+"const p=$('Prepare Strategy').item.json;const plan=rt.compose(p,$json);const usage=Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].filter(k=>Number.isSafeInteger($json.body?.usage?.[k])&&$json.body.usage[k]>=0).map(k=>[k,$json.body.usage[k]]));return {id:p.id,org_id:p.org_id,lease:p.lease,plan,ai_status:plan.generation.ai_status,usage};");
pg('Save Versioned Strategy','SELECT strategy_finish('+jsonSql+') AS result');edge('Validate and Assemble Draft','Save Versioned Strategy');
for(const [kind,fn] of [['campaign','strategy_campaign_save'],['request','strategy_enqueue'],['batch','strategy_enqueue_batch'],['approval','strategy_approval'],['report','strategy_report'],['preview','strategy_context']]){
 const hook=kind+' Endpoint',validate=kind+' Validate',database=kind+' Database',response=kind+' Response';
 add(hook,'webhook',{httpMethod:kind==='report'?'GET':'POST',path:'strategy-'+kind,authentication:'headerAuth',responseMode:'responseNode',options:{}},{credentials:{httpHeaderAuth:{id:'leadGatheringAuth',name:'Lead Gathering API'}},webhookId:crypto.createHash('sha256').update(hook).digest('hex').slice(0,32)});
 const validation=kind==='campaign'?'return rt.campaign(p);':kind==='batch'?"if(!rt.id(p.campaign_id)||!Array.isArray(p.lead_ids)||!p.lead_ids.length||p.lead_ids.length>100||p.lead_ids.some(v=>!rt.id(v)))throw Error('INVALID_BATCH');return {...p,org_id:rt.id(p.org_id),campaign_id:rt.id(p.campaign_id),lead_ids:[...new Set(p.lead_ids.map(rt.id))]};":kind==='approval'?"if(!rt.id(p.plan_id)||!['approve','revoke'].includes(p.action)||typeof p.actor!=='string'||!p.actor.trim()||typeof p.content_hash!=='string'||!/^[a-f0-9]{32}$/.test(p.content_hash))throw Error('INVALID_APPROVAL');return {...p,org_id:rt.id(p.org_id),plan_id:rt.id(p.plan_id)};":kind==='report'?"if(!rt.id(p.job_id))throw Error('INVALID_JOB');return {org_id:rt.id(p.org_id),job_id:rt.id(p.job_id)};":"if(!rt.id(p.campaign_id)||!rt.id(p.lead_id))throw Error('INVALID_IDS');return {...p,org_id:rt.id(p.org_id),campaign_id:rt.id(p.campaign_id),lead_id:rt.id(p.lead_id)};";
 code(validate,runtime+"try{const p=$json."+(kind==='report'?'query':'body')+"||{};if(!rt.id(p.org_id))throw Error('ORG_REQUIRED');"+validation+"}catch(e){return {error:e.message,http_status:400};}");edge(hook,validate);
 let q;
 if(kind==='report')q="strategy_report({{ Number.isSafeInteger($json.org_id)?$json.org_id:0 }},{{ Number.isSafeInteger($json.job_id)?$json.job_id:0 }})";
 else if(kind==='preview')q="strategy_context({{ Number.isSafeInteger($json.org_id)?$json.org_id:0 }},{{ Number.isSafeInteger($json.campaign_id)?$json.campaign_id:0 }},{{ Number.isSafeInteger($json.lead_id)?$json.lead_id:0 }})";
 else q=fn+'('+jsonSql+')';
 pg(database,"SELECT CASE WHEN {{ $json.error ? 'true' : 'false' }} THEN "+jsonSql+" ELSE coalesce("+q+",'{\"error\":\"NOT_FOUND\",\"http_status\":404}'::jsonb) END AS result");edge(validate,database);
 if(kind==='preview'){code('Build Preview',runtime+"if($json.result.error)return $json;const p=rt.prepare($json.result);return {result:{preview:true,plan:rt.compose(p,{gate:{reason:'preview_no_provider_call'}}),http_status:200}};");edge(database,'Build Preview');edge('Build Preview',response);}else edge(database,response);
 add(response,'respondToWebhook',{respondWith:'json',responseBody:'={{ $json.result }}',options:{responseCode:'={{ $json.result.http_status || 200 }}'}});
 // Request is persisted and acknowledged 202; scheduler performs slow generation.
}
add('Error Trigger','errorTrigger',{});
code('Format Error',"const exec=$json;return {execution_id:String(exec.execution?.id||''),message:String(exec.execution?.error?.message||'Strategy execution failed').slice(0,300)};");edge('Error Trigger','Format Error');
pg('Mark Job Failed','SELECT strategy_fail('+jsonSql+') AS result');edge('Format Error','Mark Job Failed');
add('Planner Contract','stickyNote',{content:'## Campaign strategy planner\nReplaces legacy scoring and channel promotion. Campaign brief → queued draft → review → content approval. No legacy outreach flags are set and no messages are sent. Internal header-auth APIs require an authenticated org-binding gateway before Flutter use. AI is disabled by default and may only select approved text/source blocks. Original sticky note retained below as historical documentation.',width:620,height:270});
const w={name:'6C - Campaign Outreach Strategy Planner',nodes,connections,pinData:{},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,errorWorkflow:'27W04lgTGdgFMWUx'}};
const temporary=path+'.tmp';fs.writeFileSync(temporary,JSON.stringify(w,null,2)+'\n');JSON.parse(fs.readFileSync(temporary));fs.renameSync(temporary,path);console.log('Built native campaign planner atomically; preserved '+old.nodes.filter(n=>n.type.endsWith('.stickyNote')&&n.name!=='Planner Contract').length+' original sticky notes.');
