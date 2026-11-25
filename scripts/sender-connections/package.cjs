'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function workflows(){
 const credential={postgres:{id:'Scc3yxojKZkvXpOL',name:'Lead Database'}};
 const result=['send','poll','check'].map((operation,i)=>({id:'managedSmtp'+operation,name:'Managed SMTP - '+operation,active:false,nodes:[
 {id:'trigger',name:operation==='check'?'Manual Connection Check':'Scheduled '+operation,type:operation==='check'?'n8n-nodes-base.manualTrigger':'n8n-nodes-base.scheduleTrigger',typeVersion:operation==='check'?1:1.2,position:[0,0],parameters:operation==='check'?{}:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
 {id:'sender',name:'Managed SMTP Sender',type:'CUSTOM.managedSender',typeVersion:1,position:[260,0],retryOnFail:false,parameters:{operation,binding:'{"org_id":1,"connection_id":"configure-me"}',release:'null'},credentials:credential},
 {id:'note',name:'Setup and release gates',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-260],parameters:{width:600,height:210,content:'Inactive setup template. Select organization-owned SMTP + IMAP credentials and the matching registry connection. Check connection without sending. Dispatch additionally needs approved campaign policy, a hash-bound plan, current membership/readiness, and an operator-issued bounded release. No automatic resend on ambiguous SMTP acceptance. Customer login integration is not exposed.'}}
 ],connections:{[operation==='check'?'Manual Connection Check':'Scheduled '+operation]:{main:[[{node:'Managed SMTP Sender',type:'main',index:0}]]}},settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none'}}));
 const check=result[2];check.nodes.push({id:'check-schedule',name:'Check pending sender every minute',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,220],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}});
 check.connections['Check pending sender every minute']={main:[[{node:'Managed SMTP Sender',type:'main',index:0}]]};
 check.nodes.push({id:'automatic-check-note',name:'Automatic recheck limits',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[650,-260],parameters:{width:560,height:240,content:'Check-only schedule. The fixed org/connection and SMTP+IMAP credentials must match the registry. Only pending_check triggers provider access; ready senders stay idle. A session advisory lock prevents overlap. Failed checks become reconnect_required using the existing version-fenced function, so a fresh user recheck request is required. No sending, reply polling, new credentials or paid model calls. Keep inactive until the updated worker is installed and binding reviewed.'}});
 check.settings.saveManualExecutions=false;return result;
}
function build(out){
 const target=path.resolve(out);assert(target.startsWith(path.resolve('.local')+path.sep)&&!fs.existsSync(target),'NEW_LOCAL_DIRECTORY_REQUIRED');fs.mkdirSync(target,{recursive:true});
 const sources=['scripts/sender-connections/worker.cjs'];const seen=new Set();
 function copy(file){file=path.normalize(file);if(seen.has(file))return;seen.add(file);const text=fs.readFileSync(file,'utf8');const dest=path.join(target,'custom','lead-system',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);
  for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){const dependency=path.normalize(path.join(path.dirname(file),m[1]));copy(dependency);}
 }
 sources.forEach(copy);fs.copyFileSync('scripts/sender-connections/n8n/ManagedSender.node.js',path.join(target,'custom','ManagedSender.node.js'));
 const w=workflows();fs.writeFileSync(path.join(target,'workflows.json'),JSON.stringify(w,null,2));
 const manifest={created_at:new Date().toISOString(),active:false,files:[...seen].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),workflow_ids:w.map(x=>x.id),smtp_credentials_configured:false};fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
module.exports={build,workflows};if(require.main===module)console.log(JSON.stringify(build(process.argv[2])));
