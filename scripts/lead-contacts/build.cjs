'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
fs.mkdirSync('.local/contacts-before',{recursive:true});
for(const [file,title,kind] of [['03b_email_scraper.json','3B - Contact Discovery (Source First)','discovery'],['05_email_validation(Batch).json','5 - Email Validation (Batch)','verification']]){
 if(process.argv.includes('--discovery-only')&&kind!=='discovery')continue;
 const path='workflows/'+file,old=JSON.parse(fs.readFileSync(path));if(!fs.existsSync('.local/contacts-before/'+file))fs.copyFileSync(path,'.local/contacts-before/'+file);
 const credentials=old.nodes.find(n=>n.type.endsWith('.postgres')).credentials;const nodes=[],connections={};
 function add(name,type,parameters,extra={}){nodes.push({name,type:'n8n-nodes-base.'+type,typeVersion:({postgres:2.6,code:2,scheduleTrigger:1.2,webhook:2.1,respondToWebhook:1.4})[type]||1,id:crypto.createHash('sha256').update(kind+name).digest('hex').slice(0,32),position:[nodes.length*240,0],parameters,...extra});}
 function edge(a,b){connections[a]={main:[[{node:b,type:'main',index:0}]]};}
 function pg(name,query,params){add(name,'postgres',{operation:'executeQuery',query,options:{queryReplacement:params,queryBatching:'independently'}},{credentials});}
 add('Every Minute','scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:1}]}});add('Manual Test','manualTrigger',{});
 pg('Claim Tasks',"SELECT value AS task FROM contact_claim('"+kind+"',"+(kind==='discovery'?3:1)+") value",'={{ [] }}');
 add('Validate Worker Arguments','code',{mode:'runOnceForAllItems',jsCode:"return $input.all().map((item,index)=>{const t=item.json.task;if(!/^\\d+$/.test(String(t.id))||!/^[a-f0-9]{32}$/.test(t.lease))throw Error('Invalid task lease');return {json:t,pairedItem:{item:index}};});"});
 add('Run Contact Worker','executeCommand',{executeOnce:false,command:"={{ 'node /home/node/.n8n/contact-stage/worker.cjs ' + $json.id + ' ' + $json.lease }}"});
 if(kind==='discovery'){nodes.at(-1).notes='Qualify business contacts, recover saved records, reuse scoped caches, then crawl if needed. Weak/unrelated emails do not stop discovery. Queue a known Facebook page for workflow 03c when unresolved. Paid lookups are opt-in; evidence and source snapshots protect identity. No outreach.';nodes.at(-1).notesInFlow=true;}
 add('Parse Result','code',{mode:'runOnceForEachItem',jsCode:"const r=JSON.parse($json.stdout);const t=$('Validate Worker Arguments').item.json;if(String(r.id)!==String(t.id)||r.lease!==t.lease)throw Error('Result identity mismatch');return r;"});
 pg('Save Outcome','SELECT contact_finish($1::jsonb) AS result','={{ [JSON.stringify($json)] }}');
 edge('Every Minute','Claim Tasks');edge('Manual Test','Claim Tasks');edge('Claim Tasks','Validate Worker Arguments');edge('Validate Worker Arguments','Run Contact Worker');edge('Run Contact Worker','Parse Result');edge('Parse Result','Save Outcome');
 if(kind==='discovery'){
  add('Contact Status','webhook',{httpMethod:'GET',path:'contact-status',authentication:'headerAuth',responseMode:'responseNode',options:{}},{credentials:{httpHeaderAuth:{id:'leadGatheringAuth',name:'Lead Gathering API'}},webhookId:old.nodes.find(n=>n.name==='Contact Status')?.webhookId||crypto.randomUUID()});
  add('Validate Status','code',{mode:'runOnceForAllItems',jsCode:"const q=$input.first().json.query||{};return {org_id:/^[1-9]\\d*$/.test(String(q.org_id))&&Number.isSafeInteger(Number(q.org_id))?Number(q.org_id):null};"});
  pg('Read Contact Status',"SELECT CASE WHEN $1::integer IS NULL THEN jsonb_build_object('error','INVALID_REQUEST') WHEN NOT EXISTS(SELECT 1 FROM organizations WHERE id=$1) THEN jsonb_build_object('error','NOT_FOUND') ELSE contact_report($1) END AS result",'={{ [$json.org_id] }}');
  add('Status Response','respondToWebhook',{respondWith:'json',responseBody:'={{ $json.result }}',options:{responseCode:"={{ $json.result.error==='INVALID_REQUEST'?400:$json.result.error?404:200 }}"}});
  edge('Contact Status','Validate Status');edge('Validate Status','Read Contact Status');edge('Read Contact Status','Status Response');
  add('Lead Contact Evidence','webhook',{httpMethod:'GET',path:'contact-lead',authentication:'headerAuth',responseMode:'responseNode',options:{}},{credentials:{httpHeaderAuth:{id:'leadGatheringAuth',name:'Lead Gathering API'}},webhookId:old.nodes.find(n=>n.name==='Lead Contact Evidence')?.webhookId||crypto.randomUUID()});
  add('Validate Lead Evidence','code',{mode:'runOnceForAllItems',jsCode:"const q=$input.first().json.query||{};const valid=v=>/^[1-9]\\d*$/.test(String(v))&&Number.isSafeInteger(Number(v));return {org_id:valid(q.org_id)?Number(q.org_id):null,lead_id:valid(q.lead_id)?Number(q.lead_id):null};"});
  pg('Read Lead Evidence',"SELECT CASE WHEN $1::integer IS NULL OR $2::integer IS NULL THEN jsonb_build_object('error','INVALID_REQUEST') ELSE coalesce(contact_lead_report($1,$2),jsonb_build_object('error','NOT_FOUND')) END AS result",'={{ [$json.org_id,$json.lead_id] }}');
  add('Lead Evidence Response','respondToWebhook',{respondWith:'json',responseBody:'={{ $json.result }}',options:{responseCode:"={{ $json.result.error==='INVALID_REQUEST'?400:$json.result.error?404:200 }}"}});
  edge('Lead Contact Evidence','Validate Lead Evidence');edge('Validate Lead Evidence','Read Lead Evidence');edge('Read Lead Evidence','Lead Evidence Response');
 }
 require('../workflow-queue-guards.cjs').install(nodes);
 fs.writeFileSync(path,JSON.stringify({name:title,nodes,connections,pinData:{},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},meta:old.meta},null,2)+'\n');
}
// The downstream selector must consume the verification decision, not just a nonempty email.
const social={name:'3C - Facebook Contact Discovery (Budgeted)',nodes:[
 {name:'Every Minute',id:'social-timer',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}},
 {name:'Manual Test',id:'social-manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,200],parameters:{}},
 {name:'Advance Facebook Queue',id:'social-worker',type:'n8n-nodes-base.executeCommand',typeVersion:1,position:[250,0],parameters:{executeOnce:true,command:'node /home/node/.n8n/contact-stage/social-worker.cjs'},notesInFlow:true,notes:'Reuses known public-page results; paid starts require global and organization opt-in, verified account binding, budget reservation and platform wallet funding. Resumes saved Apify runs. No Abstract calls or outreach.'}
 ],connections:{'Every Minute':{main:[[{node:'Advance Facebook Queue',type:'main',index:0}]]},'Manual Test':{main:[[{node:'Advance Facebook Queue',type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false}};
fs.writeFileSync('workflows/03c_facebook_contact_discovery.json',JSON.stringify(social,null,2)+'\n');
if(process.argv.includes('--discovery-only')){console.log('Built contact discovery and budgeted Facebook workflows.');process.exit(0);}
const outpath='workflows/07a_email_outreach_executor.json';const outreach=JSON.parse(fs.readFileSync(outpath));
outreach.name ||= '7A - Email Outreach Executor';
if(!fs.existsSync('.local/contacts-before/07a_email_outreach_executor.json'))fs.copyFileSync(outpath,'.local/contacts-before/07a_email_outreach_executor.json');
const selector=outreach.nodes.find(n=>n.name==='Get Email-Ready Leads');
if(!selector.parameters.query.includes('lead_contacts'))selector.parameters.query=selector.parameters.query.replace('AND cl.email IS NOT NULL',`AND cl.email IS NOT NULL
AND cl.org_id IS NOT NULL AND cl.email_valid=TRUE
AND EXISTS (SELECT 1 FROM lead_contacts lc JOIN cleaning_links l ON l.cleaned_id=lc.lead_id AND l.org_id=lc.org_id
 WHERE lc.lead_id=cl.id AND lc.org_id=cl.org_id AND lc.email=lower(trim(cl.email)) AND lc.status='verified'
 AND lc.expires_at>now() AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id))`);
fs.writeFileSync(outpath,JSON.stringify(outreach,null,2)+'\n');
console.log('Built discovery, verification and the inactive outreach eligibility guard.');
