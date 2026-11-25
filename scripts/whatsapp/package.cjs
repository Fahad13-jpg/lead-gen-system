'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function workflow(){return {name:'WhatsApp - Read-only Sender Check (Inactive)',active:false,nodes:[
 {id:'manual',name:'Manual Check',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
 {id:'check',name:'Check Account and Sender',type:'CUSTOM.managedWhatsAppCheck',typeVersion:1,position:[250,0],retryOnFail:false,parameters:{binding:JSON.stringify({org_id:0,connection_id:'configure-me',credential_ref:'configure-me',phone_number_id:'configure-me',waba_id:'configure-me',api_version:null}),operatorConfirmed:false}},
 {id:'note',name:'Read-only scope',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-260],parameters:{width:750,height:210,content:'LOCAL / INACTIVE. Custom node package must be installed separately. Select an organization-owned WhatsApp API credential and matching operator binding before executing. One GET /WABA-ID/phone_numbers only. No message POST, schedule, SQL, callback registration or sending authorization. Account identity checked is not campaign readiness. This operator-only check does not implement customer Embedded Signup. Installed n8n HTTP option behavior remains UNVERIFIED.'}}
 ],connections:{'Manual Check':{main:[[{node:'Check Account and Sender',type:'main',index:0}]]}},settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false}};}
function dispatchWorkflow(){return {name:'WhatsApp - Managed Dispatch (Inactive Draft)',active:false,nodes:[
 {id:'schedule',name:'One Minute Schedule',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}},
 {id:'dispatch',name:'Managed WhatsApp Executor',type:'CUSTOM.managedWhatsApp',typeVersion:1,position:[250,0],retryOnFail:false,parameters:{dispatchEnabled:false,providerRechecksEnabled:false,binding:JSON.stringify({org_id:0,connection_id:'configure-me',credential_ref:'configure-me',phone_number_id:'configure-me',waba_id:'configure-me',credential_expires_at:null})}},
 {id:'note',name:'Disabled release boundary',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-250],parameters:{width:850,height:230,content:'LOCAL / NOT INSTALLED. Uses existing migration 046 approval/hash/lease/budget gates. Operator binding and dispatch are unset. Requires explicit installation, tested callback, actual consent, reviewed approved template, quote and campaign release before any message. At most one claim attempt per tick, no automatic resend. Production Docker DNS remains unresolved; Windows DNS diagnostic workaround is NOT installed in this executor. Unmatched callback storage still needs a decision. No account-token expiry is assumed.'}}
 ],connections:{'One Minute Schedule':{main:[[{node:'Managed WhatsApp Executor',type:'main',index:0}]]}},settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false}};}
function build(out){const target=path.resolve(out);assert(target.startsWith(path.resolve('.local')+path.sep)&&!fs.existsSync(target),'NEW_LOCAL_DIRECTORY_REQUIRED');
 const files=[],seen=new Set();
 function copy(file){file=path.normalize(file);if(seen.has(file))return;assert(path.resolve(file).startsWith(path.resolve('scripts')+path.sep),'SOURCE_OUTSIDE_SCRIPTS');seen.add(file);files.push(file);const source=fs.readFileSync(file,'utf8'),dest=path.join(target,'custom','lead-system',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,source);for(const m of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))copy(path.join(path.dirname(file),m[1]));}
 ['scripts/whatsapp/n8n-check.cjs','scripts/whatsapp/worker.cjs'].forEach(copy);
 fs.copyFileSync('scripts/whatsapp/n8n/ManagedWhatsAppCheck.node.js',path.join(target,'custom','ManagedWhatsAppCheck.node.js'));
 fs.copyFileSync('scripts/whatsapp/n8n/ManagedWhatsApp.node.js',path.join(target,'custom','ManagedWhatsApp.node.js'));
 fs.writeFileSync(path.join(target,'workflow.json'),JSON.stringify(workflow(),null,2)+'\n');
 fs.writeFileSync(path.join(target,'dispatch-workflow.json'),JSON.stringify(dispatchWorkflow(),null,2)+'\n');
 const manifest={active:false,dispatch_enabled:false,sending_adapter_included:true,credential_configured:false,installed:false,files:files.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
module.exports={build,workflow,dispatchWorkflow};
if(require.main===module)console.log(JSON.stringify(build(process.argv[2])));
