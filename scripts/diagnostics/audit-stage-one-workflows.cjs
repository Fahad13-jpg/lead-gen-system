'use strict';
const fs=require('node:fs');
const files=['01_connect_apify.json','02_main_orchestrator.json','03_google_maps_scraper.json','03a_yellow_pages_scraper.json','03b_email_scraper.json','04_data_cleaning.json','05_email_validation(Batch).json','06A_basic_enrichment.json'];
function inspect(file,workflow){
 const issues=[],exceptions=[],names=new Set(workflow.nodes.map(n=>n.name));
 for(const n of workflow.nodes){
  if(n.type.endsWith('.code')&&!['runOnceForAllItems','runOnceForEachItem'].includes(n.parameters.mode))issues.push({node:n.name,code:'CODE_MODE_MISSING'});
  if(n.type.endsWith('.postgres')&&/\$[0-9]+/.test(n.parameters.query||''))exceptions.push({node:n.name,code:'APPROVED_PARAMETER_BINDING'});
  if(n.type.endsWith('.httpRequest')&&/api\.apify\.com/.test(n.parameters.url||'')){
   const method=n.parameters.method||'GET';
   if(method==='POST'&&/\/runs/.test(n.parameters.url)&&!n.retryOnFail)exceptions.push({node:n.name,code:'APPROVED_SINGLE_PAID_START'});
   if(method==='GET'&&(!n.parameters.options?.response?.response?.neverError||!n.retryOnFail||n.maxTries!==3||n.waitBetweenTries!==3000))issues.push({node:n.name,code:'READ_HTTP_POLICY_REVIEW',neverError:!!n.parameters.options?.response?.response?.neverError,retryOnFail:!!n.retryOnFail,maxTries:n.maxTries||null,waitBetweenTries:n.waitBetweenTries||null});
  }
  if(n.type.endsWith('.postgres')&&(/FROM (?:contact_claim|enrichment_claim|cleaning_claim|gathering_dispatch_v3)\(/.test(n.parameters.query||'')||/UPDATE[\s\S]+RETURNING/.test(n.parameters.query||''))&&!n.alwaysOutputData)issues.push({node:n.name,code:'ZERO_ROW_HANDLING_REVIEW'});
 }
 for(const [name,outputs] of Object.entries(workflow.connections||{})){if(!names.has(name))issues.push({node:name,code:'MISSING_CONNECTION_SOURCE'});for(const lists of Object.values(outputs))for(const list of lists)for(const edge of list)if(!names.has(edge.node))issues.push({node:edge.node,code:'MISSING_CONNECTION_TARGET'});}
 if(!workflow.nodes.some(n=>n.type.endsWith('.errorTrigger')))issues.push({code:'ERROR_COVERAGE_REVIEW',detail:'No Error Trigger in this export; inspect per-node handlers, SQL lease recovery and error-workflow configuration before adding or replacing a handler.'});
 return{file,issues,approved_exceptions:exceptions,sticky_notes:workflow.nodes.filter(n=>n.type.endsWith('.stickyNote')).length,modified:false};
}
if(require.main===module){const report={checked_at:new Date().toISOString(),scope:'local workflow exports; not a live activation or actor schema audit',files:files.map(file=>inspect(file,JSON.parse(fs.readFileSync('workflows/'+file)))),modified:false,provider_calls:0};fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/stage-one-workflow-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({files:report.files.length,review_items:report.files.reduce((n,f)=>n+f.issues.length,0),missing_modes_or_connections:report.files.flatMap(f=>f.issues.filter(i=>/CODE_MODE|MISSING_CONNECTION/.test(i.code))),modified:false,provider_calls:0}));}
module.exports={inspect};
