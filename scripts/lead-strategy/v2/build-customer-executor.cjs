'use strict';
// Narrow local patch only. Never imports, activates or changes sender bindings.
const fs=require('node:fs'),assert=require('node:assert/strict');
const contextColumn="CASE WHEN p.body->>'validation_profile'='customer_email_v1' OR p.body->'generation'->>'source'='customer_supplied' OR p.body->'customer_review'->>'required'='true' THEN strategy_context(p.org_id,p.campaign_id,p.lead_id) ELSE NULL END AS strategy_context,";
function bundle(){
 const modules=[['handoff','scripts/lead-strategy/v2/email-handoff.cjs'],['../../organization-policy/customer-execution.cjs','scripts/organization-policy/customer-execution.cjs'],['./customer-email-template.cjs','scripts/organization-policy/customer-email-template.cjs']];
 return 'const emailHelpers=(()=>{const modules={'+modules.map(([id,file])=>JSON.stringify(id)+':function(module,exports,require){\n'+fs.readFileSync(file,'utf8')+'\n}').join(',')+'};const cache={};function load(id){if(id==="node:crypto")return require("crypto");if(cache[id])return cache[id].exports;if(!modules[id])throw Error("UNKNOWN_CUSTOMER_MODULE");const m={exports:{}};cache[id]=m;modules[id](m,m.exports,load);return m.exports;}return load("handoff");})();\n';
}
function build(){
 const file='workflows/07a_email_outreach_executor.json',w=JSON.parse(fs.readFileSync(file,'utf8')),before=structuredClone(w);
 const query=w.nodes.find(n=>n.name==='Get Email-Ready Leads');
 if(!query.parameters.query.includes('AS strategy_context,')){
  assert(query.parameters.query.includes('p.body,c.email,steps.step,'));
  query.parameters.query=query.parameters.query.replace('p.body,c.email,steps.step,','p.body,c.email,steps.step,\n'+contextColumn);
 }
 const n=w.nodes.find(n=>n.name==='Prepare Email Content');assert.equal(n.parameters.mode,'runOnceForEachItem');
 n.parameters.jsCode=bundle()+"const draft=emailHelpers.executionDraft($json); return {json:{...draft,sender:$json.sender,parent_activity:$json.parent_activity}};";
 const strip=o=>{const copy=structuredClone(o);for(const n of copy.nodes){if(n.name==='Prepare Email Content')delete n.parameters.jsCode;if(n.name==='Get Email-Ready Leads')delete n.parameters.query;}return copy;};assert.deepEqual(strip(w),strip(before));
 fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');console.log('Updated customer context query and content validator only; no deployment.');
}
if(require.main===module)build();module.exports={bundle,contextColumn,build};
