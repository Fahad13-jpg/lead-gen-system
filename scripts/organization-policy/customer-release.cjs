'use strict';
// Offline packaging only: self-contained workflow JSON, one incremental migration, runbook.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const files=['database/migrations/032_customer_content_approval.sql','workflows/06C_outreach_strategy_generator.json','workflows/07a_email_outreach_executor.json','workflows/09_reply_detection.json','documentation/CUSTOMER_EMAIL_RELEASE.md'];
function inspect(root){
 const read=f=>fs.readFileSync(path.join(root,f));
 for(const file of files.filter(f=>f.endsWith('.json'))){
  const w=JSON.parse(read(file));assert(file.includes('06C_') ? w.active===undefined||w.active===false : w.active===false,file+' must not be active');
  for(const n of w.nodes){if(n.type==='n8n-nodes-base.code')assert(['runOnceForEachItem','runOnceForAllItems'].includes(n.parameters.mode));if(n.type==='n8n-nodes-base.postgres')assert.equal(n.alwaysOutputData,true);}
  const node=name=>w.nodes.find(n=>n.name===name);
  if(file.includes('06C_'))assert(node('Prepare Strategy').parameters.jsCode.includes("customerTemplatesEnabled:$env.CUSTOMER_EMAIL_TEMPLATES_ENABLED==='true'"));
  if(file.includes('07a_')){
   assert.deepEqual(new Function(node('Daily limit check').parameters.jsCode)(),[]);
   assert.match(node('Send Email - Gmail').parameters.url,/EMAIL_TRANSPORT_NOT_ENABLED/);
   assert.equal(node('Send Email - Gmail').retryOnFail,false);
   assert.match(node('Prepare Email Content').parameters.jsCode,/emailHelpers.executionDraft/);
   assert.match(node('Get Email-Ready Leads').parameters.query,/AS strategy_context,/);
  }
  if(file.includes('09_'))assert.equal(new Function(node('Bound Mailbox Gate').parameters.jsCode)(),null);
 }
 return {format:'customer_email_release_v1',deployment_authorized:false,sending_authorized:false,
  prerequisites:['Existing migrations through 031 verified against target; this is not a clean install','Runtime roles, n8n crypto/URL access and server environment access checked before activation','Fresh database backup and exact live workflow exports'],
  activation:{strategy_contract:'strategy_v2',customer_flag:'CUSTOMER_EMAIL_TEMPLATES_ENABLED',default:'disabled',effect:'new reviewable customer drafts only; no transport authorization'},
  files:files.map(file=>({path:file,sha256:crypto.createHash('sha256').update(read(file)).digest('hex')}))};
}
function pack(root,target){let m=inspect(root);assert(!fs.existsSync(target),'Bundle already exists');fs.mkdirSync(target,{recursive:true});for(const f of m.files){const out=path.join(target,f.path);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,f.path),out);}
 const planner=path.join(target,files[1]),w=JSON.parse(fs.readFileSync(planner,'utf8'));w.active=false;fs.writeFileSync(planner,JSON.stringify(w,null,2)+'\n');
 m=inspect(target);fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(m,null,2)+'\n');return m;}
function verify(target){const m=JSON.parse(fs.readFileSync(path.join(target,'manifest.json'),'utf8'));assert.deepEqual(m,inspect(target),'Release content changed');return m;}
module.exports={inspect,pack,verify};
if(require.main===module){try{const [action,target]=process.argv.slice(2);assert(['pack','verify'].includes(action)&&target);const absolute=path.resolve(target),rel=path.relative(process.cwd(),absolute);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));const m=action==='pack'?pack(process.cwd(),absolute):verify(absolute);console.log(JSON.stringify({action,files:m.files.length,deployed:false,sent:false}));}catch(e){console.error(e.message);process.exitCode=1;}}
