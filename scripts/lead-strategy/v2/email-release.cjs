'use strict';
// Packaging only. No Docker, credentials, provider calls or database access.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const workflows=['workflows/07a_email_outreach_executor.json','workflows/09_reply_detection.json'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function inspect(root){
 const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(f=>/^0(2[1-9]|3[01])_.*\.sql$/.test(f)).sort().map(f=>'database/migrations/'+f);
 assert.deepEqual(migrations.map(f=>Number(path.basename(f).slice(0,3))),Array.from({length:11},(_,i)=>21+i),'Expected each migration 021 through 031 exactly once');
 for(const file of workflows){
  const w=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));assert.equal(w.active,false,file+' must remain inactive');
  const get=name=>w.nodes.find(n=>n.name===name);
  for(const n of w.nodes){
   if(n.type==='n8n-nodes-base.code')assert(['runOnceForEachItem','runOnceForAllItems'].includes(n.parameters.mode),'Explicit Code mode required');
   if(n.type==='n8n-nodes-base.postgres')assert.equal(n.alwaysOutputData,true,'Zero-row preservation required');
  }
  if(file===workflows[0]){
   assert.deepEqual(new Function(get('Daily limit check').parameters.jsCode)(),[],'Sender entry must stay closed');
   assert.match(get('Send Email - Gmail').parameters.url,/throw new Error\('EMAIL_TRANSPORT_NOT_ENABLED'\)/);
   assert.equal(get('Send Email - Gmail').retryOnFail,false);
  }else assert.equal(new Function(get('Bound Mailbox Gate').parameters.jsCode)(),null,'Mailbox entry must stay closed');
 }
 return {format:'email_release_review_v1',deployment_authorized:false,sending_authorized:false,
 baseline:{migration:20,status:'historical_report_only_live_state_must_be_verified'},
 migrations,workflows,files:[...migrations,...workflows].map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))})),
 blockers:['live baseline and runtime roles UNVERIFIED','fresh backup and restore rehearsal required','sender identity and explicit limits required','authenticated Gmail integration UNVERIFIED','deployment and sending require separate review'],
 excluded:['migration 016','06C planner','08 follow-up manager','credentials','customer data','AI trial ledger']};
}
function pack(root,target){
 const manifest=inspect(root);assert(!fs.existsSync(target),'Output already exists; do not overwrite a reviewed bundle');
 fs.mkdirSync(target,{recursive:true});
 for(const f of manifest.files){const out=path.join(target,f.path);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,f.path),out);}
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
function verify(target){
 const manifest=JSON.parse(fs.readFileSync(path.join(target,'manifest.json'),'utf8'));
 assert.deepEqual(manifest,inspect(target),'Bundle bytes, migration order or closed gates changed');return manifest;
}
module.exports={inspect,pack,verify};
if(require.main===module){try{
 const [mode,output]=process.argv.slice(2);assert(['pack','verify'].includes(mode)&&output,'Use pack|verify <workspace-directory>');
 const target=path.resolve(output),rel=path.relative(process.cwd(),target);
 assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'Use a directory inside the workspace');
 const manifest=mode==='pack'?pack(process.cwd(),target):verify(target);
 console.log(JSON.stringify({action:mode,files:manifest.files.length,deploy:false,send:false}));
}catch(e){console.error(e.message);process.exitCode=1;}}
